// Mon Patrimoine V5 — briques d'interface partagées. Tout le texte passe par textContent (jamais de HTML construit à partir de chaînes).
import { SPECS, optionsDe, valeursPour } from '../finance/model.js';
import { icone } from './icones.js';

export function el(tag, attrs = {}, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'text') n.textContent = v;
    else if (k === 'class') n.className = v;
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, String(v));
  }
  for (const c of enfants) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}

const fmtDH = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fm = n => fmtDH.format(Number.isFinite(n) ? n : 0) + ' DH';
export const pc = n => (Number.isFinite(n) ? n : 0).toFixed(1).replace('.', ',') + ' %';
export const fd = d => (d ? d.split('-').reverse().join('/') : '—');
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const labM = m => MOIS_COURT[+m.slice(5) - 1] + ' ' + m.slice(2, 4);
export const labL = m => MOIS_LONG[+m.slice(5) - 1] + ' ' + m.slice(0, 4);
export const cls = n => (n < 0 ? 'neg' : 'pos');

// Carte de chiffre clé. hi : mise en avant. opts : { icone, ton } (ton : 'revenu', 'depense', 'epargne', 'dette', 'patrimoine').
export function kpi(libelle, valeur, sous = '', classe = '', hi = false, opts = {}) {
  return el('div', { class: 'k' + (hi ? ' hi' : '') + (opts.ton ? ' ton-' + opts.ton : '') },
    opts.icone ? el('span', { class: 'k-ico', 'aria-hidden': 'true' }, icone(opts.icone, 18)) : null,
    el('small', { text: libelle }),
    el('b', { class: classe, text: valeur }),
    sous ? el('i', { text: sous }) : null);
}

// Barre de progression (largeur en pourcentage, bornée à 0–100).
export function barre(p, depasse = false) {
  const b = el('div', { class: 'pb' + (depasse ? ' over' : '') });
  const i = el('i');
  i.style.width = Math.min(100, Math.max(0, Number.isFinite(p) ? p : 0)) + '%';
  b.append(i);
  return b;
}

// Tableau. entetes : chaînes, ou { t, n } pour une colonne numérique. foot : ligne de total (facultative).
export function tableau(entetes, lignes, pied = null, vide = 'Aucune donnée pour le moment.') {
  const colNum = entetes.map(e => (typeof e === 'object' ? !!e.n : false));
  const txt = e => (typeof e === 'object' ? e.t : e);
  // data-label : libellé de colonne affiché devant chaque valeur sur petit écran (tableau en cartes).
  const cellule = (c, i, tag = 'td') => {
    const etiquette = txt(entetes[i]) || '';
    const classes = [colNum[i] ? 'n' : '', etiquette ? '' : 'act'].join(' ').trim();
    return el(tag, { class: classes, 'data-label': tag === 'td' && etiquette ? etiquette : null },
      (c instanceof Node) ? c : (c == null ? '' : String(c)));
  };
  const corps = lignes.length
    ? lignes.map(l => el('tr', {}, ...l.map((c, i) => cellule(c, i))))
    : [el('tr', {}, el('td', { colspan: entetes.length, class: 'petit', text: vide }))];
  return el('div', { class: 'tw' },
    el('table', {},
      el('thead', {}, el('tr', {}, ...entetes.map((e, i) => cellule(txt(e), i, 'th')))),
      el('tbody', {}, ...corps),
      pied ? el('tfoot', {}, el('tr', {}, ...pied.map((c, i) => cellule(c, i)))) : null));
}

// Bouton. Les boutons « danger » demandent une seconde confirmation (géré par l'appelant).
export function bouton(texte, action, opts = {}) {
  return el('button', { type: 'button', class: [opts.primaire ? 'primary' : '', opts.danger ? 'danger' : ''].join(' ').trim(), onclick: action, text: texte });
}

// Formulaire généré à partir de SPECS[kind].
// valeurs : valeurs initiales (déjà converties) ; onValider(saisie) ; onAnnuler() ; S : espace Finance.
export function formulaire(kind, valeurs, S, { onValider, onAnnuler, titre }) {
  const spec = SPECS[kind];
  const inputs = {};
  const lignes = spec.champs.map(c => {
    const v = valeurs[c.k];
    const id = `f-${kind}-${c.k}`;
    if (c.t === 'sel') {
      const s = el('select', { id, name: c.k }, ...optionsDe(c, valeurs, S).map(o =>
        el('option', { value: o.v, text: o.l, selected: String(o.v) === String(v) })));
      inputs[c.k] = s;
      return el('label', {}, el('span', { text: c.l + (c.f ? ' (facultatif)' : '') }), s);
    }
    if (c.t === 'chk') {
      const i = el('input', { id, type: 'checkbox', name: c.k, checked: !!v });
      inputs[c.k] = i;
      return el('label', { class: 'chk' }, i, el('span', { text: c.l }));
    }
    const i = el('input', {
      id, name: c.k,
      type: c.t === 'num' ? 'number' : c.t === 'date' ? 'date' : 'text',
      inputmode: c.t === 'num' ? 'decimal' : null,
      step: c.t === 'num' ? '0.01' : null, min: c.t === 'num' ? '0' : null,
      value: v == null || Number.isNaN(v) ? '' : String(v)
    });
    inputs[c.k] = i;
    return el('label', {}, el('span', { text: c.l + (c.f ? ' (facultatif)' : '') }), i);
  });
  const erreurs = el('div', { class: 'alert', role: 'alert', hidden: true });
  const form = el('form', {
    class: 'form-saisie', novalidate: true,
    onsubmit: e => {
      e.preventDefault();
      const saisie = {};
      for (const c of spec.champs) {
        const i = inputs[c.k];
        saisie[c.k] = c.t === 'chk' ? i.checked : i.value;
      }
      saisie.kind = valeurs.kind;
      onValider(saisie, (msgs) => { erreurs.hidden = false; erreurs.replaceChildren(...msgs.map(m => el('div', { text: m }))); });
    }
  },
    el('h3', { text: titre || spec.titre }),
    ...lignes, erreurs,
    el('div', { class: 'row' },
      el('button', { type: 'submit', class: 'primary', text: 'Enregistrer' }),
      bouton('Annuler', onAnnuler)));
  return form;
}

export { SPECS, valeursPour };

// Sélecteur de mois ou de date commun à toutes les rubriques (et à la retraite).
// Pendant la saisie (défilement de la roue iOS, navigation entre mois et années), on ne rafraîchit RIEN :
// la valeur est seulement retenue. Elle n'est appliquée qu'une fois la sélection terminée :
// sortie du champ, touche Entrée, ou bouton « Appliquer ». Seule cette application relance le calcul.
// valeur : valeur courante (AAAA-MM pour un mois, AAAA-MM-JJ pour une date) ; onValider(nouvelleValeur).
export function champPeriode({ type = 'month', valeur, libelle, onValider }) {
  let enAttente = valeur;
  let applique = valeur;
  const champ = el('input', { type, value: valeur || '', 'aria-label': libelle, class: 'champ-periode' });
  const appliquer = () => {
    if (enAttente === applique) return;
    applique = enAttente;
    onValider(enAttente);
  };
  // Ces événements ne font que retenir la valeur : aucun rafraîchissement.
  champ.addEventListener('input', e => { enAttente = e.target.value; });
  champ.addEventListener('change', e => { enAttente = e.target.value; });
  champ.addEventListener('blur', appliquer);
  champ.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); appliquer(); } });
  const bouton = el('button', { type: 'button', class: 'petit-bouton', text: 'Appliquer', onclick: appliquer });
  return el('span', { class: 'champ-periode-wrap' }, champ, bouton);
}
