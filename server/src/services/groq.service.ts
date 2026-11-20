import { env } from '../config/env';
import { logger } from '../lib/logger';
import { ApiError } from '../lib/errors';

/**
 * Groq chat-completions client for the AI Study Assistant.
 *
 * Deliberate constraints:
 *  - the API key is read from the server environment and never leaves it;
 *  - every failure mode maps to a specific, non-leaking error code, so a
 *    provider outage is never presented as an answer;
 *  - there is no fallback that invents a reply. If the provider is not
 *    configured the caller gets AI_NOT_CONFIGURED, full stop.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatTurn = { role: ChatRole; content: string };

export type CompletionOptions = {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask Groq to constrain the reply to a single JSON object. */
  jsonMode?: boolean;
};

export type GroqCompletion = {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: string | null;
};

const SYSTEM_PROMPT = `You are the SkillSpring AI Study Assistant: a patient tutor for students.

Scope
- Answer academic questions: mathematics, physics, chemistry, biology, computer
  science, programming, engineering, English grammar and general study skills.
- Politely decline anything sexual, abusive, threatening, illegal or purely
  social. Say briefly that you only help with study topics, then offer a study
  question you could help with instead. Do not lecture the student.
- Educational treatment of anatomy, reproduction, biology or medicine is
  allowed when the intent is academic.

How to answer
- Start with a one-sentence direct answer, then explain step by step.
- Use short headings and bullet points. Use fenced code blocks with a language
  tag for code, and explain code line by line when asked.
- Show the working for calculations, with units and a final boxed answer.
- Give at least one concrete example or practice question when it helps.
- When asked for a quiz, produce numbered questions, then a clearly separated
  answer key.
- Reply in Telugu when the student writes in Telugu, otherwise in English. Keep
  technical terms in English inside Telugu explanations.

Honesty
- If you are unsure, say so plainly and explain what you would need to check.
- Never invent citations, statistics, laws or API signatures.
- You cannot browse the internet and cannot see the student's files. Say so when
  a question depends on something you cannot see.`;

function endpoint(): string {
  return `${env.GROQ_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
}

/** True only when a key is present. Callers use this to decide on a 501. */
export function assistantConfigured(): boolean {
  return Boolean(env.groqApiKey);
}

/**
 * Maps an upstream failure to a safe ApiError. The provider body is logged but
 * never returned: it can echo request details and occasionally headers.
 */
function upstreamError(status: number, bodyText: string): ApiError {
  logger.warn('groq.upstream_error', { status, body: bodyText.slice(0, 500) });

  if (status === 401 || status === 403) {
    return new ApiError(
      502,
      'AI_AUTH_FAILED',
      'The study assistant could not authenticate with its model provider. An administrator needs to check the API key.',
    );
  }
  if (status === 429) {
    return new ApiError(
      429,
      'AI_RATE_LIMITED',
      'The study assistant is busy right now. Please wait a moment and try again.',
    );
  }
  if (status === 404) {
    return new ApiError(
      502,
      'AI_MODEL_UNAVAILABLE',
      'The configured assistant model is not available. An administrator needs to check AI_MODEL.',
    );
  }
  if (status >= 500) {
    return new ApiError(
      503,
      'AI_UPSTREAM_UNAVAILABLE',
      'The study assistant is temporarily unavailable. Please try again shortly.',
    );
  }
  return new ApiError(502, 'AI_UPSTREAM_ERROR', 'The study assistant could not answer that question.');
}

/**
 * Sends the conversation to Groq and returns the assistant's reply.
 * Throws ApiError on every failure path; never returns a fabricated answer.
 */
export async function completeChat(turns: ChatTurn[], options?: CompletionOptions): Promise<GroqCompletion> {
  if (!assistantConfigured()) {
    throw new ApiError(
      501,
      'AI_NOT_CONFIGURED',
      'The AI Study Assistant is not configured on this deployment. Ask an administrator to set AI_API_KEY.',
      { requiredEnv: ['AI_API_KEY', 'AI_MODEL'] },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.groqApiKey}`,
      },
      body: JSON.stringify({
        model: env.groqModel,
        messages: [
          { role: 'system', content: options?.systemPrompt ?? SYSTEM_PROMPT },
          ...turns,
        ],
        temperature: options?.temperature ?? env.GROQ_TEMPERATURE,
        max_tokens: options?.maxTokens ?? env.GROQ_MAX_TOKENS,
        stream: false,
        ...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw upstreamError(response.status, await response.text());
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const choice = payload.choices?.[0];
    const content = choice?.message?.content?.trim();
    if (!content) {
      logger.warn('groq.empty_completion', { model: payload.model });
      throw new ApiError(
        502,
        'AI_EMPTY_RESPONSE',
        'The assistant returned an empty answer. Please try rephrasing your question.',
      );
    }

    return {
      content,
      model: payload.model ?? env.groqModel,
      finishReason: choice?.finish_reason ?? null,
      usage: payload.usage
        ? {
            promptTokens: payload.usage.prompt_tokens ?? 0,
            completionTokens: payload.usage.completion_tokens ?? 0,
            totalTokens: payload.usage.total_tokens ?? 0,
          }
        : undefined,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(504, 'AI_TIMEOUT', 'The study assistant took too long to answer. Please try again.');
    }
    logger.error('groq.request_failed', { err });
    throw new ApiError(503, 'AI_UPSTREAM_UNAVAILABLE', 'Could not reach the study assistant. Please try again.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probes the provider with a one-token request so the UI can state, truthfully,
 * whether the assistant will actually answer. Never throws.
 */
export async function probeProvider(): Promise<{
  ok: boolean;
  model: string;
  detail?: string;
  status?: number;
}> {
  if (!assistantConfigured()) {
    return { ok: false, model: env.groqModel, detail: 'AI_API_KEY is not set' };
  }
  try {
    await completeChat([{ role: 'user', content: 'Reply with the single word: ready' }]);
    return { ok: true, model: env.groqModel };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, model: env.groqModel, detail: err.code, status: err.status };
    }
    return { ok: false, model: env.groqModel, detail: 'unknown' };
  }
}
