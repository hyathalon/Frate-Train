#!/usr/bin/env node
/**
 * FrateTrain — Workout PDF Import Script
 *
 * Reads workout PDFs, extracts program metadata + blocks + exercises,
 * and inserts into Supabase (programs → blocks → exercises).
 *
 * Usage:
 *   node scripts/import-workouts.js ./pdfs/CA-01.pdf          # single file
 *   node scripts/import-workouts.js ./pdfs/                   # whole folder
 *   node scripts/import-workouts.js --dry-run ./pdfs/CA-01.pdf  # preview only
 *
 * Requirements:
 *   npm install pdf-parse @supabase/supabase-js
 *
 * Set env vars (or create .env):
 *   SUPABASE_URL=https://cmjszdfu0endqaevxrvb.supabase.co
 *   SUPABASE_SECRET_KEY=<sb_secret_… key>   ← use a secret key, NOT the publishable key
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const { createClient } = require('@supabase/supabase-js');

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cmjszdfu0endqaevxrvb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY; // secret key bypasses RLS

const DRY_RUN = process.argv.includes('--dry-run');
const args = process.argv.filter(a => !a.startsWith('--') && !a.includes('node') && !a.includes('import-workouts'));
const target = args[0];

if (!target) {
  console.error('Usage: node scripts/import-workouts.js [--dry-run] <pdf-file-or-folder>');
  process.exit(1);
}

if (!SUPABASE_KEY && !DRY_RUN) {
  console.error('Missing SUPABASE_SECRET_KEY env var. Add it to .env or export it.');
  process.exit(1);
}

const supabase = !DRY_RUN ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Pull all PDF file paths from a file or directory argument. */
function getPdfPaths(target) {
  const abs = path.resolve(target);
  if (fs.statSync(abs).isDirectory()) {
    return fs.readdirSync(abs)
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .map(f => path.join(abs, f));
  }
  return [abs];
}

/** Extract program code from filename: "Copy_of_CA-01_Home_Full_Body.pdf" → "CA-01" */
function codeFromFilename(filename) {
  const base = path.basename(filename, '.pdf');
  // Match patterns like CA-01, PG-04, HI-25, FE-12
  const m = base.match(/([A-Z]{2}-\d{2,3})/);
  return m ? m[1] : base.replace(/Copy_of_/i, '').split('_')[0];
}

/**
 * Parse the text content of a workout PDF.
 * Returns { meta, blocks } where:
 *   meta  = { code, name, goal, audience, level, frequency, avg_time, setting, equipment, method }
 *   blocks = [{ name, focus, exercises: [{ name, sets, reps, rest, notes }] }]
 */
function parsePdfText(text, filename) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ── Program name (first non-empty line, e.g. "CA-01 — Home Full Body Without Machines")
  const titleLine = lines[0] || '';
  const code = codeFromFilename(filename);
  const name = titleLine.replace(/^[A-Z]{2}-\d{2,3}\s*[—–-]\s*/, '').trim() || code;

  // ── Metadata table: scan for key-value pairs
  const META_KEYS = {
    'goal': 'goal',
    'audience': 'audience',
    'level': 'level',
    'weekly frequency': 'frequency',
    'average time': 'avg_time',
    'setting': 'setting',
    'equipment': 'equipment',
    'method used': 'method',
    'weekly structure': 'weekly_structure',
  };

  const meta = { code, name };
  let i = 0;
  while (i < lines.length) {
    const lower = lines[i].toLowerCase();
    const key = Object.keys(META_KEYS).find(k => lower === k || lower.startsWith(k));
    if (key) {
      // Value is on the next line
      const val = lines[i + 1] || '';
      // Skip if value looks like a table column header
      if (!Object.keys(META_KEYS).some(k => val.toLowerCase() === k)) {
        meta[META_KEYS[key]] = val.trim();
        i += 2;
        continue;
      }
    }
    // Stop scanning metadata once we hit "Day A" or "Block A"
    if (/^day [a-c]\b|^block [a-c]\b/i.test(lines[i])) break;
    i++;
  }

  // ── Exercise blocks: "Day A · Knee-Dominant Full Body" or "Block A · ..."
  const blocks = [];
  const BLOCK_RE = /^(day|block)\s+([a-c])\s*[·•\-–—]\s*(.+)/i;
  const EXERCISE_TABLE_HEADER = /^exercise\s+sets\s+reps\s+rest/i;
  // Columns in the exercise table
  const COL_RE = /^(.+?)\s{2,}(\S+)\s{2,}(\S+)\s{2,}(\S+)\s{2,}(.+)$/;
  // Simpler split: look for lines with exactly 4+ whitespace-separated tokens after the name
  // We'll collect exercise rows by matching lines that start with an exercise name (non-numeric)
  // followed by sets/reps/rest/notes

  for (let j = 0; j < lines.length; j++) {
    const blockMatch = lines[j].match(BLOCK_RE);
    if (!blockMatch) continue;

    const blockLetter = blockMatch[2].toUpperCase(); // A, B, C
    const blockFocus = blockMatch[3].trim();
    const exercises = [];

    // Advance past the table header
    j++;
    while (j < lines.length && !EXERCISE_TABLE_HEADER.test(lines[j])) {
      if (BLOCK_RE.test(lines[j])) { j--; break; } // next block starts
      j++;
    }
    if (EXERCISE_TABLE_HEADER.test(lines[j])) j++; // skip header row

    // Collect exercise rows until next block header or end
    while (j < lines.length) {
      const line = lines[j];
      if (BLOCK_RE.test(line) || /^program summary/i.test(line)) { j--; break; }

      // Skip lines that are clearly not exercises (single token, headings, etc.)
      if (!line || /^(exercise|sets|reps|rest|notes|day|block|item|variable|information)/i.test(line)) {
        j++;
        continue;
      }

      // Try to parse exercise row. PDF text extraction can split rows across lines.
      // Strategy: a valid exercise line starts with a name (letters/spaces/hyphens),
      // followed by sets like "2–3" or "3", reps like "8–12" or "30 s", rest like "60–90 s".
      const exMatch = line.match(
        /^(.+?)\s+([\d–\-]+)\s+([\d–\-]+(?:\s*s)?)\s+([\d–\-]+\s*s)\s+(.*)$/
      );
      if (exMatch) {
        exercises.push({
          name: exMatch[1].trim(),
          sets: exMatch[2].trim(),
          reps: exMatch[3].trim(),
          rest: exMatch[4].trim(),
          notes: exMatch[5].trim(),
        });
      } else {
        // Notes continuation line for previous exercise?
        // Or exercise name spans two lines — peek at next line.
        const nextLine = lines[j + 1] || '';
        const combinedMatch = `${line} ${nextLine}`.match(
          /^(.+?)\s+([\d–\-]+)\s+([\d–\-]+(?:\s*s)?)\s+([\d–\-]+\s*s)\s+(.*)$/
        );
        if (combinedMatch && j + 1 < lines.length) {
          exercises.push({
            name: combinedMatch[1].trim(),
            sets: combinedMatch[2].trim(),
            reps: combinedMatch[3].trim(),
            rest: combinedMatch[4].trim(),
            notes: combinedMatch[5].trim(),
          });
          j++; // skip the next line we consumed
        } else if (exercises.length > 0 && line.length > 10) {
          // Append as notes to the last exercise
          exercises[exercises.length - 1].notes += ' ' + line;
        }
      }
      j++;
    }

    if (exercises.length > 0) {
      blocks.push({ name: `Block ${blockLetter}`, focus: blockFocus, exercises });
    }
  }

  return { meta, blocks };
}

// ── Supabase upsert ────────────────────────────────────────────────────────────

async function upsertProgram(meta) {
  const { data, error } = await supabase
    .from('programs')
    .upsert({
      code: meta.code,
      name: meta.name,
      goal: meta.goal || null,
      level: meta.level || null,
      frequency: meta.frequency || null,
      avg_time: meta.avg_time || null,
      setting: meta.setting || null,
      equipment: meta.equipment || null,
      method: meta.method || null,
      category: meta.code ? meta.code.split('-')[0] : null, // CA, PG, HI, FE
    }, { onConflict: 'code' })
    .select()
    .single();

  if (error) throw new Error(`programs upsert failed: ${error.message}`);
  return data;
}

async function upsertBlock(programId, block, order) {
  const { data, error } = await supabase
    .from('blocks')
    .upsert({
      program_id: programId,
      name: block.name,
      focus: block.focus || null,
      block_order: order,
    }, { onConflict: 'program_id,name' })
    .select()
    .single();

  if (error) throw new Error(`blocks upsert failed: ${error.message}`);
  return data;
}

async function insertExercises(blockId, exercises) {
  // Delete existing exercises for this block (clean re-import)
  await supabase.from('program_exercises').delete().eq('block_id', blockId);

  const rows = exercises.map((ex, idx) => ({
    block_id: blockId,
    name: ex.name,
    sets: ex.sets || null,
    reps: ex.reps || null,
    rest: ex.rest || null,
    notes: ex.notes || null,
    exercise_order: idx + 1,
    gif_url: null, // filled later by gif-matcher script
  }));

  const { error } = await supabase.from('program_exercises').insert(rows);
  if (error) throw new Error(`exercises insert failed: ${error.message}`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function importPdf(filePath) {
  console.log(`\n📄 ${path.basename(filePath)}`);

  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const { text } = await parser.getText();
  await parser.destroy();
  const { meta, blocks } = parsePdfText(text, filePath);

  console.log(`   Program : ${meta.code} — ${meta.name}`);
  console.log(`   Level   : ${meta.level || '?'}  |  Freq: ${meta.frequency || '?'}  |  Setting: ${meta.setting || '?'}`);
  console.log(`   Blocks  : ${blocks.length}`);
  blocks.forEach(b => console.log(`     ${b.name} (${b.focus}) — ${b.exercises.length} exercises`));

  if (DRY_RUN) {
    blocks.forEach(b => {
      console.log(`\n   ── ${b.name}: ${b.focus}`);
      b.exercises.forEach(ex =>
        console.log(`      ${ex.name}  |  ${ex.sets} × ${ex.reps}  |  rest ${ex.rest}  |  ${ex.notes}`)
      );
    });
    return;
  }

  // Write to Supabase
  const program = await upsertProgram(meta);
  for (let i = 0; i < blocks.length; i++) {
    const block = await upsertBlock(program.id, blocks[i], i + 1);
    await insertExercises(block.id, blocks[i].exercises);
  }

  console.log(`   ✅ Inserted: program ${program.id}`);
}

async function main() {
  const paths = getPdfPaths(target);
  console.log(`\nFrateTrain PDF Importer${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Processing ${paths.length} PDF(s)...\n`);

  let ok = 0, fail = 0;
  for (const p of paths) {
    try {
      await importPdf(p);
      ok++;
    } catch (err) {
      console.error(`   ❌ ${path.basename(p)}: ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} imported, ${fail} failed.\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
