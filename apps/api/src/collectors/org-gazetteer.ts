/**
 * Chargement paresseux et partagé du gazetteer pour l'ingestion.
 *
 * L'index est construit une fois par processus (~1 s pour 52 000 alias) puis
 * réutilisé par tous les collecteurs. Il est invalidé par `resetGazetteer`,
 * que le chargement du référentiel appelle : sans cela, un référentiel rechargé
 * à chaud laisserait le moteur sur un index périmé.
 *
 * À 1,7 M d'alias, un `SELECT` unique garderait tous les objets ligne en plus
 * de l'index : on lit par lots ordonnés par clé primaire et on alimente le
 * constructeur incrémental. La mémoire résidente dépend alors du lot, pas du
 * stock ; l'index final, lui, reste compact (tableaux typés, pas de Map par clé).
 */
import { ingestQuery } from "../db.js";
import { ConstructeurGazetteer, type Gazetteer, type GazetteerRow } from "../match/gazetteer.js";

/** Taille d'un lot : assez grand pour amortir le réseau, assez petit pour la RAM. */
export const LOT_ALIAS = 20_000;

let cache: { at: number; gaz: Gazetteer } | null = null;
let pending: Promise<Gazetteer> | null = null;
const TTL_MS = 10 * 60 * 1000;

type LigneAlias = GazetteerRow & { id: number };

async function charger(): Promise<Gazetteer> {
	const constructeur = new ConstructeurGazetteer();
	let apres = 0;
	for (;;) {
		const { rows } = await ingestQuery<LigneAlias>(
			`SELECT a.id, a.org_id, o.name, o.kind, o.dept, o.city, o.sector, a.alias,
			        a.nom_normalise, a.source
			   FROM org_alias a
			   JOIN org o ON o.id = a.org_id
			  WHERE a.status = 'active' AND a.id > $1
			  ORDER BY a.id
			  LIMIT $2`,
			[apres, LOT_ALIAS],
		);
		if (rows.length === 0) break;
		for (const row of rows) constructeur.ajouter(row);
		apres = rows[rows.length - 1]!.id;
		if (rows.length < LOT_ALIAS) break;
	}
	return constructeur.construire();
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
