import { createNodeMiddleware, createProbot } from "probot";
import { Webhooks, createNodeMiddleware as createWebhooksMiddleware } from "@octokit/webhooks";
import { Buffer } from "buffer";

// Create probot instance
const probot = createProbot({
  appId: process.env.APP_ID,
  privateKey: process.env.PRIVATE_KEY,
  secret: process.env.WEBHOOK_SECRET
});

const app = (probot) => {
  probot.log.info("✅ Probot app is running!");

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
};

// Create webhooks instance for signature verification
const webhooks = new Webhooks({
  secret: process.env.WEBHOOK_SECRET
});

export default async function handler(req, res) {
  // Log request details for debugging
  console.log("Request method:", req.method);
  console.log("Request headers:", req.headers);
  
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Get the signature from headers
  const signature = req.headers["x-hub-signature-256"];
  const event = req.headers["x-github-event"];

  if (!signature) {
    console.error("No signature found in headers");
    return res.status(400).json({ error: "No signature" });
  }

  try {
    // Get raw body as buffer
    const rawBody = await getRawBody(req);
    
    // Verify the webhook signature
    const verified = await webhooks.verify(rawBody, signature);
    if (!verified) {
      console.error("Webhook signature verification failed");
      return res.status(400).json({ error: "Invalid signature" });
    }

    console.log("✅ Webhook signature verified successfully");
    
    // Parse the body
    const payload = JSON.parse(rawBody.toString());
    
    // Create a new request object with the verified payload
    const verifiedReq = {
      ...req,
      body: payload
    };

    // Process the webhook with Probot middleware
    return createNodeMiddleware(app, { probot })(verifiedReq, res);
  } catch (error) {
    console.error("Error processing webhook:", error);
    return res.status(500).json({ error: error.message });
  }
}

// Helper function to get raw body
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      // If body is already parsed, convert it back to string
      return resolve(Buffer.from(JSON.stringify(req.body)));
    }

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
} 