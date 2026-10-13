// Everything Nemeris' AI is told lives in knowledge/nemeris.md: one "## name" block per part of a prompt,
// {word} filled in at use. This module loads the file once; the code only assembles blocks around live figures.
const blocks = {};

/** Reads the file's text into blocks. Exported so a test bench outside the browser can feed it the file. */
export function useKnowledge(text) {
    const clean = String(text).replace(/<!--[\s\S]*?-->/g, '');
    for (const part of clean.split(/^## /m).slice(1)) {
        const end = part.indexOf('\n');
        blocks[part.slice(0, end).trim()] = part.slice(end + 1).trim();
    }
}

export const knowledgeReady = typeof document === 'undefined'
    ? Promise.resolve()
    : fetch('knowledge/nemeris.md', { cache: 'no-cache' }).then(r => r.text()).then(useKnowledge).catch(() => {});

export const hasBlock = name => name in blocks;

/** A block with its {words} filled in, or '' when there is no such block. */
export function know(name, words = {}) {
    return (blocks[name] || '').replace(/\{(\w+)\}/g, (m, key) => (key in words ? String(words[key]) : m));
}
