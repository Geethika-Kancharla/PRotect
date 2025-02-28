import { createNodeMiddleware, createProbot } from "probot";
import crypto from "crypto";

const probot = createProbot({
  appId: process.env.APP_ID,
  privateKey: process.env.PRIVATE_KEY,
  secret: process.env.WEBHOOK_SECRET,
});

const app = (probot) => {
  probot.log.info("✅ Probot app is running!");

  probot.on("pull_request.opened", async (context) => {
    probot.log.info("📣 Received pull_request.opened event");
    const prComment = context.issue({
      body: "🚀 Thanks for opening this PR! We'll review it soon. 👍",
    });
    try {
      await context.octokit.issues.createComment(prComment);
      probot.log.info("✅ Successfully posted PR comment");
    } catch (error) {
      probot.log.error("❌ Error posting PR comment:", error);
    }
  });

  probot.on("pull_request.closed", async (context) => {
    probot.log.info("📣 Received pull_request.closed event");
    if (context.payload.pull_request.merged) {
      const mergedComment = context.issue({
        body: "🎉 This PR has been merged! Thank you for your contribution. 🚀",
      });
      try {
        await context.octokit.issues.createComment(mergedComment);
        probot.log.info("✅ Successfully posted merge comment");
      } catch (error) {
        probot.log.error("❌ Error posting merge comment:", error);
      }
    }
  });
};

// Verify webhook signature
function verifySignature(payload, signature, secret) {
  if (!signature) {
    console.error("No signature found");
    return false;
  }

  // Handle both SHA-1 and SHA-256 signatures
  const algorithm = signature.startsWith('sha256=') ? 'sha256' : 'sha1';
  const hash = crypto.createHmac(algorithm, secret)
    .update(payload)
    .digest('hex');
  const expectedSignature = `${algorithm}=${hash}`;

  console.log('Received signature:', signature);
  console.log('Expected signature:', expectedSignature);
  console.log('Algorithm used:', algorithm);
  console.log('Webhook secret:', secret);
  console.log('Payload length:', payload.length);
  console.log('Payload first 100 chars:', payload.substring(0, 100));
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export default async function handler(req, res) {
  console.log("Received webhook request");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  
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

  console.log("Raw body length:", rawBody.length);
  console.log("First 100 chars of body:", rawBody.substring(0, 100));

  // Try both SHA-256 and SHA-1 signatures
  const sha256Signature = req.headers["x-hub-signature-256"];
  const sha1Signature = req.headers["x-hub-signature"];
  
  const isValidSha256 = sha256Signature && verifySignature(rawBody, sha256Signature, process.env.WEBHOOK_SECRET);
  const isValidSha1 = sha1Signature && verifySignature(rawBody, sha1Signature, process.env.WEBHOOK_SECRET);

  if (!isValidSha256 && !isValidSha1) {
    console.error("Invalid webhook signature");
    console.error("SHA-256 verification result:", isValidSha256);
    console.error("SHA-1 verification result:", isValidSha1);
    console.error("Webhook secret used:", process.env.WEBHOOK_SECRET ? "Present" : "Missing");
    return res.status(401).json({ 
      error: "Invalid signature",
      sha256Present: !!sha256Signature,
      sha1Present: !!sha1Signature
    });
  }

  console.log("✅ Signature verification successful");

  try {
    // Parse body and create request object
    const payload = JSON.parse(rawBody);
    const webhookRequest = {
      ...req,
      body: payload
    };

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
