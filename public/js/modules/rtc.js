import { sendSignal } from './socket.js';

let localStream = null;
const peers = {};
const candidateQueues = {};

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { 
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        { 
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
};

export const initMedia = async (videoEl) => {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Camera access blocked! Your browser requires HTTPS (or localhost) to use the camera. If you are on an IP address or HTTP, the camera will not load.");
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
        // Add explicit alert so the user knows WHY it is black
        alert("Camera/Microphone access was denied or no device was found!\\n\\nPlease click the lock icon in your browser's address bar, allow Camera and Microphone, and refresh the page.");
        return false;
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

    return pc;
};

export const handleSignal = async (data, onRemoteStream) => {
    const { from, signal } = data;
    
    let pc = peers[from];
    if (!pc) {
        pc = createPeerConnection(from, onRemoteStream);
        candidateQueues[from] = [];
    }

    try {
        if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal(from, { type: 'answer', answer });
            
            // Process queued candidates
            if (candidateQueues[from]) {
                for (let c of candidateQueues[from]) {
                    await pc.addIceCandidate(c);
                }
                delete candidateQueues[from];
            }
        } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
        } else if (signal.type === 'candidate') {
            const candidate = new RTCIceCandidate(signal.candidate);
            if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(candidate);
            } else {
                if (!candidateQueues[from]) candidateQueues[from] = [];
                candidateQueues[from].push(candidate);
            }
        }
    } catch (err) {
        console.error("WebRTC Signal Error:", err);
    }
};

export const callUser = async (userId, onRemoteStream) => {
    const pc = createPeerConnection(userId, onRemoteStream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(userId, { type: 'offer', offer });
};

export const removePeer = (userId) => {
    if (peers[userId]) {
        peers[userId].close();
        delete peers[userId];
    }
};
