/**
 * Runtime render check for the unconfirmed-claims panel, without a browser.
 * Verifies the figure, the English labels, and that no victim-level field
 * can reach the DOM.
 */
import { renderToStaticMarkup } from "react-dom/server";
import CorpusView from "../src/components/CorpusView";
import type { CorpusStats, UnconfirmedClaimsSummary } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}`);
}

const corpus = {
  generatedAt: "2026-11-22T00:00:00.000Z",
  totals: { sources: 469, sourcesLocalised: 200, organisations: 1673220, incidents: 1756 },
  families: ["presse"],
  byDepartment: [],
  domainCoverage: { withDomain: 1, organisations: 2, percent: 50 },
  sinceLastReport: {
    windowHours: 24, newEvents: 1, previousEvents: 1, change: 0, percentChange: 0,
    comparedTo: "previous 24 hours",
  },
  recentIncidents: [],
} as unknown as CorpusStats;

const claims = {
  scope: "Nouvelle-Aquitaine",
  definition: "declare",
  corpusTotal: 60,
  count: 6,
  withGreySource: 4,
  byDepartment: [],
  byPublisherKind: { press: 2, grey: 4, unknown: 0 },
  incidents: [
    {
      id: "na-2026-010",
      entite: "VICTIM_NAME_MARKER",
      resume: "RESUME_MARKER",
      department: "33",
      publicationDate: "2026-07-16",
      publisherKind: "grey",
      incidentType: "ransomware",
    },
  ],
} as unknown as UnconfirmedClaimsSummary;

const html = renderToStaticMarkup(
  <CorpusView data={corpus} unconfirmedClaims={claims} loading={false} error={null} />,
);

check("unconfirmed claims panel rendered", html.includes("Unconfirmed claims"));
check("measured count shown", html.includes(">6<") && html.includes("of 60 corpus incidents"));
check("incident id shown", html.includes("na-2026-010"));
check("scope shown", html.includes("Nouvelle-Aquitaine"));
check("definition shown in English", html.includes("attacker claim"));
check("grey sources are leads, not confirmation", html.includes("never confirmation"));
check("no victim name in DOM", !html.includes("VICTIM_NAME_MARKER"));
check("no publisher name in DOM", !html.includes("FrenchBreaches"));

const loading = renderToStaticMarkup(<CorpusView data={corpus} unconfirmedClaims={null} unconfirmedClaimsLoading />);
check("loading state is explicit", loading.includes("Loading unconfirmed claims…"));

const failing = renderToStaticMarkup(
  <CorpusView data={corpus} unconfirmedClaims={null} unconfirmedClaimsError="unavailable" />,
);
check("failure state is explicit", failing.includes("Could not load unconfirmed claims: unavailable"));

if (failures > 0) process.exitCode = 1;
