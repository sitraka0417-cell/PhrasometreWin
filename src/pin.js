// Verrouillage par code PIN : jamais stocké en clair (PBKDF2 + sel aléatoire)
const CLE = 'phrasometre.pin';
const enc = new TextEncoder();
const versB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const depuisB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriver(pin, sel) {
  const cle = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: sel, iterations: 150000, hash: 'SHA-256' }, cle, 256);
}

function lire() {
  try { return JSON.parse(localStorage.getItem(CLE) || 'null'); } catch (e) { return null; }
}

export const actif = () => !!(lire() && lire().hash);
export const longueur = () => (lire() && lire().longueur) || 4;

export async function definir(pin) {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const h = await deriver(pin, sel);
  localStorage.setItem(CLE, JSON.stringify({ sel: versB64(sel), hash: versB64(h), longueur: pin.length }));
}

export async function verifier(pin) {
  const o = lire();
  if (!o) return false;
  const h = new Uint8Array(await deriver(pin, depuisB64(o.sel)));
  const attendu = depuisB64(o.hash);
  if (h.length !== attendu.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h[i] ^ attendu[i];
  return diff === 0;
}

export function supprimer() { localStorage.removeItem(CLE); }
