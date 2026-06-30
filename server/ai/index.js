const { Groq } = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || 'dummy_key' // Will fallback if no key provided, but will throw error on request
});

const getAiResponse = async (query) => {
    if (!query) {
        return "Hi there! I'm your study assistant. Ask me to explain a concept or summarize your notes!";
    }

    try {
        if (!process.env.GROQ_API_KEY) {
            return "Please configure your GROQ_API_KEY in the environment variables to use the AI tutor!";
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'You are an elite, highly knowledgeable, and encouraging study tutor. You help students understand complex concepts, break down problems, and stay motivated. Keep your answers concise, clear, and well-formatted for a chat window. Use emojis sparingly but effectively.'
                },
                {
                    role: 'user',
                    content: query
                }
            ],
            model: 'llama3-8b-8192', // Or 'mixtral-8x7b-32768' / 'llama3-70b-8192'
            temperature: 0.7,
            max_tokens: 512,
        });

        return chatCompletion.choices[0]?.message?.content || "I couldn't process that request right now.";
    } catch (error) {
        console.error("Groq API Error:", error);
        return "Sorry, I ran into an issue connecting to my brain. Please check your API key or try again later!";
    }
};

module.exports = {
    getAiResponse
};
