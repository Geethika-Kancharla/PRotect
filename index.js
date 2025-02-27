require("dotenv").config(); 

const { Probot } = require("probot");

module.exports = (app) => {
  app.log.info("✅ Probot app is running!");

  app.on("pull_request.opened", async (context) => {
    const prComment = context.issue({
      body: "🚀 Thanks for opening this pull request! A maintainer will review it soon. 👍"
    });
    return context.octokit.issues.createComment(prComment);
  });
};
