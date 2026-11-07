// Mon Patrimoine v5 — moteur financier (étape 2, en développement).
// Fonctions PURES : toutes reçoivent l'état S et le mois courant m (« AAAA-MM »).
// Aucune lecture d'état global, aucune écriture, aucun réseau.
// Les formules reprennent celles de la version 4, sauf les dettes (échéancier réel).

export const PER = { Mensuelle: 1, Trimestrielle: 3, Semestrielle: 6, Annuelle: 12 };
export const TR = 'Transfert entre mes comptes';
export const CATS = ['Logement', 'Remboursement de crédit', 'Électricité et eau', 'Internet et téléphone', 'Assurances', 'Transport et carburant', 'Courses alimentaires', 'Abonnements', 'Dépenses familiales', 'Santé', 'Loisirs', 'Restaurants', 'Vêtements', 'Éducation', 'Autres charges'];
export const PTYPES = ['Fonds de sécurité', 'Achat de terrain', 'Construction de villa', 'Patrimoine immobilier', 'Préparation de la retraite', 'Investissements financiers', 'Autre projet'];
export const ACATS = ['Immobilier', 'Liquidités', 'Comptes bancaires', 'Placements financiers', 'Autres biens'];
export const PCATS = ['Crédits immobiliers', 'Crédits à la consommation', 'Dettes personnelles', 'Autres engagements financiers'];
export const AORDER = ['Immobilier', 'Liquidités', 'Comptes bancaires', 'Épargne', 'Placements financiers', 'Autres biens'];
export const DEBT_TYPES = ['Immobilier', 'Consommation', 'Auto', 'Étudiant', 'Autre'];
export const INCOME_TYPES = ['Salaire', 'Prime annuelle', 'Revenu exceptionnel', 'Revenu complémentaire', TR];
export const AGES = [40, 45, 50, 55, 60];
export const MAX_MONTHS = 1200;          // borne de sécurité : 100 ans
const EPS = 1e-6;

// ----- dates -----------------------------------------------------------------
export const ym = d => (d || '').slice(0, 7);
export const mi = m => +m.slice(0, 4) * 12 + +m.slice(5, 7) - 1;
export const im = i => Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0');
export const sum = (a, k = 'amount') => a.reduce((s, x) => s + (+x[k] || 0), 0);
export const td = (now = new Date()) => new Date(now - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// ----- revenus ---------------------------------------------------------------
// Récurrent : compté chaque mois de son début à sa fin. Ponctuel : seulement le mois de sa date. Transferts exclus.
export const incL = (S, m) => S.inc.filter(i => i.type !== TR && (i.rec ? ym(i.date) <= m && (!i.end || ym(i.end) >= m) : ym(i.date) === m));

// ----- dépenses fixes --------------------------------------------------------
export const fixL = (S, m) => {
  const r = [];
  S.fix.forEach(f => {
    const d = mi(m) - mi(ym(f.date));
    if (f.on && d >= 0 && d % PER[f.freq] === 0) r.push({ label: f.label, amount: +f.amount, day: +f.date.slice(8, 10), cat: f.cat });
  });
  return r;
};

// ----- crédits : échéancier avec amortissement --------------------------------
// Intérêt du mois = capital restant dû × taux annuel / 12. Paiement = mensualité, plafonnée au solde dû.
// Si une date de fin est donnée et qu'un solde subsiste, il est exigible ce mois-là (« solde final »).
// Retourne { rows, payoffM, totalInterest, totalPaid, warnings }. Aucune donnée inventée : tout vient du crédit saisi.
export function debtSchedule(d) {
  const out = { rows: [], payoffM: null, totalInterest: 0, totalPaid: 0, warnings: [] };
  const P = +d.initial || 0, M = +d.monthly || 0, rate = +d.rate || 0;
  if (!d.start || !ym(d.start)) { out.warnings.push('Date de début manquante'); return out; }
  if (P <= 0) { out.warnings.push('Montant initial manquant'); return out; }
  if (M <= 0) { out.warnings.push('Mensualité manquante'); return out; }
  const r = rate / 1200;
  const startIdx = mi(ym(d.start));
  const endIdx = d.end ? mi(ym(d.end)) : null;
  if (endIdx !== null && endIdx < startIdx) { out.warnings.push('Date de fin antérieure à la date de début'); return out; }
  if (endIdx === null && M <= P * r + EPS) {
    out.warnings.push('Mensualité inférieure ou égale aux intérêts : le crédit ne se rembourse pas');
    return out;
  }
  let bal = P;
  for (let k = 0; k < MAX_MONTHS && bal > EPS; k++) {
    const idx = startIdx + k;
    if (endIdx !== null && idx > endIdx) break;
    const interest = bal * r;
    const pay = Math.min(M, bal + interest);
    const principal = pay - interest;
    const closingRaw = bal + interest - pay;
    const isEnd = endIdx !== null && idx === endIdx;
    const balloon = isEnd && closingRaw > EPS ? closingRaw : 0;
    const closing = balloon > 0 ? 0 : closingRaw;
    out.rows.push({ m: im(idx), opening: bal, interest, principal, payment: pay, balloon, closing });
    out.totalInterest += interest;
    out.totalPaid += pay + balloon;
    bal = closing;
    if (bal <= EPS) { out.payoffM = im(idx); break; }
    if (isEnd) break;
  }
  if (endIdx !== null && bal > EPS && out.rows.length === 0) out.warnings.push('Aucune échéance calculable');
  return out;
}

// Capital restant dû à la fin du mois m (après les paiements de ce mois).
export function debtBalanceAt(d, m) {
  const P = +d.initial || 0;
  const sc = debtSchedule(d);
  if (!d.start || ym(d.start) > m) return P;          // crédit pas encore commencé
  if (!sc.rows.length) return P;                       // échéancier invalide : solde initial
  let last = null;
  for (const row of sc.rows) { if (row.m <= m) last = row; else break; }
  return last ? last.closing : P;
}

// Échéances de crédit exigibles le mois m (intérêts + capital inclus, solde final inclus).
export const debtDueL = (S, m) => {
  const out = [];
  S.debt.forEach(d => {
    const row = debtSchedule(d).rows.find(r => r.m === m);
    if (!row) return;
    const amount = row.payment + row.balloon;
    if (amount > EPS) out.push({ label: 'Crédit : ' + d.label, amount, interest: row.interest, principal: row.principal, day: +d.start.slice(8, 10), cat: 'Remboursement de crédit' });
  });
  return out;
};

// ----- dépenses variables ----------------------------------------------------
export const varL = (S, m) => S.var.filter(v => ym(v.date) === m && !v.transfer);

export const spentMap = (S, m) => {
  const o = {};
  [...fixL(S, m), ...debtDueL(S, m), ...varL(S, m)].forEach(x => { o[x.cat] = (o[x.cat] || 0) + (+x.amount); });
  return o;
};

// ----- plafonds et reports ---------------------------------------------------
export const startM = (S, m) => {
  let mn = m;
  [...S.fix.map(x => x.date), ...S.var.map(x => x.date), ...S.inc.map(x => x.date), ...S.debt.map(x => x.start)]
    .forEach(d => { const y = ym(d); if (y && y < mn) mn = y; });
  return mn;
};

// Report cumulé des plafonds non consommés, depuis le premier mois enregistré (36 mois au maximum).
export const carryAll = (S, m) => {
  const out = {};
  const cats = CATS.filter(c => S.carry[c] && (+S.caps[c] || 0) > 0);
  cats.forEach(c => { out[c] = 0; });
  const first = Math.max(mi(m) - 36, mi(startM(S, m)));
  for (let i = first; i < mi(m); i++) {
    const sp = spentMap(S, im(i));
    cats.forEach(c => { out[c] = Math.max(0, (+S.caps[c]) + out[c] - (sp[c] || 0)); });
  }
  return out;
};

export const capInfo = (S, m) => {
  const ci = carryAll(S, m), sp = spentMap(S, m);
  return CATS.map(c => {
    const cap = +S.caps[c] || 0;
    if (!cap) return null;
    const k = ci[c] || 0, e = cap + k, s = sp[c] || 0;
    return { c, cap, ci: k, e, s, rest: e - s, over: s > e };
  }).filter(Boolean);
};

// ----- budget mensuel --------------------------------------------------------
export const calc = (S, m) => {
  const inc = sum(incL(S, m)), fx = fixL(S, m), db = debtDueL(S, m), vr = varL(S, m);
  const F = sum(fx), D = sum(db), V = sum(vr);
  const A = +S.alloc[m] || 0;
  const sv = sum(S.sav.filter(s => ym(s.date) === m));
  const disp = inc - F - D - V;
  const rav = disp - A;                                 // reste à vivre
  return { inc, fx, db, vr, F, D, V, exp: F + D + V, A, sv, disp, rav, interest: sum(db, 'interest') };
};

export const catTot = (S, ms) => {
  const o = {};
  ms.forEach(m => { const s = spentMap(S, m); Object.keys(s).forEach(k => { o[k] = (o[k] || 0) + s[k]; }); });
  return Object.entries(o).sort((a, b) => b[1] - a[1]);
};

export const cumSav = (S, m) => sum(S.sav.filter(s => ym(s.date) <= m));
export const debtsLeft = (S, m) => S.debt.reduce((s, d) => s + debtBalanceAt(d, m), 0);

// ----- patrimoine ------------------------------------------------------------
// Épargne et crédits sont repris automatiquement. Les crédits sont valorisés par l'échéancier.
export const patLines = (S, m) => {
  const A = [{ cat: 'Épargne', label: 'Épargne (enveloppes)', value: sum(S.sav), auto: 1 }];
  const P = [];
  S.pa.forEach(x => (x.kind === 'A' ? A : P).push({ id: x.id, cat: x.cat, label: x.label, value: +x.value || 0, manual: 1 }));
  S.debt.forEach(d => {
    const v = debtBalanceAt(d, m);
    if (v > EPS) P.push({ cat: d.type === 'Immobilier' ? 'Crédits immobiliers' : 'Crédits à la consommation', label: 'Crédit : ' + d.label, value: v, auto: 1 });
  });
  return { A, P };
};
export const patTotals = (S, m) => {
  const L = patLines(S, m), ta = sum(L.A, 'value'), tp = sum(L.P, 'value');
  return { ta, tp, net: ta - tp, L };
};
export const netWorth = (S, m) => patTotals(S, m).net;

// ----- simulations (épargne et projets) --------------------------------------
// Versements en fin de mois ; intérêt mensuel = rendement annuel / 12 ; ex = { mois: montant }.
export const simulate = (c0, M, rate, n, ex) => {
  const r = (+rate || 0) / 1200, s = [+c0 || 0];
  let b = +c0 || 0;
  for (let k = 1; k <= n; k++) { b = b * (1 + r) + (+M || 0) + (+(ex && ex[k]) || 0); s.push(b); }
  return s;
};
export const exMap = list => {
  const o = {};
  (list || []).forEach(x => { const m = +x.m; if (m > 0 && +x.a) o[m] = (o[m] || 0) + (+x.a); });
  return o;
};
export const reachIn = (c0, M, rate, target, ex, max = 600) => {
  if ((+c0 || 0) >= target) return 0;
  const r = (+rate || 0) / 1200;
  let b = +c0 || 0;
  for (let k = 1; k <= max; k++) {
    b = b * (1 + r) + (+M || 0) + (+(ex && ex[k]) || 0);
    if (b >= target) return k;
  }
  return null;
};
export const needM = (c0, target, rate, n) => {
  if ((+c0 || 0) >= target) return 0;
  if (n <= 0) return Infinity;
  const r = (+rate || 0) / 1200;
  const f = (+c0 || 0) * Math.pow(1 + r, n);
  if (f >= target) return 0;
  return r ? (target - f) * r / (Math.pow(1 + r, n) - 1) : (target - f) / n;
};

// ----- projets (rubrique distincte des objectifs) ----------------------------
export const projInfo = (p, m) => {
  const tg = +p.target || 0, cap = +p.capital || 0;
  const rem = Math.max(0, tg - cap);
  const prog = tg ? Math.min(100, cap / tg * 100) : 0;
  const n = p.deadline ? mi(ym(p.deadline)) - mi(m) : null;
  const reach = reachIn(cap, p.monthly, p.rate, tg, null);
  const on = rem === 0 || (reach !== null && (n === null || reach <= n));
  const nm = n === null ? null : needM(cap, tg, p.rate, n);
  return { rem, prog, n, reach, on, nm, est: reach === null ? null : im(mi(m) + reach) };
};

// Répartition proportionnelle de l'épargne disponible entre les projets (au restant à constituer).
export const distribute = (S, m) => {
  const tot = +S.epTotal || 0;
  const rems = S.proj.map(p => projInfo(p, m).rem);
  const sr = rems.reduce((s, r) => s + r, 0);
  return S.proj.map((p, i) => (sr ? Math.round(tot * rems[i] / sr * 100) / 100 : 0));
};

// ----- objectifs (rubrique distincte des projets) ----------------------------
export const goalInfo = (g, m) => {
  const target = +g.target || 0, saved = +g.saved || 0;
  const p = target ? saved / target * 100 : 0;
  const left = Math.max(0, target - saved);
  const ml = Math.max(0, mi(ym(g.deadline)) - mi(m));
  const need = ml ? left / ml : left;
  const n = g.monthly > 0 ? Math.ceil(left / g.monthly) : null;
  const pj = n === null ? null : im(mi(m) + n);
  const ok = left === 0 || (!!pj && pj <= ym(g.deadline));
  return { p, left, need, n, pj, ok, status: left === 0 ? 'Atteint' : ok ? 'En bonne voie' : 'En retard' };
};

// ----- retraite --------------------------------------------------------------
// Capital nominal à l'âge a ; pouvoir d'achat d'aujourd'hui (inflation annuelle).
export const capAt = (c0, M, rate, age, a) => a > age ? simulate(c0, M, rate, (a - age) * 12, null).slice(-1)[0] : null;
export const realOf = (nom, infl, age, a) => nom === null ? null : nom / Math.pow(1 + (+infl || 0) / 100, a - age);

// ----- état initial : AUCUNE valeur d'exemple (la V4 contenait 100 000 DH, 5 000 DH/mois, etc.) -----
// Seuls les libellés des enveloppes et les scénarios sont proposés, sans montant.
export const emptyState = () => ({
  inc: [], fix: [], var: [], sav: [], debt: [], goal: [], proj: [], pa: [], snaps: [],
  ret: { age: '', retAge: '', c0: '', M: '', rate: '', infl: '' },
  scn: [],
  epTotal: 0,
  alloc: {}, caps: {}, carry: {},
  env: ['Épargne de sécurité', 'Projet immobilier', 'Construction de maison', 'Retraite', 'Investissements', 'Autres projets']
    .map((label, i) => ({ id: 'env' + (i + 1), label, target: 0 }))
});

// ----- historique du patrimoine et périodes (fonctions pures) -----------------
// Photo mensuelle du patrimoine : { m, a, p, n }, arrondie au centime, comme en V4.
export const snapRecord = (S, m) => {
  const t = patTotals(S, m);
  const r2 = x => Math.round(x * 100) / 100;
  return { m, a: r2(t.ta), p: r2(t.tp), n: r2(t.net) };
};
// Insère ou remplace la photo du mois, et trie par mois. Retourne une nouvelle liste.
export const upsertSnap = (snaps, rec) => {
  const i = snaps.findIndex(s => s.m === rec.m);
  const out = i >= 0 ? snaps.map((s, k) => (k === i ? rec : s)) : [...snaps, rec];
  return out.sort((x, y) => x.m.localeCompare(y.m));
};
// Les 12 mois se terminant au mois e (ordre croissant).
export const rows12 = e => Array.from({ length: 12 }, (_, i) => im(mi(e) - 11 + i));
