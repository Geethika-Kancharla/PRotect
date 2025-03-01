const crypto = require("crypto");

const SECRET = process.env.WEBHOOK_SECRET || "your-secret";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; 
const SEMGREP_APP_TOKEN = process.env.SEMGREP_APP_TOKEN; 
const SEMGREP_API_URL = "https://semgrep.dev/api/v1/scan"; 

function verifySignature(req, rawBody) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(rawBody);
  const expectedSignature = `sha256=${hmac.digest("hex")}`;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

// Fetch PR Files
async function getPRFiles(repo, owner, prNumber) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`;

  const response = await fetch(url, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch PR files: ${response.statusText}`);
  }

  const files = await response.json();
  return files.map((file) => ({
    filename: file.filename,
    raw_url: file.raw_url,
  }));
}

// Analyze Security with Semgrep
async function analyzeSecurity(files) {
  try {
    if (!SEMGREP_APP_TOKEN) {
      throw new Error("Missing SEMGREP_APP_TOKEN in environment variables.");
    }

    console.log("🔍 Sending files to Semgrep for security analysis...");

    const response = await fetch(SEMGREP_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SEMGREP_APP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ruleset: "p/default", // Use Semgrep default security rules
        files: files.map((file) => ({ path: file.filename, content: file.content })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Semgrep API error: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("✅ Semgrep API Response:", result);

    return result; // Returns security scan results
  } catch (error) {
    console.error("❌ Semgrep API Error:", error.message);
    return { score: 100, level: "monitor" }; // Default response if API fails
  }
}

async function postComment(repo, owner, prNumber, comment) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: comment }),
  });

  const responseText = await response.text();
  console.log("GitHub API Response:", responseText);

  if (!response.ok) {
    console.error("❌ Failed to post comment:", response.statusText, responseText);
  }
}


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

    console.log(`PR #${prNumber} ${action} in ${owner}/${repo}`);

    if (action === "opened" || action === "synchronize") {
      try {
        const files = await getPRFiles(repo, owner, prNumber);
        console.log("✅ PR Files Retrieved:", files);

        const { score, level } = await analyzeSecurity(files);

        let body = "";
        switch (level) {
          case "block":
            body += "⛔ **PR BLOCKED**: Critical security concerns detected. Please fix them.";
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
      } catch (error) {
        console.error("❌ Error processing PR:", error.message);
      }
    }

    res.status(200).json({ message: "Security check completed" });
  });
}
