// The Academy: worlds of short levels in which Nemeris teaches one idea at a time, in three steps of risk
// (learn: none, practice: a second try, apply: one try), with a mid boss and a final boss per world.
// Content: json/academy.json. Progress and grades stay in this browser.
import { LANG } from '../i18n/i18n.js';

const KEY = 'nemeris_academy';
const PHASES = ['learn', 'practice', 'apply'];

let data = { skills: {}, worlds: [] };
export const academyReady = fetch('json/academy.json').then(r => r.json()).then(d => { data = d; }).catch(() => {});

// done: level id → hearts left on its best run; score: question id → 1 (right first time), .5 (second try) or 0.
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* nothing saved */ }
saved.done ||= {};
saved.score ||= {};
function save() {
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage full */ }
    window.dispatchEvent(new Event('nemeris:academy'));
}

/** A text of the content file in the user's language. */
export const t = x => (x && typeof x === 'object' ? x[LANG] || x.en : x || '');

export const worlds = () => data.worlds;
const path = () => data.worlds.flatMap(w => w.levels);
export const levelById = id => path().find(l => l.id === id) || null;
export const worldOf = id => data.worlds.find(w => w.levels.some(l => l.id === id)) || null;

export const stars = id => saved.done[id] || 0;
export const isDone = id => id in saved.done;
/** A level opens once the one before it, in the whole path, is done: worlds open one after the other. */
export function isOpen(id) {
    const all = path();
    const i = all.findIndex(l => l.id === id);
    return i === 0 || (i > 0 && isDone(all[i - 1].id));
}
export const nextLevel = () => path().find(l => !isDone(l.id)) || null;
/** The level after this one in the whole path, or null after the last. */
export function levelAfter(id) {
    const all = path();
    return all[all.findIndex(l => l.id === id) + 1] || null;
}

const questionsOf = level => PHASES.slice(1).flatMap(phase => (level[phase] || [])
    .map((q, i) => ({ ...q, phase, id: `${level.id}.${phase}.${i}`, skill: q.skill || level.skill })));

/**
 * Every step of a level, in order, each with its phase. A boss has no content of its own: it asks `count` questions
 * from the levels before it in its world, the ones the user knows least first.
 */
export function stepsOf(level) {
    if (!level.boss) return PHASES.flatMap(phase => (level[phase] || []).map((s, i) => ({ ...s, phase, id: `${level.id}.${phase}.${i}`, skill: s.skill || level.skill })));
    const w = worldOf(level.id);
    const pool = w.levels.slice(0, w.levels.indexOf(level)).filter(l => !l.boss).flatMap(questionsOf)
        .map(q => [saved.score[q.id] ?? 0, Math.random(), q])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return pool.slice(0, level.count || 5).map(([, , q]) => ({ ...q, phase: 'boss' }));
}

export function record(questionId, score) {
    saved.score[questionId] = score;
    save();
}

export function finish(levelId, hearts) {
    saved.done[levelId] = Math.max(saved.done[levelId] || 0, hearts);
    save();
}

/** Knowledge per side of investing, 0 to 100: the share of all the Academy's questions on it answered right lately. */
export function grades() {
    const total = {}, got = {};
    for (const q of path().filter(l => !l.boss).flatMap(questionsOf)) {
        total[q.skill] = (total[q.skill] || 0) + 1;
        got[q.skill] = (got[q.skill] || 0) + (saved.score[q.id] || 0);
    }
    return Object.entries(data.skills).map(([id, name]) => ({ id, name: t(name), score: total[id] ? Math.round(got[id] / total[id] * 100) : 0 }));
}

/** A question the user missed before, for a quick check on Home, or null. */
export function missedQuestion() {
    const missed = path().filter(l => isDone(l.id) && !l.boss).flatMap(questionsOf).filter(q => (saved.score[q.id] ?? 1) < 1);
    return missed[Math.floor(Math.random() * missed.length)] || null;
}

/** The grades in one line for the assistant, or '' before any answer. */
export function gradesContext() {
    if (!Object.keys(saved.score).length) return '';
    return `Their Academy grades (share of each topic's questions answered right): ${grades().map(g => `${g.name} ${g.score}%`).join(', ')}.`;
}
