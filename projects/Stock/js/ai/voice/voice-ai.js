// Voice through an AI the user added, over the OpenAI audio API most voice servers speak:
// POST /audio/speech turns text into audio, POST /audio/transcriptions turns audio into text.
// Listening: Silero VAD (@ricky0123/vad-web) cuts the microphone into sentences and hands each one over as WAV.
// Speaking: each sentence is fetched as audio and queued on one Web Audio timeline, so they play back to back.
// Same interfaces as the browser engines of voice.js, so the call code does not care which one runs.
import { bearerHeaders, readModelError, ModelError, aiFetch } from '../ai-core.js';
import { L } from '../../i18n/i18n.js';
import { speakable } from './voice.js';

const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const VAD = 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.31/dist/';
// What transcription models write on silence or noise, never something the user said.
const NOT_SPEECH = /^\W*(sous-titr|merci d'avoir regard|thanks? (you )?for watching|subtitles by|\[?(music|musique|silence|bruit|noise)\]?\W*$)/i;

export const canRecord = () => typeof window !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia && !!window.AudioContext && typeof WebAssembly === 'object';

const script = src => new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src, crossOrigin: 'anonymous', onload: resolve });
    s.onerror = () => { s.remove(); reject(new Error(L('Could not load {0}.', src))); };
    document.head.append(s);
});
let vadLib = null;
const loadVad = () => (vadLib ||= script(`${ORT}ort.wasm.min.js`)
    .then(() => script(`${VAD}bundle.min.js`))
    .then(() => window.vad)
    .catch(e => { vadLib = null; throw e; }));

/** One readable error for anything a voice request can throw. */
function voiceError(conn, error) {
    if (error instanceof ModelError) return error;
    if (error?.name === 'TimeoutError') return new ModelError(L('{0} did not respond in time.', conn.where), 'offline');
    if (error instanceof TypeError) {
        return new ModelError(L('{0}: connection failed. If this AI runs on this computer, allow origin {1} in its CORS settings.', conn.where, location.origin), 'offline');
    }
    return new ModelError(`${conn.where}: ${error?.message || String(error)}`, 'offline');
}

/** Audio for one sentence from the AI's /audio/speech. */
const remoteSpeech = conn => async (text, signal) => {
    const body = { model: conn.model, input: text, response_format: 'mp3', ...(conn.voice && { voice: conn.voice }) };
    const r = await aiFetch(`${conn.base}/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearerHeaders(conn.key) },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    });
    if (!r.ok) throw await readModelError(r);
    return r.arrayBuffer();
};

/**
 * Speaks sentence by sentence: audio is fetched one sentence at a time, in order, while earlier ones play.
 * onLevel(0..1): the loudness of what is playing, every frame, for the orb. onError(error) stops everything.
 * audioFor(text, signal) → encoded audio; by default the AI's /audio/speech (voice-local.js passes its own).
 */
export function createAiSpeaker(conn, { onStart, onEnd, onError, onLevel } = {}, audioFor = remoteSpeech(conn)) {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.connect(ctx.destination);
    const wave = new Float32Array(analyser.fftSize);
    let controller = new AbortController();
    let fetched = Promise.resolve();   // fetches run one after the other
    let played = Promise.resolve();    // sentences are queued in order
    let at = 0, pending = 0, generation = 0, talking = false, raf = 0, waiting = [];
    const sources = new Set();

    const meter = () => {
        analyser.getFloatTimeDomainData(wave);
        let e = 0;
        for (const x of wave) e += x * x;
        onLevel?.(Math.min(1, Math.sqrt(e / wave.length) * 4.5));
        raf = requestAnimationFrame(meter);
    };
    const settle = () => {
        if (pending > 0) return;
        if (talking) { talking = false; cancelAnimationFrame(raf); onLevel?.(0); onEnd?.(); }
        const w = waiting;
        waiting = [];
        w.forEach(fn => fn());
    };
    const fetchAudio = async (text, signal) => ctx.decodeAudioData(await audioFor(text, signal));
    const api = {
        say(text, opts) {
            const t = speakable(text, conn.lang);
            if (!t) return;
            const gen = generation;
            const { signal } = controller;
            const done = () => { if (gen === generation) { pending--; settle(); } };
            pending++;
            const audio = fetched = fetched.catch(() => {}).then(() => (gen === generation ? fetchAudio(t, signal) : null));
            played = played.then(async () => {
                const buffer = await audio;
                if (gen !== generation) return;
                await ctx.resume();
                const src = ctx.createBufferSource();
                src.buffer = buffer;
                src.connect(analyser);
                at = Math.max(at, ctx.currentTime);
                src.start(at);
                at += buffer.duration;
                sources.add(src);
                src.onended = () => { sources.delete(src); done(); };
                if (!talking) { talking = true; meter(); onStart?.(); }
                opts?.onStart?.();
            }).catch(error => {
                if (gen !== generation) return;
                api.cancel();
                onError?.(voiceError(conn, error));
            });
        },
        get speaking() { return pending > 0; },
        done() { return pending > 0 ? new Promise(resolve => waiting.push(resolve)) : Promise.resolve(); },
        cancel() {
            generation++;
            for (const src of sources) { src.onended = null; try { src.stop(); } catch { /* already stopped */ } }
            sources.clear();
            controller.abort();
            controller = new AbortController();
            fetched = played = Promise.resolve();
            at = 0;
            pending = 0;
            settle();
        },
        dispose() {
            api.cancel();
            if (ctx.state !== 'closed') ctx.close().catch(() => {});
        },
    };
    return api;
}

/** Text for one sentence (16 kHz samples) from the AI's /audio/transcriptions. */
const remoteTranscriber = (conn, lang, prompt) => async samples => {
    const form = new FormData();
    form.append('file', new Blob([window.vad.utils.encodeWAV(samples)], { type: 'audio/wav' }), 'speech.wav');
    if (conn.model) form.append('model', conn.model);
    form.append('language', String(lang || '').slice(0, 2));
    if (prompt) form.append('prompt', prompt);
    const r = await aiFetch(`${conn.base}/audio/transcriptions`, { method: 'POST', headers: bearerHeaders(conn.key), body: form, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw await readModelError(r);
    const raw = await r.text();
    try { return JSON.parse(raw).text ?? ''; } catch { return raw; }
};

/**
 * Listens with the microphone; each sentence the VAD hears is written down, by the AI by default.
 * Same shape as createListener in voice.js: start(), stop(), hold(), flush(), onFinal(text), onError(code, detail).
 * prompt: vocabulary the model should spell right (see lexicon.js). toText(samples) replaces the AI (voice-local.js).
 */
export function createAiListener(conn, { lang, prompt = '', onFinal, onError, toText = remoteTranscriber(conn, lang, prompt) }) {
    let vad = null, on = false, held = false, dropSegment = false;
    let chain = Promise.resolve();
    const fail = (code, detail) => {
        if (!on) return;
        on = false;
        vad?.destroy();
        vad = null;
        onError?.(code, detail);
    };
    const transcribe = async samples => {
        try {
            const text = String(await toText(samples) || '').trim();
            if (on && text.length > 1 && !NOT_SPEECH.test(text)) onFinal?.(text);
        } catch (e) {
            fail('ai', voiceError(conn, e).message);
        }
    };
    return {
        async start() {
            if (on) return;
            on = true;
            let lib;
            try { lib = await loadVad(); } catch (e) { fail('ai', e.message); return; }
            try {
                const instance = await lib.MicVAD.new({
                    model: 'v5',
                    baseAssetPath: VAD,
                    onnxWASMBasePath: ORT,
                    redemptionMs: 900,
                    getStream: () => navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
                    // A sentence begun while the assistant was speaking is its own voice: never written down.
                    onSpeechStart: () => { dropSegment = held; },
                    onSpeechEnd: audio => {
                        if (on && !held && !dropSegment) chain = chain.then(() => transcribe(audio));
                        dropSegment = false;
                    },
                });
                if (!on) { instance.destroy(); return; }
                vad = instance;
            } catch (e) {
                fail(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'not-allowed' : 'audio-capture', e?.message || String(e));
            }
        },
        stop() {
            on = false;
            vad?.destroy();
            vad = null;
        },
        /** While the assistant speaks: nothing heard then is transcribed. */
        hold(value) {
            held = !!value;
            if (held) dropSegment = true;
        },
        flush() { dropSegment = true; },
    };
}
