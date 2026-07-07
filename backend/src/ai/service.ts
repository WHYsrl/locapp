import Anthropic from '@anthropic-ai/sdk';
import { serviceUnavailable } from '../lib/errors.js';
import { extractLocationDraft, type ExtractedLocationDraft, type ExtractionInput } from './extraction.js';
import { parseBriefToCriteria, rerankCandidates, type RerankCandidate, type RerankResult } from './briefSearch.js';
import { suggestTags } from './tagging.js';
import type { BriefCriteria } from './criteria.js';
import { writeDeckContent, type DeckContent, type DeckWriteInput } from '../export/copywriter.js';

export interface AiService {
  extractLocationDraft(input: ExtractionInput): Promise<ExtractedLocationDraft>;
  parseBrief(brief: string): Promise<BriefCriteria>;
  rerank(brief: string, candidates: RerankCandidate[]): Promise<RerankResult[]>;
  suggestTags(text: string): Promise<string[]>;
  /** One-shot deck copywriting for the Google Slides export (tool-use JSON). */
  writeDeck(input: DeckWriteInput): Promise<DeckContent>;
}

export function createAiService(apiKey: string | undefined): AiService {
  let client: Anthropic | null = null;
  const getClient = (): Anthropic => {
    if (!apiKey) {
      throw serviceUnavailable('AI_NOT_CONFIGURED', 'ANTHROPIC_API_KEY is not configured');
    }
    client ??= new Anthropic({ apiKey });
    return client;
  };

  return {
    extractLocationDraft: (input) => extractLocationDraft(getClient(), input),
    parseBrief: (brief) => parseBriefToCriteria(getClient(), brief),
    rerank: (brief, candidates) => rerankCandidates(getClient(), brief, candidates),
    suggestTags: (text) => suggestTags(getClient(), text),
    writeDeck: (input) => writeDeckContent(getClient(), input),
  };
}
