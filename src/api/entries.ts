import { request } from './client';
import {
  createEntryResponseSchema,
  entryListResponseSchema,
  entryResponseSchema,
  type CreateEntryResponse,
  type EntryResponse,
} from './schemas';

/** Payload shape shared by create/update; matches backend `CreateEntryDto`/`UpdateEntryDto`. */
export interface EntryPayload {
  titleCiphertext: string;
  bodyCiphertext?: string;
  tagsCiphertext?: string[];
  titleBlindIndexes?: string[];
  tagBlindIndexes?: string[];
}

export function list(): Promise<EntryResponse[]> {
  return request({ method: 'GET', path: '/entries', schema: entryListResponseSchema });
}

export function get(id: string): Promise<EntryResponse> {
  return request({ method: 'GET', path: `/entries/${id}`, schema: entryResponseSchema });
}

export function create(payload: EntryPayload): Promise<CreateEntryResponse> {
  return request({ method: 'POST', path: '/entries', body: payload, schema: createEntryResponseSchema });
}

export function update(id: string, payload: EntryPayload): Promise<EntryResponse> {
  return request({ method: 'PUT', path: `/entries/${id}`, body: payload, schema: entryResponseSchema });
}

export function remove(id: string): Promise<void> {
  return request({ method: 'DELETE', path: `/entries/${id}` });
}
