import { getMyUserId } from './socket.js';

let localStream = null;
const peers = {}; // Store PeerJS 'call' objects
let myPeer = null;

export const hasPeer = (userId) => !!peers[userId];

export const initMedia = async (videoEl) => {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Camera access blocked! Your browser requires HTTPS (or localhost) to use the camera.");
            return false;
        }
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        videoEl.srcObject = localStream;
        await videoEl.play().catch(e => console.error("Autoplay failed:", e));
        return true;
    } catch (err) {
        console.error('Failed to get local media', err);
        alert("Camera/Microphone access was denied or no device was found!\n\nPlease click the lock icon in your browser's address bar, allow Camera and Microphone, and refresh the page.");
        return false;
    }
};

export const initPeer = (onRemoteStream) => {
    if (myPeer) return;
    
    // We use our unique Supabase User ID as our PeerJS ID!
    const myId = getMyUserId();
    
    // Initialize PeerJS with the default free cloud signaling server and fallback TURN servers
    myPeer = new Peer(myId, {
        debug: 1, // Log errors
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
            ]
        }
    });

    myPeer.on('open', (id) => {
        console.log('PeerJS initialized perfectly with ID:', id);
    });

    // Handle incoming calls
    myPeer.on('call', (call) => {
        console.log(`Receiving call from ${call.peer}...`);
        
        // Answer automatically with our stream (pass undefined if null to prevent PeerJS crash)
        call.answer(localStream || undefined);
        peers[call.peer] = call;

        call.on('stream', (remoteStream) => {
            console.log(`Received remote stream from ${call.peer}`);
            onRemoteStream(call.peer, remoteStream);
        });

        call.on('close', () => {
            removePeer(call.peer);
        });
        
        call.on('error', (err) => {
            console.error('PeerJS call error:', err);
            removePeer(call.peer);
        });
    });
    
    myPeer.on('error', (err) => {
        console.error('PeerJS internal error:', err.type, err);
        // If we tried to call someone before they connected to PeerServer, clean up so the self-healing loop retries
        if (err.type === 'peer-unavailable') {
            const match = err.message.match(/Could not connect to peer (.*)/);
            if (match && match[1]) {
                console.log(`Cleaning up failed call to ${match[1]}, loop will retry...`);
                removePeer(match[1]);
            }
        }
    });
};

export const callUser = (userId, onRemoteStream) => {
    if (!myPeer) {
        console.warn('Cannot call: PeerJS not initialized.');
        return;
    }
    
    console.log(`Calling ${userId}...`);
    // Initiate the call (pass localStream if it exists, otherwise it will be a receive-only call)
    const call = myPeer.call(userId, localStream || undefined);
    peers[userId] = call;

    call.on('stream', (remoteStream) => {
        console.log(`Received remote stream from ${userId}`);
        onRemoteStream(userId, remoteStream);
    });

    call.on('close', () => {
        removePeer(userId);
    });
    
    call.on('error', (err) => {
        console.error('PeerJS call error:', err);
        removePeer(userId);
    });
};

export const removePeer = (userId) => {
    if (peers[userId]) {
        peers[userId].close();
        delete peers[userId];
    }
};

// Deprecated since we use PeerJS now, but kept for compatibility with app.js
export const handleSignal = (data, onRemoteStream) => {};

export const toggleAudio = () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            return audioTrack.enabled;
        }
    }
    return false;
};

export const toggleVideo = () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            return videoTrack.enabled;
        }
    }
    return false;
};
