import { createNodeMiddleware, createProbot } from "probot";
import crypto from "crypto";

const probot = createProbot();

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

function verifyGitHubWebhook(req, rawBody) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) {
    throw new Error("No X-Hub-Signature-256 found on request");
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("No webhook secret found");
  }

  const hmac = crypto.createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(rawBody).digest("hex");
  
  if (signature.length !== digest.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
    throw new Error("Signatures didn't match!");
  }
}

export default async function handler(req, res) {
  try {
    // Only accept POST requests
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).end("Method Not Allowed");
      return;
    }

    // Get the raw body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString();

    // Verify webhook signature
    try {
      verifyGitHubWebhook(req, rawBody);
    } catch (error) {
      console.error("Webhook verification failed:", error.message);
      return res.status(401).json({ error: error.message });
    }

    // Parse the webhook payload
    const payload = JSON.parse(rawBody);

    // Create a new request object with the verified payload
    const webhookRequest = {
      ...req,
      body: payload
    };

    // Process with Probot
    await createNodeMiddleware(app, {
      probot,
      webhooksPath: "/api/github/webhooks"
    })(webhookRequest, res);
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({ error: error.message });
  }
}
