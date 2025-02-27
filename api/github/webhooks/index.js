import { createNodeMiddleware, createProbot } from "probot";
import { Webhooks } from "@octokit/webhooks";

const webhooks = new Webhooks({
  secret: process.env.WEBHOOK_SECRET
});

// Create probot instance
const probot = createProbot({
  appId: process.env.APP_ID,
  privateKey: process.env.PRIVATE_KEY,
  secret: process.env.WEBHOOK_SECRET
});

const app = (probot) => {
  probot.log.info("✅ Probot app is running!");
  probot.log.info(`Webhook secret length: ${process.env.WEBHOOK_SECRET?.length}`);

  // Listen for PR events
  probot.on("pull_request.opened", async (context) => {
    probot.log.info("📣 Received pull_request.opened event");
    probot.log.info(`Repository: ${context.payload.repository.full_name}`);
    probot.log.info(`PR #${context.payload.pull_request.number}: ${context.payload.pull_request.title}`);

    const prComment = context.issue({
      body: "🚀 Thanks for opening this PR! We'll review it soon. 👍"
    });

    try {
      const response = await context.octokit.issues.createComment(prComment);
      probot.log.info("✅ Successfully posted PR comment");
      return response;
    } catch (error) {
      probot.log.error("❌ Error posting PR comment:", error);
      throw error;
    }
  });

  probot.on("pull_request.closed", async (context) => {
    probot.log.info("📣 Received pull_request.closed event");
    
    if (context.payload.pull_request.merged) {
      const mergedComment = context.issue({
        body: "🎉 This PR has been merged! Thank you for your contribution. 🚀"
      });

      try {
        const response = await context.octokit.issues.createComment(mergedComment);
        probot.log.info("✅ Successfully posted merge comment");
        return response;
      } catch (error) {
        probot.log.error("❌ Error posting merge comment:", error);
        throw error;
      }
    }
  });

  // Add error handling
  probot.on("error", (error) => {
    probot.log.error("❌ Webhook error occurred:", error);
  });
};

const middleware = createNodeMiddleware(app, { probot });

// Export a function that wraps the middleware with additional error handling
export default async function handler(req, res) {
  try {
    // Log headers for debugging
    console.log("Received headers:", {
      "x-hub-signature": req.headers["x-hub-signature"],
      "x-hub-signature-256": req.headers["x-hub-signature-256"],
      "x-github-event": req.headers["x-github-event"]
    });

    // Verify webhook signature manually first
    try {
      await webhooks.verify(req.body, req.headers["x-hub-signature-256"]);
      console.log("✅ Webhook signature verified successfully");
    } catch (error) {
      console.error("❌ Webhook verification failed:", error);
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    // If verification passed, process the webhook
    return middleware(req, res);
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    return res.status(500).json({ error: error.message });
  }
} 