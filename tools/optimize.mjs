#!/usr/bin/env node
/**
 * Optimisation routine of the portfolio: CSS, HTML and JS.
 *
 *     npm run optimize    builds the optimised copy of the site in dist/ and prints what it saved
 *     npm run audit       lists the dead weight still in the sources: unused CSS and JS, files that
 *                         nothing references, broken references and the heaviest files
 *
 * The sources are never rewritten, they stay readable. dist/ is generated and git-ignored.
 *
 * What the build does
 *     html   comments and useless whitespace removed, inline CSS / JS / JSON-LD minified
 *     css    minified, no syntax lowering (the stylesheets already target current browsers)
 *     js     the module entries of the site's own pages are bundled, the code they share goes in
 *            chunks that the page preloads with its script (no chain of imports to wait for);
 *            the other scripts (the demos) are only minified
 *     json   compacted
 *     rest   copied untouched
 *   Every reference of dist/ is then checked: the build fails if it introduces a broken link.
 *
 * Needs `npm install` once (esbuild, html-minifier-terser, purgecss, postcss).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const need = async name => {
    try { return await import(name); } catch (error) {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
        console.error(`"${name}" is missing, run: npm install`);
        process.exit(1);
    }
};
const { build: bundle, transform, transformSync } = await need('esbuild');
const { minify: minifyMarkup } = await need('html-minifier-terser');
const { PurgeCSS } = await need('purgecss');
const { default: postcss } = await need('postcss');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ORIGIN = 'https://l-dev31.github.io/';
const LEFT_OUT_DIRS = new Set(['node_modules', 'dist', 'tools', '_backups']); // dot-folders (.git, .vscode, ...) are left out too
const LEFT_OUT_FILES = /^(package(-lock)?\.json|\.gitignore|.*\.md)$/i;
const TEXT = /\.(html|css|js|json)$/i;
// classes that a library puts on the page while it runs, so no file of the site mentions them
const RUNTIME_CLASSES = [/lenis/];

// ---------------------------------------------------------------- files

/** Every file the site serves, as sorted paths relative to `base`. */
async function listFiles(base = ROOT, dir = base) {
    const found = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!(dir === base && (LEFT_OUT_DIRS.has(entry.name) || entry.name.startsWith('.')))) found.push(...await listFiles(base, full));
        } else if (!LEFT_OUT_FILES.test(entry.name)) {
            found.push(path.relative(base, full).split(path.sep).join('/'));
        }
    }
    return found.sort();
}

const readText = (base, file) => fs.readFile(path.join(base, file), 'utf8');
const ext = file => path.extname(file).slice(1).toLowerCase();
/** '' for the site itself, 'projects/demos/<id>' for a demo (a standalone site of its own). */
const siteOf = file => (file.startsWith('projects/demos/') ? file.split('/').slice(0, 3).join('/') : '');

// ---------------------------------------------------------------- sizes

const zero = () => ({ raw: 0, gzip: 0, brotli: 0 });
const plus = (a, b) => ({ raw: a.raw + b.raw, gzip: a.gzip + b.gzip, brotli: a.brotli + b.brotli });
const packed = data => {
    const buffer = Buffer.from(data);
    return {
        raw: buffer.length,
        gzip: zlib.gzipSync(buffer, { level: 9 }).length,
        brotli: zlib.brotliCompressSync(buffer, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    };
};
const kb = bytes => (bytes / 1024).toFixed(1);
const size = bytes => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${kb(bytes)} KB`);
const saved = (before, after) => (before ? `${Math.round((1 - after / before) * 100)}%` : '-');

// ---------------------------------------------------------------- minifiers

const minifyCss = css => transformSync(css, { loader: 'css', minify: true, charset: 'utf8', legalComments: 'none' }).code.trim();
const minifyJs = js => transformSync(js, { loader: 'js', minify: true, charset: 'utf8', legalComments: 'none' }).code.trim();

const HTML_OPTIONS = {
    collapseWhitespace: true,
    conservativeCollapse: true, // keeps the one space that separates two inline items, so the layout does not move
    removeComments: true,
    collapseBooleanAttributes: true, // defer="defer" -> defer (otherwise the minifier writes it out in full)
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    minifyCSS: (css, type) => (type === 'inline' ? css : minifyCss(css)),
    minifyJS: (js, inline) => (inline ? js : minifyJs(js)),
};

async function minifyHtml(html) {
    const out = await minifyMarkup(html, HTML_OPTIONS);
    // structured data is plain JSON, which the HTML minifier leaves alone
    return out.replace(/(<script[^>]*application\/ld\+json[^>]*>)([\s\S]*?)(<\/script>)/gi, (whole, open, body, close) => {
        try { return open + JSON.stringify(JSON.parse(body)) + close; } catch { return whole; }
    });
}

/** The module scripts of the site's own pages: those are bundled, the demos' scripts are not. */
async function moduleEntries(files) {
    const entries = new Set();
    for (const file of files.filter(f => ext(f) === 'html' && !f.includes('/'))) {
        for (const [, attributes] of (await readText(ROOT, file)).matchAll(/<script\b([^>]*)>/gi)) {
            const source = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
            if (source && /\btype\s*=\s*["']?module/i.test(attributes) && !/^(?:[a-z]+:)?\/\//i.test(source)) entries.add(path.posix.normalize(source));
        }
    }
    return [...entries];
}

/** The chunks an entry imports at load time, with its dependencies: the page can preload them in parallel. */
function staticChunks(metafile, entryOutput) {
    const seen = new Set();
    const visit = output => {
        for (const link of metafile.outputs[output]?.imports ?? []) {
            if (link.kind === 'import-statement' && !seen.has(link.path)) { seen.add(link.path); visit(link.path); }
        }
    };
    visit(entryOutput);
    return [...seen].map(chunk => chunk.replace(/^dist\//, ''));
}

/** Puts a modulepreload hint before each bundled module script, so its chunks are fetched together with it. */
function withPreloads(file, html, preloads) {
    const folder = path.posix.dirname(file);
    return html.replace(/<script\b([^>]*)>/gi, (tag, attributes) => {
        const source = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
        const chunks = source && /\btype\s*=\s*["']?module/i.test(attributes) ? preloads.get(path.posix.normalize(path.posix.join(folder, source))) : null;
        return chunks?.length ? chunks.map(chunk => `<link rel="modulepreload" href="${path.posix.relative(folder, chunk)}">`).join('') + tag : tag;
    });
}

// ---------------------------------------------------------------- references

const LOCAL_URL = /^(?!#|\/\/|[a-z][a-z0-9+.-]*:)/i;
const SITE_PATH = /^(?:assets|projects)\/[^\s"'`$]+\.[a-z0-9]+$/i;

/** Files named by a text file, as [path, kind] pairs where kind says how the page reaches them. */
function referencesIn(file, text) {
    const found = new Set();
    // the case studies are fragments injected into project.html, so their paths start from the site root
    const base = file.startsWith('projects/cases/') ? '' : path.posix.dirname(file);
    const add = value => {
        const clean = value.trim().split('#')[0].split('?')[0];
        if (!clean || !LOCAL_URL.test(clean)) return;
        found.add(clean.startsWith('/') ? clean.slice(1) : path.posix.normalize(path.posix.join(base, clean)));
    };
    switch (ext(file)) {
        case 'html':
            for (const [, , value] of text.matchAll(/\b(?:src|href|poster|data-picture|data-src)\s*=\s*(["'])(.*?)\1/gi)) add(value);
            for (const [, , value] of text.matchAll(/\bsrcset\s*=\s*(["'])(.*?)\1/gi)) value.split(',').forEach(part => add(part.trim().split(/\s+/)[0]));
            for (const [, own] of text.matchAll(new RegExp(`${ORIGIN.replace(/[./]/g, '\\$&')}([^"'\\s<>#?]+)`, 'gi'))) found.add(own);
            break;
        case 'css':
            for (const [, , value] of text.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) add(value);
            break;
        case 'js':
            // only literal paths from the site root; the ones built with ${} are checked through the data files
            for (const [, , value] of text.matchAll(/(["'`])((?:assets|projects)\/[^"'`\s$]+\.[a-z0-9]+)\1/gi)) found.add(value);
            // a path with a ${} in it names a whole family of files
            for (const [, value] of text.matchAll(/`((?:assets|projects)\/[^`]*\$\{[^`]*)`/g)) found.add(`~${value.replace(/[.*+?^()|[\]\\]/g, '\\$&').replace(/\$\{[^}]*\}/g, '[^/]+')}`);
            break;
        case 'json': {
            const visit = node => {
                if (typeof node === 'string') { if (SITE_PATH.test(node)) found.add(node); }
                else if (node && typeof node === 'object') Object.values(node).forEach(visit);
            };
            try { visit(JSON.parse(text)); } catch { /* not valid JSON: nothing to read */ }
            break;
        }
    }
    return found;
}

/** The files the culture lists look for by convention (see fetch-covers.py and fetch-previews.py). */
function cultureFiles(json) {
    const data = JSON.parse(json);
    return [
        ...['films', 'books'].flatMap(kind => (data[kind] ?? []).map(item => `assets/images/culture/${kind}/${item.id}.webp`)),
        ...(data.games ?? []).map(item => `assets/videos/culture/${item.id}.mp4`),
    ];
}

/** Every reference of the tree at `base`: { from, to } pairs, plus the set of files that exist. */
async function collectReferences(base, files) {
    const exists = new Set(files);
    const links = [];
    const patterns = [];
    for (const file of files.filter(f => TEXT.test(f))) {
        const text = await readText(base, file);
        for (const to of referencesIn(file, text)) {
            if (to.startsWith('~')) patterns.push(new RegExp(`^${to.slice(1)}$`));
            else links.push({ from: file, to });
        }
        if (file === 'assets/data/culture.json') for (const to of cultureFiles(text)) links.push({ from: file, to });
    }
    const reachable = to => exists.has(to) || exists.has(`${to.replace(/\/$/, '')}/index.html`);
    return { links, patterns, missing: links.filter(link => !reachable(link.to)) };
}

// ---------------------------------------------------------------- build

async function build() {
    const started = performance.now();
    const files = await listFiles();
    await fs.rm(DIST, { recursive: true, force: true });

    const table = Object.fromEntries(['html', 'css', 'js', 'json'].map(kind => [kind, { before: 0, after: 0, from: zero(), to: zero() }]));
    const done = new Set();
    const warnings = [];
    const emit = async (file, data, kind, source) => {
        await fs.mkdir(path.dirname(path.join(DIST, file)), { recursive: true });
        await fs.writeFile(path.join(DIST, file), data);
        done.add(file);
        if (kind) { table[kind].after++; table[kind].to = plus(table[kind].to, packed(data)); }
        if (source !== undefined) { table[kind].before++; table[kind].from = plus(table[kind].from, packed(source)); }
    };

    // js: the pages' modules are bundled and split in chunks, whatever is left is minified one file at a time
    const entries = await moduleEntries(files);
    const bundledInputs = new Set();
    const preloads = new Map(); // entry -> the chunks it needs at load time
    if (entries.length) {
        const result = await bundle({
            absWorkingDir: ROOT, entryPoints: entries, bundle: true, splitting: true, format: 'esm', outdir: 'dist', outbase: '.',
            entryNames: '[dir]/[name]', chunkNames: 'assets/scripts/[name]-[hash]', minify: true, charset: 'utf8', legalComments: 'none',
            target: 'esnext', write: false, metafile: true, logLevel: 'warning',
        });
        for (const output of result.outputFiles) await emit(path.relative(DIST, output.path).split(path.sep).join('/'), output.contents, 'js');
        for (const [output, info] of Object.entries(result.metafile.outputs)) if (entries.includes(info.entryPoint)) preloads.set(info.entryPoint, staticChunks(result.metafile, output));
        for (const input of Object.keys(result.metafile.inputs)) { bundledInputs.add(input); done.add(input); }
        for (const input of bundledInputs) {
            table.js.before++;
            table.js.from = plus(table.js.from, packed(await readText(ROOT, input)));
        }
    }
    for (const file of files.filter(f => ext(f) === 'js' && !bundledInputs.has(f))) {
        const source = await readText(ROOT, file);
        await emit(file, minifyJs(source), 'js', source);
    }

    for (const file of files.filter(f => ext(f) === 'css')) {
        const source = await readText(ROOT, file);
        await emit(file, minifyCss(source), 'css', source);
    }

    for (const file of files.filter(f => ext(f) === 'html')) {
        const source = await readText(ROOT, file);
        try {
            await emit(file, await minifyHtml(withPreloads(file, source, preloads)), 'html', source);
        } catch (error) {
            warnings.push(`${file}: left as it is (${error.message.split('\n')[0]})`);
            await emit(file, source, 'html', source);
        }
    }

    for (const file of files.filter(f => ext(f) === 'json')) {
        const source = await readText(ROOT, file);
        let compact = source;
        try { compact = JSON.stringify(JSON.parse(source)); } catch { warnings.push(`${file}: not valid JSON, left as it is`); }
        await emit(file, compact, 'json', source);
    }

    for (const file of files.filter(f => !done.has(f))) {
        await fs.mkdir(path.dirname(path.join(DIST, file)), { recursive: true });
        await fs.copyFile(path.join(ROOT, file), path.join(DIST, file), fs.constants.COPYFILE_FICLONE);
    }

    // nothing may point at a file the build left out
    const before = await collectReferences(ROOT, files);
    const after = await collectReferences(DIST, await listFiles(DIST, DIST));
    const alreadyBroken = new Set(before.missing.map(link => `${link.from}>${link.to}`));
    const introduced = after.missing.filter(link => !alreadyBroken.has(`${link.from}>${link.to}`));

    console.log(`dist/ built in ${((performance.now() - started) / 1000).toFixed(1)} s\n`);
    console.log('        files         raw KB              gzip KB             brotli KB');
    let total = { from: zero(), to: zero(), before: 0, after: 0 };
    for (const [kind, row] of Object.entries(table)) {
        total = { from: plus(total.from, row.from), to: plus(total.to, row.to), before: total.before + row.before, after: total.after + row.after };
        console.log(line(kind, row));
    }
    console.log(line('total', total));
    for (const [entry, chunks] of preloads) console.log(`${entry === entries[0] ? '\n' : ''}bundled ${entry} + ${chunks.length} chunk(s) preloaded with it`);
    for (const warning of warnings) console.log(`warning: ${warning}`);
    if (before.missing.length) console.log(`\n${before.missing.length} reference(s) already broken in the sources, see: npm run audit`);
    if (introduced.length) {
        console.log('\nbroken in dist/ only:');
        for (const link of introduced) console.log(`  ${link.from} -> ${link.to}`);
        process.exitCode = 1;
    }
}

const line = (name, row) => {
    const cell = key => `${kb(row.from[key]).padStart(7)} → ${kb(row.to[key]).padStart(7)} ${saved(row.from[key], row.to[key]).padStart(4)}`;
    return `${name.padEnd(6)} ${`${row.before}→${row.after}`.padStart(6)}  ${cell('raw')}   ${cell('gzip')}   ${cell('brotli')}`;
};

// ---------------------------------------------------------------- audit

/** Selectors that no html, js or data file of the same site can reach, found by purgecss. */
async function unusedSelectors(files, texts) {
    const report = [];
    for (const site of new Set(files.filter(f => ext(f) === 'css').map(siteOf))) {
        const inSite = files.filter(f => siteOf(f) === site);
        const content = inSite.filter(f => ['html', 'js', 'json'].includes(ext(f))).map(f => ({ raw: texts.get(f), extension: ext(f) === 'json' ? 'html' : ext(f) }));
        for (const file of inSite.filter(f => ext(f) === 'css')) {
            const [result] = await new PurgeCSS().purge({
                content, css: [{ raw: texts.get(file) }], rejected: true, keyframes: false, fontFace: false, variables: false, safelist: { greedy: RUNTIME_CLASSES },
            });
            const tidy = selector => selector.replace(/\s+/g, ' ').trim();
            const lines = new Map(); // selector -> the lines of the rules that carry it, in order
            postcss.parse(texts.get(file)).walkRules(rule => {
                if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
                for (const selector of rule.selectors) lines.set(tidy(selector), [...(lines.get(tidy(selector)) ?? []), rule.source.start.line]);
            });
            for (const rejected of result.rejected ?? []) {
                const selector = tidy(rejected);
                if (/^(?:::?[\w-]+(?:\([^)]*\))?)+$/.test(selector)) continue; // pseudo-classes alone (:focus-visible) match any element
                const where = lines.get(selector) ?? [];
                report.push({ file, line: where.length > 1 ? where.shift() : where[0] ?? 0, what: selector });
            }
        }
    }
    return report;
}

/** Keyframes and custom properties declared in a stylesheet and never used by it or by a script. */
function unusedDefinitions(files, texts) {
    const report = [];
    for (const site of new Set(files.filter(f => ext(f) === 'css').map(siteOf))) {
        const inSite = files.filter(f => siteOf(f) === site && ['css', 'js', 'html'].includes(ext(f)));
        const all = inSite.map(f => texts.get(f)).join('\n');
        for (const file of inSite.filter(f => ext(f) === 'css')) {
            const css = texts.get(file);
            const where = index => css.slice(0, index).split('\n').length;
            for (const match of css.matchAll(/@keyframes\s+([\w-]+)/g)) {
                // the name appears once, in its own declaration
                if ([...all.matchAll(new RegExp(`(?<![\\w-])${match[1]}(?![\\w-])`, 'g'))].length === 1) report.push({ file, line: where(match.index), what: `@keyframes ${match[1]}` });
            }
            const declared = new Set();
            for (const match of css.matchAll(/(--[\w-]+)\s*:/g)) {
                if (declared.has(match[1])) continue;
                declared.add(match[1]);
                // a use is any mention that is not a declaration: var(--x), or the name in a script
                const uses = [...all.matchAll(new RegExp(`${match[1]}(?![\\w-])(?!\\s*:)`, 'g'))].length;
                if (!uses) report.push({ file, line: where(match.index), what: `${match[1]} (custom property)` });
            }
        }
    }
    return report;
}

/** The same property given the same value twice in one rule, and rules with nothing inside. */
function redundantCss(files, texts) {
    const report = [];
    for (const file of files.filter(f => ext(f) === 'css')) {
        postcss.parse(texts.get(file)).walkRules(rule => {
            if (!rule.nodes.length) report.push({ file, line: rule.source.start.line, what: `${rule.selector} { }  (empty)` });
            const seen = new Map();
            rule.walkDecls(decl => {
                if (decl.parent !== rule) return;
                const key = `${decl.prop.toLowerCase()}:${decl.value}`;
                if (seen.has(key)) report.push({ file, line: decl.source.start.line, what: `${rule.selector} repeats "${decl.prop}: ${decl.value}"` });
                seen.set(key, true);
            });
        });
    }
    return report;
}

/** Functions, classes and variables whose name appears nowhere else in the scripts of their site. */
async function unusedScriptNames(files, texts) {
    const report = [];
    for (const site of new Set(files.filter(f => ext(f) === 'js').map(siteOf))) {
        const inSite = files.filter(f => siteOf(f) === site && ['js', 'html'].includes(ext(f)));
        const bare = new Map(); // the scripts without their comments, which would count as uses
        for (const file of inSite) {
            // an import line does not count as a use of what it imports
            const code = ext(file) === 'js' ? (await transform(texts.get(file), { loader: 'js', charset: 'utf8' })).code : texts.get(file);
            bare.set(file, code.replace(/\bimport\s*(?:[\w$*\s{},]*?\s*from\s*)?(["'])[^"']+\1/g, ''));
        }
        const counts = new Map();
        for (const code of bare.values()) for (const [word] of code.matchAll(/[A-Za-z_$][\w$]*/g)) counts.set(word, (counts.get(word) ?? 0) + 1);
        for (const file of inSite.filter(f => ext(f) === 'js')) {
            const names = new Set();
            for (const [, name] of bare.get(file).matchAll(/\b(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(name);
            for (const [, list] of bare.get(file).matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
                for (const part of list.split(',')) { const name = part.split('=')[0].split(':').pop().trim(); if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name); }
            }
            for (const name of names) {
                if (counts.get(name) !== 1) continue;
                const at = texts.get(file).split('\n').findIndex(row => new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(row));
                report.push({ file, line: at + 1, what: name });
            }
        }
    }
    return report;
}

async function audit() {
    const files = await listFiles();
    const texts = new Map();
    for (const file of files.filter(f => TEXT.test(f))) texts.set(file, await readText(ROOT, file));
    const show = (title, rows, note = '') => {
        console.log(`\n${title}${rows.length ? ` (${rows.length})` : ''}${note ? `  ${note}` : ''}`);
        if (!rows.length) console.log('  none');
        for (const row of rows) console.log(`  ${row.file}${row.line ? `:${row.line}` : ''}  ${row.what}`);
    };

    show('CSS: selectors no html, js or data file can reach', await unusedSelectors(files, texts), '(check for class names built at runtime before deleting)');
    show('CSS: keyframes and custom properties never used', unusedDefinitions(files, texts));
    show('CSS: repeated declarations and empty rules', redundantCss(files, texts));
    show('JS: names declared and never used again', await unusedScriptNames(files, texts));

    const { links, patterns, missing } = await collectReferences(ROOT, files);
    show('References to files that do not exist', missing.map(link => ({ file: link.from, line: 0, what: `-> ${link.to}` })));

    const used = new Set(links.map(link => link.to));
    const orphans = files.filter(f => (f.startsWith('assets/') && !TEXT.test(f) || f.startsWith('projects/cases/files/')) && !used.has(f) && !patterns.some(pattern => pattern.test(f)));
    show('Files nothing refers to', orphans.map(file => ({ file, line: 0, what: '' })), '(delete by hand once you are sure)');

    const heavy = await Promise.all(files.map(async file => ({ file, bytes: (await fs.stat(path.join(ROOT, file))).size })));
    console.log('\nHeaviest files (the build leaves these untouched)');
    for (const { file, bytes } of heavy.sort((a, b) => b.bytes - a.bytes).slice(0, 8)) {
        const hint = { otf: 'woff2 would be about half', ttf: 'woff2 would be about half', png: 'webp would be lighter', jpg: 'webp would be lighter' }[ext(file)] ?? '';
        console.log(`  ${size(bytes).padStart(9)}  ${file}${hint ? `  (${hint})` : ''}`);
    }
}

// ---------------------------------------------------------------- main

const commands = { build, audit };
const command = process.argv[2] ?? 'build';
if (!commands[command]) {
    console.log('usage: node tools/optimize.mjs [build|audit]');
    process.exit(command === 'help' || command === '--help' ? 0 : 1);
}
await commands[command]();
