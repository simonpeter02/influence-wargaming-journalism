import { z } from 'zod';
import type { Role, Mode, SubmittedAction } from '@iwj/shared';
import { ROLE_META, JOURNALIST_ROLES } from '@iwj/shared';
import { COUNTRY, HOT_INFO } from '../content.js';
import { GAME_MODEL, DEMO_MODEL, USE_STUB } from '../config.js';
import { jsonCall, withFallback } from './openai.js';
import { describeAction } from '../engine/actions.js';
import { stubGmOutput } from './stub.js';

export const GmOutputSchema = z.object({
  publicNarrative: z.string(),
  otherActions: z.array(z.object({ actor: z.string(), summary: z.string() })),
  frontPages: z.array(z.object({
    outlet: z.string(), headline: z.string(), subhead: z.string(), tone: z.string(),
  })).min(1),
  scoreDeltas: z.object({
    wd: z.number(), gp: z.number(),
    at: z.object({ journalist_1: z.number(), journalist_2: z.number(), journalist_3: z.number() }),
  }),
  deltaRationales: z.object({ wd: z.string(), gp: z.string() }),
  roleBriefs: z.object({
    journalist_1: z.string(), journalist_2: z.string(), journalist_3: z.string(),
    government: z.string(), opposition: z.string(),
  }),
  publicMoodHint: z.string(),
  keyMoment: z.string(),
});
export type GmOutput = z.infer<typeof GmOutputSchema>;

export interface GmTurnInput {
  mode: Mode;
  turn: number;
  finalTurn: number;
  scores: { wd: number; gp: number; at: Record<string, number> };
  actions: { role: Role; playerName: string; action: SubmittedAction }[];
  history: { turn: number; keyMoment: string; narrative: string }[];
  injectContext: string | null;
}

function systemPrompt(mode: Mode): string {
  const brevity = mode === 'demo'
    ? 'BREVITY MODE: publicNarrative max 60 words; each roleBrief max 40 words; exactly 1 front page.'
    : 'publicNarrative max 130 words; each roleBrief max 60 words; 1-2 front pages.';
  return `You are the game master of a serious policy wargame. You simulate THE PUBLIC of ${COUNTRY}, a mid-sized European liberal democracy. Each turn is roughly one week. All five key actors (three journalists, a government spokesperson, an opposition leader) are players; you receive their concrete actions and simulate how the country reacts.

Tracked scores (0-100): WD = the public's willingness to defend the country if attacked (the hidden key variable of the game); GP = government popularity; AT per journalist = that journalist's attention/readership.

Scenario background: ${HOT_INFO}

Respond with STRICT JSON only:
{
 "publicNarrative": "how the public reacted this week",
 "otherActions": [{"actor": "...", "summary": "one sentence"}],  // each actor's PUBLICLY OBSERVABLE moves this week; omit private moves (holding a story, quiet monitoring) entirely
 "frontPages": [{"outlet": "...", "headline": "punchy, max 9 words", "subhead": "max 14 words", "tone": "critical|alarmist|sober|supportive"}],
 "scoreDeltas": {"wd": int -15..15, "gp": int -15..15, "at": {"journalist_1": int -20..20, "journalist_2": int -20..20, "journalist_3": int -20..20}},
 "deltaRationales": {"wd": "one sentence", "gp": "one sentence"},
 "roleBriefs": {"journalist_1": "...", "journalist_2": "...", "journalist_3": "...", "government": "...", "opposition": "..."},  // next-week brief addressed to each player, reflecting what THEY can see; never reveal private actions of others
 "publicMoodHint": "one qualitative sentence about the public mood, NO numbers",
 "keyMoment": "max 8 words, label for the analytics timeline"
}

Score logic: exposing government lies usually drops GP hard; alarmist coverage can raise threat awareness (WD up) or breed cynicism and fatalism (WD down) depending on tone and repetition; constructive, unifying, or credibly reassuring moves raise WD; transparency can cost GP short-term but stabilize WD; being scooped costs a journalist AT; publishing first or exclusively raises AT a lot; journalists who stay quiet drift down in AT. Never mention WD or any score numbers in any text field. ${brevity}`;
}

function userPrompt(inp: GmTurnInput): string {
  const outletOf = (r: Role) => ROLE_META[r].outlet ?? ROLE_META[r].short;
  const actionLines = inp.actions
    .map(a => `- ${ROLE_META[a.role].label} ("${a.playerName}", ${outletOf(a.role)}): ${describeAction(a.action)}`)
    .join('\n');
  const historyLines = inp.history.length
    ? inp.history.map(h => `Week ${h.turn + 1}: ${h.keyMoment} — ${h.narrative}`).join('\n')
    : 'None yet — this is the opening week.';
  const atLine = JOURNALIST_ROLES.map(r => `${r}=${inp.scores.at[r]}`).join(', ');
  return `State: week ${inp.turn + 1} of ${inp.finalTurn + 1}. WD ${inp.scores.wd}, GP ${inp.scores.gp}, AT: ${atLine}.
Previous weeks:\n${historyLines}
${inp.turn === 0 ? 'It is the opening week: only journalists know about the leak. Whether the story breaks depends entirely on their choices below. If nobody publishes, the week is quiet — but rumors swirl.' : ''}
${inp.injectContext ? `INJECT (weave into events and narrative): ${inp.injectContext}` : ''}
ALL player actions this week:\n${actionLines}
Return the JSON.`;
}

export async function resolveTurn(inp: GmTurnInput): Promise<GmOutput> {
  const stub = () => stubGmOutput(inp);
  if (USE_STUB) return stub();
  const model = inp.mode === 'demo' ? DEMO_MODEL : GAME_MODEL;
  const maxTokens = inp.mode === 'demo' ? 700 : 1400;
  return withFallback('gameMaster', async () => {
    const raw = await jsonCall(model, systemPrompt(inp.mode), userPrompt(inp), maxTokens);
    return GmOutputSchema.parse(raw);
  }, stub);
}
