// FrateTrain — generate-program Edge Function
//
// Reference material is loaded from the hyathlon_reference table.
// To update: add/replace files in assets/hyrox/ then run: node scripts/seed-hyathlon-reference.js
//
// Builds a week-by-week Hyrox training program with Claude, grounded in The
// Hyathlon System reference library. Edge Functions deployed to Supabase's
// hosted platform can't read this repo's assets/hyrox/ folder (only this
// function's own folder is uploaded), so instead of touching the filesystem
// this queries the hyathlon_reference table, seeded ahead of time by
// scripts/seed-hyathlon-reference.js from the files in assets/hyrox/.
//
// Deploy:
//   supabase functions deploy generate-program
// Secrets required:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// SUPABASE_URL / SUPABASE_SECRET_KEYS are provided automatically by the
// Edge Function runtime — no need to set them manually.

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// JSON object of the project's secret keys, keyed by name.
const SUPABASE_SECRET_KEY = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default'];

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

/** Reads and concatenates every row in hyathlon_reference. Never throws — logs a warning and returns '' if the table is empty or unreachable. */
async function readReferenceText(): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
  const { data, error } = await supabase
    .from('hyathlon_reference')
    .select('filename, content')
    .or('filename.ilike.%Hyathlon_System_Booklet%,filename.ilike.%Coaching_Handbook%')
    .order('filename');

  if (error) {
    console.warn(`[generate-program] Could not query hyathlon_reference (${error.message}). Continuing without reference material.`);
    return '';
  }

  if (!data || data.length === 0) {
    console.warn('[generate-program] hyathlon_reference is empty — run scripts/seed-hyathlon-reference.js. Continuing without reference material.');
    return '';
  }

  return data.map((row) => `--- ${row.filename} ---\n${row.content}`).join('\n\n');
}

function buildSystemPrompt(referenceText: string, athlete: AthleteBrief) {
  return `You are an expert Hyrox and running coach following The Hyathlon System — an 8-pillar methodology developed by Hyathlon Performance.

PRIORITY: The following is your coaching methodology reference. Use it as the PRIMARY basis for all program decisions. Supplement with general coaching knowledge only where the reference does not cover the specific detail.

=== HYATHLON REFERENCE ===
${referenceText || '(No reference material could be read for this request — proceed on general coaching knowledge.)'}
=== END REFERENCE ===

Design a ${athlete.weeksUntilRace}-week Hyrox training program for the athlete below.

Athlete: ${athlete.name || 'Athlete'}
Weekly hours available: ${athlete.weeklyHours ?? 'Not specified'}
Training days: ${athlete.trainingDays?.length ? athlete.trainingDays.join(', ') : 'Not specified'}
Strengths: ${athlete.strengths?.length ? athlete.strengths.join(', ') : 'Not specified'}
Weaknesses: ${athlete.weaknesses?.length ? athlete.weaknesses.join(', ') : 'Not specified'}
Race goal: ${athlete.goal}

RULES:
- Apply Pillar 7 (Training Principles): structure weeks using Frequency, Volume, Intensity, Specificity
- Progress from general → specific as race approaches
- Include a deload every 3–4 weeks (Pillar 6)
- Address weaknesses early, sharpen strengths closer to race
- Tag every session with its primary pillar using one of: aerobic_engine, threshold, durability, economy, balanced_athleticism, fatigue_management, training_principles, connection_courage
- Never schedule more sessions than available training days per week
- Return ONLY valid JSON, no markdown, no explanation

Return this exact JSON structure:
{
  "weeks": [
    {
      "week": 1,
      "focus": "Aerobic Base",
      "sessions": [
        {
          "day": "Monday",
          "title": "Easy Run",
          "pillar": "aerobic_engine",
          "duration": 45,
          "notes": "Zone 2, conversational pace. Focus on time on feet."
        }
      ]
    }
  ]
}

IMPORTANT: Return ONLY raw JSON with no markdown code fences, no \`\`\`json, no \`\`\` - just the pure JSON object starting with {"weeks":[`;
}

function extractJson(text: string) {
  let candidate = text.trim();
  candidate = candidate.replace(/^```json\s*/i, '').replace(/^```\s*/, '');
  candidate = candidate.replace(/```\s*$/, '');
  return JSON.parse(candidate.trim());
}

interface AthleteBrief {
  name?: string;
  weeksUntilRace?: number;
  weeklyHours?: number;
  trainingDays?: string[];
  strengths?: string[];
  weaknesses?: string[];
  goal?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY secret is not configured for this function.' }, 500);
  }

  let athlete: AthleteBrief;
  try {
    athlete = await req.json();
  } catch {
    return jsonResponse({ error: 'Request body must be JSON.' }, 400);
  }

  if (!athlete?.goal || !athlete?.weeksUntilRace) {
    return jsonResponse({ error: 'goal and weeksUntilRace are required.' }, 400);
  }

  const referenceText = await readReferenceText();
  const systemPrompt = buildSystemPrompt(referenceText, athlete);

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let message;
  try {
    message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Generate the program now, following the system prompt exactly.' }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return jsonResponse({ error: 'Claude API rate limited — try again shortly.' }, 429);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return jsonResponse({ error: 'Invalid ANTHROPIC_API_KEY.' }, 500);
    }
    if (err instanceof Anthropic.APIError) {
      return jsonResponse({ error: `Claude API error (${err.status}): ${err.message}` }, 502);
    }
    return jsonResponse({ error: `Unexpected error calling Claude: ${err}` }, 502);
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  let program: unknown;
  try {
    program = extractJson(text);
  } catch {
    return jsonResponse({ error: 'Claude did not return valid JSON.', raw: text }, 502);
  }

  return jsonResponse({ program });
});
