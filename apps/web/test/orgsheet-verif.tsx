/**
 * Vérification du rendu de la fiche organisation avec une réponse factice
 * typée — aucun réseau, aucun effet React (le rendu statique n'exécute pas
 * useEffect, d'où le composant de présentation `OrgSheetContenu`).
 *
 *   pnpm -F @radar/web run test:orgsheet
 */
import { renderToStaticMarkup } from "react-dom/server";
import { OrgSheetBody, OrgSheetContenu } from "../src/components/OrgSheet";
import type { OrgDetail, OrgEventRecent, OrgLien } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const liees: OrgLien[] = [
  { id: 12, name: "Bordeaux Métropole", kind: "collectivite", relation: "mere" },
  { id: 13, name: "Mairie de Bordeaux", kind: "collectivite", relation: "etablissement" },
];

const evenements: OrgEventRecent[] = Array.from({ length: 20 }, (_, i) => ({
  id: `evt-${i + 1}`,
  title: `Signal ${String(i + 1).padStart(2, "0")}`,
  family: "phishing",
  severity: 3,
  observedAt: `2026-11-${String(20 - (i % 20)).padStart(2, "0")}T10:00:00Z`,
}));

/** Réponse factice de GET /api/orgs/42, typée comme la vraie réponse d'API. */
const fiche: OrgDetail = {
  org: {
    id: 42,
    name: "CHU de Bordeaux",
    slug: "chu-bordeaux",
    kind: "sante",
    sector: "santé",
    city: "Bordeaux",
    dept: "33",
    domain: "chu-bordeaux.fr",
    lat: null,
    lon: null,
    eventCount: 23,
  },
  aliases: ["CHU Bordeaux", "CHUB"],
  domains: ["chu-bordeaux.fr", "www.chu-bordeaux.fr"],
  relatedOrgs: liees,
  sourceCount: 7,
  assets: {
    total: 1,
    byKind: [{ kind: "subdomain", n: 1 }],
    recent: [{
      value: "vpn.chu-bordeaux.fr",
      kind: "subdomain",
      firstSeen: "2026-10-05T10:00:00Z",
      source: "certificate-transparency",
    }],
  },
  events: { total: 23, byFamily: [{ family: "phishing", n: 20 }], recent: evenements },
  claims: { total: 0, recent: [] },
  exposure: [],
};

const pret = renderToStaticMarkup(
  <OrgSheetContenu state={{ status: "ready", data: fiche }} onClose={() => {}} />,
);
check("nom de l'organisation en titre", pret.includes("CHU de Bordeaux"));
check("alias affichés", fiche.aliases.every((a) => pret.includes(a)));
check("domaines affichés", fiche.domains.every((d) => pret.includes(d)));
check("bouton de rapport 10 pages en anglais", pret.includes("Download 10-page report (PDF)"));
check(
  "20 événements récents rendus",
  evenements.every((e) => pret.includes(e.title)) && pret.includes("20 plus récents affichés"),
  `${evenements.length} lignes`,
);
check(
  "organisations liées et nature du lien",
  liees.every((o) => pret.includes(o.name))
    && pret.includes("organisation mère")
    && pret.includes("établissement rattaché"),
);
check("nombre de sources affiché", pret.includes(`>${fiche.sourceCount}<`));
check("bouton de fermeture présent", pret.includes('aria-label="Fermer la fiche"'));
check(
  "actif et date de première observation (champ firstSeen de l'API)",
  pret.includes("vpn.chu-bordeaux.fr") && pret.includes("05 oct. 2026")
    && pret.includes("certificate-transparency") && pret.includes("sous-domaine"),
);
check("corps rendu depuis la réponse typée", renderToStaticMarkup(<OrgSheetBody data={fiche} />).length > 0);

const vide: OrgDetail = {
  ...fiche,
  aliases: [],
  domains: [],
  relatedOrgs: [],
  sourceCount: 0,
  assets: { total: 0, byKind: [], recent: [] },
  events: { total: 0, byFamily: [], recent: [] },
};
const htmlVide = renderToStaticMarkup(
  <OrgSheetContenu state={{ status: "ready", data: vide }} onClose={() => {}} />,
);
const manquantsVides = ["aucun alias connu", "aucun domaine connu", "aucune organisation liée", "aucune source", "aucun événement rattaché", "aucun actif découvert"]
  .filter((message) => !htmlVide.includes(message));
check("états vides explicites", manquantsVides.length === 0, manquantsVides.join(", "));
check(
  "état vide : aucune donnée inventée",
  !htmlVide.includes("Signal 01") && !htmlVide.includes(">7<") && !htmlVide.includes("vpn.chu-bordeaux.fr"),
  [htmlVide.includes("Signal 01") && "Signal 01", htmlVide.includes(">7<") && ">7<",
    htmlVide.includes("vpn.chu-bordeaux.fr") && "actif"].filter(Boolean).join(", "),
);

const erreur = renderToStaticMarkup(
  <OrgSheetContenu state={{ status: "error", message: "/api/orgs/42 → 500" }} onClose={() => {}} />,
);
check(
  "erreur : annonce et message d'API",
  erreur.includes('role="alert"') && erreur.includes("API : /api/orgs/42 → 500"),
);
check("erreur : aucun corps de fiche", !erreur.includes("orgsheet__body") && !erreur.includes("Signal 01"));

const chargement = renderToStaticMarkup(
  <OrgSheetContenu state={{ status: "loading" }} onClose={() => {}} />,
);
check("chargement annoncé sans chiffre inventé", chargement.includes('role="status"')
  && chargement.includes("chargement de la fiche") && !chargement.includes("orgsheet__body"));

const introuvable = renderToStaticMarkup(
  <OrgSheetContenu state={{ status: "notfound" }} onClose={() => {}} />,
);
check("organisation inconnue", introuvable.includes("organisation inconnue"));

console.log(failures === 0
  ? "\nFiche organisation : tous les contrôles passent."
  : `\nFiche organisation : ${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
