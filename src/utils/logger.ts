/**
 * Central logging helper that scrubs sensitive values before they ever reach
 * `console.*` or a crash-report sink. Ciphertext envelopes (`v1.<base64>`),
 * base64 blobs long enough to plausibly be key material or a blind index,
 * and any explicitly-tagged secret arguments are redacted (Requirements
 * 5.6, 15.1; Property 10: No secret in logs).
 */

const ENVELOPE_PATTERN = /v1\.[A-Za-z0-9+/=]+/g;
// Long base64-ish runs (>= 22 chars, the shortest plausible base64 of a
// 16-byte blind index) that aren't already inside a `v1.` envelope.
const LONG_BASE64_PATTERN = /[A-Za-z0-9+/]{22,}={0,2}/g;

function scrubString(value: string): string {
  return value.replace(ENVELOPE_PATTERN, '[REDACTED]').replace(LONG_BASE64_PATTERN, '[REDACTED]');
}

function scrubValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return scrubString(value);
  }
  if (value instanceof Uint8Array) {
    return '[REDACTED:bytes]';
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubValue(v, seen));
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (value instanceof Error) {
      return { name: value.name, message: scrubString(value.message) };
    }
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = isSensitiveKey(key) ? '[REDACTED]' : scrubValue(val, seen);
    }
    return out;
  }
  return value;
}

const SENSITIVE_KEYS = [
  'password',
  'masterpassword',
  'masterkey',
  'encryptionkey',
  'indexkey',
  'authhash',
  'accesstoken',
  'refreshtoken',
  'titleciphertext',
  'bodyciphertext',
  'tagsciphertext',
  'titleblindindexes',
  'tagblindindexes',
  'blindindex',
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.includes(key.toLowerCase());
}

export const logger = {
  log(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log(...args.map((a) => scrubValue(a)));
  },
  warn(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn(...args.map((a) => scrubValue(a)));
  },
  error(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.error(...args.map((a) => scrubValue(a)));
  },
};

export default logger;
