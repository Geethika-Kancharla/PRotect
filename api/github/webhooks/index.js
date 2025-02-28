import { createNodeMiddleware, createProbot } from "probot";
import crypto from "crypto";

const probot = createProbot({
  appId: process.env.APP_ID,
  privateKey: process.env.PRIVATE_KEY,
  secret: process.env.WEBHOOK_SECRET,
});

const app = (probot) => {
  probot.log.info("✅ Probot app is running!");

  probot.on("pull_request.opened", async (context) => {
    probot.log.info("📣 Received pull_request.opened event");
    const prComment = context.issue({
      body: "🚀 Thanks for opening this PR! We'll review it soon. 👍",
    });
    try {
      await context.octokit.issues.createComment(prComment);
      probot.log.info("✅ Successfully posted PR comment");
    } catch (error) {
      probot.log.error("❌ Error posting PR comment:", error);
    }
  });

  probot.on("pull_request.closed", async (context) => {
    probot.log.info("📣 Received pull_request.closed event");
    if (context.payload.pull_request.merged) {
      const mergedComment = context.issue({
        body: "🎉 This PR has been merged! Thank you for your contribution. 🚀",
      });
      try {
        await context.octokit.issues.createComment(mergedComment);
        probot.log.info("✅ Successfully posted merge comment");
      } catch (error) {
        probot.log.error("❌ Error posting merge comment:", error);
      }
    }
  });
};

function verifySignature(payload, headers, secret) {
  const sha256Signature = headers["x-hub-signature-256"] || headers["X-Hub-Signature-256"];
  const sha1Signature = headers["x-hub-signature"] || headers["X-Hub-Signature"];

  const checkSignature = (algorithm, signature) => {
    if (!signature) return false;
    const hash = crypto.createHmac(algorithm, secret).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature.split("=")[1]), Buffer.from(hash));
  };

  return checkSignature("sha256", sha256Signature) || checkSignature("sha1", sha1Signature);
}


export default async function handler(req, res) {
  console.log("Received webhook request");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawBody = req.body ? JSON.stringify(req.body) : "";
  
  console.log("Raw body length:", rawBody.length);

  if (!verifySignature(rawBody, req.headers, process.env.WEBHOOK_SECRET)) {
    console.error("❌ Invalid webhook signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  console.log("✅ Signature verification successful");

  try {
    await createNodeMiddleware(app, { probot, webhooksPath: "/api/github/webhooks" })(req, res);
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    return res.status(500).json({ error: error.message });
  }
}
