import crypto from 'crypto';

// Verify environment variables are present
function checkEnvironment() {
  const required = {
    'WEBHOOK_SECRET': process.env.WEBHOOK_SECRET
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

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

// Handle different webhook events
async function handleWebhookEvent(event, payload) {
  console.log(`Handling ${event} event`);

  switch (event) {
    case 'pull_request':
      if (payload.action === 'opened' || payload.action === 'reopened') {
        console.log(`PR #${payload.pull_request.number} ${payload.action}`);
        // Here you would add your PR handling logic
        return {
          status: 200,
          message: `Processed PR #${payload.pull_request.number}`
        };
      }
      break;

    case 'issues':
      if (payload.action === 'opened' || payload.action === 'reopened') {
        console.log(`Issue #${payload.issue.number} ${payload.action}`);
        // Here you would add your issue handling logic
        return {
          status: 200,
          message: `Processed Issue #${payload.issue.number}`
        };
      }
      break;

    default:
      console.log(`Unhandled event type: ${event}`);
      return {
        status: 200,
        message: `Received ${event} event`
      };
  }
}

// Export the webhook handler
export default async function(req, res) {
  try {
    // Check environment variables first
    checkEnvironment();

    console.log("Received webhook request");
    console.log("Method:", req.method);
    console.log("Event Type:", req.headers['x-github-event']);
    console.log("Delivery ID:", req.headers['x-github-delivery']);

    // Handle GET requests (health check)
    if (req.method === "GET") {
      return res.status(200).json({ 
        message: "GitHub Webhook handler is running!",
        time: new Date().toISOString()
      });
    }

    // Only accept POST requests for webhooks
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Get the raw body
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
    const payload = JSON.parse(rawBody);
    const event = req.headers['x-github-event'];

    // Handle the webhook event
    const result = await handleWebhookEvent(event, payload);
    return res.status(result.status).json(result);

  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: error.message,
        type: error.name,
        event: req.headers['x-github-event']
      });
    }
  }
}

