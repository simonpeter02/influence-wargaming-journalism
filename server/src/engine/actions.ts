import type { ActionSpec, Role, SubmittedAction, InjectType } from '@iwj/shared';
import { JOURNALIST_ROLES } from '@iwj/shared';

// Action specs are server-authored and sent to clients inside PlayerView.
// Every action is a concrete move: fixed choices first, optional free text detail.

export function getActionSpec(role: Role, turn: number, hasPublishedLeak: boolean): ActionSpec | null {
  const isJournalist = JOURNALIST_ROLES.includes(role);
  if (turn === 0 && !isJournalist) return null; // gov/opposition enter at turn 1

  if (isJournalist) {
    if (turn === 0) {
      return {
        prompt: 'The documents are on your desk. What do you do?',
        fields: [
          { name: 'decision', label: 'Decision', type: 'choice', options: [
            { value: 'publish', label: 'Publish now' },
            { value: 'hold', label: 'Hold the story (you can publish later)' },
          ]},
          { name: 'format', label: 'Format & sentiment', type: 'choice', showIf: { field: 'decision', value: 'publish' }, options: [
            { value: 'government-critical exposé', label: 'Government-critical exposé' },
            { value: 'public call to action', label: 'Public call to action' },
            { value: 'sober human-interest feature', label: 'Sober human-interest feature' },
            { value: 'streaming documentary', label: 'Streaming documentary' },
          ]},
          { name: 'freeText', label: 'Your angle (optional, one line)', type: 'text' },
        ],
      };
    }
    const publishHeld = hasPublishedLeak ? [] : [{ value: 'publish the held leak documents', label: 'Publish the leaked documents now' }];
    return {
      prompt: 'Your move this week.',
      fields: [
        { name: 'decision', label: 'Action', type: 'choice', options: [
          ...publishHeld,
          { value: 'publish a follow-up investigation', label: 'Follow-up investigation' },
          { value: 'write an op-ed', label: 'Op-ed with your opinion' },
          { value: 'land a big interview', label: 'Land a big interview' },
          { value: 'stay quiet this week', label: 'Stay quiet this week' },
        ]},
        { name: 'format', label: 'Sentiment', type: 'choice', options: [
          { value: 'government-critical', label: 'Government-critical' },
          { value: 'calling the public to action', label: 'Call to action' },
          { value: 'reassuring and constructive', label: 'Reassuring / constructive' },
        ]},
        { name: 'freeText', label: 'Details (optional)', type: 'text' },
      ],
    };
  }

  if (role === 'government') {
    return {
      prompt: 'Your move this week.',
      fields: [
        { name: 'decision', label: 'Action', type: 'choice', options: [
          { value: 'hold a press conference', label: 'Press conference' },
          { value: 'announce emergency defense funding', label: 'Announce emergency defense funding' },
          { value: 'discredit the reporting', label: 'Discredit the reporting' },
          { value: 'publish a transparency report', label: 'Come clean: transparency report' },
          { value: 'say nothing', label: 'Say nothing' },
        ]},
        { name: 'freeText', label: 'Key message (optional)', type: 'text' },
      ],
    };
  }

  return {
    prompt: 'Your move this week.',
    fields: [
      { name: 'decision', label: 'Action', type: 'choice', options: [
        { value: 'demand a parliamentary inquiry', label: 'Demand a parliamentary inquiry' },
        { value: 'launch a public campaign against the government', label: 'Public campaign against the government' },
        { value: 'call for the defense minister to resign', label: 'Call for the minister’s resignation' },
        { value: 'offer a national unity pact on defense', label: 'Offer a national-unity pact on defense' },
      ]},
      { name: 'freeText', label: 'Key message (optional)', type: 'text' },
    ],
  };
}

// Situation-specific weekly options written by the game master, merged with engine-owned invariants
// (the held-leak option must always exist while the leak is unpublished; journalists pick a sentiment).
export function dynamicActionSpec(role: Role, gmOptions: string[], hasPublishedLeak: boolean): ActionSpec {
  const clean = [...new Set(gmOptions.map(o => o.trim()).filter(o => o.length >= 3))]
    .slice(0, 5)
    .map(o => ({ value: o.slice(0, 90), label: o.charAt(0).toUpperCase() + o.slice(1, 90) }));
  const isJournalist = JOURNALIST_ROLES.includes(role);
  const options = [
    ...(isJournalist && !hasPublishedLeak
      ? [{ value: 'publish the held leak documents', label: 'Publish the leaked documents now' }]
      : []),
    ...clean,
  ];
  const fields: ActionSpec['fields'] = [
    { name: 'decision', label: 'Action', type: 'choice', options },
    ...(isJournalist
      ? [{
          name: 'format', label: 'Sentiment', type: 'choice' as const, options: [
            { value: 'government-critical', label: 'Government-critical' },
            { value: 'calling the public to action', label: 'Call to action' },
            { value: 'reassuring and constructive', label: 'Reassuring / constructive' },
          ],
        }]
      : []),
    { name: 'freeText', label: 'Details (optional)', type: 'text' },
  ];
  return { prompt: 'Your move this week.', fields };
}

export function getInjectSpec(type: InjectType): ActionSpec {
  switch (type) {
    case 'no_confidence':
      return {
        prompt: 'The government is on the ropes. Your whips say the numbers might be there. Call a vote of no confidence?',
        fields: [
          { name: 'decision', label: 'Decision', type: 'choice', options: [
            { value: 'call the vote of no confidence', label: 'Call the vote' },
            { value: 'hold fire and let them bleed', label: 'Hold fire — let them bleed' },
          ]},
          { name: 'freeText', label: 'Your message to parliament (optional)', type: 'text' },
        ],
      };
    case 'book_deal':
      return {
        prompt: 'A major publisher wants a book on the scandal you broke — fast, loud, and yours. Accept?',
        fields: [
          { name: 'decision', label: 'Decision', type: 'choice', options: [
            { value: 'accept the book deal', label: 'Accept the deal' },
            { value: 'decline the book deal', label: 'Decline' },
          ]},
          { name: 'tone', label: 'The book’s tone', type: 'choice', showIf: { field: 'decision', value: 'accept the book deal' }, options: [
            { value: 'alarm-raising', label: 'Alarm-raising: wake the country up' },
            { value: 'reconciliatory', label: 'Reconciliatory: how we fix this together' },
          ]},
          { name: 'freeText', label: 'Working title (optional)', type: 'text' },
        ],
      };
    case 'tv_debate':
      return {
        prompt: 'You are invited onto tonight’s prime-time debate about your reporting and the state of the country. The host asks: “Did your coverage make the country safer — or weaker?”',
        fields: [
          { name: 'decision', label: 'Your stance on air', type: 'choice', options: [
            { value: 'defend the reporting as a public service', label: 'Defend the reporting' },
            { value: 'strike a self-critical note', label: 'Self-critical note' },
            { value: 'turn the fire on the government', label: 'Turn the fire on the government' },
          ]},
          { name: 'freeText', label: 'Your best line (optional)', type: 'text' },
        ],
      };
    case 'invasion':
    case 'press_conference':
      // no fixed-choice decision — invasion ends the game; press_conference runs the interview phase
      return { prompt: '', fields: [] };
  }
}

export function validateAction(spec: ActionSpec, action: SubmittedAction): string | null {
  for (const f of spec.fields) {
    if (f.type !== 'choice') continue;
    const visible = !f.showIf || action.choices[f.showIf.field] === f.showIf.value;
    const v = action.choices[f.name];
    if (visible && !v) return `missing choice: ${f.name}`;
    if (v && !f.options!.some(o => o.value === v)) return `invalid value for ${f.name}`;
  }
  return null;
}

export function defaultAction(spec: ActionSpec): SubmittedAction {
  // Used for force-skip: pick the first option of each visible choice field.
  const choices: Record<string, string> = {};
  for (const f of spec.fields) {
    if (f.type !== 'choice') continue;
    const visible = !f.showIf || choices[f.showIf.field] === f.showIf.value;
    if (visible) choices[f.name] = f.options![0].value;
  }
  return { choices, freeText: '' };
}

export function describeAction(a: SubmittedAction): string {
  let s = a.choices.decision || 'no action';
  const extras = Object.entries(a.choices).filter(([k]) => k !== 'decision').map(([, v]) => v);
  if (extras.length) s += ` (${extras.join(', ')})`;
  if (a.freeText) s += ` — "${a.freeText}"`;
  return s;
}
