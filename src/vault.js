// Mon Patrimoine — coffre chiffré (v5, étape 1 en développement)
//
// Rôle : stocker l'état de l'application dans IndexedDB, chiffré avec le mot de passe
// unique de l'utilisateur, avec verrouillage et déverrouillage, verrouillage automatique
// après inactivité, et sauvegardes sûres face aux erreurs et aux écritures interrompues.
//
// Principes :
// 1. Une écriture n'est confirmée (« sauvegardé ») qu'à la fin de la transaction IndexedDB.
// 2. Chaque transaction écrit l'enveloppe courante ET l'enveloppe précédente (« prev ») :
//    soit tout est appliqué, soit rien. Une interruption ne peut pas laisser un état mixte.
// 3. Une erreur d'écriture ne modifie jamais les données déjà enregistrées. Le changement
//    reste en mémoire, marqué « non enregistré », et peut être réessayé.
// 4. La clé de chiffrement n'est dérivée qu'au déverrouillage ; elle est effacée au verrouillage.
//
// Le backend est injecté : `idbBackend()` pour le navigateur, `memoryBackend()` pour les tests.

import {
  deriveKey, newSalt, encryptWithKey, decryptWithKey, toB64, fromB64,
  CryptoError, DEFAULT_ITER, MIN_PASSWORD_LENGTH
} from './crypto.js';

export const DEFAULT_AUTOLOCK_MIN = 5;
export const AUTOLOCK_MIN_RANGE = [1, 60];
const K = { META: 'meta', CURRENT: 'current', PREV: 'prev' };

export class VaultError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const clone = v => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------------------
// Backends. Contrat : read(keys) -> { key: valeur | undefined } ;
// commit(ops) -> Promise résolue UNIQUEMENT après application complète, où
// ops = [{ key, value } | { key, delete: true }]. Rejet sinon, sans effet partiel.
// ---------------------------------------------------------------------------

// Backend en mémoire pour les tests, avec injection de pannes.
// failures : file de pannes à appliquer aux prochains commit : 'reject' (erreur de stockage),
// 'interrupt' (interruption : aucune écriture appliquée).
export function memoryBackend({ failures = [] } = {}) {
  const data = new Map();
  const queue = [...failures];
  return {
    data,
    failNext(kind) { queue.push(kind); },   // programme une panne sur le prochain commit
    async read(keys) {
      const out = {};
      for (const k of keys) out[k] = data.has(k) ? clone(data.get(k)) : undefined;
      return out;
    },
    async commit(ops) {
      const f = queue.shift();
      if (f === 'reject') throw new Error('QuotaExceededError (simulé)');
      if (f === 'interrupt') throw new Error('Transaction interrompue (simulé) : aucune écriture appliquée');
      const next = new Map(data);
      for (const op of ops) {
        if (op.delete) next.delete(op.key); else next.set(op.key, clone(op.value));
      }
      // Application atomique : remplacement d'un seul bloc.
      data.clear();
      for (const [k, v] of next) data.set(k, v);
    }
  };
}

// Backend IndexedDB réel (navigateur, Safari iOS). Non testable dans cet environnement.
export function idbBackend({ name = 'mesfinances', store = 'kv' } = {}) {
  let dbp = null;
  const open = () => dbp ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new VaultError('storage_unavailable', 'IndexedDB indisponible'));
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(req.error || new VaultError('storage_unavailable')); };
    req.onblocked = () => { dbp = null; reject(new VaultError('storage_unavailable', 'Base IndexedDB bloquée')); };
  });
  return {
    async read(keys) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const os = tx.objectStore(store);
        const out = {};
        for (const k of keys) { const r = os.get(k); r.onsuccess = () => { out[k] = r.result; }; }
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(tx.error || new VaultError('storage_error'));
        tx.onabort = () => reject(tx.error || new VaultError('storage_error', 'Lecture interrompue'));
      });
    },
    async commit(ops) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        for (const op of ops) { if (op.delete) os.delete(op.key); else os.put(op.value, op.key); }
        // Résolu seulement quand la transaction est validée sur disque.
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new VaultError('storage_error'));
        tx.onabort = () => reject(tx.error || new VaultError('storage_error', 'Écriture interrompue'));
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Coffre
// ---------------------------------------------------------------------------
export function createVault({
  backend,
  clock = () => Date.now(),
  iter = DEFAULT_ITER,
  onChange = () => {}
}) {
  let status = 'loading';        // loading | uninitialized | locked | unlocked | error
  let saveStatus = 'idle';       // idle | saving | saved | unsaved | error
  let key = null, salt = null, state = null;
  let meta = null;               // { salt, iter, autoLockMin, formatVersion, createdAt }
  let lastCommitted = null;      // dernière enveloppe confirmée par le backend
  let lastSavedAt = null;
  let lastError = null;          // { code, message } ou null
  let lastActivity = clock();
  let chain = Promise.resolve(); // file d'écritures : une à la fois
  let dirty = false;

  const emit = () => { try { onChange(publicStatus()); } catch (e) { /* un écouteur ne doit pas casser le coffre */ } };

  function publicStatus() {
    return {
      status, saveStatus, lastSavedAt,
      lastError: lastError ? lastError.code : null,
      unsaved: dirty,
      autoLockMin: meta ? meta.autoLockMin : DEFAULT_AUTOLOCK_MIN
    };
  }

  const metaOf = (s, extra = {}) => ({
    formatVersion: 1,
    salt: toB64(s),
    iter,
    autoLockMin: meta ? meta.autoLockMin : DEFAULT_AUTOLOCK_MIN,
    createdAt: meta ? meta.createdAt : new Date(clock()).toISOString(),
    ...extra
  });

  function fail(code, message) {
    lastError = { code, message };
    saveStatus = 'error';
    emit();
  }

  // ----- ouverture -----
  // Lit seulement les métadonnées : aucune donnée n'est déchiffrée avant le mot de passe.
  async function open() {
    try {
      const r = await backend.read([K.META]);
      meta = r[K.META] || null;
      status = meta ? 'locked' : 'uninitialized';
      lastError = null;
    } catch (e) {
      status = 'error';
      lastError = { code: 'storage_unavailable', message: e.message };
    }
    emit();
    return status;
  }

  // ----- création (première utilisation) -----
  async function create(password, confirmation, initialState) {
    if (status !== 'uninitialized') throw new VaultError('already_initialized', 'Un coffre existe déjà');
    if (password !== confirmation) throw new VaultError('mismatch', 'Les deux mots de passe ne correspondent pas');
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH)
      throw new VaultError('weak_password', `Mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum)`);
    const s = newSalt();
    const k = await deriveKey(password, s, iter);
    const env = await encryptWithKey(initialState, k, { salt: s, iter });
    const m = metaOf(s);
    try {
      await backend.commit([{ key: K.CURRENT, value: env }, { key: K.META, value: m }]);
    } catch (e) {
      fail('storage_error', e.message);
      throw new VaultError('storage_error', e.message);
    }
    meta = m; key = k; salt = s; state = clone(initialState); lastCommitted = env;
    status = 'unlocked'; saveStatus = 'saved'; lastSavedAt = clock(); lastError = null; dirty = false;
    touch(); emit();
  }

  // ----- déverrouillage -----
  // Lit l'enveloppe courante. Si elle est illisible, tente la copie « prev » (même mot de passe,
  // donc même clé). Un mauvais mot de passe échoue sur les deux : il est alors signalé.
  async function unlock(password) {
    if (status !== 'locked') throw new VaultError('not_locked', 'Le coffre n’est pas verrouillé');
    const r = await backend.read([K.META, K.CURRENT, K.PREV]);
    const m = r[K.META];
    if (!m) throw new VaultError('uninitialized');
    const s = fromB64(m.salt);
    const k = await deriveKey(password, s, m.iter);
    let st = null, env = null, recovered = false, authError = null;
    for (const candidate of [K.CURRENT, K.PREV]) {
      const e = r[candidate];
      if (!e) continue;
      try {
        st = await decryptWithKey(e, k, m.salt);
        env = e;
        recovered = candidate === K.PREV;
        break;
      } catch (err) {
        if (candidate === K.CURRENT) authError = err;
      }
    }
    if (!st) {
      if (authError && authError.code === 'auth_failed') throw new VaultError('wrong_password', 'Mot de passe incorrect');
      throw new VaultError('data_unreadable', 'Données illisibles (ni la version courante, ni la copie de secours)');
    }
    meta = m; key = k; salt = s; state = st; lastCommitted = env;
    status = 'unlocked'; lastError = null; lastSavedAt = null;
    // Si la copie de secours a été utilisée, la version courante est réécrite au premier enregistrement.
    dirty = recovered;
    saveStatus = recovered ? 'unsaved' : 'idle';
    touch(); emit();
    return { recovered };
  }

  // ----- verrouillage : efface la clé et l'état en mémoire -----
  async function lock() {
    if (status !== 'unlocked') return;
    if (dirty) return false; // jamais de perte silencieuse : le coffre reste ouvert tant que rien n'est enregistré
    await chain.catch(() => {});
    key = null; salt = null; state = null;   // l'enveloppe chiffrée reste en stockage (inoffensive sans mot de passe)
    status = 'locked'; saveStatus = 'idle'; lastError = null;
    emit();
    return true;
  }

  // ----- lecture -----
  function getState() {
    if (status !== 'unlocked') throw new VaultError('locked', 'Coffre verrouillé');
    return clone(state);
  }

  // ----- modification -----
  // mutator(draft) modifie le brouillon (ou retourne un nouvel état). L'état en mémoire
  // n'est remplacé qu'une fois le brouillon accepté ; l'écriture est confirmée à part.
  // La lecture du brouillon, la modification et l'écriture sont sérialisées dans la file :
  // deux modifications lancées en parallèle ne peuvent pas lire le même état de départ.
  async function update(mutator) {
    if (status !== 'unlocked') throw new VaultError('locked', 'Coffre verrouillé');
    touch();
    return enqueue(async () => {
      if (status !== 'unlocked') throw new VaultError('locked', 'Coffre verrouillé');
      const draft = clone(state);
      const next = (await mutator(draft)) ?? draft;
      state = clone(next);
      dirty = true;
      saveStatus = 'saving';
      emit();
      return writePending();
    });
  }

  // Réessai manuel ou automatique après une erreur de stockage.
  async function retry() {
    if (status !== 'unlocked' || !dirty) return { saved: true };
    return persist();
  }

  // Écriture sérialisée. Renvoie { saved: true | false }.
  function persist() { return enqueue(() => writePending()); }

  function enqueue(fn) {
    const job = chain.then(fn);
    chain = job.catch(() => {});
    return job;
  }

  async function writePending() {
    {
      if (status !== 'unlocked') return { saved: false };
      const k = key, s = salt;
      let env;
      try {
        env = await encryptWithKey(state, k, { salt: s, iter: meta.iter });
      } catch (e) {
        fail('encryption_error', e.message);
        return { saved: false };
      }
      const ops = [{ key: K.CURRENT, value: env }];
      if (lastCommitted) ops.push({ key: K.PREV, value: lastCommitted });
      try {
        await backend.commit(ops);
      } catch (e) {
        // Données précédentes intactes (transaction annulée). Le changement reste en mémoire.
        fail('storage_error', e.message);
        return { saved: false };
      }
      lastCommitted = env;
      dirty = false;
      saveStatus = 'saved';
      lastSavedAt = clock();
      lastError = null;
      emit();
      return { saved: true };
    }
  }

  // ----- changement de mot de passe -----
  // 1) vérifie l'ancien mot de passe, 2) chiffre avec le nouveau, 3) relit et vérifie,
  // 4) écrit en une transaction. Aucune écriture avant la vérification complète.
  async function changePassword(oldPassword, newPassword) {
    if (status !== 'unlocked') throw new VaultError('locked', 'Coffre verrouillé');
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH)
      throw new VaultError('weak_password', `Mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum)`);
    if (oldPassword === newPassword) throw new VaultError('same_password', 'Le nouveau mot de passe doit être différent');
    await chain.catch(() => {});                    // attendre les écritures en cours
    if (dirty) {
      const r = await persist();                    // enregistrer d'abord les modifications en attente
      if (!r.saved) throw new VaultError('storage_error', 'Enregistrement impossible : changement annulé');
    }
    // 1) ancien mot de passe
    const oldKey = await deriveKey(oldPassword, salt, meta.iter);
    try {
      await decryptWithKey(lastCommitted, oldKey, meta.salt);
    } catch (e) {
      throw new VaultError('wrong_password', 'Ancien mot de passe incorrect');
    }
    // 2) nouveau chiffrement
    const s2 = newSalt();
    const k2 = await deriveKey(newPassword, s2, meta.iter);
    const env2 = await encryptWithKey(state, k2, { salt: s2, iter: meta.iter });
    // 3) vérification avant toute écriture
    let check;
    try { check = await decryptWithKey(env2, k2, toB64(s2)); }
    catch (e) { throw new VaultError('verify_failed', 'Vérification du nouveau chiffrement échouée : aucune donnée modifiée'); }
    if (JSON.stringify(check) !== JSON.stringify(state))
      throw new VaultError('verify_failed', 'Contenu différent après chiffrement : aucune donnée modifiée');
    // 4) écriture atomique : nouvelle enveloppe, nouveau sel, ancienne copie de secours supprimée
    const m2 = metaOf(s2);
    try {
      await backend.commit([
        { key: K.CURRENT, value: env2 },
        { key: K.META, value: m2 },
        { key: K.PREV, delete: true }
      ]);
    } catch (e) {
      throw new VaultError('storage_error', 'Écriture impossible : ancien mot de passe toujours actif, aucune donnée modifiée');
    }
    meta = m2; key = k2; salt = s2; lastCommitted = env2;
    dirty = false; saveStatus = 'saved'; lastSavedAt = clock(); lastError = null;
    emit();
    return { changed: true };
  }

  // ----- verrouillage automatique -----
  function touch() { lastActivity = clock(); }

  // Appelé régulièrement (minuteur, retour au premier plan). Renvoie true si verrouillé.
  async function checkIdle() {
    if (status !== 'unlocked') return false;
    const limit = (meta ? meta.autoLockMin : DEFAULT_AUTOLOCK_MIN) * 60000;
    if (clock() - lastActivity < limit) return false;
    if (dirty) { await retry(); if (dirty) return false; } // ne jamais verrouiller avec des modifications non enregistrées
    return lock();
  }

  // Modifie le délai d'inactivité (1 à 60 minutes), stocké en clair dans les métadonnées (non secret).
  async function setAutoLockMinutes(minutes) {
    const n = Number(minutes);
    if (!Number.isInteger(n) || n < AUTOLOCK_MIN_RANGE[0] || n > AUTOLOCK_MIN_RANGE[1])
      throw new VaultError('invalid_value', `Délai entre ${AUTOLOCK_MIN_RANGE[0]} et ${AUTOLOCK_MIN_RANGE[1]} minutes`);
    const next = { ...meta, autoLockMin: n };
    try {
      await backend.commit([{ key: K.META, value: next }]);
    } catch (e) {
      throw new VaultError('storage_error', e.message);
    }
    meta = next; emit();
    return n;
  }

  return {
    open, create, unlock, lock,
    getState, update, retry, changePassword,
    touch, checkIdle, setAutoLockMinutes,
    status: () => publicStatus(),
    _internal: { backend }   // accès réservé aux tests (inspection des enveloppes)
  };
}
