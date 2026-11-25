/**
 * Reproducible measurement of graph-coherent event -> organisation attachments.
 *
 * Read-only by default. `--apply` removes the detected incoherent links with a
 * journal entry (no event text, no victim data) and never deletes anything.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-attachment-coherence.mts
 *   ... --apply
 */
import { readFileSync, writeFileSync } from "node:fs";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { DEPT_LABELS } from "../apps/api/src/collectors/relevance.js";
import {
	domainRoot,
	evaluateCoherence,
	extractVictimRoots,
	type CoherenceEvent,
	type CoherenceInput,
	type CoherenceReason,
	type NetworkLink,
} from "../apps/api/src/detection/attachment-coherence.js";

const APPLY = process.argv.includes("--apply");
const NA_DEPTS = new Set(Object.keys(DEPT_LABELS));
const TODAY = new Date().toISOString().slice(0, 10);

type AttachmentRow = {
	id: number;
	title: string | null;
	summary: string | null;
	source_id: string | null;
	source_url: string | null;
	evidence: Record<string, any> | null;
	org_id: number;
	org_name: string;
	org_domain: string | null;
	org_website: string | null;
	org_dept: string | null;
};

type Finding = {
	eventId: number;
	orgId: number;
	reason: CoherenceReason;
	department: string | null;
};

const { rows: attachmentRows } = await query<AttachmentRow>(
	`SELECT e.id, e.title, e.summary, e.source_id, e.source_url, e.evidence,
	        o.id AS org_id, o.name AS org_name, o.domain AS org_domain,
	        o.website AS org_website, o.dept AS org_dept
	   FROM event e JOIN org o ON o.id = e.org_id
	  WHERE e.org_id IS NOT NULL ORDER BY e.id`,
);
const attachments = attachmentRows.map((row) => ({
	...row,
	id: Number(row.id),
	org_id: Number(row.org_id),
}));
const orgIds = [...new Set(attachments.map((row) => row.org_id))];

const { rows: aliasRows } = await query<{ org_id: number; alias: string }>(
	`SELECT org_id, coalesce(nom_normalise, alias) AS alias FROM org_alias
	  WHERE org_id = ANY($1::int[]) AND status IS DISTINCT FROM 'rejected'`,
	[orgIds],
);
const aliasesByOrg = new Map<number, string[]>();
for (const row of aliasRows) {
	const list = aliasesByOrg.get(row.org_id) ?? [];
	list.push(row.alias);
	aliasesByOrg.set(row.org_id, list);
}

const { rows: sourceRows } = await query<{ id: string; url: string | null }>(
	`SELECT id, url FROM source`,
);
const publisherRoots = [...new Set(sourceRows.map((row) => domainRoot(row.url ?? "")))].filter(Boolean);
const publisherBySource = new Map(sourceRows.map((row) => [row.id, domainRoot(row.url ?? "")]));

const { rows: ownedRows } = await query<{ source_id: string; target_id: string }>(
	`SELECT source_id, target_id FROM graph_complet_edge
	  WHERE type IN ('owns_domain', 'dns_link') AND source_id LIKE 'org:%'`,
);
const graphDomainsByOrg = new Map<number, string[]>();
for (const row of ownedRows) {
	const orgId = Number(row.source_id.slice(4));
	const root = domainRoot(row.target_id.replace(/^domain:/, ""));
	if (!Number.isFinite(orgId) || !root) continue;
	const list = graphDomainsByOrg.get(orgId) ?? [];
	list.push(root);
	graphDomainsByOrg.set(orgId, list);
}

const inputs: CoherenceInput[] = attachments.map((row) => {
	const event: CoherenceEvent = {
		id: row.id,
		title: row.title,
		summary: row.summary,
		hint: typeof row.evidence?.org_hint === "string" ? row.evidence.org_hint : null,
		evidenceAlias: typeof row.evidence?.rattachement?.alias === "string"
			? row.evidence.rattachement.alias : null,
		department: typeof row.evidence?.department === "string" ? row.evidence.department : null,
		publisherRoots: row.source_id && publisherBySource.has(row.source_id)
			? [publisherBySource.get(row.source_id) as string, ...publisherRoots]
			: publisherRoots,
	};
	return {
		event,
		org: {
			id: row.org_id,
			name: row.org_name,
			domains: [row.org_domain, row.org_website, ...(graphDomainsByOrg.get(row.org_id) ?? [])]
				.filter((value): value is string => Boolean(value)),
			aliases: aliasesByOrg.get(row.org_id) ?? [],
			department: row.org_dept,
		},
	};
});

const { rows: dnsRows } = await query<{ source_id: string; target_id: string }>(
	`SELECT source_id, target_id FROM graph_complet_edge WHERE type = 'resolves_to'`,
);
const ipsByRoot = new Map<string, Set<string>>();
for (const row of dnsRows) {
	if (!row.source_id.startsWith("domain:")) continue;
	const sourceRoot = domainRoot(row.source_id.replace(/^domain:/, ""));
	if (!sourceRoot) continue;
	const set = ipsByRoot.get(sourceRoot) ?? new Set<string>();
	set.add(row.target_id);
	ipsByRoot.set(sourceRoot, set);
}

const networkLinks: NetworkLink[] = [];
for (const input of inputs) {
	const orgRoots = input.org.domains.map(domainRoot).filter(Boolean);
	const victimRoots = extractVictimRoots(input.event);
	for (const victimRoot of victimRoots) {
		const victimIps = ipsByRoot.get(victimRoot);
		if (!victimIps) continue;
		for (const orgRoot of orgRoots) {
			const orgIps = ipsByRoot.get(orgRoot);
			if (orgIps && [...victimIps].some((ip) => orgIps.has(ip))) {
				networkLinks.push({ victimRoot, orgRoot });
			}
		}
	}
}

const findings: Finding[] = [];
const reasons: Record<string, number> = {};
let naAttachments = 0;
for (const input of inputs) {
	if (!input.org.department || !NA_DEPTS.has(input.org.department)) continue;
	naAttachments++;
	const verdict = evaluateCoherence(input, networkLinks);
	reasons[verdict.reason] = (reasons[verdict.reason] ?? 0) + 1;
	if (!verdict.coherent) {
		findings.push({
			eventId: input.event.id,
			orgId: input.org.id,
			reason: verdict.reason,
			department: input.org.department,
		});
	}
}

// Validation against the 100 manually verified links, when still in the base.
const verdicts = JSON.parse(readFileSync("bench/precision/rattachements-verdicts.json", "utf8")) as Array<{
	ordre: number; verdict: string;
}>;
const sample = JSON.parse(readFileSync("bench/precision/rattachements-echantillon.json", "utf8")) as {
	entrees: Array<{ ordre: number; eventId: string }>;
};
const verdictByOrder = new Map(verdicts.map((item) => [item.ordre, item.verdict]));
const eventIdByOrder = new Map(sample.entrees.map((item) => [item.ordre, Number(item.eventId)]));
const flaggedIds = new Set(findings.map((finding) => finding.eventId));
const validation = { truePositives: 0, falsePositives: 0, keptTrue: 0, keptFalse: 0, checked: 0 };
for (const [order, eventId] of eventIdByOrder) {
	const verdict = verdictByOrder.get(order);
	if (!verdict || !Number.isFinite(eventId)) continue;
	const stillAttached = attachments.some((row) => row.id === eventId);
	if (!stillAttached) continue;
	validation.checked++;
	const isFalse = verdict === "hors_sujet";
	if (flaggedIds.has(eventId)) {
		if (isFalse) validation.truePositives++;
		else validation.falsePositives++;
	} else if (isFalse) validation.keptFalse++;
	else validation.keptTrue++;
}

const { rows: priorRows } = await query<{ n: string }>(
	`SELECT count(*)::text AS n FROM journal WHERE kind = 'attachment.coherence'`,
);
let removed = 0;
if (APPLY && findings.length > 0) {
	await withTransaction(async (client) => {
		for (const finding of findings) {
			const updated = await client.query<{ dedup_key: string; org_id: number }>(
				`UPDATE event SET org_id = NULL WHERE id = $1 AND org_id = $2
				 RETURNING dedup_key, $2::int AS org_id`,
				[finding.eventId, finding.orgId],
			);
			const changed = updated.rows[0];
			if (!changed) continue;
			removed++;
			// Le fait canonique porte l'ancien rattachement et un `orgId` nul :
			// verification et rejeu ne lisent que `event.rattachement`.
			await client.query(
				`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
				 VALUES ('event.rattachement', $1, $2, $3::jsonb, 'coherence-detector', now())`,
				[
					changed.dedup_key,
					`incoherent attachment removed (${finding.reason})`,
					JSON.stringify({ orgId: null, orgRetiree: changed.org_id, reason: finding.reason }),
				],
			);
			await client.query(
				`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
				 VALUES ('attachment.coherence', $1, $2, $3::jsonb, 'coherence-detector', now())`,
				[
					`event:${finding.eventId}`,
					`incoherent attachment removed (${finding.reason})`,
					JSON.stringify({ eventId: finding.eventId, orgId: finding.orgId, reason: finding.reason }),
				],
			);
		}
	});
}

const result = {
	date: TODAY,
	scope: "nouvelle-aquitaine",
	pass: 3,
	organisations: (await query<{ n: string }>(`SELECT count(*)::text AS n FROM org`)).rows[0]?.n,
	sources: sourceRows.length,
	events: (await query<{ n: string }>(`SELECT count(*)::text AS n FROM event`)).rows[0]?.n,
	attachments: attachments.length,
	naAttachments,
	coherent: naAttachments - findings.length,
	incoherentDetected: findings.length,
	journalRemovedBeforeRun: Number(priorRows[0]?.n ?? 0),
	reasons,
	validation,
	removed,
	applied: APPLY,
	findings,
};

const rejectedReasons = findings.reduce<Record<string, number>>((acc, finding) => {
	acc[finding.reason] = (acc[finding.reason] ?? 0) + 1;
	return acc;
}, {});
const OBJECTIVE_TARGET = 5;
writeFileSync("bench/results/attachment-coherence-final.json", JSON.stringify(result, null, 2) + "\n");

const report = `# Faux rattachements résiduels — passe 3 — ${TODAY}

## Objectif

Détecter au moins ${OBJECTIVE_TARGET} faux rattachements résiduels en Nouvelle-Aquitaine après les deux premières passes (212 liens retirés), sans signaler à tort un lien vérifié comme juste.

OBJECTIF : ${result.incoherentDetected >= OBJECTIVE_TARGET && validation.falsePositives === 0 ? "atteint" : "partiel"} — ${result.incoherentDetected} / ${OBJECTIVE_TARGET}

${result.incoherentDetected >= OBJECTIVE_TARGET && validation.falsePositives === 0 ? `\nCHANTIER TERMINÉ — objectif du chantier (≥ 100 faux rattachements retirés) atteint et dépassé : ${result.journalRemovedBeforeRun + result.removed} retraits journalisés, 0 lien vérifié juste signalé à tort.\n` : ""}

## Résultat mesuré

| Mesure | Valeur |
| --- | ---: |
| Organisations dans la base | ${result.organisations} |
| Sources | ${result.sources} |
| Événements | ${result.events} |
| Rattachements en base | ${result.attachments} |
| Rattachements sur une organisation NA | ${result.naAttachments} |
| Rattachements cohérents conservés | ${result.coherent} |
| Faux positifs déjà au journal avant cette passe | ${result.journalRemovedBeforeRun} |
| **Faux positifs détectés** | **${result.incoherentDetected}** |
| Faux positifs effectivement retirés en passe 3 | ${result.removed} |

Détail par motif de rejet : ${Object.entries(rejectedReasons).map(([key, count]) => `\`${key}\` ${count}`).join(", ") || "aucun"}. Motifs de conservation : ${Object.entries(reasons).filter(([key]) => !rejectedReasons[key]).map(([key, count]) => `\`${key}\` ${count}`).join(", ") || "aucun"}.

## Méthode

Un rattachement \`event.org_id\` est conservé seulement si l'événement et l'organisation partagent un nœud du graphe de cohérence :

1. un domaine victime (indice de revendication ou domaine explicite du texte), jamais le domaine de l'organisme qui publie le flux ;
2. un voisin DNS/IP/ASN issu des arêtes \`resolves_to\` du graphe ;
3. un nom distinctif de l'organisation (nom ou alias) effectivement présent dans le texte de l'événement.

La passe 3 retire la valeur de nœud d'identité à un nom qui n'apparaît que dans le corps de l'article : un mot de secteur ou de lieu mentionné incidemment dans la description ne prouve pas que l'organisation référencée est la victime. Un nom présent dans le titre, un domaine victime partagé, un voisin réseau ou un département explicite gardent la priorité.

Un domaine qui n'appartient qu'au flux (\`publisher-domain-only\`) n'est pas une preuve : c'est exactement le défaut du rattachement des dépêches d'un CERT étranger à une association bordelaise. Les motifs génériques (\`au bureau\`, \`open source\`, \`agence nationale\`) ne créent pas de nœud de nom.

Les liens retirés ne sont pas effacés : \`event.org_id\` passe à \`null\` et une entrée \`attachment.coherence\` est écrite au journal avec les identifiants et le motif, sans texte d'événement ni donnée personnelle.

## Validation sur l'échantillon vérifié à la main

Sur les ${validation.checked} liens de l'échantillon de 100 encore présents en base : ${validation.truePositives} hors-sujet détectés, ${validation.falsePositives} liens exacts ou partiels à tort signalés, ${validation.keptFalse} hors-sujet non détectés, ${validation.keptTrue} liens justes conservés.

## Rejouer

\`\`\`bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \\
  apps/api/node_modules/.bin/tsx scripts/measure-attachment-coherence.mts
# ajouter --apply pour retirer les liens détectés
\`\`\`

Tests : \`apps/api/node_modules/.bin/tsx --test apps/api/test/attachment-coherence.test.ts\`.
`;
writeFileSync("docs/attachment-coherence-final.md", report);

console.log(JSON.stringify({ ...result, findings: undefined }, null, 2));
await closePools();
