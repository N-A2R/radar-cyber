/**
 * Vérification du filtre pur et du rendu SSR de l'écran Journal.
 * Aucune base, aucun navigateur — les composants sont alimentés par un jeu de
 * données typé, exactement comme le navigateur le sera par l'API.
 */
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { JournalDecision } from "../src/api";
import JournalList, { DECISION_UNSPECIFIED } from "../src/components/JournalListe";
import JournalView, { filterJournal } from "../src/components/JournalView";
import type { JournalFilters } from "../src/components/JournalView";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const decisions: JournalDecision[] = [
  { id: 46, sujet: "quarantine:21", acteur: "humain:analyste@radar.local", horodatage: "2026-11-21 14:03:12+00", decision: "accepter", indice: "Hôpital de Pessac", raison: "alias vérifié sur le site officiel" },
  { id: 45, sujet: "quarantine:20", acteur: "HUMAIN:admin@radar.local", horodatage: "2026-11-21 11:20:00+00", decision: "refuser", indice: "Groupe fictif", raison: "indice hors périmètre" },
  { id: 44, sujet: "quarantine:19", acteur: "moteur:triage", horodatage: "2026-11-20 09:00:00+00", decision: "creer", indice: "CHU Bordeaux", raison: "domaine officiel confirmé" },
  { id: 43, sujet: "quarantine:18", acteur: "moteur:triage", horodatage: "2026-11-20 07:12:00+00", decision: null, indice: null, raison: null },
  { id: 42, sujet: "quarantine:17", acteur: "humain:relecteur@radar.local", horodatage: "2026-11-19 18:30:00+00", decision: "accepter", indice: "Institut Pasteur", raison: "source institutionnelle" },
  { id: 41, sujet: "quarantine:16", acteur: "humain:analyste@radar.local", horodatage: "2026-11-19 08:15:00+00", decision: "refuser", indice: "Association bidon", raison: "aucune trace publique" },
];

/** Identifiants dans l'ordre, pour vérifier à la fois le filtre et l'ordre d'origine. */
const ids = (rows: JournalDecision[]) => rows.map((row) => row.id).join(",");
const filtre = (patch: JournalFilters) => filterJournal(decisions, patch);

/* Filtre pur : toutes les combinaisons sont déterministes et sans effet de bord. */
check("acteur : sous-chaîne insensible à la casse",
  ids(filtre({ actor: "ANALYSTE" })) === "46,41");
check("acteur : sous-chaîne au milieu d'un acteur déjà en majuscules",
  ids(filtre({ actor: "Moteur:TRIAGE" })) === "44,43");
check("acteur absent ou vide : aucune restriction",
  ids(filtre({})) === "46,45,44,43,42,41" && ids(filtre({ actor: "" })) === ids(filtre({})));
check("acteur sans correspondance : liste vide", filtre({ actor: "robot" }).length === 0);

check("décision accepter", ids(filtre({ decision: "accepter" })) === "46,42");
check("décision refuser", ids(filtre({ decision: "refuser" })) === "45,41");
check("décision creer", ids(filtre({ decision: "creer" })) === "44");
check("décision non précisée", ids(filtre({ decision: DECISION_UNSPECIFIED })) === "43");
check("décision absente ou vide : aucune restriction",
  ids(filtre({ decision: undefined })) === ids(filtre({})) && ids(filtre({ decision: "" })) === ids(filtre({})));

check("borne du seulement", ids(filtre({ from: "2026-11-20" })) === "46,45,44,43");
check("borne au seulement", ids(filtre({ to: "2026-11-20" })) === "44,43,42,41");
check("bornes inclusives sur un même jour",
  ids(filtre({ from: "2026-11-20", to: "2026-11-20" })) === "44,43");
check("deux bornes distinctes",
  ids(filtre({ from: "2026-11-19", to: "2026-11-20" })) === "44,43,42,41");
check("plage sans aucune ligne",
  filtre({ from: "2026-11-22", to: "2026-11-30" }).length === 0);

check("combinaison acteur + décision + plage",
  ids(filtre({ actor: "humain", decision: "accepter", from: "2026-11-19", to: "2026-11-21" })) === "46,42");
check("combinaison moteur + non précisée + borne du",
  ids(filtre({ actor: "moteur", decision: DECISION_UNSPECIFIED, from: "2026-11-20" })) === "43");

const sansFiltre = filtre({});
check("aucun filtre : mêmes lignes, même ordre, mêmes références",
  sansFiltre.length === decisions.length
  && sansFiltre.every((row, i) => row === decisions[i])
  && sansFiltre !== decisions);
check("champs vides : même résultat que sans filtre",
  ids(filtre({ actor: "", decision: "", from: "", to: "" })) === ids(sansFiltre));

const avant = JSON.stringify(decisions);
const references = [...decisions];
const apresFiltre = filtre({ actor: "moteur", decision: "refuser" });
check("filtrage sans mutation du tableau source",
  apresFiltre.length === 0 && JSON.stringify(decisions) === avant
  && decisions.every((row, i) => row === references[i]));

/* Rendu SSR : mêmes props qu'en navigateur, sans API ni interaction. */
type PropsListe = ComponentProps<typeof JournalList>;
function rendreListe(surcharges: Partial<PropsListe> = {}) {
  return renderToStaticMarkup(
    <JournalList
      rows={decisions}
      resultCount={decisions.length}
      filters={{}}
      onFilterChange={() => {}}
      onReset={() => {}}
      truncated={false}
      loading={false}
      error={null}
      page={1}
      pageCount={2}
      onPrevious={() => {}}
      onNext={() => {}}
      {...surcharges}
    />,
  );
}

const rendu = rendreListe();
check("en-têtes des cinq colonnes",
  ["Timestamp", "Actor", "Decision", "Clue", "Reason"].every((col) => rendu.includes(`>${col}</th>`)));
check("acteur et horodatage affichés",
  rendu.includes("humain:analyste@radar.local")
  && rendu.includes('dateTime="2026-11-21 14:03:12+00"')
  && rendu.includes("2026-11-21 14:03"));
check("trois décisions (accepter / refuser / creer)",
  (["accepter", "refuser", "creer"] as const).every((d) => rendu.includes(`data-decision="${d}"`)));
check("indices et raisons affichés",
  ["Hôpital de Pessac", "Groupe fictif", "CHU Bordeaux", "Institut Pasteur", "Association bidon",
    "alias vérifié sur le site officiel", "indice hors périmètre", "domaine officiel confirmé",
    "source institutionnelle", "aucune trace publique"].every((texte) => rendu.includes(texte)));
check("ordre du plus récent au plus ancien",
  rendu.indexOf("Hôpital de Pessac") < rendu.indexOf("Groupe fictif")
  && rendu.indexOf("Groupe fictif") < rendu.indexOf("CHU Bordeaux")
  && rendu.indexOf("CHU Bordeaux") < rendu.indexOf("Institut Pasteur")
  && rendu.indexOf("Institut Pasteur") < rendu.indexOf("Association bidon"));
check("compteur de résultats et libellé page X / Y",
  rendu.includes("6 results — page 1 / 2"));

const borneHaute = rendreListe({ page: 2 });
check("première page : Previous désactivé, Next actif",
  /<button[^>]*disabled=""[^>]*>Previous<\/button>/.test(rendu)
  && /<button(?![^>]*disabled)[^>]*>Next<\/button>/.test(rendu));
check("dernière page : Next désactivé, Previous actif",
  borneHaute.includes("page 2 / 2")
  && /<button[^>]*disabled=""[^>]*>Next<\/button>/.test(borneHaute)
  && /<button(?![^>]*disabled)[^>]*>Previous<\/button>/.test(borneHaute));

const filtresRendus = rendreListe({
  filters: { actor: "ANALYSTE", decision: DECISION_UNSPECIFIED, from: "2026-11-19", to: "2026-11-21" },
  resultCount: 2,
});
const optionSelectionnee = (filtresRendus.match(/<option[^>]*selected=""[^>]*>/g) ?? []).join("");
check("filtres affichés dans les champs",
  filtresRendus.includes('id="journal-actor"')
  && filtresRendus.includes('value="ANALYSTE"')
  && optionSelectionnee.includes(`value="${DECISION_UNSPECIFIED}"`)
  && /id="journal-from"[^>]*value="2026-11-19"/.test(filtresRendus)
  && /id="journal-to"[^>]*value="2026-11-21"/.test(filtresRendus));
check("compteur adapté aux résultats filtrés",
  filtresRendus.includes("2 results — page 1 / 2"));

const tronqueRendu = rendreListe({ truncated: true });
check("troncature annoncée",
  tronqueRendu.includes('role="status"')
  && tronqueRendu.includes("Journal truncated to the 10,000 most recent decisions"));

const chargement = rendreListe({ rows: [], resultCount: 0, loading: true });
check("état de chargement annoncé", chargement.includes('role="status"')
  && chargement.includes("Loading journal…")
  && (chargement.match(/disabled=""/g) ?? []).length === 2);

const erreur = rendreListe({ rows: [], resultCount: 0, error: "/api/journal/review → 500" });
check("erreur affichée sans prétendre que la liste est vide",
  erreur.includes('role="alert"') && erreur.includes("API: /api/journal/review → 500")
  && !erreur.includes("no decisions recorded"));

const vide = rendreListe({ rows: [], resultCount: 0, pageCount: 1 });
check("état vide explicite", vide.includes("no decisions recorded")
  && vide.includes("0 result — page 1 / 1") && !vide.includes('role="alert"'));

const sansDecision = rendreListe({
  rows: [{ ...decisions[3], decision: null, raison: null, indice: null }],
  resultCount: 1,
  pageCount: 1,
});
check("fait sans décision ni raison reste lisible",
  sansDecision.includes("Not specified") && sansDecision.includes('data-decision="unknown"')
  && sansDecision.includes("—"));

const ecran = renderToStaticMarkup(<JournalView />);
check("écran monté en chargement avant la réponse API",
  ecran.includes("Loading journal…") && ecran.includes("Journal"));

console.log(failures === 0 ? "\nJournal : tous les contrôles passent." : `\nJournal : ${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
