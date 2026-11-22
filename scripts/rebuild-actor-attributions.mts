/**
 * Rebuild actor-to-group attributions from the evidence already collected.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/rebuild-actor-attributions.mts
 *
 * Only groups with at least one Nouvelle-Aquitaine victim are eligible. Actor
 * labels come from quarantine claims and our own ransomware events; the raw
 * hint is never read. No external service is called.
 */
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
  NA_DEPARTMENTS,
  attributeActor,
  dedupeAttributions,
  isSafeActorLabel,
  normalizeActorKey,
  type ActorObservation,
  type Attribution,
  type GroupCandidate,
} from "../apps/api/src/attribution/actor-group.js";

const SQL_TABLES = `
  SELECT to_regclass('public.ransomware_group') IS NOT NULL AS groups_ready,
         to_regclass('public.ransomware_victim') IS NOT NULL AS victims_ready
`;

const SQL_GROUPS = `
  SELECT DISTINCT g.slug, g.name
    FROM ransomware_group g
    JOIN ransomware_victim v ON v.group_id = g.id
    JOIN org o ON o.id = v.org_id
   WHERE o.dept = ANY($1::text[])
   ORDER BY g.slug
`;

const SQL_OBSERVATIONS = `
  SELECT btrim(groupe) AS actor, source, count(*)::int AS n
    FROM quarantine_raw
   WHERE groupe IS NOT NULL AND btrim(groupe) <> ''
   GROUP BY 1, 2
  UNION ALL
  SELECT btrim(evidence->>'group') AS actor, source_id AS source, count(*)::int AS n
    FROM event
   WHERE evidence ? 'group' AND btrim(evidence->>'group') <> ''
   GROUP BY 1, 2
`;

const SQL_INSERT = `
  INSERT INTO actor_group_attribution
    (actor, actor_key, group_slug, group_name, confidence, level, method, sources, claims)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`;

type ObservationRow = { actor: string; source: string; n: number };
type GroupRow = { slug: string; name: string };

type AggregatedActor = {
  labels: Map<string, number>;
  sources: Set<string>;
  claims: number;
};

async function main(): Promise<void> {
  const ready = await query<{ groups_ready: boolean; victims_ready: boolean }>(SQL_TABLES);
  if (!ready.rows[0]?.groups_ready || !ready.rows[0]?.victims_ready) {
    throw new Error("Ransomware group tables are missing: apply db/migrate-052-ransomware-groups.sql first");
  }

  const groupsResult = await query<GroupRow>(SQL_GROUPS, [NA_DEPARTMENTS]);
  const groups: GroupCandidate[] = groupsResult.rows.map((row) => ({ slug: row.slug, name: row.name }));
  if (groups.length === 0) throw new Error("No Nouvelle-Aquitaine group is available for attribution");

  const rows = await query<ObservationRow>(SQL_OBSERVATIONS);
  const aggregated = new Map<string, AggregatedActor>();
  for (const row of rows.rows) {
    if (!isSafeActorLabel(row.actor)) continue;
    const key = normalizeActorKey(row.actor);
    const entry = aggregated.get(key) ?? { labels: new Map(), sources: new Set(), claims: 0 };
    entry.labels.set(row.actor, (entry.labels.get(row.actor) ?? 0) + row.n);
    entry.sources.add(row.source);
    entry.claims += row.n;
    aggregated.set(key, entry);
  }

  const observations: ActorObservation[] = [];
  for (const entry of aggregated.values()) {
    const display = [...entry.labels.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"))[0]!;
    observations.push({ actor: display[0], sources: entry.sources.size, claims: entry.claims });
  }

  const attributions: Attribution[] = dedupeAttributions(
    observations
      .map((observation) => attributeActor(observation, groups))
      .filter((result): result is Attribution => result !== null),
  );

  await withTransaction(async (client) => {
    await client.query("DELETE FROM actor_group_attribution");
    for (const item of attributions) {
      await client.query(SQL_INSERT, [
        item.actor, item.actorKey, item.groupSlug, item.groupName,
        item.confidence, item.level, item.method, item.sources, item.claims,
      ]);
    }
  });

  const byLevel: Record<string, number> = {};
  const byMethod: Record<string, number> = {};
  for (const item of attributions) {
    byLevel[item.level] = (byLevel[item.level] ?? 0) + 1;
    byMethod[item.method] = (byMethod[item.method] ?? 0) + 1;
  }
  console.log(JSON.stringify({
    scope: "Nouvelle-Aquitaine",
    eligibleGroups: groups.length,
    actorLabels: observations.length,
    attributions: attributions.length,
    unattributed: observations.length - attributions.length,
    byLevel,
    byMethod,
  }, null, 2));
}

try {
  await main();
} finally {
  await closePools();
}
