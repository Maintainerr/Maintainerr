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

/**
 * How much the model may think before answering, as OpenAI's `reasoning_effort`
 * ('none' | 'minimal' | 'low' | 'medium' | 'high'), which the compatibility
 * layer maps onto Gemini's thinking levels.
 *
 * Empty means "send no field at all". Gemini then thinks dynamically, sizing
 * the effort to the request against a per-model default, which is what every
 * caller gets unless it opts in or the repository variable is set.
 */
export const DEFAULT_REASONING_EFFORT =
  process.env.AI_MODEL_REASONING_EFFORT || '';

export const modelToken = () => process.env.AI_MODEL_API_KEY || '';

export const hasModelAccess = () => modelToken() !== '';

/** Headers for an OpenAI-compatible endpoint. No provider-specific extras. */
export const modelHeaders = (token = modelToken()) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

/**
 * Gap between requests, sized for the provider's free tier.
 *
 * Gemini's free tier allows 15 requests per minute; 4500ms gives about 13,
 * leaving headroom for clock skew and any retry that lands in the same window.
 * Going faster does not fail outright - the provider returns 429 and callers
 * back off - but a run then crawls through its retry ladder instead of
 * finishing. Raise AI_MODEL_MIN_GAP_MS on a paid tier.
 */
export const MIN_GAP_MS = Number(process.env.AI_MODEL_MIN_GAP_MS ?? 4500);

let lastCallAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Await this before any direct fetch to the model endpoint. */
export const throttleModelCall = async () => {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_GAP_MS) {
    await sleep(MIN_GAP_MS - elapsed);
  }
  lastCallAt = Date.now();
};

const UNKNOWN_FIELD_MARKER = 'Unknown name "';

/**
 * Google's compatibility layer rejects any field it does not know rather than
 * ignoring it, answering 400 with `Invalid JSON payload received. Unknown name
 * "store": Cannot find field.` Pull the field name back out so the caller can
 * drop it and retry instead of losing the run over an optional parameter.
 */
const unknownField = (body = '') => {
  const start = body.indexOf(UNKNOWN_FIELD_MARKER);
  if (start === -1) return '';
  const from = start + UNKNOWN_FIELD_MARKER.length;
  const end = body.indexOf('"', from);
  return end === -1 ? '' : body.slice(from, end);
};

// Every optional field could be rejected in turn; the cap stops a provider that
// answers 400 for something else from looping forever.
const MAX_FIELD_STRIPS = 4;

/**
 * Statuses worth another attempt. The free tier answers 429 when it is being
 * paced too hard and 503 when the model itself is busy, and both clear on their
 * own. Without this a few busy seconds silently downgrade a release to the
 * fallback notes, which is what happened to 3.23.0.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// 2s, 4s, 8s, 16s: half a minute of patience, which is nothing next to a
// release, and short enough that a genuinely dead endpoint still reports fast.
const MAX_RETRIES = Number(process.env.AI_MODEL_MAX_RETRIES ?? 4);
const RETRY_BASE_MS = Number(process.env.AI_MODEL_RETRY_BASE_MS ?? 2000);

const log = (msg) => process.stderr.write(`[model-client] ${msg}\n`);

/**
 * One chat completion, paced for the free tier. Retries a busy endpoint with
 * exponential backoff and throws once it stops being worth waiting for, so a
 * caller only sees a failure it cannot recover from.
 *
 * Temperature defaults to 0: every tool in this repo wants the same answer for
 * the same input, not a fresh sample.
 */
export const callModel = async (
  messages,
  {
    model = DEFAULT_MODEL,
    temperature = 0,
    token = modelToken(),
    reasoningEffort = DEFAULT_REASONING_EFFORT,
  } = {},
) => {
  const payload = { model, messages, temperature };
  if (reasoningEffort) payload.reasoning_effort = reasoningEffort;

  // Counted separately: dropping a rejected field is not an attempt at the same
  // request, so a stripped field must not spend the transient-failure budget.
  let stripped = 0;
  let retries = 0;

  for (;;) {
    await throttleModelCall();
    const res = await fetch(MODEL_ENDPOINT, {
      method: 'POST',
      headers: modelHeaders(token),
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      return (data.choices?.[0]?.message?.content || '').trim();
    }

    const body = await res.text();
    const rejected = res.status === 400 ? unknownField(body) : '';
    if (
      rejected &&
      Object.hasOwn(payload, rejected) &&
      stripped < MAX_FIELD_STRIPS
    ) {
      stripped += 1;
      delete payload[rejected];
      log(`endpoint rejected "${rejected}"; retrying without it`);
      continue;
    }

    if (RETRYABLE_STATUSES.has(res.status) && retries < MAX_RETRIES) {
      const waitMs = RETRY_BASE_MS * 2 ** retries;
      retries += 1;
      log(
        `endpoint ${res.status}; retry ${retries}/${MAX_RETRIES} in ${waitMs}ms`,
      );
      await sleep(waitMs);
      continue;
    }

    // Model names get retired; make the fix obvious rather than cryptic.
    const hint =
      res.status === 404
        ? ' (set the AI_MODEL repository variable to a current model)'
        : '';
    throw new Error(`Model endpoint ${res.status}${hint}: ${body}`);
  }
};
