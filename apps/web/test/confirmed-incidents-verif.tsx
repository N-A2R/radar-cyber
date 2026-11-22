/**
 * Runtime render check for the confirmed-incidents panel, without a browser.
 * Verifies the figure, the English labels, and that no victim-level field
 * can reach the DOM.
 */
import { renderToStaticMarkup } from "react-dom/server";
import CorpusView from "../src/components/CorpusView";
import type { CorpusStats, ConfirmedIncidentsSummary } from "../src/api";

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

const confirmed = {
  scope: "Nouvelle-Aquitaine",
  definition: "etabli",
  corpusTotal: 60,
  withGreySource: 7,
  count: 33,
  byDepartment: [],
  byPublisherKind: { press: 20, grey: 1, official: 8, unknown: 4 },
  incidents: [
    {
      id: "na-2026-001",
      entite: "VICTIM_NAME_MARKER",
      resume: "RESUME_MARKER",
      department: "33",
      publicationDate: "2026-07-16",
      publisherKind: "press",
      incidentType: "ransomware",
    },
  ],
} as unknown as ConfirmedIncidentsSummary;

const html = renderToStaticMarkup(
  <CorpusView data={corpus} confirmedIncidents={confirmed} loading={false} error={null} />,
);
check("confirmed incidents panel rendered", html.includes("Confirmed incidents"));
check("measured count shown", html.includes(">33<") && html.includes("of 60 corpus incidents"));
check("incident id shown", html.includes("na-2026-001"));
check("scope shown", html.includes("Nouvelle-Aquitaine"));
check("definition shown in English", html.includes("confirmed by a victim or authority"));
check("grey sources are leads, not confirmation", html.includes("Grey public publishers are leads only, never confirmation"));
check("no victim name in DOM", !html.includes("VICTIM_NAME_MARKER"));
check("no free text in DOM", !html.includes("RESUME_MARKER"));

const loading = renderToStaticMarkup(<CorpusView data={corpus} confirmedIncidents={null} confirmedIncidentsLoading />);
check("loading state is explicit", loading.includes("Loading confirmed incidents…"));

const failing = renderToStaticMarkup(
  <CorpusView data={corpus} confirmedIncidents={null} confirmedIncidentsError="unavailable" />,
);
check("failure state is explicit", failing.includes("Could not load confirmed incidents: unavailable"));

if (failures > 0) process.exitCode = 1;
