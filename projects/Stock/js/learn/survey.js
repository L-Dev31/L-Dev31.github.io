// "About you", asked by Nemeris one question at a time, the Academy's way: her bubble, lettered answers, a slide to the next.
// A card in Settings starts it. The form stays the record: an answer ticks its radio and the form saves itself as before. Always in the app's own violet.
import { el, icon } from '../core/utils.js';
import { L } from '../i18n/i18n.js';
import { teacher, talk, react, afterWords, slide } from './academy-page.js';

/** Turns the form's multiple-choice questions into Nemeris's player, started from a card. Returns reset(), which shows the card again. */
export function mountSurvey(form) {
    const questions = [...form.querySelectorAll('.question')];
    if (!questions.length) return () => {};
    for (const n of [...questions, ...form.querySelectorAll(':scope > h3')]) n.hidden = true;

    const answered = q => !!q.querySelector('input:checked');
    const nemeris = teacher();
    const fill = el('div', 'pbar-fill');
    const track = el('div', 'pbar-track');
    track.append(fill);
    const count = el('span', 'meta');
    const top = el('div', 'learn-top');
    top.append(track, count);
    const stage = el('div', 'learn-stage');
    const back = el('button', 'btn learn-back');
    back.type = 'button';
    back.append(icon('chevron-left'), L('Back'));
    const next = el('button', 'btn learn-next');
    next.type = 'button';
    const nav = el('div', 'learn-nav');
    nav.append(back, next);
    const box = el('div', 'learn-play survey');
    box.append(top, stage, nav);
    stage.addEventListener('click', () => box.classList.add('skip'));
    const intro = el('div', 'survey-intro');
    const blurb = el('p', 'survey-blurb');
    const start = el('button', 'btn');
    start.type = 'button';
    intro.append(teacher(), blurb, start);
    questions[0].before(intro, box);

    let at = 0, busy = false;

    function ask(q) {
        count.textContent = `${at + 1} / ${questions.length}`;
        back.hidden = at === 0;
        const row = talk(q.querySelector('legend').textContent, nemeris);
        const options = el('div', 'quiz-options');
        for (const input of q.querySelectorAll('input[type="radio"]')) {
            const b = el('button', 'quiz-option', input.nextElementSibling.textContent);
            b.type = 'button';
            b.classList.toggle('is-chosen', input.checked);
            b.addEventListener('click', () => {
                input.checked = true;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                for (const o of options.children) o.classList.toggle('is-chosen', o === b);
                react(nemeris, 'happy');
                next.hidden = false;
            });
            options.append(b);
        }
        stage.replaceChildren(row, ...afterWords(row, [options]));
        next.textContent = L('Next');
        next.hidden = !answered(q);
    }

    function thanks() {
        count.textContent = '';
        back.hidden = false;
        stage.replaceChildren(talk(L('Thank you, that is all I needed. My advice now fits your situation. Change an answer whenever you like.'), nemeris));
        react(nemeris, 'happy');
        next.textContent = L('Done');
        next.hidden = false;
    }

    function draw() {
        box.classList.remove('skip');
        fill.style.transform = `scaleX(${Math.min(at, questions.length) / questions.length})`;
        if (at < questions.length) ask(questions[at]);
        else thanks();
    }

    async function go(to, dir) {
        if (busy) return;
        busy = true;
        await slide(stage, dir, () => { at = to; draw(); });
        busy = false;
    }

    next.addEventListener('click', () => (at < questions.length ? go(at + 1, 1) : reset()));
    back.addEventListener('click', () => go(at - 1, -1));

    function launch() {
        const first = questions.findIndex(q => !answered(q));
        at = first < 0 ? 0 : first;
        intro.hidden = true;
        box.hidden = false;
        draw();
    }
    function reset() {
        const done = questions.every(answered);
        blurb.textContent = done ? L('Your answers shape my advice. Change any of them whenever you like.') : L('A few questions about your money and your goals, so my advice fits you.');
        start.textContent = done ? L('Change my answers') : questions.some(answered) ? L('Continue the questionnaire') : L('Start the questionnaire');
        intro.hidden = false;
        box.hidden = true;
    }
    start.addEventListener('click', launch);
    reset();
    return reset;
}
