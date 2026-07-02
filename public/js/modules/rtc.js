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
    
    // Initialize PeerJS with the default free cloud signaling server
    myPeer = new Peer(myId, {
        debug: 1 // Log errors
    });

    myPeer.on('open', (id) => {
        console.log('PeerJS initialized perfectly with ID:', id);
    });

    // Handle incoming calls
    myPeer.on('call', (call) => {
        console.log(`Receiving call from ${call.peer}...`);
        
        // Answer automatically with our stream
        call.answer(localStream);
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
        });
    });
    
    myPeer.on('error', (err) => {
        console.error('PeerJS internal error:', err);
    });
};

export const callUser = (userId, onRemoteStream) => {
    if (!myPeer || !localStream) {
        console.warn('Cannot call: PeerJS or localStream not initialized.');
        return;
    }
    
    console.log(`Calling ${userId}...`);
    // Initiate the call
    const call = myPeer.call(userId, localStream);
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
