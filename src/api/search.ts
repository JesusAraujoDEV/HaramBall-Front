import { request } from './client';
import { searchResponseSchema, type SearchResponse } from './schemas';

export function byTitle(titleBlindIndex: string): Promise<SearchResponse> {
  return request({
    method: 'POST',
    path: '/search/title',
    body: { titleBlindIndex },
    schema: searchResponseSchema,
  });
}

/**
 * `match` selects whether all or any of the supplied tag blind indexes must
 * be present on an entry (backend `TagSearchDto.match`). Defaults to `'any'`
 * for the tag-filter UI (Requirement 11.1).
 */
export function byTags(tagBlindIndexes: string[], match: 'any' | 'all' = 'any'): Promise<SearchResponse> {
  return request({
    method: 'POST',
    path: '/search/tags',
    body: { tagBlindIndexes, match },
    schema: searchResponseSchema,
  });
}
