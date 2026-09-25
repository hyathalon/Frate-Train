// generate-program: builds adaptive training programs for signed-in coaches
// and athletes.
//
// POST { action, ... } with the user's access token (supabase-js
// functions.invoke sends it when signed in):
//   builds_status { athlete_id? }                       → allowance left
//   preview { athlete_id?, inputs, start_date? }        → season outline (Haiku), uses a preview
//   confirm { program_id }                              → starts block 1 (Sonnet) in the background;
//                                                         poll program_blocks for status
//
// Secrets: ANTHROPIC_API_KEY (set by the coach). SUPABASE_URL and
// SUPABASE_SECRET_KEYS are provided by the Edge Function runtime.
// Reference material comes from the hyathlon_reference table (seeded by
// scripts/seed-hyathlon-reference.js); the exercise library, templates and race
// sessions come from the database.

import { authenticate } from './lib/auth.ts';
import { makeCallClaude } from './lib/claude.ts';
import { createClient } from './lib/deps.ts';
import { corsHeaders, errorResponse, HttpError, jsonResponse } from './lib/http.ts';
import { buildsStatus, confirm, type Deps, preview } from './lib/program.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// JSON object of the project's secret keys, keyed by name.
const SUPABASE_SECRET_KEY = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default'];
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
// Optional: effort for block generation (low | medium | high). Defaults to medium.
const BLOCK_EFFORT = Deno.env.get('BLOCK_EFFORT');

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const deps: Deps = {
  admin,
  callClaude: ANTHROPIC_API_KEY ? makeCallClaude(ANTHROPIC_API_KEY) : null,
  now: () => new Date(),
  blockEffort: BLOCK_EFFORT === 'low' || BLOCK_EFFORT === 'high' ? BLOCK_EFFORT : 'medium',
  // Keeps the function alive after responding, within its wall-clock limit.
  runInBackground: (work) => {
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
  },
};

const ACTIONS = { builds_status: buildsStatus, preview, confirm } as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse(new HttpError(405, 'method_not_allowed', 'Use POST.'));

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'invalid_input', 'Request body must be JSON.');
    }
    const action = ACTIONS[body?.action as keyof typeof ACTIONS];
    if (!action) throw new HttpError(400, 'unknown_action', `Unknown action. Use one of: ${Object.keys(ACTIONS).join(', ')}.`);

    const caller = await authenticate(req, admin);
    const result = await action(deps, caller, body);
    return jsonResponse(result, body.action === 'confirm' ? 202 : 200);
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err);
    console.error('[generate-program] Unexpected error', err);
    return errorResponse(new HttpError(500, 'internal', 'Something went wrong. Please try again.'));
  }
});
