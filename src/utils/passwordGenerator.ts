import sodium from '../crypto/sodium';

/**
 * Password generator (RandomKeygen-style). All randomness comes from
 * libsodium's CSPRNG (`randombytes_buf`) — never `Math.random` — so generated
 * secrets are cryptographically strong. `sodium.ready` has already resolved by
 * the time any UI can call these (the root layout awaits it on startup).
 */

export type PasswordKind = 'memorable' | 'strong' | 'fortKnox';

// A small, friendly wordlist for memorable passphrases (e.g. "antenna-salad-alive").
const WORDS = [
  'antenna', 'salad', 'alive', 'worth', 'idea', 'armor', 'fetch', 'nation', 'salmon',
  'jealous', 'become', 'planet', 'ember', 'violet', 'canyon', 'harbor', 'meadow', 'ripple',
  'cactus', 'lantern', 'pepper', 'mango', 'orbit', 'pebble', 'timber', 'walnut', 'zephyr',
  'copper', 'ginger', 'hazel', 'igloo', 'jungle', 'kettle', 'lemon', 'marble', 'nectar',
  'olive', 'pearl', 'quartz', 'raven', 'saffron', 'thistle', 'umber', 'velvet', 'willow',
  'yonder', 'anchor', 'bison', 'clover', 'domino', 'falcon', 'garnet', 'hollow', 'ivory',
  'jasmine', 'koala', 'lupine', 'mosaic', 'nimbus', 'opal', 'poppy', 'quill', 'rustic', 'sable',
];

const LOWER = 'abcdefghijkmnpqrstuvwxyz'; // no l/o (ambiguous)
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O
const DIGITS = '23456789'; // no 0/1
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?';
const STRONG_SET = LOWER + UPPER + DIGITS + SYMBOLS;

/** Uniform random integer in [0, maxExclusive) via rejection sampling (unbiased). */
function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0 || maxExclusive > 256) {
    throw new Error('randomInt supports 1..256');
  }
  const limit = 256 - (256 % maxExclusive);
  let byte: number;
  do {
    byte = sodium.randombytes_buf(1)[0] as number;
  } while (byte >= limit);
  return byte % maxExclusive;
}

function pick(chars: string): string {
  return chars[randomInt(chars.length)] as string;
}

function randomFromSet(set: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += pick(set);
  return out;
}

/** A memorable passphrase like `antenna-salad-alive-42`. */
function memorable(words = 3): string {
  const parts: string[] = [];
  for (let i = 0; i < words; i += 1) parts.push(WORDS[randomInt(WORDS.length)] as string);
  // A trailing number nudges it past "must contain a digit" policies.
  return `${parts.join('-')}-${10 + randomInt(90)}`;
}

/** Generates a password of the requested style. */
export function generatePassword(kind: PasswordKind = 'strong'): string {
  switch (kind) {
    case 'memorable':
      return memorable();
    case 'fortKnox':
      return randomFromSet(STRONG_SET, 32);
    case 'strong':
    default:
      return randomFromSet(STRONG_SET, 16);
  }
}

export const PASSWORD_KIND_LABELS: Record<PasswordKind, string> = {
  memorable: 'Memorable',
  strong: 'Strong · 16',
  fortKnox: 'Fort Knox · 32',
};
