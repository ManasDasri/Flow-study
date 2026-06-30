const { getAiResponse } = require('../ai');

const processChatMessage = async (text) => {
    // If the message starts with /ai, trigger the mock assistant
    if (text.trim().toLowerCase().startsWith('/ai')) {
        const query = text.substring(3).trim();
        const aiResponseText = await getAiResponse(query);
        return aiResponseText;
    }
    return null;
};

module.exports = {
    processChatMessage
};
