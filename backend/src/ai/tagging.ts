import type Anthropic from '@anthropic-ai/sdk';

export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

export const ALLOWED_SMART_TAGS = [
  'conferenze',
  'gala_dinner',
  'lunch',
  'coffee',
  'feste',
  'lancio',
  'shooting',
  'wedding',
] as const;

const TAG_TOOL: Anthropic.Tool = {
  name: 'record_tags',
  description: 'Record the smart tags that apply to the venue.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['tags'],
    properties: {
      tags: {
        type: 'array',
        items: { type: 'string', enum: [...ALLOWED_SMART_TAGS] },
      },
    },
  },
};

export async function suggestTags(client: Anthropic, text: string): Promise<string[]> {
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 256,
    system:
      'Given a venue description, pick the smart tags (event formats the venue suits) from the allowed list only. Answer via the record_tags tool.',
    tools: [TAG_TOOL],
    tool_choice: { type: 'tool', name: 'record_tags' },
    messages: [{ role: 'user', content: text.slice(0, 20_000) }],
  });
  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') return [];
  const input = block.input as { tags?: string[] };
  const allowed = new Set<string>(ALLOWED_SMART_TAGS);
  return (input.tags ?? []).filter((t) => allowed.has(t));
}
