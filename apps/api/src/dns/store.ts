/**
 * Persistance de l'historique DNS : périmètre, observations et changements.
 *
 * Ce module est le seul à écrire dans `dns_domaine`, `dns_snapshot` et
 * `dns_change`. La comparaison vit dans `historique.ts`, l'orchestration dans
 * `releve.ts` : aucun appel réseau ici, aucune heuristique de nommage ici.
 *
 * Les lectures utilisent le pool API (court), les écritures le pool d'ingest
 * (large) : un relevé de plusieurs centaines de domaines ne doit pas affamer
 * les routes HTTP.
 */

import { ingestQuery, query } from "../db.js";
import {
	measurementState,
	normalizeDomain,
	type DnsChange,
	type DnsProvider,
	type DnsProviderCategory,
	type DnsSnapshot,
} from "./historique.js";

export interface DomaineSuivi {
	domain: string;
	label: string | null;
	orgIds: number[];
	active: boolean;
	lastState: string;
}

export interface SnapshotEnregistre extends DnsSnapshot {
	id: number;
}

interface LigneDomaine {
	domain: string;
	label: string | null;
	org_ids: number[] | null;
	active: boolean;
	last_state: string;
}

interface LigneSnapshot {
	id: string | number;
	domain: string;
	observed_at: string | Date;
	a: string[] | null;
	aaaa: string[] | null;
	mx: string[] | null;
	ns: string[] | null;
	ptr: unknown;
	registrar: string | null;
	errors: string[] | null;
}

interface LigneFournisseur {
	suffix: string;
	name: string;
	category: DnsProviderCategory;
	mode: "suffix" | "contains";
}

function snapshotDepuisLigne(ligne: LigneSnapshot): SnapshotEnregistre {
	const ptr = (typeof ligne.ptr === "object" && ligne.ptr !== null ? ligne.ptr : {}) as Record<string, string[]>;
	return {
		id: Number(ligne.id),
		domain: ligne.domain,
		observedAt: new Date(ligne.observed_at).toISOString(),
		a: ligne.a ?? [],
		aaaa: ligne.aaaa ?? [],
		mx: ligne.mx ?? [],
		ns: ligne.ns ?? [],
		ptr,
		registrar: ligne.registrar,
		errors: ligne.errors ?? [],
	};
}

/**
 * Construit le périmètre suivi depuis le référentiel : `org.domain` d'abord,
 * sinon l'hôte de `org.website`. Un même domaine peut être porté par plusieurs
 * organisations : on conserve tous les identifiants.
 */
export async function synchroniserDomaines(): Promise<{ ajoutes: number; total: number }> {
	const lignes = await query<{ id: number; name: string; domain: string | null; website: string | null }>(
		"SELECT id, name, domain, website FROM org WHERE domain IS NOT NULL OR website IS NOT NULL",
	);
	const parDomaine = new Map<string, { label: string; orgIds: number[] }>();
	for (const ligne of lignes.rows) {
		const domain = normalizeDomain(ligne.domain) ?? normalizeDomain(ligne.website);
		if (!domain) continue;
		const courant = parDomaine.get(domain);
		if (courant) {
			if (!courant.orgIds.includes(ligne.id)) courant.orgIds.push(ligne.id);
		} else {
			parDomaine.set(domain, { label: ligne.name, orgIds: [ligne.id] });
		}
	}
	if (parDomaine.size === 0) {
		await ingestQuery("UPDATE dns_domaine SET active = false WHERE active");
		return { ajoutes: 0, total: 0 };
	}

	const values: string[] = [];
	const params: unknown[] = [];
	for (const [domain, info] of parDomaine) {
		const base = params.length;
		params.push(domain, info.label, info.orgIds);
		values.push(`($${base + 1}, $${base + 2}, $${base + 3}::integer[])`);
	}
	const domains = [...parDomaine.keys()];
	const r = await ingestQuery<{ count: string | number }>(
		`INSERT INTO dns_domaine (domain, label, org_ids)
		 VALUES ${values.join(", ")}
		 ON CONFLICT (domain) DO UPDATE
		   SET label = EXCLUDED.label, org_ids = EXCLUDED.org_ids, active = true
		 RETURNING 1`,
		params,
	);
	await ingestQuery("UPDATE dns_domaine SET active = false WHERE active AND domain <> ALL($1::text[])", [domains]);
	return { ajoutes: Number(r.rowCount ?? 0), total: parDomaine.size };
}

export async function listerDomaines(actifsSeulement = true): Promise<DomaineSuivi[]> {
	const r = await query<LigneDomaine>(
		`SELECT domain, label, org_ids, active, last_state FROM dns_domaine
		 WHERE CASE WHEN $1 THEN active ELSE true END ORDER BY domain`,
		[actifsSeulement],
	);
	return r.rows.map((l) => ({
		domain: l.domain,
		label: l.label,
		orgIds: l.org_ids ?? [],
		active: l.active,
		lastState: l.last_state,
	}));
}

/** Catalogue des fournisseurs publics, lu depuis la migration (jamais codé en dur ici). */
export async function chargerCatalogue(): Promise<DnsProvider[]> {
	const r = await query<LigneFournisseur>("SELECT suffix, name, category, mode FROM dns_fournisseur");
	return r.rows;
}

export async function dernierSnapshot(domain: string): Promise<SnapshotEnregistre | null> {
	const r = await query<LigneSnapshot>(
		`SELECT id, domain, observed_at, a, aaaa, mx, ns, ptr, registrar, errors
		 FROM dns_snapshot WHERE domain = $1 ORDER BY observed_at DESC, id DESC LIMIT 1`,
		[domain],
	);
	return r.rows.length > 0 ? snapshotDepuisLigne(r.rows[0]!) : null;
}

/** Enregistre une observation même identique : l'historique se mesure, il ne se suppose pas. */
export async function enregistrerSnapshot(snapshot: DnsSnapshot): Promise<number> {
	const r = await ingestQuery<{ id: string | number }>(
		`INSERT INTO dns_snapshot
		   (domain, observed_at, a, aaaa, mx, ns, ptr, registrar, errors)
		 VALUES ($1, $2, $3::text[], $4::text[], $5::text[], $6::text[], $7::jsonb, $8, $9::text[])
		 RETURNING id`,
		[
			snapshot.domain,
			snapshot.observedAt,
			snapshot.a,
			snapshot.aaaa,
			snapshot.mx,
			snapshot.ns,
			JSON.stringify(snapshot.ptr),
			snapshot.registrar,
			snapshot.errors,
		],
	);
	const id = Number(r.rows[0]?.id);
	const etat = measurementState(snapshot);
	await ingestQuery(
		`UPDATE dns_domaine
		    SET last_try = now(),
		        last_success = CASE WHEN $2 = 'erreur' THEN last_success ELSE $3::timestamptz END,
		        last_state = $2
		  WHERE domain = $1`,
		[snapshot.domain, etat, snapshot.observedAt],
	);
	return id;
}

/** Panne totale : on consigne l'échec sans effacer le dernier relevé réussi. */
export async function marquerEchec(domain: string, erreur: string): Promise<void> {
	await ingestQuery(
		"UPDATE dns_domaine SET last_try = now(), last_state = 'erreur' WHERE domain = $1",
		[domain],
	);
	await ingestQuery(
		`INSERT INTO dns_snapshot (domain, observed_at, errors)
		 VALUES ($1, now(), ARRAY[$2]::text[])`,
		[domain, `collecte: ${erreur}`.slice(0, 500)],
	);
}

export async function enregistrerChangements(
	domain: string,
	previousSnapshotId: number | null,
	currentSnapshotId: number,
	changes: readonly DnsChange[],
	detectedAt: string,
): Promise<number> {
	for (const change of changes) {
		await ingestQuery(
			`INSERT INTO dns_change
			   (domain, previous_snapshot_id, current_snapshot_id, detected_at,
			    kind, severity, summary, before, after)
			 VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8::jsonb, $9::jsonb)`,
			[
				domain,
				previousSnapshotId,
				currentSnapshotId,
				detectedAt,
				change.kind,
				change.severity,
				change.summary,
				JSON.stringify(change.before),
				JSON.stringify(change.after),
			],
		);
	}
	return changes.length;
}

export interface StatistiquesDns {
	domaines: number;
	domainesMesures: number;
	snapshots: number;
	changements: number;
}

export async function statistiques(): Promise<StatistiquesDns> {
	const r = await query<Record<string, string | number>>(
		`SELECT
		   (SELECT count(*) FROM dns_domaine WHERE active) AS domaines,
		   (SELECT count(DISTINCT domain) FROM dns_snapshot) AS domaines_mesures,
		   (SELECT count(*) FROM dns_snapshot) AS snapshots,
		   (SELECT count(*) FROM dns_change) AS changements`,
	);
	const ligne = r.rows[0]!;
	return {
		domaines: Number(ligne.domaines),
		domainesMesures: Number(ligne.domaines_mesures),
		snapshots: Number(ligne.snapshots),
		changements: Number(ligne.changements),
	};
}

export interface ChangementRecent {
	domain: string;
	label: string | null;
	kind: string;
	severity: number;
	summary: string;
	detectedAt: string;
}

/** Les changements les plus significatifs : gravité d'abord, fraîcheur ensuite. */
export async function changementsRecents(limit = 5): Promise<ChangementRecent[]> {
	const r = await query<{
		domain: string;
		label: string | null;
		kind: string;
		severity: number | string;
		summary: string;
		detected_at: string | Date;
	}>(
		`SELECT c.domain, d.label, c.kind, c.severity, c.summary, c.detected_at
		   FROM dns_change c LEFT JOIN dns_domaine d ON d.domain = c.domain
		  ORDER BY c.severity DESC, c.detected_at DESC
		  LIMIT $1`,
		[limit],
	);
	return r.rows.map((l) => ({
		domain: l.domain,
		label: l.label,
		kind: l.kind,
		severity: Number(l.severity),
		summary: l.summary,
		detectedAt: new Date(l.detected_at).toISOString(),
	}));
}
