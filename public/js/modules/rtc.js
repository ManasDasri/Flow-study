import { sendSignal, getMyUserId } from './socket.js';

let localStream = null;
const peers = {};
const makingOffer = {};
const candidateQueues = {};
const pendingPeers = {};
const remoteStreams = {};

const DEFAULT_ICE = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
    ]
};

let iceConfig = { ...DEFAULT_ICE };
let fetchTurnPromise = null;

const serializeCandidate = (candidate) => {
    if (!candidate) return null;
    if (typeof candidate.toJSON === 'function') return candidate.toJSON();
    return {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment
    };
};

const fetchTurnCredentials = async () => {
    if (fetchTurnPromise) return fetchTurnPromise;
    fetchTurnPromise = (async () => {
        try {
            const response = await fetch('/api/turn-credentials', { method: 'POST' });
            if (!response.ok) return;
            const data = await response.json();
            if (Array.isArray(data.iceServers) && data.iceServers.length) {
                iceConfig = {
                    iceServers: [...DEFAULT_ICE.iceServers, ...data.iceServers]
                };
            }
        } catch (e) {
            console.warn('TURN fetch failed, using STUN only.', e);
        }
    })();
    return fetchTurnPromise;
};

export const hasPeer = (userId) => !!peers[userId];

export const peerNeedsCall = (userId) => {
    const pc = peers[userId];
    if (!pc) return true;
    const state = pc.connectionState;
    return state === 'failed' || state === 'closed';
};

export let isDummyMedia = false;

let dummyRAFId = null;
let dummyAudioCtx = null;
let dummyOscillator = null;

const createDummyStream = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');

    const draw = () => {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 1, 1);
        dummyRAFId = requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(15);

    dummyAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const destination = dummyAudioCtx.createMediaStreamDestination();
    dummyOscillator = dummyAudioCtx.createOscillator();
    const gainNode = dummyAudioCtx.createGain();
    gainNode.gain.value = 0;
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
        try { dummyOscillator.stop(); } catch (e) { /* already stopped */ }
        dummyOscillator = null;
    }
    if (dummyAudioCtx) {
        try { dummyAudioCtx.close(); } catch (e) { /* already closed */ }
        dummyAudioCtx = null;
    }
};

export const initMedia = async (videoEl) => {
    isDummyMedia = false;
    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('getUserMedia unsupported');
        }

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (e) {
            console.warn('Failed video+audio, trying fallbacks', e);
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            } catch (e2) {
                localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                isDummyMedia = true;
            }
        }

        videoEl.srcObject = localStream;
        videoEl.muted = true;
        await videoEl.play().catch((err) => console.error('Autoplay failed:', err));
        return true;
    } catch (err) {
        console.warn('Using dummy stream to keep WebRTC alive.', err);
        localStream = createDummyStream();
        isDummyMedia = true;
        videoEl.srcObject = localStream;
        videoEl.muted = true;
        await videoEl.play().catch((e) => console.error('Autoplay failed:', e));
        return true;
    }
};

// Returns the new enabled state, or null when there's no mic to toggle at
// all (e.g. getUserMedia fell back to video-only) — distinct from a
// successful toggle-to-muted, which also has no audio, so callers can tell
// "you muted yourself" apart from "there's no microphone to control".
export const toggleAudio = () => {
    const audioTrack = localStream?.getAudioTracks()[0];
    if (!audioTrack) return null;
    audioTrack.enabled = !audioTrack.enabled;
    return audioTrack.enabled;
};

export const hasAudioTrack = () => !!localStream?.getAudioTracks()[0];

export const toggleVideo = () => {
    const videoTrack = localStream?.getVideoTracks()[0];
    if (!videoTrack || isDummyMedia) return false;
    videoTrack.enabled = !videoTrack.enabled;
    return videoTrack.enabled;
};

export const isVideoActive = () => {
    if (isDummyMedia) return false;
    const videoTrack = localStream?.getVideoTracks()[0];
    return !!(videoTrack && videoTrack.enabled && videoTrack.readyState === 'live');
};



export const getOrCreatePeerConnection = async (userId, onRemoteStream) => {
    if (peers[userId] && peers[userId].signalingState !== 'closed') return peers[userId];
    if (pendingPeers[userId]) return pendingPeers[userId];

    pendingPeers[userId] = (async () => {
        await fetchTurnCredentials();
        const pc = new RTCPeerConnection(iceConfig);
        peers[userId] = pc;
        candidateQueues[userId] = candidateQueues[userId] || [];
        makingOffer[userId] = false;

        if (localStream) {
            localStream.getTracks().forEach((track) => {
                pc.addTrack(track, localStream);
            });
        }

        pc.onicecandidate = (event) => {
            if (!event.candidate) return;
            sendSignal(userId, { type: 'candidate', candidate: serializeCandidate(event.candidate) });
        };

        pc.ontrack = (event) => {
            let stream = remoteStreams[userId];
            if (!stream) {
                stream = new MediaStream();
                remoteStreams[userId] = stream;
            }
            stream.addTrack(event.track);
            
            if (event.track) {
                event.track.onunmute = () => onRemoteStream(userId, stream);
            }
            onRemoteStream(userId, stream);
        };

        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] ${userId}: ${pc.connectionState}`);
            if (pc.connectionState === 'failed') {
                pc.restartIce();
            }
        };

        return pc;
    })();

    try {
        return await pendingPeers[userId];
    } finally {
        delete pendingPeers[userId];
    }
};

const flushCandidates = async (userId, pc) => {
    const queued = candidateQueues[userId] || [];
    candidateQueues[userId] = [];
    for (const candidate of queued) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.warn('Failed to apply queued ICE candidate', err);
        }
    }
};

const isPolite = (remoteId) => {
    const mine = getMyUserId() || '';
    return mine > remoteId;
};

export const handleSignal = async (data, onRemoteStream) => {
    const { from, signal } = data;
    if (!from || !signal) return;

    const pc = await getOrCreatePeerConnection(from, onRemoteStream);
    if (!candidateQueues[from]) candidateQueues[from] = [];

    try {
        if (signal.type === 'offer') {
            const offerCollision = makingOffer[from] || pc.signalingState !== 'stable';
            if (offerCollision) {
                if (!isPolite(from)) return;
                try {
                    await pc.setLocalDescription({ type: 'rollback' });
                } catch (e) {
                    console.warn('Rollback skipped', e);
                }
            }

            await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal(from, { type: 'answer', answer: { type: answer.type, sdp: answer.sdp } });
            await flushCandidates(from, pc);
        } else if (signal.type === 'answer') {
            if (pc.signalingState !== 'have-local-offer') return;
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
            await flushCandidates(from, pc);
        } else if (signal.type === 'candidate' && signal.candidate) {
            if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } else {
                candidateQueues[from].push(signal.candidate);
            }
        }
    } catch (err) {
        console.error('Signal handling error:', err);
    }
};

export const callUser = async (userId, onRemoteStream) => {
    try {
        const pc = await getOrCreatePeerConnection(userId, onRemoteStream);
        if (pc.signalingState !== 'stable') return;
        if (pc.connectionState === 'connected' || pc.connectionState === 'connecting') return;

        makingOffer[userId] = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(userId, { type: 'offer', offer: { type: offer.type, sdp: offer.sdp } });
    } catch (err) {
        console.error('Failed to initiate call:', err);
    } finally {
        makingOffer[userId] = false;
    }
};

export const removePeer = (userId) => {
    if (peers[userId]) {
        peers[userId].onicecandidate = null;
        peers[userId].ontrack = null;
        peers[userId].close();
        delete peers[userId];
    }
    delete makingOffer[userId];
    delete candidateQueues[userId];
    delete pendingPeers[userId];
    delete remoteStreams[userId];
};
