#!/usr/bin/env node
/**
 * FrateTrain — Reference Doc Sync
 *
 * Parses every PDF/Word doc in assets/hyrox/ to plain text and upserts it
 * into the `reference_documents` Supabase table. The generate-program Edge
 * Function reads from that table (it cannot read this repo's filesystem
 * directly, since Edge Functions run on Supabase's servers).
 *
 * Re-run this whenever files are added/changed in assets/hyrox/.
 *
 * Usage:
 *   node scripts/sync-reference-docs.js
 *   node scripts/sync-reference-docs.js --dry-run
 *
 * Requirements:
 *   npm install pdf-parse mammoth @supabase/supabase-js
 *
 * Env vars (or .env):
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_KEY=...   ← service_role key, bypasses RLS
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const HYROX_DIR = path.resolve(__dirname, '../assets/hyrox');

if (!SUPABASE_URL || (!SUPABASE_KEY && !DRY_RUN)) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY env vars. Add them to .env or export them.');
  process.exit(1);
}

const supabase = !DRY_RUN ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

async function parsePdf(filePath) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const { text } = await parser.getText();
  await parser.destroy();
  return text;
}

async function parseDocx(filePath) {
  const buffer = fs.readFileSync(filePath);
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

async function upsertDocument(filename, sourceType, content) {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (DRY_RUN) {
    console.log(`   [dry-run] would upsert ${normalized.length} chars`);
    return;
  }

  const { error } = await supabase.from('reference_documents').upsert(
    {
      filename,
      source_type: sourceType,
      content: normalized,
      char_count: normalized.length,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'filename' }
  );

  if (error) throw new Error(`reference_documents upsert failed: ${error.message}`);
}

async function main() {
  const files = fs
    .readdirSync(HYROX_DIR)
    .filter((f) => /\.(pdf|docx)$/i.test(f))
    .sort();

  console.log(`\nFrateTrain Reference Doc Sync${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Found ${files.length} PDF/Word file(s) in assets/hyrox/\n`);

  let ok = 0;
  let fail = 0;

  for (const file of files) {
    const filePath = path.join(HYROX_DIR, file);
    const ext = path.extname(file).toLowerCase();
    process.stdout.write(`📄 ${file}`);

    try {
      const text = ext === '.pdf' ? await parsePdf(filePath) : await parseDocx(filePath);
      if (!text || !text.trim()) {
        console.log(' — skipped (no extractable text, likely scanned/image-only)');
        continue;
      }
      await upsertDocument(file, ext === '.pdf' ? 'pdf' : 'docx', text);
      console.log(` — ${text.length.toLocaleString()} chars`);
      ok++;
    } catch (err) {
      console.log(` — ❌ ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} synced, ${fail} failed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
