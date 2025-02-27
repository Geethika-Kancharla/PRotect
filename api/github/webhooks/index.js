import { createNodeMiddleware, createProbot } from "probot";

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

const probot = createProbot();

export default createNodeMiddleware(app, { probot }); 