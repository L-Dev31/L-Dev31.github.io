/**
 * Group Segmentation System
 * Divise le texte des messages en segments basés sur les groupes de tokens BMG
 */

/**
 * Parse un message et le divise en segments basés sur les groupes de tokens
 * @param {string} text - Le texte du message avec les tags
 * @returns {Array<{text: string, groupId: number|null, startTag: string|null, endTag: string|null}>}
 */
export function parseMessageSegments(text) {
  if (!text) return [{ text: '', groupId: null, startTag: null, endTag: null }];
  
  // Regex pour détecter les tags BMG: [GG:TT:ARGS] (new) ou [@GG:TT:ARGS] (old with @) ou {{@GG:TT:ARGS}} (legacy)
  const tagRegex = /\[(@?)([0-9A-F]+):([0-9A-F]+)(?::([0-9A-F]+))?\]|\{\{@([0-9A-F]{1,2}):([0-9A-F]{1,4})(?::([0-9A-F]+))?\}\}|\{\{@?(\d+):(\d+)(?:\s+([a-fA-F0-9]+))?\}\}/gi;
  
  const segments = [];
  let lastIndex = 0;
  let currentGroupId = null;
  let matches = [];
  // pendingTags collects consecutive tags encountered before the next text
  let pendingTags = [];
  
  // Collecter tous les matches
  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    // Parse formats: [FF:0:200] or [@FF:0:200] or {{@FF:0:0200}} or {{255:0 0200}}
    let groupId;
    if (match[2] !== undefined) {
      // New format [FF:0:200] or [@FF:0:200] (match[1] is optional @, match[2] is groupId)
      groupId = parseInt(match[2], 16);
    } else if (match[5] !== undefined) {
      // Old compact hex format {{@FF:0:0200}}
      groupId = parseInt(match[5], 16);
    } else if (match[8] !== undefined) {
      // Old decimal format {{@255:0 0200}}
      groupId = parseInt(match[8], 10);
    }
    
    matches.push({
      index: match.index,
      length: match[0].length,
      fullTag: match[0],
      groupId: groupId
    });
  }
  
  // Si pas de tags, retourner le texte complet
  if (matches.length === 0) {
    return [{ text, groupId: null, startTag: null, endTag: null }];
  }
  
  // Analyser les segments
  for (let i = 0; i < matches.length; i++) {
    const tagMatch = matches[i];
    // Si il y a du texte entre lastIndex et ce tag, émettre un segment qui
    // contient tous les tags en attente (pendingTags) suivis de ce texte.
    if (tagMatch.index > lastIndex) {
      const textBefore = text.slice(lastIndex, tagMatch.index);
      const prefix = pendingTags.length ? pendingTags.join('') : '';
      // Le groupId du segment est celui du dernier tag en attente (si existant)
      const segGroupId = (pendingTags.length ? currentGroupId : null);
      const segmentText = prefix + textBefore;
      segments.push({
        text: segmentText,
        groupId: segGroupId,
        startTag: prefix || null,
        endTag: tagMatch.fullTag
      });
      // reset pending tags
      pendingTags = [];
    }

    // Stocke ce tag comme en attente (pour être préfixé au prochain texte)
    pendingTags.push(tagMatch.fullTag);
    currentGroupId = tagMatch.groupId; // last tag's groupId
    lastIndex = tagMatch.index + tagMatch.length;
  }
  
  // Texte après le dernier tag (incluant le tag de début)
  if (lastIndex <= text.length) {
    const textAfter = text.slice(lastIndex);
    const prefix = pendingTags.length ? pendingTags.join('') : '';
    const segmentText = prefix + textAfter;
    segments.push({
      text: segmentText,
      groupId: pendingTags.length ? currentGroupId : null,
      startTag: prefix || null,
      endTag: null
    });
    pendingTags = [];
  }
  
  return segments;
}

/**
 * Reconstruit le texte complet à partir des segments
 * @param {Array<{text: string, startTag: string|null, endTag: string|null}>} segments
 * @returns {string}
 */
export function reconstructTextFromSegments(segments) {
  // Simply join all segment texts - they already contain tags
  return segments.map(seg => seg.text).join('');
}
