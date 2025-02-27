import dotenv from "dotenv";
import { Probot } from "probot";
import { createNodeMiddleware, createProbot } from "probot";
import express from "express";

// Load environment variables
dotenv.config();

const app = (probot) => {
  probot.log.info("✅ Probot app is running!");

  // Listen for PR events
  probot.on("pull_request.opened", async (context) => {
    const prComment = context.issue({
      body: "🚀 Thanks for opening this PR! We'll review it soon. 👍"
    });

    return context.octokit.issues.createComment(prComment);
  });

  probot.on("pull_request.closed", async (context) => {
    if (context.payload.pull_request.merged) {
      const mergedComment = context.issue({
        body: "🎉 This PR has been merged! Thank you for your contribution. 🚀"
      });

      return context.octokit.issues.createComment(mergedComment);
    }
  });
};

// Start Probot server
const server = express();
const probot = createProbot();

// Load the app function
server.use(createNodeMiddleware(app, { probot }));

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

export default app;