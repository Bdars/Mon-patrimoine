// JEU DE DONNÉES FICTIF — uniquement pour les tests et la prévisualisation.
// Aucune valeur ne provient des données réelles de l'utilisateur. Les noms sont inventés.
// Ce module doit être retiré de l'application avant toute utilisation réelle (phase 5).
import { completerEspace } from './model.js';

export function jeuFictif() {
  return completerEspace({
    fictif: true,          // marqueur : affiche le bandeau « DONNÉES FICTIVES » tant qu'il est présent
    inc: [
      { id: 'f-i1', label: 'Salaire exemple', type: 'Salaire', amount: 12000, date: '2025-01-01', rec: true, end: '' },
      { id: 'f-i2', label: 'Prime exemple annuelle', type: 'Prime annuelle', amount: 20000, date: '2026-03-15', rec: false, end: '' },
      { id: 'f-i3', label: 'Revenu complémentaire exemple', type: 'Revenu complémentaire', amount: 1500, date: '2025-06-01', rec: true, end: '2026-12-31' },
      { id: 'f-i4', label: 'Virement interne exemple', type: 'Transfert entre mes comptes', amount: 3000, date: '2026-10-02', rec: false, end: '' }
    ],
    fix: [
      { id: 'f-f1', label: 'Loyer exemple', cat: 'Logement', amount: 4000, freq: 'Mensuelle', date: '2025-01-05', on: true },
      { id: 'f-f2', label: 'Assurance auto exemple', cat: 'Assurances', amount: 3600, freq: 'Annuelle', date: '2025-09-10', on: true },
      { id: 'f-f3', label: 'Internet exemple', cat: 'Internet et téléphone', amount: 300, freq: 'Mensuelle', date: '2025-01-03', on: true },
      { id: 'f-f4', label: 'Électricité exemple', cat: 'Électricité et eau', amount: 600, freq: 'Trimestrielle', date: '2025-02-01', on: true },
      { id: 'f-f5', label: 'Abonnement exemple', cat: 'Abonnements', amount: 150, freq: 'Mensuelle', date: '2025-01-08', on: false }
    ],
    var: [
      { id: 'f-v1', date: '2026-10-03', amount: 1250, cat: 'Courses alimentaires', label: 'Supermarché exemple', pay: 'Carte bancaire', ess: 'Indispensable', transfer: false },
      { id: 'f-v2', date: '2026-10-12', amount: 480, cat: 'Restaurants', label: 'Restaurant exemple', pay: 'Carte bancaire', ess: 'Facultative', transfer: false },
      { id: 'f-v3', date: '2026-10-20', amount: 900, cat: 'Transport et carburant', label: 'Carburant exemple', pay: 'Carte bancaire', ess: 'Indispensable', transfer: false },
      { id: 'f-v4', date: '2026-10-25', amount: 3000, cat: 'Autres charges', label: 'Transfert exemple', pay: 'Virement', ess: 'Indispensable', transfer: true },
      { id: 'f-v5', date: '2026-09-18', amount: 700, cat: 'Loisirs', label: 'Loisirs exemple', pay: 'Carte bancaire', ess: 'Facultative', transfer: false }
    ],
    env: [
      { id: 'f-e1', label: 'Épargne de sécurité exemple', target: 50000 },
      { id: 'f-e2', label: 'Projet exemple', target: 0 }
    ],
    sav: [
      { id: 'f-s1', env: 'f-e1', amount: 4000, date: '2026-01-10' },
      { id: 'f-s2', env: 'f-e1', amount: 3000, date: '2026-06-10' },
      { id: 'f-s3', env: 'f-e2', amount: 2000, date: '2026-10-05' },
      { id: 'f-s4', env: 'f-e2', amount: -500, date: '2026-10-20' }
    ],
    debt: [
      { id: 'f-d1', label: 'Crédit auto exemple', type: 'Auto', initial: 120000, monthly: 2300, rate: 5, start: '2024-01-10', end: '', remaining: '' },
      { id: 'f-d2', label: 'Crédit conso exemple', type: 'Consommation', initial: 30000, monthly: 1500, rate: 8, start: '2025-03-01', end: '', remaining: '' }
    ],
    goal: [
      { id: 'f-g1', label: 'Voiture exemple', target: 150000, deadline: '2029-12-31', saved: 40000, monthly: 2000 }
    ],
    proj: [
      { id: 'f-p1', name: 'Fonds de sécurité exemple', type: 'Fonds de sécurité', target: 60000, deadline: '2028-06-30', capital: 20000, monthly: 1000, rate: 2 },
      { id: 'f-p2', name: 'Projet terrain exemple', type: 'Achat de terrain', target: 300000, deadline: '2032-12-31', capital: 0, monthly: 1500, rate: 3 }
    ],
    pa: [
      { id: 'f-a1', kind: 'A', cat: 'Autres biens', label: 'Véhicule exemple (valeur estimée)', value: 90000 },
      { id: 'f-a2', kind: 'P', cat: 'Autres engagements financiers', label: 'Dette familiale exemple', value: 5000 }
    ],
    snaps: [
      { m: '2026-06', a: 60000, p: 150000, n: -90000 },
      { m: '2026-09', a: 75000, p: 140000, n: -65000 }
    ],
    epTotal: 2500,
    alloc: { '2026-10': 2000 },
    caps: { 'Courses alimentaires': 3000, 'Restaurants': 800, 'Loisirs': 600, 'Logement': 4000 },
    carry: { 'Courses alimentaires': true }
  });
}
