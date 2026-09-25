import { Anthropic } from './deps.ts';
import type { ModelChoice, Usage } from './settings.ts';

export interface ClaudeCallInput {
  model: ModelChoice;
  system: string;
  messages: Anthropic.MessageParam[];
  schema: Record<string, unknown>;
  maxTokens: number;
  effort?: 'low' | 'medium' | 'high';
  timeoutMs: number;
}

export interface ClaudeCallResult<T> {
  data: T | null;
  text: string; // the raw JSON text, sent back on a repair turn
  usage: Usage;
  stopReason: string | null;
  durationMs: number;
  error: string | null; // why data is null
}

/** How the function talks to Claude; tests pass a fake with the same shape. */
export type CallClaude = <T>(input: ClaudeCallInput) => Promise<ClaudeCallResult<T>>;

const EMPTY_USAGE: Usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

export function makeCallClaude(apiKey: string): CallClaude {
  const client = new Anthropic({ apiKey });

  return async <T>(input: ClaudeCallInput): Promise<ClaudeCallResult<T>> => {
    const started = Date.now();
    const params: Anthropic.MessageStreamParams = {
      model: input.model.model,
      max_tokens: input.maxTokens,
      // The system prompt is the same for every call: cache it.
      system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
      messages: input.messages,
      output_config: {
        format: { type: 'json_schema', schema: input.schema },
        ...(input.effort ? { effort: input.effort } : {}),
      },
    };

    let message: Anthropic.Message;
    try {
      message = await client.messages
        // No automatic retry: a retried timeout would overrun the Edge Function limits.
        .stream(params, { timeout: input.timeoutMs, maxRetries: 0 })
        .finalMessage();
    } catch (err) {
      let error = `Unexpected error calling Claude: ${err}`;
      if (err instanceof Anthropic.RateLimitError) error = 'Claude is rate limited. Try again shortly.';
      else if (err instanceof Anthropic.AuthenticationError) error = 'The Anthropic API key is invalid.';
      else if (err instanceof Anthropic.APIConnectionTimeoutError) error = 'Claude took too long to respond.';
      else if (err instanceof Anthropic.APIError) error = `Claude API error (${err.status}): ${err.message}`;
      return { data: null, text: '', usage: EMPTY_USAGE, stopReason: null, durationMs: Date.now() - started, error };
    }

    const usage: Usage = {
      input_tokens: message.usage.input_tokens ?? 0,
      output_tokens: message.usage.output_tokens ?? 0,
      cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
    };
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const base = { text, usage, stopReason: message.stop_reason, durationMs: Date.now() - started };

    if (message.stop_reason === 'refusal') return { ...base, data: null, error: 'Claude declined this request.' };
    if (message.stop_reason === 'max_tokens') return { ...base, data: null, error: 'The answer was cut off (too long).' };
    try {
      return { ...base, data: JSON.parse(text) as T, error: null };
    } catch {
      return { ...base, data: null, error: 'Claude did not return valid JSON.' };
    }
  };
}
