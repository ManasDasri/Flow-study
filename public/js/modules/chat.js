import { getSocket } from './socket.js';
import { escapeHTML } from './utils.js';

let roomId = null;
let username = null;
const messages = [];

// UI Elements
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-chat-btn');

export const initChat = (rId, user) => {
    roomId = rId;
    username = user;
    
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
};

export const handleIncomingMessage = (messageData) => {
    messages.push(messageData);
    renderMessage(messageData);
};

const sendMessage = async () => {
    const text = chatInput.value.trim();
    if (!text) return;
    
    chatInput.value = '';
    
    const channel = getSocket();
    const isAiCommand = text.startsWith('/ai');

    if (!isAiCommand && channel) {
        channel.send({
            type: 'broadcast',
            event: 'chat-message',
            payload: { sender: username, text }
        });
        // Optimistically render our own message
        handleIncomingMessage({ sender: username, text });
    }
    
    // Intercept AI commands
    if (isAiCommand) {
        const query = text.replace(/^\/ai\s*/, '').trim();
        if (!query) {
            handleIncomingMessage({ sender: 'AI Assistant', text: 'Please include a message after /ai. Example: /ai What is the pomodoro technique?' });
            return;
        }
        
        try {
            const res = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: query })
            });
            const data = await res.json();
            if (!res.ok) {
                const errorText = data?.text || 'AI assistant is currently unavailable.';
                handleIncomingMessage({ sender: 'AI Assistant', text: errorText });
                return;
            }
            
            // Broadcast AI response to everyone in the room!
            if (channel) {
                channel.send({
                    type: 'broadcast',
                    event: 'chat-message',
                    payload: { sender: 'AI Assistant', text: data.text || 'No response from AI assistant.' }
                });
            }
            handleIncomingMessage({ sender: 'AI Assistant', text: data.text || 'No response from AI assistant.' });
        } catch (e) {
            handleIncomingMessage({ sender: 'AI Assistant', text: 'Error connecting to brain.' });
        }
        return;
    }

    if (!channel) {
        handleIncomingMessage({ sender: username, text });
    }
};

const renderMessage = (msg) => {
    const div = document.createElement('div');
    const isAi = msg.sender === 'AI Assistant';

    div.className = `chat-message fade-in ${isAi ? 'ai' : ''} ${msg.sender === username ? 'own' : ''}`;

    div.innerHTML = `
        <div class="sender">${msg.sender === username ? 'You' : escapeHTML(msg.sender)}</div>
        <div class="text">${escapeHTML(msg.text)}</div>
    `;
    
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
};
