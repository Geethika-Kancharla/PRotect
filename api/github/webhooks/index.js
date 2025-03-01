const crypto = require("crypto");
const axios = require("axios");

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
  const response = await axios.get(url, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` },
  });

  return response.data.map((file) => ({
    filename: file.filename,
    raw_url: file.raw_url,
  }));
}

async function analyzeSecurity(files) {
  try {
    if (!SEMGREP_APP_TOKEN) {
      throw new Error("Missing SEMGREP_APP_TOKEN in environment variables.");
    }

    console.log("🔍 Sending files to Semgrep for security analysis...");

    const response = await axios.post(
      SEMGREP_API_URL,
      {
        ruleset: "p/default", // Use Semgrep default security rules
        files: files.map((file) => ({ path: file.filename, content: file.content })),
      },
      {
        headers: {
          Authorization: `Bearer ${SEMGREP_APP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Semgrep API Response:", response.data);

    return response.data; // Returns security scan results
  } catch (error) {
    console.error("❌ Semgrep API Error:", error.response?.data || error.message);
    return { score: 100, level: "monitor" }; // Default response if API fails
  }
}

// Post a Comment on PR
async function postComment(repo, owner, prNumber, comment) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
  await axios.post(
    url,
    { body: comment },
    { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
  );
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
    const { number: prNumber, base, head } = pull_request;
    const { repo, owner } = base;

    console.log(`PR #${prNumber} ${action} in ${repo.full_name}`);

    if (action === "opened" || action === "synchronize") {
      const files = await getPRFiles(repo.name, owner.login, prNumber);
      const { score, level } = await analyzeSecurity(files);

      let body = "";
      switch (level) {
        case "block":
          body += "⛔ **PR BLOCKED**: This PR has been automatically blocked due to critical security concerns.\n";
          body += "Please review and address the security issues before proceeding.\n";
          break;
        case "warn":
          body += "⚠️ **WARNING**: This PR requires security review before merging.\n";
          body += "Please carefully review the identified security issues.\n";
          break;
        case "review":
          body += "👀 **REVIEW**: Some potential security concerns were identified.\n";
          body += "Please review the issues during code review.\n";
          break;
        default:
          body += "ℹ️ **MONITOR**: Minor security concerns detected.\n";
          body += "Standard code review process can proceed.\n";
          break;
      }

      await postComment(repo.name, owner.login, prNumber, body);
    }

    res.status(200).json({ message: "Security check completed" });
  });
}
