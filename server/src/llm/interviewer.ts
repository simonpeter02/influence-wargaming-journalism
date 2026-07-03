import { z } from 'zod';
import type { Mode, Role } from '@iwj/shared';
import { ROLE_META } from '@iwj/shared';
import { COUNTRY } from '../content.js';
import { DEMO_MODEL, GAME_MODEL, USE_STUB } from '../config.js';
import { jsonCall, withFallback } from './openai.js';

const QuestionSchema = z.object({ question: z.string().min(5) });

export interface QaPair { q: string; a: string | null }

const STUB_QUESTIONS: Record<'first' | 'followup', (role: Role) => string> = {
  first: role =>
    ROLE_META[role].outlet
      ? `Your reporting helped put the readiness scandal on every screen in ${COUNTRY}. Do you feel responsible for how afraid people are right now?`
      : `The public was told "full readiness" three times. Why should anyone in ${COUNTRY} believe what you say tonight?`,
  followup: () => 'That sounds rehearsed. Give me one concrete thing that changes next week — or admit there is nothing.',
};

export async function askQuestion(
  mode: Mode,
  role: Role,
  playerName: string,
  situation: string,
  priorQa: QaPair[],
): Promise<string> {
  const isFollowup = priorQa.length > 0;
  const stub = () => STUB_QUESTIONS[isFollowup ? 'followup' : 'first'](role);
  if (USE_STUB) return stub();

  const system =
    `You are a sharp, fair prime-time press-conference moderator in ${COUNTRY}, a liberal democracy in the middle of a defense-readiness scandal. ` +
    `You ask ONE pointed question at a time, grounded in this week's events, tailored to who is in front of you. Max 35 words. ` +
    `Follow-ups must react to what they just said — quote or paraphrase them. Respond with STRICT JSON: {"question": "..."}.`;
  const transcript = priorQa.map(x => `You asked: ${x.q}\nThey answered: ${x.a ?? '(silence)'}`).join('\n');
  const user =
    `The situation this week: ${situation}\n\nAt the podium: ${ROLE_META[role].label} ("${playerName}").\n` +
    (isFollowup ? `${transcript}\n\nAsk your follow-up.` : 'Ask your opening question.');

  return withFallback(`interviewer:${ROLE_META[role].short}`, async () => {
    const raw = await jsonCall(mode === 'demo' ? DEMO_MODEL : GAME_MODEL, system, user, 120);
    return QuestionSchema.parse(raw).question;
  }, stub);
}
