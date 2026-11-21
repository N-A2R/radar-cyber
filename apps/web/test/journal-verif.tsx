/**
 * Vérification SSR de l'écran Journal : table des décisions, états et pagination.
 * Aucune base, aucun navigateur — le composant de rendu est alimenté par un
 * jeu de données typé, exactement comme le navigateur le sera par l'API.
 */
import { renderToStaticMarkup } from "react-dom/server";
import JournalListe from "../src/components/JournalListe";
import JournalView from "../src/components/JournalView";
import type { JournalDecision } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const decisions: JournalDecision[] = [
  { id: 42, sujet: "quarantine:17", acteur: "humain:analyste@radar.local", horodatage: "2026-11-21 14:03:12+00", decision: "accepter", indice: "Hôpital de Pessac", raison: "alias vérifié sur le site officiel" },
  { id: 41, sujet: "quarantine:16", acteur: "humain:analyste@radar.local", horodatage: "2026-11-21 11:20:00+00", decision: "refuser", indice: "Groupe fictif", raison: "indice hors périmètre" },
  { id: 40, sujet: "quarantine:15", acteur: "moteur:triage", horodatage: "2026-11-20 09:00:00+00", decision: "creer", indice: "CHU Bordeaux", raison: "domaine officiel confirmé" },
];

const rendu = renderToStaticMarkup(
  <JournalListe rows={decisions} loading={false} error={null} suivant={null} page={1}
    onPrecedent={() => {}} onSuivant={() => {}} />,
);

check("en-têtes des cinq colonnes",
  ["horodatage", "acteur", "décision", "indice", "raison"].every((col) => rendu.includes(`>${col}</th>`)));
check("acteur et horodatage affichés",
  rendu.includes("humain:analyste@radar.local")
  && rendu.includes('dateTime="2026-11-21 14:03:12+00"')
  && rendu.includes("2026-11-21 14:03"));
check("trois décisions (accepter / refuser / creer)",
  (["accepter", "refuser", "creer"] as const).every((d) => rendu.includes(`data-decision="${d}"`)));
check("indices et raisons affichés",
  rendu.includes("Hôpital de Pessac") && rendu.includes("Groupe fictif")
  && rendu.includes("CHU Bordeaux") && rendu.includes("alias vérifié sur le site officiel")
  && rendu.includes("indice hors périmètre") && rendu.includes("domaine officiel confirmé"));
check("ordre du plus récent au plus ancien",
  rendu.indexOf("Hôpital de Pessac") < rendu.indexOf("Groupe fictif")
  && rendu.indexOf("Groupe fictif") < rendu.indexOf("CHU Bordeaux"));
check("suite indisponible et première page : boutons désactivés",
  (rendu.match(/disabled=""/g) ?? []).length === 2 && rendu.includes("page 1"));

const page2 = renderToStaticMarkup(
  <JournalListe rows={decisions} loading={false} error={null} suivant={39} page={2}
    onPrecedent={() => {}} onSuivant={() => {}} />,
);
check("page suivante disponible : deux boutons actifs",
  !page2.includes("disabled") && page2.includes("page 2"));

const chargement = renderToStaticMarkup(
  <JournalListe rows={[]} loading error={null} suivant={null} page={1}
    onPrecedent={() => {}} onSuivant={() => {}} />,
);
check("état de chargement annoncé", chargement.includes('role="status"')
  && chargement.includes("Chargement du journal…"));

const erreur = renderToStaticMarkup(
  <JournalListe rows={[]} loading={false} error="/api/journal/review → 500"
    suivant={null} page={1} onPrecedent={() => {}} onSuivant={() => {}} />,
);
check("erreur affichée sans prétendre que la liste est vide",
  erreur.includes('role="alert"') && erreur.includes("API : /api/journal/review → 500")
  && !erreur.includes("aucune décision enregistrée"));

const vide = renderToStaticMarkup(
  <JournalListe rows={[]} loading={false} error={null} suivant={null} page={1}
    onPrecedent={() => {}} onSuivant={() => {}} />,
);
check("état vide explicite", vide.includes("aucune décision enregistrée")
  && !vide.includes('role="alert"'));

const sansDecision = renderToStaticMarkup(
  <JournalListe
    rows={[{ ...decisions[0], decision: null, raison: null, indice: null }]}
    loading={false} error={null} suivant={null} page={1}
    onPrecedent={() => {}} onSuivant={() => {}} />,
);
check("fait sans décision ni raison reste lisible",
  sansDecision.includes("non précisée") && sansDecision.includes("data-decision=\"inconnue\"")
  && sansDecision.includes("—"));

const ecran = renderToStaticMarkup(<JournalView />);
check("écran monté en chargement avant la réponse API",
  ecran.includes("Chargement du journal…") && ecran.includes("Journal"));

console.log(failures === 0 ? "\nJournal : tous les contrôles passent." : `\nJournal : ${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
