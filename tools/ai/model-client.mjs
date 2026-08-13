/**
 * Shared model endpoint for the repo's AI tools.
 *
 * GitHub Models was retired on 2026-07-30, taking the inference API with it,
 * so `models.github.ai` and the workflow token no longer work. These tools now
 * talk to any OpenAI-compatible chat/completions endpoint.
 *
 * The default is Google's free tier: no credit card, no expiry, and a daily
 * allowance far above what these tools use between them. Point AI_MODEL_ENDPOINT
 * and AI_MODEL somewhere else to switch provider without touching the tools -
 * Groq, Cerebras, Mistral and OpenRouter all expose the same shape.
 *
 * Configure `AI_MODEL_API_KEY` as a repository secret. Without it the tools
 * skip their AI step rather than failing the workflow.
 */

export const MODEL_ENDPOINT =
  process.env.AI_MODEL_ENDPOINT ||
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export const DEFAULT_MODEL = process.env.AI_MODEL || 'gemini-3.1-flash-lite';

export const modelToken = () => process.env.AI_MODEL_API_KEY || '';

export const hasModelAccess = () => modelToken() !== '';

/** Headers for an OpenAI-compatible endpoint. No provider-specific extras. */
export const modelHeaders = (token = modelToken()) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

/**
 * One chat completion. Throws on a non-2xx so callers can retry or report;
 * returns the assistant message content, trimmed.
 */
export const callModel = async (
  messages,
  { model = DEFAULT_MODEL, temperature = 0.1, token = modelToken() } = {},
) => {
  const res = await fetch(MODEL_ENDPOINT, {
    method: 'POST',
    headers: modelHeaders(token),
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!res.ok) {
    const body = await res.text();
    // Model names get retired; make the fix obvious rather than cryptic.
    const hint =
      res.status === 404
        ? ' (set the AI_MODEL repository variable to a current model)'
        : '';
    throw new Error(`Model endpoint ${res.status}${hint}: ${body}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
};
