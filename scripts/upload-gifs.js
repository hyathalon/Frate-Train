#!/usr/bin/env node
/**
 * FrateTrain — GIF Upload Script
 *
 * Uploads exercise GIFs from a local folder to Cloudflare R2,
 * then updates the gif_url column in Supabase using fuzzy name matching.
 *
 * Usage:
 *   node scripts/upload-gifs.js ./gifs/                  # upload all GIFs
 *   node scripts/upload-gifs.js ./gifs/ --dry-run        # preview matches only
 *   node scripts/upload-gifs.js ./gifs/ --skip-upload    # match only, no R2 upload
 *
 * Requirements (run once):
 *   npm install @aws-sdk/client-s3 @supabase/supabase-js dotenv
 *
 * .env keys needed:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET, R2_PUBLIC_URL,
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');

// ── Config ────────────────────────────────────────────────────────────────────
const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
} = process.env;

const DRY_RUN    = process.argv.includes('--dry-run');
const SKIP_UPLOAD = process.argv.includes('--skip-upload') || DRY_RUN;
const gifDir = process.argv.find(a => !a.startsWith('--') && !a.includes('node') && !a.includes('upload-gifs'));

if (!gifDir) {
  console.error('Usage: node scripts/upload-gifs.js <gif-folder> [--dry-run] [--skip-upload]');
  process.exit(1);
}

const r2 = SKIP_UPLOAD ? null : new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Fuzzy name matching ───────────────────────────────────────────────────────

/** Normalise a string for comparison: lowercase, strip punctuation/numbers in parens, collapse spaces */
function normalise(str) {
  return str
    .toLowerCase()
    .replace(/\s*\(\d+\)\s*$/, '')   // remove trailing "(1)", "(2)" etc
    .replace(/\.gif$/i, '')           // remove extension
    .replace(/[_\-]/g, ' ')          // underscores/hyphens → spaces
    .replace(/[^a-z0-9 ]/g, ' ')     // strip other punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/** Simple token overlap score: fraction of exercise name tokens found in gif name */
function matchScore(exerciseName, gifName) {
  const exTokens  = new Set(normalise(exerciseName).split(' ').filter(t => t.length > 2));
  const gifTokens = new Set(normalise(gifName).split(' ').filter(t => t.length > 2));
  if (exTokens.size === 0) return 0;
  let hits = 0;
  for (const t of exTokens) if (gifTokens.has(t)) hits++;
  return hits / exTokens.size;
}

/** Find the best matching GIF filename for a given exercise name */
function findBestGif(exerciseName, gifFiles) {
  let best = null, bestScore = 0;
  for (const gif of gifFiles) {
    const score = matchScore(exerciseName, gif);
    if (score > bestScore) { bestScore = score; best = gif; }
  }
  // Only accept if at least 50% of exercise name tokens matched
  return bestScore >= 0.5 ? { file: best, score: bestScore } : null;
}

// ── R2 upload ─────────────────────────────────────────────────────────────────

/** Upload a GIF to R2, skip if already exists */
async function uploadToR2(localPath, r2Key) {
  // Check if already uploaded
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: r2Key }));
    return 'exists';
  } catch (_) {}

  const body = fs.readFileSync(localPath);
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: r2Key,
    Body: body,
    ContentType: 'image/gif',
    CacheControl: 'public, max-age=31536000', // 1 year cache
  }));
  return 'uploaded';
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nFrateTrain GIF Uploader${DRY_RUN ? ' [DRY RUN]' : ''}`);

  // 1. Get all GIF files
  const absDir = path.resolve(gifDir);
  const gifFiles = fs.readdirSync(absDir)
    .filter(f => f.toLowerCase().endsWith('.gif'));
  console.log(`\nFound ${gifFiles.length} GIFs in ${absDir}`);

  // 2. Load all exercises from Supabase
  const { data: exercises, error } = await supabase
    .from('exercises')
    .select('id, name, gif_url');
  if (error) throw new Error(`Failed to load exercises: ${error.message}`);
  console.log(`Loaded ${exercises.length} exercises from Supabase\n`);

  // 3. Upload GIFs to R2 + build filename→URL map
  const gifUrlMap = {}; // gifFilename → public URL
  let uploaded = 0, skipped = 0;

  if (!SKIP_UPLOAD) {
    console.log('Uploading GIFs to Cloudflare R2...');
    for (const gif of gifFiles) {
      const localPath = path.join(absDir, gif);
      const r2Key = `exercises/${gif}`;
      const result = await uploadToR2(localPath, r2Key);
      gifUrlMap[gif] = `${R2_PUBLIC_URL}/${r2Key}`;
      if (result === 'uploaded') { uploaded++; process.stdout.write('↑'); }
      else { skipped++; process.stdout.write('.'); }
    }
    console.log(`\nUploaded: ${uploaded}  Already existed: ${skipped}\n`);
  } else {
    // In dry-run/skip-upload mode, just build the URL map without uploading
    for (const gif of gifFiles) {
      gifUrlMap[gif] = `${R2_PUBLIC_URL}/exercises/${gif}`;
    }
  }

  // 4. Fuzzy match exercises → GIFs and update Supabase
  console.log('Matching exercises to GIFs...\n');
  let matched = 0, unmatched = 0, updated = 0;
  const unmatchedList = [];

  for (const ex of exercises) {
    const match = findBestGif(ex.name, gifFiles);
    if (!match) {
      unmatched++;
      unmatchedList.push(ex.name);
      continue;
    }

    matched++;
    const url = gifUrlMap[match.file];
    const scoreStr = (match.score * 100).toFixed(0) + '%';
    console.log(`  ✓ [${scoreStr}] "${ex.name}" → ${match.file}`);

    if (!DRY_RUN && ex.gif_url !== url) {
      const { error: updateError } = await supabase
        .from('exercises')
        .update({ gif_url: url })
        .eq('id', ex.id);
      if (updateError) console.error(`    ❌ Update failed: ${updateError.message}`);
      else updated++;
    }
  }

  // 5. Summary
  console.log(`\n──────────────────────────────────`);
  console.log(`Exercises matched : ${matched}/${exercises.length}`);
  console.log(`Supabase updated  : ${DRY_RUN ? '(dry run)' : updated}`);
  if (unmatchedList.length > 0) {
    console.log(`\nNo GIF found for ${unmatchedList.length} exercises:`);
    unmatchedList.forEach(n => console.log(`  - ${n}`));
    console.log(`\nTip: check if a GIF exists with a similar name, or add it to your GIF folder.`);
  }
  console.log('');
}

main().catch(err => { console.error(err); process.exit(1); });
