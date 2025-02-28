import { createNodeMiddleware, createProbot } from "probot";

const probot = createProbot({
  appId: process.env.APP_ID,
  privateKey: process.env.PRIVATE_KEY,
  secret: process.env.WEBHOOK_SECRET,
});

const app = (probot) => {
  probot.log.info("Hello World GitHub App started!");

  probot.on("pull_request.opened", async (context) => {
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

  probot.on("issues.opened", async (context) => {
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

const middleware = createNodeMiddleware(app, {
  probot,
  webhooksPath: "/api/github/webhooks",
});

export default middleware;
