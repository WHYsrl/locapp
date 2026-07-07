/**
 * Deck copywriting: turns the collected ExportData into structured DeckContent.
 * With include.ai_texts a single Claude call (tool-use JSON, same pattern as
 * ai/extraction.ts) writes the copy; any AI failure is NON-fatal and falls back
 * to the deterministic factual builder below (warning 'ai_unavailable').
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { SONNET_MODEL } from '../ai/extraction.js';
import type {
  ExportCapacity,
  ExportData,
  ExportInclude,
  ExportLocationCard,
  ExportPoiDistance,
  ExportShortlistVenue,
} from './collect.js';

export const DECK_LAYOUTS = ['cover', 'section', 'venue', 'table', 'gallery', 'map'] as const;
export type DeckLayout = (typeof DECK_LAYOUTS)[number];

export const DeckSlideSchema = z.object({
  layout: z.enum(DECK_LAYOUTS),
  title: z.string().default(''),
  body_lines: z.array(z.string()).default([]),
  table: z
    .object({
      headers: z.array(z.string()).default([]),
      rows: z.array(z.array(z.string())).default([]),
    })
    .nullish(),
  image_urls: z.array(z.string()).default([]),
  notes: z.string().nullish(),
});

export const DeckContentSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().default(''),
  slides: z.array(DeckSlideSchema).min(1),
});

export type DeckSlide = z.infer<typeof DeckSlideSchema>;
export type DeckContent = z.infer<typeof DeckContentSchema>;

/** Minimal interface the copywriter needs (satisfied by AiService.writeDeck). */
export interface DeckWriter {
  writeDeck(input: DeckWriteInput): Promise<DeckContent>;
}

export interface DeckWriteInput {
  data: ExportData;
  include: ExportInclude;
}

/** Strict JSON schema for the Claude tool-use output (mirrors DeckContentSchema). */
export const DECK_TOOL: Anthropic.Tool = {
  name: 'record_deck_content',
  description:
    'Record the structured content of the venue-proposal slide deck to be generated in Google Slides.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'subtitle', 'slides'],
    properties: {
      title: { type: 'string' },
      subtitle: { type: 'string' },
      slides: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['layout', 'title'],
          properties: {
            layout: { type: 'string', enum: [...DECK_LAYOUTS] },
            title: { type: 'string' },
            body_lines: { type: 'array', items: { type: 'string' } },
            table: {
              type: ['object', 'null'],
              additionalProperties: false,
              properties: {
                headers: { type: 'array', items: { type: 'string' } },
                rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
              },
            },
            image_urls: { type: 'array', items: { type: 'string' } },
            notes: { type: ['string', 'null'] },
          },
        },
      },
    },
  },
};

const COPY_SYSTEM = `You are the senior copywriter of an Italian corporate events agency.
You turn structured venue data into the content of a client-facing slide deck (Google Slides).
Write ALL text in Italian, professional events-agency tone: concise, elegant, persuasive but factual.
Use ONLY facts present in the provided data. Never invent capacities, prices, distances or services.
Structure: one 'cover' slide first, then 'section' dividers where useful, one 'venue' slide per venue
(body_lines = short bullet facts), 'table' slides for capacity/price/distance comparisons,
'gallery' slides for photos and 'map' slides for map images.
Put image URLs (photo_urls / map_url from the data) into image_urls EXACTLY as given, never modified.
Keep body_lines under 8 per slide and table sizes small. Always answer by calling the record_deck_content tool.`;

/** Single Claude call producing the whole deck (claude-sonnet-5, forced tool-use). */
export async function writeDeckContent(
  client: Anthropic,
  input: DeckWriteInput,
): Promise<DeckContent> {
  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 8192,
    system: COPY_SYSTEM,
    tools: [DECK_TOOL],
    tool_choice: { type: 'tool', name: 'record_deck_content' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `Sections requested by the user: ${JSON.stringify(input.include)}\n\n` +
              `Export data (kind: ${input.data.kind}):\n${JSON.stringify(input.data, null, 1).slice(0, 150_000)}`,
          },
        ],
      },
    ],
  });
  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new Error('Deck copywriting failed: no tool_use block in Claude response');
  }
  return DeckContentSchema.parse(block.input);
}

// ---------------------------------------------------------------------------
// Deterministic fallback builder (plain factual Italian strings)
// ---------------------------------------------------------------------------

const CONFIG_LABELS: Record<string, string> = {
  in_piedi: 'In piedi',
  tavoli_tondi: 'Tavoli tondi',
  tavolo_imperiale: 'Tavolo imperiale',
  platea: 'Platea',
  ferro_di_cavallo: 'Ferro di cavallo',
  classroom: 'Classroom',
  cocktail: 'Cocktail',
};

const configLabel = (configuration: string): string =>
  CONFIG_LABELS[configuration] ?? configuration.replace(/_/g, ' ');

const capacityLine = (capacities: ExportCapacity[]): string =>
  capacities.map((c) => `${configLabel(c.configuration)}: ${c.capacity}`).join(' · ');

const formatDates = (start: string | null, end: string | null): string | null => {
  if (!start) return null;
  return end && end !== start ? `${start} → ${end}` : start;
};

function distancesTable(distances: ExportPoiDistance[]): DeckSlide['table'] {
  return {
    headers: ['Punto di interesse', 'Km', 'Minuti in auto'],
    rows: distances
      .slice(0, 10)
      .map((d) => [d.poi_name, `${d.km}${d.estimated ? ' (stima)' : ''}`, `${d.minutes_car}`]),
  };
}

function locationSlides(card: ExportLocationCard, include: ExportInclude): DeckSlide[] {
  const slides: DeckSlide[] = [];
  const facts: string[] = [];
  if (card.summary) facts.push(card.summary);
  const address = [card.address_line, card.city, card.province].filter(Boolean).join(', ');
  if (address) facts.push(`Indirizzo: ${address}`);
  if (card.website) facts.push(`Sito web: ${card.website}`);
  if (card.phone) facts.push(`Telefono: ${card.phone}`);
  if (card.accessibility_rating != null) facts.push(`Accessibilità: ${card.accessibility_rating}/5`);
  if (card.smart_tags?.length) facts.push(`Caratteristiche: ${card.smart_tags.join(', ')}`);
  slides.push({
    layout: 'venue',
    title: card.name,
    body_lines: facts.slice(0, 8),
    image_urls: card.photo_urls.slice(0, 1),
    table: null,
    notes: null,
  });

  if (include.capacities && card.spaces.length > 0) {
    slides.push({
      layout: 'table',
      title: 'Spazi e capienze',
      body_lines: [],
      image_urls: [],
      notes: null,
      table: {
        headers: ['Spazio', 'Tipo', 'Mq', 'Capienze'],
        rows: card.spaces
          .slice(0, 12)
          .map((s) => [s.name, s.kind, s.area_sqm ?? '—', capacityLine(s.capacities) || '—']),
      },
    });
  }

  if (include.prices && card.price_lists && card.price_lists.length > 0) {
    slides.push({
      layout: 'table',
      title: 'Listino',
      body_lines: [],
      image_urls: [],
      notes: null,
      table: {
        headers: ['Voce', 'Prezzo', 'Unità'],
        rows: card.price_lists
          .flatMap((pl) => pl.items)
          .slice(0, 12)
          .map((item) => [
            String(item['voce'] ?? item['name'] ?? ''),
            item['prezzo'] != null ? `€ ${item['prezzo']}` : '—',
            String(item['unita'] ?? ''),
          ]),
      },
    });
  }

  if (include.distances && card.poi_distances && card.poi_distances.length > 0) {
    slides.push({
      layout: 'table',
      title: 'Distanze dai punti di interesse',
      body_lines: [],
      image_urls: [],
      notes: null,
      table: distancesTable(card.poi_distances),
    });
  }

  if (include.photos && card.photo_urls.length > 1) {
    slides.push({
      layout: 'gallery',
      title: 'Galleria fotografica',
      body_lines: [],
      image_urls: card.photo_urls.slice(1, 5),
      table: null,
      notes: null,
    });
  }

  if (card.map_url) {
    slides.push({
      layout: 'map',
      title: 'Dove si trova',
      body_lines: [],
      image_urls: [card.map_url],
      table: null,
      notes: null,
    });
  }
  return slides;
}

function venueSlide(venue: ExportShortlistVenue, include: ExportInclude): DeckSlide {
  const lines: string[] = [];
  if (venue.city) lines.push(`Città: ${venue.city}`);
  if (venue.summary) lines.push(venue.summary);
  lines.push(`Stato: ${venue.status.replace(/_/g, ' ')}`);
  if (venue.match_score != null) lines.push(`Match: ${venue.match_score}/100`);
  if (include.capacities && venue.capacities?.length) {
    lines.push(`Capienze: ${capacityLine(venue.capacities)}`);
  }
  if (include.prices && venue.quotes?.length) {
    const amounts = venue.quotes.filter((q) => q.amount != null);
    if (amounts.length > 0) {
      lines.push(`Preventivi: ${amounts.map((q) => `€ ${q.amount} (${q.status})`).join(' · ')}`);
    }
  }
  if (include.distances && venue.poi_distances?.length) {
    const nearest = venue.poi_distances[0]!;
    lines.push(`A ${nearest.km} km da ${nearest.poi_name} (~${nearest.minutes_car} min in auto)`);
  }
  if (venue.notes) lines.push(`Note: ${venue.notes}`);
  return {
    layout: 'venue',
    title: venue.name,
    body_lines: lines.slice(0, 8),
    image_urls: venue.photo_urls.slice(0, 1),
    table: null,
    notes: null,
  };
}

function shortlistCompareSlide(shortlist: ExportShortlistVenue[]): DeckSlide | null {
  const withCaps = shortlist.filter((v) => v.capacities && v.capacities.length > 0);
  if (withCaps.length === 0) return null;
  return {
    layout: 'table',
    title: 'Confronto capienze',
    body_lines: [],
    image_urls: [],
    notes: null,
    table: {
      headers: ['Location', 'Capienze'],
      rows: withCaps.slice(0, 12).map((v) => [v.name, capacityLine(v.capacities!)]),
    },
  };
}

/** Deterministic DeckContent from facts only — used when AI is off or fails. */
export function buildFallbackDeck(data: ExportData, include: ExportInclude): DeckContent {
  if (data.kind === 'location') {
    const card = data.location;
    return {
      title: card.name,
      subtitle: [card.city, card.province].filter(Boolean).join(' · '),
      slides: [
        {
          layout: 'cover',
          title: card.name,
          body_lines: [],
          image_urls: [],
          table: null,
          notes: null,
        },
        ...locationSlides(card, include),
      ],
    };
  }

  if (data.kind === 'event') {
    const event = data.event;
    const subtitleParts = [
      event.project.client_name ?? event.project.name,
      formatDates(event.date_start, event.date_end),
      event.pax != null ? `${event.pax} pax` : null,
    ].filter(Boolean) as string[];
    const slides: DeckSlide[] = [
      {
        layout: 'cover',
        title: `Proposta location — ${event.name}`,
        body_lines: [],
        image_urls: [],
        table: null,
        notes: null,
      },
      {
        layout: 'section',
        title: `Location proposte (${event.shortlist.length})`,
        body_lines: [],
        image_urls: [],
        table: null,
        notes: null,
      },
      ...event.shortlist.map((v) => venueSlide(v, include)),
    ];
    if (include.capacities) {
      const compare = shortlistCompareSlide(event.shortlist);
      if (compare) slides.push(compare);
    }
    return { title: `Proposta location — ${event.name}`, subtitle: subtitleParts.join(' · '), slides };
  }

  const project = data.project;
  const slides: DeckSlide[] = [
    {
      layout: 'cover',
      title: project.name,
      body_lines: [],
      image_urls: [],
      table: null,
      notes: null,
    },
  ];
  for (const event of project.events) {
    slides.push({
      layout: 'section',
      title: [event.name, formatDates(event.date_start, event.date_end)].filter(Boolean).join(' — '),
      body_lines: [],
      image_urls: [],
      table: null,
      notes: null,
    });
    for (const venue of event.shortlist) slides.push(venueSlide(venue, include));
  }
  return { title: project.name, subtitle: project.client_name ?? '', slides };
}

/** All image URLs that legitimately exist in the collected data. */
function knownImageUrls(data: ExportData): Set<string> {
  const urls = new Set<string>();
  const cards =
    data.kind === 'location'
      ? [data.location]
      : data.kind === 'event'
        ? data.event.shortlist
        : data.project.events.flatMap((e) => e.shortlist);
  for (const card of cards) {
    for (const url of card.photo_urls) urls.add(url);
    if (card.map_url) urls.add(card.map_url);
  }
  return urls;
}

/** Keep only image URLs present in the data (the AI must not invent/mangle URLs). */
function sanitizeDeck(deck: DeckContent, data: ExportData): DeckContent {
  const known = knownImageUrls(data);
  return {
    ...deck,
    slides: deck.slides.map((s) => ({ ...s, image_urls: s.image_urls.filter((u) => known.has(u)) })),
  };
}

/**
 * Deck content pipeline: AI copywriting when requested, deterministic factual
 * fallback otherwise or on ANY AI error (warning 'ai_unavailable', never fatal).
 */
export async function buildDeckContent(
  ai: DeckWriter,
  data: ExportData,
  include: ExportInclude,
): Promise<{ deck: DeckContent; warnings: string[] }> {
  if (!include.ai_texts) {
    return { deck: buildFallbackDeck(data, include), warnings: [] };
  }
  try {
    const deck = DeckContentSchema.parse(await ai.writeDeck({ data, include }));
    return { deck: sanitizeDeck(deck, data), warnings: [] };
  } catch {
    return { deck: buildFallbackDeck(data, include), warnings: ['ai_unavailable'] };
  }
}
