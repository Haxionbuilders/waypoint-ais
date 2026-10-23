// LLM Provider Manager — Fallback-aware multi-provider gateway for WAYPOINT AI
// Supports Gemini, Groq, and OpenRouter with automatic retry and fallback.

import {
  type LLMCapability,
  type LLMErrorClass,
  type LLMLog,
  type LLMRequest,
  type LLMResponse,
  type ProviderAdapter,
  type ProviderConfig,
} from './types.ts';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const logs: LLMLog[] = [];

function logAttempt(entry: LLMLog): void {
  logs.push(entry);
  const status = entry.success ? '✓' : `✗ (${entry.error_class})`;
  console.log(
    `[LLM] ${entry.provider}/${entry.model} ${status} ${entry.latency_ms}ms`,
  );
}

/** Return a snapshot of all logged attempts (useful for diagnostics). */
export function getLogs(): readonly LLMLog[] {
  return logs;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/** Classify an HTTP error into a canonical LLMErrorClass. */
export function classifyError(status: number, body: string): LLMErrorClass {
  if (status === 401 || status === 403) return 'auth_error';
  if (status === 429) return 'rate_limit';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 502 || status === 503) return 'provider_down';

  const lower = body.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('rate_limit')) return 'rate_limit';
  if (lower.includes('timeout') || lower.includes('timed out')) return 'timeout';
  if (lower.includes('unauthorized') || lower.includes('invalid api key')) return 'auth_error';

  if (status >= 400 && status < 500) return 'invalid_response';
  if (status >= 500) return 'provider_down';

  return 'unknown';
}

function isRetryable(ec: LLMErrorClass): boolean {
  return ec === 'rate_limit' || ec === 'timeout';
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/** Google Gemini adapter (generativelanguage REST API). */
function createGeminiAdapter(config: ProviderConfig): ProviderAdapter {
  return {
    name: config.name,
    capabilities: config.capabilities,
    model: config.model,
    async generateText(request: LLMRequest): Promise<LLMResponse> {
      const url = `${config.endpoint}?key=${config.apiKey}`;

      // Build generationConfig
      const generationConfig: Record<string, unknown> = {};
      if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
      if (request.maxTokens !== undefined) generationConfig.maxOutputTokens = request.maxTokens;
      if (request.jsonMode) generationConfig.responseMimeType = 'application/json';
      if (request.jsonMode && request.jsonSchema) {
        generationConfig.responseSchema = request.jsonSchema;
      }

      // Gemini expects a flat contents array; map messages accordingly.
      const contents = request.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      // System instruction is handled separately by the Gemini API.
      let systemInstruction: { parts: { text: string }[] } | undefined;
      const systemMessages = request.messages.filter((m) => m.role === 'system');
      if (systemMessages.length > 0) {
        systemInstruction = {
          parts: systemMessages.map((m) => ({ text: m.content })),
        };
      }

      // Remove system messages from contents (they go into systemInstruction).
      const filteredContents = contents.filter(
        (_c, i) => request.messages[i].role !== 'system',
      );

      const body: Record<string, unknown> = {
        contents: filteredContents,
        generationConfig,
      };
      if (systemInstruction) body.systemInstruction = systemInstruction;

      const start = Date.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errBody = await res.text();
        const errorClass = classifyError(res.status, errBody);
        logAttempt({
          provider: config.name,
          model: config.model,
          latency_ms: latencyMs,
          success: false,
          error_class: errorClass,
          timestamp: new Date().toISOString(),
        });
        throw {
          errorClass,
          provider: config.name,
          model: config.model,
          message: errBody,
          statusCode: res.status,
          retryable: isRetryable(errorClass),
        } as import('./types.ts').LLMError;
      }

      const data = await res.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const finishReason = data?.candidates?.[0]?.finishReason;

      logAttempt({
        provider: config.name,
        model: config.model,
        latency_ms: latencyMs,
        success: true,
        timestamp: new Date().toISOString(),
      });

      return {
        text,
        provider: config.name,
        model: config.model,
        latencyMs,
        finishReason,
      };
    },
  };
}

/** Groq adapter (OpenAI-compatible chat completions). */
function createGroqAdapter(config: ProviderConfig): ProviderAdapter {
  return {
    name: config.name,
    capabilities: config.capabilities,
    model: config.model,
    async generateText(request: LLMRequest): Promise<LLMResponse> {
      const body: Record<string, unknown> = {
        model: config.model,
        messages: request.messages,
      };
      if (request.temperature !== undefined) body.temperature = request.temperature;
      if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
      if (request.jsonMode) body.response_format = { type: 'json_object' };

      const start = Date.now();
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errBody = await res.text();
        const errorClass = classifyError(res.status, errBody);
        logAttempt({
          provider: config.name,
          model: config.model,
          latency_ms: latencyMs,
          success: false,
          error_class: errorClass,
          timestamp: new Date().toISOString(),
        });
        throw {
          errorClass,
          provider: config.name,
          model: config.model,
          message: errBody,
          statusCode: res.status,
          retryable: isRetryable(errorClass),
        } as import('./types.ts').LLMError;
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      const finishReason = data?.choices?.[0]?.finish_reason;

      logAttempt({
        provider: config.name,
        model: config.model,
        latency_ms: latencyMs,
        success: true,
        timestamp: new Date().toISOString(),
      });

      return {
        text,
        provider: config.name,
        model: config.model,
        latencyMs,
        finishReason,
      };
    },
  };
}

/** OpenRouter adapter (OpenAI-compatible chat completions). */
function createOpenRouterAdapter(config: ProviderConfig): ProviderAdapter {
  return {
    name: config.name,
    capabilities: config.capabilities,
    model: config.model,
    async generateText(request: LLMRequest): Promise<LLMResponse> {
      const body: Record<string, unknown> = {
        model: config.model,
        messages: request.messages,
      };
      if (request.temperature !== undefined) body.temperature = request.temperature;
      if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
      if (request.jsonMode) body.response_format = { type: 'json_object' };

      const start = Date.now();
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errBody = await res.text();
        const errorClass = classifyError(res.status, errBody);
        logAttempt({
          provider: config.name,
          model: config.model,
          latency_ms: latencyMs,
          success: false,
          error_class: errorClass,
          timestamp: new Date().toISOString(),
        });
        throw {
          errorClass,
          provider: config.name,
          model: config.model,
          message: errBody,
          statusCode: res.status,
          retryable: isRetryable(errorClass),
        } as import('./types.ts').LLMError;
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      const finishReason = data?.choices?.[0]?.finish_reason;

      logAttempt({
        provider: config.name,
        model: config.model,
        latency_ms: latencyMs,
        success: true,
        timestamp: new Date().toISOString(),
      });

      return {
        text,
        provider: config.name,
        model: config.model,
        latencyMs,
        finishReason,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

/** Build the list of available provider configs from environment variables. */
export function getProviderConfigs(): ProviderConfig[] {
  const configs: ProviderConfig[] = [];

  const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('gemini_api_key');
  if (geminiKey) {
    configs.push({
      name: 'gemini',
      model: 'gemini-2.0-flash',
      apiKey: geminiKey,
      endpoint:
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      capabilities: ['json_mode', 'vision', 'streaming'],
      priority: 1,
    });
  }

  const groqKey = Deno.env.get('GROQ_API_KEY') || Deno.env.get('groq_api_key');
  if (groqKey) {
    configs.push({
      name: 'groq',
      model: 'llama-3.3-70b-versatile',
      apiKey: groqKey,
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      capabilities: ['json_mode', 'tool_calling'],
      priority: 2,
    });
  }

  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('openrouter_api_key');
  if (openRouterKey) {
    configs.push({
      name: 'openrouter',
      model: 'google/gemini-2.0-flash-exp:free',
      apiKey: openRouterKey,
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      capabilities: ['json_mode', 'vision', 'streaming', 'tool_calling'],
      priority: 3,
    });
  }

  // Sort by priority ascending (lower number = higher priority).
  return configs.sort((a, b) => a.priority - b.priority);
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

/** Instantiate the correct adapter for a given provider config. */
export function createAdapter(config: ProviderConfig): ProviderAdapter {
  switch (config.name) {
    case 'gemini':
      return createGeminiAdapter(config);
    case 'groq':
      return createGroqAdapter(config);
    case 'openrouter':
      return createOpenRouterAdapter(config);
    default:
      throw new Error(`Unknown provider: ${config.name}`);
  }
}

// ---------------------------------------------------------------------------
// Fallback orchestration
// ---------------------------------------------------------------------------

/**
 * Main entry point — tries providers in priority order with one retry for
 * transient errors (rate_limit, timeout), then falls back to the next
 * compatible provider.
 */
export async function generateWithFallback(
  request: LLMRequest,
): Promise<LLMResponse> {
  const configs = getProviderConfigs();
  if (configs.length === 0) {
    throw new Error(
      'No LLM providers configured. Set at least one of GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY.',
    );
  }

  const required: LLMCapability[] = request.requiredCapabilities ?? [];

  // Filter to providers that support all required capabilities.
  const compatible = configs.filter((c) =>
    required.every((cap) => c.capabilities.includes(cap)),
  );

  if (compatible.length === 0) {
    const available = configs
      .map((c) => `${c.name} [${c.capabilities.join(', ')}]`)
      .join('; ');
    throw new Error(
      `No provider supports required capabilities [${required.join(', ')}]. Available: ${available}`,
    );
  }

  const errors: import('./types.ts').LLMError[] = [];

  for (const config of compatible) {
    const adapter = createAdapter(config);

    // Attempt up to 2 times (initial + 1 retry for transient errors).
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await adapter.generateText(request);
      } catch (err: unknown) {
        const llmErr = err as import('./types.ts').LLMError;
        errors.push(llmErr);

        // Only retry on transient (retryable) errors, and only once.
        if (attempt === 0 && llmErr.retryable) {
          console.log(
            `[LLM] Retrying ${config.name} after transient error: ${llmErr.errorClass}`,
          );
          continue;
        }

        // Non-retryable or second failure — fall through to next provider.
        console.log(
          `[LLM] Falling back from ${config.name}: ${llmErr.errorClass} — ${llmErr.message?.slice(0, 120)}`,
        );
        break;
      }
    }
  }

  // All providers exhausted.
  const summary = errors
    .map((e) => `${e.provider}/${e.model}: ${e.errorClass} (${e.statusCode ?? 'n/a'})`)
    .join('; ');
  throw new Error(`All LLM providers failed. Attempts: ${summary}`);
}
