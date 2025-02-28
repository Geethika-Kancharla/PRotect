import express from 'express';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.GITHUB_WEBHOOK_SECRET;

// Middleware to parse JSON body
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// GitHub Webhook handler
app.post('/webhook', (req, res) => {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature || !isValidSignature(req.rawBody, signature)) {
        return res.status(401).send('Invalid signature');
    }

    const event = req.headers['x-github-event'];
    const payload = req.body;
    
    if (event === 'push') {
        console.log(`Push event received: ${payload.ref}`);
    } else if (event === 'pull_request') {
        console.log(`Pull Request ${payload.action}: #${payload.pull_request.number} - ${payload.pull_request.title}`);
    }

    res.status(200).send('Webhook received');
});

function isValidSignature(payload, signature) {
    const hmac = crypto.createHmac('sha256', SECRET);
    hmac.update(payload);
    const digest = `sha256=${hmac.digest('hex')}`;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
