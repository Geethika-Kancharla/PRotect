import { createNodeMiddleware, createProbot } from "probot";
import crypto from 'crypto';

// Create probot instance with the required configuration
const probot = createProbot();

const app = (probot) => {
  probot.log.info("✅ Probot app is running!");

  probot.on("pull_request.opened", async (context) => {
    probot.log.info("📣 Received pull_request.opened event");
    
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

// Verify webhook signature
function verify(payload, signature) {
  if (!signature) {
    console.error("No signature found");
    return false;
  }

  const sig = Buffer.from(signature);
  const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET);
  const digest = Buffer.from('sha256=' + hmac.update(payload).digest('hex'));

  if (sig.length !== digest.length || !crypto.timingSafeEqual(digest, sig)) {
    console.error("Signature verification failed");
    return false;
  }

  return true;
}

export default async function handler(req, res) {
  console.log("Received webhook request");
  
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Get raw body as string
  const rawBody = await new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      resolve(data);
    });
  });

  // Verify signature
  const signature = req.headers["x-hub-signature-256"];
  if (!verify(rawBody, signature)) {
    console.error("Invalid webhook signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Parse body and create request object
  const payload = JSON.parse(rawBody);
  const webhookRequest = {
    ...req,
    body: payload
  };

  try {
    // Process with Probot
    await createNodeMiddleware(app, {
      probot,
      webhooksPath: "/api/github/webhooks"
    })(webhookRequest, res);
  } catch (error) {
    console.error("Error processing webhook:", error);
    return res.status(500).json({ error: error.message });
  }
} 