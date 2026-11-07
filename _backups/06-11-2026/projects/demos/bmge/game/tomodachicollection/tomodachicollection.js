export const colorTokens = {
  '02': {
    label: '[Color:0200]',
    cls: 'special-2',
    textCls: 'special-text-2',
    name: 'Color:0200',
  },
  '08': {
    label: '[Color:0800]',
    cls: 'special-8',
    textCls: 'special-text-8',
    name: 'Color:0800',
  },
  '07': {
    label: '[Color:0700]',
    cls: 'special-7',
    textCls: 'special-text-7',
    name: 'Color:0700',
  },
};

export function getSpecialTokenInfo(tokenStr) {
  // Match [Color:XXXX] format (hex)
  const match = /^\[Color:([0-9A-F]+)\]$/i.exec(tokenStr);
  if (!match) return null;
  const colorHex = match[1].padStart(4, '0').toUpperCase();
  // Extract the color index from the first byte
  const colorValue = colorHex.substring(0, 2);
  if (colorTokens[colorValue]) {
    return colorTokens[colorValue];
  }
  return null;
}
