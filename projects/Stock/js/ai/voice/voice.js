// Voice for the assistant with the browser's own engines (Web Speech API): no library, no server of ours.
// Listening goes through the browser's recognition service (Google in Chrome, Microsoft in Edge, Apple in Safari).
// Speaking uses the voices of the system or the browser.
import { L } from '../../i18n/i18n.js';
import { openMic, chosenDevice } from './devices.js';

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const canListen = () => !!Recognition;
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

/** Reads the live mic level for the voice orb; speech audio stays in the browser. */
export async function watchMicrophoneLevel(onLevel) {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return () => {};
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return () => {};
    let stream;
    let context;
    let frame = 0;
    let stopped = false;
    const stop = () => {
        stopped = true;
        cancelAnimationFrame(frame);
        stream?.getTracks().forEach(track => track.stop());
        if (context && context.state !== 'closed') context.close().catch(() => {});
    };

    try {
        context = new AudioContext();
        stream = await openMic({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
        if (stopped) {
            stream.getTracks().forEach(track => track.stop());
            return stop;
        }
        if (context.state === 'suspended') await context.resume();
        if (stopped) {
            stream.getTracks().forEach(track => track.stop());
            return stop;
        }
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.72;
        source.connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        let level = 0;
        const sample = () => {
            if (stopped) return;
            analyser.getFloatTimeDomainData(samples);
            let energy = 0;
            for (const value of samples) energy += value * value;
            const rms = Math.sqrt(energy / samples.length);
            const target = Math.max(0, Math.min(0.75, (rms - 0.008) * 6));
            level += (target > level ? 0.28 : 0.12) * (target - level);
            onLevel?.(level);
            frame = requestAnimationFrame(sample);
        };
        sample();
        return stop;
    } catch {
        stream?.getTracks().forEach(track => track.stop());
        return stop;
    }
}

/** French TTS reads "Nemeris" as "Né-meu-ri" (silent s). This respelling makes it say "Né-mé-riss". */
const frSpoken = text => text
    .replace(/n[ée]meris/gi, m => (m[0] === 'N' ? 'Némériss' : 'némériss'))
    // "13h40" is read letter by letter ("treize H quarante") instead of "treize heures quarante".
    .replace(/\b(\d{1,2})\s*[Hh]\s*(\d{2})\b/g, (_, h, m) => (m === '00' ? `${h} heures` : `${h} heures ${m}`))
    .replace(/\b(\d{1,2})\s*[Hh]\b/g, (_, h) => `${h} heures`)
    // All-caps acronyms get spelled out letter by letter ("C-A-C"); only the case changes here, so mixed-case
    // "Cac" is read as the word "kak" instead, the way the CAC 40 index is actually said.
    .replace(/\bCAC([\s-]?40)\b/g, 'Cac$1');

/** Text made for the ear: no markdown marks, links, tables or list signs read aloud. */
export function speakable(text, lang) {
    const raw = lang?.toLowerCase().startsWith('fr') ? frSpoken(String(text || '')) : String(text || '');
    return raw
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
        .replace(/https?:\/\/\S+/g, '')
        .split('\n')
        .map(line => line
            .replace(/^\s*\|.*\|\s*$/, '')
            .replace(/^\s*#{1,6}\s+/, '')
            .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
            .replace(/[*_`#>|]/g, '')
            .trim())
        .filter(Boolean)
        .map(line => (/[.!?…:;,]$/.test(line) ? line : `${line}.`))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Speaks text sentence by sentence. done() resolves once everything queued has been said.
 * onLevel(0..1): a pulse on each spoken word, for the orb (browser voices give no audio to measure).
 */
export function createSpeaker(lang, { onStart, onEnd, onError, onLevel } = {}) {
    const synth = window.speechSynthesis;
    let voice = null;
    const pick = () => {
        const all = synth.getVoices();
        const same = all.filter(v => (v.lang || '').replace('_', '-').toLowerCase() === lang.toLowerCase());
        const near = all.filter(v => (v.lang || '').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
        voice = same.find(v => /natural|neural|online|premium|enhanced/i.test(v.name)) || same[0] || near[0] || null;
    };
    pick();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', pick);
    let pending = 0;
    let active = false;
    let generation = 0;
    let startTimer = 0;
    let waiting = [];
    const settle = () => {
        if (pending) return;
        if (active) { active = false; onEnd?.(); }
        const w = waiting;
        waiting = [];
        w.forEach(fn => fn());
    };
    return {
        say(text, opts) {
            const t = speakable(text, lang);
            if (!t) return;
            pick();
            const token = generation;
            const u = new window.SpeechSynthesisUtterance(t);
            u.lang = lang;
            try { if (voice) u.voice = voice; } catch { /* keep the default voice */ }
            u.rate = 1;
            const firstPending = pending === 0;
            let started = false;
            pending++;
            active = true;
            u.onstart = () => {
                if (token !== generation) return;
                started = true;
                clearTimeout(startTimer);
                startTimer = 0;
                opts?.onStart?.();
                onStart?.();
            };
            u.onboundary = e => { if (token === generation && (!e.name || e.name === 'word')) onLevel?.(0.5 + Math.random() * 0.4); };
            u.onend = () => {
                if (token !== generation) return;
                clearTimeout(startTimer);
                startTimer = 0;
                pending = Math.max(0, pending - 1);
                settle();
            };
            u.onerror = e => {
                if (token !== generation) return;
                clearTimeout(startTimer);
                startTimer = 0;
                pending = Math.max(0, pending - 1);
                onError?.(new Error(e.error || L('Speech synthesis is unavailable.')));
                settle();
            };
            try {
                if (synth.paused) synth.resume();
                synth.speak(u);
                if (firstPending && !started) startTimer = setTimeout(() => {
                    if (token !== generation || !pending) return;
                    generation++;
                    pending = 0;
                    startTimer = 0;
                    synth.cancel();
                    onError?.(new Error(L('The browser did not start speech.')));
                    settle();
                }, 15000);
            } catch (e) {
                clearTimeout(startTimer);
                startTimer = 0;
                pending = Math.max(0, pending - 1);
                onError?.(e);
                settle();
            }
        },
        get speaking() { return pending > 0; },
        done() { return pending ? new Promise(resolve => waiting.push(resolve)) : Promise.resolve(); },
        cancel() { generation++; clearTimeout(startTimer); startTimer = 0; pending = 0; synth.cancel(); settle(); },
    };
}

/** Feeds complete sentences to speech as soon as their natural boundary arrives. */
export function sentenceFeeder(say) {
    let text = '';
    let spoken = 0;
    const upTo = end => {
        const part = text.slice(spoken, end);
        spoken = end;
        if (part.trim()) say(part);
    };
    const nextSentenceEnd = () => {
        const rest = text.slice(spoken);
        const boundary = /[.!?…](?=\s)|\n/.exec(rest);
        return boundary ? spoken + boundary.index + boundary[0].length : null;
    };
    const flushReady = () => {
        for (let end = nextSentenceEnd(); end !== null; end = nextSentenceEnd()) upTo(end);
    };
    return {
        feed(full) {
            if (!full.startsWith(text.slice(0, spoken))) return;
            text = full;
            flushReady();
        },
        end(full) {
            if (typeof full === 'string' && full.startsWith(text.slice(0, spoken))) text = full;
            upTo(text.length);
        },
    };
}

/**
 * Listens until the user stops talking, then hands over what they said.
 * onFinal(text) fires after a short silence; errors that end the call go to onError(code).
 * hold(true) while the assistant speaks: what is heard still reaches onInterim (to spot the user cutting in)
 * but is never handed over as said; flush() forgets what was heard so far (the assistant's own voice).
 * pick(alternatives) chooses among the engine's guesses for a sentence (default: its first).
 * phrases: [{ phrase, boost }] words to favour, for engines that support contextual biasing.
 */
export function createListener({ lang, onInterim, onFinal, onError, silenceMs = 1100, pick = null, phrases = null }) {
    const rec = new Recognition();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = pick ? 5 : 1;
    // Engines that cannot bias (most online ones) report "phrases-not-supported": listen on without hints.
    if (phrases?.length && 'phrases' in rec && typeof window.SpeechRecognitionPhrase === 'function') {
        try { rec.phrases = phrases.map(p => new window.SpeechRecognitionPhrase(p.phrase, p.boost)); } catch { /* not supported here */ }
    }
    const best = r => (pick ? pick([...r].map(a => a.transcript)) : r[0].transcript);
    let on = false;
    let held = false;
    let heard = '';
    let interim = '';
    let timer = 0;
    // A microphone other than the default: recognition listens to its track where the browser allows it
    // (start(track)); engines that do not know that argument ignore it and use the default microphone.
    let mic = null;
    const begin = () => {
        const track = mic?.getAudioTracks()[0];
        if (track?.readyState === 'live') rec.start(track);
        else rec.start();
    };
    const finish = () => {
        const t = heard.trim();
        if (!on || held || !t || interim.trim()) return;
        heard = '';
        onFinal?.(t);
    };
    rec.onresult = e => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) heard += `${best(r)} `;
            else interim += r[0].transcript;
        }
        onInterim?.(`${heard}${interim}`.trim());
        clearTimeout(timer);
        timer = setTimeout(finish, silenceMs);
    };
    rec.onerror = e => {
        // abort() can deliver a late error after the user has closed voice mode.
        // It must not turn an intentional stop into a failed engine status.
        if (!on) return;
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        if (e.error === 'phrases-not-supported') { try { rec.phrases = []; } catch { /* keep going */ } return; }
        on = false;
        onError?.(e.error || 'error');
    };
    rec.onend = () => {
        if (!on) return;
        try { begin(); }
        catch (e) {
            on = false;
            onError?.('service-not-allowed', e.message);
        }
    };
    return {
        async start() {
            heard = '';
            interim = '';
            on = true;
            if (chosenDevice('input') && !mic) {
                const opened = await openMic().catch(() => null);
                if (!on) { opened?.getTracks().forEach(t => t.stop()); return; }
                mic = opened;
            }
            try { begin(); }
            catch (e) {
                on = false;
                onError?.(e.name === 'NotAllowedError' ? 'not-allowed' : 'service-not-allowed', e.message);
            }
        },
        stop() {
            on = false;
            clearTimeout(timer);
            try { rec.abort(); } catch { /* not running */ }
            mic?.getTracks().forEach(t => t.stop());
            mic = null;
        },
        /** Another microphone was chosen while listening: reopen, and let the end of the old session begin the new one. */
        async restart() {
            if (!on) return;
            mic?.getTracks().forEach(t => t.stop());
            mic = null;
            const opened = chosenDevice('input') ? await openMic().catch(() => null) : null;
            if (!on) { opened?.getTracks().forEach(t => t.stop()); return; }
            mic = opened;
            try { rec.abort(); } catch { /* not running */ }
        },
        hold(value) { held = !!value; },
        flush() {
            heard = '';
            interim = '';
            clearTimeout(timer);
        },
    };
}
