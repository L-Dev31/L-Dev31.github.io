// What the user has learned, with spaced reviews (Leitner boxes): a right answer pushes the next check further away
// (1, 3, 7, 21, then 60 days), a wrong one brings it back to tomorrow. Retrieval spread over time is what makes ideas stick.
import { LESSON_IDS } from './lessons.js';

const KEY = 'nemeris_learning';
const DAY = 86400000;
const WAIT_DAYS = [1, 3, 7, 21, 60];

let state;
try { state = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { state = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ } };

/** The user opened this lesson: it comes back for a first check tomorrow. */
export function markSeen(id) {
    if (state[id]) return;
    state[id] = { box: 0, due: Date.now() + DAY };
    save();
}

export function answer(id, right) {
    const box = right ? Math.min((state[id]?.box ?? 0) + 1, WAIT_DAYS.length) : 0;
    state[id] = { box, due: Date.now() + WAIT_DAYS[Math.max(0, box - 1)] * DAY };
    save();
}

/** 'new', 'met' (opened, never answered right), 'learned' or 'solid' (right three times in a row or more). */
export function status(id) {
    const s = state[id];
    if (!s) return 'new';
    if (!s.box) return 'met';
    return s.box >= 3 ? 'solid' : 'learned';
}

export const learnedCount = () => LESSON_IDS.filter(id => state[id]?.box > 0).length;

/** The lesson most overdue for a check, or null. */
export function dueReview(now = Date.now()) {
    return LESSON_IDS.filter(id => state[id] && state[id].due <= now).sort((a, b) => state[a].due - state[b].due)[0] || null;
}
