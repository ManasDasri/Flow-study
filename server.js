require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// AI Chat Route
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy_key_for_now' });

app.post('/api/ai', async (req, res) => {
    try {
        const { message } = req.body;
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful study assistant in a virtual study room. Answer concisely." },
                { role: "user", content: message }
            ],
            model: "llama3-8b-8192",
        });
        res.json({ text: completion.choices[0].message.content });
    } catch (e) {
        console.error("AI Error:", e);
        res.status(500).json({ text: "Sorry, I am having trouble connecting to my brain right now." });
    }
});

// Fallback to index.html for SPA if needed (though this is a simple page right now)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`Flow static server running on port ${PORT}`);
});
