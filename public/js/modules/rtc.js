import { sendSignal } from './socket.js';

let localStream = null;
const peers = {}; // Store RTCPeerConnection objects

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};

export const hasPeer = (userId) => !!peers[userId];

const createDummyStream = () => {
    // Create a 1x1 black canvas stream
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    
    // Draw continuously so WebRTC constantly transmits frames
    const draw = () => {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 1, 1);
        requestAnimationFrame(draw);
    };
    draw();
    
    const canvasStream = canvas.captureStream(15);
    
    // Create a silent audio stream using an oscillator
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const destination = audioCtx.createMediaStreamDestination();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0; // completely silent
    oscillator.connect(gainNode);
    gainNode.connect(destination);
    oscillator.start();
    
    return new MediaStream([
        canvasStream.getVideoTracks()[0],
        destination.stream.getAudioTracks()[0]
    ]);
};

export const initMedia = async (videoEl) => {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn("Camera access blocked/unsupported. Using dummy stream.");
            localStream = createDummyStream();
            videoEl.srcObject = localStream;
            await videoEl.play().catch(e => console.error("Autoplay failed:", e));
            return true;
        }
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        videoEl.srcObject = localStream;
        await videoEl.play().catch(e => console.error("Autoplay failed:", e));
        return true;
    } catch (err) {
        console.warn('Failed to get local media, generating dummy stream to keep WebRTC alive.', err);
        localStream = createDummyStream();
        videoEl.srcObject = localStream;
        await videoEl.play().catch(e => console.error("Autoplay failed:", e));
        
        alert("Camera/Microphone access was denied! You are in receive-only mode (others will see a black screen).\n\nPlease allow Camera and Microphone permissions if you wish to be seen.");
        return true; 
    }
};

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

// Vanilla WebRTC logic replacing PeerJS
export const createPeerConnection = (userId, onRemoteStream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peers[userId] = pc;

    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignal(userId, { type: 'candidate', candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        onRemoteStream(userId, event.streams[0]);
    };
    
    // Automatically cleanup when connection drops
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            removePeer(userId);
        }
    };

    return pc;
};

export const handleSignal = async (data, onRemoteStream) => {
    const { from, signal } = data;
    
    let pc = peers[from];
    if (!pc) {
        pc = createPeerConnection(from, onRemoteStream);
    }

    try {
        if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal(from, { type: 'answer', answer });
        } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
        } else if (signal.type === 'candidate') {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    } catch (err) {
        console.error("Signal handling error:", err);
    }
};

export const callUser = async (userId, onRemoteStream) => {
    try {
        const pc = createPeerConnection(userId, onRemoteStream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(userId, { type: 'offer', offer });
    } catch (err) {
        console.error("Failed to initiate call:", err);
    }
};

export const removePeer = (userId) => {
    if (peers[userId]) {
        peers[userId].close();
        delete peers[userId];
    }
};

// Stub for initPeer to prevent app.js from breaking before it's updated
export const initPeer = () => {};
