const crypto = require("crypto");

const SECRET = process.env.WEBHOOK_SECRET || "your-secret";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Add your GitHub token in env

async function addComment(repo, owner, issueNumber, comment) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: comment }),
  });
}

function verifySignature(req, rawBody) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(rawBody);
  const expectedSignature = `sha256=${hmac.digest("hex")}`;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
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
      console.error("❌ Signature verification failed!");
      return res.status(401).json({ error: "Invalid signature" });
    }

    console.log(`✅ Received GitHub event: ${req.headers["x-github-event"]}`);

    const event = req.headers["x-github-event"];
    if (event === "pull_request") {
      const action = req.body.action;
      const { number, user } = req.body.pull_request;
      const { owner, name } = req.body.repository;

      if (action === "opened") {
        console.log(`📝 PR #${number} opened by ${user.login}`);
        await addComment(name, owner.login, number, `👋 Hello @${user.login}, thanks for your PR! We'll review it soon.`);
      } else if (action === "closed") {
        console.log(`🚀 PR #${number} closed.`);
        await addComment(name, owner.login, number, `✅ PR #${number} has been closed. Thank you!`);
      }
    }

    return res.status(200).json({ message: "Event received" });
  });
}
