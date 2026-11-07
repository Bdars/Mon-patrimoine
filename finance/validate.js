// Mon Patrimoine v5 — validation des saisies et contrôles de cohérence. Fonctions pures.
import { PER, CATS, PTYPES, DEBT_TYPES, INCOME_TYPES, ACATS, PCATS, TR, ym, mi, sum, debtSchedule, debtBalanceAt, patLines, incL, varL, calc, projInfo } from './core.js';

// Date réelle au format AAAA-MM-JJ : rejette les dates impossibles (ex. 2026-02-31).
const isDate = s => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const isNum = v => v !== '' && v !== null && v !== undefined && Number.isFinite(+v);
const isMonth = m => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m);
const nonEmpty = s => typeof s === 'string' && s.trim().length > 0;

// Renvoie la liste des erreurs de saisie (vide = valide). Ne modifie rien.
export function validateEntry(kind, e, S = null) {
  const errs = [];
  const need = (ok, msg) => { if (!ok) errs.push(msg); };
  switch (kind) {
    case 'inc':
      need(nonEmpty(e.label), 'Libellé obligatoire');
      need(INCOME_TYPES.includes(e.type), 'Type de revenu inconnu');
      need(isNum(e.amount) && +e.amount > 0, 'Montant invalide : il doit être strictement positif');
      need(isDate(e.date), 'Date invalide (format attendu : JJ/MM/AAAA)');
      // Si une date de fin est renseignée, elle doit être postérieure ou égale à la date de début.
      // Elle n'est utilisée que pour un revenu récurrent, mais elle est contrôlée dès qu'elle existe.
      if (e.end) {
        need(isDate(e.end), 'Date de fin invalide');
        need(!isDate(e.end) || !isDate(e.date) || e.end >= e.date, 'La date de fin doit être postérieure ou égale à la date de début');
      }
      break;
    case 'fix':
      need(nonEmpty(e.label), 'Libellé obligatoire');
      need(CATS.includes(e.cat), 'Catégorie inconnue');
      need(isNum(e.amount) && +e.amount >= 0, 'Montant invalide');
      need(!!PER[e.freq], 'Fréquence inconnue');
      need(isDate(e.date), 'Date invalide');
      break;
    case 'var':
      need(isNum(e.amount) && +e.amount > 0, 'Montant invalide (supérieur à 0 attendu)');
      need(isDate(e.date), 'Date invalide');
      need(CATS.includes(e.cat), 'Catégorie inconnue');
      break;
    case 'sav':
      need(isNum(e.amount) && +e.amount > 0, 'Montant invalide (supérieur à 0 attendu)');
      need(isDate(e.date), 'Date invalide');
      need(['Versement', 'Retrait'].includes(e.kind), 'Opération inconnue');
      if (S) need(S.env.some(x => x.id === e.env), 'Enveloppe introuvable');
      break;
    case 'debt':
      need(nonEmpty(e.label), 'Nom du crédit obligatoire');
      need(DEBT_TYPES.includes(e.type), 'Type de crédit inconnu');
      need(isNum(e.initial) && +e.initial > 0, 'Montant initial invalide (supérieur à 0 attendu)');
      need(isNum(e.monthly) && +e.monthly > 0, 'Mensualité invalide (supérieure à 0 attendue)');
      need(isNum(e.rate) && +e.rate >= 0 && +e.rate <= 100, 'Taux invalide (entre 0 et 100 %)');
      need(isDate(e.start), 'Date de début invalide');
      if (e.end) {
        need(isDate(e.end), 'Date de fin invalide');
        need(!isDate(e.end) || !isDate(e.start) || e.end >= e.start, 'La date de fin est antérieure à la date de début');
      }
      if (isNum(e.initial) && isNum(e.monthly) && isNum(e.rate) && +e.initial > 0 && +e.monthly > 0) {
        const interest = +e.initial * (+e.rate / 1200);
        if (!e.end) need(+e.monthly > interest, `Mensualité trop faible : elle doit dépasser les intérêts du premier mois (${interest.toFixed(2)} DH)`);
      }
      break;
    case 'goal':
      need(nonEmpty(e.label), 'Libellé obligatoire');
      need(isNum(e.target) && +e.target > 0, 'Montant cible invalide (supérieur à 0 attendu)');
      need(isDate(e.deadline), 'Date limite obligatoire et valide');
      need(!isNum(e.saved) || +e.saved >= 0, 'Montant épargné négatif');
      need(!isNum(e.monthly) || +e.monthly >= 0, 'Versement mensuel négatif');
      break;
    case 'proj':
      need(nonEmpty(e.name), 'Nom du projet obligatoire');
      need(PTYPES.includes(e.type), 'Type de projet inconnu');
      need(isNum(e.target) && +e.target > 0, 'Montant cible invalide (supérieur à 0 attendu)');
      need(!e.deadline || isDate(e.deadline), 'Date de réalisation invalide');
      need(!isNum(e.capital) || +e.capital >= 0, 'Capital disponible négatif');
      need(!isNum(e.monthly) || +e.monthly >= 0, 'Versement mensuel négatif');
      need(!isNum(e.rate) || (+e.rate >= 0 && +e.rate <= 100), 'Rendement invalide (entre 0 et 100 %)');
      break;
    case 'env':
      need(nonEmpty(e.label), 'Nom de l’enveloppe obligatoire');
      need(!isNum(e.target) || +e.target >= 0, 'Objectif négatif');
      if (S) need(!S.env.some(x => x.id !== e.id && x.label.trim().toLowerCase() === e.label.trim().toLowerCase()), 'Une enveloppe porte déjà ce nom');
      break;
    case 'pa':
      need(nonEmpty(e.label), 'Libellé obligatoire');
      need(isNum(e.value) && +e.value >= 0, 'Valeur invalide (nombre positif attendu)');
      need(['A', 'P'].includes(e.kind), 'Nature inconnue (actif ou passif)');
      need((e.kind === 'P' ? PCATS : ACATS).includes(e.cat), 'Catégorie inconnue');
      break;
    default:
      errs.push('Type de saisie inconnu');
  }
  return errs;
}

// Nombre de mouvements qui seraient supprimés avec une enveloppe (pour la confirmation).
export const envelopeMovementsCount = (S, id) => S.sav.filter(s => s.env === id).length;

// Contrôles de cohérence entre les rubriques. Renvoie [{ level: 'warn' | 'info', text }].
// Les contrôles n'ajoutent ni ne retirent aucune valeur : ils signalent seulement.
export function coherence(S, m) {
  const out = [];
  const warn = t => out.push({ level: 'warn', text: t });
  const info = t => out.push({ level: 'info', text: t });

  // 1. Épargne des projets : le capital déjà disponible ne doit pas dépasser l'épargne enregistrée.
  const projCap = sum(S.proj, 'capital');
  const savTotal = sum(S.sav);
  if (projCap > savTotal + 0.005) warn(`Le capital disponible des projets (${projCap.toFixed(2)} DH) dépasse l’épargne enregistrée dans les enveloppes (${savTotal.toFixed(2)} DH). Vérifiez qu’aucun montant n’est compté deux fois.`);

  // 2. Patrimoine : une saisie manuelle d'épargne fait double emploi avec les enveloppes.
  if (S.pa.some(x => x.kind === 'A' && x.cat === 'Épargne')) warn('Un actif saisi manuellement est classé « Épargne » : l’épargne des enveloppes est déjà reprise automatiquement. Risque de double comptage.');

  // 3. Crédits : capital restant saisi à la main contre l'échéancier calculé.
  S.debt.forEach(d => {
    const sc = debtSchedule(d);
    sc.warnings.forEach(w => warn(`Crédit « ${d.label} » : ${w}`));
    if (isNum(d.remaining) && sc.rows.length) {
      const calcBal = debtBalanceAt(d, m);
      if (Math.abs(+d.remaining - calcBal) > 1) info(`Crédit « ${d.label} » : capital restant saisi (${(+d.remaining).toFixed(2)} DH) différent de l’échéancier (${calcBal.toFixed(2)} DH). Le calcul utilise l’échéancier.`);
    }
  });

  // 4. Budget : épargne affectée supérieure au disponible.
  const c = calc(S, m);
  if (c.A > 0 && c.A > c.disp + 0.005) warn(`L’épargne affectée à ${m} (${c.A.toFixed(2)} DH) dépasse le disponible du mois (${c.disp.toFixed(2)} DH).`);

  // 5. Transferts : chaque transfert sortant doit correspondre à un transfert entrant (informatif).
  const outT = sum(S.var.filter(v => v.transfer && ym(v.date) === m));
  const inT = sum(S.inc.filter(i => i.type === TR && ym(i.date) === m));
  if (Math.abs(outT - inT) > 0.005) info(`Transferts du mois ${m} non équilibrés : sorties ${outT.toFixed(2)} DH, entrées ${inT.toFixed(2)} DH. Ils sont exclus du budget dans les deux sens.`);

  // 6. Projets : capital supérieur à l'objectif.
  S.proj.forEach(p => {
    if ((+p.capital || 0) > (+p.target || 0) && +p.target > 0) warn(`Projet « ${p.name} » : capital disponible supérieur au montant cible.`);
    const pi = projInfo(p, m);
    if (p.deadline && pi.on === false) warn(`Projet « ${p.name} » : la date souhaitée n’est pas atteignable avec le versement prévu.`);
  });

  // 7. Objectifs : déjà atteints ou dépassés (informatif).
  S.goal.forEach(g => { if ((+g.saved || 0) >= (+g.target || 0) && +g.target > 0) info(`Objectif « ${g.label} » atteint.`); });

  return out;
}

// Vérification de l'état complet : toutes les saisies doivent être valides avant d'être acceptées.
export function validateState(S) {
  const errs = [];
  const check = (list, kind) => (list || []).forEach((x, i) => validateEntry(kind, x, S).forEach(e => errs.push(`${kind}[${i}] : ${e}`)));
  check(S.inc, 'inc'); check(S.fix, 'fix'); check(S.var, 'var');
  // Un retrait est stocké en négatif (convention V4) : le sens se déduit du signe, on vérifie la valeur absolue.
  check((S.sav || []).map(x => ({ ...x, amount: Math.abs(+x.amount), kind: +x.amount < 0 ? 'Retrait' : 'Versement' })), 'sav');
  check(S.debt, 'debt'); check(S.goal, 'goal'); check(S.proj, 'proj'); check(S.env, 'env'); check(S.pa, 'pa');
  return errs;
}
