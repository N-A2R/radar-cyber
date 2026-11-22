/**
 * Runtime render check for the press-only panel, without a browser.
 * Verifies the figure, the English labels, and that no victim-level field
 * can reach the DOM.
 */
import { renderToStaticMarkup } from "react-dom/server";
import CorpusView from "../src/components/CorpusView";
import type { CorpusStats, PressOnlySummary } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
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

const pressOnly = {
  scope: "Nouvelle-Aquitaine",
  definition: "rapporte",
  corpusTotal: 60,
  count: 21,
  withGreySource: 3,
  byDepartment: [{ department: "33", count: 5 }],
  byPublisherKind: { press: 18, grey: 3 },
  incidents: [
    {
      id: "na-2026-002",
      department: "33",
      publicationDate: "2026-08-19",
      publisherKind: "press",
      incidentType: "compromission",
      entite: "VICTIM_NAME_MARKER",
    },
  ],
} as unknown as PressOnlySummary;

const html = renderToStaticMarkup(
  <CorpusView data={corpus} pressOnly={pressOnly} loading={false} error={null} />,
);

check("press-only panel rendered", html.includes("Press-only incidents"));
check("measured count shown", html.includes(">21<") && html.includes("of 60 corpus incidents"));
check("incident id shown", html.includes("na-2026-002"));
check("scope shown", html.includes("Nouvelle-Aquitaine"));
check("definition shown in English", html.includes("reported by the press"));
check("no victim name in DOM", !html.includes("VICTIM_NAME_MARKER"));
check("no publisher name in DOM", !html.includes("Sud Ouest"));

const loading = renderToStaticMarkup(<CorpusView data={corpus} pressOnly={null} pressOnlyLoading />);
check("loading state is explicit", loading.includes("Loading press-only incidents…"));

const failing = renderToStaticMarkup(
  <CorpusView data={corpus} pressOnly={null} pressOnlyError="unavailable" />,
);
check("failure state is explicit", failing.includes("Could not load press-only incidents: unavailable"));

if (failures > 0) process.exitCode = 1;
