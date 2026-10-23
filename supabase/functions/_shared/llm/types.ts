// LLM Gateway Types — Provider-independent interface for WAYPOINT AI
// All API keys are read from Deno.env (Supabase Edge Function secrets)

export type LLMCapability = 'json_mode' | 'tool_calling' | 'vision' | 'streaming';

export type LLMErrorClass =
  | 'auth_error'
  | 'rate_limit'
  | 'timeout'
  | 'invalid_response'
  | 'unsupported_capability'
  | 'provider_down'
  | 'unknown';

export interface LLMRequest {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  jsonMode?: boolean;
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  requiredCapabilities?: LLMCapability[];
}

export interface LLMResponse {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  finishReason?: string;
}

export interface LLMError {
  errorClass: LLMErrorClass;
  provider: string;
  model: string;
  message: string;
  statusCode?: number;
  retryable: boolean;
}

export interface ProviderAdapter {
  name: string;
  capabilities: LLMCapability[];
  model: string;
  generateText(request: LLMRequest): Promise<LLMResponse>;
}

export interface ProviderConfig {
  name: string;
  model: string;
  apiKey: string;
  endpoint: string;
  capabilities: LLMCapability[];
  priority: number;
}

export interface LLMLog {
  provider: string;
  model: string;
  latency_ms: number;
  success: boolean;
  error_class?: LLMErrorClass;
  timestamp: string;
}
