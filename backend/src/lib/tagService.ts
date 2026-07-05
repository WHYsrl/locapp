import type { TagsRepo } from '../db/repos/tagsRepo.js';

/** Normalizes a raw tag name: trimmed, lowercased, whitespace runs collapsed to underscores. */
export function normalizeTagName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Normalizes a tag list: drops empty entries and dedupes (case-insensitive) preserving order. */
export function normalizeTags(rawTags: string[]): string[] {
  const out: string[] = [];
  for (const raw of rawTags) {
    const name = normalizeTagName(raw);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Auto-registration used by locations/projects/events writes: normalizes the incoming
 * tag names, upserts any name missing from the shared registry and returns the
 * normalized list that should be persisted on the row.
 */
export async function registerTags(tags: TagsRepo, rawTags: string[]): Promise<string[]> {
  const names = normalizeTags(rawTags);
  if (names.length > 0) await tags.upsertMissing(names);
  return names;
}
