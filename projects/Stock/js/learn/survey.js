// "About you", asked by Nemeris one question at a time, the Academy's way: her bubble, lettered answers, a slide to the next.
// The form stays the record: an answer ticks its radio and the form saves itself as before. Always in the app's own violet.
import { el, icon } from '../core/utils.js';
import { L } from '../i18n/i18n.js';
import { teacher, talk, react, afterWords, slide } from './academy-page.js';

/** Turns the form's multiple-choice questions into Nemeris's player. Returns restart(), which goes to the first unanswered one. */
export function mountSurvey(form) {
    const questions = [...form.querySelectorAll('.question')];
    if (!questions.length) return () => {};
    // general.js can run twice: the second player replaces the first.
    form.querySelector('.survey')?.remove();
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
    questions[0].before(box);

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
                setTimeout(() => go(at + 1, 1), 450);
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
        next.textContent = L('Change an answer');
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

    next.addEventListener('click', () => go(at < questions.length ? at + 1 : 0, 1));
    back.addEventListener('click', () => go(at - 1, -1));

    const restart = () => {
        const first = questions.findIndex(q => !answered(q));
        at = first < 0 ? questions.length : first;
        draw();
    };
    restart();
    return restart;
}
