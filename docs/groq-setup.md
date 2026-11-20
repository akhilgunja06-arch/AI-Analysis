# Groq AI Study Assistant setup

The assistant is a separate feature from member-to-member messaging. It answers
study questions, refuses non-study requests, and — when it is not configured —
says so instead of inventing an answer.

## Status in this repository

The integration is implemented and tested, but **no Groq API key is configured in
this development environment**. With `GROQ_API_KEY` empty:

- `GET /api/support/status` reports `aiAssistance.enabled: false`.
- `/assistant` shows a "not configured" panel and names the missing variable.
- Sending a question still stores it, and the `501 AI_NOT_CONFIGURED` from the
  API is displayed with a retry button. Nothing is fabricated.

To make it answer, set a key as described below and restart the API.

## Get a key

1. Sign in at <https://console.groq.com>.
2. Open **API Keys** and create a key.
3. Copy it once — the console does not show it again.
4. Confirm which model names your account can use on the **Models** page.

## Configure

Add to `server/.env`:

```bash
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MAX_TOKENS=2048
GROQ_TEMPERATURE=0.4
GROQ_TIMEOUT_MS=30000
AI_RATE_LIMIT_MAX=30
```

Restart the API. Then check:

```bash
curl -s http://localhost:4000/api/support/status | python3 -m json.tool
```

`aiAssistance.enabled` should be `true` and `aiAssistance.model` should echo your
`GROQ_MODEL`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `GROQ_API_KEY` | empty | Server-side only. Never sent to the browser. |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Must be a model your key can use. |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible base URL. |
| `GROQ_MAX_TOKENS` | `2048` | Reply length ceiling. |
| `GROQ_TEMPERATURE` | `0.4` | Lower is more literal. |
| `GROQ_TIMEOUT_MS` | `30000` | Request timeout; a timeout becomes `504 AI_TIMEOUT`. |
| `AI_RATE_LIMIT_MAX` | `30` | Assistant requests per member per `RATE_LIMIT_WINDOW_MS`. |

**Verify the model name.** Groq retires models on a schedule. A retired name
produces `502 AI_MODEL_UNAVAILABLE` with a message telling an administrator to
check `GROQ_MODEL`. It never silently falls back to another model, because a
different model would change answer quality without anyone noticing.

## Behaviour

### Study scope

The system prompt restricts answers to mathematics, physics, chemistry, biology,
computer science, programming, engineering, English grammar and study skills. It
also instructs the model to:

- lead with a one-sentence answer, then explain step by step;
- use headings, bullets and fenced code blocks with a language tag;
- show working for calculations, with units;
- reply in Telugu when the question is in Telugu, keeping technical terms in
  English;
- say when it is unsure, and never invent citations or statistics;
- state that it cannot browse the internet or read the student's files.

### Prompt moderation

Every prompt passes the same study-only classifier used for messages before it
reaches Groq. A clearly non-study or prohibited prompt is refused with `422` and
never sent to the provider, so the key is not spent on it. Educational anatomy,
biology and medical vocabulary is allowed — the classifier is written to avoid
flagging legitimate academic terms.

### Error mapping

| Provider result | API response |
| --- | --- |
| Key missing | `501 AI_NOT_CONFIGURED` |
| 401 / 403 | `502 AI_AUTH_FAILED` |
| 404 | `502 AI_MODEL_UNAVAILABLE` |
| 429 | `429 AI_RATE_LIMITED` |
| 5xx | `503 AI_UPSTREAM_UNAVAILABLE` |
| Timeout | `504 AI_TIMEOUT` |
| Empty completion | `502 AI_EMPTY_RESPONSE` |

Provider response bodies are logged server-side and never returned to the client:
they can echo request details.

## Data model

- `AiConversation` — one row per chat, owned by a member.
- `AiMessage` — alternating `USER` and `ASSISTANT` turns.

Both are scoped to the owner on every request. Requesting another member's
conversation returns `404`, not `403`, so the existence of a conversation is not
disclosed.

## Verifying it works

```bash
TOKEN=...   # from POST /api/auth/login
CONV=$(curl -s -X POST http://localhost:4000/api/ai/conversations \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["id"])')

curl -s -X POST "http://localhost:4000/api/ai/conversations/$CONV/messages" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"content":"Explain Newton second law with an example"}' | python3 -m json.tool
```

A configured deployment returns the assistant text. An unconfigured one returns
`501 AI_NOT_CONFIGURED` — which is the correct, honest result, not a bug.

## Cost control

- `AI_RATE_LIMIT_MAX` caps requests per member per window.
- `GROQ_MAX_TOKENS` caps reply length.
- Conversation history sent to the provider is trimmed to the recent turns.
- Non-study prompts are rejected before the request is made.

## If answers stop arriving

1. `GET /api/support/status` — is `aiAssistance.enabled` still `true`?
2. Send one question and read the error code:
   - `AI_AUTH_FAILED` — key revoked or wrong.
   - `AI_MODEL_UNAVAILABLE` — model retired; pick a current one.
   - `AI_RATE_LIMITED` — provider quota; wait or upgrade.
3. Check the API log for `groq.upstream_error`; it records the provider status
   and a truncated body without the key.
