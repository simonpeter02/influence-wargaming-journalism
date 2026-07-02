import { z } from 'zod';
import type { ActionSpec, Role, SubmittedAction } from '@iwj/shared';
import { ROLE_META } from '@iwj/shared';
import { DEMO_MODEL, USE_STUB } from '../config.js';
import { ROLE_CARDS } from '../content.js';
import { jsonCall, withFallback } from './openai.js';
import { stubAiAction } from './stub.js';

const AiActionSchema = z.object({
  choices: z.record(z.string()),
  freeText: z.string().default(''),
});

export async function decideAiAction(
  role: Role,
  turn: number,
  brief: string | null,
  moodHint: string,
  spec: ActionSpec,
): Promise<SubmittedAction> {
  const stub = () => stubAiAction(role, turn, spec);
  if (USE_STUB) return stub();

  const fieldsDesc = spec.fields
    .filter(f => f.type === 'choice')
    .map(f => `"${f.name}"${f.showIf ? ` (only if ${f.showIf.field}="${f.showIf.value}")` : ''}: one of [${f.options!.map(o => `"${o.value}"`).join(', ')}]`)
    .join('\n');
  const system =
    `You play one actor in a policy wargame, in character and self-interestedly. Respond with STRICT JSON only: ` +
    `{"choices": {<field>: <value>, ...}, "freeText": "max 25 words, in character", "reasoning": "max 15 words"}. ` +
    `Choice values MUST match the allowed values exactly.`;
  const user = `Your role:\n${ROLE_CARDS[role]}\n
It is week ${turn + 1}. ${brief ? `Your brief: ${brief}` : ''} Public mood: ${moodHint}
Decide your concrete action: ${spec.prompt}
Fields:\n${fieldsDesc}`;

  return withFallback(`aiPlayer:${ROLE_META[role].short}`, async () => {
    const raw = await jsonCall(DEMO_MODEL, system, user, 220);
    const parsed = AiActionSchema.parse(raw);
    return { choices: parsed.choices, freeText: (parsed.freeText || '').slice(0, 200) };
  }, stub);
}
