import { invalid } from './validation';

/** Bounded JSON parser with decoded-key duplicate detection. No crypto or runtime APIs. */
export function strictJson(text: string): unknown {
  if (text.length > 8192) return invalid();
  let at = 0;
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[at] || '!')) at++; };
  function string(): string {
    const start = at++;
    while (at < text.length) {
      const c = text[at++];
      if (c === '"') {
        try { return JSON.parse(text.slice(start, at)); } catch { return invalid(); }
      }
      if (c === '\\') at++;
    }
    return invalid();
  }
  function value(depth: number): unknown {
    if (depth > 8) return invalid();
    whitespace(); const c = text[at];
    if (c === '"') return string();
    if (c === '{') {
      at++; whitespace(); const result: Record<string, unknown> = Object.create(null), keys = new Set<string>();
      if (text[at] === '}') { at++; return result; }
      while (at < text.length) {
        whitespace(); if (text[at] !== '"') return invalid();
        const key = string(); if (keys.has(key)) return invalid(); keys.add(key);
        whitespace(); if (text[at++] !== ':') return invalid(); result[key] = value(depth + 1);
        whitespace(); const next = text[at++]; if (next === '}') return result; if (next !== ',') return invalid();
      }
      return invalid();
    }
    // Profile objects contain primitives only; rejecting arrays also bounds parser complexity.
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
    if (!token) return invalid(); at += token[0].length;
    return JSON.parse(token[0]);
  }
  const result = value(0); whitespace(); if (at !== text.length) return invalid(); return result;
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function base64urlBytes(segment: string): readonly number[] {
  if (!segment || segment.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(segment) || segment.length % 4 === 1) return invalid();
  const bytes: number[] = []; let bits = 0, accumulator = 0;
  for (const c of segment) {
    accumulator = (accumulator << 6) | alphabet.indexOf(c); bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((accumulator >>> bits) & 255); accumulator &= (1 << bits) - 1; }
  }
  if (accumulator !== 0) return invalid(); // Reject noncanonical trailing bits.
  return bytes;
}
export function base64urlJson(segment: string): unknown {
  try {
    const bytes = base64urlBytes(segment);
    const decoded = decodeURIComponent(bytes.map(b => '%' + b.toString(16).padStart(2, '0')).join(''));
    return strictJson(decoded);
  } catch { return invalid(); }
}
