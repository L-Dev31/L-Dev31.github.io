// New Super Mario Bros. game config
export const specialTokens = [
  // Add any special tokens for NSMB here
];

export function getSpecialTokenInfo(token) {
  // Example: highlight a special token
  if (/\[0200:.*?\]/.test(token)) {
    return { name: 'Line Break', cls: 'special-0200' };
  }
  return null;
}
