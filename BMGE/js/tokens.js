import { HEX_TOKEN_PATTERN, NAMED_TOKEN_PATTERN, SPECIAL_TOKEN_PATTERN, NAMED_TOKENS, REVERSE_NAMED_TOKENS, CONTROL_CODE_PARAMS } from './state.js';

function tokenRegex() {
  return new RegExp(`\\[(${SPECIAL_TOKEN_PATTERN})\\]`, 'gi');
}

function encodeSpecialCode(code, params = []) {
  const label = NAMED_TOKENS.get(code);
  if (label) {
    return params.length
      ? `[${label}:${params.map((param) => param.toString(16).padStart(4, '0').toUpperCase()).join(',')}]`
      : `[${label}]`;
  }
  const head = code.toString(16).padStart(2, '0').toUpperCase();
  if (!params.length) {
    return `[${head}]`;
  }
  const tail = params
    .map((param) => param.toString(16).padStart(4, '0').toUpperCase())
    .join(',');
  return `[${head}:${tail}]`;
}

function parseSpecialToken(label) {
  const upper = label.toUpperCase();
  if (REVERSE_NAMED_TOKENS.has(upper)) {
    const code = REVERSE_NAMED_TOKENS.get(upper);
    const params = [];
    const expected = CONTROL_CODE_PARAMS.get(code);
    if (typeof expected === 'number' && expected !== params.length) {
      return null;
    }
    return { code, params };
  }
  const [head, ...rest] = upper.split(':');
  if (!/^[0-9A-F]{2}$/u.test(head)) {
    return null;
  }
  const code = parseInt(head, 16);
  if (Number.isNaN(code)) {
    return null;
  }
  if (!rest.length) {
    const expected = CONTROL_CODE_PARAMS.get(code);
    if (typeof expected === 'number' && expected !== 0) {
      return null;
    }
    return { code, params: [] };
  }
  const paramStrings = rest.join(':').split(',');
  if (paramStrings.some((chunk) => !/^[0-9A-F]{4}$/u.test(chunk))) {
    return null;
  }
  const params = paramStrings.map((chunk) => parseInt(chunk, 16));
  if (params.some((value) => Number.isNaN(value))) {
    return null;
  }
  const expected = CONTROL_CODE_PARAMS.get(code);
  if (typeof expected === 'number' && expected !== params.length) {
    return null;
  }
  return { code, params };
}

function isSpecialControl(code) {
  if (CONTROL_CODE_PARAMS.has(code)) {
    return true;
  }
  if (NAMED_TOKENS.has(code)) {
    return true;
  }
  return code > 0 && code < 32 && code !== 10;
}

function hasSpecialTokens(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const regex = tokenRegex();
  let match;
  while ((match = regex.exec(value)) !== null) {
    const label = match[1] ?? '';
    if (parseSpecialToken(label) !== null) {
      return true;
    }
  }
  return false;
}

export { tokenRegex, encodeSpecialCode, parseSpecialToken, isSpecialControl, hasSpecialTokens };