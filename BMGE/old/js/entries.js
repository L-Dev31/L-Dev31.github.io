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
        // Pour MID : utiliser les mêmes règles que INF1 - tokens de liaison
        const linkPattern = /\[1A:(?:FF08|0108)\]\s*$/i;
        const hasLinkToken = linkPattern.test(last.text);

        if (hasLinkToken) {
          group.push(next);
          indices.push(j);
          processed.add(j);
          continue;
        }

        // Pas de séquence, on continue
        continue;
      }

      // Pour INF1 : critères STRICTS corrigés
      // Vérifier si le dernier se termine par un token de liaison
      const linkPattern = /\[1A:(?:FF08|0108)\]\s*$/i;
      const hasLinkToken = linkPattern.test(last.text);

      // ✅ CORRECTION : On vérifie d'abord le token de liaison
      if (hasLinkToken) {
        group.push(next);
        indices.push(j);
        processed.add(j);
        continue; // Important : continuer à chercher d'autres entries liées
      }

      // Si pas de token de liaison, on arrête la séquence pour ce groupe
      break;
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

  // Fusionner les groupes connectés
  for (let i = 0; i < groups.length - 1; i++) {
    const currentGroup = groups[i];

    for (let j = i + 1; j < groups.length; j++) {
      const nextGroup = groups[j];

      // Vérifier si le dernier élément du groupe actuel contient [1A:0108] et le premier du groupe suivant contient [1A:FF08]
      const lastEntry = currentGroup.entries[currentGroup.entries.length - 1];
      const firstEntry = nextGroup.entries[0];
      const hasEndToken = /\[1A:0108\]/i.test(lastEntry.text);
      const hasStartToken = /\[1A:FF08\]/i.test(firstEntry.text);

      if (hasEndToken && hasStartToken) {
        // Fusionner les groupes - le groupe actuel absorbe le groupe suivant
        currentGroup.entries.push(...nextGroup.entries);
        currentGroup.indices.push(...nextGroup.indices);
        
        // Marquer comme séquencé si ce n'était pas déjà le cas
        if (currentGroup.entries.length > 1) {
          currentGroup.isSequenced = true;
        }
        
        // Supprimer le groupe fusionné
        groups.splice(j, 1);
        j--; // Ajuster l'index après suppression
      } else {
        // Si pas de correspondance, arrêter la recherche pour ce groupe actuel
        break;
      }
    }
  }

  // 🔄 PHASE 2 : Fusionner les groupes connectés par [1A:0108] + [1A:FF08]
  const mergedGroups = [];
  let currentGroup = null;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];

    if (!currentGroup) {
      currentGroup = group;
      continue;
    }

    // Vérifier si le dernier de currentGroup se termine par [1A:0108]
    const lastEntry = currentGroup.entries[currentGroup.entries.length - 1];
    const has0108 = /\[1A:0108\]\s*$/i.test(lastEntry.text);

    // Vérifier si le premier de group commence par [1A:FF08]
    const firstEntry = group.entries[0];
    const startsWithFF08 = /^\s*\[1A:FF08\]/i.test(firstEntry.text);

    if (has0108 && startsWithFF08) {
      // Fusionner les groupes
      currentGroup.entries.push(...group.entries);
      currentGroup.indices.push(...group.indices);
    } else {
      // Pas de connexion, sauvegarder le groupe actuel et commencer un nouveau
      mergedGroups.push(currentGroup);
      currentGroup = group;
    }
  }

  // Ajouter le dernier groupe
  if (currentGroup) {
    mergedGroups.push(currentGroup);
  }

  return mergedGroups;
}

function detectScrollingGroups(entries) {
  const groups = [];
  const processed = new Set();

  if (!entries || entries.length === 0) return groups;

  // Only for MID entries
  const midEntries = entries.filter(e => e && e.kind === 'mid');
  if (midEntries.length < 2) return groups;

  for (let i = 0; i < midEntries.length; i++) {
    if (processed.has(i)) continue;

    const entry = midEntries[i];
    const variants = generateScrollingVariants(entry.text);
    
    if (variants.length < 2) continue;
    
    const group = [entry];
    const indices = [entries.indexOf(entry)];
    let matchedVariants = 1; // First variant is the original text
    
    // Check subsequent entries to see if they match the scrolling variants
    for (let j = i + 1; j < midEntries.length && matchedVariants < variants.length; j++) {
      if (processed.has(j)) continue;
      
      const nextEntry = midEntries[j];
      const expectedVariant = variants[matchedVariants];
      
      if (nextEntry.text === expectedVariant) {
        group.push(nextEntry);
        indices.push(entries.indexOf(nextEntry));
        processed.add(j);
        matchedVariants++;
      } else {
        break; // Stop if the sequence doesn't match
      }
    }
    
    if (group.length > 1) {
      groups.push({
        entries: group,
        indices: indices,
        isScrolling: true
      });
    }
    
    processed.add(i);
  }

  return groups;
}

function generateScrollingVariants(text) {
  const variants = [text];
  let current = text;
  
  while (current.length > 0) {
    const lines = current.split('\n');
    if (lines[0].length > 0) {
      lines[0] = lines[0].slice(1);
      current = lines.join('\n');
    } else if (lines.length > 1) {
      lines.shift();
      current = lines.join('\n');
    } else {
      break;
    }
    
    if (current.trim().length > 0) {
      variants.push(current);
    }
  }
  
  return variants;
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

function detectMixedSequencedGroups(infEntries, midEntries) {
  const groups = [];
  const processed = new Set();
  
  if ((!infEntries || infEntries.length === 0) && (!midEntries || midEntries.length === 0)) return groups;
  
  // Combine and sort all entries by offset
  const allEntries = [];
  (infEntries || []).forEach((entry, index) => {
    allEntries.push({ entry, originalIndex: index, kind: 'inf' });
  });
  (midEntries || []).forEach((entry, index) => {
    allEntries.push({ entry, originalIndex: index, kind: 'mid' });
  });
  
  allEntries.sort((a, b) => {
    const aOffset = a.entry.offset || a.entry.originalOffset || 0;
    const bOffset = b.entry.offset || b.entry.originalOffset || 0;
    return aOffset - bOffset;
  });

  for (let i = 0; i < allEntries.length; i++) {
    if (processed.has(i)) continue;

    const current = allEntries[i];
    const group = [current];
    const indices = [{ kind: current.kind, index: current.originalIndex }];

    for (let j = i + 1; j < allEntries.length; j++) {
      if (processed.has(j)) continue;

      const next = allEntries[j];
      const last = group[group.length - 1];

      // Check for link tokens [1A:FF08] or [1A:0108] anywhere in the last entry's text
      const linkPattern = /\[1A:(?:FF08|0108)\]/i;
      const hasLinkToken = linkPattern.test(last.entry.text);

      if (hasLinkToken) {
        group.push(next);
        indices.push({ kind: next.kind, index: next.originalIndex });
        processed.add(j);
        continue;
      }

      // If no link token, stop the sequence
      break;
    }

    if (group.length > 1) {
      groups.push({
        entries: group.map(item => item.entry),
        indices: indices,
        isMixedSequenced: true,
        mixedTypes: [...new Set(group.map(item => item.kind))]
      });
    }

    processed.add(i);
  }

  return groups;
}

export { resolveEntry, detectSequencedGroups, detectMixedSequencedGroups, detectScrollingGroups, countVisibleCharacters, splitPreservingTokens, getMidGroupForId, addMidGroupPair, removeIdFromGroups, generateScrollingVariants };