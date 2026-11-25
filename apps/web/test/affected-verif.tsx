/**
 * Rendu SSR de l'écran « Suis-je concerné ? » — sans navigateur, sans réseau.
 *
 * Chaque vérification couvre un comportement observable : libellés français,
 * une ligne par constat avec sa preuve complète, une allégation non confirmée
 * toujours visible, aucune fuite de donnée personnelle, et les états
 * chargement / vide / erreur / aucun constat.
 */
import { renderToStaticMarkup } from "react-dom/server";
import AffectedView from "../src/components/AffectedView";
import type { AffectedReport } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const SECRET = "Victim Name 0601020304 victim@example.fr";

const report = {
  organization: { id: 42, name: "Example Works", department: "33", region: "Nouvelle-Aquitaine" },
  scope: "nouvelle-aquitaine",
  statements: [
    {
      id: "registry:name",
      category: "identity",
      label: "Registered name",
      value: "Example Works",
      observedAt: "2026-11-20T10:00:00.000Z",
      evidence: {
        kind: "registry",
        label: "Sirene register",
        reference: "SIREN 123456789",
        url: null,
        status: "official-record",
      },
    },
    {
      id: "event:7",
      category: "claim",
      label: "Ransomware extortion claim",
      value: "Ransomware extortion claim",
      observedAt: null,
      evidence: {
        kind: "claim",
        label: "Leak Site Watch",
        reference: "event:7",
        url: "https://example.org/notice/7",
        status: "unverified-claim",
      },
      raw: {
        title: SECRET,
        summary: "Résumé brut avec victime@example.fr",
        sourceUrl: "https://example.org/notice/7?token=secret",
        evidence: { raw_body: SECRET },
      },
    },
  ],
  summary: { statements: 2, withEvidence: 2, sources: 2 },
  limitations: [SECRET],
  // Free text that must never reach the interface, even if it sneaks in.
  eventTitle: SECRET,
} as AffectedReport & { eventTitle: string };

const html = renderToStaticMarkup(<AffectedView report={report} query="Example Works" />);

check("la vue porte un titre français", html.includes("Suis-je concerné ?"));
check("le champ de recherche est étiqueté Organisation", html.includes(">Organisation</label>"));
check("il y a un bouton Vérifier", html.includes(">Vérifier</button>"));
check("la requête soumise remplit le champ", html.includes('value="Example Works"'));
check("le périmètre régional est annoncé", html.includes("Nouvelle-Aquitaine uniquement"));
check("aucun badge de confidentialité RGPD", !html.includes("Aucune donnée personnelle"));
check("les compteurs du résumé sont affichés", html.includes("2 constats / 2 avec preuve / 2 sources"));
check("une ligne est rendue par constat", (html.match(/class="affected__statement"/g) ?? []).length === 2);
check("la catégorie est affichée", html.includes('data-category="claim"'));
check("le libellé du constat est affiché", html.includes("Ransomware extortion claim"));
check("la valeur du constat est affichée", html.includes("Example Works"));
check("la date d'observation est affichée quand elle existe", html.includes("Observé : <time dateTime=\"2026-11-20T10:00:00.000Z\">2026-11-20T10:00:00.000Z</time>"));
check("la preuve est titrée en français", html.includes(">Preuve</p>") && html.includes(">Éditeur</dt>"));
for (const statement of report.statements) {
  check(`publisher ${statement.id} is shown`, html.includes(statement.evidence.label));
  check(`reference ${statement.id} is shown`, html.includes(statement.evidence.reference));
  check(`status ${statement.id} is shown`, html.includes(`data-status="${statement.evidence.status}"`));
}
check("une allégation non vérifiée est nommée en français", html.includes("Allégation non vérifiée"));
check("un registre officiel est nommé en français", html.includes("Registre officiel"));
check("une URL de source est cliquable quand elle existe", html.includes('href="https://example.org/notice/7"'));
check("les données brutes sont affichées telles quelles", html.includes(SECRET) && html.includes("Données brutes"));
check("l'URL source brute conserve son jeton", html.includes("https://example.org/notice/7?token=secret"));

const noUrl = renderToStaticMarkup(<AffectedView report={{
  ...report,
  statements: [{ ...report.statements[0], evidence: { ...report.statements[0].evidence, url: null } }],
}} />);
check("aucun lien de preuve rendu sans URL", !noUrl.includes("href=\"https"));

const loading = renderToStaticMarkup(<AffectedView loading />);
check("l'état de chargement est annoncé", loading.includes('role="status"') && loading.includes("Chargement du rapport…"));

const error = renderToStaticMarkup(<AffectedView error="Organization not found" query="Ghost SARL" />);
check("l'erreur est affichée en français", error.includes('role="alert"') && error.includes("Erreur : Organization not found"));
check("une seule région live sur le conteneur de résultat",
  !html.includes("aria-live") && !loading.includes("aria-live") && !error.includes("aria-live"));

const empty = renderToStaticMarkup(<AffectedView />);
check("l'état vide demande une organisation", empty.includes("Saisissez un nom") && empty.includes("pour vérifier."));
check("l'état vide n'affiche aucun résumé", !empty.includes("constats /"));

const none = renderToStaticMarkup(<AffectedView report={{
  ...report,
  statements: [],
  summary: { statements: 0, withEvidence: 0, sources: 0 },
}} />);
check("un rapport sans constat le dit", none.includes("Aucun constat enregistré pour cette organisation."));
check("un rapport sans constat compte zéro", none.includes("0 constats / 0 avec preuve / 0 sources"));

check(
  "le geste est expliqué avant le champ",
  html.indexOf("déjà rattachées à un incident") > -1
    && html.indexOf("déjà rattachées à un incident") < html.indexOf('id="affected-query"'),
);
check(
  "le périmètre et le contenu du rapport sont annoncés",
  html.includes("données brutes de la source") && html.includes("sans juger de responsabilité"),
);
check("un lien vers la fiche est offert", html.includes('href="#/affected?org=42"'));
check("les incidents sont séparés de l'identité", html.includes("Incidents rattachés") && html.includes("Identité enregistrée"));
check("les familles d'incident sont résumées", html.includes("affected__family") && html.includes("rançongiciel"));
check("l'état de repos annonce ce qu'on obtient", empty.includes("incidents rattachés") && empty.includes("lien vers sa fiche"));

const notFound = renderToStaticMarkup(
  <AffectedView error="/affected?q=Ghost SARL → 404" query="Ghost SARL" />,
);
check(
  "aucun résultat rappelle la requête",
  notFound.includes("Aucune organisation ne correspond à « Ghost SARL »")
    && !notFound.includes("Erreur :"),
);

const outside = renderToStaticMarkup(
  <AffectedView error="/affected?q=Paris SARL → 403" query="Paris SARL" />,
);
check("hors région est expliqué", outside.includes("hors Nouvelle-Aquitaine"));

console.log(failures === 0 ? "\naffected view: all green" : `\naffected view: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
