import fc from 'fast-check';
import { normalize } from './normalize';

describe('normalize', () => {
  it('lowercases, trims, and strips diacritics', () => {
    expect(normalize('  Bancámiga  ')).toBe('bancamiga');
    expect(normalize('BANCAMIGA')).toBe('bancamiga');
    expect(normalize('bancamiga')).toBe('bancamiga');
  });

  it('treats case, whitespace, and diacritics as equivalent (Property 5)', () => {
    const variants = ['Bancámiga', '  bancamiga  ', 'BANCÁMIGA', 'BancaMiga '];
    const normalized = variants.map(normalize);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('bancamiga');
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(normalize(normalize(s))).toBe(normalize(s));
      }),
    );
  });

  it('never throws for arbitrary unicode input', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(() => normalize(s)).not.toThrow();
      }),
    );
  });
});
