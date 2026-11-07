// Mon Patrimoine V5 — rubriques financières (phase 2).
// Calculs : finance/core.js (moteur validé). Contrôles : finance/validate.js. Saisies : finance/model.js.
// Chaque modification passe par ctx.enregistrer(fn) : fn reçoit l'espace Finance en brouillon.
import * as C from '../finance/core.js';
import { envelopeMovementsCount, coherence } from '../finance/validate.js';
import { SPECS, preparer, valeursPour, nouvelId, aujourdhui, NATURES } from '../finance/model.js';
import { courbe, barres, horizontal, anneau } from '../charts/svg.js';
import { el, fm, pc, fd, labM, labL, cls, kpi, barre, tableau, bouton, formulaire, champPeriode } from './ui.js';
import { icone, iconeCategorie } from './icones.js';

const ui = {
  mois: null, periode: 'Mois', moisRapport: null,
  edition: null,            // { kind, id, pre }
  confirmation: null,       // 'kind:id' en attente de confirmation de suppression
  filtres: { q: '', cat: '', ess: '', mois: '' },
  projet: null
};
let ctx = null;             // { F, enregistrer(fn), rerender() }

const moisCourant = () => aujourdhui().slice(0, 7);
const moisAffiche = () => ui.mois || moisCourant();

// ----- point d'entrée -----
export function rendreFinance(id, c) {
  ctx = c;
  const F = ctx.F;
  switch (id) {
    case 'tableau': return vueTableau(F);
    case 'budget': return vueBudget(F);
    case 'revenus': return vueRevenus(F);
    case 'depenses-fixes': return vueFixes(F);
    case 'depenses-variables': return vueVariables(F);
    case 'epargne': return vueEpargne(F);
    case 'dettes': return vueDettes(F);
    case 'objectifs': return vueObjectifs(F);
    case 'projets': return vueProjets(F);
    case 'patrimoine': return vuePatrimoine(F);
    case 'rapports': return vueRapports(F);
    default: return el('p', { text: 'Rubrique inconnue.' });
  }
}

// ----- briques communes -----
function entete(titre, ...actions) {
  return el('div', { class: 'bar' }, el('h2', { text: titre }), el('span', { class: 'sp' }), ...actions);
}
function selecteurMois(valeur, onChange) {
  return champPeriode({ type: 'month', valeur, libelle: 'Mois', onValider: v => onChange(v || valeur) });
}
function ouvrir(kind, id = null, pre = null) {
  ui.edition = { kind, id, pre };
  ui.confirmation = null;
  ctx.rerender();
  setTimeout(() => { const n = document.getElementById('edition'); if (n) n.scrollIntoView({ block: 'center' }); }, 0);
}
function fermerEdition() { ui.edition = null; ctx.rerender(); }

// Formulaire d'ajout ou de modification d'un élément de la liste « kind ».
function carteFormulaire(kind) {
  const ed = ui.edition;
  if (!ed || ed.kind !== kind) return null;
  const F = ctx.F;
  const item = ed.id ? (F[kind] || []).find(x => x.id === ed.id) : null;
  const valeurs = item ? valeursPour(kind, item) : { ...SPECS[kind].initiales(F, ed.pre && ed.pre.kind), ...(ed.pre || {}) };
  const form = formulaire(kind, valeurs, F, {
    titre: (item ? 'Modifier — ' : 'Ajouter — ') + SPECS[kind].titre,
    onAnnuler: fermerEdition,
    onValider: (saisie, afficherErreurs) => {
      const { data, errs } = preparer(kind, saisie, F);
      if (errs.length) return afficherErreurs(errs);
      ui.edition = null;
      ctx.enregistrer(espace => {
        const liste = espace[kind];
        if (item) {
          const i = liste.findIndex(x => x.id === item.id);
          if (i >= 0) liste[i] = { ...liste[i], ...data, id: item.id };
        } else liste.push({ ...data, id: nouvelId() });
      });
    }
  });
  return el('section', { class: 'card', id: 'edition' }, form);
}

// Boutons d'une ligne : Modifier, Supprimer (avec confirmation). Refus si une enveloppe contient des mouvements.
function actionsLigne(kind, id, extra = []) {
  const cle = kind + ':' + id;
  let suppression;
  if (kind === 'env' && envelopeMovementsCount(ctx.F, id) > 0) {
    suppression = el('span', { class: 'petit', text: 'Supprimez d’abord ses mouvements.' });
  } else if (ui.confirmation === cle) {
    suppression = bouton('Confirmer la suppression', () => {
      ui.confirmation = null;
      ctx.enregistrer(espace => { espace[kind] = espace[kind].filter(x => x.id !== id); });
    }, { danger: true });
  } else {
    suppression = bouton('Supprimer', () => { ui.confirmation = cle; ctx.rerender(); }, { danger: true });
  }
  return el('div', { class: 'actions' }, ...extra, bouton('Modifier', () => ouvrir(kind, id)), suppression);
}

function alerteDepassements(ov) {
  if (!ov.length) return null;
  return el('div', { class: 'alert', role: 'status' },
    el('b', { text: `⚠ ${ov.length} plafond${ov.length > 1 ? 's' : ''} dépassé${ov.length > 1 ? 's' : ''} ce mois-ci` }),
    el('div', { text: ov.map(x => `${x.c} : +${fm(x.s - x.e)}`).join(' · ') }));
}

function avertissements(F, m) {
  const items = coherence(F, m);
  if (!items.length) return null;
  return el('div', { class: 'card' }, el('h3', { text: 'Contrôles de cohérence' }),
    el('ul', { class: 'liste' }, ...items.map(i => el('li', { class: i.level === 'warn' ? 'neg' : 'petit', text: i.text }))));
}

// Champ numérique qui enregistre à la sortie (onchange).
function champNombre(valeur, onChange, label) {
  return el('input', {
    type: 'number', min: '0', step: '0.01', inputmode: 'decimal', value: valeur ? String(valeur) : '',
    'aria-label': label, class: 'petit-champ', onchange: e => onChange(e.target.value === '' ? 0 : Number(e.target.value))
  });
}

// ----- Revenus -----
function vueRevenus(F) {
  const cur = moisCourant();
  const primes = C.sum(F.inc.filter(i => i.type === 'Prime annuelle' && i.date.slice(0, 4) === cur.slice(0, 4)));
  const liste = [...F.inc].sort((a, b) => b.date.localeCompare(a.date)).map(i => [
    fd(i.date), i.label, i.type, fm(i.amount), i.rec ? 'Chaque mois' + (i.end ? ' jusqu’au ' + fd(i.end) : '') : 'Ponctuel',
    actionsLigne('inc', i.id)
  ]);
  return el('div', {},
    entete('Revenus', bouton('+ Ajouter', () => ouvrir('inc'), { primaire: true })),
    carteFormulaire('inc'),
    el('div', { class: 'grille' },
      kpi('Revenus du mois en cours', fm(C.calc(F, cur).inc)),
      kpi('Total des primes (année en cours)', fm(primes))),
    el('p', { class: 'petit', text: 'Un revenu récurrent est compté chaque mois depuis sa date de début ; une prime ou un revenu ponctuel n’est compté que dans le mois de sa date. Les transferts entre mes comptes ne sont pas des revenus.' }),
    el('section', { class: 'card' }, tableau(['Date', 'Libellé', 'Type', { t: 'Montant', n: true }, 'Récurrence', ''], liste)));
}

// ----- Dépenses fixes -----
function vueFixes(F) {
  const cur = moisCourant();
  const actives = F.fix.filter(f => f.on);
  const mensuel = C.sum(actives.map(f => ({ amount: f.amount / C.PER[f.freq] })));
  const credits = C.sum(C.debtDueL(F, cur));
  const liste = F.fix.map(f => [
    f.label, f.cat, fm(f.amount), f.freq, 'Le ' + f.date.slice(8) + ' (dès ' + labM(f.date.slice(0, 7)) + ')',
    f.on ? el('span', { class: 'tag pos', text: 'Active' }) : el('span', { class: 'tag', text: 'Désactivée' }),
    actionsLigne('fix', f.id, [bouton(f.on ? 'Désactiver' : 'Activer', () => ctx.enregistrer(espace => {
      const x = espace.fix.find(y => y.id === f.id); if (x) x.on = !x.on;
    }))])
  ]);
  return el('div', {},
    entete('Dépenses fixes', bouton('+ Ajouter', () => ouvrir('fix'), { primaire: true })),
    carteFormulaire('fix'),
    el('div', { class: 'grille' },
      kpi('Charges fixes mensualisées', fm(mensuel), 'Dépenses fixes actives'),
      kpi('Mensualités de crédits ce mois', fm(credits), 'Calculées par l’échéancier de « Dettes »')),
    el('section', { class: 'card' }, tableau(['Libellé', 'Catégorie', { t: 'Montant', n: true }, 'Fréquence', 'Paiement', 'Statut', ''], liste)));
}

// ----- Dépenses variables -----
function vueVariables(F) {
  const f = ui.filtres;
  const q = f.q.toLowerCase();
  const rows = F.var.filter(v =>
    (!f.mois || C.ym(v.date) === f.mois) && (!f.cat || v.cat === f.cat) && (!f.ess || v.ess === f.ess) &&
    (!q || (`${v.label || ''} ${v.cat} ${v.pay}`).toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const dep = rows.filter(x => !x.transfer);
  const lignes = rows.map(v => [
    fd(v.date),
    el('span', { class: 'lib-cat' }, icone(iconeCategorie(v.cat), 16), el('span', {}, v.label || '—'), v.transfer ? el('span', { class: 'tag', text: 'Transfert interne' }) : null),
    v.cat, v.pay, v.ess, fm(v.amount), actionsLigne('var', v.id)
  ]);
  const filtres = el('div', { class: 'filtres' },
    el('input', { type: 'search', placeholder: 'Rechercher…', value: f.q, 'aria-label': 'Rechercher', onchange: e => { f.q = e.target.value; ctx.rerender(); } }),
    el('select', { 'aria-label': 'Catégorie', onchange: e => { f.cat = e.target.value; ctx.rerender(); } },
      el('option', { value: '', text: 'Toutes catégories' }),
      ...C.CATS.map(c => el('option', { value: c, text: c, selected: c === f.cat }))),
    el('select', { 'aria-label': 'Nature', onchange: e => { f.ess = e.target.value; ctx.rerender(); } },
      el('option', { value: '', text: 'Toutes natures' }),
      ...NATURES.map(c => el('option', { value: c, text: c, selected: c === f.ess }))),
    champPeriode({ type: 'month', valeur: f.mois, libelle: 'Mois des dépenses', onValider: v => { f.mois = v; ctx.rerender(); } }));
  return el('div', {},
    entete('Dépenses variables', bouton('+ Ajouter', () => ouvrir('var'), { primaire: true })),
    carteFormulaire('var'),
    filtres,
    el('div', { class: 'grille' },
      kpi('Total filtré (hors transferts)', fm(C.sum(dep)), dep.length + ' dépense(s)'),
      kpi('Indispensables', fm(C.sum(dep.filter(x => x.ess === 'Indispensable')))),
      kpi('Facultatives', fm(C.sum(dep.filter(x => x.ess === 'Facultative')))),
      kpi('Transferts internes', fm(C.sum(rows.filter(x => x.transfer))), 'Non comptés comme dépenses')),
    el('section', { class: 'card' }, tableau(['Date', 'Description', 'Catégorie', 'Paiement', 'Nature', { t: 'Montant', n: true }, ''], lignes)));
}

// ----- Budget mensuel -----
function vueBudget(F) {
  const m = moisAffiche();
  const c = C.calc(F, m), ci = C.capInfo(F, m), sp = C.spentMap(F, m);
  const I = {}; ci.forEach(x => { I[x.c] = x; });
  const totCap = C.CATS.reduce((a, x) => a + (+F.caps[x] || 0), 0);
  const etapes = [
    ['1. Revenus totaux', fm(c.inc), 'Salaires, primes et revenus du mois'],
    ['2. − Charges fixes', fm(c.F), `${c.fx.length} dépense(s) fixe(s) active(s)`],
    ['3. − Remboursements de crédits', fm(c.D), `${c.db.length} échéance(s) de crédit`],
    ['4. − Dépenses variables enregistrées', fm(c.V), `${c.vr.length} dépense(s)`],
    ['5. = Montant réellement disponible', el('b', { class: cls(c.disp), text: fm(c.disp) }), ''],
    ['6. − Épargne affectée ce mois', champNombre(c.A, v => ctx.enregistrer(e => { e.alloc[m] = v; }), 'Épargne affectée ce mois'), `Épargne réalisée : ${fm(c.sv)}`],
    ['7. = Reste à vivre', el('b', { class: cls(c.rav), text: fm(c.rav) }), 'Budget restant pour le mois']
  ];
  const lignes = C.CATS.map(k => {
    const cap = +F.caps[k] || 0, x = I[k], s = sp[k] || 0;
    return [
      k,
      champNombre(cap, v => ctx.enregistrer(e => { if (v > 0) e.caps[k] = v; else delete e.caps[k]; }), 'Plafond ' + k),
      el('input', { type: 'checkbox', checked: !!F.carry[k], 'aria-label': 'Report ' + k, onchange: e => ctx.enregistrer(en => { if (e.target.checked) en.carry[k] = true; else delete en.carry[k]; }) }),
      x ? fm(x.ci) : '—', x ? fm(x.e) : '—', fm(s),
      x ? el('span', { class: cls(x.rest), text: fm(x.rest) }) : '—',
      x ? barre(x.e ? s / x.e * 100 : 0, x.over) : '—'
    ];
  });
  const ov = ci.filter(x => x.over);
  return el('div', {},
    entete('Budget mensuel', selecteurMois(m, v => { ui.mois = v; ctx.rerender(); })),
    alerteDepassements(ov),
    el('div', { class: 'grille' },
      kpi('Revenus totaux', fm(c.inc)), kpi('Charges fixes', fm(c.F)), kpi('Charges variables', fm(c.V)),
      kpi('Remboursements', fm(c.D)), kpi('Épargne réalisée', fm(c.sv), 'Versements − retraits du mois'),
      kpi('Reste à vivre', fm(c.rav), 'Budget restant pour le mois', cls(c.rav), true)),
    el('section', { class: 'card' }, el('h3', { text: 'Déroulé du mois' }), tableau(['Étape', { t: 'Montant', n: true }, 'Détail'], etapes)),
    el('section', { class: 'card' },
      el('h3', { text: 'Budget prévisionnel par catégorie' }),
      el('p', { class: 'petit', text: 'Saisissez un plafond mensuel. Si « Report » est coché, le plafond non consommé s’ajoute au plafond du mois suivant. Le report ne modifie pas le reste à vivre.' }),
      tableau(['Catégorie', { t: 'Plafond', n: true }, 'Report', { t: 'Report entrant', n: true }, { t: 'Plafond effectif', n: true }, { t: 'Réel', n: true }, { t: 'Restant', n: true }, 'Suivi'], lignes,
        ['Total', fm(totCap), '', '', '', fm(c.exp), '', '']),
      el('p', {}, 'Budget prévisionnel total : ', el('b', { text: fm(totCap) }), ' · Écart : ', el('b', { class: cls(totCap - c.exp), text: fm(totCap - c.exp) })),
      totCap ? null : el('p', { class: 'petit', text: 'Aucun plafond défini pour le moment.' })),
    ci.length ? horizontal({ titre: 'Plafonds : prévu et réel', rows: ci.map(x => ({ label: x.c, value: x.s, max: x.e, over: x.over })) }) : null,
    avertissements(F, m));
}

// ----- Tableau de bord -----
function vueTableau(F) {
  const m = moisAffiche(), cur = moisCourant();
  const c = C.calc(F, m), ci = C.capInfo(F, m), ov = ci.filter(x => x.over);
  const jour = +aujourdhui().slice(8);
  const reste = m === cur ? C.sum(c.fx.concat(c.db).filter(x => x.day > jour)) : m > cur ? c.F + c.D : 0;
  const salaire = C.sum(C.incL(F, m).filter(i => i.type === 'Salaire'));
  const transferts = C.sum(F.var.filter(v => C.ym(v.date) === m && v.transfer));
  const t = C.patTotals(F, m);
  const mois12 = C.rows12(m).map(x => C.calc(F, x));
  return el('div', {},
    entete('Tableau de bord', selecteurMois(m, v => { ui.mois = v; ctx.rerender(); })),
    alerteDepassements(ov),
    el('h3', { class: 'bloc-titre', text: 'Flux du mois' }),
    el('div', { class: 'grille' },
      kpi('Salaire net mensuel', fm(salaire), '', '', false, { icone: 'trending-up', ton: 'revenu' }),
      kpi('Revenus totaux', fm(c.inc), '', '', false, { icone: 'wallet', ton: 'revenu' }),
      kpi('Dépenses du mois', fm(c.exp), 'Fixes + crédits + variables', '', false, { icone: 'receipt', ton: 'depense' }),
      kpi('Dépenses fixes restantes', fm(reste), m === cur ? 'Après aujourd’hui' : '', '', false, { icone: 'receipt', ton: 'depense' }),
      kpi('Dépenses variables', fm(c.V), '', '', false, { icone: 'shopping-cart', ton: 'depense' }),
      kpi('Montant disponible', fm(c.disp), 'Après fixes, crédits et variables', cls(c.disp), false, { icone: 'wallet' }),
      kpi('Épargne réalisée', fm(c.sv), '', '', false, { icone: 'piggy-bank', ton: 'epargne' }),
      kpi('Taux d’épargne', pc(c.inc ? c.sv / c.inc * 100 : 0), '', '', false, { icone: 'piggy-bank', ton: 'epargne' }),
      kpi('Reste à vivre', fm(c.rav), 'Disponible − épargne affectée', cls(c.rav), false, { icone: 'target' }),
      kpi('Transferts internes', fm(transferts), 'Exclus des dépenses', '', false, { icone: 'tag' })),
    el('h3', { class: 'bloc-titre', text: 'Patrimoine et dettes' }),
    el('div', { class: 'grille' },
      kpi('Patrimoine net', fm(t.net), 'Actifs − passifs', cls(t.net), true, { icone: 'landmark', ton: 'patrimoine' }),
      kpi('Dettes restantes', fm(C.debtsLeft(F, m)), '', '', false, { icone: 'credit-card', ton: 'dette' })),
    el('section', { class: 'card' }, barres({
      titre: 'Revenus, dépenses et épargne — 12 mois', labels: C.rows12(m).map(labM),
      series: [
        { name: 'Revenus', color: '#1d3557', values: mois12.map(x => x.inc) },
        { name: 'Dépenses', color: '#b42318', values: mois12.map(x => x.exp) },
        { name: 'Épargne', color: '#15803d', values: mois12.map(x => x.sv) }]
    })),
    el('section', { class: 'card' }, el('h3', { text: 'Dépenses par catégorie' }),
      anneau({ titre: 'Dépenses par catégorie', items: C.catTot(F, [m]).map(([label, value]) => ({ label, value })), vide: 'Aucune dépense ce mois-ci.' })),
    avertissements(F, m));
}

// ----- Épargne -----
function vueEpargne(F) {
  const m = moisAffiche();
  const total = C.sum(F.sav);
  const cartes = F.env.map(e => {
    const b = C.sum(F.sav.filter(s => s.env === e.id)), p = e.target ? b / e.target * 100 : 0;
    return el('section', { class: 'card' },
      el('h3', { text: e.label }),
      el('b', { class: 'gros', text: fm(b) }),
      e.target ? el('div', {}, barre(p), el('small', { class: 'petit', text: `${pc(p)} de ${fm(e.target)}` })) : el('p', { class: 'petit', text: 'Aucun objectif défini' }),
      el('div', { class: 'actions' },
        bouton('Versement / retrait', () => ouvrir('sav', null, { env: e.id, kind: 'Versement' })),
        actionsLigne('env', e.id)));
  });
  return el('div', {},
    entete('Épargne', bouton('+ Enveloppe', () => ouvrir('env'), { primaire: false }), bouton('+ Mouvement', () => ouvrir('sav'), { primaire: true })),
    carteFormulaire('env'), carteFormulaire('sav'),
    el('div', { class: 'grille' }, kpi('Épargne totale', fm(total)), kpi('Épargne ce mois', fm(C.calc(F, m).sv))),
    el('div', { class: 'grille-2' }, ...cartes),
    el('section', { class: 'card' }, el('h3', { text: 'Mouvements' }),
      tableau(['Date', 'Enveloppe', 'Opération', { t: 'Montant', n: true }, ''],
        [...F.sav].sort((a, b) => b.date.localeCompare(a.date)).map(s => [
          fd(s.date),
          (F.env.find(e => e.id === s.env) || { label: '—' }).label,
          s.amount < 0 ? 'Retrait' : 'Versement',
          el('span', { class: cls(s.amount), text: fm(s.amount) }),
          actionsLigne('sav', s.id)
        ]))));
}

// ----- Dettes : échéancier réel (amortissement) -----
function vueDettes(F) {
  const m = moisAffiche();
  const c = C.calc(F, m);
  const cartes = F.debt.map(d => {
    const solde = C.debtBalanceAt(d, m), sc = C.debtSchedule(d);
    const p = d.initial ? (d.initial - solde) / d.initial * 100 : 0;
    const restantes = sc.rows.filter(r => r.m >= m).length;
    return el('section', { class: 'card' },
      el('h3', {}, d.label, ' ', el('span', { class: 'tag', text: d.type })),
      barre(p),
      el('small', { class: 'petit', text: `${pc(p)} remboursé` }),
      el('p', {},
        'Capital restant dû : ', el('b', { text: fm(solde) }), ' sur ', fm(d.initial), el('br'),
        'Mensualité : ' + fm(d.monthly) + ' · Taux : ' + pc(+d.rate || 0), el('br'),
        'Du ' + fd(d.start) + (d.end ? ' au ' + fd(d.end) : ''), el('br'),
        'Intérêts totaux prévus : ', el('b', { text: fm(sc.totalInterest) }), el('br'),
        'Dernière échéance calculée : ', el('b', { text: sc.payoffM ? labL(sc.payoffM) : '—' }), el('br'),
        'Échéances restantes : ', el('b', { text: String(restantes) })),
      d.remaining ? el('p', { class: 'petit', text: `Capital restant constaté (saisi, information seulement) : ${fm(+d.remaining)}` }) : null,
      ...sc.warnings.map(w => el('p', { class: 'alert', text: w })),
      actionsLigne('debt', d.id));
  });
  return el('div', {},
    entete('Dettes', bouton('+ Ajouter', () => ouvrir('debt'), { primaire: true })),
    carteFormulaire('debt'),
    el('div', { class: 'grille' },
      kpi('Capital restant dû (ce mois)', fm(C.debtsLeft(F, m))),
      kpi('Mensualités ce mois', fm(C.sum(C.debtDueL(F, m)))),
      kpi('Intérêts ce mois', fm(c.interest))),
    el('div', { class: 'grille-2' }, ...(cartes.length ? cartes : [el('p', { class: 'petit', text: 'Aucun crédit enregistré.' })])));
}

// ----- Objectifs -----
function vueObjectifs(F) {
  const m = moisAffiche();
  const cartes = F.goal.map(g => {
    const i = C.goalInfo(g, m);
    return el('section', { class: 'card' },
      el('h3', {}, g.label, ' ', el('span', { class: 'tag ' + (i.ok ? 'pos' : 'neg'), text: i.status })),
      barre(i.p),
      el('small', { class: 'petit', text: `${pc(i.p)} · ${fm(+g.saved || 0)} / ${fm(g.target)}` }),
      el('p', {},
        'Échéance : ' + fd(g.deadline) + ' (' + Math.max(0, C.mi(g.deadline.slice(0, 7)) - C.mi(m)) + ' mois)', el('br'),
        'Versement prévu : ' + fm(+g.monthly || 0) + ' / mois', el('br'),
        'Versement nécessaire : ', el('b', { text: fm(i.need) }), ' / mois',
        i.pj ? el('span', {}, el('br'), 'Date estimée : ' + labL(i.pj)) : null),
      actionsLigne('goal', g.id));
  });
  return el('div', {},
    entete('Objectifs financiers', bouton('+ Ajouter', () => ouvrir('goal'), { primaire: true })),
    carteFormulaire('goal'),
    el('div', { class: 'grille-2' }, ...(cartes.length ? cartes : [el('p', { class: 'petit', text: 'Aucun objectif défini.' })])));
}

// ----- Projets (distincts des objectifs) -----
function vueProjets(F) {
  const m = moisAffiche();
  const infos = F.proj.map(p => ({ p, i: C.projInfo(p, m) }));
  const sel = F.proj.find(p => p.id === ui.projet) || F.proj[0] || null;
  const reste = C.sum(infos.map(x => ({ amount: x.i.rem })));
  const mensuel = C.sum(F.proj, 'monthly');
  const suggestion = C.distribute(F, m);
  const cartes = infos.map(({ p, i }) => el('section', { class: 'card' },
    el('h3', {}, p.name, ' ', el('span', { class: 'tag', text: p.type }), ' ',
      el('span', { class: 'tag ' + (i.rem === 0 || i.on ? 'pos' : 'over'), text: i.rem === 0 ? 'Atteint' : i.on ? 'En bonne voie' : (i.n !== null && i.n <= 0 ? 'Échéance dépassée' : 'En retard') })),
    barre(i.prog),
    el('small', { class: 'petit', text: `${pc(i.prog)} · ${fm(+p.capital || 0)} / ${fm(p.target)}` }),
    el('p', {},
      'Reste à constituer : ', el('b', { text: fm(i.rem) }), el('br'),
      'Versement mensuel prévu : ' + fm(+p.monthly || 0), p.rate ? el('span', {}, el('br'), 'Rendement estimé : ' + pc(+p.rate) + ' / an') : null, el('br'),
      'Date souhaitée : ' + fd(p.deadline) + (i.n !== null ? ` (${i.n} mois)` : ''), el('br'),
      'Date estimée au rythme prévu : ' + (i.est ? labL(i.est) : (i.rem === 0 ? '—' : 'Jamais (versement nul)')),
      i.nm !== null && i.rem > 0 ? el('span', {}, el('br'), 'Versement nécessaire pour l’échéance : ', el('b', { text: i.nm === Infinity ? 'échéance passée' : fm(i.nm) }), ' / mois') : null),
    actionsLigne('proj', p.id)));
  const lignesRep = infos.map(({ p, i }, k) => [
    p.name, fm(i.rem), pc(reste ? i.rem / reste * 100 : 0), fm(+p.monthly || 0), fm(suggestion[k])
  ]);
  const gap = (+F.epTotal || 0) - mensuel;
  const projection = sel ? projectionProjet(sel, m) : null;
  return el('div', {},
    entete('Projets d’épargne', bouton('+ Projet', () => ouvrir('proj'), { primaire: true })),
    carteFormulaire('proj'),
    el('div', { class: 'grille' },
      kpi('Projets en cours', String(F.proj.length)),
      kpi('Montant cible total', fm(C.sum(F.proj, 'target'))),
      kpi('Capital disponible', fm(C.sum(F.proj, 'capital'))),
      kpi('Reste à constituer', fm(reste)),
      kpi('Versements mensuels prévus', fm(mensuel)),
      kpi('Épargne affectée ce mois', fm(C.calc(F, m).A), 'Module Budget mensuel')),
    F.proj.length ? null : el('section', { class: 'card' }, el('p', { class: 'petit', text: 'Ajoutez un projet : fonds de sécurité, terrain, villa, patrimoine immobilier, retraite, investissements…' })),
    el('div', { class: 'grille-2' }, ...cartes),
    el('section', { class: 'card' },
      el('h3', { text: 'Répartition de l’épargne entre les projets' }),
      el('p', { class: 'petit', text: 'Indiquez le montant mensuel à répartir. Il est partagé proportionnellement au reste à constituer ; les projets atteints ne reçoivent rien.' }),
      el('div', { class: 'row' },
        el('label', {}, el('span', { text: 'Épargne mensuelle à répartir (DH)' }),
          champNombre(F.epTotal, v => ctx.enregistrer(e => { e.epTotal = v; }), 'Épargne mensuelle à répartir'))),
      el('div', { class: 'row' }, bouton('Répartir', () => ctx.enregistrer(e => {
        const parts = C.distribute(e, m);
        e.proj.forEach((p, k) => { p.monthly = parts[k]; });
      }), { primaire: true })),
      tableau(['Projet', { t: 'Reste', n: true }, { t: 'Part du reste', n: true }, { t: 'Versement actuel', n: true }, { t: 'Répartition suggérée', n: true }], lignesRep,
        ['Total', fm(reste), pc(reste ? 100 : 0), fm(mensuel), fm(C.sum(suggestion))]),
      ecartRepartition(F.epTotal, gap)),
    el('section', { class: 'card' }, el('h3', { text: 'Projection du capital d’un projet' }),
      F.proj.length ? el('div', {},
        el('select', { 'aria-label': 'Projet à projeter', onchange: e => { ui.projet = e.target.value; ctx.rerender(); } },
          ...F.proj.map(p => el('option', { value: p.id, text: p.name, selected: sel && p.id === sel.id }))),
        projection) : el('p', { class: 'petit', text: 'Aucun projet pour le moment.' })));
}

function ecartRepartition(epTotal, gap) {
  if (!epTotal) return null;
  if (Math.abs(gap) < 0.005) return el('div', { class: 'ok', text: 'La répartition correspond exactement à l’épargne mensuelle à répartir.' });
  return el('div', { class: 'alert', text: `Écart : ${fm(Math.abs(gap))} ${gap > 0 ? 'non affectés à un projet' : 'de plus que l’épargne à répartir'}.` });
}

function projectionProjet(p, m) {
  const i = C.projInfo(p, m);
  const H = Math.min(240, Math.max(12, i.n > 0 ? i.n : 0, i.reach || 0));
  const s = C.simulate(p.capital, p.monthly, p.rate, H, null);
  const labels = s.map((_, k) => labM(C.im(C.mi(m) + k)));
  return courbe({
    titre: 'Capital projeté : ' + p.name, labels,
    series: [
      { name: 'Capital projeté', color: '#1d3557', values: s },
      { name: 'Objectif', color: '#b8892e', values: s.map(() => +p.target || 0) }]
  });
}

// ----- Patrimoine -----
function vuePatrimoine(F) {
  const m = moisAffiche();
  const t = C.patTotals(F, m);
  const prev = F.snaps.filter(s => s.m < m).slice(-1)[0];
  const variation = prev ? t.net - prev.n : null;
  const ordre = C.AORDER;
  const lignesA = ordre.flatMap(cat => t.L.A.filter(x => x.cat === cat).map(x => [
    x.label, cat, fm(x.value), x.auto ? el('span', { class: 'tag', text: 'Automatique' }) : actionsLigne('pa', x.id)
  ]));
  const lignesP = t.L.P.map(x => [
    x.label, x.cat, fm(x.value), x.auto ? el('span', { class: 'tag', text: 'Automatique' }) : actionsLigne('pa', x.id)
  ]);
  const catA = ordre.map(cat => ({ label: cat, value: C.sum(t.L.A.filter(x => x.cat === cat)) })).filter(x => x.value > 0);
  return el('div', {},
    entete('Patrimoine personnel',
      bouton('+ Actif', () => ouvrir('pa', null, { kind: 'A' }), { primaire: true }),
      bouton('+ Passif', () => ouvrir('pa', null, { kind: 'P' }))),
    carteFormulaire('pa'),
    el('div', { class: 'grille' },
      kpi('Total des actifs', fm(t.ta)),
      kpi('Total des passifs', fm(t.tp)),
      kpi('Patrimoine net', fm(t.net), 'Total des actifs − total des passifs', cls(t.net), true),
      kpi('Variation depuis le mois précédent', variation === null ? '—' : fm(variation), prev ? 'Référence : ' + labL(prev.m) : 'Aucun mois précédent', variation === null ? '' : cls(variation))),
    el('section', { class: 'card' }, el('h3', { text: 'Actifs' }), tableau(['Libellé', 'Catégorie', { t: 'Valeur', n: true }, ''], lignesA)),
    el('section', { class: 'card' }, el('h3', { text: 'Passifs' }), tableau(['Libellé', 'Catégorie', { t: 'Montant restant dû', n: true }, ''], lignesP),
      el('p', { class: 'petit', text: 'Les crédits sont repris automatiquement depuis « Dettes » ; l’épargne depuis les enveloppes.' })),
    el('section', { class: 'card' }, el('h3', { text: 'Évolution du patrimoine dans le temps' }),
      courbe({
        titre: 'Évolution du patrimoine', labels: F.snaps.map(s => labM(s.m)),
        series: [
          { name: 'Actifs', color: '#1d3557', values: F.snaps.map(s => s.a) },
          { name: 'Passifs', color: '#b45309', values: F.snaps.map(s => s.p) },
          { name: 'Patrimoine net', color: '#b8892e', values: F.snaps.map(s => s.n) }],
        vide: 'Le graphique apparaîtra dès l’enregistrement du premier mois.'
      })),
    el('section', { class: 'card' }, el('h3', { text: 'Composition des actifs' }),
      anneau({ titre: 'Composition des actifs', items: catA, vide: 'Aucun actif pour le moment.' })));
}

// ----- Rapports -----
function vueRapports(F) {
  const rm = ui.moisRapport || moisCourant();
  const y = +rm.slice(0, 4), mo = +rm.slice(5), q = Math.floor((mo - 1) / 3);
  const ms = ui.periode === 'Mois' ? [rm]
    : ui.periode === 'Trimestre' ? [0, 1, 2].map(i => C.im(y * 12 + q * 3 + i))
      : Array.from({ length: 12 }, (_, i) => C.im(y * 12 + i));
  const cs = ms.map(x => C.calc(F, x));
  const T = cs.reduce((a, c) => ({ inc: a.inc + c.inc, exp: a.exp + c.exp, sv: a.sv + c.sv, rav: a.rav + c.rav }), { inc: 0, exp: 0, sv: 0, rav: 0 });
  const totCap = C.CATS.reduce((a, x) => a + (+F.caps[x] || 0), 0);
  const budget = totCap * ms.length;
  const m12 = C.rows12(ms[ms.length - 1]);
  const cal12 = m12.map(x => C.calc(F, x));
  return el('div', {},
    entete('Rapports',
      el('select', { 'aria-label': 'Période', onchange: e => { ui.periode = e.target.value; ctx.rerender(); } },
        ...['Mois', 'Trimestre', 'Année'].map(x => el('option', { value: x, text: x, selected: x === ui.periode }))),
      champPeriode({ type: 'month', valeur: rm, libelle: 'Mois du rapport', onValider: v => { ui.moisRapport = v || rm; ctx.rerender(); } })),
    el('div', { class: 'grille' },
      kpi('Revenus', fm(T.inc)),
      kpi('Dépenses', fm(T.exp)),
      kpi('Épargne réalisée', fm(T.sv), pc(T.inc ? T.sv / T.inc * 100 : 0) + ' des revenus'),
      kpi('Reste à vivre cumulé', fm(T.rav), '', cls(T.rav)),
      totCap ? kpi('Budget prévisionnel', fm(budget), (T.exp <= budget ? 'Respecté · reste ' : 'Dépassé de ') + fm(Math.abs(budget - T.exp)), cls(budget - T.exp)) : null),
    el('section', { class: 'card' }, anneau({ titre: 'Répartition des dépenses', items: C.catTot(F, ms).map(([label, value]) => ({ label, value })), vide: 'Aucune dépense sur la période.' })),
    el('section', { class: 'card' }, barres({
      titre: 'Revenus, dépenses et épargne', labels: m12.map(labM),
      series: [
        { name: 'Revenus', color: '#1d3557', values: cal12.map(c => c.inc) },
        { name: 'Dépenses', color: '#b42318', values: cal12.map(c => c.exp) },
        { name: 'Épargne', color: '#15803d', values: cal12.map(c => c.sv) }]
    })),
    el('section', { class: 'card' }, courbe({
      titre: 'Épargne cumulée (12 derniers mois)', labels: m12.map(labM),
      series: [{ name: 'Épargne cumulée', color: '#15803d', values: m12.map(x => C.cumSav(F, x)) }]
    })),
    el('section', { class: 'card' }, el('h3', { text: 'Détail par mois' }),
      tableau(['Mois', { t: 'Revenus', n: true }, { t: 'Dépenses', n: true }, { t: 'Épargne', n: true }, { t: 'Reste à vivre', n: true }, { t: 'Budget', n: true }, { t: 'Écart', n: true }],
        ms.map((x, i) => [labL(x), fm(cs[i].inc), fm(cs[i].exp), fm(cs[i].sv), fm(cs[i].rav), totCap ? fm(totCap) : '—',
          totCap ? el('span', { class: cls(totCap - cs[i].exp), text: fm(totCap - cs[i].exp) }) : '—']),
        ['Total', fm(T.inc), fm(T.exp), fm(T.sv), fm(T.rav), totCap ? fm(budget) : '—', totCap ? fm(budget - T.exp) : '—'])));
}
