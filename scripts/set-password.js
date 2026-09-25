#!/usr/bin/env node
/**
 * FrateTrain — Set Password
 *
 * Sets a new password for any account (coach or athlete) using the admin API.
 * Asks for the email, then the new password twice with hidden input. The
 * password is never echoed, logged or saved.
 *
 * Usage (in an interactive terminal):
 *   node scripts/set-password.js
 *
 * Env vars (or .env):
 *   SUPABASE_URL=...
 *   SUPABASE_SECRET_KEY=...   ← secret key (sb_secret_…), bypasses RLS
 */

require('dotenv').config();
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const MIN_PASSWORD_LENGTH = 8;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function askVisible(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Reads a line with the terminal in raw mode so nothing typed is shown.
function askHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
      resolve(value);
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') return finish();
        if (char === '\u0003') {
          stdin.setRawMode(false);
          stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function findUserByEmail(supabase, email) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`Could not list accounts: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) fail('Missing SUPABASE_URL / SUPABASE_SECRET_KEY env vars. Add them to .env or export them.');
  if (!process.stdin.isTTY) fail('Run this in an interactive terminal so the password can be typed hidden.');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  const email = (await askVisible('Email: ')).toLowerCase();
  if (!email) fail('No email entered.');
  const user = await findUserByEmail(supabase, email);
  if (!user) fail(`No account with email ${email}.`);

  const password = await askHidden(`New password (at least ${MIN_PASSWORD_LENGTH} characters, hidden): `);
  if (password.length < MIN_PASSWORD_LENGTH) fail(`Use at least ${MIN_PASSWORD_LENGTH} characters. Nothing was changed.`);
  const confirm = await askHidden('Confirm new password (hidden): ');
  if (confirm !== password) fail("The passwords don't match. Nothing was changed.");

  const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
  if (error) fail(`Could not set the password: ${error.message}`);
  console.log(`✓ Password updated for ${email}. You can sign in with it now.`);
}

main().catch((err) => fail(err.message));
