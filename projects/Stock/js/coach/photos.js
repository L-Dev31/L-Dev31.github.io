// Photos that show a subject at a glance (a bank, a calendar, bitcoin...): across the top of Home cards, in lessons.
// Source: Openverse (openly licensed images, free, no key). With an Unsplash access key (free at
// unsplash.com/developers, "demo" apps allow 50 searches an hour) Unsplash photos are used instead.
// Each subject is searched once and kept for 30 days; the credit shows on the photo.
import { el } from '../core/utils.js';

const UNSPLASH_KEY = '';
const KEY = 'nemeris_card_photos';
const KEEP = 30 * 86400000;

let saved;
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
const pending = new Map();

async function fromUnsplash(query) {
    const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape&content_filter=high&client_id=${UNSPLASH_KEY}`);
    const p = r.ok ? (await r.json()).results?.[0] : null;
    return p && { src: `${p.urls.raw}&w=960&h=400&fit=crop&auto=format`, credit: `${p.user.name} / Unsplash`, link: `${p.links.html}?utm_source=nemeris&utm_medium=referral` };
}

async function fromOpenverse(query) {
    const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=5&aspect_ratio=wide&license_type=commercial&mature=false`);
    const p = r.ok ? (await r.json()).results?.find(x => x.thumbnail) : null;
    return p && { src: p.thumbnail, credit: `${p.creator || p.source} · ${String(p.license || '').toUpperCase()} ${p.license_version || ''}`.trim(), link: p.foreign_landing_url };
}

/** { src, credit, link } for a subject, or null when nothing loads (the card then simply shows no photo). */
export function photoFor(query) {
    const hit = saved[query];
    if (hit && Date.now() - hit.t < KEEP) return Promise.resolve(hit.photo);
    if (!pending.has(query)) {
        pending.set(query, (UNSPLASH_KEY ? fromUnsplash(query) : fromOpenverse(query))
            .catch(() => null)
            .then(photo => {
                if (photo) {
                    saved[query] = { t: Date.now(), photo };
                    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage full */ }
                }
                return photo;
            }));
    }
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
