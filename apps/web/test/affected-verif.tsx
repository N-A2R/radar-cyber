/**
 * SSR rendering of the "Am I affected?" view — no browser, no network.
 *
 * Every check covers one observable behaviour: English labels, one row per
 * statement with its full evidence, an unconfirmed claim still visible, an
 * absent personal-data leak, and the loading / empty / error / no-statement
 * states.
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
    },
  ],
  summary: { statements: 2, withEvidence: 2, sources: 2 },
  limitations: [SECRET],
  // Free text that must never reach the interface, even if it sneaks in.
  eventTitle: SECRET,
} as AffectedReport & { eventTitle: string };

const html = renderToStaticMarkup(<AffectedView report={report} query="Example Works" />);

check("the view has an English title", html.includes("Am I affected?"));
check("the search field is labelled Organization", html.includes(">Organization</label>"));
check("there is a Check button", html.includes(">Check</button>"));
check("the submitted query fills the field", html.includes('value="Example Works"'));
check("the regional scope is stated", html.includes("Nouvelle-Aquitaine only"));
check("the privacy note is stated", html.includes("No victim personal data is displayed."));
check("the summary counts are shown", html.includes("2 statements / 2 with evidence / 2 sources"));
check("one row is rendered per statement", (html.match(/class="affected__statement"/g) ?? []).length === 2);
check("the category is shown", html.includes('data-category="claim"'));
check("the statement label is shown", html.includes("Ransomware extortion claim"));
check("the statement value is shown", html.includes("Example Works"));
check("the observed date is shown when present", html.includes("Observed: <time dateTime=\"2026-11-20T10:00:00.000Z\">2026-11-20T10:00:00.000Z</time>"));
for (const statement of report.statements) {
  check(`publisher ${statement.id} is shown`, html.includes(statement.evidence.label));
  check(`reference ${statement.id} is shown`, html.includes(statement.evidence.reference));
  check(`status ${statement.id} is shown`, html.includes(`data-status="${statement.evidence.status}"`));
}
check("an unverified claim is named in English", html.includes("Unverified claim"));
check("a source URL is clickable when present", html.includes('href="https://example.org/notice/7"'));
check("no raw personal data is leaked", !html.includes(SECRET));
check("no contact detail is leaked", !html.includes("victim@example.fr"));

const noUrl = renderToStaticMarkup(<AffectedView report={{
  ...report,
  statements: [{ ...report.statements[0], evidence: { ...report.statements[0].evidence, url: null } }],
}} />);
check("no link is rendered when no URL is present", !noUrl.includes("href="));

const loading = renderToStaticMarkup(<AffectedView loading />);
check("the loading state is announced", loading.includes('role="status"') && loading.includes("Loading report..."));

const error = renderToStaticMarkup(<AffectedView error="Organization not found" query="Ghost SARL" />);
check("the error is shown", error.includes('role="alert"') && error.includes("Organization not found"));

const empty = renderToStaticMarkup(<AffectedView />);
check("the empty state asks for an organization", empty.includes("Enter an organization name, identifier or domain to check."));
check("the empty state shows no summary", !empty.includes("statements /"));

const none = renderToStaticMarkup(<AffectedView report={{
  ...report,
  statements: [],
  summary: { statements: 0, withEvidence: 0, sources: 0 },
}} />);
check("a zero-statement report says so", none.includes("No statements recorded for this organization."));
check("a zero-statement report counts to zero", none.includes("0 statements / 0 with evidence / 0 sources"));

console.log(failures === 0 ? "\naffected view: all green" : `\naffected view: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
