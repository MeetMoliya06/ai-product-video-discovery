import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { FatalSourceError } from '../net/resilience.js';

export type ImageInput = { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' };
export type Part = string | ImageInput;
export type Provider = 'gemini' | 'ollama' | 'anthropic' | 'none';

export function activeProvider(): Provider {
  const p = config.VISION_PROVIDER;
  if (p !== 'auto') return p === 'gemini' && !config.GEMINI_API_KEY ? 'none' : p === 'anthropic' && !config.ANTHROPIC_API_KEY ? 'none' : p === 'ollama' && !config.OLLAMA_URL ? 'none' : p;
  if (config.GEMINI_API_KEY) return 'gemini';
  if (config.OLLAMA_URL) return 'ollama';
  if (config.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}
export const visionAvailable = () => activeProvider() !== 'none';
export const visionModelName = () => ({ gemini: config.GEMINI_MODEL, ollama: config.OLLAMA_MODEL, anthropic: config.VISION_MODEL, none: 'none' })[activeProvider()];

/** Serialises calls and spaces them out so free-tier requests-per-minute limits aren't blown. */
let nextSlot = 0;
async function throttle() {
  const gap = 60_000 / Math.max(1, config.VISION_RPM);
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + gap;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gemini(system: string, parts: Part[], maxTokens: number): Promise<string> {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: parts.map((p) => (typeof p === 'string' ? { text: p } : { inline_data: { mime_type: p.mediaType, data: p.base64 } })) }],
    // x4: thinking models spend part of the output budget before answering
    generationConfig: { temperature: 0, maxOutputTokens: maxTokens * 4, responseMimeType: 'application/json' },
  };
  for (let attempt = 0; ; attempt++) {
    await throttle();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY!)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 3) throw new Error(`Gemini ${res.status} after retries (free-tier rate limit?)`);
      await sleep(5000 * 2 ** attempt); // free tier: back off and retry
      continue;
    }
    if (res.status === 400 || res.status === 403) throw new FatalSourceError(`Gemini rejected the request (${res.status}): check GEMINI_API_KEY / GEMINI_MODEL`, 'failed');
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data: any = await res.json();
    return (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  }
}

async function ollama(system: string, parts: Part[], maxTokens: number): Promise<string> {
  // Ollama attaches images to the message (order-preserving); the prompt text refers to them by position.
  const images = parts.filter((p): p is ImageInput => typeof p !== 'string').map((p) => p.base64);
  const text = parts.map((p) => (typeof p === 'string' ? p : '[image]')).join('\n');
  const res = await fetch(`${config.OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.OLLAMA_MODEL,
      stream: false,
      format: 'json',
      options: { temperature: 0, num_predict: maxTokens },
      messages: [{ role: 'system', content: system }, { role: 'user', content: text, images }],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (res.status === 404) throw new FatalSourceError(`Ollama model "${config.OLLAMA_MODEL}" not found: run \`ollama pull ${config.OLLAMA_MODEL}\``, 'failed');
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  return ((await res.json()) as any).message?.content ?? '';
}

let anthropic: Anthropic | undefined;
async function claude(system: string, parts: Part[], maxTokens: number): Promise<string> {
  anthropic ??= new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  const content = parts.map((p) =>
    typeof p === 'string' ? ({ type: 'text', text: p } as const) : ({ type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } } as const),
  );
  const res = await anthropic.messages.create({ model: config.VISION_MODEL, max_tokens: maxTokens, temperature: 0, system, messages: [{ role: 'user', content }] });
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

/** One structured-JSON call to the configured vision model. Tolerates code fences and prose around the object. */
export async function askJson<T>(system: string, parts: Part[], maxTokens = 900): Promise<T> {
  const provider = activeProvider();
  if (provider === 'none') throw new Error('No vision provider configured');
  const text = await { gemini, ollama, anthropic: claude }[provider](system, parts, maxTokens);
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Vision model returned no JSON');
  return JSON.parse(m[0]) as T;
}
