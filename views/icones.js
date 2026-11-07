// Mon Patrimoine V5 — icônes et logo (SVG dessinés à la main, gabarit Lucide : 24×24, trait 2, arrondis).
// Aucune bibliothèque externe (la CSP interdit les CDN). Construction par createElementNS, jamais à partir de chaînes HTML.
// Icônes décoratives : aria-hidden, le libellé de l'élément porte le sens.

const NS = 'http://www.w3.org/2000/svg';

// Chaque icône : liste de [balise, attributs].
const ICONES = {
  'layout-dashboard': [['rect', { x: 3, y: 3, width: 7, height: 9, rx: 1 }], ['rect', { x: 14, y: 3, width: 7, height: 5, rx: 1 }], ['rect', { x: 14, y: 12, width: 7, height: 9, rx: 1 }], ['rect', { x: 3, y: 16, width: 7, height: 5, rx: 1 }]],
  'wallet': [['path', { d: 'M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3' }], ['rect', { x: 3, y: 7, width: 18, height: 13, rx: 2 }], ['path', { d: 'M16 14h.01' }]],
  'trending-up': [['polyline', { points: '22 7 13.5 15.5 8.5 10.5 2 17' }], ['polyline', { points: '16 7 22 7 22 13' }]],
  'receipt': [['path', { d: 'M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2Z' }], ['path', { d: 'M8 8h8M8 12h8M8 16h5' }]],
  'shopping-cart': [['circle', { cx: 8, cy: 21, r: 1 }], ['circle', { cx: 19, cy: 21, r: 1 }], ['path', { d: 'M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 7H6' }]],
  'piggy-bank': [['path', { d: 'M19 10c0-2.8-2.2-5-5-5H9c-3.3 0-6 2.5-6 5.5 0 1.3.5 2.4 1.2 3.3L3.5 16h2.2l.9-1.2c.8.3 1.7.5 2.6.5h5l.9 1.2h2.2l-.9-1.6c.5-.9.8-1.9.8-3z' }], ['path', { d: 'M14 9h.01' }], ['path', { d: 'M9 5 10 3h3' }]],
  'credit-card': [['rect', { x: 2, y: 5, width: 20, height: 14, rx: 2 }], ['path', { d: 'M2 10h20M6 15h4' }]],
  'target': [['circle', { cx: 12, cy: 12, r: 10 }], ['circle', { cx: 12, cy: 12, r: 6 }], ['circle', { cx: 12, cy: 12, r: 2 }]],
  'flag': [['path', { d: 'M4 22V3' }], ['path', { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1' }]],
  'house': [['path', { d: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' }]],
  'landmark': [['path', { d: 'M3 21h18M5 21V10M10 21V10M14 21V10M19 21V10' }], ['path', { d: 'M2 10 12 3l10 7z' }]],
  'chart-no-axes-combined': [['path', { d: 'M3 3v18h18' }], ['path', { d: 'M8 16v-5M13 16V7M18 16v-3' }]],
  'settings': [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1' }]],
  'plus': [['path', { d: 'M12 5v14M5 12h14' }]],
  'pencil': [['path', { d: 'M12 20h9' }], ['path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z' }]],
  'trash': [['path', { d: 'M3 6h18' }], ['path', { d: 'M8 6V4h8v2' }], ['path', { d: 'M19 6l-1 14H6L5 6' }]],
  'check': [['path', { d: 'M20 6 9 17l-5-5' }]],
  'x': [['path', { d: 'M18 6 6 18M6 6l12 12' }]],
  'download': [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['path', { d: 'M7 10l5 5 5-5M12 15V3' }]],
  'upload': [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['path', { d: 'M17 8l-5-5-5 5M12 3v12' }]],
  'lock': [['rect', { x: 4, y: 11, width: 16, height: 10, rx: 2 }], ['path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }]],
  'unlock': [['rect', { x: 4, y: 11, width: 16, height: 10, rx: 2 }], ['path', { d: 'M8 11V7a4 4 0 0 1 7.8-1.2' }]],
  'tag': [['path', { d: 'M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.8 8.8a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8z' }], ['circle', { cx: 7.5, cy: 7.5, r: 1.5 }]],
  'utensils': [['path', { d: 'M4 2v7a3 3 0 0 0 6 0V2M7 2v20M18 2c-2 1-3 4-3 7h3v13' }]],
  'car': [['path', { d: 'M5 17h14M5 17l1.5-6h11L19 17M5 17v2M19 17v2' }], ['circle', { cx: 8, cy: 17, r: 0.5 }], ['circle', { cx: 16, cy: 17, r: 0.5 }]],
  'heart': [['path', { d: 'M19.5 12.6 12 20l-7.5-7.4A5 5 0 0 1 12 6.2a5 5 0 0 1 7.5 6.4z' }]],
  'ticket': [['path', { d: 'M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 0 0-4V4H3z' }], ['path', { d: 'M13 4v16' }]],
  'alert': [['path', { d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' }], ['path', { d: 'M12 9v4M12 17h.01' }]]
};

// Icône de section du menu (identifiant de section -> nom d’icône).
export const ICONE_SECTION = {
  'tableau': 'layout-dashboard',
  'budget': 'wallet',
  'revenus': 'trending-up',
  'depenses-fixes': 'receipt',
  'depenses-variables': 'shopping-cart',
  'epargne': 'piggy-bank',
  'dettes': 'credit-card',
  'objectifs': 'target',
  'projets': 'flag',
  'patrimoine': 'house',
  'retraite': 'landmark',
  'rapports': 'chart-no-axes-combined',
  'donnees': 'settings'
};

// Catégories de dépenses : icône selon le nom de la catégorie (repli : étiquette).
export function iconeCategorie(cat = '') {
  const c = cat.toLowerCase();
  if (/aliment|courses|épicerie|epicerie/.test(c)) return 'shopping-cart';
  if (/restaurant|café|cafe/.test(c)) return 'utensils';
  if (/logement|loyer|eau|électric|electric|internet|télé/.test(c)) return 'house';
  if (/transport|carburant|auto|véhicule|vehicule/.test(c)) return 'car';
  if (/santé|sante|pharm/.test(c)) return 'heart';
  if (/loisir|sortie|culture/.test(c)) return 'ticket';
  return 'tag';
}

// Construit un SVG à partir du dessin.
export function icone(nom, taille = 20, classe = 'ico') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(taille));
  svg.setAttribute('height', String(taille));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', classe);
  for (const [balise, attrs] of ICONES[nom] || ICONES.tag) {
    const n = document.createElementNS(NS, balise);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    svg.append(n);
  }
  return svg;
}

// Logo : carré bleu nuit, barres dorées croissantes et ligne de tendance.
export function logo(taille = 32) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(taille));
  svg.setAttribute('height', String(taille));
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'logo');
  const forme = (balise, attrs) => { const n = document.createElementNS(NS, balise); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); svg.append(n); };
  forme('rect', { x: 0, y: 0, width: 64, height: 64, rx: 14, fill: '#13213d' });
  forme('rect', { x: 14, y: 36, width: 8, height: 14, rx: 2, fill: '#b8892e' });
  forme('rect', { x: 28, y: 28, width: 8, height: 22, rx: 2, fill: '#d4a548' });
  forme('rect', { x: 42, y: 18, width: 8, height: 32, rx: 2, fill: '#e8c77a' });
  forme('polyline', { points: '12 24 26 16 36 20 52 10', fill: 'none', stroke: '#ffffff', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  return svg;
}

// Icône devant le texte des boutons (sans « + Ajouter », dont le signe est déjà dans le libellé).
const ICONE_BOUTON = [
  [/^Ajouter/, 'plus'],
  [/^Modifier/, 'pencil'],
  [/Supprimer|Vider/, 'trash'],
  [/^Enregistrer le fichier/, 'download'],
  [/Préparer la sauvegarde|^Exporter/, 'download'],
  [/Vérifier la sauvegarde|^Enregistrer|Appliquer/, 'check'],
  [/^Annuler/, 'x'],
  [/^Restaurer|Remplacer les données|Créer le coffre à partir|Charger le jeu fictif/, 'upload'],
  [/^Verrouiller/, 'lock'],
  [/^Déverrouiller/, 'unlock'],
  [/Changer le mot de passe|^Créer le coffre$/, 'lock']
];

// Ajoute l’icône aux boutons et liens-boutons d’une zone. Ne modifie ni le texte ni les actions.
export function enrichirBoutons(racine) {
  for (const b of racine.querySelectorAll('button, a.bouton-lien')) {
    if (b.querySelector('.ico')) continue;
    const texte = (b.textContent || '').trim();
    if (!texte || texte.startsWith('+')) continue;
    const r = ICONE_BOUTON.find(([re]) => re.test(texte));
    if (r) b.prepend(icone(r[1], 18));
  }
}
