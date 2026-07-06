import { describe, expect, it } from 'vitest';
import { EXTRACTION_TOOL } from '../src/ai/extraction.js';
import { buildLocationPatch } from '../src/ingest/apply.js';
import { sampleDraft } from './helpers.js';

describe('extraction tool schema', () => {
  it('proposes the location direct contact fields (phone, email, website)', () => {
    const schema = EXTRACTION_TOOL.input_schema as {
      properties: { location: { description: string } };
    };
    const description = schema.properties.location.description;
    for (const field of ['phone', 'email', 'website']) {
      expect(description).toContain(field);
    }
  });

  it('keeps the SPEC §5 top-level draft keys', () => {
    const schema = EXTRACTION_TOOL.input_schema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual([
      'confidence',
      'location',
      'spaces',
      'contacts',
      'suppliers',
      'price_items',
      'open_questions',
      'field_sources',
    ]);
  });
});

describe('buildLocationPatch contact fields', () => {
  it('maps accepted phone/email/website draft fields onto locations columns', () => {
    const draft = {
      ...sampleDraft,
      location: {
        ...sampleDraft.location,
        phone: '+39 055 111222',
        email: 'info@villadeipini.it',
        website: 'https://villadeipini.it',
      },
    };
    const patch = buildLocationPatch(draft, {
      'location.phone': true,
      'location.email': true,
      'location.website': true,
    });
    expect(patch).toEqual({
      phone: '+39 055 111222',
      email: 'info@villadeipini.it',
      website: 'https://villadeipini.it',
    });
  });

  it('ignores contact fields that were not accepted', () => {
    const draft = { ...sampleDraft, location: { phone: '+39 055 111222' } };
    expect(buildLocationPatch(draft, {})).toEqual({});
  });
});
