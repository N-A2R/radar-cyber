/**
 * Vérification du filtre pur et du rendu SSR de l'écran Journal.
 * Aucune base, aucun navigateur — les composants sont alimentés par un jeu de
 * données typé, exactement comme le navigateur le sera par l'API.
 */
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { JournalDecision } from "../src/api";
import JournalListe, { DECISION_NON_PRECISEE } from "../src/components/JournalListe";
import JournalView, { filtrerJournal } from "../src/components/JournalView";
import type { JournalFiltres } from "../src/components/JournalView";

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
const filtre = (patch: JournalFiltres) => filtrerJournal(decisions, patch);

/* Filtre pur : toutes les combinaisons sont déterministes et sans effet de bord. */
check("acteur : sous-chaîne insensible à la casse",
  ids(filtre({ acteur: "ANALYSTE" })) === "46,41");
check("acteur : sous-chaîne au milieu d'un acteur déjà en majuscules",
  ids(filtre({ acteur: "Moteur:TRIAGE" })) === "44,43");
check("acteur absent ou vide : aucune restriction",
  ids(filtre({})) === "46,45,44,43,42,41" && ids(filtre({ acteur: "" })) === ids(filtre({})));
check("acteur sans correspondance : liste vide", filtre({ acteur: "robot" }).length === 0);

check("décision accepter", ids(filtre({ decision: "accepter" })) === "46,42");
check("décision refuser", ids(filtre({ decision: "refuser" })) === "45,41");
check("décision creer", ids(filtre({ decision: "creer" })) === "44");
check("décision non précisée", ids(filtre({ decision: DECISION_NON_PRECISEE })) === "43");
check("décision absente ou vide : aucune restriction",
  ids(filtre({ decision: undefined })) === ids(filtre({})) && ids(filtre({ decision: "" })) === ids(filtre({})));

check("borne du seulement", ids(filtre({ du: "2026-11-20" })) === "46,45,44,43");
check("borne au seulement", ids(filtre({ au: "2026-11-20" })) === "44,43,42,41");
check("bornes inclusives sur un même jour",
  ids(filtre({ du: "2026-11-20", au: "2026-11-20" })) === "44,43");
check("deux bornes distinctes",
  ids(filtre({ du: "2026-11-19", au: "2026-11-20" })) === "44,43,42,41");
check("plage sans aucune ligne",
  filtre({ du: "2026-11-22", au: "2026-11-30" }).length === 0);

check("combinaison acteur + décision + plage",
  ids(filtre({ acteur: "humain", decision: "accepter", du: "2026-11-19", au: "2026-11-21" })) === "46,42");
check("combinaison moteur + non précisée + borne du",
  ids(filtre({ acteur: "moteur", decision: DECISION_NON_PRECISEE, du: "2026-11-20" })) === "43");

const sansFiltre = filtre({});
check("aucun filtre : mêmes lignes, même ordre, mêmes références",
  sansFiltre.length === decisions.length
  && sansFiltre.every((row, i) => row === decisions[i])
  && sansFiltre !== decisions);
check("champs vides : même résultat que sans filtre",
  ids(filtre({ acteur: "", decision: "", du: "", au: "" })) === ids(sansFiltre));

const avant = JSON.stringify(decisions);
const references = [...decisions];
const apresFiltre = filtre({ acteur: "moteur", decision: "refuser" });
check("filtrage sans mutation du tableau source",
  apresFiltre.length === 0 && JSON.stringify(decisions) === avant
  && decisions.every((row, i) => row === references[i]));

/* Rendu SSR : mêmes props qu'en navigateur, sans API ni interaction. */
type PropsListe = ComponentProps<typeof JournalListe>;
function rendreListe(surcharges: Partial<PropsListe> = {}) {
  return renderToStaticMarkup(
    <JournalListe
      rows={decisions}
      resultats={decisions.length}
      filtres={{}}
      onFiltre={() => {}}
      onReset={() => {}}
      tronque={false}
      loading={false}
      error={null}
      page={1}
      pageCount={2}
      onPrecedent={() => {}}
      onSuivant={() => {}}
      {...surcharges}
    />,
  );
}

const rendu = rendreListe();
check("en-têtes des cinq colonnes",
  ["horodatage", "acteur", "décision", "indice", "raison"].every((col) => rendu.includes(`>${col}</th>`)));
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
  rendu.includes("6 résultats — page 1 / 2"));

const borneHaute = rendreListe({ page: 2 });
check("première page : Précédent désactivé, Suivant actif",
  /<button[^>]*disabled=""[^>]*>Précédent<\/button>/.test(rendu)
  && /<button(?![^>]*disabled)[^>]*>Suivant<\/button>/.test(rendu));
check("dernière page : Suivant désactivé, Précédent actif",
  borneHaute.includes("page 2 / 2")
  && /<button[^>]*disabled=""[^>]*>Suivant<\/button>/.test(borneHaute)
  && /<button(?![^>]*disabled)[^>]*>Précédent<\/button>/.test(borneHaute));

const filtresRendus = rendreListe({
  filtres: { acteur: "ANALYSTE", decision: DECISION_NON_PRECISEE, du: "2026-11-19", au: "2026-11-21" },
  resultats: 2,
});
const optionSelectionnee = (filtresRendus.match(/<option[^>]*selected=""[^>]*>/g) ?? []).join("");
check("filtres affichés dans les champs",
  filtresRendus.includes('id="journal-acteur"')
  && filtresRendus.includes('value="ANALYSTE"')
  && optionSelectionnee.includes('value="non-precisee"')
  && /id="journal-du"[^>]*value="2026-11-19"/.test(filtresRendus)
  && /id="journal-au"[^>]*value="2026-11-21"/.test(filtresRendus));
check("compteur adapté aux résultats filtrés",
  filtresRendus.includes("2 résultats — page 1 / 2"));

const tronqueRendu = rendreListe({ tronque: true });
check("troncature annoncée",
  tronqueRendu.includes('role="status"')
  && tronqueRendu.includes("Journal tronqué aux 10 000 décisions les plus récentes"));

const chargement = rendreListe({ rows: [], resultats: 0, loading: true });
check("état de chargement annoncé", chargement.includes('role="status"')
  && chargement.includes("Chargement du journal…")
  && (chargement.match(/disabled=""/g) ?? []).length === 2);

const erreur = rendreListe({ rows: [], resultats: 0, error: "/api/journal/review → 500" });
check("erreur affichée sans prétendre que la liste est vide",
  erreur.includes('role="alert"') && erreur.includes("API : /api/journal/review → 500")
  && !erreur.includes("aucune décision enregistrée"));

const vide = rendreListe({ rows: [], resultats: 0, pageCount: 1 });
check("état vide explicite", vide.includes("aucune décision enregistrée")
  && vide.includes("0 résultat — page 1 / 1") && !vide.includes('role="alert"'));

const sansDecision = rendreListe({
  rows: [{ ...decisions[3], decision: null, raison: null, indice: null }],
  resultats: 1,
  pageCount: 1,
});
check("fait sans décision ni raison reste lisible",
  sansDecision.includes("non précisée") && sansDecision.includes('data-decision="inconnue"')
  && sansDecision.includes("—"));

const ecran = renderToStaticMarkup(<JournalView />);
check("écran monté en chargement avant la réponse API",
  ecran.includes("Chargement du journal…") && ecran.includes("Journal"));

console.log(failures === 0 ? "\nJournal : tous les contrôles passent." : `\nJournal : ${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
