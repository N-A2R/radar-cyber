import type { Collector, NormalizedEvent } from "@radar/shared";

interface TreeEntry {
  path: string;
  type: string;
}

interface PoCRepo {
  html_url?: string;
  created_at?: string;
  pushed_at?: string;
}

const MAX_FILES = 60;

export const collector: Collector = {
  id: "poc_github",
  family: "vuln",
  intervalSec: 86400,
  async run(ctx) {
    const tree = await ctx.fetchJson<{ tree?: TreeEntry[] }>(
      "https://api.github.com/repos/nomi-sec/PoC-in-GitHub/git/trees/master?recursive=1"
    );
    const entries = Array.isArray(tree?.tree) ? tree.tree : [];
    const currentYear = new Date(ctx.now()).getUTCFullYear();
    const minYear = currentYear - 1;

    const files = entries
      .filter((e) => e.type === "blob" && /\.json$/i.test(e.path))
      .filter((e) => {
        const y = parseInt(e.path.split("/")[0] ?? "", 10);
        return !isNaN(y) && y >= minYear;
      })
      .sort((a, b) => b.path.localeCompare(a.path))
      .slice(0, MAX_FILES);

    const events: NormalizedEvent[] = [];
    const seen = new Set<string>();

    for (const f of files) {
      const cve = (f.path.split("/").pop() ?? "").replace(/\.json$/i, "").toUpperCase();
      if (!/^CVE-\d{4}-\d+$/i.test(cve)) continue;
      if (seen.has(cve)) continue;
      seen.add(cve);

      let repos: PoCRepo[] = [];
      try {
        repos = await ctx.fetchJson<PoCRepo[]>(
          `https://raw.githubusercontent.com/nomi-sec/PoC-in-GitHub/master/${f.path}`
        );
      } catch {
        continue;
      }
      if (!Array.isArray(repos) || repos.length === 0) continue;

      const first = repos[0]!;
      const observedAt = first.pushed_at ?? first.created_at;
      const iso = observedAt ? new Date(observedAt).toISOString() : undefined;
      if (!iso) continue;

      events.push({
        dedupKey: `poc:${cve}`,
        family: "vuln",
        assertionType: "technical_indicator",
        title: `${cve} — PoC public disponible`.slice(0, 300),
        observedAt: iso,
        severity: 4,
        confidence: "B2",
        sourceId: "poc_github",
        sourceUrl: first.html_url ?? `https://github.com/nomi-sec/PoC-in-GitHub/blob/master/${f.path}`,
        evidence: { pocCount: repos.length, repo: first.html_url ?? null },
        geoType: "unknown",
      });
    }

    return { events, cursor: { lastDate: ctx.now().toISOString() } };
  },
};
