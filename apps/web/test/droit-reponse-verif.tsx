/**
 * Rendu statique du droit de réponse : état vide, réponse publiée, formulaire,
 * erreurs de validation, accusé de réception et erreur serveur.
 * Aucun réseau, aucun effet React : le composant de présentation est pur.
 *
 *   pnpm -F @radar/web run test:droit-reponse
 */
import { renderToStaticMarkup } from "react-dom/server";
import {
  DroitReponseSection, validerDroitReponse, type ValeursDroitReponse,
} from "../src/components/DroitReponseSection";
import type { RectificationPubliee } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** Le rendu SSR échappe les apostrophes ; on les relit tels quels. */
function lire(html: string): string {
  return html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

const valeurs: ValeursDroitReponse = {
  organisation: "CHU de Bordeaux",
  contactNom: "",
  email: "juridique@chu-bordeaux.fr",
  domaine: "chu-bordeaux.fr",
  motif: "inexactitude",
  message: "Le signal cité ne concerne pas notre établissement.",
  pieceJointeRef: "",
};

const publiee: RectificationPubliee = {
  id: 7,
  reference: "DR-2026-000007",
  organisation: "CHU de Bordeaux",
  motif: "inexactitude",
  message: "La date annoncée était celle de la publication, pas de l'incident.",
  publishedAt: "2026-11-20T10:00:00Z",
  decisionMotif: "Correction confirmée par la source",
};

const base = {
  organisation: "CHU de Bordeaux",
  domain: "chu-bordeaux.fr",
  valeurs,
  erreurs: {},
  messageErreur: null,
  reference: null,
  onOuvrir: () => {},
  onFermer: () => {},
  onChanger: () => {},
  onEnvoyer: () => {},
};

const vide = renderToStaticMarkup(
  <DroitReponseSection {...base} publiees={[]} etat="ferme" />,
);
check("état vide explicite", vide.includes("aucune rectification publiée pour cette organisation"));
check("action d'ouverture accessible", vide.includes('class="droit-reponse__ouvrir"'));
check("état vide : aucun formulaire ouvert", !vide.includes("<form"));

const rempli = lire(renderToStaticMarkup(
  <DroitReponseSection {...base} publiees={[publiee]} etat="ferme" />,
));
check("référence et motif affichés", rempli.includes(publiee.reference) && rempli.includes("information inexacte"));
check("texte publié affiché", rempli.includes(publiee.message));
check("motif de la décision affiché", rempli.includes(publiee.decisionMotif));
check("date de publication indiquée", rempli.includes("publiée le"));

const formulaire = lire(renderToStaticMarkup(
  <DroitReponseSection {...base} publiees={[]} etat="ouvert" />,
));
check("formulaire : champs et limite", formulaire.includes('type="email"')
  && formulaire.includes('maxLength="3000"') && formulaire.includes("<select"));
check("formulaire : avertissement de non-publication", formulaire.includes("Aucune publication n'est automatique"));
check("formulaire : nom prérempli et non modifiable", formulaire.includes("readOnly") && formulaire.includes("CHU de Bordeaux"));

const invalide = validerDroitReponse({ ...valeurs, email: "pas-un-email", message: "trop court" });
check("validation locale : email et message", Boolean(invalide.email) && Boolean(invalide.message));
check("validation locale : accepte un corps valide", Object.keys(validerDroitReponse(valeurs)).length === 0);

const erreurs = lire(renderToStaticMarkup(
  <DroitReponseSection
    {...base} publiees={[]} etat="erreur"
    erreurs={invalide} messageErreur="corrigez les champs signalés"
  />,
));
check("erreurs de validation annoncées", erreurs.includes('role="alert"') && erreurs.includes("adresse e-mail invalide"));
check("erreur serveur visible", erreurs.includes("corrigez les champs signalés"));

const succes = lire(renderToStaticMarkup(
  <DroitReponseSection {...base} publiees={[]} etat="succes" reference="DR-2026-000008" />,
));
check("accusé de réception avec référence", succes.includes('role="status"') && succes.includes("DR-2026-000008"));
check("succès : pas de publication immédiate", succes.includes("sera examinée avant toute publication"));

console.log(failures === 0
  ? "\nDroit de réponse : tous les contrôles passent."
  : `\nDroit de réponse : ${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
