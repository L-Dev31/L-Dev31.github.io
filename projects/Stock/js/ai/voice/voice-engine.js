// Which engine speaks and listens in each language: the browser by default, the user's own AI when it is
// switched on in Settings › AI › Voice. A failed engine disables voice mode until it passes a test again.
// Whatever the engine, what it hears is corrected with the finance vocabulary of lexicon.js.
import { resolveVoice } from '../ai-core.js';
import { L, LANG, LANGS } from '../../i18n/i18n.js';
import { positions } from '../../core/state.js';
import { canListen, canSpeak, createSpeaker, createListener } from './voice.js';
import { canRecord, createAiSpeaker, createAiListener } from './voice-ai.js';
import { buildLexicon, correctTranscript, bestAlternative, hintPhrases, recognitionPrompt } from './lexicon.js';

/** The BCP 47 tag browser engines expect for an app language. */
export const speechTag = lang => (lang === 'fr' ? 'fr-FR' : 'en-US');

const aiListens = lang => !!resolveVoice('stt', lang) && canRecord();
export const VOICE_HEALTH_EVENT = 'nemeris:voice-health';
const health = new Map();

function engineFor(kind, lang) {
    const conn = resolveVoice(kind, lang);
    if (conn && (kind !== 'stt' || canRecord())) return { type: 'ai', conn };
    if (kind === 'tts' ? canSpeak() : canListen()) return { type: 'browser', conn: null };
    return { type: 'none', conn: null };
}

const healthKey = (kind, lang, engine) => `${kind}|${lang}|${engine.type}|${engine.conn?.base || ''}|${engine.conn?.model || ''}`;
const conciseFailure = (kind, error) => {
    const message = String(error?.message || error || '').toLowerCase();
    if (/cors|failed to fetch|connexion impossible|networkerror/.test(message)) return L('CORS blocked or server unreachable.');
    if (/415|unsupported media/.test(message)) return L('Audio format rejected.');
    if (/timeout|timed out|ne répond pas à temps/.test(message)) return L('Speech server did not respond.');
    if (/network|service-not-allowed/.test(message)) return L('Speech service unreachable.');
    if (/not-allowed|not allowed|permission|micro refusé/.test(message)) return L('Microphone permission denied.');
    if (/audio-capture|micro introuvable/.test(message)) return L('No microphone found.');
    return kind === 'tts' ? L('Speech synthesis failed.') : L('Speech recognition failed.');
};

function setHealth(kind, lang, engine, ok, error = '') {
    const key = healthKey(kind, lang, engine);
    health.set(key, ok ? { state: 'ready', message: L('Available.') } : { state: 'failed', message: conciseFailure(kind, error), detail: String(error?.message || error || '') });
    window.dispatchEvent(new CustomEvent(VOICE_HEALTH_EVENT, { detail: { kind, lang } }));
}

/** Forget past failures so the next manual start re-probes the engines instead of
 *  staying disabled until a page reload. Truly missing hardware still reports unavailable. */
export function resetVoiceHealth(kind = null, lang = null) {
    for (const key of [...health.keys()]) {
        const [k, l] = key.split('|');
        if ((kind === null || k === kind) && (lang === null || l === lang)) health.delete(key);
    }
    window.dispatchEvent(new CustomEvent(VOICE_HEALTH_EVENT, { detail: { kind, lang } }));
}

export function voiceStatus(kind, lang = LANG) {
    const engine = engineFor(kind, lang);
    if (engine.type === 'none') return { kind, engine: 'none', state: 'unavailable', message: kind === 'tts' ? L('Speech synthesis unavailable.') : L('Speech recognition unavailable.') };
    const result = health.get(healthKey(kind, lang, engine));
    if (result?.state === 'failed') return { kind, engine: engine.type, state: 'failed', message: result.message, detail: result.detail };
    if (result?.state === 'ready') return { kind, engine: engine.type, state: 'ready', message: result.message };
    return { kind, engine: engine.type, state: engine.type === 'ai' ? 'untested' : 'ready', message: engine.type === 'ai' ? L('Not tested.') : L('Available.') };
}

export function voiceAvailability(lang = LANG) {
    const tts = voiceStatus('tts', lang);
    const stt = voiceStatus('stt', lang);
    const unavailable = s => s.state === 'unavailable' || s.state === 'failed';
    const ttsLangs = Object.keys(LANGS).map(code => ({ lang: code, status: voiceStatus('tts', code) }));
    const ttsIssues = ttsLangs.filter(x => unavailable(x.status));
    const ok = !ttsIssues.length && !unavailable(stt);
    const issues = [];
    for (const issue of ttsIssues) issues.push(`${L('Speech synthesis {0}', issue.lang.toUpperCase())} : ${issue.status.message}`);
    if (unavailable(stt)) issues.push(`${L('Speech recognition')} : ${stt.message}`);
    return { ok, tts, ttsLangs, stt, message: ok ? L('Voice mode available.') : L('Voice mode disabled: {0}', issues.join(' ')) };
}

/** Voice mode needs a working way to listen and to speak, using the selected AI or browser. */
export const canCall = lang => voiceAvailability(lang).ok;

/** The user's stocks and watchlist as recognition vocabulary. */
export function financeLexicon() {
    return buildLexicon(Object.entries(positions || {}).map(([symbol, p]) => ({ symbol, ticker: p?.ticker, name: p?.name || p?.raw?.name })));
}

/**
 * Speaker for a call. setLang(lang) picks the voice of the language the answer is in.
 * handlers: { onStart, onEnd, onLevel(0..1) for the orb, onNotice(message) }.
 */
export function createCallSpeaker(lang, { onStart, onEnd, onLevel, onNotice } = {}) {
    const browser = {};
    let current = lang, ai = null, aiLang = null;
    const browserFor = l => (browser[l] ||= canSpeak() ? createSpeaker(speechTag(l), {
        onStart: () => { setHealth('tts', l, { type: 'browser' }, true); onStart?.(); },
        onEnd,
        onLevel,
        onError: error => {
            setHealth('tts', l, { type: 'browser' }, false, error);
            onNotice?.(L('The browser\'s speech synthesis failed. ({0})', error.message || String(error)));
        },
    }) : null);
    const engine = () => {
        const conn = resolveVoice('tts', current);
        if (!conn) return browserFor(current);
        if (aiLang !== current) {
            ai?.dispose();
            const forLang = current;
            ai = createAiSpeaker(conn, {
                onStart: () => { setHealth('tts', forLang, { type: 'ai', conn }, true); onStart?.(); },
                onEnd,
                onLevel,
                onError: (e, unsaid) => {
                    setHealth('tts', forLang, { type: 'ai', conn }, false, e);
                    onNotice?.(L('AI speech failed. ({0})', e.message));
                },
            });
            aiLang = current;
        }
        return ai;
    };
    const all = () => [ai, ...Object.values(browser)].filter(Boolean);
    return {
        setLang(l) { if (l) current = l; },
        say(text, opts) { engine()?.say(text, opts); },
        get speaking() { return all().some(s => s.speaking); },
        done() { return Promise.all(all().map(s => s.done())); },
        cancel() { for (const s of all()) s.cancel(); },
        dispose() { for (const s of all()) (s.dispose || s.cancel).call(s); ai = null; aiLang = null; },
    };
}

/**
 * Listener for a call, in one language. handlers: { onInterim, onFinal, onError(code, detail), onNotice(message) }.
 * The browser engine gets the vocabulary as hints and five guesses per sentence; the AI engine gets it as a prompt.
 */
export function createCallListener(lang, { onInterim, onFinal, onError, onNotice } = {}) {
    const lex = financeLexicon();
    const fix = t => correctTranscript(t, lex).text;
    const fromBrowser = () => createListener({
        lang: speechTag(lang),
        pick: alternatives => bestAlternative(alternatives, lex),
        phrases: hintPhrases(lex),
        onInterim: t => onInterim?.(fix(t)),
        onFinal: t => { setHealth('stt', lang, { type: 'browser' }, true); onFinal?.(fix(t)); },
        onError: (code, detail) => { setHealth('stt', lang, { type: 'browser' }, false, detail || code); onError?.(code, detail); },
    });
    const conn = aiListens(lang) ? resolveVoice('stt', lang) : null;
    let inner = conn ? createAiListener(conn, {
        lang,
        prompt: recognitionPrompt(lex, lang),
        onFinal: t => { setHealth('stt', lang, { type: 'ai', conn }, true); onFinal?.(fix(t)); },
        onError: (code, detail) => { setHealth('stt', lang, { type: 'ai', conn }, false, detail || code); onError?.(code, detail); },
    }) : fromBrowser();
    return {
        start: () => inner.start(),
        stop: () => inner.stop(),
        /** While the assistant speaks: its voice in the microphone is never taken for the user's. */
        hold: value => inner.hold(value),
        flush: () => inner.flush(),
    };
}

/** Runs a short microphone test through the recognition engine currently selected in Settings. */
export function testVoiceRecognition(lang = LANG, timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer = 0;
        let listener;
        const finish = (error, text) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            listener?.stop();
            if (error) reject(error instanceof Error ? error : new Error(String(error)));
            else resolve(text);
        };
        listener = createCallListener(lang, {
            onFinal: text => finish(null, text),
            onError: (code, detail) => finish(new Error(detail || code)),
        });
        timer = setTimeout(() => finish(new Error(L('No speech detected. Try again.'))), timeoutMs);
        try {
            Promise.resolve(listener.start()).catch(error => finish(error));
        } catch (error) { finish(error); }
    });
}

const SAMPLE = { fr: 'Bonjour, je suis Nemeris. Je lirai mes réponses avec cette voix.', en: 'Hi, I am Nemeris. I will read my answers with this voice.' };
let previewing = null;
/** Says a short sentence with the voice set for this language. Resolves when said, rejects with the AI's error. */
export function previewVoice(lang) {
    if (previewing) (previewing.dispose || previewing.cancel).call(previewing);
    return new Promise((resolve, reject) => {
        const conn = resolveVoice('tts', lang);
        if (!conn && !canSpeak()) { reject(new Error(L('This browser has no voice.'))); return; }
        previewing = conn ? createAiSpeaker(conn, {
            onStart: () => setHealth('tts', lang, { type: 'ai', conn }, true),
            onEnd: resolve,
            onError: error => { setHealth('tts', lang, { type: 'ai', conn }, false, error); reject(error); },
        }) : createSpeaker(speechTag(lang), {
            onStart: () => setHealth('tts', lang, { type: 'browser' }, true),
            onEnd: resolve,
            onError: error => { setHealth('tts', lang, { type: 'browser' }, false, error); reject(error); },
        });
        previewing.say(SAMPLE[lang] || SAMPLE.en);
    });
}
