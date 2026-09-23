// FrateTrain — generate-program Edge Function
//
// Builds a training program with Claude, grounded in the Hyathlon Performance
// reference library. The raw PDFs/docx in assets/hyrox/ live in the app repo,
// which this function cannot read (Edge Functions run on Supabase's servers).
// Instead it reads pre-parsed text from `reference_documents`, kept in sync
// by scripts/sync-reference-docs.js.
//
// Deploy: bunx eas-cli@latest --version  (not used here — this deploys via)
//   supabase functions deploy generate-program
// Secrets required:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically by the
// Edge Function runtime — no need to set them manually.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Keep the reference bundle well within Claude's context window, leaving
// room for the system prompt, athlete brief, and a generous completion.
const MAX_CONTEXT_CHARS = 350_000;

const SYSTEM_PROMPT = `You are FrateTrain's AI program builder, built by Hyathlon Performance. When creating training programs:

1. FIRST read and prioritise the provided reference files — these represent Hyathlon's coaching methodology and program structure. Use their patterns, exercise selection, block structure, set/rep schemes, and progressions as your primary guide.

2. THEN supplement with your own knowledge of exercise science, Hyrox-specific training, and current best practices — especially where the reference files may not cover a specific scenario or where your knowledge of recent research adds value.

3. The goal is programs that feel like they came from Hyathlon Performance, enhanced by the latest sports science.

4. Structure every program to develop all 8 Hyathlon Performance pillars: Aerobic Engine, Threshold, Durability, Economy, Balanced Athleticism, Fatigue Management, Training Principles, and Connection & Courage. Tag every session with its primary pillar. Ensure no pillar is neglected across a training block.

Always return a structured JSON program with: program_name, goal, level, frequency, blocks (each with name, focus, exercises (each with name, sets, reps, rest, notes)).`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Pack whole reference docs (smallest first) into a char budget; truncate only if nothing else fits. */
function buildReferenceBundle(docs: { filename: string; content: string }[]) {
  const sorted = [...docs].sort((a, b) => a.content.length - b.content.length);
  const parts: string[] = [];
  let used = 0;

  for (const doc of sorted) {
    const remaining = MAX_CONTEXT_CHARS - used;
    if (remaining <= 0) break;

    if (doc.content.length <= remaining) {
      parts.push(`--- ${doc.filename} ---\n${doc.content}`);
      used += doc.content.length;
    } else if (parts.length === 0) {
      // Nothing fit yet — include a truncated slice of this one rather than skip everything.
      parts.push(`--- ${doc.filename} (truncated) ---\n${doc.content.slice(0, remaining)}`);
      used = MAX_CONTEXT_CHARS;
    }
  }

  return parts.join('\n\n');
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  return JSON.parse(candidate.trim());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY secret is not configured for this function.' }, 500);
  }

  let athlete: {
    name?: string;
    goal?: string;
    level?: string;
    sessionsPerWeek?: number;
    equipment?: string;
    injuries?: string;
  };

  try {
    athlete = await req.json();
  } catch {
    return jsonResponse({ error: 'Request body must be JSON.' }, 400);
  }

  if (!athlete?.goal || !athlete?.level || !athlete?.sessionsPerWeek) {
    return jsonResponse({ error: 'goal, level, and sessionsPerWeek are required.' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: docs, error: docsError } = await supabase
    .from('reference_documents')
    .select('filename, content');

  if (docsError) {
    return jsonResponse({ error: `Failed to load reference documents: ${docsError.message}` }, 500);
  }

  const referenceBundle = docs?.length
    ? buildReferenceBundle(docs)
    : '(No reference documents synced yet — run scripts/sync-reference-docs.js.)';

  const userPrompt = `Reference materials from Hyathlon Performance:

${referenceBundle}

---

Build a training program for this athlete:
- Name: ${athlete.name || 'Athlete'}
- Goal: ${athlete.goal}
- Level: ${athlete.level}
- Sessions per week: ${athlete.sessionsPerWeek}
- Available equipment: ${athlete.equipment || 'Not specified'}
- Injuries / limitations: ${athlete.injuries || 'None reported'}

Return ONLY the JSON program described in the system prompt — no prose, no markdown fences.`;

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const detail = await anthropicRes.text();
    return jsonResponse({ error: `Claude API error (${anthropicRes.status}): ${detail}` }, 502);
  }

  const anthropicJson = await anthropicRes.json();
  const text = anthropicJson.content?.map((block: { text?: string }) => block.text ?? '').join('') ?? '';

  let program: unknown;
  try {
    program = extractJson(text);
  } catch {
    return jsonResponse({ error: 'Claude did not return valid JSON.', raw: text }, 502);
  }

  return jsonResponse({ program });
});
