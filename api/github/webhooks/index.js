const crypto = require("crypto");
const fetch = require("node-fetch");

const SECRET = process.env.WEBHOOK_SECRET || "your-secret";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const SECURITY_PATTERNS = { /* Define security patterns here */ };

// Verify Webhook Signature
function verifySignature(req, rawBody) {
  const signature = req.headers["x-hub-signature-256"];
  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(rawBody);
  const expectedSignature = `sha256=${hmac.digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(signature || ""), Buffer.from(expectedSignature));
}

// Fetch PR Files
async function getPRFiles(repo, owner, prNumber) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`;
  const response = await fetch(url, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` },
  });
  return response.ok ? await response.json() : [];
}

// Perform Security Analysis
async function analyzeSecurity(files) {
  let score = 100;
  let findings = [];

  files.forEach((file) => {
    Object.entries(SECURITY_PATTERNS).forEach(([pattern, risk]) => {
      if (file.patch.includes(pattern)) {
        findings.push(`❌ **Issue:** ${risk} in ${file.filename}`);
        score -= 20;
      }
    });
  });

  let level = "monitor";
  if (score < 40) level = "block";
  else if (score < 60) level = "warn";
  else if (score < 80) level = "review";

  return { score, level, findings };
}

// Post Comment on PR
async function postComment(repo, owner, prNumber, comment) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: comment }),
  });
}

// Close PR if score is below 80
async function closePR(repo, owner, prNumber) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state: "closed" }),
  });

  if (!response.ok) {
    console.error("❌ Failed to close PR:", response.statusText);
  }
}

// Block user if score is below 40
async function blockUser(owner, username) {
  const url = `https://api.github.com/orgs/${owner}/blocks/${username}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    console.error("❌ Failed to block user:", response.statusText);
  }
}

// Webhook Handler
export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let rawBody = "";
  req.on("data", (chunk) => {
    rawBody += chunk;
  });

  req.on("end", async () => {
    if (!verifySignature(req, rawBody)) {
      console.error("Signature verification failed!");
      return res.status(401).json({ error: "Invalid signature" });
    }

    const event = req.headers["x-github-event"];
    if (event !== "pull_request") {
      return res.status(200).json({ message: "Non-PR event ignored" });
    }

    const { action, pull_request } = req.body;
    const prNumber = pull_request.number;
    const repo = pull_request.base.repo.name;
    const owner = pull_request.base.repo.owner.login;
    const username = pull_request.user.login;

    console.log(`PR #${prNumber} ${action} in ${owner}/${repo}`);

    if (action === "opened" || action === "synchronize") {
      try {
        const files = await getPRFiles(repo, owner, prNumber);
        console.log("✅ PR Files Retrieved:", files);

        const { score, level, findings } = await analyzeSecurity(files);

        let body = `## 🔍 Security Analysis  \n**Security Score:** ${score}/100  \n`;
        if (findings.length) {
          body += findings.join("\n") + "\n\n";
        }

        switch (level) {
          case "block":
            body += "⛔ **PR BLOCKED**: Critical security concerns detected.";
            await blockUser(owner, username);
            break;
          case "warn":
            body += "⚠️ **WARNING**: Review security issues before merging.";
            break;
          case "review":
            body += "👀 **REVIEW**: Security concerns detected, review required.";
            break;
          default:
            body += "ℹ️ **MONITOR**: No major issues detected.";
            break;
        }

        await postComment(repo, owner, prNumber, body);

        if (score < 80) {
          await closePR(repo, owner, prNumber);
        }

      } catch (error) {
        console.error("❌ Error processing PR:", error.message);
      }
    }

    res.status(200).json({ message: "Security check completed" });
  });
}
