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
