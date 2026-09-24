#!/usr/bin/env node
/**
 * FrateTrain — Hyathlon Reference Seed
 *
 * Fixes generate-program's production problem: Edge Functions deployed to
 * Supabase's hosted platform can't read assets/hyrox/ (only this repo
 * checkout can). This script extracts text from every .docx (mammoth) and
 * .pdf (pdf-parse) file in assets/hyrox/ and upserts it into the
 * `hyathlon_reference` table, which the generate-program Edge Function
 * queries instead of touching the filesystem.
 *
 * Re-run whenever files in assets/hyrox/ are added or changed.
 *
 * Usage:
 *   node scripts/seed-hyathlon-reference.js
 *   node scripts/seed-hyathlon-reference.js --dry-run
 *
 * Requirements:
 *   npm install mammoth pdf-parse @supabase/supabase-js
 *
 * Env vars (or .env):
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_KEY=...   ← service_role key, bypasses RLS
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
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

function normalizeText(raw) {
  return raw?.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

async function extractDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return normalizeText(value);
}

async function extractPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  const { text } = await parser.getText();
  await parser.destroy();
  return normalizeText(text);
}

async function upsertReference(filename, content) {
  if (DRY_RUN) {
    console.log(`   [dry-run] would upsert ${content.length} chars`);
    return;
  }

  const { error } = await supabase
    .from('hyathlon_reference')
    .upsert({ filename, content }, { onConflict: 'filename' });

  if (error) throw new Error(`hyathlon_reference upsert failed: ${error.message}`);
}

async function main() {
  const files = fs.readdirSync(HYROX_DIR).sort();

  console.log(`\nFrateTrain Hyathlon Reference Seed${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Found ${files.length} file(s) in assets/hyrox/`);
  console.log(
    'Note: reference_documents table is no longer used. Drop it manually in Supabase dashboard if you want it gone.\n'
  );

  let ok = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(HYROX_DIR, file);
    if (!fs.statSync(filePath).isFile()) continue;

    const ext = path.extname(file).toLowerCase();
    if (ext !== '.docx' && ext !== '.pdf') {
      console.log(`📄 ${file} — skipped (not .docx or .pdf)`);
      skipped++;
      continue;
    }

    console.log(`📄 ${file} — reading (${ext.slice(1)})...`);
    try {
      const buffer = fs.readFileSync(filePath);
      const text = ext === '.docx' ? await extractDocx(buffer) : await extractPdf(buffer);

      if (!text) {
        console.log(`   ${file} — skipped (no extractable text)`);
        skipped++;
        continue;
      }

      await upsertReference(file, text);
      console.log(`   ${file} — seeded (${text.length.toLocaleString()} chars)`);
      ok++;
    } catch (err) {
      console.log(`   ${file} — skipped (${err.message})`);
      skipped++;
    }
  }

  console.log(`\nDone: ${ok} seeded, ${skipped} skipped.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
