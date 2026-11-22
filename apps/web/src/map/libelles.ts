/**
 * Libellés français des familles d'événement et des types d'organisation.
 *
 * Extraits de `Map3D.tsx` pour que la légende de carte puisse les importer sans
 * tirer tout le module maplibre dans le bundle principal (sinon la carte, qui
 * est chargée en `lazy`, finit dans le même chunk que l'écran d'accueil).
 */

export const FAMILY_LABELS: Record<string, string> = {
  ransomware: "rançongiciel",
  vuln: "vulnérabilité",
  phishing: "hameçonnage",
  malware: "maliciel",
  cert: "cert",
  cert_fr: "CERT-FR",
  typosquat: "typosquattage",
  reputation: "réputation",
  cti: "CTI",
  presse: "presse",
  presse_locale: "presse locale",
};

export const ORG_KIND_LABELS: Record<string, string> = {
  entreprise: "entreprise",
  collectivite: "collectivité",
  sante: "santé",
  enseignement: "enseignement",
  recherche: "recherche",
  operateur_critique: "opérateur critique",
  ess: "ess",
};
