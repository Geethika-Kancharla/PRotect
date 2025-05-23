const crypto = require("crypto");

const APP_ID = process.env.APP_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY.replace(/\\n/g, "\n");
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;


function generateJWT() {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64");
  const payload = Buffer.from(
    JSON.stringify({
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + 600,
      iss: APP_ID,
    })
  ).toString("base64");

  const signature = crypto.createSign("RSA-SHA256").update(`${header}.${payload}`).sign(PRIVATE_KEY, "base64");

  return `${header}.${payload}.${signature}`;
}


async function getInstallationId(owner) {
  const jwt = generateJWT();
  const url = `https://api.github.com/app/installations`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) throw new Error(`Failed to fetch installations: ${response.statusText}`);
  
  const installations = await response.json();
  const installation = installations.find((inst) => inst.account.login === owner);
  
  if (!installation) throw new Error(`No installation found for ${owner}`);
  return installation.id;
}


async function getInstallationToken(owner) {
  const installationId = await getInstallationId(owner);
  const jwt = generateJWT();
  const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) throw new Error(`Failed to get installation token: ${response.statusText}`);
  
  const data = await response.json();
  return data.token;
}


function verifySignature(req, rawBody) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  hmac.update(rawBody);
  const expectedSignature = `sha256=${hmac.digest("hex")}`;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

async function getPRFiles(repo, owner, prNumber, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) throw new Error(`Failed to fetch PR files: ${response.statusText}`);
  
  return await response.json();
}



async function createReviewComment(repo, owner, prNumber, token, commit_id, path, position, body) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`;

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      body,
      commit_id,
      path,
      position
    }),
  });
}


async function analyzeSecurity(files) {
  let totalScore = 100;
  let findings = [];
  let inlineComments = [];

  try {
    const response = await fetch('http://localhost:5000/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: files.map(file => ({
          filename: file.filename,
          content: file.patch || file.content
        }))
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to analyze security: ${response.statusText}`);
    }

    const analysis = await response.json();
    return analysis;
  } catch (error) {
    console.error('Error in security analysis:', error);
    for (const file of files) {
      const response = await fetch(file.raw_url);
      const content = await response.text();
      const lines = content.split('\n');

      for (const [key, { pattern, score, message }] of Object.entries(SECURITY_PATTERNS)) {
        lines.forEach((line, index) => {
          if (pattern.test(line)) {
            totalScore += score;
            findings.push(`🔍 **${file.filename}** - ${message}`);
            
            inlineComments.push({
              path: file.filename,
              position: index + 1,
              body: `⚠️ **Security Issue Detected**: ${message}\n\nProblematic code: \`${line.trim()}\`\n`
            });
          }
        });
      }
    }

    let level = "monitor";
    if (totalScore < 80) level = "review";
    if (totalScore < 40) level = "warn";

    return { score: totalScore, level, findings, inlineComments };
  }
}

async function postComment(repo, owner, prNumber, comment, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: comment }),
  });
}

async function closePR(repo, owner, prNumber, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
  
  await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state: "closed" }),
  });
}

// Block User
// async function blockUser(owner, username, token) {
//   const url = `https://api.github.com/orgs/${owner}/blocks/${username}`;

//   await fetch(url, {
//     method: "PUT",
//     headers: {
//       Authorization: `Bearer ${token}`,
//       "Content-Type": "application/json",
//     },
//   });
// }

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let rawBody = "";
  req.on("data", (chunk) => (rawBody += chunk));
  req.on("end", async () => {
    if (!verifySignature(req, rawBody)) {
      console.error("Signature verification failed!");
      return res.status(401).json({ error: "Invalid signature" });
    }

    const event = req.headers["x-github-event"];
    if (event !== "pull_request") return res.status(200).json({ message: "Non-PR event ignored" });

    const { action, pull_request } = req.body;
    const prNumber = pull_request.number;
    const repo = pull_request.base.repo.name;
    const owner = pull_request.base.repo.owner.login;
    const username = pull_request.user.login;
    const commit_id = pull_request.head.sha;

    console.log(`PR #${prNumber} ${action} in ${owner}/${repo}`);

    if (action === "opened" || action === "synchronize") {
      try {
        const token = await getInstallationToken(owner);
        const files = await getPRFiles(repo, owner, prNumber, token);
        const { score, level, findings, inlineComments } = await analyzeSecurity(files);

        for (const comment of inlineComments) {
          await createReviewComment(
            repo,
            owner,
            prNumber,
            token,
            commit_id,
            comment.path,
            comment.position,
            comment.body
          );
        }

        let body = `## 🔍 Security Analysis  
        **Security Score:** ${score}/100
`;
        if (findings.length) body += findings.join("\n") + "\n\n";

        switch (level) {
          // case "block":
          //   body += "⛔ **PR BLOCKED**: Critical security concerns detected.";
          //   await blockUser(owner, username, token);
          //   await closePR(repo, owner, prNumber, token);
          //   break;
          case "warn":
            body += "⚠️ **WARNING**: Review security issues before merging.";
            await closePR(repo, owner, prNumber, token);
            break;
          case "review":
            body += "👀 **REVIEW**: Security concerns detected, review required.";
            break;
          default:
            body += "ℹ️ **MONITOR**: No major issues detected.";
            break;
        }

        await postComment(repo, owner, prNumber, body, token);
      } catch (error) {
        console.error("❌ Error processing PR:", error.message);
      }
    }

    res.status(200).json({ message: "Security check completed" });
  });
}
