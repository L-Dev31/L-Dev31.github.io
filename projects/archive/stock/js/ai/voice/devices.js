// The microphone and the speaker voice mode uses (Settings › AI › Voice, or the call bar). Empty means the system's.
// Every microphone opened by voice mode goes through openMic; every audio output through playOn.
// The browser's own voice (speechSynthesis) cannot be routed: it always plays on the system output.
const KEY = 'nemeris_audio_devices';
export const AUDIO_DEVICES_EVENT = 'nemeris:audio-devices';

let chosen = {};
try { chosen = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* nothing saved */ }
const playing = new Set();

/** 'input' or 'output': the chosen device id, '' for the system default. */
export const chosenDevice = kind => chosen[kind] || '';

export function chooseDevice(kind, id) {
    chosen = { ...chosen, [kind]: id || '' };
    try { localStorage.setItem(KEY, JSON.stringify(chosen)); } catch { /* storage full */ }
    if (kind === 'output') for (const ctx of playing) route(ctx);
    window.dispatchEvent(new CustomEvent(AUDIO_DEVICES_EVENT, { detail: { kind } }));
}

/** The chosen microphone, or the default one when none is chosen or it was unplugged. */
export async function openMic(constraints = {}) {
    const open = id => navigator.mediaDevices.getUserMedia({ audio: { ...constraints, ...(id && { deviceId: { exact: id } }) } });
    if (!chosen.input) return open();
    try { return await open(chosen.input); }
    catch (e) {
        if (e.name === 'OverconstrainedError' || e.name === 'NotFoundError') return open();
        throw e;
    }
}

export const canChooseOutput = () => typeof AudioContext === 'function' && 'setSinkId' in AudioContext.prototype;

const route = ctx => {
    if (canChooseOutput() && ctx.state !== 'closed') ctx.setSinkId(chosen.output || '').catch(() => {});
};

/** Sends an AudioContext to the chosen speaker, now and whenever the choice changes, until it closes. */
export function playOn(ctx) {
    route(ctx);
    playing.add(ctx);
    ctx.addEventListener('statechange', () => { if (ctx.state === 'closed') playing.delete(ctx); });
    return ctx;
}

/** Microphones and speakers. Names stay empty until the site may use the microphone: named = false then. */
export async function listDevices() {
    const all = (await navigator.mediaDevices?.enumerateDevices?.()) || [];
    // 'default' and 'communications' are aliases of a real device: the "System default" choice covers them.
    const real = kind => all.filter(d => d.kind === kind && d.deviceId && !['default', 'communications'].includes(d.deviceId));
    const input = real('audioinput');
    return { input, output: canChooseOutput() ? real('audiooutput') : [], named: input.some(d => d.label) };
}

/** Asks for the microphone once, so the device names can be shown. */
export async function revealDeviceNames() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
}
