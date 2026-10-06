/*
  Dialogue text markup
    ~~text~~    italic, muted (narration / aside)
    **text**    bold
    ##text##    emphasis (caps)        + shake leger
    ###text###  shout (large caps)     + shake fort

  Markers can be nested, e.g. ~~Texte avec **gras** dedans.~~
*/

const TOKENS = [
  { delim: '###', open: '<span class="dm-shout">', close: '</span>', shake: 2, caps: true  },
  { delim: '##',  open: '<span class="dm-emph">',  close: '</span>', shake: 1, caps: true  },
  { delim: '~~',  open: '<em>',                    close: '</em>',   shake: 0, caps: false },
  { delim: '**',  open: '<strong>',                close: '</strong>', shake: 0, caps: false },
];

function findSegments(str) {
  const segs = [];
  for (const tok of TOKENS) {
    const d = tok.delim;
    let i = 0;
    while (i < str.length) {
      const start = str.indexOf(d, i);
      if (start < 0) break;
      const innerStart = start + d.length;
      const end = str.indexOf(d, innerStart);
      if (end < 0) break;
      if (end === innerStart) { i = end + d.length; continue; }
      segs.push({
        start,
        end:   end + d.length,
        inner: str.slice(innerStart, end),
        open:  tok.open,
        close: tok.close,
        shake: tok.shake,
        caps:  tok.caps,
        delim: d,
      });
      i = end + d.length;
    }
  }
  segs.sort((a, b) => a.start - b.start || b.end - a.end || b.delim.length - a.delim.length);
  const picked = [];
  let cursor = 0;
  for (const s of segs) {
    if (s.start < cursor) continue;
    picked.push(s);
    cursor = s.end;
  }
  return picked;
}

function tokeniseRange(str, forceCaps) {
  const out = [];
  const segs = findSegments(str);
  let cursor = 0;

  const pushPlain = (text) => {
    for (let i = 0; i < text.length; i++) {
      out.push({
        char:  forceCaps ? text[i].toUpperCase() : text[i],
        opens: [],
        closes: [],
        shake: 0,
      });
    }
  };

  for (const seg of segs) {
    if (seg.start > cursor) pushPlain(str.slice(cursor, seg.start));
    const inner = tokeniseRange(seg.inner, forceCaps || seg.caps);
    if (inner.length > 0) {
      inner[0].opens.unshift(seg.open);
      inner[0].shake = Math.max(inner[0].shake, seg.shake);
      inner[inner.length - 1].closes.push(seg.close);
      for (const t of inner) out.push(t);
    }
    cursor = seg.end;
  }
  if (cursor < str.length) pushPlain(str.slice(cursor));

  return out;
}

export function tokeniseMarkup(str) {
  if (!str) return [];
  return tokeniseRange(str, false);
}

function closeForOpen(open) {
  if (open.startsWith('<em')) return '</em>';
  if (open.startsWith('<strong')) return '</strong>';
  if (open.startsWith('<span')) return '</span>';
  return '';
}

export function renderFromTokens(tokens, count) {
  const end = count !== undefined ? count : tokens.length;
  let html = '';
  const openStack = [];
  for (let i = 0; i < end; i++) {
    const t = tokens[i];
    for (const o of t.opens) {
      html += o;
      openStack.push(closeForOpen(o));
    }
    html += escHtml(t.char);
    for (let k = 0; k < t.closes.length; k++) {
      html += t.closes[k];
      if (openStack.length) openStack.pop();
    }
  }
  for (let i = openStack.length - 1; i >= 0; i--) {
    html += openStack[i];
  }
  return html;
}

export function escHtml(c) {
  return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c;
}
