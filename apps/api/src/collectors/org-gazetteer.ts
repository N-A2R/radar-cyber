/**
 * Chargement paresseux et partagé du gazetteer pour l'ingestion.
 *
 * L'index est construit une fois par processus (~1 s pour 52 000 alias) puis
 * réutilisé par tous les collecteurs. Il est invalidé par `resetGazetteer`,
 * que le chargement du référentiel appelle : sans cela, un référentiel rechargé
 * à chaud laisserait le moteur sur un index périmé.
 */
import { ingestQuery } from "../db.js";
import { buildGazetteer, type Gazetteer, type GazetteerRow } from "../match/gazetteer.js";

let cache: { at: number; gaz: Gazetteer } | null = null;
let pending: Promise<Gazetteer> | null = null;
const TTL_MS = 10 * 60 * 1000;

async function charger(): Promise<Gazetteer> {
	const { rows } = await ingestQuery<GazetteerRow>(
		`SELECT a.org_id, o.name, o.kind, o.dept, o.city, a.alias
		   FROM org_alias a
		   JOIN org o ON o.id = a.org_id
		  WHERE a.status = 'active'`,
	);
	return buildGazetteer(rows ?? []);
}

export async function getGazetteer(): Promise<Gazetteer> {
	if (cache && Date.now() - cache.at < TTL_MS) return cache.gaz;
	if (pending) return pending;
	pending = charger()
		.then((gaz) => {
			cache = { at: Date.now(), gaz };
			return gaz;
		})
		.catch((error: unknown) => {
			cache = null;
			throw error;
		})
		.finally(() => {
			pending = null;
		});
	return pending;
}

export function resetGazetteer(): void {
	cache = null;
}
