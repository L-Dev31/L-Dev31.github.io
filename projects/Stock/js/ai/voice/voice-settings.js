// Settings › AI › Voice: the browser speaks and listens by default; with AI switched on, one model per language.
import { registerAiSettingsSection, getAiSettings, setVoiceAi, setVoiceLang, voiceModelOptions } from '../ai-core.js';
import { L, LANG, LANGS } from '../../i18n/i18n.js';
import { el } from '../../core/utils.js';
import { previewVoice, testVoiceRecognition, voiceStatus, VOICE_HEALTH_EVENT } from './voice-engine.js';
import { listDevices, chosenDevice, chooseDevice, canChooseOutput, revealDeviceNames } from './devices.js';

const TITLE = { tts: L('AI speech'), stt: L('AI speech recognition') };

function modelSelect(kind, lang, name, saved) {
    const sel = el('select');
    sel.setAttribute('aria-label', L('Voice model: {0}', name));
    sel.dataset.keep = `voice-${kind}-${lang}`;
    sel.append(new Option(L('Browser'), ''));
    for (const g of voiceModelOptions(kind, lang)) {
        const og = el('optgroup');
        og.label = g.label;
        for (const o of g.options) og.append(new Option(o.text, o.ref));
        sel.append(og);
    }
    sel.value = saved.ref || '';
    sel.addEventListener('change', () => { setVoiceLang(kind, lang, { ref: sel.value }); sel.blur(); });
    return sel;
}

const isVoiceIssue = status => status.state === 'failed' || status.state === 'unavailable';

function updateLanguageIssue(note, kind, lang) {
    const status = voiceStatus(kind, lang);
    note.hidden = !isVoiceIssue(status);
    note.textContent = note.hidden ? '' : status.message;
}

function updateDisabledKindIssue(note, kind) {
    const langs = kind === 'tts' ? Object.keys(LANGS) : [LANG];
    const issues = langs.map(lang => ({ lang, status: voiceStatus(kind, lang) })).filter(x => isVoiceIssue(x.status));
    note.hidden = !issues.length;
    note.textContent = issues.map(x => kind === 'tts' ? `${x.lang.toUpperCase()} : ${x.status.message}` : x.status.message).join(' · ');
}

window.addEventListener(VOICE_HEALTH_EVENT, event => {
    const { kind, lang } = event.detail || {};
    const languageNote = document.querySelector(`[data-voice-issue="${kind}-${lang}"]`);
    if (languageNote) updateLanguageIssue(languageNote, kind, lang);
    const disabledNote = document.querySelector(`[data-voice-off-issue="${kind}"]`);
    if (disabledNote) updateDisabledKindIssue(disabledNote, kind);
});

function langRow(kind, lang, name) {
    const saved = getAiSettings().voice[kind].langs[lang] || {};
    const row = el('div', 'ais-task');
    const controls = el('div', 'voice-controls');
    controls.append(modelSelect(kind, lang, name, saved));
    row.append(el('strong', null, name), controls);
    const issue = el('p', 'ais-task-error');
    issue.dataset.voiceIssue = `${kind}-${lang}`;
    updateLanguageIssue(issue, kind, lang);
    row.append(issue);
    if (kind === 'tts') {
        // The voice name only matters for an AI model; with the browser the field keeps its place, so rows line up.
        const voice = el('input');
        voice.type = 'text';
        voice.maxLength = 80;
        voice.value = saved.voice || '';
        voice.placeholder = L('Voice, if the model needs one');
        voice.setAttribute('aria-label', L('Voice: {0}', name));
        voice.dataset.keep = `voice-name-${lang}`;
        voice.addEventListener('change', () => setVoiceLang(kind, lang, { voice: voice.value.trim() }));
        controls.append(voice);
    }
    const test = el('button', 'btn btn-quiet', L('Test'));
    test.type = 'button';
    test.addEventListener('click', async () => {
        test.disabled = true;
        issue.hidden = false;
        issue.textContent = kind === 'stt' ? L('Speak, then pause.') : L('Testing…');
        try {
            if (kind === 'tts') await previewVoice(lang);
            else await testVoiceRecognition(lang);
            issue.textContent = kind === 'stt' ? L('Speech recognition passed.') : L('Test passed.');
        } catch (error) {
            const status = voiceStatus(kind, lang);
            issue.textContent = isVoiceIssue(status) ? status.message : (error.message || L('Test failed.'));
        } finally { test.disabled = false; }
    });
    controls.append(test);
    return row;
}

function kindBlock(kind) {
    const on = getAiSettings().voice[kind].ai;
    const box = el('div', 'voice-kind');
    const row = el('label', 'switch-row');
    const sw = el('span', 'switch');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = on;
    input.dataset.keep = `voice-${kind}-ai`;
    input.addEventListener('change', () => { setVoiceAi(kind, input.checked); input.blur(); });
    sw.append(input, el('span', 'slider'));
    const text = el('span', 'switch-text');
    text.append(el('strong', null, TITLE[kind]));
    row.append(sw, text);
    box.append(row);
    if (!on) {
        const issue = el('p', 'ais-task-error');
        issue.dataset.voiceOffIssue = kind;
        updateDisabledKindIssue(issue, kind);
        box.append(issue);
        return box;
    }
    const langs = el('div', 'voice-langs');
    for (const [lang, name] of Object.entries(LANGS)) langs.append(langRow(kind, lang, name));
    if (!Object.keys(LANGS).some(lang => voiceModelOptions(kind, lang).length)) langs.append(el('p', 'muted', L('No voice model found in your AIs.')));
    box.append(langs);
    return box;
}

function deviceSelect(kind, devices) {
    const field = el('label', 'field');
    const sel = el('select');
    sel.append(new Option(L('System default'), ''));
    devices.forEach((d, i) => sel.append(new Option(d.label || L(kind === 'input' ? 'Microphone {0}' : 'Speaker {0}', i + 1), d.deviceId)));
    sel.value = devices.some(d => d.deviceId === chosenDevice(kind)) ? chosenDevice(kind) : '';
    const hint = el('span', 'meta', L('The browser\'s own voice always plays on the system speaker.'));
    hint.hidden = kind === 'input' || !sel.value;
    sel.addEventListener('change', () => { chooseDevice(kind, sel.value); hint.hidden = kind === 'input' || !sel.value; });
    field.append(el('span', null, kind === 'input' ? L('Microphone') : L('Speaker')), sel, hint);
    return field;
}

/** Microphone and speaker pickers, kept in step with what is plugged in. Used here and in the call bar. */
export function deviceFields() {
    const box = el('div', 'device-fields');
    const fill = async () => {
        if (!box.isConnected && box.childElementCount) { navigator.mediaDevices?.removeEventListener('devicechange', fill); return; }
        const { input, output, named } = await listDevices().catch(() => ({ input: [], output: [], named: true }));
        box.replaceChildren(deviceSelect('input', input));
        if (canChooseOutput()) box.append(deviceSelect('output', output));
        if (!named) {
            const ask = el('button', 'link-btn', L('Show the device names'));
            ask.type = 'button';
            ask.addEventListener('click', () => revealDeviceNames().then(fill, () => {}));
            box.append(ask);
        }
    };
    fill();
    navigator.mediaDevices?.addEventListener('devicechange', fill);
    return box;
}

registerAiSettingsSection(() => {
    const box = el('section', 'panel');
    const devices = el('div', 'voice-kind');
    devices.append(el('strong', null, L('Microphone and speaker')), deviceFields());
    box.append(el('h2', 'panel-title', L('Voice')), devices, kindBlock('tts'), kindBlock('stt'));
    return box;
}, 10);
