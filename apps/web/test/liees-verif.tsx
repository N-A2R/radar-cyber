/**
 * Vérification de la carte « organisations reliées », sans navigateur.
 *
 * Les chiffres ci-dessous sont un relevé réel sur la base de test (5433) :
 *   SELECT (SELECT count(DISTINCT org_id)::int FROM event WHERE org_id IS NOT NULL
 *             AND COALESCE(observed_at, collected_at) >= now() - interval '7 days') AS semaine,
 *          (SELECT count(*)::int FROM quarantine_raw WHERE promoted=true) AS total,
 *          (SELECT count(*)::int FROM quarantine_raw WHERE kind='claim' AND status='pending'
 *             AND promoted=false AND org_hint IS NOT NULL AND btrim(org_hint) <> '') AS en_attente,
 *          (SELECT count(DISTINCT subject)::int FROM journal WHERE kind='review.decided') AS examinees;
 * Les départements sont le top 5 réel de la même fenêtre de 7 jours.
 */
import { renderToStaticMarkup } from "react-dom/server";
import LieesCard, { LieesContenu, type OrgsLiees } from "../src/components/LieesCard";
import TodayView from "../src/components/TodayView";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const mesure: OrgsLiees = {
  semaine: 26,
  total: 26,
  enAttente: 220,
  examinees: 16576,
  parDepartement: [
    { dept: "33", n: 8 },
    { dept: "16", n: 2 },
    { dept: "17", n: 2 },
    { dept: "64", n: 2 },
    { dept: "75", n: 2 },
  ],
};

const avecDonnees = renderToStaticMarkup(
  <LieesContenu data={mesure} loading={false} error={null} />,
);
check("titre et période affichés", avecDonnees.includes("Organisations reliées — 7 jours"));
check("grand nombre = 26 mesurés", avecDonnees.includes(">26</p>"));
check("depuis toujours / attente / examinées", avecDonnees.includes(">26</dd>")
  && avecDonnees.includes(">220</dd>") && />16[\u202f\u00a0 ]576<\/dd>/.test(avecDonnees));
check("top 5 départements", avecDonnees.includes(">33</span>") && avecDonnees.includes(">8</span>")
  && avecDonnees.includes(">75</span>") && (avecDonnees.match(/class="liees__dept"/g) ?? []).length === 5);

const chargement = renderToStaticMarkup(
  <LieesContenu data={null} loading error={null} />,
);
check("chargement sans chiffre inventé", chargement.includes("chargement des organisations reliées")
  && !chargement.includes(">0<"));

const erreur = renderToStaticMarkup(
  <LieesContenu data={null} loading={false} error="/api/orgs/liees → 500" />,
);
check("erreur : message affiché, pas un zéro", erreur.includes("API : /api/orgs/liees → 500")
  && erreur.includes('role="alert"') && !erreur.includes(">0<"));

const vide = renderToStaticMarkup(
  <LieesContenu
    data={{ semaine: 0, total: 0, enAttente: 0, examinees: 0, parDepartement: [] }}
    loading={false} error={null}
  />,
);
check("état vide explicite", vide.includes("aucune organisation reliée mesurée")
  && !vide.includes(">0<") && !vide.includes("0</p>"));

const carte = renderToStaticMarkup(<LieesCard />);
check("carte autonome en chargement avant réponse", carte.includes("chargement des organisations reliées"));

const ecran = renderToStaticMarkup(
  <TodayView data={null} loading error={null} family={null} dept={null}
    onFamily={() => {}} onDept={() => {}} onOpenOrg={() => {}} onOpenEvent={() => {}} />,
);
check("carte montée en haut de l'écran Aujourd'hui",
  ecran.indexOf("Organisations reliées — 7 jours") < ecran.indexOf("veille du jour")
  && ecran.includes("liees"));

console.log(failures === 0 ? "\nLiées : tous les contrôles passent." : `\nLiées : ${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
