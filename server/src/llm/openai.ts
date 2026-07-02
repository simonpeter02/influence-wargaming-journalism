import { API_KEY } from '../config.js';

export async function jsonCall(model: string, system: string, user: string, maxTokens: number): Promise<unknown> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(data.choices[0].message.content);
}

/** Call fn, retry once on failure, fall back to stub so a live game never stalls. */
export async function withFallback<T>(label: string, fn: () => Promise<T>, stub: () => T): Promise<T> {
  try {
    return await fn();
  } catch (e1) {
    console.error(`[llm] ${label} failed, retrying:`, (e1 as Error).message);
    try {
      return await fn();
    } catch (e2) {
      console.error(`[llm] ${label} retry failed, using stub:`, (e2 as Error).message);
      return stub();
    }
  }
}
