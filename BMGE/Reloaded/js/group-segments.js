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
  let currentStartTag = null;
  let matches = [];
  
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
    
    // Texte avant ce tag (incluant le tag de début si présent)
    if (tagMatch.index > lastIndex) {
      const textBefore = text.slice(lastIndex, tagMatch.index);
      if (textBefore || currentGroupId !== null) {
        // Inclure le tag de début dans le texte du segment
        const segmentText = currentStartTag ? currentStartTag + textBefore : textBefore;
        segments.push({
          text: segmentText,
          groupId: currentGroupId,
          startTag: currentStartTag,
          endTag: tagMatch.fullTag
        });
      }
    }
    
    // Ce tag devient le début du prochain segment
    currentGroupId = tagMatch.groupId;
    currentStartTag = tagMatch.fullTag;
    lastIndex = tagMatch.index + tagMatch.length;
  }
  
  // Texte après le dernier tag (incluant le tag de début)
  if (lastIndex <= text.length) {
    const textAfter = text.slice(lastIndex);
    const segmentText = currentStartTag ? currentStartTag + textAfter : textAfter;
    segments.push({
      text: segmentText,
      groupId: currentGroupId,
      startTag: currentStartTag,
      endTag: null
    });
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
