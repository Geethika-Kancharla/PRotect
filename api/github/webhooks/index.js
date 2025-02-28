import { createNodeMiddleware, createProbot } from "probot";
import crypto from 'crypto';

// Verify environment variables are present
function checkEnvironment() {
  const required = {
    'APP_ID': process.env.APP_ID,
    'WEBHOOK_SECRET': process.env.WEBHOOK_SECRET,
    'PRIVATE_KEY': process.env.PRIVATE_KEY
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Initialize probot with required config
const probot = createProbot({
  appId: process.env.APP_ID,
  privateKey: process.env.PRIVATE_KEY,
  secret: process.env.WEBHOOK_SECRET,
});

const app = (probot) => {
  probot.log.info("Hello World GitHub App started!");

  probot.on(["pull_request.opened", "pull_request.reopened"], async (context) => {
    try {
      probot.log.info("Pull request received!");
      probot.log.info(`Repository: ${context.payload.repository.full_name}`);
      probot.log.info(`PR #${context.payload.pull_request.number}`);
      
      const params = context.issue({
        body: "Hello World! I am a GitHub App 🤖",
      });

      const response = await context.octokit.issues.createComment(params);
      probot.log.info("Successfully commented on PR!");
      return response;
    } catch (error) {
      probot.log.error("Error handling pull request:", error);
      throw error;
    }
  });

  probot.on(["issues.opened", "issues.reopened"], async (context) => {
    try {
      probot.log.info("Issue received!");
      probot.log.info(`Repository: ${context.payload.repository.full_name}`);
      probot.log.info(`Issue #${context.payload.issue.number}`);
      
      const params = context.issue({
        body: "Hello World! I am a GitHub App 🤖",
      });

      const response = await context.octokit.issues.createComment(params);
      probot.log.info("Successfully commented on issue!");
      return response;
    } catch (error) {
      probot.log.error("Error handling issue:", error);
      throw error;
    }
  });
};

// Verify GitHub webhook signature
function verifyWebhook(req, rawBody) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    throw new Error('No X-Hub-Signature-256 found on request');
  }

  const secret = process.env.WEBHOOK_SECRET;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(rawBody).digest('hex');
  
  console.log('Received signature:', signature);
  console.log('Calculated digest:', digest);

  const checksum = Buffer.from(signature);
  const digestBuffer = Buffer.from(digest);

  if (checksum.length !== digestBuffer.length || !crypto.timingSafeEqual(digestBuffer, checksum)) {
    throw new Error('Request body digest did not match x-hub-signature-256');
  }
}

// Export a function that handles the request
export default async function(req, res) {
  try {
    // Check environment variables first
    checkEnvironment();

    console.log("Received webhook request");
    console.log("Method:", req.method);
    console.log("Event Type:", req.headers['x-github-event']);
    console.log("Delivery ID:", req.headers['x-github-delivery']);
    console.log("Content Type:", req.headers['content-type']);

    // Handle GET requests (health check)
    if (req.method === "GET") {
      return res.status(200).json({ 
        message: "Probot GitHub App is running!",
        time: new Date().toISOString(),
        environment: {
          appId: process.env.APP_ID,
          webhookSecretPresent: !!process.env.WEBHOOK_SECRET,
          privateKeyPresent: !!process.env.PRIVATE_KEY
        }
      });
    }

    // Get the raw body for verification
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks);

    // Verify webhook signature
    try {
      verifyWebhook(req, rawBody);
      console.log("✅ Webhook signature verified");
    } catch (error) {
      console.error("❌ Webhook verification failed:", error.message);
      return res.status(401).json({ error: error.message });
    }

    // Parse the body
    const parsedBody = JSON.parse(rawBody);
    console.log("Event payload type:", parsedBody.action || "unknown");

    // Create webhook request object
    const webhookRequest = {
      ...req,
      body: parsedBody,
      headers: {
        ...req.headers,
        'content-type': 'application/json'
      }
    };

    // Process with Probot
    await createNodeMiddleware(app, {
      probot,
      webhooksPath: "/api/github/webhooks"
    })(webhookRequest, res);

    console.log("✅ Webhook handled successfully");
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    console.log("Environment status:");
    console.log("- Webhook Secret:", process.env.WEBHOOK_SECRET ? "Present" : "Missing");
    console.log("- App ID:", process.env.APP_ID);
    console.log("- Private Key:", process.env.PRIVATE_KEY ? "Present" : "Missing");
    
    if (!res.headersSent) {
      res.status(error.status || 500).json({ 
        error: error.message,
        type: error.name,
        event: req.headers['x-github-event']
      });
    }
  }
}
