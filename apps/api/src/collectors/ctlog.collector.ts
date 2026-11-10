import type { Collector, NormalizedEvent } from "@radar/shared";
import { query } from "../db.js";
import { createHash } from "node:crypto";

interface CrtEntry {
  issuer_name?: string;
  not_before?: string;
  serial_number?: string;
  name_value?: string;
}

const MAX_DOMAINS_PER_RUN = 10;
const MAX_IDENTITIES = 5;

export const collector: Collector = {
  id: "ctlog",
  family: "cti",
  intervalSec: 86400,
  async run(ctx) {
    const rows = await query<{ id: number; name: string; value: string }>(
      `SELECT o.id, o.name, a.value FROM asset a JOIN org o ON o.id=a.org_id WHERE a.kind='domain' AND a.status='confirme' ORDER BY a.id`,
    );
    const domains = rows.rows;

    const cursor = (ctx.cursor ?? {}) as { idx?: number; seen?: Record<string, true> };
    const seen: Record<string, true> = cursor.seen ?? {};
    let idx = typeof cursor.idx === "number" ? cursor.idx : 0;
    if (domains.length > 0 && idx >= domains.length) idx = 0;

    const events: NormalizedEvent[] = [];

    const end = Math.min(idx + MAX_DOMAINS_PER_RUN, domains.length);
    for (let i = idx; i < end; i++) {
      const d = domains[i];
      const domain = String(d.value).trim().toLowerCase();
      if (!domain) continue;
      let data: CrtEntry[] = [];
      try {
        const res = await ctx.fetchJson<CrtEntry[]>(
          `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`,
        );
        data = Array.isArray(res) ? res : [];
      } catch (e) {
        ctx.log(`ctlog: ${domain} erreur/timeout — skip`);
        continue;
      }

      for (const c of data) {
        const ident = String(c.name_value ?? "").trim();
        const notBefore = String(c.not_before ?? "").trim();
        const serial = String(c.serial_number ?? "").trim();
        const issuer = String(c.issuer_name ?? "").trim();
        const hash = createHash("sha256")
          .update(`${ident}|${notBefore}|${serial}`)
          .digest("hex")
          .slice(0, 24);
        if (seen[hash]) continue;
        seen[hash] = true;

        const identities = ident
          .split(/\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, MAX_IDENTITIES);

        const dedupKey = `ctlog:${hash}`;
        let observedAt: string | undefined;
        if (notBefore) {
          try { observedAt = new Date(notBefore).toISOString(); } catch { observedAt = undefined; }
        }

        events.push({
          dedupKey,
          family: "cti",
          assertionType: "ambient_signal",
          title: `Nouveau certificat TLS pour ${domain}`,
          observedAt,
          severity: 2,
          confidence: "B2",
          sourceId: "ctlog",
          sourceUrl: `https://crt.sh/?q=%25.${encodeURIComponent(domain)}`,
          evidence: {
            issuer,
            not_before: notBefore,
            serial,
            identities,
          },
          geoType: "unknown",
          orgHint: d.name,
        });
      }
    }

    const keys = Object.keys(seen);
    if (keys.length > 5000) {
      const trim = keys.length - 5000;
      for (let k = 0; k < trim; k++) delete seen[keys[k]];
    }

    const newIdx = domains.length === 0 ? 0 : (end >= domains.length ? 0 : end);
    return { events, cursor: { idx: newIdx, seen } };
  },
};
