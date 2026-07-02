import { useState } from 'react';
import type { ActionField, ActionSpec, SubmittedAction } from '@iwj/shared';

interface Props {
  spec: ActionSpec;
  onSubmit: (action: SubmittedAction) => void;
  submitLabel?: string;
  disabled?: boolean;
}

function isVisible(field: ActionField, choices: Record<string, string>): boolean {
  return !field.showIf || choices[field.showIf.field] === field.showIf.value;
}

/** Drop values for fields whose showIf condition no longer holds (cascading). */
function prune(spec: ActionSpec, choices: Record<string, string>): Record<string, string> {
  const out = { ...choices };
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of spec.fields) {
      if (f.name in out && !isVisible(f, out)) {
        delete out[f.name];
        changed = true;
      }
    }
  }
  return out;
}

/** Generic ActionSpec → form. Radio-card groups for 'choice', one-line inputs for 'text'. */
export default function ActionForm({ spec, onSubmit, submitLabel, disabled }: Props) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});

  const pick = (name: string, value: string) => {
    setChoices((prev) => prune(spec, { ...prev, [name]: value }));
  };

  const visibleFields = spec.fields.filter((f) => isVisible(f, choices));
  const ready = visibleFields
    .filter((f) => f.type === 'choice')
    .every((f) => typeof choices[f.name] === 'string');

  const handleSubmit = () => {
    const freeText = visibleFields
      .filter((f) => f.type === 'text')
      .map((f) => (texts[f.name] ?? '').trim())
      .filter((t) => t.length > 0)
      .join('\n');
    onSubmit({ choices, freeText });
  };

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{spec.prompt}</h2>
      {visibleFields.map((f) =>
        f.type === 'text' ? (
          <div key={f.name} style={{ margin: '14px 0' }}>
            <label className="muted" htmlFor={`fld-${f.name}`}>{f.label}</label>
            <input
              id={`fld-${f.name}`}
              type="text"
              maxLength={200}
              style={{ marginTop: 6 }}
              value={texts[f.name] ?? ''}
              onChange={(e) => setTexts((prev) => ({ ...prev, [f.name]: e.target.value }))}
            />
          </div>
        ) : (
          <div key={f.name} style={{ margin: '14px 0' }}>
            <span className="muted">{f.label}</span>
            {(f.options ?? []).map((o) => (
              <label key={o.value} className={`opt${choices[f.name] === o.value ? ' sel' : ''}`}>
                <input
                  type="radio"
                  name={f.name}
                  value={o.value}
                  checked={choices[f.name] === o.value}
                  onChange={() => pick(f.name, o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
        ),
      )}
      <button className="primary" disabled={!ready || disabled} onClick={handleSubmit}>
        {submitLabel ?? 'Commit this action'}
      </button>
      <div className="muted" style={{ marginTop: 8 }}>
        Your action is final — the week unfolds once you commit.
      </div>
    </div>
  );
}
