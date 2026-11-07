// Mon Patrimoine V5 — espace Finance : état vide, formulaires et conversion des saisies.
// Les règles de validation sont dans validate.js. Ce module ne lit ni n'écrit le coffre.
import { CATS, PTYPES, PER, DEBT_TYPES, INCOME_TYPES, ACATS, PCATS, emptyState, td } from './core.js';
import { validateEntry } from './validate.js';

export const PAIEMENTS = ['Carte bancaire', 'Espèces', 'Virement', 'Prélèvement', 'Autre'];
export const NATURES = ['Indispensable', 'Facultative'];
export const OPERATIONS = ['Versement', 'Retrait'];

// Espace Finance complet. Aucune valeur d'exemple : les listes sont vides.
export function espaceFinanceVide() {
  return {
    inc: [], fix: [], var: [], sav: [], debt: [], goal: [], proj: [], pa: [], snaps: [],
    env: emptyState().env, epTotal: 0, alloc: {}, caps: {}, carry: {}
  };
}

// Complète un espace existant sans écraser ses données (coffre créé en phase 1 : espace vide).
export function completerEspace(f) {
  return { ...espaceFinanceVide(), ...(f || {}) };
}

let compteur = 0;
export function nouvelId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  compteur += 1;
  return 'id' + Date.now().toString(36) + compteur.toString(36) + Math.random().toString(36).slice(2, 8);
}

export const aujourdhui = () => td();

// Spécifications des formulaires. Champs : k (clé), l (libellé), t (text|num|date|sel|chk),
// o (options : tableau de valeurs ou fonction de l'espace), f (facultatif).
export const SPECS = {
  inc: {
    titre: 'Revenu',
    initiales: () => ({ date: aujourdhui(), rec: true, type: 'Salaire' }),
    champs: [
      { k: 'label', l: 'Libellé', t: 'text' },
      { k: 'type', l: 'Type', t: 'sel', o: INCOME_TYPES },
      { k: 'amount', l: 'Montant (DH)', t: 'num' },
      { k: 'date', l: 'Date (ou début si récurrent)', t: 'date' },
      { k: 'rec', l: 'Récurrent chaque mois', t: 'chk' },
      { k: 'end', l: 'Fin éventuelle', t: 'date', f: true }
    ]
  },
  fix: {
    titre: 'Dépense fixe',
    initiales: () => ({ date: aujourdhui(), on: true, freq: 'Mensuelle', cat: 'Logement' }),
    champs: [
      { k: 'label', l: 'Libellé', t: 'text' },
      { k: 'cat', l: 'Catégorie', t: 'sel', o: CATS },
      { k: 'amount', l: 'Montant (DH)', t: 'num' },
      { k: 'freq', l: 'Fréquence', t: 'sel', o: Object.keys(PER) },
      { k: 'date', l: 'Date du 1er paiement', t: 'date' },
      { k: 'on', l: 'Active', t: 'chk' }
    ]
  },
  var: {
    titre: 'Dépense',
    initiales: () => ({ date: aujourdhui(), pay: 'Carte bancaire', ess: 'Indispensable', cat: 'Courses alimentaires' }),
    champs: [
      { k: 'date', l: 'Date', t: 'date' },
      { k: 'amount', l: 'Montant (DH)', t: 'num' },
      { k: 'cat', l: 'Catégorie', t: 'sel', o: CATS },
      { k: 'label', l: 'Description', t: 'text', f: true },
      { k: 'pay', l: 'Moyen de paiement', t: 'sel', o: PAIEMENTS },
      { k: 'ess', l: 'Nature', t: 'sel', o: NATURES },
      { k: 'transfer', l: 'Transfert entre mes comptes (ne compte pas comme dépense)', t: 'chk' }
    ]
  },
  env: {
    titre: 'Enveloppe',
    initiales: () => ({}),
    champs: [
      { k: 'label', l: 'Nom', t: 'text' },
      { k: 'target', l: 'Objectif (DH)', t: 'num', f: true }
    ]
  },
  sav: {
    titre: 'Mouvement d’épargne',
    initiales: (S) => ({ date: aujourdhui(), kind: 'Versement', env: S.env[0] ? S.env[0].id : '' }),
    champs: [
      { k: 'env', l: 'Enveloppe', t: 'sel', o: (S) => S.env.map(e => ({ v: e.id, l: e.label })) },
      { k: 'kind', l: 'Opération', t: 'sel', o: OPERATIONS },
      { k: 'amount', l: 'Montant (DH)', t: 'num' },
      { k: 'date', l: 'Date', t: 'date' }
    ]
  },
  debt: {
    titre: 'Crédit',
    initiales: () => ({ start: aujourdhui(), type: 'Consommation' }),
    champs: [
      { k: 'label', l: 'Nom du crédit', t: 'text' },
      { k: 'type', l: 'Type', t: 'sel', o: DEBT_TYPES },
      { k: 'initial', l: 'Montant emprunté (DH)', t: 'num' },
      { k: 'monthly', l: 'Mensualité (DH)', t: 'num' },
      { k: 'rate', l: 'Taux d’intérêt annuel (%)', t: 'num', f: true },
      { k: 'start', l: 'Date de début', t: 'date' },
      { k: 'end', l: 'Date de fin prévue', t: 'date', f: true },
      { k: 'remaining', l: 'Capital restant dû constaté (information seulement)', t: 'num', f: true }
    ]
  },
  goal: {
    titre: 'Objectif',
    initiales: () => ({}),
    champs: [
      { k: 'label', l: 'Objectif', t: 'text' },
      { k: 'target', l: 'Montant cible (DH)', t: 'num' },
      { k: 'deadline', l: 'Date limite', t: 'date' },
      { k: 'saved', l: 'Déjà épargné (DH)', t: 'num', f: true },
      { k: 'monthly', l: 'Versement mensuel prévu (DH)', t: 'num', f: true }
    ]
  },
  proj: {
    titre: 'Projet',
    initiales: () => ({ type: PTYPES[0] }),
    champs: [
      { k: 'name', l: 'Nom du projet', t: 'text' },
      { k: 'type', l: 'Type de projet', t: 'sel', o: PTYPES },
      { k: 'target', l: 'Montant cible (DH)', t: 'num' },
      { k: 'deadline', l: 'Date de réalisation souhaitée', t: 'date', f: true },
      { k: 'capital', l: 'Capital déjà disponible (DH)', t: 'num', f: true },
      { k: 'monthly', l: 'Versement mensuel prévu (DH)', t: 'num', f: true },
      { k: 'rate', l: 'Rendement annuel estimé (%)', t: 'num', f: true }
    ]
  },
  pa: {
    titre: 'Élément du patrimoine',
    initiales: (S, kind) => ({ kind, cat: kind === 'P' ? PCATS[0] : ACATS[0] }),
    champs: [
      { k: 'label', l: 'Libellé', t: 'text' },
      { k: 'cat', l: 'Catégorie', t: 'sel', o: (vals) => (vals.kind === 'P' ? PCATS : ACATS) },
      { k: 'value', l: 'Valeur actuelle (DH)', t: 'num' }
    ]
  }
};

// Options d'un champ de sélection : chaînes ou { v, l }.
export function optionsDe(champ, valeurs, S) {
  const o = typeof champ.o === 'function' ? champ.o(valeurs, S) : champ.o;
  return o.map(x => (typeof x === 'string' ? { v: x, l: x } : x));
}

// Transforme les valeurs brutes d'un formulaire en données typées.
export function saisieVersDonnees(spec, saisie) {
  const out = {};
  for (const c of spec.champs) {
    const v = saisie[c.k];
    if (c.t === 'chk') out[c.k] = !!v;
    else if (c.t === 'num') out[c.k] = (v === '' || v == null) ? (c.f ? 0 : NaN) : Number(v);
    else out[c.k] = typeof v === 'string' ? v.trim() : (v ?? '');
  }
  return out;
}

// Prépare une saisie : données typées + liste d'erreurs (vide = valide). Ne modifie rien.
// Pour une opération « Retrait », le montant est stocké négatif, comme dans la V4.
export function preparer(kind, saisie, S) {
  const spec = SPECS[kind];
  const d = saisieVersDonnees(spec, saisie);
  if (kind === 'sav') {
    const abs = Math.abs(d.amount);
    const errs = validateEntry('sav', { ...d, amount: abs }, S);
    d.amount = d.kind === 'Retrait' ? -abs : abs;
    return { data: d, errs };
  }
  if (kind === 'pa') d.kind = saisie.kind;
  return { data: d, errs: validateEntry(kind, d, S) };
}

// Valeurs d'un élément existant, présentées dans le formulaire (le retrait redevient positif).
export function valeursPour(kind, item) {
  if (kind === 'sav') return { ...item, kind: item.amount < 0 ? 'Retrait' : 'Versement', amount: Math.abs(item.amount) };
  return { ...item };
}

// Clé de liste de l'espace pour chaque type de saisie (même nom partout).
export const cleDeListe = kind => kind;
