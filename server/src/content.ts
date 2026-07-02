import type { Role } from '@iwj/shared';
import { ROLE_META } from '@iwj/shared';

export const COUNTRY = 'Nordavia';

export const HOT_INFO =
  `LEAKED DOCUMENTS (verified): Only 4 of ${COUNTRY}'s 12 air-defense batteries are operational. ` +
  `Spare parts ran out in 2024. The Defense Ministry has publicly claimed "full readiness" three times this year. ` +
  `A hostile neighbor has been massing exercises near the border.`;

const JOURNALIST_CARD = (outlet: string) =>
  `You are an investigative journalist at ${outlet}. You want big stories, readership and attention — your career depends on it. ` +
  `But you also live in ${COUNTRY}, a liberal democracy you are fond of.\n\n` +
  `HOT INFORMATION has landed on your desk:\n${HOT_INFO}\n\n` +
  `Other journalists are rumored to hold the same documents. If you hold the story, someone else may run it first — ` +
  `and if you do not publish now, you can still publish in a later week.`;

export const ROLE_CARDS: Record<Role, string> = {
  journalist_1: JOURNALIST_CARD(ROLE_META.journalist_1.outlet!),
  journalist_2: JOURNALIST_CARD(ROLE_META.journalist_2.outlet!),
  journalist_3: JOURNALIST_CARD(ROLE_META.journalist_3.outlet!),
  government:
    `You speak for the government of ${COUNTRY}, a liberal democracy. Your goal: keep the government in office and popular. ` +
    `You know defense readiness is worse than publicly admitted. Rumors say several journalists have leaked documents about it.\n\n` +
    `You like your country and do not want it weakened — but you also intend to survive the week's news cycle.`,
  opposition:
    `You lead the opposition in ${COUNTRY}, a liberal democracy. Your goal: weaken the government and position yourself for power — ` +
    `but you love your country, and an actual security crisis helps no one.\n\n` +
    `Rumors say a defense-readiness scandal is about to break. How you use it is up to you.`,
};

export const INITIAL_MOOD = 'The public is calm. Defense is not on anyone’s mind.';

export const INVASION_NARRATIVE =
  `With the public's will to resist visibly collapsed, the hostile neighbor calls the bluff: columns cross the border at dawn. ` +
  `There is barely any organized resistance. The wargame ends here — not because the military failed, but because the public had already given up.`;
