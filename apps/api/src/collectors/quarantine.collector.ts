import { createHash } from "node:crypto";
import { query } from "../db.js";

const UA = "RadarCyberNA/0.2 (+https://github.com/j0ltdevv/radar-cyber)";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function getCursor(sourceId: string): Promise<Record<string, unknown>> {
  const r = await query<{ cursor: Record<string, unknown> }>("SELECT cursor FROM source WHERE id=$1", [sourceId]);
  return (r.rows[0]?.cursor ?? {}) as Record<string, unknown>;
}

async function setCursor(sourceId: string, cursor: Record<string, unknown>): Promise<void> {
  await query("UPDATE source SET cursor=$2::jsonb, last_ok_at=now() WHERE id=$1", [sourceId, JSON.stringify(cursor)]);
}

export async function runQuarantineCollector(log: (msg: string) => void): Promise<void> {
  // Source A : ransomware.live
  const srcA = "quarantine:ransomware.live";
  const cursorA = await getCursor(srcA);
  const lastRun = cursorA.lastRun ? Date.parse(String(cursorA.lastRun)) : NaN;
  const now = Date.now();
  if (Number.isNaN(lastRun) || now - lastRun >= 30 * 60 * 1000) {
    try {
      const res = await fetch("https://api.ransomware.live/v2/recentvictims", {
        headers: { "User-Agent": UA, "Attribution": "radar-cyber (internal use, no republish)" },
      });
      if (res.ok) {
        const data = (await res.json()) as Array<Record<string, unknown>>;
        let inserted = 0, ignored = 0;
        for (const v of data ?? []) {
          const sourceUrl = String(v.url ?? "").trim();
          if (!sourceUrl) { ignored++; continue; }
          const group = String(v.group ?? "").trim() || null;
          const orgHint = String(v.domain ?? v.post_title ?? "").trim() || null;
          const claimedAt = v.discovered ? new Date(String(v.discovered)).toISOString() : null;
          const contentHash = sha256(`ransomware.live${sourceUrl}${orgHint ?? ""}${claimedAt ?? ""}`);
          const extracted = {
            activity: v.activity ?? null,
            country: v.country ?? null,
            data_size: v.data_size ?? null,
            press: v.press ?? null,
            description: v.description ?? null,
          };
          const rawBody = v.description ? String(v.description).slice(0, 2000) : null;
          const r = await query(
            `INSERT INTO quarantine_raw (source, source_url, groupe, org_hint, claimed_at, extracted, raw_body, content_hash)
             VALUES ('ransomware.live',$1,$2,$3,$4,$5::jsonb,$6,$7)
             ON CONFLICT (source, content_hash) DO NOTHING`,
            [sourceUrl, group, orgHint, claimedAt, JSON.stringify(extracted), rawBody, contentHash]
          );
          if ((r.rowCount ?? 0) > 0) inserted++; else ignored++;
        }
        log(`ransomware.live: ${inserted} inséré(s), ${ignored} ignoré(s)`);
        await setCursor(srcA, { lastRun: new Date(now).toISOString(), done: false });
      } else {
        log(`ransomware.live: HTTP ${res.status}`);
      }
    } catch (e) {
      log(`ransomware.live: erreur ${String(e)}`);
    }
  } else {
    log("ransomware.live: rate limit (skip, <30 min)");
  }

  // Source B : backfill ransomwatch
  const srcB = "quarantine:ransomwatch";
  const cursorB = await getCursor(srcB);
  if (!cursorB.done) {
    try {
      const res = await fetch("https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json");
      if (res.ok) {
        const data = (await res.json()) as Array<Record<string, unknown>>;
        let inserted = 0, ignored = 0;
        for (const p of data ?? []) {
          const postTitle = String(p.post_title ?? "").trim();
          const groupName = String(p.group_name ?? "").trim() || null;
          const discovered = String(p.discovered ?? "").trim();
          const claimedAt = discovered ? new Date(discovered).toISOString() : null;
          const sourceUrl = "https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json";
          const orgHint = postTitle || null;
          const contentHash = sha256(`ransomwatch${sourceUrl}${orgHint ?? ""}${claimedAt ?? ""}`);
          const r = await query(
            `INSERT INTO quarantine_raw (source, source_url, groupe, org_hint, claimed_at, raw_body, content_hash)
             VALUES ('ransomwatch',$1,$2,$3,$4,$5,$6)
             ON CONFLICT (source, content_hash) DO NOTHING`,
            [sourceUrl, groupName, orgHint, claimedAt, postTitle || null, contentHash]
          );
          if ((r.rowCount ?? 0) > 0) inserted++; else ignored++;
        }
        log(`ransomwatch: ${inserted} inséré(s), ${ignored} ignoré(s)`);
        await setCursor(srcB, { done: true });
      } else {
        log(`ransomwatch: HTTP ${res.status}`);
      }
    } catch (e) {
      log(`ransomwatch: erreur ${String(e)}`);
    }
  } else {
    log("ransomwatch: backfill déjà fait (skip)");
  }
}
