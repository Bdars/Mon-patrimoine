// Mon Patrimoine — sauvegarde et restauration du coffre (v5).
//
// Une sauvegarde est un fichier JSON qui contient une enveloppe chiffrée (crypto.js) :
// AES-256-GCM avec clé dérivée du mot de passe (PBKDF2-SHA256). Le contenu clair n'est jamais écrit.
// À l'intérieur du chiffrement, le contenu est un objet { type, version, schema, creeLe, contenu }.
// Ce wrapper permet de refuser un fichier chiffré d'un autre usage ou d'une autre version.
//
// Contrôles avant toute restauration (dans l'ordre) :
// 1. taille du fichier, 2. JSON valide, 3. enveloppe conforme (format, paramètres, longueurs),
// 4. déchiffrement authentifié (mot de passe et intégrité), 5. type et version de la sauvegarde,
// 6. schéma compatible, 7. structure du contenu, 8. validation des données financières.
// Aucune écriture n'est faite par ce module : il renvoie seulement le contenu vérifié.

import { encryptObject, decryptObject, validateEnvelope, CryptoError, DEFAULT_ITER } from './crypto.js';
import { completerEspace } from '../finance/model.js';
import { validateState } from '../finance/validate.js';

export const TYPE_SAUVEGARDE = 'mon-patrimoine-sauvegarde';
export const VERSION_SAUVEGARDE = 1;
export const TAILLE_MAX_SAUVEGARDE = 20 * 1024 * 1024;   // 20 Mo : bien au-delà d'une sauvegarde réelle

export class SauvegardeError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

// Fabrique le fichier de sauvegarde (texte JSON) à partir de l'état complet du coffre.
// etat : { schema, finance, retraite } ; password : mot de passe actuel du coffre.
export async function creerSauvegarde(etat, password, { schema, iter = DEFAULT_ITER, now = new Date() } = {}) {
  if (!etat || typeof etat !== 'object') throw new SauvegardeError('contenu_absent', 'Rien à sauvegarder');
  const charge = {
    type: TYPE_SAUVEGARDE,
    version: VERSION_SAUVEGARDE,
    schema,
    creeLe: now.toISOString(),
    contenu: etat
  };
  let env;
  try { env = await encryptObject(charge, password, { iter, now }); }
  catch (e) { throw new SauvegardeError(e.code === 'weak_password' ? 'mot_de_passe_court' : 'chiffrement', e.message); }
  return JSON.stringify(env);
}

// Lit et vérifie un fichier de sauvegarde. Renvoie { contenu, resume } si tout est conforme.
// texte : contenu du fichier (chaîne) ; password : mot de passe de la sauvegarde ; schema : schéma attendu.
export async function lireSauvegarde(texte, password, { schema } = {}) {
  if (typeof texte !== 'string' || texte.length === 0) throw new SauvegardeError('fichier_vide', 'Le fichier est vide');
  if (texte.length > TAILLE_MAX_SAUVEGARDE) throw new SauvegardeError('fichier_trop_grand', 'Le fichier est trop volumineux pour une sauvegarde');
  let env;
  try { env = JSON.parse(texte); }
  catch (e) { throw new SauvegardeError('fichier_invalide', 'Ce fichier n’est pas une sauvegarde lisible'); }
  try { validateEnvelope(env); }
  catch (e) {
    if (e instanceof CryptoError && e.code === 'unsupported_version') throw new SauvegardeError('version_incompatible', 'Version de sauvegarde non prise en charge');
    throw new SauvegardeError('fichier_invalide', 'Ce fichier n’est pas une sauvegarde Mon Patrimoine');
  }
  let charge;
  try { charge = await decryptObject(env, password); }
  catch (e) {
    if (e instanceof CryptoError && e.code === 'auth_failed') throw new SauvegardeError('mot_de_passe_ou_fichier', 'Mot de passe incorrect, ou fichier altéré');
    if (e instanceof CryptoError && e.code === 'weak_password') throw new SauvegardeError('mot_de_passe_court', 'Mot de passe trop court');
    throw new SauvegardeError('fichier_invalide', 'Sauvegarde illisible');
  }
  if (!charge || typeof charge !== 'object' || charge.type !== TYPE_SAUVEGARDE)
    throw new SauvegardeError('mauvais_type', 'Ce fichier chiffré n’est pas une sauvegarde de coffre');
  if (charge.version !== VERSION_SAUVEGARDE)
    throw new SauvegardeError('version_incompatible', `Version de sauvegarde non prise en charge (${charge.version})`);
  if (schema !== undefined && charge.schema !== schema)
    throw new SauvegardeError('schema_incompatible', `Schéma de données incompatible (${charge.schema}, attendu ${schema})`);
  const c = charge.contenu;
  if (!c || typeof c !== 'object' || !c.finance || typeof c.finance !== 'object' || !c.retraite || typeof c.retraite !== 'object')
    throw new SauvegardeError('contenu_invalide', 'Structure du contenu incomplète');
  const finance = completerEspace(c.finance);
  const erreurs = validateState(finance);
  if (erreurs.length) throw new SauvegardeError('donnees_invalides', `Données financières incohérentes (${erreurs.length} anomalie(s)) : ${erreurs.slice(0, 3).join(' ; ')}`);
  const contenu = { schema: charge.schema, finance, retraite: c.retraite };
  const compte = k => (Array.isArray(finance[k]) ? finance[k].length : 0);
  const resume = {
    creeLe: charge.creeLe,
    schema: charge.schema,
    fictif: !!finance.fictif,
    revenus: compte('inc'), depensesFixes: compte('fix'), depensesVariables: compte('var'),
    epargne: compte('sav'), dettes: compte('debt'), objectifs: compte('goal'), projets: compte('proj'), patrimoine: compte('pa')
  };
  return { contenu, resume };
}

// Nom de fichier proposé à l'export (date locale, sans donnée personnelle).
export const nomFichierSauvegarde = (date = new Date()) => {
  const j = date.toISOString().slice(0, 10);
  return `mon-patrimoine-sauvegarde-${j}.json`;
};
