import { getSocket } from './socket.js';

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

const sendMessage = () => {
    const text = chatInput.value.trim();
    if (!text) return;
    
    const channel = getSocket();
    if (channel) {
        channel.send({
            type: 'broadcast',
            event: 'chat-message',
            payload: { sender: username, text }
        });
        // Optimistically render our own message
        handleIncomingMessage({ sender: username, text });
    }
    
    chatInput.value = '';
};

const renderMessage = (msg) => {
    const div = document.createElement('div');
    const isAi = msg.sender === 'AI Assistant';
    
    div.style.padding = '8px 12px';
    div.style.borderRadius = '8px';
    div.style.background = isAi ? 'rgba(108, 99, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)';
    div.style.alignSelf = msg.sender === username ? 'flex-end' : 'flex-start';
    div.style.maxWidth = '80%';
    
    div.innerHTML = `
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">
            ${msg.sender === username ? 'You' : escapeHTML(msg.sender)}
        </div>
        <div style="font-size: 14px; word-wrap: break-word;">
            ${escapeHTML(msg.text)}
        </div>
    `;
    
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
};

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
