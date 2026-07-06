import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const SONNET_MODEL = 'claude-sonnet-5';

/** ExtractedLocationDraft — ingestion contract shared by all clients (SPEC §5). */
export const ExtractedLocationDraftSchema = z.object({
  confidence: z.number().min(0).max(1),
  location: z.record(z.string(), z.unknown()).default({}),
  spaces: z
    .array(
      z.object({
        kind: z.enum(['interno', 'esterno']),
        name: z.string(),
        area_sqm: z.number().nullish(),
        height_m: z.number().nullish(),
        covered: z.enum(['coperto', 'scoperto', 'copribile']).nullish(),
        capacities: z.record(z.string(), z.number()).default({}),
      }),
    )
    .default([]),
  contacts: z
    .array(
      z.object({
        first_name: z.string().default(''),
        last_name: z.string().default(''),
        role: z.string().default(''),
        phone: z.string().default(''),
        email: z.string().default(''),
        company_name: z.string().default(''),
      }),
    )
    .default([]),
  suppliers: z
    .array(
      z.object({
        company_name: z.string(),
        category: z.string(),
        requirement: z.enum(['obbligatorio', 'consigliato']).default('consigliato'),
      }),
    )
    .default([]),
  price_items: z
    .array(
      z.object({
        voce: z.string(),
        prezzo: z.number().nullish(),
        unita: z.string().default(''),
        note: z.string().default(''),
      }),
    )
    .default([]),
  open_questions: z.array(z.string()).default([]),
  field_sources: z.record(z.string(), z.string()).default({}),
});

export type ExtractedLocationDraft = z.infer<typeof ExtractedLocationDraftSchema>;

/** Strict JSON schema for Claude tool-use output. */
export const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'record_location_draft',
  description:
    'Record the structured venue information extracted from the source material as a reviewable draft.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['confidence', 'location', 'spaces', 'contacts', 'suppliers', 'price_items', 'open_questions', 'field_sources'],
    properties: {
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      location: {
        type: 'object',
        description: 'Any locations column: name, summary, address_line, city, province, postal_code, country, phone, email, website, google_maps_url, visit_status, logistics, setup, party, technical, accessibility_rating, accessibility_notes, availability_rules, smart_tags, impressions. phone/email/website are the venue\'s own direct contact data (switchboard, info email, official site) — NOT those of individual people, which belong in contacts[].',
        additionalProperties: true,
      },
      spaces: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'name'],
          properties: {
            kind: { type: 'string', enum: ['interno', 'esterno'] },
            name: { type: 'string' },
            area_sqm: { type: ['number', 'null'] },
            height_m: { type: ['number', 'null'] },
            covered: { type: ['string', 'null'], enum: ['coperto', 'scoperto', 'copribile', null] },
            capacities: {
              type: 'object',
              additionalProperties: { type: 'number' },
              description: 'Keys: in_piedi, tavoli_tondi, tavolo_imperiale, platea, ferro_di_cavallo, classroom, cocktail.',
            },
          },
        },
      },
      contacts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            role: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
            company_name: { type: 'string' },
          },
        },
      },
      suppliers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['company_name', 'category'],
          properties: {
            company_name: { type: 'string' },
            category: { type: 'string' },
            requirement: { type: 'string', enum: ['obbligatorio', 'consigliato'] },
          },
        },
      },
      price_items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['voce'],
          properties: {
            voce: { type: 'string' },
            prezzo: { type: ['number', 'null'] },
            unita: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
      open_questions: { type: 'array', items: { type: 'string' } },
      field_sources: { type: 'object', additionalProperties: { type: 'string' } },
    },
  },
};

const EXTRACTION_SYSTEM = `You are an information extraction engine for an Italian event agency's venue database.
Extract ONLY facts explicitly stated in the source material. Never invent or infer missing values.
If a value is uncertain or ambiguous, leave the field out and add an entry to open_questions (in Italian).
All extracted textual content must be in Italian. Map facts onto the venue schema fields.
Put the venue's own direct contact data in location.phone, location.email and location.website;
personal contact details of named people go into the contacts array instead.
Record where each notable field came from in field_sources (e.g. "locations.technical.max_kw": "pagina 3").
Always answer by calling the record_location_draft tool.`;

export interface ExtractionInput {
  text: string;
  sourceLabel?: string;
  image?: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' };
}

export async function extractLocationDraft(
  client: Anthropic,
  input: ExtractionInput,
): Promise<ExtractedLocationDraft> {
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: input.image.mediaType, data: input.image.base64 },
    });
  }
  content.push({
    type: 'text',
    text: `Source (${input.sourceLabel ?? 'testo'}):\n\n${input.text.slice(0, 100_000)}`,
  });

  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 4096,
    system: EXTRACTION_SYSTEM,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'record_location_draft' },
    messages: [{ role: 'user', content }],
  });

  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new Error('Extraction failed: no tool_use block in Claude response');
  }
  return ExtractedLocationDraftSchema.parse(block.input);
}
