import { createNodeMiddleware, createProbot } from "probot";

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

// Create middleware handler for Vercel
const handler = createNodeMiddleware(app, {
  probot,
  webhooksPath: "/api/github/webhooks"
});

// Export a function that handles the request
export default async function(req, res) {
  console.log("Received webhook request");
  console.log("Method:", req.method);
  console.log("Headers:", req.headers);

  if (req.method === "GET") {
    return res.status(200).json({ message: "Probot GitHub App is running!" });
  }

  try {
    await handler(req, res);
    console.log("Webhook handled successfully");
  } catch (error) {
    console.error("Error handling webhook:", error);
    // Only send error response if one hasn't been sent already
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
}
