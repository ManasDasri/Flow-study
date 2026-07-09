require('dotenv').config();

// Fast-fail if Groq API key is missing or dummy
if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
    console.error("CRITICAL ERROR: GROQ_API_KEY is missing or invalid in .env file.");
    process.exit(1);
}

const express = require('express');
const http = require('http');
const path = require('path');
const rateLimit = require('express-rate-limit');
const twilio = require('twilio');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// Rate limiting for API endpoints
const aiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // Limit each IP to 10 requests per `window` (here, per minute)
    message: { text: "Too many requests to the AI endpoint, please try again after a minute." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// AI Chat Route
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.post('/api/ai', aiLimiter, async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message || message.length > 500) {
            return res.status(400).json({ text: "Message is too long or empty." });
        }
        
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful study assistant in a virtual study room. Answer concisely." },
                { role: "user", content: message }
            ],
            model: "llama-3.1-8b-instant",
        });
        res.json({ text: completion.choices[0].message.content });
    } catch (e) {
        console.error("AI Error:", e);
        res.status(500).json({ text: "Sorry, I am having trouble connecting to my brain right now." });
    }
});

// Twilio TURN Credentials Route
app.post('/api/turn-credentials', async (req, res) => {
    try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        
        if (!accountSid || !authToken) {
            return res.status(500).json({ error: "Twilio credentials not configured on server." });
        }
        
        const client = twilio(accountSid, authToken);
        const token = await client.tokens.create();
        
        res.json({ iceServers: token.iceServers });
    } catch (e) {
        console.error("TURN Error:", e);
        res.status(500).json({ error: "Failed to generate TURN credentials" });
    }
});
server.listen(PORT, () => {
    console.log(`Flow static server running on port ${PORT}`);
});
