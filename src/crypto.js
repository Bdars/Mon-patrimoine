// Mon Patrimoine — module de chiffrement (v5, en développement)
// Web Crypto uniquement : PBKDF2-SHA256 (dérivation) + AES-256-GCM (chiffrement + intégrité).
// Aucune bibliothèque externe. Aucune donnée n'est journalisée ni transmise.
//
// Format d'enveloppe (JSON UTF-8, sans donnée financière en clair) :
// {
//   "format": "mesfinances-enc", "v": 1,
//   "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iter": 600000, "salt": "<b64 16 o>" },
//   "cipher": { "name": "AES-GCM", "iv": "<b64 12 o>" },
//   "createdAt": "<ISO 8601>",
//   "data": "<b64 : texte chiffré + étiquette GCM 16 o>"
// }
// L'en-tête (format, v, kdf, cipher, createdAt) est lié au chiffrement comme données
// authentifiées (additionalData) : toute modification de l'en-tête est détectée.
// Un IV neuf est tiré à chaque chiffrement ; un même IV n'est jamais réutilisé avec la même clé.

const subtle = globalThis.crypto.subtle;
const rand = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

export const FORMAT = 'mesfinances-enc';
export const VERSION = 1;
export const DEFAULT_ITER = 600000;   // recommandation OWASP (PBKDF2-HMAC-SHA256)
const MIN_ITER = 100000;              // refus de tout paramètre plus faible à la lecture
const MAX_ITER = 10000000;
export const MIN_PASSWORD_LENGTH = 10;

export class CryptoError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// --- base64 (sans Buffer, compatible Safari) -----------------------------
export const toB64 = u8 => {
  let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
};
export const fromB64 = s => {
  if (typeof s !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new CryptoError('bad_format', 'Base64 invalide');
  const bin = atob(s); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

// --- dérivation de clé ----------------------------------------------------
export async function deriveKey(password, salt, iter = DEFAULT_ITER) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH)
    throw new CryptoError('weak_password', `Mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum)`);
  const base = await subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

export const newSalt = () => rand(16);

const headerOf = (kdf, cipher, createdAt) => ({ format: FORMAT, v: VERSION, kdf, cipher, createdAt });
const aad = header => enc.encode(JSON.stringify(header));

// --- validation de l'enveloppe -------------------------------------------
export function validateEnvelope(env) {
  if (!env || typeof env !== 'object') throw new CryptoError('bad_format', 'Fichier non reconnu');
  if (env.format !== FORMAT) throw new CryptoError('bad_format', 'Ce fichier n’est pas une sauvegarde Mon Patrimoine');
  if (env.v !== VERSION) throw new CryptoError('unsupported_version', `Version de format non prise en charge (${env.v})`);
  if (!env.kdf || env.kdf.name !== 'PBKDF2' || env.kdf.hash !== 'SHA-256') throw new CryptoError('bad_format', 'Paramètres de dérivation non reconnus');
  if (!Number.isInteger(env.kdf.iter) || env.kdf.iter < MIN_ITER || env.kdf.iter > MAX_ITER) throw new CryptoError('bad_format', 'Nombre d’itérations hors limites');
  if (!env.cipher || env.cipher.name !== 'AES-GCM') throw new CryptoError('bad_format', 'Algorithme de chiffrement non reconnu');
  const salt = fromB64(env.kdf.salt), iv = fromB64(env.cipher.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new CryptoError('bad_format', 'Longueurs de sel ou de vecteur incorrectes');
  if (typeof env.data !== 'string' || env.data.length === 0) throw new CryptoError('bad_format', 'Contenu chiffré absent');
  if (typeof env.createdAt !== 'string' || Number.isNaN(Date.parse(env.createdAt))) throw new CryptoError('bad_format', 'Date de création invalide');
  return { salt, iv, ct: fromB64(env.data) };
}

// --- chiffrement avec clé déjà dérivée (rapide, utilisé à chaque sauvegarde) ---
// key : CryptoKey issue de deriveKey(password, salt, iter) ; salt : Uint8Array 16 o.
export async function encryptWithKey(plainObj, key, { salt, iter, now = new Date() }) {
  const iv = rand(12);
  const kdf = { name: 'PBKDF2', hash: 'SHA-256', iter, salt: toB64(salt) };
  const cipher = { name: 'AES-GCM', iv: toB64(iv) };
  const createdAt = now.toISOString();
  const header = headerOf(kdf, cipher, createdAt);
  const plain = enc.encode(JSON.stringify(plainObj));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(header), tagLength: 128 }, key, plain));
  return { ...header, data: toB64(ct) };
}

// --- déchiffrement avec clé déjà dérivée ---------------------------------
// expectedSaltB64 : sel attendu (celui de la clé). Refuse une enveloppe d'un autre sel.
export async function decryptWithKey(env, key, expectedSaltB64) {
  const { iv, ct } = validateEnvelope(env);
  if (expectedSaltB64 !== undefined && env.kdf.salt !== expectedSaltB64)
    throw new CryptoError('auth_failed', 'Clé ne correspondant pas à cette enveloppe');
  const header = headerOf(env.kdf, env.cipher, env.createdAt);
  let plain;
  try {
    plain = await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(header), tagLength: 128 }, key, ct);
  } catch (e) {
    // Mot de passe incorrect OU fichier altéré : indiscernables par conception.
    throw new CryptoError('auth_failed', 'Mot de passe incorrect ou fichier altéré');
  }
  try {
    return JSON.parse(dec.decode(plain));
  } catch (e) {
    throw new CryptoError('bad_content', 'Contenu déchiffré illisible');
  }
}

// --- API par mot de passe (sauvegardes fichier) --------------------------
export async function encryptObject(plainObj, password, { iter = DEFAULT_ITER, now } = {}) {
  const salt = newSalt();
  const key = await deriveKey(password, salt, iter);
  return encryptWithKey(plainObj, key, { salt, iter, now });
}

export async function decryptObject(env, password) {
  const { salt } = validateEnvelope(env);
  const key = await deriveKey(password, salt, env.kdf.iter);
  return decryptWithKey(env, key);
}

// Changement de mot de passe : retourne une NOUVELLE enveloppe (nouveau sel, nouvel IV).
export async function reencryptObject(env, oldPassword, newPassword, opts = {}) {
  const data = await decryptObject(env, oldPassword);
  return encryptObject(data, newPassword, opts);
}

// Empreinte SHA-256 hexadécimale (contrôle d'intégrité des migrations).
export async function sha256Hex(text) {
  const h = await subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
