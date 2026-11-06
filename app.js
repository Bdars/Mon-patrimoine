// Version de test pour iPhone — coffre chiffré uniquement. Données fictives. Aucun réseau.
import { createVault, idbBackend, AUTOLOCK_MIN_RANGE } from './src/vault.js';

const DB_NAME = 'mp-test-v5';                       // base distincte de vos données réelles
const FICTIVE_INITIAL = {
  banner: 'DONNÉES FICTIVES DE TEST',
  items: [{ id: 't1', label: 'DONNEE_FICTIVE Dépense test 1', amount: 12.34 }]
};
const MARKERS = ['DONNEE_FICTIVE', 'Dépense test'];  // textes qui ne doivent JAMAIS apparaître en clair dans le stockage

// ----- stockage réel + possibilité de simuler une panne d'écriture (test uniquement) -----
const real = idbBackend({ name: DB_NAME, store: 'kv' });
let failWrites = false;
const backend = {
  read: keys => real.read(keys),
  commit: ops => failWrites
    ? Promise.reject(new Error('Erreur d’écriture simulée (test)'))
    : real.commit(ops)
};

let vault = null;
let vstat = null;          // dernier état publié par le coffre
let lastUnlockMs = null;   // durée réelle du dernier déverrouillage
let lastHidden = null;

// ----- utilitaires -----
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'text') n.textContent = v;
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c != null) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
const ts = () => new Date().toLocaleTimeString('fr-FR');
const journalEntries = [];
function log(msg) {
  journalEntries.unshift(`${ts()} — ${msg}`);
  journalEntries.length = Math.min(journalEntries.length, 40);
  const ol = document.getElementById('journal');
  if (ol) ol.replaceChildren(...journalEntries.map(t => el('li', { text: t })));
}
function setMsg(text, isErr = false) {
  const m = document.getElementById('msg');
  m.textContent = text;
  m.className = isErr ? 'err' : '';
}
const errText = e => (e && e.message) ? e.message : String(e);

// ----- barre d'état de sauvegarde -----
function updateStatusBar() {
  const bar = document.getElementById('statusbar');
  const s = vstat;
  let txt = 'Chargement…', cls = '';
  if (s) {
    if (s.status === 'locked') { txt = '🔒 Verrouillé'; cls = 'ok'; }
    else if (s.status === 'uninitialized') { txt = 'Aucun coffre : créez-le ci-dessous'; }
    else if (s.status === 'unlocked') {
      if (s.saveStatus === 'saving') { txt = '⏳ Enregistrement en cours…'; cls = 'busy'; }
      else if (s.unsaved || s.saveStatus === 'error') { txt = '⚠️ NON ENREGISTRÉ — la dernière modification n’est pas sauvegardée. Réessayez.'; cls = 'err'; }
      else { txt = '✅ Enregistré' + (s.lastSavedAt ? ' à ' + new Date(s.lastSavedAt).toLocaleTimeString('fr-FR') : ''); cls = 'ok'; }
    } else { txt = 'Erreur de stockage : ' + (s.lastError || 'inconnue'); cls = 'err'; }
  }
  bar.textContent = txt;
  bar.className = 'statusbar ' + cls;
}

// ----- écouteur du coffre -----
function onVaultChange(s) {
  const prev = vstat;
  vstat = s;
  if (prev && prev.status !== s.status) {
    if (prev.status === 'unlocked' && s.status === 'locked') log('Verrouillé');
    if (prev.status === 'locked' && s.status === 'unlocked') log('Déverrouillé');
  }
  // Redessiner à chaque événement quand le coffre est ouvert : la liste doit refléter l'état en mémoire.
  if (s.status === 'unlocked' || (prev && prev.status !== s.status)) render();
  if (s.saveStatus === 'error' && (!prev || prev.saveStatus !== 'error')) {
    log('Erreur d’écriture : ' + s.lastError + ' — données précédentes intactes');
  }
  updateStatusBar();
}

// ----- vues -----
function render() {
  const app = document.getElementById('app');
  const st = vstat ? vstat.status : 'loading';
  let view;
  if (st === 'uninitialized') view = viewCreate();
  else if (st === 'locked') view = viewLocked();
  else if (st === 'unlocked') view = viewUnlocked();
  else if (st === 'error') view = el('section', { class: 'card' }, el('p', { text: 'Stockage inaccessible sur cet appareil (' + (vstat.lastError || '') + ').' }));
  else view = el('p', { text: 'Chargement…' });
  app.replaceChildren(view);
  updateStatusBar();
}

function viewCreate() {
  const p1 = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Mot de passe (10 caractères minimum)' });
  const p2 = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Confirmer le mot de passe' });
  return el('section', { class: 'card' },
    el('h2', { text: '1. Créer le coffre de test' }),
    el('div', { class: 'alert danger', text: '⚠️ Si vous perdez ce mot de passe, les données seront définitivement perdues. Aucune récupération n’est possible.' }),
    p1, p2,
    el('button', {
      class: 'primary', text: 'Créer le coffre (données fictives)',
      onclick: async () => {
        try {
          await vault.create(p1.value, p2.value, FICTIVE_INITIAL);
          log('Coffre créé avec des données fictives');
          setMsg('Coffre créé.');
        } catch (e) { setMsg(errText(e), true); log('Création échouée : ' + errText(e)); }
      }
    })
  );
}

function viewLocked() {
  const pw = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Mot de passe' });
  const submit = async () => {
    const t0 = performance.now();
    try {
      const r = await vault.unlock(pw.value);
      lastUnlockMs = Math.round(performance.now() - t0);
      log(`Déverrouillage en ${lastUnlockMs} ms` + (r.recovered ? ' (copie de secours utilisée)' : ''));
      pw.value = '';
      setMsg('');
      render();
    } catch (e) {
      lastUnlockMs = Math.round(performance.now() - t0);
      setMsg(errText(e), true);
      log(`Échec du déverrouillage après ${lastUnlockMs} ms : ${errText(e)}`);
    }
  };
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  return el('section', { class: 'card' },
    el('h2', { text: '2. Déverrouiller' }),
    pw,
    el('button', { class: 'primary', text: 'Déverrouiller', onclick: submit }),
    el('p', { class: 'mono', text: lastUnlockMs != null ? `Dernier déverrouillage : ${lastUnlockMs} ms` : 'Aucun déverrouillage mesuré sur cette session.' }),
    el('hr'),
    el('h2', { text: 'Réinitialiser le coffre de TEST' }),
    el('p', { text: 'Efface uniquement la base de test (mp-test-v5). Vos données réelles ne sont pas concernées.' }),
    el('button', {
      class: 'danger', text: 'Effacer le coffre de test',
      onclick: async () => {
        if (!confirm('Effacer le coffre de TEST uniquement ?')) return;
        await real.commit([{ key: 'current', delete: true }, { key: 'meta', delete: true }, { key: 'prev', delete: true }]);
        location.reload();
      }
    })
  );
}

function viewUnlocked() {
  const state = vault.getState();
  const items = state.items || [];
  const selAutolock = el('select', {
    onchange: async e => {
      try {
        const n = await vault.setAutoLockMinutes(+e.target.value);
        log(`Délai de verrouillage réglé à ${n} min`);
      } catch (err) { setMsg(errText(err), true); }
    }
  }, ...[1, 2, 5, 10, 30, 60].map(m => el('option', { value: m, selected: m === vstat.autoLockMin, text: `${m} minute${m > 1 ? 's' : ''}` })));
  const chkFail = el('input', { type: 'checkbox', onchange: e => { failWrites = e.target.checked; log(failWrites ? 'Panne d’écriture SIMULÉE activée' : 'Panne d’écriture simulée désactivée'); } });
  chkFail.checked = failWrites;

  const addItem = () => vault.update(d => {
    d.items.push({ id: 't' + Date.now(), label: 'DONNEE_FICTIVE Dépense test ' + (d.items.length + 1), amount: Math.round(Math.random() * 10000) / 100 });
  }).then(r => { if (!r.saved) log('Enregistrement échoué : modification conservée en mémoire, NON enregistrée'); else log('Dépense fictive ajoutée et enregistrée'); });

  const changeLast = () => vault.update(d => {
    if (d.items.length) d.items[d.items.length - 1].amount = Math.round((d.items[d.items.length - 1].amount + 1) * 100) / 100;
  }).then(r => log(r.saved ? 'Montant modifié et enregistré' : 'Modification NON enregistrée (erreur d’écriture)'));

  const removeLast = () => vault.update(d => { d.items.pop(); })
    .then(r => log(r.saved ? 'Dernière ligne supprimée et enregistrée' : 'Suppression NON enregistrée (erreur d’écriture)'));

  return el('section', { class: 'card' },
    el('h2', { text: '3. Données fictives' }),
    el('ul', { class: 'items' }, ...items.map(it => el('li', { text: `${it.label} — ${Number(it.amount).toFixed(2)} MAD` }))),
    el('button', { class: 'primary', text: 'Ajouter une ligne fictive', onclick: addItem }),
    el('button', { text: 'Modifier le dernier montant (+1)', onclick: changeLast }),
    el('button', { text: 'Supprimer la dernière ligne', onclick: removeLast }),
    el('button', { text: 'Réessayer l’enregistrement', onclick: () => vault.retry().then(r => log(r.saved ? 'Réessai réussi' : 'Réessai échoué')) }),
    el('hr'),
    el('h2', { text: '4. Tests' }),
    el('label', { class: 'chk' }, chkFail, el('span', { text: 'Simuler une erreur d’écriture' })),
    el('button', {
      text: 'Vérifier le stockage (données en clair ?)',
      onclick: async () => {
        const r = await real.read(['meta', 'current', 'prev']);
        const raw = JSON.stringify(r);
        const found = MARKERS.filter(m => raw.includes(m));
        const cur = r.current || {};
        setMsg(
          `Taille du stockage : ${raw.length} caractères. Chiffrement : ${cur.cipher ? cur.cipher.name : '—'}, PBKDF2 ${cur.kdf ? cur.kdf.iter : '—'} itérations. ` +
          `Aperçu chiffré : ${cur.data ? cur.data.slice(0, 40) + '…' : '—'}. ` +
          `Textes en clair trouvés : ${found.length ? found.join(', ') + ' ❌' : 'AUCUN ✅'}`,
          found.length > 0
        );
        log('Vérification du stockage : ' + (found.length ? 'DONNÉES EN CLAIR ❌' : 'aucune donnée en clair ✅'));
      }
    }),
    el('p', { class: 'mono', text: lastUnlockMs != null ? `Dernier déverrouillage : ${lastUnlockMs} ms` : '' }),
    el('label', {}, el('span', { text: 'Verrouillage automatique après inactivité' }), selAutolock),
    el('button', {
      text: 'Verrouiller maintenant',
      onclick: async () => {
        const ok = await vault.lock();
        if (ok === false) setMsg('Verrouillage impossible : des modifications ne sont pas enregistrées. Réessayez d’abord.', true);
      }
    })
  );
}

// ----- verrouillage automatique et arrière-plan -----
const ACTIVITY = ['pointerdown', 'keydown', 'touchstart'];
ACTIVITY.forEach(ev => document.addEventListener(ev, () => { if (vault) vault.touch(); }, { passive: true }));

setInterval(async () => {
  if (!vault || !vstat || vstat.status !== 'unlocked') return;
  const locked = await vault.checkIdle();
  if (locked) log('Verrouillage automatique après inactivité');
}, 5000);

async function checkOnResume(reason) {
  if (!vault) return;
  log(reason);
  const locked = await vault.checkIdle();
  if (locked) log('Verrouillage automatique au retour (délai dépassé)');
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    lastHidden = Date.now();
    log('Application passée en arrière-plan');
  } else {
    const s = lastHidden ? Math.round((Date.now() - lastHidden) / 1000) : 0;
    checkOnResume(`Retour au premier plan après ${s} s`);
  }
});
window.addEventListener('pageshow', e => { if (e.persisted) checkOnResume('Page restaurée depuis le cache'); });

// ----- démarrage -----
async function init() {
  log('Démarrage (test) — aucun réseau utilisé');
  vault = createVault({ backend, onChange: onVaultChange });
  try {
    await vault.open();
  } catch (e) { setMsg(errText(e), true); }
  render();
  if (navigator.storage && navigator.storage.persist) {
    try {
      const granted = await navigator.storage.persist();
      log('Stockage persistant demandé : ' + (granted ? 'accordé' : 'non accordé'));
    } catch (e) { log('Demande de stockage persistant impossible'); }
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => log('Mode hors ligne prêt'))
      .catch(e => log('Service worker non enregistré : ' + errText(e)));
  }
}
init();
