// Mon Patrimoine V5 — phase 1 : coquille, verrouillage, navigation, coffre vide.
// Aucun appel réseau. Toutes les données passent par le coffre chiffré (src/vault.js).
// Espaces logiques : state.finance (phase 2) et state.retraite (phase 3), un seul mot de passe.
import { createVault, idbBackend, AUTOLOCK_MIN_RANGE, VaultError } from './src/vault.js';
import * as C from './finance/core.js';
import { completerEspace, espaceFinanceVide, aujourdhui } from './finance/model.js';
import { jeuFictif } from './finance/jeu-fictif.js';
import { el, bouton } from './views/ui.js';
import { rendreFinance } from './views/finance.js';

const DB_NAME = 'mp-v5-dev';                 // base de DÉVELOPPEMENT, distincte de toute donnée réelle
const SCHEMA = 5;
const INITIAL_STATE = Object.freeze({ schema: SCHEMA, finance: espaceFinanceVide(), retraite: {} });
const DELAIS = [1, 2, 5, 10, 15, 30, 60];    // minutes, toutes dans AUTOLOCK_MIN_RANGE

// Sections. « phase » : numéro de la phase qui porte encore la rubrique (0 = portée).
const SECTIONS = [
  { id: 'tableau', label: 'Tableau de bord', phase: 0 },
  { id: 'budget', label: 'Budget mensuel', phase: 0 },
  { id: 'revenus', label: 'Revenus', phase: 0 },
  { id: 'depenses-fixes', label: 'Dépenses fixes', phase: 0 },
  { id: 'depenses-variables', label: 'Dépenses variables', phase: 0 },
  { id: 'epargne', label: 'Épargne', phase: 0 },
  { id: 'dettes', label: 'Dettes', phase: 0 },
  { id: 'objectifs', label: 'Objectifs financiers', phase: 0 },
  { id: 'projets', label: 'Projets d’épargne', phase: 0 },
  { id: 'patrimoine', label: 'Patrimoine personnel', phase: 0 },
  { id: 'retraite', label: 'Retraite', phase: 3 },
  { id: 'rapports', label: 'Rapports', phase: 0 },
  { id: 'donnees', label: 'Données et réglages', phase: 0 }
];
const FINANCE_IDS = new Set(['tableau', 'budget', 'revenus', 'depenses-fixes', 'depenses-variables', 'epargne', 'dettes', 'objectifs', 'projets', 'patrimoine', 'rapports']);

const backend = idbBackend({ name: DB_NAME, store: 'kv' });
let vault = null;
let vstat = null;
let lastUnlockMs = null;
let lastHidden = null;

// ----- utilitaires -----
const errText = e => (e && e.message) ? e.message : String(e);
const ts = () => new Date().toLocaleTimeString('fr-FR');

const journal = [];
function log(msg) {
  journal.unshift(`${ts()} — ${msg}`);
  journal.length = Math.min(journal.length, 30);
  const ol = document.getElementById('journal');
  if (ol) ol.replaceChildren(...journal.map(t => el('li', { text: t })));
}
function setMsg(text, isErr = false) {
  const m = document.getElementById('msg');
  if (!m) return;
  m.textContent = text;
  m.className = isErr ? 'err' : '';
}

// ----- barre d’état -----
function updateStatusBar() {
  const bar = document.getElementById('statusbar');
  const s = vstat;
  let txt = 'Chargement…', cls = '';
  if (s) {
    if (s.status === 'locked') { txt = '🔒 Verrouillé'; cls = 'ok'; }
    else if (s.status === 'uninitialized') { txt = 'Aucun coffre : créez-le pour commencer'; }
    else if (s.status === 'unlocked') {
      if (s.saveStatus === 'saving') { txt = '⏳ Enregistrement en cours…'; cls = 'busy'; }
      else if (s.unsaved || s.saveStatus === 'error') { txt = '⚠️ Non enregistré : réessayez'; cls = 'err'; }
      else { txt = '✅ Enregistré' + (s.lastSavedAt ? ' à ' + new Date(s.lastSavedAt).toLocaleTimeString('fr-FR') : ''); cls = 'ok'; }
    } else { txt = 'Erreur de stockage : ' + (s.lastError || 'inconnue'); cls = 'err'; }
  }
  bar.textContent = txt;
  bar.className = 'statusbar ' + cls;
}

// ----- routage (hash) : #/section -----
function sectionCourante() {
  const id = (location.hash || '').replace(/^#\//, '');
  return SECTIONS.find(s => s.id === id) || SECTIONS[0];
}

function construireMenu() {
  const menu = document.getElementById('menu');
  const actuelle = sectionCourante().id;
  menu.replaceChildren(...SECTIONS.map(s => el('a', {
    href: '#/' + s.id,
    'aria-current': s.id === actuelle ? 'page' : false,
    onclick: () => { fermerMenu(); }
  }, s.label, el('span', { class: 'phase', text: s.phase ? `Phase ${s.phase}` : '' }))));
}
function ouvrirMenu(ouvrir) {
  const menu = document.getElementById('menu');
  const btn = document.getElementById('menu-btn');
  menu.hidden = !ouvrir;
  btn.setAttribute('aria-expanded', String(ouvrir));
  // Le menu s'insère sous l'en-tête : on remonte en haut pour qu'il soit visible même après un long défilement.
  if (ouvrir) window.scrollTo({ top: 0, behavior: 'auto' });
}
function fermerMenu() { ouvrirMenu(false); }

// ----- écouteur du coffre -----
function onVaultChange(s) {
  const prev = vstat;
  vstat = s;
  if (prev && prev.status !== s.status) {
    if (prev.status === 'unlocked' && s.status === 'locked') log('Verrouillé');
    if (prev.status === 'locked' && s.status === 'unlocked') log('Déverrouillé');
  }
  if (s.status === 'unlocked' || (prev && prev.status !== s.status)) render();
  if (s.saveStatus === 'error' && (!prev || prev.saveStatus !== 'error')) {
    log('Erreur d’écriture : ' + s.lastError + ' — données précédentes intactes');
  }
  updateStatusBar();
}

// ----- rendu -----
function render() {
  const app = document.getElementById('app');
  const st = vstat ? vstat.status : 'loading';
  const menuBtn = document.getElementById('menu-btn');
  const titre = document.getElementById('titre');
  menuBtn.hidden = st !== 'unlocked';
  if (st !== 'unlocked') { fermerMenu(); }
  let vue;
  if (st === 'uninitialized') { titre.textContent = 'Création du coffre'; vue = vueCreation(); }
  else if (st === 'locked') { titre.textContent = 'Mon Patrimoine'; vue = vueVerrouillage(); }
  else if (st === 'unlocked') {
    const s = sectionCourante();
    titre.textContent = s.label;
    construireMenu();
    if (s.id === 'donnees') vue = vueDonnees();
    else if (FINANCE_IDS.has(s.id)) vue = rendreFinance(s.id, contexteFinance());
    else vue = vueSection(s);
  }
  else if (st === 'error') { titre.textContent = 'Stockage indisponible'; vue = el('section', { class: 'card' }, el('p', { text: 'Stockage inaccessible sur cet appareil (' + (vstat.lastError || '') + ').' })); }
  else vue = el('p', { text: 'Chargement…' });
  // Bandeau permanent tant que l'espace Finance contient le jeu FICTIF (marqueur « fictif »).
  const fictif = st === 'unlocked' && !!vault.getState().finance.fictif;
  const bandeau = fictif ? el('div', { class: 'bandeau-fictif', role: 'status', text: 'DONNÉES FICTIVES DE TEST — aucune donnée réelle. Ne pas utiliser pour un suivi réel.' }) : null;
  app.replaceChildren(...(bandeau ? [bandeau, vue] : [vue]));
  updateStatusBar();
}

function vueCreation() {
  const p1 = el('input', { id: 'pw1', type: 'password', autocomplete: 'new-password', placeholder: 'Mot de passe (10 caractères minimum)' });
  const p2 = el('input', { id: 'pw2', type: 'password', autocomplete: 'new-password', placeholder: 'Confirmer le mot de passe' });
  const creer = async () => {
    try {
      await vault.create(p1.value, p2.value, INITIAL_STATE);
      log('Coffre créé (vide)');
      setMsg('');
    } catch (e) {
      const msg = e instanceof VaultError ? e.message : errText(e);
      setMsg(msg, true);
      log('Création refusée : ' + msg);
    }
  };
  return el('section', { class: 'card' },
    el('h2', { text: 'Créer votre coffre' }),
    el('div', { class: 'alert', text: '⚠️ Si vous perdez ce mot de passe, vos données seront définitivement perdues. Aucune récupération n’est possible.' }),
    p1, p2,
    el('div', { class: 'row' }, el('button', { class: 'primary', text: 'Créer le coffre', onclick: creer })),
    el('p', { id: 'msg' }),
    el('p', { class: 'petit', text: 'Le coffre est vide. Les données ne sont enregistrées qu’une fois chiffrées sur cet appareil.' })
  );
}

function vueVerrouillage() {
  const pw = el('input', { id: 'pw', type: 'password', autocomplete: 'current-password', placeholder: 'Mot de passe' });
  const submit = async () => {
    const t0 = performance.now();
    try {
      const r = await vault.unlock(pw.value);
      lastUnlockMs = Math.round(performance.now() - t0);
      log(`Déverrouillage en ${lastUnlockMs} ms` + (r.recovered ? ' (copie de secours utilisée)' : ''));
      pw.value = '';
      setMsg('');
    } catch (e) {
      lastUnlockMs = Math.round(performance.now() - t0);
      const msg = e instanceof VaultError ? e.message : errText(e);
      setMsg(msg, true);
      log(`Échec du déverrouillage (${lastUnlockMs} ms) : ${msg}`);
    }
  };
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  return el('section', { class: 'card' },
    el('h2', { text: 'Déverrouiller' }),
    pw,
    el('div', { class: 'row' }, el('button', { class: 'primary', text: 'Déverrouiller', onclick: submit })),
    el('p', { id: 'msg' }),
    el('p', { class: 'petit', text: lastUnlockMs != null ? `Dernier déverrouillage : ${lastUnlockMs} ms` : '' })
  );
}

// Contexte des rubriques financières : lecture de l'espace Finance, écriture chiffrée.
// Chaque écriture met aussi à jour la photo du patrimoine du mois (comme la V4).
function contexteFinance() {
  return {
    F: completerEspace(vault.getState().finance),
    rerender: () => render(),
    enregistrer: (fn) => vault.update(d => {
      d.finance = completerEspace(d.finance);
      fn(d.finance);
      d.finance.snaps = C.upsertSnap(d.finance.snaps, C.snapRecord(d.finance, aujourdhui().slice(0, 7)));
    }).catch(e => setMsg(errText(e), true))
  };
}

function vueSection(s) {
  const enCours = s.phase === 1 ? 'cette rubrique' : `cette rubrique sera portée en phase ${s.phase}`;
  return el('section', { class: 'card' },
    el('h2', { text: s.label }),
    el('p', { text: `Rubrique réservée : ${enCours}. Aucune donnée n’est affichée ni modifiée pour l’instant.` }),
    el('p', { class: 'petit', text: 'Le coffre fonctionne déjà : verrouillage automatique, navigation et stockage chiffré.' })
  );
}

function vueDonnees() {
  const st = vault.getState();
  const selDelai = el('select', {
    id: 'delai',
    onchange: async e => {
      try {
        const n = await vault.setAutoLockMinutes(Number(e.target.value));
        log(`Délai de verrouillage réglé à ${n} min`);
        setMsg('Délai enregistré.');
      } catch (err) { setMsg(errText(err), true); }
    }
  }, ...DELAIS.filter(m => m >= AUTOLOCK_MIN_RANGE[0] && m <= AUTOLOCK_MIN_RANGE[1]).map(m =>
    el('option', { value: m, selected: m === vstat.autoLockMin, text: `${m} minute${m > 1 ? 's' : ''}` })));

  const ancien = el('input', { id: 'pw-ancien', type: 'password', autocomplete: 'current-password', placeholder: 'Mot de passe actuel' });
  const nouveau = el('input', { id: 'pw-nouveau', type: 'password', autocomplete: 'new-password', placeholder: 'Nouveau mot de passe (10 caractères minimum)' });
  const confirmation = el('input', { id: 'pw-confirm', type: 'password', autocomplete: 'new-password', placeholder: 'Confirmer le nouveau mot de passe' });
  const changer = async () => {
    if (nouveau.value !== confirmation.value) { setMsg('Les deux nouveaux mots de passe ne correspondent pas.', true); return; }
    try {
      await vault.changePassword(ancien.value, nouveau.value);
      ancien.value = ''; nouveau.value = ''; confirmation.value = '';
      log('Mot de passe modifié');
      setMsg('Mot de passe modifié. Les données sont conservées.');
    } catch (e) {
      const msg = e instanceof VaultError ? e.message : errText(e);
      setMsg(msg, true);
      log('Changement de mot de passe refusé : ' + msg);
    }
  };

  const setMsgJeu = (t) => { const n = document.getElementById('msg-jeu'); if (n) n.textContent = t; };
  const jeu = el('section', { class: 'card' },
    el('h2', { text: 'Données de test (fictives)' }),
    el('p', { class: 'alert', text: 'Ces boutons remplacent l’espace Finance par un jeu FICTIF ou le vident. Ils servent aux tests et seront retirés avant toute utilisation réelle.' }),
    el('div', { class: 'row' },
      bouton('Charger le jeu fictif', async () => {
        try { await vault.update(d => { d.finance = jeuFictif(); }); setMsgJeu('Jeu fictif chargé (aucune donnée réelle).'); }
        catch (e) { setMsgJeu(errText(e)); }
      }),
      bouton('Vider l’espace Finance', async () => {
        try { await vault.update(d => { d.finance = espaceFinanceVide(); }); setMsgJeu('Espace Finance vidé.'); }
        catch (e) { setMsgJeu(errText(e)); }
      }, { danger: true })),
    el('p', { id: 'msg-jeu' }));

  return el('div', {},
    jeu,
    el('section', { class: 'card' },
      el('h2', { text: 'Sécurité' }),
      el('label', {}, el('span', { text: 'Verrouillage automatique après inactivité' }), selDelai),
      el('div', { class: 'row' }, el('button', {
        text: 'Verrouiller maintenant',
        onclick: async () => {
          const ok = await vault.lock();
          if (ok === false) setMsg('Verrouillage impossible : des modifications ne sont pas enregistrées. Réessayez.', true);
        }
      }))
    ),
    el('section', { class: 'card' },
      el('h2', { text: 'Changer le mot de passe' }),
      el('p', { class: 'petit', text: 'Le nouveau mot de passe remplace l’ancien pour les deux espaces (Finance et Retraite).' }),
      ancien, nouveau, confirmation,
      el('div', { class: 'row' }, el('button', { class: 'primary', text: 'Changer le mot de passe', onclick: changer })),
      el('p', { id: 'msg' })
    ),
    el('section', { class: 'card' },
      el('h2', { text: 'Diagnostic' }),
      el('p', { class: 'mono', text: `Format du coffre : ${vstat.status === 'unlocked' ? 'chiffré AES-GCM' : '—'}` }),
      el('p', { class: 'mono', text: `Espaces : finance (${Object.keys(st.finance || {}).length} entrée(s)), retraite (${Object.keys(st.retraite || {}).length} entrée(s))` }),
      el('p', { class: 'mono', text: lastUnlockMs != null ? `Dernier déverrouillage : ${lastUnlockMs} ms` : 'Aucun déverrouillage mesuré.' }),
      el('ol', { id: 'journal' })
    )
  );
}

// ----- verrouillage automatique et arrière-plan -----
// Toute interaction compte comme activité, y compris les sélecteurs natifs (qui ne génèrent pas toujours de pointeur).
['pointerdown', 'keydown', 'touchstart', 'touchmove', 'focusin', 'input', 'change'].forEach(ev =>
  document.addEventListener(ev, () => { if (vault) vault.touch(); }, { passive: true }));

setInterval(async () => {
  if (!vault || !vstat || vstat.status !== 'unlocked') return;
  const locked = await vault.checkIdle();
  if (locked) log('Verrouillage automatique après inactivité');
}, 5000);

async function verifierAuRetour(raison) {
  if (!vault) return;
  log(raison);
  const locked = await vault.checkIdle();
  if (locked) log('Verrouillage automatique au retour (délai dépassé)');
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    lastHidden = Date.now();
    log('Application passée en arrière-plan');
  } else {
    const s = lastHidden ? Math.round((Date.now() - lastHidden) / 1000) : 0;
    verifierAuRetour(`Retour au premier plan après ${s} s`);
  }
});
window.addEventListener('pageshow', e => { if (e.persisted) verifierAuRetour('Page restaurée depuis le cache'); });
window.addEventListener('hashchange', () => { if (vstat && vstat.status === 'unlocked') render(); });
document.getElementById('menu-btn').addEventListener('click', () => {
  const ouvert = document.getElementById('menu').hidden;
  ouvrirMenu(ouvert);
});

// ----- démarrage -----
async function init() {
  log('Démarrage — aucun réseau utilisé');
  vault = createVault({ backend, onChange: onVaultChange });
  try { await vault.open(); } catch (e) { setMsg(errText(e), true); }
  render();
  if (navigator.storage && navigator.storage.persist) {
    try {
      const accorde = await navigator.storage.persist();
      log('Stockage persistant : ' + (accorde ? 'accordé' : 'non accordé'));
    } catch (e) { log('Demande de stockage persistant impossible'); }
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => log('Mode hors ligne prêt'))
      .catch(e => log('Service worker non enregistré : ' + errText(e)));
  }
}
init();
