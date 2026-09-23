// FrateTrain — generate-program Edge Function
//
// Builds a week-by-week training program with Claude, grounded in The
// Hyathlon System reference library (assets/hyrox/).
//
// File access note: this function first tries to read assets/hyrox/ directly
// off disk, relative to its own location. That only resolves when the
// function actually has that path available — e.g. `supabase functions
// serve` run locally from the repo (the Supabase CLI mounts the project
// directory into the Edge Runtime container), or a self-hosted deployment
// that ships the repo alongside the function. A function pushed with
// `supabase functions deploy` to Supabase's hosted platform only uploads
// this function's own folder, so assets/hyrox/ will NOT be present there.
// To cover that case without silently dropping the reference material, this
// function falls back to the `reference_documents` table (populated by
// `node scripts/sync-reference-docs.js`, which parses the same files
// locally and syncs their text to Supabase) before finally falling back to
// no reference content at all, logging a warning at each downgrade.
//
// Deploy:
//   supabase functions deploy generate-program
// Secrets required:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically by the
// Edge Function runtime — no need to set them manually.

import Anthropic from 'npm:@anthropic-ai/sdk';
import mammoth from 'npm:mammoth';
// @ts-ignore -- no bundled type declarations for this npm import in Deno.
import { PDFParse } from 'npm:pdf-parse';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BOOKLET_FILENAME = 'The_Hyathlon_System_Booklet_v2.docx';
const HYROX_ASSETS_URL = new URL('../../../assets/hyrox/', import.meta.url);

// Keep the reference bundle well within Claude's context window, leaving
// room for the system prompt, athlete brief, and a generous completion.
const MAX_CONTEXT_CHARS = 350_000;

const PILLARS_PROMPT_BLOCK = `The 8 pillars are:
1. Aerobic Engine — Build the engine that never quits
2. Threshold — Find the edge. Hold it.
3. Durability — Still strong when it gets hard
4. Economy — Move better. Use less.
5. Balanced Athleticism — No weak links. No race day surprises.
6. Fatigue Management — Train hard. Recover harder.
7. Training Principles — The method behind the madness
8. Connection & Courage — Show up. Back yourself. Celebrate together.

For every session you prescribe, tag it with its primary pillar using its exact snake_case id in the "pillar" field: aerobic_engine, threshold, durability, economy, balanced_athleticism, fatigue_management, training_principles, connection_courage.`;

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

type ReferenceDoc = { filename: string; content: string };

async function parseDocx(bytes: Uint8Array): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: bytes });
  return value;
}

async function parsePdf(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  const { text } = await parser.getText();
  await parser.destroy();
  return text;
}

/** Try reading assets/hyrox/ straight off disk. Returns [] (never throws) if the dir isn't there. */
async function readLocalReferenceDocs(): Promise<ReferenceDoc[]> {
  const docs: ReferenceDoc[] = [];

  let entries: Deno.DirEntry[];
  try {
    entries = [];
    for await (const entry of Deno.readDir(HYROX_ASSETS_URL)) entries.push(entry);
  } catch (err) {
    console.warn(`[generate-program] Could not read local assets/hyrox/ (${err}). Falling back to reference_documents table.`);
    return [];
  }

  // The Hyathlon System booklet is the primary reference — read it first.
  const sorted = [...entries].sort((a, b) => (a.name === BOOKLET_FILENAME ? -1 : b.name === BOOKLET_FILENAME ? 1 : 0));

  for (const entry of sorted) {
    if (!entry.isFile) continue;
    const ext = entry.name.toLowerCase().split('.').pop();
    if (ext !== 'pdf' && ext !== 'docx') continue;

    try {
      const bytes = await Deno.readFile(new URL(entry.name, HYROX_ASSETS_URL));
      const text = ext === 'docx' ? await parseDocx(bytes) : await parsePdf(bytes);
      if (text?.trim()) docs.push({ filename: entry.name, content: text.trim() });
    } catch (err) {
      console.warn(`[generate-program] Failed to read/parse ${entry.name}: ${err}`);
    }
  }

  return docs;
}

/** Fallback for hosted deployments: read pre-parsed text synced by scripts/sync-reference-docs.js. */
async function readSyncedReferenceDocs(): Promise<ReferenceDoc[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from('reference_documents').select('filename, content');
    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.warn(`[generate-program] Could not read reference_documents table: ${err}`);
    return [];
  }
}

/** Pack docs into a char budget. The booklet (if present, always sorted first) gets priority; the rest pack smallest-first. */
function buildReferenceBundle(docs: ReferenceDoc[]) {
  if (docs.length === 0) return '';

  const booklet = docs.find((d) => d.filename === BOOKLET_FILENAME);
  const rest = docs.filter((d) => d.filename !== BOOKLET_FILENAME).sort((a, b) => a.content.length - b.content.length);
  const ordered = booklet ? [booklet, ...rest] : rest;

  const parts: string[] = [];
  let used = 0;

  for (const doc of ordered) {
    const remaining = MAX_CONTEXT_CHARS - used;
    if (remaining <= 0) break;

    if (doc.content.length <= remaining) {
      parts.push(`--- ${doc.filename} ---\n${doc.content}`);
      used += doc.content.length;
    } else if (parts.length === 0 || doc.filename === BOOKLET_FILENAME) {
      parts.push(`--- ${doc.filename} (truncated) ---\n${doc.content.slice(0, remaining)}`);
      used = MAX_CONTEXT_CHARS;
    }
  }

  return parts.join('\n\n');
}

function buildSystemPrompt(referenceBundle: string) {
  const referenceSection = referenceBundle
    ? `--- HYATHLON REFERENCE MATERIAL ---\n${referenceBundle}\n--- END REFERENCE MATERIAL ---`
    : '(No reference material could be read for this request — proceeding on coaching knowledge alone. This should be investigated: see the Edge Function logs for why assets/hyrox/ and the reference_documents table were both unavailable.)';

  return `You are an expert Hyrox and running coach using The Hyathlon System — an 8-pillar methodology.

PRIORITY INSTRUCTION: The following reference material defines your coaching methodology. Read it carefully and use it as the PRIMARY basis for all program design decisions. Only supplement with your own knowledge where the reference material does not cover a specific detail.

${referenceSection}

${PILLARS_PROMPT_BLOCK}

When designing programs:
- Apply Frequency, Volume, Intensity, Specificity principles from Pillar 7
- Progress from general → specific as race approaches (Pillar 7)
- Include fatigue management and deload weeks (Pillar 6)
- Balance all 8 pillars across the training week
- Account for the athlete's strengths, weaknesses, and available days

Always return ONLY structured JSON in this exact shape, no prose, no markdown fences:
{
  "weeks": [
    {
      "week": 1,
      "focus": "Aerobic Base",
      "sessions": [
        { "day": "Monday", "title": "Easy Run", "pillar": "aerobic_engine", "duration": 45, "notes": "..." }
      ]
    }
  ]
}`;
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  return JSON.parse(candidate.trim());
}

interface AthleteBrief {
  name?: string;
  weeklyHours?: number;
  weeksUntilRace?: number;
  strengths?: string[];
  weaknesses?: string[];
  availability?: string[];
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

  // Tier 1: read assets/hyrox/ directly. Tier 2: fall back to the synced
  // DB copy. Tier 3 (handled in buildSystemPrompt): proceed with no
  // reference material, clearly flagged in the prompt and logged here.
  let docs = await readLocalReferenceDocs();
  if (docs.length === 0) {
    docs = await readSyncedReferenceDocs();
  }
  if (docs.length === 0) {
    console.warn('[generate-program] No reference material available from either source — generating without it.');
  }

  const referenceBundle = buildReferenceBundle(docs);
  const systemPrompt = buildSystemPrompt(referenceBundle);

  const userPrompt = `Build a training program for this athlete:
- Name: ${athlete.name || 'Athlete'}
- Goal: ${athlete.goal}
- Weeks until race: ${athlete.weeksUntilRace}
- Current weekly training hours: ${athlete.weeklyHours ?? 'Not specified'}
- Strengths: ${athlete.strengths?.length ? athlete.strengths.join(', ') : 'Not specified'}
- Weaknesses: ${athlete.weaknesses?.length ? athlete.weaknesses.join(', ') : 'Not specified'}
- Available training days: ${athlete.availability?.length ? athlete.availability.join(', ') : 'Not specified'}

Return ONLY the JSON program described in the system prompt.`;

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let message;
  try {
    message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
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
