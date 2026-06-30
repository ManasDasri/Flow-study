const getMockAiResponse = (query) => {
    if (!query) {
        return "Hi there! I'm your study assistant. Ask me to explain a concept or summarize your notes!";
    }
    
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('pomodoro') || lowerQuery.includes('timer')) {
        return "The Pomodoro technique usually involves 25 minutes of focus followed by a 5-minute break. After 4 sessions, take a longer 15-30 minute break. You can adjust the timer modes above!";
    }
    
    if (lowerQuery.includes('binary search tree') || lowerQuery.includes('bst')) {
        return "A Binary Search Tree (BST) is a node-based binary tree data structure where each node has at most two children. The left child must have a value less than its parent, and the right child must have a value greater than its parent. It has O(log n) time complexity for search, insert, and delete on average.";
    }
    
    if (lowerQuery.includes('help') || lowerQuery.includes('what can you do')) {
        return "I can help explain concepts, give study tips, or just cheer you on! Try asking me about 'Pomodoro' or 'Binary Search Tree'. (This is currently a mockup API!)";
    }

    return `That's an interesting question about "${query}". While I am just a mock AI right now, I encourage you to add a real LLM API here like Gemini or OpenAI to build this out fully!`;
};

module.exports = {
    getMockAiResponse
};
