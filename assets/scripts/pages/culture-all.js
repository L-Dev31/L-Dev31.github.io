import '../core/components.js';
import { initPage } from '../core/common.js';
import { thread, restDocks } from '../blocks/showcase.js';
import { el } from '../core/dom.js';

const TITLES = { films: 'All films', series: 'All series', anime: 'All anime', games: 'All games', books: 'All books' };

initPage();
thread(restDocks());

function parseCsv(text) {
    const rows = [];
    let row = [],
        cell = '',
        quoted = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (char === '"') quoted = false;
            else cell += char;
        } else if (char === '"') quoted = true;
        else if (char === ',') {
            row.push(cell);
            cell = '';
        } else if (char === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else if (char !== '\r') cell += char;
    }
    if (cell || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}

async function show() {
    const asked = new URLSearchParams(location.search).get('kind');
    const kind = TITLES[asked] ? asked : 'films';
    const pageTitle = `${TITLES[kind]} · Culture · Léo Tosku | Design, Dev, Marketing`;
    const description = `Complete list of ${kind}, curated by Léo Tosku.`;
    document.title = pageTitle;
    document.querySelector('meta[name="description"]').content = description;
    document.querySelector('meta[property="og:title"]').content = pageTitle;
    document.querySelector('meta[property="og:description"]').content = description;
    document.querySelector('meta[name="twitter:title"]').content = pageTitle;
    document.querySelector('meta[name="twitter:description"]').content = description;
    document.querySelector('#all-title').textContent = TITLES[kind];
    document.querySelectorAll('.all-tabs a').forEach(link => {
        if (link.dataset.kind === kind) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
    });
    const file = `assets/data/culture-${kind}.csv`;
    document.querySelector('.all-download').href = file;

    const [header, ...rows] = parseCsv(await (await fetch(file)).text());
    const table = document.querySelector('.all-table');
    const head = el('thead');
    const headRow = el('tr');
    headRow.append(...header.map(name => Object.assign(el('th', '', name), { scope: 'col' })));
    head.append(headRow);
    const body = el('tbody');
    for (const cells of rows) {
        const tr = el('tr');
        tr.append(...cells.map(text => el('td', '', text)));
        body.append(tr);
    }
    table.replaceChildren(head, body);
}

show();
