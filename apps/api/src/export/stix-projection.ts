/**
 * Aller-retour STIX 2.1 : projection horodatée, export bundle, réimport.
 *
 * Le périmètre est volontairement réduit aux trois types que le TIP doit
 * recevoir (`indicator`, `identity`, `campaign`) et à leurs `relationship`.
 * Aucun titre, résumé ou evidence brute ne transite : seuls les champs
 * structurels et les horodatages nécessaires à la validité temporelle.
 *
 * L'identifiant d'un objet importé est celui que le bundle porte, jamais un
 * nouvel identifiant généré à l'import. Deux imports du même bundle écrivent
 * donc les mêmes clés primaires — c'est la propriété testée par roundTripStix.
 */
import { createHash } from "node:crypto";
import { query } from "../db.js";
import { normalizeTrustTags } from "./trust-tags.js";

export type SqlQuery = <T = unknown>(
	text: string,
	params?: unknown[],
) => Promise<{ rows: T[]; rowCount: number | null }>;

export type StixObject = Record<string, unknown>;
export type StixBundle = {
	type: "bundle";
	id: string;
	spec_version: "2.1";
	objects: StixObject[];
};

const OBJECT_TYPES: Record<string, true> = { indicator: true, identity: true, campaign: true };
const ID_PATTERN = /^(indicator|identity|campaign)--[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RELATIONSHIP_PATTERN = /^relationship--[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function text(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function timestamp(value: unknown): string | null {
	const raw = text(value);
	if (raw === null) return null;
	const date = new Date(raw);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sourceEventId(object: StixObject): number | null {
	const pattern = text(object.pattern);
	const match = pattern?.match(/x-radar:event-id\s*=\s*(\d+)/);
	if (!match) return null;
	const id = Number(match[1]);
	return Number.isSafeInteger(id) ? id : null;
}

function bundleId(ids: readonly string[]): string {
	const hex = createHash("sha256").update([...ids].sort().join("\n")).digest("hex");
	return `bundle--${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Extrait un bundle STIX 2.1 des tables de projection, dans un ordre stable. */
export async function exportStixBundle(
	sql: SqlQuery = query,
	options: { limit?: number } = {},
): Promise<StixBundle> {
	const limite = options.limit !== undefined && Number.isInteger(options.limit) && options.limit > 0
		? options.limit
		: null;
	const params = limite === null ? [] : [limite];
	const clause = limite === null ? "" : " LIMIT $1";
	const objets = await sql<{ object: StixObject }>(
		`SELECT object FROM stix_object WHERE tlp = 'WHITE' AND pap <> 'RED' ORDER BY id${clause}`,
		params,
	);
	const relations = await sql<{ object: StixObject }>(
		`SELECT object FROM stix_relation ORDER BY id${clause}`,
		params,
	);
	const objects = [...objets.rows, ...relations.rows]
		.map((row) => row.object)
		.sort((a, b) => String(a.id).localeCompare(String(b.id), "en"));
	return {
		type: "bundle",
		id: bundleId(objects.map((object) => String(object.id))),
		spec_version: "2.1",
		objects,
	};
}

function trustOf(object: StixObject) {
	const extensions = object.extensions;
	const custom = extensions !== null && typeof extensions === "object" && !Array.isArray(extensions)
		? (extensions as Record<string, unknown>)["x-radar-trust"]
		: undefined;
	const trust = custom !== null && typeof custom === "object" && !Array.isArray(custom)
		? custom as Record<string, unknown>
		: {};
	return normalizeTrustTags({
		tlp: trust.tlp,
		pap: trust.pap,
		confidence: trust.confidence,
	});
}

const UPSERT_OBJET = `
  INSERT INTO stix_object
    (id, stix_type, tlp, pap, confidence, object, valid_from, valid_until, source_event_id)
  SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
                       $6::jsonb[], $7::timestamptz[], $8::timestamptz[], $9::bigint[])
  ON CONFLICT (id) DO UPDATE SET
    tlp = EXCLUDED.tlp,
    pap = EXCLUDED.pap,
    confidence = EXCLUDED.confidence,
    object = EXCLUDED.object,
    valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until,
    source_event_id = EXCLUDED.source_event_id,
    exported_at = now()
`;

const UPSERT_RELATION = `
  INSERT INTO stix_relation
    (id, stix_type, relationship_type, source_ref, target_ref, object,
     valid_from, valid_until, source_event_id)
  SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
                       $6::jsonb[], $7::timestamptz[], $8::timestamptz[], $9::bigint[])
  ON CONFLICT (id) DO UPDATE SET
    relationship_type = EXCLUDED.relationship_type,
    source_ref = EXCLUDED.source_ref,
    target_ref = EXCLUDED.target_ref,
    object = EXCLUDED.object,
    valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until,
    source_event_id = EXCLUDED.source_event_id,
    imported_at = now()
`;

export type ImportResult = {
	imported: number;
	relations: number;
	skipped: number;
	ids: string[];
};

/**
 * Réimporte un bundle par identifiants : aucune clé n'est régénérée.
 * Les objets hors périmètre (type inattendu, identifiant invalide, TLP:RED)
 * sont comptés comme ignorés et jamais stockés.
 */
export async function importStixBundle(
	bundle: StixBundle,
	sql: SqlQuery = query,
): Promise<ImportResult> {
	if (bundle?.type !== "bundle" || bundle.spec_version !== "2.1"
		|| typeof bundle.id !== "string" || !bundle.id.startsWith("bundle--")
		|| !Array.isArray(bundle.objects)) {
		throw new Error("bundle STIX 2.1 invalide");
	}

	const objets: unknown[][] = [];
	const liens: StixObject[] = [];
	let skipped = 0;
	for (const object of bundle.objects) {
		if (object === null || typeof object !== "object") {
			skipped++;
			continue;
		}
		const type = text(object.type);
		const id = text(object.id);
		if (type === "relationship") {
			if (id === null || !RELATIONSHIP_PATTERN.test(id)
				|| text(object.source_ref) === null || text(object.target_ref) === null) {
				skipped++;
				continue;
			}
			liens.push(object);
			continue;
		}
		if (type === null || OBJECT_TYPES[type] !== true || id === null || !ID_PATTERN.test(id)
			|| ID_PATTERN.exec(id)?.[1] !== type) {
			skipped++;
			continue;
		}
		const tags = trustOf(object);
		// Périmètre public hermétique : un bundle externe ne peut introduire
		// que des objets TLP:WHITE (PAP non RED). AMBER/GREEN/RED sont ignorés.
		if (tags.tlp !== "WHITE" || tags.pap === "RED") {
			skipped++;
			continue;
		}
		objets.push([
			id, type, tags.tlp, tags.pap, tags.confidence,
			JSON.stringify(object),
			timestamp(object.valid_from),
			timestamp(object.valid_until),
			sourceEventId(object),
		]);
	}

	if (objets.length > 0) {
		await sql(UPSERT_OBJET, [
			objets.map((o) => o[0]),
			objets.map((o) => o[1]),
			objets.map((o) => o[2]),
			objets.map((o) => o[3]),
			objets.map((o) => o[4]),
			objets.map((o) => o[5]),
			objets.map((o) => o[6]),
			objets.map((o) => o[7]),
			objets.map((o) => o[8]),
		]);
	}

	let relations = 0;
	if (liens.length > 0) {
		const refs = [...new Set(liens.flatMap((l) => [String(l.source_ref), String(l.target_ref)]))];
		const connus = await sql<{ id: string; source_event_id: number | null }>(
			`SELECT id, source_event_id FROM stix_object WHERE id = ANY($1::text[])
			   AND source_event_id IS NOT NULL`,
			[refs],
		);
		const evenements = new Map(connus.rows.map((r) => [r.id, r.source_event_id]));
		const lignes: unknown[][] = [];
		for (const lien of liens) {
			const source = String(lien.source_ref);
			const target = String(lien.target_ref);
			const sourceEvent = evenements.get(target) ?? evenements.get(source) ?? null;
			lignes.push([
				String(lien.id), "relationship",
				text(lien.relationship_type) ?? "related-to",
				source, target,
				JSON.stringify(lien),
				timestamp(lien.valid_from),
				timestamp(lien.valid_until),
				sourceEvent,
			]);
		}
		await sql(UPSERT_RELATION, [
			lignes.map((l) => l[0]), lignes.map((l) => l[1]), lignes.map((l) => l[2]),
			lignes.map((l) => l[3]), lignes.map((l) => l[4]), lignes.map((l) => l[5]),
			lignes.map((l) => l[6]), lignes.map((l) => l[7]), lignes.map((l) => l[8]),
		]);
		relations = lignes.length;
	}

	return {
		imported: objets.length,
		relations,
		skipped,
		ids: [...objets.map((o) => String(o[0])), ...liens.map((l) => String(l.id))].sort(),
	};
}

export type RoundTripResult = {
	ids: string[];
	objets: number;
	relations: number;
	imports: [ImportResult, ImportResult];
};

/** Export -> import -> import -> export : les identifiants doivent être identiques. */
export async function roundTripStix(sql: SqlQuery = query): Promise<RoundTripResult> {
	const avant = await exportStixBundle(sql);
	const idsAvant = avant.objects.map((object) => String(object.id)).sort();
	const premier = await importStixBundle(avant, sql);
	const second = await importStixBundle(avant, sql);
	const apres = await exportStixBundle(sql);
	const idsApres = apres.objects.map((object) => String(object.id)).sort();
	if (JSON.stringify(idsAvant) !== JSON.stringify(idsApres)) {
		throw new Error("aller-retour STIX non idempotent : les identifiants ont changé");
	}
	return {
		ids: idsAvant,
		objets: idsAvant.length - second.relations,
		relations: second.relations,
		imports: [premier, second],
	};
}
