import { L, Ln } from '../i18n/i18n.js';
import { know, knowledgeReady } from './knowledge.js';
export const TASKS = {
    assistant: { label: 'Assistant', hint: L('Chats with you and acts in Nemeris'), type: 'llm' },
    research: { label: L('Stock opinions'), hint: L('Writes the AI opinion on each stock'), type: 'llm' },
    screening: { label: 'Screening', hint: L('Scores many stocks fast in the Explorer'), type: 'decision' },
};

export const EFFORTS = {
    quick: { label: 'Low', steps: 3, maxTokens: 700, web: false, reasoning: 'low' },
    balanced: { label: 'Medium', steps: 6, maxTokens: 1500, web: true, reasoning: 'medium' },
    deep: { label: 'Extra', steps: 12, maxTokens: 3200, web: true, reasoning: 'high' },
};

const SETTINGS_KEY = 'nemeris_ai_settings';
const CATALOG_KEY = 'nemeris_ai_catalog';
// Ports where AI servers usually listen on this computer. Nemeris names none of them: the user names what they add.
const SCAN_PORTS = [1234, 11434, 8080, 1337, 8000, 5001, 4891, 8421];

export class ModelError extends Error {
    constructor(msg, kind = 'error') { super(msg); this.kind = kind; }
}

/** Where an address lives, in the browser's words: 'loopback' (this computer), 'local' (the home network) or null (the internet). */
export function addressSpace(url) {
    let host;
    try { host = new URL(url).hostname.replace(/^\[|\]$/g, ''); } catch { return null; }
    if (/^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0)$/i.test(host)) return 'loopback';
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host) || /\.local$/i.test(host)) return 'local';
    return null;
}
export const isLoopback = url => addressSpace(url) === 'loopback';
/** fetch for AI servers. Only an http address on the home network, from the https site, needs announcing: Chrome
 *  then asks once to allow "apps on this device" instead of blocking it as mixed content. This computer's own
 *  addresses are recognized by the browser itself. A browser that does not know the option gets the plain request. */
export function aiFetch(url, init = {}) {
    if (addressSpace(url) !== 'local' || !pageIsPublicHttps() || !/^http:/i.test(url)) return fetch(url, init);
    return fetch(url, { ...init, targetAddressSpace: 'local' })
        .catch(e => (e instanceof TypeError && /address ?space|enum/i.test(e.message) ? fetch(url, init) : Promise.reject(e)));
}
export const pageOrigin = () => location.origin;
export const pageIsPublicHttps = () => location.protocol === 'https:' && !isLoopback(location.href);
/** Model name as the server gives it, without folders or file extension. */
export function prettyModel(id) {
    const last = String(id || '').split('/').filter(Boolean).pop() || '';
    return last.replace(/\.gguf$/i, '').replace(/-GGUF$/i, '');
}
const hostOf = base => { try { return new URL(base).host; } catch { return base; } };
/** API dialect, read from the address: Anthropic's API has its own format, every other server speaks the OpenAI one. */
const kindOf = base => /(^|\.)anthropic\.com$/i.test(hostOf(base)) ? 'anthropic' : 'openai';
/** Protocol supported by an endpoint. Decision endpoints are detected from their API response. */
const cleanType = t => (t === 'decision' ? 'decision' : 'llm');
const originOf = base => { try { return new URL(base).origin; } catch { return base; } };
const isSafari = () => /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);

/** Canonical API base: scheme added, no trailing slash, "/v1" when only a host was given. */
export function endpointBase(url) {
    let s = String(url || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = (addressSpace(`http://${s}`) ? 'http://' : 'https://') + s;
    try {
        const u = new URL(s);
        const path = u.pathname.replace(/\/+$/, '');
        return `${u.origin}${path || '/v1'}`;
    } catch { return ''; }
}
export const makeRef = (base, model) => `${base}|${model}`;
export function parseRef(ref) {
    const i = ref ? ref.indexOf('|') : -1;
    return i > 0 ? { base: ref.slice(0, i), model: ref.slice(i + 1) } : null;
}

/* ── settings: nothing is preset, the user brings every AI ── */
/** Voice: the browser speaks and listens unless AI is switched on; then each language may use one of the user's models.
 *  langs.<lang> = { ref: 'base|model' ('' = the browser for that language), voice: 'voice name' (speech only) }. */
export const VOICE_KINDS = ['tts', 'stt'];
const blankVoice = () => ({ tts: { ai: false, langs: {} }, stt: { ai: false, langs: {} } });
const blank = () => ({ v: 3, endpoints: [], tasks: { assistant: '', research: '', screening: '' }, daily: false, effort: 'balanced', rules: '', voice: blankVoice() });

function cleanVoice(v) {
    const out = blankVoice();
    for (const kind of VOICE_KINDS) {
        const src = v?.[kind];
        if (!src || typeof src !== 'object') continue;
        out[kind].ai = !!src.ai;
        for (const [lang, c] of Object.entries(src.langs || {})) {
            if (!c || typeof c !== 'object') continue;
            const ref = typeof c.ref === 'string' ? c.ref : '';
            out[kind].langs[lang] = kind === 'tts' ? { ref, voice: String(c.voice || '').trim().slice(0, 80) } : { ref };
        }
    }
    return out;
}

function migrate(s) {
    const d = blank();
    if (!s || typeof s !== 'object') return d;
    if (s.v === 3) {
        const tasks = { ...d.tasks, ...s.tasks };
        // Endpoint protocols are detected from their API responses, never selected globally.
        const endpoints = (s.endpoints || []).filter(e => e?.base).map(e => ({ base: e.base, key: e.key || '', name: String(e.name || '').trim() }));
        return { ...d, ...s, tasks, endpoints, effort: EFFORTS[s.effort] ? s.effort : d.effort, voice: cleanVoice(s.voice) };
    }
    const add = (url, key = '') => {
        const base = endpointBase(url);
        if (base && !d.endpoints.some(e => e.base === base)) d.endpoints.push({ base, key, name: '' });
        return base;
    };
    for (const u of s.local?.extra || []) add(u);
    if (s.openai?.key) add('https://api.openai.com/v1', s.openai.key);
    if (s.anthropic?.key) add('https://api.anthropic.com/v1', s.anthropic.key);
    if (s.custom?.url) add(s.custom.url, s.custom.key || '');
    for (const t of Object.keys(d.tasks)) {
        const r = s.tasks?.[t];
        if (!r || r === 'rules') continue;
        const [p, b, ...m] = String(r).split('|');
        const base = p === 'openai' ? endpointBase('https://api.openai.com/v1') : p === 'anthropic' ? endpointBase('https://api.anthropic.com/v1') : endpointBase(b);
        if (p === 'local') add(base);
        if (base && m.length) d.tasks[t] = makeRef(base, m.join('|'));
    }
    return d;
}

let settingsCache = null;
export function getAiSettings() {
    if (!settingsCache) {
        let s = null;
        try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch { /* corrupt, start clean */ }
        settingsCache = migrate(s);
    }
    return settingsCache;
}
export function saveAiSettings(s) {
    settingsCache = migrate(s);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsCache)); } catch { /* storage full */ }
    refreshTaskStates();
    changed();
}
export function patchAiSettings(fn) {
    const s = structuredClone(getAiSettings());
    fn(s);
    saveAiSettings(s);
}
/** Adds (or updates) one AI. A name is required: Nemeris never names an AI for the user. */
export function addEndpoint(url, key = '', name = '') {
    const base = endpointBase(url);
    const label = String(name || '').trim();
    if (!base || !label) return null;
    patchAiSettings(s => {
        const hit = s.endpoints.find(e => e.base === base);
        if (hit) Object.assign(hit, { name: label }, key ? { key } : {});
        else s.endpoints.push({ base, key, name: label });
    });
    const srv = ensureServer(base);
    srv.added = true;
    checkServer(srv).then(() => { refreshTaskStates(); changed(); });
    return base;
}
/** Updates an endpoint and keeps any task assignments if its address changes. */
export function updateEndpoint(base, { url, name, key }) {
    const nextBase = endpointBase(url);
    const label = String(name || '').trim();
    const secret = String(key || '');
    if (!nextBase) return { ok: false, field: 'url', message: L('Not a valid address.') };
    if (!label) return { ok: false, field: 'name', message: L('Give this AI a name.') };
    const settings = getAiSettings();
    if (!settings.endpoints.some(e => e.base === base)) return { ok: false, message: L('This AI endpoint no longer exists.') };
    if (settings.endpoints.some(e => e.base !== base && e.base === nextBase)) return { ok: false, field: 'url', message: L('This address has already been added.') };
    if (settings.endpoints.some(e => e.base !== base && (e.name || '').toLowerCase() === label.toLowerCase())) return { ok: false, field: 'name', message: L('This name is already taken.') };

    patchAiSettings(s => {
        const endpoint = s.endpoints.find(e => e.base === base);
        endpoint.base = nextBase;
        endpoint.name = label;
        endpoint.key = secret;
        for (const task of Object.keys(s.tasks)) {
            const ref = parseRef(s.tasks[task]);
            if (ref?.base === base) s.tasks[task] = makeRef(nextBase, ref.model);
        }
        for (const c of voiceChoices(s)) {
            const ref = parseRef(c.ref);
            if (ref?.base === base) c.ref = makeRef(nextBase, ref.model);
        }
    });

    let srv = catalog.servers.get(base);
    if (nextBase !== base) {
        catalog.servers.delete(base);
        srv = { ...(srv || {}), base: nextBase, kind: kindOf(nextBase), type: 'llm', models: [], state: 'unknown', stale: false, checkedAt: 0, diag: null };
        catalog.servers.set(nextBase, srv);
    } else if (!srv) srv = ensureServer(nextBase);
    srv.added = true;
    checkServer(srv).then(() => { refreshTaskStates(); changed(); });
    return { ok: true, base: nextBase };
}
/** Every per-language voice choice of a settings object, to follow an AI that moves or goes away. */
const voiceChoices = s => VOICE_KINDS.flatMap(kind => Object.values(s.voice?.[kind]?.langs || {}));

export function removeEndpoint(base) {
    patchAiSettings(s => {
        s.endpoints = s.endpoints.filter(e => e.base !== base);
        for (const t of Object.keys(s.tasks)) if (parseRef(s.tasks[t])?.base === base) s.tasks[t] = '';
        for (const c of voiceChoices(s)) if (parseRef(c.ref)?.base === base) c.ref = '';
    });
    const srv = catalog.servers.get(base);
    if (srv && !srv.found) catalog.servers.delete(base);
    else if (srv) srv.added = false;
    persistCatalog();
    changed();
}

/* ── change notifications (coalesced) ── */
const listeners = new Set();
let changeTimer = 0;
export function onAiChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function changed() {
    if (changeTimer) return;
    changeTimer = setTimeout(() => {
        changeTimer = 0;
        for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } }
    }, 50);
}

/* ── catalog: every server we reached and the models it offers ── */
const catalog = { servers: new Map(), scannedAt: 0 };
try {
    const saved = JSON.parse(localStorage.getItem(CATALOG_KEY) || 'null');
    for (const s of saved?.servers || []) {
        if (s?.base) catalog.servers.set(s.base, { base: s.base, kind: kindOf(s.base), type: cleanType(s.type), models: s.models || [], allModels: s.allModels || [], found: s.found, state: 'unknown', stale: true });
    }
} catch { /* ignore */ }
function persistCatalog() {
    const slim = [];
    for (const s of catalog.servers.values()) if (s.state === 'ok' || s.stale) slim.push({ base: s.base, kind: s.kind, type: s.type, models: s.models, allModels: s.allModels || [], found: s.found });
    try { localStorage.setItem(CATALOG_KEY, JSON.stringify({ servers: slim })); } catch { /* ignore */ }
}
export const getCatalog = () => catalog;

function clearStaleVoiceSelections(entry) {
    const listed = new Set(entry.allModels?.length ? entry.allModels : (entry.models || []).map(m => m.id).filter(Boolean));
    const settings = getAiSettings();
    let changedSettings = false;
    for (const kind of VOICE_KINDS) {
        for (const choice of Object.values(settings.voice[kind].langs)) {
            const ref = parseRef(choice.ref);
            if (ref?.base !== entry.base || listed.has(ref.model)) continue;
            choice.ref = '';
            if (kind === 'tts') choice.voice = '';
            changedSettings = true;
        }
    }
    if (changedSettings) saveAiSettings(settings);
}

const endpointOf = base => getAiSettings().endpoints.find(e => e.base === base);
/** The user's choice for an AI they added, else what its answers suggest for one only found. */
const typeOf = base => cleanType(endpointOf(base)?.type || catalog.servers.get(base)?.type);
function ensureServer(base) {
    let s = catalog.servers.get(base);
    if (!s) { s = { base, kind: kindOf(base), type: typeOf(base), state: 'unknown', models: [] }; catalog.servers.set(base, s); }
    return s;
}
const keyFor = base => endpointOf(base)?.key || '';
/** The name the user gave, or the bare address while it has none. */
export function serverName(base) {
    return endpointOf(base)?.name || hostOf(base);
}

function authHeaders(kind, key) {
    if (kind === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' };
    const h = { 'Content-Type': 'application/json' };
    if (key) h.Authorization = `Bearer ${key}`;
    return h;
}

async function errorFrom(r) {
    const txt = await r.text().catch(() => '');
    let msg = txt;
    try { const j = JSON.parse(txt); msg = j.error?.message || j.error || j.message || txt; } catch { /* plain text */ }
    msg = String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 240);
    if (r.status === 401 || r.status === 403) return new ModelError(`Key rejected (${r.status}). ${msg}`, 'auth');
    if (r.status === 429) return new ModelError(L('Rate limit or quota reached. {0}', msg));
    if (r.status === 404 && /model/i.test(msg)) return new ModelError(L('Model not found. {0}', msg), 'config');
    return new ModelError(`HTTP ${r.status}. ${msg}`);
}

async function localPermission(space) {
    if (!navigator.permissions?.query) return null;
    for (const name of [space === 'local' ? 'local-network' : 'loopback-network', 'local-network-access']) {
        try { return (await navigator.permissions.query({ name })).state; } catch { /* unknown permission name */ }
    }
    return null;
}

/** How to let this site in (CORS), for the servers people run most, by their usual port. */
function corsFix(port) {
    if (port === '1234') return { fix: L('In LM Studio, open the Developer tab, click Settings and turn on "Enable CORS", then retry. From a terminal: lms server start --cors'), copy: 'lms server start --cors' };
    if (port === '11434') return { fix: L('Quit Ollama, set the environment variable OLLAMA_ORIGINS to {0}, then start it again.', pageOrigin()), copy: pageOrigin() };
    return { fix: L('Allow the origin {0} (CORS) in its settings.', pageOrigin()), copy: pageOrigin() };
}

/** Why a server on this computer can't be reached, in words the user can act on. */
async function diagnoseLocal(base, name) {
    const port = new URL(base).port;
    const who = name || L('The server');
    const https = pageIsPublicHttps();
    let answered = false;
    try { await aiFetch(`${base}/models`, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(6000) }); answered = true; } catch { /* no answer */ }
    const perm = await localPermission(addressSpace(base));
    if (answered) return { code: 'cors', title: L('{0} is running but blocks this site.', who), ...corsFix(port) };
    if (perm === 'denied') return { code: 'lna', title: L('Your browser blocked access to apps on this computer.'), fix: L('Click the icon left of the address bar, open the site settings and allow "Apps on this device", then retry.') };
    if (https && perm === null && isSafari()) return { code: 'safari', title: L('Safari cannot reach apps on this computer from an https page.'), fix: L('Use Chrome, Edge or Firefox, or open Nemeris from localhost.') };
    return { code: 'down', title: L('{0} is not answering on port {1}.', who, port), fix: https ? L('Start it, then retry. Your browser may ask to allow apps on this device: accept.') : L('Start it, then retry.') };
}

/** Lists the models of one server. Never throws. */
async function checkServer(entry, { patient = false } = {}) {
    const key = keyFor(entry.base);
    entry.state = 'checking';
    entry.diag = null;
    changed();
    const local = !!addressSpace(entry.base);
    if (!local && !/^https:/i.test(entry.base) && pageIsPublicHttps()) {
        entry.state = 'error';
        entry.diag = { code: 'mixed', title: L('This page is https, so the address must be https too.'), fix: L('Use an https address, or 127.0.0.1 for this computer.') };
        changed();
        return entry;
    }
    const waiting = local && pageIsPublicHttps() ? setTimeout(() => { entry.state = 'waiting'; changed(); }, 1500) : 0;
    const timeout = patient ? 90000 : local ? 8000 : 12000;
    try {
        entry.type = 'llm';
        const r = await aiFetch(`${entry.base}/models${entry.kind === 'anthropic' ? '?limit=100' : ''}`, { headers: authHeaders(entry.kind, key), cache: 'no-store', signal: AbortSignal.timeout(timeout) });
        // An endpoint without a model list may expose the scoring API; detect that response automatically.
        if (r.status === 404) { await checkDecision(entry, timeout); entry.type = 'decision'; }
        else {
            if (!r.ok) throw await errorFrom(r);
            const j = await r.json().catch(() => ({}));
            const list = j.data || j.models || [];
            // Model names are opaque identifiers: never infer their capabilities from their text.
            entry.models = list.map(m => ({ id: m.id || m.name, type: m.type || '', loaded: null })).filter(m => m.id);
            entry.allModels = [...new Set(entry.models.map(m => m.id))];
            if (local) await enrichLocal(entry);
        }
        entry.state = 'ok';
        entry.stale = false;
        clearStaleVoiceSelections(entry);
    } catch (e) {
        entry.state = 'error';
        if (e instanceof ModelError) entry.diag = { code: e.kind, title: e.message, fix: e.kind === 'auth' ? L('Check the key.') : '' };
        else if (local) entry.diag = await diagnoseLocal(entry.base, serverName(entry.base));
        else entry.diag = { code: 'down', title: L('{0} did not answer.', serverName(entry.base)), fix: L('Check the address and your connection.') };
    } finally {
        clearTimeout(waiting);
    }
    entry.checkedAt = Date.now();
    persistCatalog();
    changed();
    return entry;
}

/** A decision server says it is up on /health, or lists its model on /models.
 *  Throws the fetch error when nothing answers, or 'incompatible' when something
 *  answers HTTP but speaks no known AI API (e.g. another local service on that port). */
async function checkDecision(entry, timeout) {
    let info = null, reached = false;
    for (const url of [`${originOf(entry.base)}/health`, `${entry.base}/models`]) {
        let r;
        try { r = await aiFetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeout) }); } catch (e) { if (url.endsWith('/models')) throw e; continue; }
        reached = true;
        if (!r.ok) continue;
        info = await r.json().catch(() => ({}));
        break;
    }
    if (!info) {
        if (reached) throw new ModelError(L('{0} answered but is not an AI API.', serverName(entry.base)), 'incompatible');
        throw new ModelError(L('{0} does not answer like a decision AI.', serverName(entry.base)), 'config');
    }
    const listed = (info.data || info.models || []).map(m => m.id || m.name).filter(Boolean);
    entry.models = [{ id: String(info.model || listed[0] || ''), loaded: info.ready !== false, type: 'decision' }];
    entry.allModels = [];
}

/** Some local servers also tell which models are loaded in memory. */
async function enrichLocal(entry) {
    const origin = originOf(entry.base);
    const get = async path => { try { const r = await aiFetch(origin + path, { cache: 'no-store', signal: AbortSignal.timeout(3000) }); return r.ok ? await r.json() : null; } catch { return null; } };
    const byId = new Map(entry.models.map(m => [m.id, m]));
    const lm = (await get('/api/v1/models')) || (await get('/api/v0/models'));
    if (lm?.data || lm?.models) {
        for (const m of lm.data || lm.models) {
            const hit = byId.get(m.id || m.key || m.model_key);
            if (!hit) continue;
            hit.type = m.type || hit.type;
            hit.loaded = m.state ? m.state === 'loaded' : Array.isArray(m.loaded_instances) ? m.loaded_instances.length > 0 : hit.loaded;
        }
        entry.allModels = [...new Set(entry.models.map(m => m.id))];
        return;
    }
    const ps = await get('/api/ps');
    if (ps?.models) {
        const loaded = new Set(ps.models.map(m => m.name || m.model));
        for (const m of entry.models) m.loaded = loaded.has(m.id);
    }
}

/** Looks at the usual ports of this computer and at every address the user added. */
let scanPromise = null;
export function scanAll({ patient = false, discoverLocal = false } = {}) {
    if (scanPromise) return scanPromise;
    scanPromise = (async () => {
        const jobs = [];
        if (discoverLocal) {
            for (const port of SCAN_PORTS) {
                const e = ensureServer(`http://127.0.0.1:${port}/v1`);
                e.found = true;
                if (!endpointOf(e.base)) jobs.push(quickCheck(e, patient));
            }
        }
        for (const ep of getAiSettings().endpoints) {
            const e = ensureServer(ep.base);
            e.added = true;
            jobs.push(checkServer(e, { patient }));
        }
        refreshTaskStates();
        await Promise.all(jobs.map(j => j.finally(() => { refreshTaskStates(); changed(); })));
        catalog.scannedAt = Date.now();
        refreshTaskStates();
        changed();
    })().finally(() => { scanPromise = null; });
    return scanPromise;
}
async function quickCheck(entry, patient) {
    const known = entry.stale || entry.everOk;
    await checkServer(entry, { patient });
    if (entry.state === 'ok') entry.everOk = true;
    else if (entry.diag?.code === 'down' && !known) entry.state = 'absent';
}
export async function recheck(base, opts) {
    const e = catalog.servers.get(base);
    if (!e) return scanAll(opts);
    await checkServer(e, opts);
    refreshTaskStates();
}

/* ── which model does which job: only what the user picked ── */
const taskState = {};
for (const t of Object.keys(TASKS)) taskState[t] = { state: 'none', label: '', error: '' };
export const getTaskState = task => taskState[task];
export const taskLabel = task => taskState[task]?.label || '';

export function resolveTask(task) {
    const p = parseRef(getAiSettings().tasks[task]);
    if (!p) return null;
    const srv = catalog.servers.get(p.base);
    const type = typeOf(p.base);
    return {
        base: p.base, model: p.model, key: keyFor(p.base), kind: srv?.kind || kindOf(p.base), type,
        label: p.model ? prettyModel(p.model) : type === 'decision' ? L('Decision service') : '',
        where: serverName(p.base), serverState: srv?.state || 'unknown',
    };
}

function supportsTask(task, type) {
    // Screening can use a dedicated scoring API or an ordinary chat model.
    return task === 'screening' ? type === 'decision' || type === 'llm' : type === TASKS[task].type;
}

function refreshTaskStates() {
    for (const task of Object.keys(TASKS)) {
        const st = taskState[task];
        const r = resolveTask(task);
        if (!r) {
            Object.assign(st, {
                state: 'none', label: '',
                error: task === 'screening'
                    ? L('Choose a screening AI in Settings › AI.')
                    : L('Choose a model in Settings › AI.'),
            });
            continue;
        }
        st.label = `${r.label} · ${r.where}`;
        const srv = catalog.servers.get(r.base);
        if (r.serverState === 'ok' && !supportsTask(task, r.type)) {
            st.state = 'config';
            st.error = L('This AI is not compatible with this task. Choose an AI of the appropriate type.');
            continue;
        }
        if (r.serverState === 'ok') {
            const listed = r.type === 'decision' ? srv.models.length > 0 : srv.models.some(m => m.id === r.model);
            st.state = listed ? 'ok' : 'config';
            st.error = listed ? '' : L('{0} is no longer offered by {1}.', r.label, r.where);
        } else if (r.serverState === 'error') {
            st.state = srv?.diag?.code === 'auth' || srv?.diag?.code === 'mixed' ? 'config' : 'off';
            st.error = srv?.diag?.title || L('{0} is not answering.', r.where);
        } else {
            st.state = 'unknown';
            st.error = '';
        }
    }
}

/** Makes sure the job's model is reachable. Cheap when the last check is recent. */
export async function probeTask(task) {
    const r = resolveTask(task);
    if (!r) { refreshTaskStates(); return false; }
    const srv = ensureServer(r.base);
    if (srv.state !== 'ok' || Date.now() - (srv.checkedAt || 0) > 60000) await checkServer(srv);
    refreshTaskStates();
    changed();
    return taskState[task].state === 'ok';
}

/** Dropdown groups for one job: the models of the AIs the user added and named, nothing chosen for them. */
export function modelOptions(task) {
    const groups = [];
    for (const ep of getAiSettings().endpoints) {
        const s = catalog.servers.get(ep.base);
        if (!s || (s.state !== 'ok' && !(s.stale && s.models?.length))) continue;
        const options = s.models.map(m => {
            return {
                ref: makeRef(s.base, m.id),
                text: m.id ? `${prettyModel(m.id)}${m.loaded ? L(' (loaded)') : ''}` : L('Decision service'),
            };
        });
        if (options.length) groups.push({ label: serverName(s.base), options });
    }
    return groups;
}

export function setTaskModel(task, ref) {
    patchAiSettings(s => { s.tasks[task] = ref || ''; });
    probeTask(task);
}

/* ── voice: one model per language, among the AIs the user added ── */
/** Dropdown groups for speech (tts) or recognition (stt). Model names are never used to guess capabilities. */
export function voiceModelOptions(kind, lang) {
    const groups = [];
    for (const ep of getAiSettings().endpoints) {
        const s = catalog.servers.get(ep.base);
        if (!s || (s.state !== 'ok' && !(s.stale && (s.allModels?.length || s.models?.length)))) continue;
        const ids = (s.allModels?.length ? s.allModels : (s.models || []).map(m => m.id)).filter(Boolean);
        const options = ids.map(id => {
            const ref = makeRef(s.base, id);
            return { ref, text: prettyModel(id) };
        });
        if (options.length) groups.push({ label: serverName(s.base), options });
    }
    return groups;
}

/** The AI that speaks or listens in this language, or null when the browser does it. */
export function resolveVoice(kind, lang) {
    const v = getAiSettings().voice[kind];
    if (!v?.ai) return null;
    const c = v.langs[lang];
    const p = parseRef(c?.ref);
    if (!p) return null;
    return { base: p.base, model: p.model, key: keyFor(p.base), voice: c.voice || '', where: serverName(p.base), label: prettyModel(p.model), lang };
}

export function setVoiceAi(kind, on) { patchAiSettings(s => { s.voice[kind].ai = !!on; }); }
export function setVoiceLang(kind, lang, patch) {
    patchAiSettings(s => {
        const cur = s.voice[kind].langs[lang] || (kind === 'tts' ? { ref: '', voice: '' } : { ref: '' });
        s.voice[kind].langs[lang] = { ...cur, ...patch };
    });
}
/** Headers for a request of the user's own AI (voice calls use the OpenAI audio API). */
export const bearerHeaders = key => (key ? { Authorization: `Bearer ${key}` } : {});
export { errorFrom as readModelError };

/* ── features that need an AI: greyed out with the reason on hover ── */
export const NO_AI_TIP = L('Choose a model in Settings › AI');
export function syncAiGates(root = document) {
    for (const node of root.querySelectorAll('[data-needs-ai]')) {
        const off = taskState[node.dataset.needsAi]?.state === 'none';
        if (!('origTitle' in node.dataset)) node.dataset.origTitle = node.title || '';
        node.title = off ? NO_AI_TIP : node.dataset.origTitle;
        if (node.tagName === 'OPTION' || node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') node.disabled = off;
        else if (off) node.setAttribute('aria-disabled', 'true');
        else node.removeAttribute('aria-disabled');
    }
}
document.addEventListener('click', e => {
    if (e.target.closest?.('[aria-disabled="true"]')) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

/* ── calls ── */
async function readSSE(resp, onEvent) {
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).replace(/\r$/, '');
            buf = buf.slice(i + 1);
            if (!line.startsWith('data:')) continue;
            const d = line.slice(5).trim();
            if (!d || d === '[DONE]') continue;
            let ev;
            try { ev = JSON.parse(d); } catch { continue; }
            onEvent(ev);
        }
    }
}
function stripForOpenAI(schema) {
    if (Array.isArray(schema)) return schema.map(stripForOpenAI);
    if (!schema || typeof schema !== 'object') return schema;
    const out = {};
    for (const [k, v] of Object.entries(schema)) if (!['minimum', 'maximum', 'maxItems', 'minItems'].includes(k)) out[k] = stripForOpenAI(v);
    return out;
}
export function stripThinking(t) {
    return String(t || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trimStart();
}
export function parseJsonLoose(text) {
    const m = stripThinking(String(text)).replace(/```(?:json)?/g, '').match(/\{[\s\S]*\}/);
    if (!m) throw new ModelError(L('The model did not return JSON.'));
    try { return JSON.parse(m[0]); } catch { throw new ModelError(L('The model returned malformed JSON.')); }
}
function connectionFor(task) {
    const r = resolveTask(task);
    if (!r) throw new ModelError(L('Choose a model in Settings › AI.'), 'config');
    if (!supportsTask(task, r.type)) throw new ModelError(L('This AI is not compatible with this task. Choose an AI of the appropriate type.'), 'config');
    return r;
}
function markFailure(task, e) {
    if (!(e instanceof ModelError) || !['offline', 'auth', 'config'].includes(e.kind)) return;
    Object.assign(taskState[task], { state: e.kind === 'offline' ? 'off' : 'config', error: e.message });
    const srv = catalog.servers.get(resolveTask(task)?.base);
    if (srv && e.kind === 'offline') srv.state = 'error';
    changed();
}
const offline = (c, e) => new ModelError(addressSpace(c.base) ? L('{0} stopped answering.', c.where) : L('Can\'t reach {0} ({1}).', c.where, e.message), 'offline');

/** Rewrites a request for servers that reject part of it. Returns true when something changed. */
function adaptBody(body, msg) {
    if (/response_format|json_schema|structured/i.test(msg) && body.response_format) {
        delete body.response_format;
        body.messages[0].content += '\nAnswer with ONE JSON object only, no prose.';
        return true;
    }
    if (/reasoning/i.test(msg) && body.reasoning_effort) { delete body.reasoning_effort; return true; }
    if (/temperature/i.test(msg) && 'temperature' in body) { delete body.temperature; return true; }
    if (/max_tokens/i.test(msg) && body.max_tokens) { body.max_completion_tokens = body.max_tokens; delete body.max_tokens; return true; }
    if (/stream_options/i.test(msg) && body.stream_options) { delete body.stream_options; return true; }
    return false;
}

/** One structured JSON call, streamed so the UI can follow. Returns { data, usage, model }. */
export async function callStructured({ task, system, user, schema, name, signal, onText, maxTokens = 2000, temperature = 0.2 }) {
    const c = connectionFor(task);
    try {
        const usage = { in: 0, out: 0 };
        let text = '';
        const push = t => { text += t; onText?.(text); };
        if (c.kind === 'anthropic') {
            const r = await aiFetch(`${c.base}/messages`, {
                method: 'POST', headers: authHeaders('anthropic', c.key), signal,
                body: JSON.stringify({
                    model: c.model, max_tokens: Math.max(maxTokens, 1024), stream: true, system,
                    messages: [{ role: 'user', content: user }],
                    tools: [{ name, description: 'Record the result.', input_schema: schema }],
                    tool_choice: { type: 'tool', name },
                }),
            }).catch(e => { if (e.name === 'AbortError') throw e; throw offline(c, e); });
            if (!r.ok) throw await errorFrom(r);
            await readSSE(r, ev => {
                if (ev.type === 'message_start') usage.in = ev.message?.usage?.input_tokens || 0;
                else if (ev.type === 'content_block_delta' && ev.delta?.type === 'input_json_delta') push(ev.delta.partial_json || '');
                else if (ev.type === 'message_delta') usage.out = ev.usage?.output_tokens || usage.out;
                else if (ev.type === 'error') throw new ModelError(ev.error?.message || L('Stream error.'));
            });
            return { data: parseJsonLoose(text), usage, model: c.model };
        }
        const body = {
            model: c.model, stream: true,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            response_format: { type: 'json_schema', json_schema: { name, strict: true, schema: stripForOpenAI(schema) } },
        };
        body.max_tokens = maxTokens;
        body.temperature = temperature;
        for (let attempt = 0; attempt < 5; attempt++) {
            let r;
            try { r = await aiFetch(`${c.base}/chat/completions`, { method: 'POST', headers: authHeaders(c.kind, c.key), body: JSON.stringify(body), signal }); }
            catch (e) { if (e.name === 'AbortError') throw e; throw offline(c, e); }
            if (!r.ok) {
                const err = await errorFrom(r);
                if (r.status === 400 && adaptBody(body, err.message)) continue;
                throw err;
            }
            text = '';
            if ((r.headers.get('content-type') || '').includes('text/event-stream')) {
                await readSSE(r, ev => {
                    const d = ev.choices?.[0]?.delta?.content;
                    if (d) push(d);
                    if (ev.usage) { usage.in = ev.usage.prompt_tokens || usage.in; usage.out = ev.usage.completion_tokens || usage.out; }
                });
            } else {
                const j = await r.json();
                push(j.choices?.[0]?.message?.content || '');
                usage.in = j.usage?.prompt_tokens || 0; usage.out = j.usage?.completion_tokens || 0;
            }
            return { data: parseJsonLoose(text), usage, model: c.model };
        }
        throw new ModelError(L('The server rejected every request format.'));
    } catch (e) {
        if (e.name !== 'AbortError') markFailure(task, e);
        throw e;
    }
}

const TEXT_TOOL_RE = /<tool>\s*(\{[\s\S]*?\})\s*<\/tool>/g;
const textToolInstructions = tools => `\n\nTOOLS. To use a tool, answer with ONLY this line and nothing else:\n<tool>{"name": "tool_name", "arguments": {...}}</tool>\nYou then receive the result and can answer or call another tool.\nAvailable tools:\n${tools.map(t => `- ${t.name}(${Object.keys(t.parameters?.properties || {}).join(', ')}): ${t.description}`).join('\n')}`;
function parseTextTools(text) {
    const calls = [];
    TEXT_TOOL_RE.lastIndex = 0;
    for (let m; (m = TEXT_TOOL_RE.exec(text));) {
        try {
            const o = JSON.parse(m[1]);
            if (o.name) calls.push({ id: `t${Date.now().toString(36)}${calls.length}`, name: o.name, args: o.arguments || o.args || {} });
        } catch { /* not a tool call */ }
    }
    return calls;
}
function toOpenAIMessages(system, messages, textProtocol) {
    const out = [{ role: 'system', content: system }];
    for (const m of messages) {
        if (m.role === 'user') out.push({ role: 'user', content: m.content });
        else if (m.role === 'assistant') {
            if (textProtocol) {
                const calls = (m.toolCalls || []).map(tc => `<tool>${JSON.stringify({ name: tc.name, arguments: tc.args })}</tool>`).join('\n');
                out.push({ role: 'assistant', content: [m.content || '', calls].filter(Boolean).join('\n') });
                continue;
            }
            const msg = { role: 'assistant', content: m.content || '' };
            if (m.toolCalls?.length) {
                msg.tool_calls = m.toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) } }));
                if (!msg.content) msg.content = null;
            }
            out.push(msg);
        } else if (m.role === 'tool') {
            out.push(textProtocol ? { role: 'user', content: `Result of ${m.name}:\n${m.content}` } : { role: 'tool', tool_call_id: m.toolCallId, content: m.content });
        }
    }
    return out;
}

/**
 * Streaming chat with tools. Messages: { role, content, toolCalls:[{id,name,args}], toolCallId, name }.
 * Returns { text, toolCalls, usage, model }.
 */
export async function chat({ task = 'assistant', system, messages, tools = [], signal, onText, onStatus, effort = 'balanced', temperature = 0.3 }) {
    const c = connectionFor(task);
    const e = EFFORTS[effort] || EFFORTS.balanced;
    try {
        const out = c.kind === 'anthropic'
            ? await chatAnthropic(c, { system, messages, tools, signal, onText, onStatus, maxTokens: e.maxTokens, temperature })
            : await chatOpenAI(c, { system, messages, tools, signal, onText, onStatus, maxTokens: e.maxTokens, temperature });
        return { ...out, model: c.model };
    } catch (err) {
        if (err.name !== 'AbortError') markFailure(task, err);
        throw err;
    }
}

async function chatOpenAI(c, { system, messages, tools, signal, onText, onStatus, maxTokens, temperature }) {
    let textProtocol = false;
    const build = () => {
        const body = { model: c.model, stream: true, messages: toOpenAIMessages(textProtocol && tools.length ? system + textToolInstructions(tools) : system, messages, textProtocol) };
        if (tools.length && !textProtocol) {
            body.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
            body.tool_choice = 'auto';
        }
        body.max_tokens = maxTokens;
        body.temperature = temperature;
        return body;
    };
    let body = build();
    for (let attempt = 0; attempt < 5; attempt++) {
        let r;
        try { r = await aiFetch(`${c.base}/chat/completions`, { method: 'POST', headers: authHeaders(c.kind, c.key), body: JSON.stringify(body), signal }); }
        catch (e) { if (e.name === 'AbortError') throw e; throw offline(c, e); }
        if (!r.ok) {
            const err = await errorFrom(r);
            if ([400, 422, 500].includes(r.status)) {
                if (/tool|function/i.test(err.message) && !textProtocol && tools.length) { textProtocol = true; body = build(); continue; }
                if (adaptBody(body, err.message)) continue;
            }
            throw err;
        }
        let text = '', thinking = false;
        const usage = { in: 0, out: 0 };
        const calls = new Map();
        const visible = () => stripThinking(text).replace(TEXT_TOOL_RE, '').replace(/<tool>[\s\S]*$/, '');
        const handle = delta => {
            if ((delta.reasoning_content || delta.reasoning) && !thinking) { thinking = true; onStatus?.('thinking'); }
            if (delta.content) {
                text += delta.content;
                const inThink = /<think>(?![\s\S]*<\/think>)/i.test(text);
                if (inThink !== thinking) { thinking = inThink; onStatus?.(inThink ? 'thinking' : 'writing'); }
                if (!inThink) onText?.(visible());
            }
            for (const tc of delta.tool_calls || []) {
                const idx = tc.index ?? calls.size;
                const cur = calls.get(idx) || { id: tc.id || `call_${idx}_${Date.now().toString(36)}`, name: '', args: '' };
                if (tc.id) cur.id = tc.id;
                if (tc.function?.name) cur.name += tc.function.name;
                if (tc.function?.arguments) cur.args += typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments);
                calls.set(idx, cur);
                onStatus?.('tool');
            }
        };
        if ((r.headers.get('content-type') || '').includes('text/event-stream')) {
            await readSSE(r, ev => {
                const ch = ev.choices?.[0];
                if (ch) handle(ch.delta || {});
                if (ev.usage) { usage.in = ev.usage.prompt_tokens || usage.in; usage.out = ev.usage.completion_tokens || usage.out; }
            });
        } else {
            const j = await r.json();
            const msg = j.choices?.[0]?.message || {};
            handle({ content: msg.content || '', tool_calls: (msg.tool_calls || []).map((t, i) => ({ ...t, index: i })) });
            usage.in = j.usage?.prompt_tokens || 0; usage.out = j.usage?.completion_tokens || 0;
        }
        let toolCalls = [...calls.values()].filter(x => x.name).map(x => {
            let args = {};
            try { args = x.args ? JSON.parse(x.args) : {}; } catch { args = { _raw: x.args }; }
            return { id: x.id, name: x.name, args };
        });
        if (!toolCalls.length && tools.length) toolCalls = parseTextTools(stripThinking(text));
        return { text: visible().trim(), toolCalls, usage };
    }
    throw new ModelError(L('The server rejected every request format.'));
}

function toAnthropicMessages(messages) {
    const out = [];
    const push = (role, block) => {
        const last = out[out.length - 1];
        if (last?.role === role) last.content.push(block);
        else out.push({ role, content: [block] });
    };
    for (const m of messages) {
        if (m.role === 'user') push('user', { type: 'text', text: m.content });
        else if (m.role === 'assistant') {
            if (m.content) push('assistant', { type: 'text', text: m.content });
            for (const tc of m.toolCalls || []) push('assistant', { type: 'tool_use', id: tc.id, name: tc.name, input: tc.args || {} });
        } else if (m.role === 'tool') push('user', { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content });
    }
    return out;
}

async function chatAnthropic(c, { system, messages, tools, signal, onText, onStatus, maxTokens, temperature }) {
    const body = { model: c.model, max_tokens: Math.max(maxTokens, 1024), stream: true, system, temperature, messages: toAnthropicMessages(messages) };
    if (tools.length) body.tools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    const r = await aiFetch(`${c.base}/messages`, { method: 'POST', headers: authHeaders('anthropic', c.key), body: JSON.stringify(body), signal })
        .catch(e => { if (e.name === 'AbortError') throw e; throw offline(c, e); });
    if (!r.ok) throw await errorFrom(r);
    let text = '';
    const usage = { in: 0, out: 0 };
    const blocks = {};
    await readSSE(r, ev => {
        if (ev.type === 'message_start') usage.in = ev.message?.usage?.input_tokens || 0;
        else if (ev.type === 'content_block_start') {
            const b = ev.content_block || {};
            blocks[ev.index] = { type: b.type, id: b.id, name: b.name, json: '' };
            if (b.type === 'tool_use') onStatus?.('tool');
            else if (b.type === 'thinking') onStatus?.('thinking');
        } else if (ev.type === 'content_block_delta') {
            if (ev.delta?.type === 'text_delta') { text += ev.delta.text; onText?.(text); onStatus?.('writing'); }
            else if (ev.delta?.type === 'input_json_delta' && blocks[ev.index]) blocks[ev.index].json += ev.delta.partial_json || '';
        } else if (ev.type === 'message_delta') usage.out = ev.usage?.output_tokens || usage.out;
        else if (ev.type === 'error') throw new ModelError(ev.error?.message || L('Stream error.'));
    });
    const toolCalls = Object.values(blocks).filter(b => b.type === 'tool_use').map(b => {
        let args = {};
        try { args = b.json ? JSON.parse(b.json) : {}; } catch { /* empty input */ }
        return { id: b.id, name: b.name, args };
    });
    return { text: text.trim(), toolCalls, usage };
}

/* ── decision AIs: score many states at once (POST /v1/decide) ── */
export async function decide(base, items, questions, { signal, onItem } = {}) {
    const who = serverName(base);
    const r = await aiFetch(`${originOf(base)}/v1/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ questions, items, stream: true }),
    }).catch(e => { if (e.name === 'AbortError') throw e; throw new ModelError(L('{0} stopped answering.', who), 'offline'); });
    if (!r.ok) throw await errorFrom(r);
    const out = [];
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line) continue;
            let obj;
            try { obj = JSON.parse(line); } catch { continue; }
            if (obj.error) throw new ModelError(`${who}: ${obj.error}`);
            if (obj.id != null) { out.push(obj); onItem?.(obj); }
        }
    }
    return out;
}

/* ── screening: a quick score per ticker ── */
const SCREEN_QUESTION = {
    outlook: {
        type: 'score',
        instructions: 'How attractive is this stock to buy for the next month, judging only from the facts given?',
        criteria: [
            'very unattractive: falling trend, weak momentum or high risk',
            'unattractive: weak or deteriorating picture',
            'neutral: mixed or unclear signals',
            'attractive: rising trend with supportive momentum',
            'very attractive: strong uptrend, strong momentum, contained risk',
        ],
    },
};
export const stanceFromScore = s => s >= 60 ? 'buy' : s <= 40 ? 'avoid' : 'hold';
const pctText = (x, d = 1) => x == null || !Number.isFinite(x) ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(d)}%`;

export function screeningText(row) {
    const f = row.facts || {};
    const bits = [`${row.ticker}${row.name && row.name !== row.ticker ? ` (${row.name})` : ''}.`];
    if (f.change != null) bits.push(`Change over ${f.periodLabel || 'the period'}: ${pctText(f.change)}.`);
    if (f.rsi != null) bits.push(`RSI ${f.rsi.toFixed(0)}.`);
    if (f.vsSma50 != null) bits.push(`Price ${pctText(f.vsSma50)} vs its 50-bar average${f.vsSma200 != null ? `, ${pctText(f.vsSma200)} vs its 200-bar average` : ''}.`);
    if (f.momentum != null) bits.push(`Momentum ${pctText(f.momentum)}.`);
    if (f.volatility != null) bits.push(`Volatility ${f.volatility.toFixed(0)}% annualized.`);
    if (f.drawdown != null) bits.push(`${Math.abs(f.drawdown).toFixed(0)}% below its peak.`);
    if (f.regime) bits.push(`Regime: ${f.regime}${f.adx ? ` (ADX ${f.adx.toFixed(0)})` : ''}.`);
    if (f.confluence != null) bits.push(`${Math.round(f.confluence * 5)} of 5 indicator groups agree.`);
    if (f.risk != null) bits.push(`Risk ${f.risk}/10.`);
    if (f.ruleScore != null) bits.push(`Technical score ${Math.round(f.ruleScore)}/100.`);
    return bits.join(' ');
}
/** Scores rows [{ id, ticker, name, facts }]. Returns { label, scores: { id: { score, stance, why } } }. */
export async function scoreTickers(rows, { signal, onProgress } = {}) {
    const r = resolveTask('screening');
    if (!r) throw new ModelError(L('Choose a screening AI in Settings › AI.'), 'config');
    const total = rows.length;
    const scores = {};
    let done = 0;
    const tick = () => onProgress?.({ done, total, label: r.label });
    tick();
    if (r.type === 'decision') {
        await decide(r.base, rows.map(x => ({ id: x.id, state: screeningText(x) })), SCREEN_QUESTION, {
            signal,
            onItem: res => {
                const a = res.answers?.outlook;
                if (!a) return;
                const score = Math.round((a.score / 4) * 100);
                scores[res.id] = { score, stance: stanceFromScore(score), why: '', confidence: a.confidence };
                done++;
                tick();
            },
        });
    } else {
        const schema = {
            type: 'object',
            properties: {
                scores: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { id: { type: 'string' }, score: { type: 'integer' } },
                        required: ['id', 'score'], additionalProperties: false,
                    },
                },
            },
            required: ['scores'], additionalProperties: false,
        };
        await knowledgeReady;
        const system = know('screening');
        const batchSize = 20;
        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const { data } = await callStructured({
                task: 'screening', system,
                user: JSON.stringify(batch.map(row => ({ id: String(row.id), facts: screeningText(row) }))),
                name: 'stock_screening_scores', schema, signal, maxTokens: 2400,
            });
            for (const item of data.scores || []) {
                const score = Math.max(0, Math.min(100, Math.round(Number(item.score))));
                if (!batch.some(row => String(row.id) === item.id) || !Number.isFinite(score)) continue;
                scores[item.id] = { score, stance: stanceFromScore(score), why: '', confidence: null };
            }
            done += batch.length;
            tick();
        }
    }
    return { label: r.where, scores };
}

/* ── start-up ── */
let started = false;
export function startAiCore() {
    if (started) return;
    started = true;
    setTimeout(() => scanAll(), 1200);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && Date.now() - catalog.scannedAt > 300000) scanAll();
    });
}

/* ── Settings > AI ── */
const extraSections = [];
/** Other modules add their own block to Settings > AI (voice, the assistant's teaching, the journal backup).
 *  Lower order comes first; voice sits right under "Which AI does what". */
export function registerAiSettingsSection(render, order = 100) {
    extraSections.push({ render, order });
    extraSections.sort((a, b) => a.order - b.order);
}

function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
}
function btn(label, onClick, cls = 'btn') {
    const b = h('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
}
const DOT = { ok: 'ok', checking: 'busy', waiting: 'busy', unknown: 'idle', absent: 'idle', error: 'bad' };
const dot = state => { const d = h('span', `dot is-${DOT[state] || 'idle'}`); d.setAttribute('aria-hidden', 'true'); return d; };

function diagBox(diag, base) {
    const box = h('div', 'notice');
    box.append(h('strong', null, diag.title));
    if (diag.fix) box.append(h('span', null, diag.fix));
    const act = h('div', 'notice-actions');
    if (diag.copy) act.append(btn(L('Copy'), async e => {
        try { await navigator.clipboard.writeText(diag.copy); e.target.textContent = L('Copied'); } catch { /* clipboard blocked */ }
    }, 'btn btn-quiet'));
    act.append(btn(L('Retry'), () => recheck(base, { patient: true }), 'btn btn-quiet'));
    box.append(act);
    return box;
}

function serverRow(s, { onAdd } = {}) {
    const row = h('div', 'ais-row');
    const main = h('div', 'ais-main');
    const title = h('div', 'ais-title');
    const ep = endpointOf(s.base);
    title.append(dot(s.state));
    if (ep) title.append(ep.name ? h('strong', null, ep.name) : h('strong', 'ais-unnamed', L('Unnamed')));
    title.append(h('span', 'muted', hostOf(s.base)));
    main.append(title);
    const models = s.models?.length || 0;
    const loaded = s.models?.filter(m => m.loaded).length || 0;
    const sub = s.state === 'ok' ? Ln(models, '{0} model', '{0} models') + (loaded ? Ln(loaded, ', {0} loaded', ', {0} loaded') : '')
        : s.state === 'waiting' ? L('Waiting for browser permission') : s.state === 'checking' ? L('Checking') : '';
    const side = h('div', 'ais-side');
    if (sub) side.append(h('span', 'muted', sub));
    const refresh = btn(L('Refresh'), () => recheck(s.base, { patient: true }), 'btn btn-quiet');
    refresh.disabled = s.state === 'checking' || s.state === 'waiting';
    side.append(refresh);
    if (ep) {
        side.append(btn(L('Edit'), () => { editingEndpoint = s.base; changed(); }, 'btn btn-quiet'));
        side.append(btn(L('Remove'), () => removeEndpoint(s.base), 'btn btn-quiet'));
    } else side.append(btn(L('Add'), () => onAdd?.(s), 'btn'));
    row.append(main, side);
    if (ep && editingEndpoint === s.base) row.append(editEndpointForm(ep));
    if (s.state === 'error' && s.diag) row.append(diagBox(s.diag, s.base));
    return row;
}

// One tap to add a well-known AI: servers on this computer at their default port, and online APIs (they need a key).
const PRESETS = [
    { name: 'LM Studio', base: 'http://127.0.0.1:1234/v1' },
    { name: 'Ollama', base: 'http://127.0.0.1:11434/v1' },
    { name: 'Jan', base: 'http://127.0.0.1:1337/v1' },
    { name: 'llama.cpp', base: 'http://127.0.0.1:8080/v1' },
    { name: 'KoboldCpp', base: 'http://127.0.0.1:5001/v1' },
    { name: 'GPT4All', base: 'http://127.0.0.1:4891/v1' },
    { name: 'OpenAI', base: 'https://api.openai.com/v1', key: true },
    { name: 'Anthropic', base: 'https://api.anthropic.com/v1', key: true },
    { name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: true },
    { name: 'Mistral', base: 'https://api.mistral.ai/v1', key: true },
    { name: 'Groq', base: 'https://api.groq.com/openai/v1', key: true },
    { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', key: true },
];

let settingsOff = null;
let editingEndpoint = '';
function editEndpointForm(ep) {
    const form = h('form', 'ais-add ais-edit');
    const name = h('input');
    name.type = 'text'; name.required = true; name.maxLength = 40; name.value = ep.name || '';
    name.placeholder = L('Name of this AI'); name.setAttribute('aria-label', L('Name of this AI')); name.dataset.keep = 'editEndpoint';
    const url = h('input');
    url.type = 'text'; url.required = true; url.value = ep.base;
    url.placeholder = L('Address, e.g. http://127.0.0.1:8080/v1'); url.setAttribute('aria-label', L('AI address')); url.dataset.keep = 'editEndpoint';
    const key = h('input');
    key.type = 'password'; key.value = ep.key || ''; key.placeholder = L('Key, if it needs one'); key.autocomplete = 'off';
    key.setAttribute('aria-label', L('API key')); key.dataset.keep = 'editEndpoint';
    const save = h('button', 'btn btn-primary', L('Save'));
    save.type = 'submit';
    const cancel = btn(L('Cancel'), () => { editingEndpoint = ''; changed(); }, 'btn btn-quiet');
    const err = h('p', 'ais-task-error'); err.hidden = true;
    form.append(name, url, key, save, cancel, err);
    form.addEventListener('submit', e => {
        e.preventDefault();
        const result = updateEndpoint(ep.base, { url: url.value, name: name.value, key: key.value });
        if (!result.ok) {
            err.textContent = result.message; err.hidden = false;
            (result.field === 'url' ? url : name).focus();
            return;
        }
        document.activeElement?.blur();
        editingEndpoint = '';
    });
    return form;
}

export function renderAiSettings() {
    const root = document.getElementById('ai-settings');
    if (!root) return;
    settingsOff?.();
    const draw = () => {
        if (!root.isConnected) { settingsOff?.(); return; }
        const focused = document.activeElement && root.contains(document.activeElement) ? document.activeElement.dataset.keep : null;
        if (focused) return;
        root.replaceChildren();
        const s = getAiSettings();
        const all = [...catalog.servers.values()];
        const mine = all.filter(x => x.added || s.endpoints.some(e => e.base === x.base));
        const found = all.filter(x => !mine.includes(x) && x.found && x.state === 'ok');

        const yours = h('section', 'panel');
        const head = h('div', 'panel-head');
        head.append(h('h2', 'panel-title', L('Your AI')), btn(L('Scan again'), () => scanAll({ patient: true, discoverLocal: true }), 'btn btn-quiet'));
        yours.append(head, h('p', 'muted', L('Optional. Add any AI, on this computer or online: give it a name, its address and its key if it needs one.')));
        const list = h('div', 'ais-list');
        if (mine.length) mine.forEach(x => list.append(serverRow(x)));
        else list.append(h('p', 'empty', L('No AI added yet.')));
        yours.append(list);

        const form = h('form', 'ais-add');
        const name = h('input');
        name.type = 'text';
        name.required = true;
        name.maxLength = 40;
        name.placeholder = L('Name, e.g. Ollama, LM Studio');
        name.setAttribute('aria-label', L('Name of this AI'));
        name.dataset.keep = 'name';
        const url = h('input');
        url.type = 'text';
        url.required = true;
        url.placeholder = L('Address, e.g. http://127.0.0.1:8080/v1');
        url.setAttribute('aria-label', L('AI address'));
        url.dataset.keep = 'url';
        const key = h('input');
        key.type = 'password';
        key.placeholder = L('Key, if it needs one');
        key.autocomplete = 'off';
        key.setAttribute('aria-label', L('API key'));
        key.dataset.keep = 'key';
        const add = h('button', 'btn btn-primary', L('Add'));
        add.type = 'submit';
        const err = h('p', 'ais-task-error');
        err.hidden = true;
        form.append(name, url, key, add, err);
        const fail = (msg, field) => { err.textContent = msg; err.hidden = false; field.focus(); };

        const presets = h('div', 'chips ais-presets');
        presets.setAttribute('aria-label', L('Quick add'));
        for (const p of PRESETS.filter(p => !s.endpoints.some(e => e.base === p.base))) {
            presets.append(btn(p.name, () => {
                if (!p.key) { addEndpoint(p.base, '', p.name); return; }
                name.value = p.name;
                url.value = p.base;
                key.focus();
            }, 'chip'));
        }
        if (presets.childElementCount) yours.append(h('p', 'meta', L('Quick add: tap one. Online AIs then ask for their key.')), presets);
        form.addEventListener('submit', e => {
            e.preventDefault();
            const label = name.value.trim();
            const base = endpointBase(url.value);
            if (!label) return fail(L('Give this AI a name.'), name);
            if (!base) return fail(L('Not a valid address.'), url);
            if (s.endpoints.some(x => x.base !== base && (x.name || '').toLowerCase() === label.toLowerCase())) return fail(L('This name is already taken.'), name);
            document.activeElement?.blur();
            addEndpoint(url.value, key.value.trim(), label);
        });
        yours.append(form);
        if (found.length) {
            yours.append(h('h3', 'sub-title', L('Found on this computer')), h('p', 'muted', L('To use one, add it and give it a name.')));
            const fl = h('div', 'ais-list');
            const pick = x => { url.value = x.base; err.hidden = true; name.focus(); };
            found.forEach(x => fl.append(serverRow(x, { onAdd: pick })));
            yours.append(fl);
        }
        root.append(yours);

        const jobs = h('section', 'panel');
        jobs.append(h('h2', 'panel-title', L('Which AI does what')));
        for (const [task, meta] of Object.entries(TASKS)) {
            const row = h('div', 'ais-task');
            const label = h('div', 'ais-main');
            label.append(h('strong', null, meta.label), h('span', 'muted', meta.hint));
            const sel = h('select');
            sel.setAttribute('aria-label', L('{0} model', meta.label));
            sel.dataset.keep = task;
            sel.append(new Option(L('Choose a model'), ''));
            for (const g of modelOptions(task)) {
                const og = h('optgroup');
                og.label = g.label;
                for (const o of g.options) og.append(new Option(o.text, o.ref));
                sel.append(og);
            }
            sel.value = s.tasks[task] || '';
            sel.addEventListener('change', () => { setTaskModel(task, sel.value); sel.blur(); });
            row.append(label, sel);
            const st = taskState[task];
            const showError = task === 'screening'
                ? !!s.tasks[task] && st.state !== 'ok' && st.state !== 'unknown' && st.state !== 'none' && !!st.error
                : st.state !== 'ok' && st.state !== 'unknown' && !!st.error && !!s.tasks[task];
            if (showError) row.append(h('p', 'ais-task-error', st.error));
            jobs.append(row);
        }
        root.append(jobs);

        for (const { render } of extraSections) { const node = render(); if (node) root.append(node); }
    };
    settingsOff = onAiChange(draw);
    draw();
    scanAll({ patient: pageIsPublicHttps() });
}

document.addEventListener('click', e => {
    if (e.target.closest?.('#card-settings .card-tab-btn[data-target="settings-ai"]')) setTimeout(renderAiSettings, 0);
});
