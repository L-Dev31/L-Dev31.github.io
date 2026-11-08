// Voice that runs inside the browser, for browsers without their own: Firefox has no speech recognition, Brave and
// plain Chromium cannot reach Google's, and some systems have no voice installed.
// Listening: Whisper (transformers.js) writes down each sentence the microphone VAD cuts out.
// Speaking: Piper (vits-web) turns each sentence into audio.
// Both are free and open source. Their models download once on first use (about 40 MB to listen, 60 MB per voice)
// and the browser keeps them; nothing said ever leaves the computer.
import { L } from '../../i18n/i18n.js';
import { createAiSpeaker, createAiListener, canRecord } from './voice-ai.js';

const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';
const VITS = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm';
const WHISPER = 'Xenova/whisper-tiny';
const WHISPER_LANGUAGE = { fr: 'french', en: 'english' };
const PIPER_VOICE = { fr: 'fr_FR-siwis-medium', en: 'en_US-hfc_female-medium' };

export const canRunLocally = canRecord;
const local = lang => ({ lang, where: L('The built-in voice') });

let whisper = null;
const recognizer = () => (whisper ||= import(TRANSFORMERS)
    .then(t => t.pipeline('automatic-speech-recognition', WHISPER))
    .catch(e => { whisper = null; throw e; }));

let piper = null;
const synthesizer = () => (piper ||= import(VITS).catch(e => { piper = null; throw e; }));

/** Same interface as the browser speaker of voice.js. */
export function createLocalSpeaker(lang, handlers) {
    const voiceId = PIPER_VOICE[lang] || PIPER_VOICE.en;
    return createAiSpeaker(local(lang), handlers, async text => {
        const wav = await (await synthesizer()).predict({ text, voiceId });
        return wav.arrayBuffer();
    });
}

/** Same interface as the browser listener of voice.js. */
export function createLocalListener(lang, { onFinal, onError }) {
    const language = WHISPER_LANGUAGE[lang] || 'english';
    return createAiListener(local(lang), {
        lang, onFinal, onError,
        toText: async samples => (await (await recognizer())(samples, { language, task: 'transcribe' })).text,
    });
}
