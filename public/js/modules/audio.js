import { youtubeEmbedUrl, spotifyEmbedUrl } from './utils.js';
import { broadcastAudio } from './socket.js';
import { notify } from './feedback.js';

let provider = 'youtube';
const links = { youtube: '', spotify: '' };
const sources = { youtube: 'https://www.youtube.com/embed/rFZHOHl-L8A?autoplay=1&mute=1', spotify: null };
const frame = name => document.getElementById(name === 'youtube' ? 'youtube-iframe' : 'spotify-iframe');

function selectProvider(next) {
    if (!['youtube', 'spotify'].includes(next)) return;
    if (next !== provider) frame(provider).src = 'about:blank';
    provider = next;
    document.querySelectorAll('[data-audio-provider]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.audioProvider === next));
    });
    document.getElementById('youtube-iframe').classList.toggle('hidden', next !== 'youtube');
    document.getElementById('spotify-iframe').classList.toggle('hidden', next !== 'spotify' || !sources.spotify);
    document.getElementById('spotify-empty').classList.toggle('hidden', next !== 'spotify' || !!sources.spotify);
    const input = document.getElementById('youtube-url-input');
    input.value = links[next];
    input.placeholder = next === 'youtube' ? 'YouTube link' : 'Spotify link';
    input.setAttribute('aria-label', next === 'youtube' ? 'YouTube video or playlist link' : 'Spotify track, album, or playlist link');
    if (sources[next] && frame(next).getAttribute('src') !== sources[next]) frame(next).src = sources[next];
}

export function loadRoomAudio(next, url) {
    const embed = next === 'youtube' ? youtubeEmbedUrl(url) : next === 'spotify' ? spotifyEmbedUrl(url) : null;
    if (!embed) return false;
    links[next] = url;
    sources[next] = embed;
    selectProvider(next);
    frame(next).src = embed;
    return true;
}

export function initAudio() {
    document.querySelectorAll('[data-audio-provider]').forEach(button => button.addEventListener('click', () => selectProvider(button.dataset.audioProvider)));
    document.getElementById('sync-youtube-btn').addEventListener('click', async event => {
        const url = document.getElementById('youtube-url-input').value.trim();
        if (!loadRoomAudio(provider, url)) {
            notify('Paste a valid ' + (provider === 'youtube' ? 'YouTube video or playlist' : 'Spotify content') + ' link.', 'error');
            return;
        }
        const button = event.currentTarget;
        button.disabled = true;
        try {
            const status = await broadcastAudio(provider, url);
            if (status !== 'ok') throw new Error('Sharing failed');
            notify('Audio link shared. Each person controls their own playback.');
        } catch { notify('The link could not be shared. Check your connection and try again.', 'error'); }
        finally { button.disabled = false; }
    });
    selectProvider(provider);
}
