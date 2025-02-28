const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.WEBHOOK_SECRET || "your-secret";

app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// Function to verify GitHub signature
function verifySignature(req) {
  const signature = req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"];

  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(req.rawBody);
  const expectedSignature = `sha256=${hmac.digest("hex")}`;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

app.post("/webhook", (req, res) => {
  console.log("Headers:", req.headers);
  console.log("Body:", JSON.stringify(req.body, null, 2));

  if (!verifySignature(req)) {
    console.error("Signature verification failed!");
    return res.status(401).send("Invalid signature");
  }

  const event = req.headers["x-github-event"];
  console.log(`Received GitHub event: ${event}`);

  if (event === "pull_request") {
    console.log(`PR Action: ${req.body.action}`);
    console.log(`PR Title: ${req.body.pull_request.title}`);
    console.log(`PR Number: ${req.body.pull_request.number}`);
  }

  res.status(200).send("Event received");
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
