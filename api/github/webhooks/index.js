const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.WEBHOOK_SECRET || "your-secret";

app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// Function to verify GitHub signature
function verifySignature(req) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(req.rawBody);
  const expectedSignature = `sha256=${hmac.digest("hex")}`;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

app.post("/webhook", (req, res) => {
  if (!verifySignature(req)) {
    console.error("Signature verification failed!");
    return res.status(401).send("Invalid signature");
  }

  const event = req.headers["x-github-event"];
  console.log(`Received GitHub event: ${event}`);

  if (event === "pull_request") {
    const action = req.body.action;
    console.log(`Pull request ${action}: #${req.body.pull_request.number}`);

    // You can trigger any action based on PR events (opened, closed, merged, etc.)
    if (action === "opened") {
      console.log("New PR opened!");
      // Add custom logic here
    } else if (action === "closed" && req.body.pull_request.merged) {
      console.log("PR merged!");
      // Run deployment script or any other action
    }
  }

  res.status(200).send("Event received");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
