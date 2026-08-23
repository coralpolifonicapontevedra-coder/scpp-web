#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
// Use global fetch available in Node 18+ (no external dependency)

const rl = readline.createInterface({ input, output });

const PREVIEW_URL = process.env.PREVIEW_URL || 'https://preview.coralpolifonicapontevedra.org';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || '';

async function signIn(email, password) {
  if (!FIREBASE_API_KEY) throw new Error('Set FIREBASE_API_KEY env var with your Firebase Web API key');
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const j = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(j));
  return j.idToken;
}

async function callApi(idToken, idConcerto) {
  const res = await fetch(`${PREVIEW_URL}/api/concertos-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, accion: 'obterXestion', idConcerto })
  });
  const j = await res.json().catch(() => null);
  console.log('HTTP', res.status);
  console.log('RESPONSE:', JSON.stringify(j, null, 2));
}

(async () => {
  try {
    const email = await rl.question('Admin email: ');
    const password = await rl.question('Password: ');
    const idConcerto = await rl.question('idConcerto to test: ');
    rl.close();
    console.log('Signing in (Firebase)...');
    const idToken = await signIn(email.trim(), password.trim());
    console.log('idToken: <REDACTED> (sent to API)');
    await callApi(idToken, idConcerto.trim());
  } catch (e) {
    console.error('ERROR:', e.message || e);
    process.exit(1);
  }
})();
