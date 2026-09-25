#!/usr/bin/env node
/**
 * FrateTrain — Create Athlete
 *
 * Creates an athlete login (already confirmed, no email sent) and the linked
 * `athletes` row. Public sign-up is off, so this is how athletes get accounts.
 * A temporary password is printed ONCE to the terminal: pass it on to the
 * athlete, who changes it in Profile. It is never logged or written to a file.
 *
 * Usage:
 *   node scripts/create-athlete.js --email sam@example.com --name "Sam Taylor" \
 *     --tier app|member [--level beginner|intermediate|advanced] \
 *     [--equipment "Dumbbell,Kettlebell,Rower"] [--locations "Home,Gym,Outdoor"] \
 *     [--timezone Australia/Sydney] [--coach-email coach@example.com] [--dry-run]
 *
 * Members are assigned to a coach: --coach-email, or the only coach if there is one.
 *
 * Env vars (or .env):
 *   SUPABASE_URL=...
 *   SUPABASE_SECRET_KEY=...   ← secret key (sb_secret_…), bypasses RLS
 */

require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const TIERS = ['app', 'member'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const LOCATIONS = ['Home', 'Gym', 'Outdoor'];

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--dry-run') { args.dryRun = true; continue; }
    if (!flag.startsWith('--')) fail(`Unexpected argument: ${flag}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for ${flag}`);
    args[flag.slice(2)] = value;
    i++;
  }
  return args;
}

function list(value) {
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function tempPassword() {
  // 16 characters from an unambiguous alphabet (no 0/O, 1/l/I).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function libraryEquipment(supabase) {
  const { data, error } = await supabase.from('exercises').select('equipment_options');
  if (error) fail(`Could not read the exercise library: ${error.message}`);
  const items = new Set();
  for (const row of data) for (const option of row.equipment_options || []) for (const item of option) items.add(item);
  return items;
}

async function findCoach(supabase, coachEmail) {
  const { data: coaches, error } = await supabase.from('coaches').select('user_id, display_name');
  if (error) fail(`Could not read coaches: ${error.message}`);
  if (!coachEmail) {
    if (coaches.length === 1) return coaches[0];
    fail(`Members need a coach: pass --coach-email (${coaches.length} coaches found).`);
  }
  for (const coach of coaches) {
    const { data, error: userError } = await supabase.auth.admin.getUserById(coach.user_id);
    if (!userError && data.user?.email?.toLowerCase() === coachEmail.toLowerCase()) return coach;
  }
  fail(`No coach with email ${coachEmail}.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!SUPABASE_URL || !SUPABASE_KEY) fail('Missing SUPABASE_URL / SUPABASE_SECRET_KEY env vars. Add them to .env or export them.');

  const email = (args.email || '').trim().toLowerCase();
  const name = (args.name || '').trim();
  const tier = args.tier;
  const level = args.level || 'intermediate';
  const equipment = list(args.equipment);
  const locations = list(args.locations);
  const timezone = args.timezone || 'Australia/Sydney';

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('--email is required and must be a valid address.');
  if (!name) fail('--name is required.');
  if (!TIERS.includes(tier)) fail(`--tier must be one of: ${TIERS.join(', ')}.`);
  if (!LEVELS.includes(level)) fail(`--level must be one of: ${LEVELS.join(', ')}.`);
  const badLocations = locations.filter((l) => !LOCATIONS.includes(l));
  if (badLocations.length) fail(`Unknown location(s): ${badLocations.join(', ')}. Use: ${LOCATIONS.join(', ')}.`);
  if (!Intl.supportedValuesOf('timeZone').includes(timezone)) fail(`Unknown timezone: ${timezone}.`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  const known = await libraryEquipment(supabase);
  const unknownEquipment = equipment.filter((e) => !known.has(e));
  if (unknownEquipment.length) {
    fail(`Unknown equipment: ${unknownEquipment.join(', ')}. Use names from the exercise library, e.g. ${[...known].slice(0, 8).join(', ')}.`);
  }

  const coach = tier === 'member' ? await findCoach(supabase, args['coach-email']) : null;

  console.log(`\nFrateTrain — Create Athlete${args.dryRun ? ' [DRY RUN]' : ''}`);
  console.log(`  ${name} <${email}>`);
  console.log(`  tier ${tier} · level ${level} · timezone ${timezone}`);
  console.log(`  equipment: ${equipment.join(', ') || '(none)'} · locations: ${locations.join(', ') || '(none)'}`);
  if (coach) console.log(`  coach: ${coach.display_name || coach.user_id}`);

  if (args.dryRun) {
    console.log('\nDry run: nothing created.');
    return;
  }

  const password = tempPassword();
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (createError) fail(`Could not create the login: ${createError.message}`);
  const userId = created.user.id;

  const { error: athleteError } = await supabase.from('athletes').insert({
    user_id: userId,
    name,
    tier,
    level,
    equipment,
    training_locations: locations,
    timezone,
    coach_user_id: coach?.user_id ?? null,
  });
  if (athleteError) {
    // Don't leave a login without an athlete row.
    await supabase.auth.admin.deleteUser(userId);
    fail(`Could not create the athlete row (login removed again): ${athleteError.message}`);
  }

  console.log('\n✓ Athlete created.');
  console.log(`  Temporary password (shown once, not saved anywhere): ${password}`);
  console.log('  Ask them to change it in Profile → Change password after signing in.');
}

main().catch((err) => fail(err.message));
