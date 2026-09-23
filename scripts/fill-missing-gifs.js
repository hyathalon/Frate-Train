#!/usr/bin/env node
/**
 * FrateTrain — Fill Missing GIFs + Exercise Metadata
 *
 * For each exercise in Supabase:
 *   1. Searches WorkoutX for a GIF (if gif_url is null)
 *   2. Searches API Ninjas for muscle group, equipment, difficulty, instructions
 *   3. Updates Supabase with whatever was found
 *
 * Your own uploaded GIFs always take priority — this only fills gaps.
 *
 * Usage:
 *   node scripts/fill-missing-gifs.js              # fill all missing
 *   node scripts/fill-missing-gifs.js --dry-run    # preview only, no DB writes
 *   node scripts/fill-missing-gifs.js --gifs-only  # skip metadata enrichment
 *   node scripts/fill-missing-gifs.js --meta-only  # skip GIF search
 *
 * .env keys needed:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   WORKOUTX_API_KEY   (for GIF fallback)
 *   API_NINJAS_KEY     (for metadata enrichment)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const DRY_RUN   = process.argv.includes('--dry-run');
const GIFS_ONLY = process.argv.includes('--gifs-only');
const META_ONLY = process.argv.includes('--meta-only');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const WORKOUTX_KEY  = process.env.WORKOUTX_API_KEY;
const NINJAS_KEY    = process.env.API_NINJAS_KEY;

// ── Fuzzy matching ────────────────────────────────────────────────────────────

function normalise(str) {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenScore(exerciseName, resultName) {
  const exTokens  = new Set(normalise(exerciseName).split(' ').filter(t => t.length > 2));
  const resTokens = new Set(normalise(resultName).split(' ').filter(t => t.length > 2));
  if (exTokens.size === 0) return 0;
  let hits = 0;
  for (const t of exTokens) if (resTokens.has(t)) hits++;
  return hits / exTokens.size;
}

function bestMatch(exerciseName, results, nameKey = 'name') {
  let best = null, bestScore = 0;
  for (const r of results) {
    const score = tokenScore(exerciseName, r[nameKey] || '');
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return bestScore >= 0.5 ? { result: best, score: bestScore } : null;
}

// ── WorkoutX GIF search ───────────────────────────────────────────────────────

async function searchWorkoutXGif(exerciseName) {
  if (!WORKOUTX_KEY) return null;
  try {
    const url = `https://api.workoutxapp.com/v1/exercises?search=${encodeURIComponent(exerciseName)}&limit=5`;
    const res = await fetch(url, { headers: { 'X-WorkoutX-Key': WORKOUTX_KEY } });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.data || data.exercises || data.results || [];
    const match = bestMatch(exerciseName, results);
    if (!match) return null;
    const r = match.result;
    const gifUrl = r.gif_url || r.gifUrl || r.animation_url || r.image_url || r.imageUrl || null;
    return gifUrl ? { gifUrl, matchName: r.name || r.title, score: match.score } : null;
  } catch { return null; }
}

// ── API Ninjas metadata search ────────────────────────────────────────────────

async function searchNinjasMetadata(exerciseName) {
  if (!NINJAS_KEY) return null;
  try {
    const url = `https://api.api-ninjas.com/v1/exercises?name=${encodeURIComponent(exerciseName)}`;
    const res = await fetch(url, { headers: { 'X-Api-Key': NINJAS_KEY } });
    if (!res.ok) return null;
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;
    const match = bestMatch(exerciseName, results);
    if (!match) return null;
    const r = match.result;
    return {
      muscle_group:   r.muscle || r.primary_muscle || null,
      equipment_type: r.equipment || null,
      difficulty:     r.difficulty || null,
      instructions:   r.instructions || null,
      matchName:      r.name,
      score:          match.score,
    };
  } catch { return null; }
}

// ── Delay helper ──────────────────────────────────────────────────────────────

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nFrateTrain — Fill Missing GIFs + Metadata${DRY_RUN ? ' [DRY RUN]' : ''}`);
  if (GIFS_ONLY) console.log('Mode: GIFs only');
  if (META_ONLY) console.log('Mode: Metadata only');

  // Load all exercises (or just those missing GIFs)
  let query = supabase.from('exercises').select('id, name, gif_url, muscle_group').order('name');
  if (META_ONLY) {
    // enriched metadata for all, regardless of gif
  } else {
    // For GIF search: only exercises without a gif
  }
  const { data: exercises, error } = await query;
  if (error) throw new Error(`Supabase error: ${error.message}`);

  const needsGif  = exercises.filter(e => !e.gif_url);
  const needsMeta = exercises.filter(e => !e.muscle_group);

  console.log(`\nTotal exercises  : ${exercises.length}`);
  if (!META_ONLY) console.log(`Missing GIF      : ${needsGif.length}`);
  if (!GIFS_ONLY) console.log(`Missing metadata : ${needsMeta.length}`);
  console.log('');

  // Process exercises needing GIFs
  let gifsFound = 0, gifsNotFound = 0;
  if (!META_ONLY && needsGif.length > 0) {
    console.log('── Searching for GIFs (WorkoutX) ──');
    for (const ex of needsGif) {
      await delay(350);
      const match = await searchWorkoutXGif(ex.name);
      if (!match) {
        gifsNotFound++;
        console.log(`  ✗ No GIF: "${ex.name}"`);
        continue;
      }
      const scoreStr = (match.score * 100).toFixed(0) + '%';
      console.log(`  ✓ [${scoreStr}] "${ex.name}" → ${match.gifUrl}`);
      gifsFound++;
      if (!DRY_RUN) {
        await supabase.from('exercises').update({ gif_url: match.gifUrl }).eq('id', ex.id);
      }
    }
  }

  // Process exercises needing metadata
  let metaFound = 0, metaNotFound = 0;
  if (!GIFS_ONLY && needsMeta.length > 0) {
    console.log('\n── Enriching metadata (API Ninjas) ──');
    for (const ex of needsMeta) {
      await delay(250);
      const meta = await searchNinjasMetadata(ex.name);
      if (!meta) {
        metaNotFound++;
        console.log(`  ✗ No metadata: "${ex.name}"`);
        continue;
      }
      const scoreStr = (meta.score * 100).toFixed(0) + '%';
      console.log(`  ✓ [${scoreStr}] "${ex.name}" → ${meta.muscle_group || '?'} / ${meta.equipment_type || '?'} / ${meta.difficulty || '?'}`);
      metaFound++;
      if (!DRY_RUN) {
        await supabase.from('exercises').update({
          muscle_group:   meta.muscle_group,
          equipment_type: meta.equipment_type,
          difficulty:     meta.difficulty,
          instructions:   meta.instructions,
        }).eq('id', ex.id);
      }
    }
  }

  // Summary
  console.log('\n──────────────────────────────────');
  if (!META_ONLY) console.log(`GIFs found       : ${gifsFound} / ${needsGif.length}`);
  if (!GIFS_ONLY) console.log(`Metadata enriched: ${metaFound} / ${needsMeta.length}`);
  if (DRY_RUN) console.log('(Dry run — no changes written)');
  console.log('');
}

main().catch(err => { console.error(err); process.exit(1); });
