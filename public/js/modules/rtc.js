import { sendSignal } from './socket.js';

let localStream = null;
const peers = {}; // Store RTCPeerConnection objects

let ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

let credentialsFetched = false;
const fetchTurnCredentials = async () => {
    if (credentialsFetched) return;
    try {
        const response = await fetch('/api/turn-credentials', { method: 'POST' });
        if (response.ok) {
            const data = await response.json();
            if (data.iceServers) {
                ICE_SERVERS.iceServers = [
                    { urls: 'stun:stun.l.google.com:19302' },
                    ...data.iceServers
                ];
            }
        } else {
            console.warn("Failed to fetch TURN credentials, falling back to STUN-only.");
        }
    } catch (e) {
        console.warn("Error fetching TURN credentials, falling back to STUN-only.", e);
    }
    credentialsFetched = true;
};

export const hasPeer = (userId) => !!peers[userId];

export let isDummyMedia = false;

let dummyRAFId = null;
let dummyAudioCtx = null;
let dummyOscillator = null;

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
        dummyRAFId = requestAnimationFrame(draw);
    };
    draw();
    
    const canvasStream = canvas.captureStream(15);
    
    // Create a silent audio stream using an oscillator
    dummyAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const destination = dummyAudioCtx.createMediaStreamDestination();
    dummyOscillator = dummyAudioCtx.createOscillator();
    const gainNode = dummyAudioCtx.createGain();
    gainNode.gain.value = 0; // completely silent
    dummyOscillator.connect(gainNode);
    gainNode.connect(destination);
    dummyOscillator.start();
    
    return new MediaStream([
        canvasStream.getVideoTracks()[0],
        destination.stream.getAudioTracks()[0]
    ]);
};

export const cleanupDummyStream = () => {
    if (dummyRAFId) {
        cancelAnimationFrame(dummyRAFId);
        dummyRAFId = null;
    }
    if (dummyOscillator) {
        try { dummyOscillator.stop(); } catch(e) {}
        dummyOscillator = null;
    }
    if (dummyAudioCtx) {
        try { dummyAudioCtx.close(); } catch(e) {}
        dummyAudioCtx = null;
    }
};

export const initMedia = async (videoEl) => {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn("Camera access blocked/unsupported. Using dummy stream.");
            localStream = createDummyStream();
            isDummyMedia = true;
            videoEl.srcObject = localStream;
            await videoEl.play().catch(e => console.error("Autoplay failed:", e));
            return true;
        }
        
        try {
            // Try Video + Audio
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (e) {
            console.warn("Failed video+audio, trying video only", e);
            try {
                // Try Video only
                localStream = await navigator.mediaDevices.getUserMedia({ video: true });
            } catch (e2) {
                console.warn("Failed video only, trying audio only", e2);
                // Try Audio only
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
        }
        
        videoEl.srcObject = localStream;
        await videoEl.play().catch(e => console.error("Autoplay failed:", e));
        return true;
    } catch (err) {
        console.warn('Failed to get local media, generating dummy stream to keep WebRTC alive.', err);
        localStream = createDummyStream();
        isDummyMedia = true;
        videoEl.srcObject = localStream;
        await videoEl.play().catch(e => console.error("Autoplay failed:", e));
        
        alert("Camera/Microphone access was denied or devices not found! You are in receive-only mode (others will see a black screen).");
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

export const isVideoActive = () => {
    if (isDummyMedia) return false;
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        return videoTrack ? videoTrack.enabled : false;
    }
    return false;
};

// Vanilla WebRTC logic replacing PeerJS
export const createPeerConnection = async (userId, onRemoteStream) => {
    await fetchTurnCredentials();
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peers[userId] = pc;

    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log(`[WebRTC] Sending ICE candidate to ${userId}`);
            sendSignal(userId, { type: 'candidate', candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        onRemoteStream(userId, event.streams[0]);
    };
    
    // Automatically cleanup when connection drops
    pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Connection state with ${userId}: ${pc.connectionState}`);
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            removePeer(userId);
        }
    };

    return pc;
};

const candidateQueues = {};

export const handleSignal = async (data, onRemoteStream) => {
    const { from, signal } = data;
    
    let pc = peers[from];
    if (!pc) {
        pc = await createPeerConnection(from, onRemoteStream);
        candidateQueues[from] = [];
    }

    try {
        if (signal.type === 'offer') {
            console.log(`[WebRTC] Received offer from ${from}`);
            await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log(`[WebRTC] Sending answer to ${from}`);
            sendSignal(from, { type: 'answer', answer });
            
            if (candidateQueues[from]) {
                for (const candidate of candidateQueues[from]) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                candidateQueues[from] = [];
            }
        } else if (signal.type === 'answer') {
            console.log(`[WebRTC] Received answer from ${from}`);
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
            
            if (candidateQueues[from]) {
                for (const candidate of candidateQueues[from]) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                candidateQueues[from] = [];
            }
        } else if (signal.type === 'candidate') {
            console.log(`[WebRTC] Received ICE candidate from ${from}`);
            if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } else {
                if (!candidateQueues[from]) candidateQueues[from] = [];
                candidateQueues[from].push(signal.candidate);
            }
        }
    } catch (err) {
        console.error("Signal handling error:", err);
    }
};

export const callUser = async (userId, onRemoteStream) => {
    try {
        const pc = await createPeerConnection(userId, onRemoteStream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log(`[WebRTC] Sending offer to ${userId}`);
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
    
    if (Object.keys(peers).length === 0) {
        cleanupDummyStream();
    }
};
