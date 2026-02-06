export const specialTokens = {
  '0200': {
    label: '[FF:0:0200]',
    cls: 'special-0200',
    textCls: 'special-text-0200',
    name: 'Special token 0x0200',
  },
  '0800': {
    label: '[FF:0:0800]',
    cls: 'special-0800',
    textCls: 'special-text-0800',
    name: 'Special token 0x0800',
  },
  '0700': {
    label: '[FF:0:0700]',
    cls: 'special-0700',
    textCls: 'special-text-0700',
    name: 'Special token 0x0700',
  },
};

export function getSpecialTokenInfo(tokenStr) {
  // Only match [FF:0:xxxx] (case-insensitive)
  const match = /^\[FF:0:([0-9A-F]{4})\]$/i.exec(tokenStr);
  if (!match) return null;
  const code = match[1].toUpperCase();
  if (specialTokens[code]) {
    return specialTokens[code];
  }
  return null;
}
