const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const source = readFileSync('public/js/modules/utils.js', 'utf8');
const load = () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('all shipped JavaScript parses', () => {
    const files = readdirSync('public/js', { recursive: true }).filter(path => path.endsWith('.js')).map(path => 'public/js/' + path);
    for (const file of ['server.js', ...files]) {
        const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        assert.equal(result.status, 0, file + ': ' + result.stderr);
    }
});

test('text escaping preserves content and rejects markup interpretation', async () => {
    const { escapeHTML } = await load();
    assert.equal(escapeHTML('<img a="x"> & \'hi\''), '&lt;img a=&quot;x&quot;&gt; &amp; &#39;hi&#39;');
    assert.equal(escapeHTML(null), '');
    assert.equal(escapeHTML(0), '0');
    assert.equal(escapeHTML('日本語 📝'), '日本語 📝');
});

test('media parser accepts supported links and rejects lookalikes and malformed URLs', async () => {
    const { youtubeEmbedUrl } = await load();
    for (const url of ['https://youtu.be/jfKfPfyJRdk?t=2', 'https://www.youtube.com/watch?v=jfKfPfyJRdk', 'https://m.youtube.com/shorts/jfKfPfyJRdk', 'https://youtube.com/live/jfKfPfyJRdk']) {
        assert.equal(youtubeEmbedUrl(url), 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1');
    }
    assert.match(youtubeEmbedUrl('https://youtube.com/playlist?list=PLabcdefghijk12345'), /videoseries/);
    for (const url of ['', 'not a link', 'javascript:alert(1)', 'https://youtube.com.attacker.example/watch?v=jfKfPfyJRdk', 'https://attacker.example/youtu.be/jfKfPfyJRdk', 'https://youtube.com/watch?v=short', 'https://youtube.com/watch?v=jfKfPfyJRdk%22%3E']) assert.equal(youtubeEmbedUrl(url), null, url);
});

test('corrupt stored login falls back to signed-out state', async () => {
    const { getStoredUser } = await load();
    let value;
    global.localStorage = { getItem: () => value };
    try {
        for (value of [null, '{broken', '{}', 'null', '{"id":1,"email":"name@example.com"}']) assert.equal(getStoredUser(), null);
        value = '{"id":"user","email":"name@example.com"}';
        assert.equal(getStoredUser().id, 'user');
    } finally { delete global.localStorage; }
});

test('Supabase fetch has a deadline and preserves caller cancellation', async () => {
    const previousFetch = global.fetch;
    let options;
    let observedSignal;
    global.window = { supabase: { createClient: (url, key, config) => { options = config.global; return {}; } } };
    global.fetch = async (url, config) => { observedSignal = config.signal; return new Response('{}'); };
    try {
        const module = readFileSync('public/js/modules/supabase.js', 'utf8');
        await import('data:text/javascript;base64,' + Buffer.from(module).toString('base64'));
        await options.fetch('https://example.test');
        assert(observedSignal instanceof AbortSignal);
        assert.equal(observedSignal.aborted, false);
        const controller = new AbortController();
        controller.abort();
        await options.fetch('https://example.test', { signal: controller.signal });
        assert.equal(observedSignal.aborted, true);
    } finally {
        global.fetch = previousFetch;
        delete global.window;
    }
});

test('Spotify parser accepts official content and rejects untrusted or malformed links', async () => {
    const { spotifyEmbedUrl } = await load();
    const id = '4uLU6hMCjMI75M1A2tKUQC';
    for (const kind of ['track', 'album', 'playlist', 'artist', 'episode', 'show']) {
        for (const prefix of ['', 'embed/', 'intl-en/']) {
            assert.equal(spotifyEmbedUrl('https://open.spotify.com/' + prefix + kind + '/' + id + '?si=test'), 'https://open.spotify.com/embed/' + kind + '/' + id + '?theme=0');
        }
    }
    for (const url of ['', 'javascript:alert(1)', 'https://open.spotify.com.attacker.example/track/' + id, 'https://attacker.example/track/' + id, 'https://open.spotify.com/user/' + id, 'https://open.spotify.com/track/short', 'https://open.spotify.com/track/' + id + '/extra']) assert.equal(spotifyEmbedUrl(url), null, url);
});
