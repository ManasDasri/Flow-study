const { getMockAiResponse } = require('../ai');

const processChatMessage = async (text) => {
    // If the message starts with /ai, trigger the mock assistant
    if (text.trim().toLowerCase().startsWith('/ai')) {
        const query = text.substring(3).trim();
        return getMockAiResponse(query);
    }
    return null;
};

module.exports = {
    processChatMessage
};
