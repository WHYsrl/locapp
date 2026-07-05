import type Anthropic from '@anthropic-ai/sdk';
import { BriefCriteriaSchema, type BriefCriteria } from './criteria.js';
import { SONNET_MODEL } from './extraction.js';

export interface RerankCandidate {
  id: string;
  name: string;
  summary: string | null;
  city: string | null;
  smartTags: string[] | null;
  logistics: unknown;
  setup: unknown;
  party: unknown;
  technical: unknown;
  accessibilityRating: number | null;
  availabilityRules: string | null;
  impressions: string | null;
}

export interface RerankResult {
  location_id: string;
  score: number;
  reasons: { matched: string[]; unmatched: string[]; to_verify: string[] };
}

const CRITERIA_TOOL: Anthropic.Tool = {
  name: 'record_criteria',
  description: 'Record the structured search criteria parsed from the event brief.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      pax: { type: ['integer', 'null'] },
      configuration: {
        type: ['string', 'null'],
        enum: ['in_piedi', 'tavoli_tondi', 'tavolo_imperiale', 'platea', 'ferro_di_cavallo', 'classroom', 'cocktail', null],
      },
      city: { type: ['string', 'null'] },
      tags: {
        type: ['array', 'null'],
        items: { type: 'string' },
        description: 'Subset of: conferenze, gala_dinner, lunch, coffee, feste, lancio, shooting, wedding.',
      },
      event_type: { type: ['string', 'null'] },
      outdoor_required: { type: ['boolean', 'null'] },
      accessibility_min: { type: ['integer', 'null'], minimum: 1, maximum: 5 },
      keywords: { type: ['array', 'null'], items: { type: 'string' } },
    },
  },
};

const RERANK_TOOL: Anthropic.Tool = {
  name: 'record_ranking',
  description: 'Record the ranked venue matches for the brief with explanations.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['results'],
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['location_id', 'score', 'matched', 'unmatched', 'to_verify'],
          properties: {
            location_id: { type: 'string' },
            score: { type: 'integer', minimum: 0, maximum: 100 },
            matched: { type: 'array', items: { type: 'string' } },
            unmatched: { type: 'array', items: { type: 'string' } },
            to_verify: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
};

export async function parseBriefToCriteria(client: Anthropic, brief: string): Promise<BriefCriteria> {
  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 1024,
    system:
      'Parse the event brief (Italian) into structured venue search criteria. Only set values explicitly implied by the brief; leave everything else null. Answer via the record_criteria tool.',
    tools: [CRITERIA_TOOL],
    tool_choice: { type: 'tool', name: 'record_criteria' },
    messages: [{ role: 'user', content: brief }],
  });
  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('Brief parsing failed: no tool_use block');
  return BriefCriteriaSchema.parse(block.input);
}

export async function rerankCandidates(
  client: Anthropic,
  brief: string,
  candidates: RerankCandidate[],
): Promise<RerankResult[]> {
  if (candidates.length === 0) return [];
  const catalog = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    summary: c.summary,
    tags: c.smartTags,
    logistics: c.logistics,
    setup: c.setup,
    party: c.party,
    technical: c.technical,
    accessibility_rating: c.accessibilityRating,
    availability_rules: c.availabilityRules,
    impressions: c.impressions,
  }));

  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 4096,
    system:
      'You rank venues for an Italian event agency. Score each candidate 0-100 against the brief. reasons.matched = requirements the venue satisfies, reasons.unmatched = requirements it fails, reasons.to_verify = requirements with no data on the card. Reasons in Italian. Rank every candidate. Answer via the record_ranking tool.',
    tools: [RERANK_TOOL],
    tool_choice: { type: 'tool', name: 'record_ranking' },
    messages: [
      {
        role: 'user',
        content: `Brief:\n${brief}\n\nCandidates (JSON):\n${JSON.stringify(catalog).slice(0, 150_000)}`,
      },
    ],
  });
  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('Rerank failed: no tool_use block');
  const parsed = block.input as {
    results?: Array<{
      location_id: string;
      score: number;
      matched?: string[];
      unmatched?: string[];
      to_verify?: string[];
    }>;
  };
  return (parsed.results ?? []).map((r) => ({
    location_id: r.location_id,
    score: r.score,
    reasons: {
      matched: r.matched ?? [],
      unmatched: r.unmatched ?? [],
      to_verify: r.to_verify ?? [],
    },
  }));
}
