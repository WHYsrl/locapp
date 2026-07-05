import { describe, expect, it, vi } from 'vitest';
import { normalizeTagName, normalizeTags, registerTags } from '../src/lib/tagService.js';
import type { TagsRepo } from '../src/db/repos/tagsRepo.js';

const repoWith = (upsertMissing: ReturnType<typeof vi.fn>) => ({ upsertMissing }) as unknown as TagsRepo;

describe('tag service', () => {
  it('normalizeTagName trims, lowercases and turns spaces into underscores', () => {
    expect(normalizeTagName('  Gala Dinner ')).toBe('gala_dinner');
    expect(normalizeTagName('CONFERENZE')).toBe('conferenze');
    expect(normalizeTagName('team   building')).toBe('team_building');
    expect(normalizeTagName('wedding')).toBe('wedding');
    expect(normalizeTagName('   ')).toBe('');
  });

  it('normalizeTags dedupes case-insensitively and drops empty entries', () => {
    expect(normalizeTags(['Wedding', 'wedding ', '', '   ', 'Gala Dinner', 'GALA  dinner'])).toEqual([
      'wedding',
      'gala_dinner',
    ]);
  });

  it('registerTags upserts the normalized names and returns them', async () => {
    const upsertMissing = vi.fn(async () => []);
    const result = await registerTags(repoWith(upsertMissing), [' Lancio ', 'Nuovo Tag']);
    expect(result).toEqual(['lancio', 'nuovo_tag']);
    expect(upsertMissing).toHaveBeenCalledTimes(1);
    expect(upsertMissing).toHaveBeenCalledWith(['lancio', 'nuovo_tag']);
  });

  it('registerTags skips the upsert when nothing survives normalization', async () => {
    const upsertMissing = vi.fn(async () => []);
    expect(await registerTags(repoWith(upsertMissing), ['', '  '])).toEqual([]);
    expect(upsertMissing).not.toHaveBeenCalled();
  });
});
