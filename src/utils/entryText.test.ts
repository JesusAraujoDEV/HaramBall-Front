import {
  parseEntryText,
  serializeEntryText,
  detectFields,
  serializeStructuredBody,
  parseStructuredBody,
  canonicalFieldKey,
} from './entryText';

describe('parseEntryText', () => {
  it('splits the first line as title and the rest as body', () => {
    const { title, body } = parseEntryText('Bancamiga\nuser@x.com\nPASSWORD123');
    expect(title).toBe('Bancamiga');
    expect(body).toBe('user@x.com\nPASSWORD123');
  });

  it('trims the title line', () => {
    const { title } = parseEntryText('  Bancamiga  \nbody');
    expect(title).toBe('Bancamiga');
  });

  it('handles a title-only entry (empty body)', () => {
    const { title, body } = parseEntryText('JustATitle');
    expect(title).toBe('JustATitle');
    expect(body).toBe('');
  });

  it('handles an empty string (blank title, empty body)', () => {
    const { title, body } = parseEntryText('');
    expect(title).toBe('');
    expect(body).toBe('');
  });

  it('handles a blank first line with content after', () => {
    const { title, body } = parseEntryText('\nsecond\nthird');
    expect(title).toBe('');
    expect(body).toBe('second\nthird');
  });
});

describe('serializeEntryText', () => {
  it('joins title and body with a newline', () => {
    expect(serializeEntryText('Title', 'line1\nline2')).toBe('Title\nline1\nline2');
  });

  it('returns just the title when body is empty', () => {
    expect(serializeEntryText('Title', '')).toBe('Title');
  });

  it('round-trips through parseEntryText', () => {
    const original = 'Bancamiga\nuser@x.com\nPASSWORD123';
    const { title, body } = parseEntryText(original);
    expect(serializeEntryText(title, body)).toBe(original);
  });
});

describe('detectFields', () => {
  it('detects a labeled password line (English)', () => {
    const fields = detectFields('Password: hunter2');
    expect(fields).toContainEqual({ label: 'password', value: 'hunter2' });
  });

  it('detects a labeled password line (Spanish, no colon)', () => {
    const fields = detectFields('Clave hunter2');
    expect(fields).toContainEqual({ label: 'password', value: 'hunter2' });
  });

  it('detects a labeled contraseña line with accent', () => {
    const fields = detectFields('Contraseña: hunter2');
    expect(fields).toContainEqual({ label: 'password', value: 'hunter2' });
  });

  it('detects a labeled user line', () => {
    const fields = detectFields('Usuario: admin');
    expect(fields).toContainEqual({ label: 'user', value: 'admin' });
  });

  it('detects a labeled IP/server line', () => {
    const fields = detectFields('IP: 10.0.0.1');
    expect(fields).toContainEqual({ label: 'ip', value: '10.0.0.1' });
    const fields2 = detectFields('Servidor: db01');
    expect(fields2).toContainEqual({ label: 'server', value: 'db01' });
  });

  it('detects a bare email address without a label', () => {
    const fields = detectFields('contact me at user@example.com please');
    expect(fields).toContainEqual({ label: 'email', value: 'user@example.com' });
  });

  it('detects multiple fields across multiple lines', () => {
    const fields = detectFields('Usuario: admin\nPassword: hunter2\nuser@example.com');
    expect(fields).toHaveLength(3);
  });

  it('returns an empty array for a body with no recognizable fields', () => {
    expect(detectFields('just some free text notes')).toEqual([]);
  });

  it('ignores blank lines', () => {
    expect(detectFields('\n\n   \n')).toEqual([]);
  });

  it('skips a label with no value after it', () => {
    expect(detectFields('Password:')).toEqual([]);
  });
});

describe('structured body', () => {
  it('round-trips fields and notes through serialize/parse', () => {
    const fields = [
      { label: 'correo', value: 'casjd@fansd.c' },
      { label: 'password', value: 'sajdjasd' },
      { label: 'client id', value: 'jasdjasjd' },
    ];
    const body = serializeStructuredBody(fields, 'extra note');
    const parsed = parseStructuredBody(body);
    expect(parsed.fields).toEqual(fields);
    expect(parsed.notes).toBe('extra note');
  });

  it('drops fully-blank fields on serialize', () => {
    const body = serializeStructuredBody(
      [
        { label: 'correo', value: 'a@b.c' },
        { label: '', value: '' },
      ],
      '',
    );
    expect(parseStructuredBody(body).fields).toEqual([{ label: 'correo', value: 'a@b.c' }]);
  });

  it('returns an empty string when there is nothing to store', () => {
    expect(serializeStructuredBody([{ label: '', value: '' }], '   ')).toBe('');
    expect(parseStructuredBody('')).toEqual({ fields: [], notes: '' });
  });

  it('parses a legacy free-text body into detected fields plus raw notes', () => {
    const parsed = parseStructuredBody('Usuario: admin\nPassword: hunter2');
    expect(parsed.fields).toContainEqual({ label: 'user', value: 'admin' });
    expect(parsed.fields).toContainEqual({ label: 'password', value: 'hunter2' });
    expect(parsed.notes).toBe('Usuario: admin\nPassword: hunter2');
  });

  it('maps user-authored labels to canonical quick-copy keys', () => {
    expect(canonicalFieldKey('Correo')).toBe('email');
    expect(canonicalFieldKey('usuario')).toBe('user');
    expect(canonicalFieldKey('Contraseña')).toBe('password');
    expect(canonicalFieldKey('client id')).toBeNull();
  });
});
