import type { SupabaseClient } from './deps.ts';

export type Settings = Record<string, number>;

export type CallType = 'outline_preview' | 'confirmation_block' | 'next_block' | 'hold_block' | 'replan' | 'week_adjust';

export interface ModelChoice {
  model: string;
  inputPerMtok: number;
  outputPerMtok: number;
  cacheWritePerMtok: number;
  cacheReadPerMtok: number;
  effortMember: 'low' | 'medium' | 'high' | null;
  effortOther: 'low' | 'medium' | 'high' | null;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export async function loadSettings(admin: SupabaseClient): Promise<Settings> {
  const { data, error } = await admin.from('app_settings').select('key, value');
  if (error) throw new Error(`Could not read settings: ${error.message}`);
  return Object.fromEntries(data.map((row) => [row.key, Number(row.value)]));
}

export function setting(settings: Settings, key: string): number {
  const value = settings[key];
  if (value === undefined || Number.isNaN(value)) throw new Error(`Missing setting: ${key}`);
  return value;
}

/** The model and effort configured for a call type (ai_call_models) and its prices (ai_models). */
export async function modelFor(admin: SupabaseClient, callType: CallType): Promise<ModelChoice> {
  const { data, error } = await admin
    .from('ai_call_models')
    .select('model, effort_member, effort_other, ai_models(input_per_mtok_usd, output_per_mtok_usd, cache_write_per_mtok_usd, cache_read_per_mtok_usd)')
    .eq('call_type', callType)
    .single();
  if (error || !data) throw new Error(`No model configured for ${callType}`);
  const prices = data.ai_models as unknown as Record<string, number>;
  return {
    model: data.model,
    inputPerMtok: Number(prices.input_per_mtok_usd),
    outputPerMtok: Number(prices.output_per_mtok_usd),
    cacheWritePerMtok: Number(prices.cache_write_per_mtok_usd),
    cacheReadPerMtok: Number(prices.cache_read_per_mtok_usd),
    effortMember: data.effort_member,
    effortOther: data.effort_other,
  };
}

export function costUsd(usage: Usage, model: ModelChoice): number {
  const cost =
    (usage.input_tokens * model.inputPerMtok +
      usage.output_tokens * model.outputPerMtok +
      usage.cache_creation_input_tokens * model.cacheWritePerMtok +
      usage.cache_read_input_tokens * model.cacheReadPerMtok) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
