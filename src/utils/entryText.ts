/**
 * Free-form entry text parsing: the first line is the Title, the remaining
 * lines are the Body (Requirements 6.1, 8.4). `serializeEntryText` is the
 * exact reverse, used to reconstruct the editable text for the edit screen.
 */
export interface ParsedEntryText {
  title: string;
  body: string;
}

export function parseEntryText(text: string): ParsedEntryText {
  const lines = text.split('\n');
  const title = (lines[0] ?? '').trim();
  const body = lines.slice(1).join('\n');
  return { title, body };
}

export function serializeEntryText(title: string, body: string): string {
  return body.length > 0 ? `${title}\n${body}` : title;
}

export interface DetectedField {
  label: string;
  value: string;
}

/** A labeled credential field, e.g. `{ label: 'correo', value: 'a@b.c' }`. */
export interface EntryField {
  label: string;
  value: string;
}

/** Structured representation of an entry body: labeled fields + free notes. */
export interface StructuredBody {
  fields: EntryField[];
  notes: string;
}

/** Marker for the JSON structured-body format (vs. legacy free text). */
const STRUCTURED_VERSION = 1;

/**
 * Serializes labeled fields + notes into the single opaque string that gets
 * encrypted into `bodyCiphertext`. Empty (fully blank) fields are dropped.
 * Returns '' when there is nothing to store so title-only entries stay clean.
 */
export function serializeStructuredBody(fields: EntryField[], notes: string): string {
  // A field is only meaningful once it has a value; label-only rows (e.g. the
  // untouched defaults) are dropped so they don't clutter the saved entry.
  const clean = fields
    .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
    .filter((f) => f.value.length > 0);
  if (clean.length === 0 && notes.trim().length === 0) {
    return '';
  }
  return JSON.stringify({ v: STRUCTURED_VERSION, fields: clean, notes });
}

/**
 * Parses a decrypted body back into structured fields + notes. Understands
 * both the JSON structured format and legacy free-text bodies (which are
 * run through `detectFields` for the labeled parts, keeping the raw text as
 * notes) so old entries keep working without a migration.
 */
export function parseStructuredBody(body: string): StructuredBody {
  if (!body) {
    return { fields: [], notes: '' };
  }
  try {
    const parsed = JSON.parse(body) as { v?: number; fields?: unknown; notes?: unknown };
    if (parsed && parsed.v === STRUCTURED_VERSION && Array.isArray(parsed.fields)) {
      const fields = (parsed.fields as EntryField[])
        .filter((f) => f && typeof f.label === 'string' && typeof f.value === 'string')
        .map((f) => ({ label: f.label, value: f.value }));
      return { fields, notes: typeof parsed.notes === 'string' ? parsed.notes : '' };
    }
  } catch {
    // Not JSON → treat as a legacy free-text body below.
  }
  return { fields: detectFields(body), notes: body };
}

/**
 * Normalizes a (possibly user-authored) field label to one of the canonical
 * quick-copy keys, or null. Drives which fields surface as default one-tap
 * Copy buttons on the credential card.
 */
export function canonicalFieldKey(label: string): 'email' | 'user' | 'password' | null {
  switch (label.toLowerCase().trim()) {
    case 'correo':
    case 'email':
    case 'e-mail':
      return 'email';
    case 'usuario':
    case 'user':
    case 'username':
      return 'user';
    case 'clave':
    case 'contraseña':
    case 'contrasena':
    case 'password':
    case 'pass':
      return 'password';
    default:
      return null;
  }
}

/**
 * Label regex: matches lines beginning with a known field label (optionally
 * followed by a colon), e.g. "Clave: hunter2", "Usuario:admin".
 */
const LABELS =
  /^(clave|password|contrase(?:ñ|n)a|usuario|user|ip|servidor|server|email|correo)\s*:?\s*(.*)$/i;

const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;

/**
 * Detects per-line copyable fields in an Entry Body: explicit labeled lines
 * (Clave/Password/Usuario/IP/Servidor/Email/...) and bare email addresses,
 * so each can get its own one-tap Copy_Action (Requirement 12.2).
 */
export function detectFields(body: string): DetectedField[] {
  const fields: DetectedField[] = [];

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const labelMatch = LABELS.exec(line);
    if (labelMatch) {
      const label = labelMatch[1] ?? '';
      const value = (labelMatch[2] ?? '').trim();
      if (value.length > 0) {
        fields.push({ label: normalizeLabel(label), value });
        continue;
      }
    }

    const emailMatch = EMAIL.exec(line);
    if (emailMatch) {
      fields.push({ label: 'email', value: emailMatch[0] });
    }
  }

  return fields;
}

function normalizeLabel(label: string): string {
  const lower = label.toLowerCase();
  switch (lower) {
    case 'contraseña':
    case 'contrasena':
    case 'clave':
    case 'password':
      return 'password';
    case 'usuario':
    case 'user':
      return 'user';
    case 'correo':
    case 'email':
      return 'email';
    case 'servidor':
    case 'server':
      return 'server';
    default:
      return lower;
  }
}
