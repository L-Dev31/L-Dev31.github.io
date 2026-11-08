// The explainer: tap any underlined word, anywhere, to open a sheet that explains it as fully as a beginner needs.
// Words inside it are tappable too, with a back button, so one question can lead to the next.
// Also the small pieces the coach and the Academy share: buttons, text with tappable words, photos.
import { el, icon } from '../core/utils.js';
import { getInvestor, comfortLevel, currencyCode } from '../core/state.js';
import { holdingRows } from '../data/holdings.js';
import { currentBank, money } from '../data/banks.js';
import { syncAiGates } from '../ai/ai-core.js';
import { L, LOCALE } from '../i18n/i18n.js';
import { TERMS } from './terms.js';
import { levelById, t as tr } from '../learn/academy.js';

/** A plain button (never a form's submit), its icon before the label. */
export function button(cls, label, iconName) {
    const b = el('button', cls, label);
    b.type = 'button';
    if (iconName) b.prepend(icon(iconName));
    return b;
}

export function iconButton(iconName, label) {
    const b = button('icon-btn', null, iconName);
    b.setAttribute('aria-label', label);
    return b;
}

/** Hands a question to the assistant, closing the explainer first when the button sits in it. */
export function askButton(label, question) {
    const b = button('btn btn-quiet', label, 'sparkle');
    b.dataset.needsAi = 'assistant';
    b.addEventListener('click', () => {
        b.closest('dialog')?.close();
        window.nemerisAssistant?.send(question);
    });
    return b;
}

/* ── text with tappable words: "[[key|shown words]]" ── */
function termButton(key, text = TERMS[key].title) {
    const b = button('term', text);
    b.dataset.term = key;
    return b;
}

export function richText(text) {
    const s = String(text), out = document.createDocumentFragment();
    let last = 0;
    for (const m of s.matchAll(/\[\[(\w+)\|([^\]]+)\]\]/g)) {
        out.append(s.slice(last, m.index), TERMS[m[1]] ? termButton(m[1], m[2]) : m[2]);
        last = m.index + m[0].length;
    }
    out.append(s.slice(last));
    return out;
}

export const plainText = text => String(text).replace(/\[\[\w+\|([^\]]+)\]\]/g, '$1');

export function para(cls, text) {
    const p = el('p', cls);
    p.append(richText(text));
    return p;
}

/** The idea a level teaches, then a button that opens the level (academy-page.js handles every [data-level]); [] when there is no such level. */
export function lessonIdea(cls, id) {
    const level = levelById(id);
    if (!level) return [];
    const b = button('btn btn-quiet', L('Learn it with Nemeris'), 'school');
    b.dataset.level = level.id;
    return [para(cls, tr(level.idea)), b];
}

/* ── photos that show a subject at a glance (a bank, a calendar, bitcoin...): across the top of Home cards, in lessons ──
   Source: Openverse (openly licensed images, free, no key). With an Unsplash access key (free at
   unsplash.com/developers, "demo" apps allow 50 searches an hour) Unsplash photos are used instead.
   Each subject is searched once and kept for 30 days; the credit shows on the photo. */
const UNSPLASH_KEY = '';
const PHOTOS_KEY = 'nemeris_card_photos';
const KEEP = 30 * 86400000;
let photos;
try { photos = JSON.parse(localStorage.getItem(PHOTOS_KEY) || '{}') || {}; } catch { photos = {}; }
const pending = new Map();

async function findPhoto(query) {
    const q = encodeURIComponent(query);
    if (UNSPLASH_KEY) {
        const r = await fetch(`https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape&content_filter=high&client_id=${UNSPLASH_KEY}`);
        const p = r.ok ? (await r.json()).results?.[0] : null;
        return p && { src: `${p.urls.raw}&w=960&h=400&fit=crop&auto=format`, credit: `${p.user.name} / Unsplash`, link: `${p.links.html}?utm_source=nemeris&utm_medium=referral` };
    }
    const r = await fetch(`https://api.openverse.org/v1/images/?q=${q}&page_size=5&aspect_ratio=wide&license_type=commercial&mature=false`);
    const p = r.ok ? (await r.json()).results?.find(x => x.thumbnail) : null;
    return p && { src: p.thumbnail, credit: `${p.creator || p.source} · ${String(p.license || '').toUpperCase()} ${p.license_version || ''}`.trim(), link: p.foreign_landing_url };
}

/** { src, credit, link } for a subject, or null when nothing loads (the card then simply shows no photo). */
function photoFor(query) {
    const hit = photos[query];
    if (hit && Date.now() - hit.t < KEEP) return Promise.resolve(hit.photo);
    if (!pending.has(query)) pending.set(query, findPhoto(query).catch(() => null).then(photo => {
        if (photo) {
            photos[query] = { t: Date.now(), photo };
            try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos)); } catch { /* storage full */ }
        }
        return photo;
    }));
    return pending.get(query);
}

/** A photo with its credit, shown once it has loaded; nothing at all if no source answers. */
export function photoFigure(query, cls = 'coach-photo') {
    const box = el('figure', cls);
    const img = el('img');
    const credit = el('a', 'coach-photo-credit');
    box.hidden = true;
    img.alt = '';
    img.addEventListener('load', () => { box.hidden = false; });
    credit.target = '_blank';
    credit.rel = 'noopener';
    box.append(img, credit);
    photoFor(query).then(p => {
        if (!p) return;
        img.src = p.src;
        credit.textContent = p.credit;
        if (p.link) credit.href = p.link;
    });
    return box;
}

/** A word's example with the user's own numbers, or null. */
function yoursOf(t) {
    try {
        const { rows, total } = holdingRows();
        return t.yours?.({ rows, total, money, home: currencyCode(), bank: currentBank(), inv: getInvestor(), comfort: comfortLevel() }) || null;
    } catch { return null; /* numbers not loaded yet */ }
}

/* ── the sheet ── */
const sheet = el('dialog', 'sheet explain');
sheet.setAttribute('aria-labelledby', 'explain-title');
const back = iconButton('chevron-left', L('Back'));
const title = el('h2', 'sheet-title');
title.id = 'explain-title';
const close = iconButton('close', L('Close'));
const head = el('div', 'sheet-head');
head.append(back, title, close);
const body = el('div', 'explain-body');
sheet.append(head, body);
document.body.append(sheet);

// The words opened so far, the one on screen last; null stands for the list of every word.
let trail = [];

function section(heading, content, cls = 'explain-part') {
    const s = el('section', cls);
    s.append(el('h3', null, heading), ...content);
    return s;
}

function chips(keys) {
    const row = el('div', 'chips');
    for (const k of keys) if (TERMS[k]) row.append(termButton(k));
    return row;
}

function termView(key) {
    const t = TERMS[key];
    const yours = yoursOf(t);
    const idea = lessonIdea('explain-idea', t.lesson);
    return [t.title, [
        para('explain-lead', t.short),
        section(L('In more detail'), t.more.map(m => para(null, m))),
        section(L('Example'), [para('explain-example', t.example)]),
        yours && section(L('With your numbers'), [para('explain-yours', yours)]),
        idea.length && section(L('The idea to remember'), idea, 'explain-part explain-idea-box'),
        t.related?.length && section(L('Related words'), [chips(t.related)]),
        askButton(L('Ask Nemeris about it'), L('Explain "{0}" simply, with an example from my portfolio if it helps.', t.title)),
    ].filter(Boolean)];
}

function libraryView() {
    const words = Object.keys(TERMS).sort((a, b) => TERMS[a].title.localeCompare(TERMS[b].title, LOCALE));
    return [L('Every word explained'), [el('p', 'explain-lead', L('Tap a word to read what it means, with an example.')), chips(words)]];
}

function render() {
    const key = trail.at(-1);
    const [heading, parts] = key === null ? libraryView() : termView(key);
    title.textContent = heading;
    body.replaceChildren(...parts);
    back.hidden = trail.length < 2;
    syncAiGates(body);
    body.scrollTop = 0;
}

back.addEventListener('click', () => { trail.pop(); render(); });
close.addEventListener('click', () => sheet.close());
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });

// Capture phase: underlined words can sit inside other buttons (a card, a summary) without triggering them.
// A word opens its explanation; [data-library] (a button anywhere) opens the list of every word.
document.addEventListener('click', e => {
    const term = e.target.closest('.term[data-term]');
    if (!term && !e.target.closest('[data-library]')) return;
    e.preventDefault();
    e.stopPropagation();
    const key = term ? term.dataset.term : null;
    if (key && !TERMS[key]) return;
    if (sheet.open) trail.push(key);
    else trail = [key];
    render();
    if (!sheet.open) sheet.showModal();
}, true);

/** A word's whole explanation as plain text, with the user's own numbers when they help (for the assistant). */
export function termDetails(key) {
    const t = TERMS[key];
    if (!t) return null;
    const yours = yoursOf(t);
    const level = levelById(t.lesson);
    return {
        key, title: t.title, short: t.short,
        more: t.more.map(plainText), example: plainText(t.example),
        with_your_numbers: yours ? plainText(yours) : null,
        idea_to_remember: level ? plainText(tr(level.idea)) : null,
        related: t.related || [],
    };
}

/** The word Nemeris explains for a free-form query ("ETF", "frais de courtage", "orderFee"), or null. */
export function findTerm(word) {
    const norm = x => String(x || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const q = norm(word);
    if (!q) return null;
    const keys = Object.keys(TERMS);
    return keys.find(k => k.toLowerCase() === q.replace(/ /g, ''))
        || keys.find(k => norm(TERMS[k].title) === q)
        || keys.find(k => norm(TERMS[k].title).includes(q) || q.includes(norm(TERMS[k].title)))
        || keys.find(k => norm(TERMS[k].short).includes(q))
        || null;
}
