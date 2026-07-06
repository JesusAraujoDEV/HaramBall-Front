import sodium from './sodium';
import { normalize } from './normalize';
import { BLIND_INDEX_BYTES, MIN_PREFIX, PAD_BUCKET } from './constants';

/**
 * Computes a deterministic, keyed BLAKE2b hash of `normalize(value)`,
 * base64-encoded. Used both for the title-prefix index and per-tag index,
 * and by the client at search time to compute the query's blind index
 * (Requirements 10.1, 10.3, 11.1).
 */
export function blindIndex(value: string, indexKey: Uint8Array): string {
  const hash = sodium.crypto_generichash(BLIND_INDEX_BYTES, normalize(value), indexKey, 'uint8array');
  return sodium.to_base64(hash, sodium.base64_variants.ORIGINAL);
}

function randomBlindIndex(): string {
  const random = sodium.randombytes_buf(BLIND_INDEX_BYTES);
  return sodium.to_base64(random, sodium.base64_variants.ORIGINAL);
}

/**
 * Builds the set of blind indexes for every token and token-prefix (length
 * >= `MIN_PREFIX`) of a normalized title, enabling chat-style prefix search
 * (Property 6: Prefix Coverage; Requirements 10.1, 10.2, 10.3, 11.1, 6.3,
 * 8.1). The set is padded with random 16-byte indexes to a multiple of
 * `PAD_BUCKET` so the server cannot infer exact title length from the
 * number of stored prefixes.
 */
export function buildTitlePrefixIndex(title: string, indexKey: Uint8Array): string[] {
  const tokens = normalize(title).split(/\s+/).filter((t) => t.length > 0);

  const set = new Set<string>();
  for (const token of tokens) {
    for (let k = MIN_PREFIX; k <= token.length; k += 1) {
      set.add(blindIndex(token.slice(0, k), indexKey));
    }
    // Ensure short tokens (< MIN_PREFIX) are still searchable in full.
    if (token.length > 0 && token.length < MIN_PREFIX) {
      set.add(blindIndex(token, indexKey));
    }
  }

  const result = Array.from(set);
  const remainder = result.length % PAD_BUCKET;
  if (remainder !== 0 || result.length === 0) {
    const padCount = PAD_BUCKET - remainder;
    for (let i = 0; i < padCount; i += 1) {
      result.push(randomBlindIndex());
    }
  }

  return result;
}
