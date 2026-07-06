import fc from 'fast-check';
import sodium, { ready } from './sodium';
import { blindIndex, buildTitlePrefixIndex } from './blindIndex';
import { MIN_PREFIX, PAD_BUCKET } from './constants';
import { normalize } from './normalize';

const arbKey = () =>
  fc.uint8Array({ minLength: 32, maxLength: 32 }).map((arr) => new Uint8Array(arr));

beforeAll(async () => {
  await ready;
});

describe('blindIndex', () => {
  it('Property 4: determinism — stable across repeated calls for the same value + key', () => {
    fc.assert(
      fc.property(fc.string(), arbKey(), (value, key) => {
        expect(blindIndex(value, key)).toBe(blindIndex(value, key));
      }),
      { numRuns: 200 },
    );
  });

  it('Property 5: normalization equivalence — case/whitespace/diacritic variants match', () => {
    const key = sodium.randombytes_buf(32);
    const variants = ['Bancámiga', '  bancamiga  ', 'BANCÁMIGA'];
    const indexes = variants.map((v) => blindIndex(v, key));
    expect(new Set(indexes).size).toBe(1);
  });

  it('differs for different keys given the same value', () => {
    const key1 = sodium.randombytes_buf(32);
    const key2 = sodium.randombytes_buf(32);
    expect(blindIndex('bancamiga', key1)).not.toBe(blindIndex('bancamiga', key2));
  });

  it('differs for different normalized values given the same key', () => {
    const key = sodium.randombytes_buf(32);
    expect(blindIndex('bancamiga', key)).not.toBe(blindIndex('other-bank', key));
  });
});

describe('buildTitlePrefixIndex', () => {
  it('Property 6: prefix coverage — every prefix (len >= MIN_PREFIX) of every token is a member', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.stringMatching(/^[a-z]{2,12}$/), { minLength: 1, maxLength: 4 })
          .map((tokens) => tokens.join(' ')),
        arbKey(),
        (title, key) => {
          const indexSet = new Set(buildTitlePrefixIndex(title, key));
          const tokens = normalize(title).split(/\s+/).filter((t) => t.length > 0);

          for (const token of tokens) {
            for (let k = MIN_PREFIX; k <= token.length; k += 1) {
              const prefix = token.slice(0, k);
              expect(indexSet.has(blindIndex(prefix, key))).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('pads the result set to a multiple of PAD_BUCKET', () => {
    const key = sodium.randombytes_buf(32);
    const index = buildTitlePrefixIndex('Bancamiga', key);
    expect(index.length % PAD_BUCKET).toBe(0);
    expect(index.length).toBeGreaterThan(0);
  });

  it('is deterministic in its real (non-padding) members across calls', () => {
    const key = sodium.randombytes_buf(32);
    const title = 'Bancamiga Principal';
    const tokens = normalize(title).split(/\s+/);
    const realMembers = new Set<string>();
    for (const token of tokens) {
      for (let k = MIN_PREFIX; k <= token.length; k += 1) {
        realMembers.add(blindIndex(token.slice(0, k), key));
      }
    }

    const index1 = new Set(buildTitlePrefixIndex(title, key));
    const index2 = new Set(buildTitlePrefixIndex(title, key));

    for (const member of realMembers) {
      expect(index1.has(member)).toBe(true);
      expect(index2.has(member)).toBe(true);
    }
  });

  it('handles an empty/blank title without throwing, still padding', () => {
    const key = sodium.randombytes_buf(32);
    const index = buildTitlePrefixIndex('   ', key);
    expect(index.length % PAD_BUCKET).toBe(0);
    expect(index.length).toBeGreaterThan(0);
  });
});
