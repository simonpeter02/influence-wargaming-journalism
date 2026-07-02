import type { ActionSpec, Role, SubmittedAction } from '@iwj/shared';
import { ROLE_META, JOURNALIST_ROLES } from '@iwj/shared';
import type { GmOutput, GmTurnInput } from './gameMaster.js';
import { describeAction } from '../engine/actions.js';

// Deterministic outputs so dev, tests and a live demo never depend on the API.

export function stubGmOutput(inp: GmTurnInput): GmOutput {
  const published = inp.actions.filter(a => /publish/.test(a.action.choices.decision ?? ''));
  const critical = published.some(a => /critical|action/.test(a.action.choices.format ?? ''));
  const anyPublished = published.length > 0;
  const t = inp.turn;

  const at: Record<Role, number> = {} as Record<Role, number>;
  for (const r of JOURNALIST_ROLES) {
    const mine = inp.actions.find(a => a.role === r);
    const iPublished = mine ? /publish/.test(mine.action.choices.decision ?? '') : false;
    at[r] = iPublished ? 14 : anyPublished ? -6 : -2;
  }

  return {
    publicNarrative: anyPublished
      ? `The readiness story ${t === 0 ? 'breaks' : 'deepens'}. Social feeds fill with disbelief: the government said "full readiness" three times. Some citizens are angry at the lie; others quietly wonder whether defending the country is even possible with four batteries.${inp.injectContext ? ' Meanwhile, ' + inp.injectContext : ''}`
      : `A quiet week on the surface, but rumors of a suppressed defense story circulate in political circles. The public senses something is off.`,
    otherActions: inp.actions
      .filter(a => !/hold|quiet|monitor/.test(a.action.choices.decision ?? ''))
      .map(a => ({ actor: ROLE_META[a.role].label, summary: describeAction(a.action) })),
    frontPages: [
      anyPublished
        ? { outlet: ROLE_META[published[0].role].outlet ?? 'The Sentinel', headline: t === 0 ? 'ONLY 4 OF 12: THE READINESS LIE' : 'WHO KNEW, AND SINCE WHEN?', subhead: 'Ministry claimed full readiness while batteries stood empty', tone: critical ? 'critical' : 'sober' }
        : { outlet: 'Daily Courier', headline: 'A QUIET WEEK IN THE CAPITAL', subhead: 'Sources hint at turbulence behind ministry doors', tone: 'sober' },
    ],
    scoreDeltas: {
      wd: anyPublished ? (critical ? -7 : -3) : 1,
      gp: anyPublished ? -9 : 0,
      at: { journalist_1: at.journalist_1, journalist_2: at.journalist_2, journalist_3: at.journalist_3 },
    },
    deltaRationales: {
      wd: anyPublished ? 'Revealed weakness and broken trust bred doubt about whether defense is even possible.' : 'A calm week let quiet confidence tick up.',
      gp: anyPublished ? 'Being caught in a public lie cost the government dearly.' : 'No news, no damage.',
    },
    roleBriefs: {
      journalist_1: 'Your inbox is full of tips. Editors want a follow-up; readers want accountability. Next move?',
      journalist_2: 'The story is moving fast. Rivals are circling the same sources. Next move?',
      journalist_3: 'Your editor asks what you have that the others don’t. Next move?',
      government: 'Every microphone is pointed at you. This week’s move will define the narrative.',
      opposition: 'The government is wounded. How hard do you press — and at what cost to the country?',
    },
    publicMoodHint: anyPublished
      ? 'The public is rattled — anger at the government mixing with a creeping sense of vulnerability.'
      : 'The public is calm, though political insiders seem nervous.',
    keyMoment: anyPublished ? (t === 0 ? 'The readiness lie goes public' : 'Scandal deepens, accountability demanded') : 'An uneasy quiet holds',
  };
}

export function stubAiAction(role: Role, turn: number, spec: ActionSpec): SubmittedAction {
  // Deterministic per (role, turn): journalists mostly publish; gov defends; opposition attacks.
  const pick = (name: string, idx: number): string => {
    const f = spec.fields.find(x => x.name === name && x.type === 'choice');
    if (!f?.options?.length) return '';
    return f.options[Math.min(idx, f.options.length - 1)].value;
  };
  const choices: Record<string, string> = {};
  if (turn === 0) {
    // journalist_2 publishes, journalist_1/3 hold (varied, deterministic)
    const publish = role === 'journalist_2';
    choices.decision = pick('decision', publish ? 0 : 1);
    if (publish) choices.format = pick('format', 0);
  } else {
    const idx = (role.length + turn) % Math.max(1, (spec.fields[0].options?.length ?? 1));
    choices.decision = pick('decision', idx);
    const f2 = spec.fields.find(x => x.type === 'choice' && x.name !== 'decision' &&
      (!x.showIf || choices[x.showIf.field] === x.showIf.value));
    if (f2) choices[f2.name] = f2.options![turn % f2.options!.length].value;
  }
  return { choices, freeText: '' };
}
