import { sendSignal } from './socket.js';

let localStream = null;
const peers = {};

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

export const initMedia = async (videoEl) => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        videoEl.srcObject = localStream;
        return true;
    } catch (err) {
        console.error('Failed to get local media', err);
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
    }

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
