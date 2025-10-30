import { state } from './state.js';
import { tokenRegex, parseSpecialToken } from './tokens.js';
import { hasSpecialTokens } from './ui.js';

function resolveEntry(kind, id) {
  const num = Number(id);
  if (Number.isNaN(num) || num < 0) return null;
  if (kind === 'mid') {
    const byId = (state.midStrings || []).find(e => e.id === num);
    if (byId) return byId;
    return state.midStrings?.[num] ?? null;
  }
  return state.entries?.[num] ?? (state.entries || []).find(e => e.id === num) ?? null;
}

function detectSequencedGroups(entries) {
  const groups = [];
  const processed = new Set();

  if (!entries || entries.length === 0) return groups;

  const isMidCollection = entries.every(e => e && e.kind === 'mid') || (entries[0] && entries[0].kind === 'mid');

  for (let i = 0; i < entries.length; i++) {
    if (processed.has(i)) continue;

    const entry = entries[i];
    const group = [entry];
    const indices = [i];

    for (let j = i + 1; j < entries.length; j++) {
      if (processed.has(j)) continue;

      const next = entries[j];
      const last = group[group.length - 1];

      if (isMidCollection) {
        // Pour MID : critères STRICTS
        let isSequential = false;

        // Critère 1 : Offsets contigus (fin de l'un = début de l'autre)
        if (typeof last.offset === 'number' && typeof next.offset === 'number') {
          const lastEnd = last.offset + (last.byteLength || 0);
          if (next.offset === lastEnd) {
            isSequential = true;
          }
        }

        // Critère 2 : Token de liaison explicite [1A:FF08] ou [1A:0108] à la fin
        if (!isSequential) {
          const linkPattern = /\[1A:(?:FF08|0108)\]\s*$/i;
          if (linkPattern.test(last.text)) {
            isSequential = true;
          }
        }

        if (isSequential) {
          group.push(next);
          indices.push(j);
          processed.add(j);
          continue;
        }

        // Pas de séquence, on continue
        continue;
      }

      // Pour INF1 : critères STRICTS aussi
      const hasControlCodes = hasSpecialTokens(last.text) || hasSpecialTokens(next.text);
      if (!hasControlCodes) continue;

      // Vérifier si le dernier se termine par un token de liaison
      const linkPattern = /\[1A:(?:FF08|0108)\]\s*$/i;
      const endsWithLink = linkPattern.test(last.text);

      if (endsWithLink) {
        group.push(next);
        indices.push(j);
        processed.add(j);
      }
    }

    if (group.length > 1) {
      groups.push({
        entries: group,
        indices: indices,
        isSequenced: true
      });
    } else {
      groups.push({
        entries: [entry],
        indices: [i],
        isSequenced: false
      });
    }

    processed.add(i);
  }

  return groups;
}

function countVisibleCharacters(text) {
  const source = typeof text === 'string' ? text : '';
  const regex = tokenRegex();
  const canonical = source.replace(regex, (match, label) => {
    const parsed = parseSpecialToken(label ?? '');
    return parsed ? '◉' : match;
  });
  return Array.from(canonical).length;
}

function splitPreservingTokens(fullText, desiredVisibleCounts) {
  const regex = tokenRegex();
  let lastIndex = 0;
  let match;
  const segments = [];
  while ((match = regex.exec(fullText)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: fullText.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'token', text: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < fullText.length) {
    segments.push({ type: 'text', text: fullText.slice(lastIndex) });
  }

  function consumeVisible(cursor, need) {
    let { segIndex, charOffset } = cursor;
    let out = '';
    while (need > 0 && segIndex < segments.length) {
      const seg = segments[segIndex];
      if (seg.type === 'token') {
        out += seg.text;
        segIndex += 1;
        charOffset = 0;
        continue;
      }
      const text = seg.text;
      const available = text.length - charOffset;
      if (available <= 0) {
        segIndex += 1;
        charOffset = 0;
        continue;
      }
      const take = Math.min(need, available);
      out += text.slice(charOffset, charOffset + take);
      need -= take;
      charOffset += take;
      if (charOffset >= text.length) {
        segIndex += 1;
        charOffset = 0;
      }
    }
    while (segIndex < segments.length && segments[segIndex].type === 'token') {
      out += segments[segIndex].text;
      segIndex += 1;
    }
    return { out, cursor: { segIndex, charOffset } };
  }

  const parts = [];
  let cursor = { segIndex: 0, charOffset: 0 };
  for (let i = 0; i < desiredVisibleCounts.length; i += 1) {
    const want = Math.max(0, desiredVisibleCounts[i] || 0);
    const { out, cursor: next } = consumeVisible(cursor, want);
    parts.push(out);
    cursor = next;
  }
  let remainder = '';
  while (cursor.segIndex < segments.length) {
    remainder += segments[cursor.segIndex].text.slice(cursor.charOffset);
    cursor.segIndex += 1;
    cursor.charOffset = 0;
  }
  if (remainder.length) {
    if (parts.length === 0) parts.push(remainder); 
    else parts[parts.length - 1] += remainder;
  }
  return parts;
}

function getMidGroupForId(id) {
  const groups = state.midGroups || [];
  for (let i = 0; i < groups.length; i += 1) {
    if (groups[i].includes(id)) return groups[i];
  }
  return null;
}

function removeIdFromGroups(id) {
  const groups = state.midGroups || [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const idx = groups[i].indexOf(id);
    if (idx >= 0) {
      groups[i].splice(idx, 1);
      if (groups[i].length < 2) {
        groups.splice(i, 1);
      }
    }
  }
}

function addMidGroupPair(a, b) {
  if (a === b) return;
  state.midGroups = state.midGroups || [];
  const ga = getMidGroupForId(a);
  const gb = getMidGroupForId(b);
  if (ga && gb) {
    if (ga === gb) return;
    ga.push(...gb.filter(x => !ga.includes(x)));
    state.midGroups = state.midGroups.filter(g => g !== gb);
    return;
  }
  if (ga && !gb) {
    if (!ga.includes(b)) ga.push(b);
    return;
  }
  if (!ga && gb) {
    if (!gb.includes(a)) gb.unshift(a);
    return;
  }
  state.midGroups.push([a, b]);
}

export { resolveEntry, detectSequencedGroups, countVisibleCharacters, splitPreservingTokens, getMidGroupForId, addMidGroupPair, removeIdFromGroups };