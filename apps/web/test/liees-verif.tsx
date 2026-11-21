/**
 * Vérification de la carte « organisations reliées », sans navigateur.
 *
 * Les chiffres ci-dessous sont des valeurs de démonstration, pas un relevé de
 * la base : la ligne de base du compteur a changé avec les 20 créations
 * permanentes du lot domaines (2026-11-21). Les assertions dérivent donc du
 * jeu de données, jamais d'un total absolu codé en dur.
 */
import { renderToStaticMarkup } from "react-dom/server";
import LieesCard, { LieesContenu, type HistoriquePoint, type OrgsLiees } from "../src/components/LieesCard";
import TodayView from "../src/components/TodayView";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const mesure: OrgsLiees = {
  semaine: 7,
  total: 12,
  enAttente: 3,
  examinees: 9,
  parDepartement: [
    { dept: "33", n: 8 },
    { dept: "16", n: 2 },
    { dept: "17", n: 2 },
    { dept: "64", n: 2 },
    { dept: "75", n: 2 },
  ],
};

const historique: HistoriquePoint[] = [
  { jour: "2026-11-19", semaine: 10, total: 40, enAttente: 3, examinees: 1 },
  { jour: "2026-11-20", semaine: 14, total: 42, enAttente: 4, examinees: 2 },
  { jour: "2026-11-21", semaine: 26, total: 46, enAttente: 5, examinees: 3 },
];

const avecDonnees = renderToStaticMarkup(
  <LieesContenu data={mesure} loading={false} error={null} />,
);
check("titre et période affichés", avecDonnees.includes("Organisations reliées — 7 jours"));
check("grand nombre = mesure.semaine", avecDonnees.includes(`>${mesure.semaine}</p>`));
check("depuis toujours / attente / examinées", avecDonnees.includes(`>${mesure.total}</dd>`)
  && avecDonnees.includes(`>${mesure.enAttente}</dd>`) && avecDonnees.includes(`>${mesure.examinees}</dd>`));
check("top 5 départements", avecDonnees.includes(">33</span>") && avecDonnees.includes(">8</span>")
  && avecDonnees.includes(">75</span>") && (avecDonnees.match(/class="liees__dept"/g) ?? []).length === 5);

const avecCourbe = renderToStaticMarkup(
  <LieesContenu data={mesure} loading={false} error={null} historique={historique} />,
);
check("micro-courbe quand l'historique existe", avecCourbe.includes('class="liees__courbe"')
  && avecCourbe.includes('class="liees__courbe-trait"')
  && avecCourbe.includes("30 derniers jours"));
check("aucune courbe quand l'historique manque", !avecDonnees.includes("liees__courbe"));

const unSeulPoint = renderToStaticMarkup(
  <LieesContenu data={mesure} loading={false} error={null} historique={historique.slice(-1)} />,
);
check("un seul relevé : un point, pas une courbe vide",
  unSeulPoint.includes('class="liees__courbe-point"')
  && !unSeulPoint.includes("liees__courbe-trait"));

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
