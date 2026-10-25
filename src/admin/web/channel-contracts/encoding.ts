import { CHANNEL } from './contracts';

export function invalid(): never { throw Error('CHANNEL_CONTRACT_INVALID'); }
/** Strict Unicode scalar encoding. No Node.js, TextEncoder or implicit Unicode normalization. */
export function utf8(text: string): readonly number[] {
  if (typeof text !== 'string' || text.length > CHANNEL.maxWireBytes) return invalid();
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff) {
      const low = text.charCodeAt(++i);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return invalid();
      cp = 0x10000 + ((cp - 0xd800) << 10) + low - 0xdc00;
    } else if (cp >= 0xdc00 && cp <= 0xdfff) return invalid();
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | cp >> 6, 0x80 | cp & 63);
    else if (cp < 0x10000) out.push(0xe0 | cp >> 12, 0x80 | cp >> 6 & 63, 0x80 | cp & 63);
    else out.push(0xf0 | cp >> 18, 0x80 | cp >> 12 & 63, 0x80 | cp >> 6 & 63, 0x80 | cp & 63);
    if (out.length > CHANNEL.maxWireBytes) return invalid();
  }
  return Object.freeze(out);
}
export function decodeUtf8(bytes: readonly number[]): string {
  if (!Array.isArray(bytes) || bytes.length > CHANNEL.maxWireBytes) return invalid();
  for (const b of bytes) if (!Number.isInteger(b) || b < 0 || b > 255) return invalid();
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i++]; let cp: number, count: number, min: number;
    if (first < 0x80) { cp = first; count = 0; min = 0; }
    else if (first >= 0xc2 && first <= 0xdf) { cp = first & 31; count = 1; min = 0x80; }
    else if (first >= 0xe0 && first <= 0xef) { cp = first & 15; count = 2; min = 0x800; }
    else if (first >= 0xf0 && first <= 0xf4) { cp = first & 7; count = 3; min = 0x10000; }
    else return invalid();
    for (let j = 0; j < count; j++) {
      if (i >= bytes.length || bytes[i] < 0x80 || bytes[i] > 0xbf) return invalid();
      cp = cp << 6 | bytes[i++] & 63;
    }
    if (cp < min || cp > 0x10ffff || cp >= 0xd800 && cp <= 0xdfff || cp === 0xfeff && out.length === 0) return invalid();
    out += String.fromCodePoint(cp);
  }
  return out;
}
/** Duplicate decoded keys, invalid UTF-8/scalars, nonfinite numbers and excessive work fail closed. */
export function parseWireJson(bytes: readonly number[], limit: number = CHANNEL.maxWireBytes): unknown {
  if (!Array.isArray(bytes) || !Number.isSafeInteger(limit) || limit <= 0 || limit > CHANNEL.maxWireBytes || bytes.length > limit) return invalid();
  const text = decodeUtf8(bytes); let at = 0, nodes = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(text[at] || '!')) at++; };
  function string(): string {
    const start = at++;
    while (at < text.length) {
      const ch = text[at++];
      if (ch === '"') {
        let decoded: unknown;
        try { decoded = JSON.parse(text.slice(start, at)); } catch { return invalid(); }
        if (typeof decoded !== 'string') return invalid(); utf8(decoded); return decoded;
      }
      if (ch === '\\') at++;
    }
    return invalid();
  }
  function value(depth: number): unknown {
    if (depth > CHANNEL.maxDepth || ++nodes > CHANNEL.maxNodes) return invalid();
    ws(); const ch = text[at];
    if (ch === '"') return string();
    if (ch === '{') {
      at++; ws(); const out: Record<string, unknown> = Object.create(null), seen = new Set<string>();
      if (text[at] === '}') { at++; return Object.freeze(out); }
      while (at < text.length) {
        ws(); if (text[at] !== '"') return invalid(); const key = string();
        if (seen.has(key)) return invalid(); seen.add(key); ws(); if (text[at++] !== ':') return invalid();
        out[key] = value(depth + 1); ws(); const next = text[at++];
        if (next === '}') return Object.freeze(out); if (next !== ',') return invalid();
      }
      return invalid();
    }
    if (ch === '[') {
      at++; ws(); const out: unknown[] = []; if (text[at] === ']') { at++; return Object.freeze(out); }
      while (at < text.length) {
        out.push(value(depth + 1)); ws(); const next = text[at++];
        if (next === ']') return Object.freeze(out); if (next !== ',') return invalid();
      }
      return invalid();
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
    if (!token) return invalid(); at += token[0].length; const result: unknown = JSON.parse(token[0]);
    if (typeof result === 'number' && !Number.isFinite(result)) return invalid(); return result;
  }
  const result = value(0); ws(); if (at !== text.length) return invalid(); return result;
}
/** Fixed ordered fields: uint32 big-endian UTF-8 byte length + bytes, including domain/version.
 * Callers supply validated protocol fields; no object-key ordering, delimiter escaping or BOM. */
export function frame(domain: string, fields: readonly (string | number)[]): readonly number[] {
  if (typeof domain !== 'string' || !Array.isArray(fields)) return invalid();
  const out: number[] = [];
  for (const field of [domain, ...fields]) {
    if (typeof field !== 'string' && (!Number.isSafeInteger(field) || field < 0)) return invalid();
    const bytes = utf8(String(field)), n = bytes.length;
    out.push(n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255, ...bytes);
    if (out.length > CHANNEL.maxWireBytes) return invalid();
  }
  return Object.freeze(out);
}
