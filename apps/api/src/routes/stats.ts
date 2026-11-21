/**
 * Compteurs par département : organisations, événements sur 7 jours, sources
 * actives. Réponse : `{ windowDays, departements: [{ departement, organisations,
 * evenements7j, sourcesActives }] }`, avec `departement` = code INSEE (ex. « 33 »).
 *
 * LIMITE À CONNAÎTRE AVANT DE SE FIER AUX CHIFFRES :
 * `source` n'a NI colonne département, NI code postal. Le département d'une
 * source est donc une INFÉRENCE à partir de son identifiant, de son nom, de son
 * URL et de sa description :
 *   - code INSEE explicite dans l'identifiant (`presse-ladepeche-47`, `gn-16`) ;
 *   - code postal à 5 chiffres, dont les deux premiers font le département ;
 *   - alias connu : libellé départemental (`Gironde`, `Charente-Maritime`),
 *     chef-lieu (`Bordeaux`), ou `CD33`.
 * Dès que deux départements différents sont candidats, on renonce (aucune
 * attribution) plutôt que de choisir arbitrairement. Une source exclusivement
 * nationale, ou dont le périmètre n'est pas explicite, ne compte dans aucun
 * département : les compteurs de sources sont donc des MINIMUMS, pas une
 * couverture réelle. À l'inverse, une source départementale couvre souvent
 * aussi des faits sans organisation rattachée : ces événements lui sont
 * attribués en secours (voir `parEvenementSource` plus bas).
 *
 * Les organisations portent un `org.dept` explicite, fiable : c'est la voie
 * principale pour les événements. Le repli par source ne s'applique qu'aux
 * événements sans `org_id`. `sourcesActives` suit la convention de `/sources` :
 * `enabled = true` (une source marquée « morte » est désactivée).
 */
import type { FastifyInstance } from "fastify";
import { DEPT_LABELS, PREFECTURES } from "../collectors/relevance.js";
import { query } from "../db.js";

const CODES_DEPT: readonly string[] = Object.keys(DEPT_LABELS);
const LIBELLES_PAR_CODE: ReadonlyMap<string, string> = new Map(
	Object.entries(DEPT_LABELS),
);

/** Préfectures de `relevance.ts` dans le même ordre que `DEPT_LABELS`. */
const PREFECTURE_PAR_CODE: ReadonlyMap<string, string> = new Map(
	PREFECTURES.map((ville, index) => [CODES_DEPT[index], ville] as const)
		.filter((entrée): entrée is readonly [string, string] => entrée[0] !== undefined),
);

type SourceRow = {
	id: string;
	name: string;
	url: string;
	description: string | null;
	enabled: boolean;
};

type Occurrence = { debut: number; fin: number };

/** Texte comparable : minuscules, sans accents, séparateurs normalisés. */
function normaliser(texte: string): string {
	return texte
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Alias connus, du plus long au plus court pour ne pas confondre 16 et 17. */
const ALIAS_DEPT: readonly { code: string; valeur: string }[] = [
	...Object.entries(DEPT_LABELS).flatMap(([code, libelle]) => {
		const alias = [{ code, valeur: normaliser(libelle) }];
		const prefecture = PREFECTURE_PAR_CODE.get(code);
		if (prefecture) alias.push({ code, valeur: normaliser(prefecture) });
		return alias;
	}),
].sort((a, b) => b.valeur.length - a.valeur.length);

/** Codes départementaux explicitement cités dans un texte libre. */
function extraireCandidats(texte: string): Set<string> {
	const normalise = normaliser(texte);
	const candidats = new Set<string>();
	const dejaPris: Occurrence[] = [];

	for (const { code, valeur } of ALIAS_DEPT) {
		const motif = new RegExp(`(?<![\\p{L}\\p{N}])${valeur}(?![\\p{L}\\p{N}])`, "gu");
		for (const trouvaille of normalise.matchAll(motif)) {
			const debut = trouvaille.index;
			if (debut === undefined) continue;
			const fin = debut + trouvaille[0].length;
			// « Charente » dans « Charente-Maritime » ne vaut pas le 16.
			if (dejaPris.some((o) => debut < o.fin && fin > o.debut)) continue;
			dejaPris.push({ debut, fin });
			candidats.add(code);
		}
	}

	// Code postal : seuls ses deux premiers chiffres identifient le département.
	for (const trouvaille of normalise.matchAll(/(?<!\d)(\d{2})\d{3}(?!\d)/g)) {
		const code = trouvaille[1];
		if (code && LIBELLES_PAR_CODE.has(code)) candidats.add(code);
	}
	// Alias court « CD33 », déjà connu du référentiel des organisations.
	for (const trouvaille of normalise.matchAll(/(?<![\p{L}\p{N}])cd\s?(\d{2})(?![\p{L}\p{N}])/gu)) {
		const code = trouvaille[1];
		if (code && LIBELLES_PAR_CODE.has(code)) candidats.add(code);
	}
	return candidats;
}

/** Département d'une source, ou `null` si l'indice est absent ou ambigu. */
export function departementDeLaSource(source: SourceRow): string | null {
	const candidats = extraireCandidats(`${source.name} ${source.url} ${source.description ?? ""}`);
	// Le code à 2 chiffres n'est fiable que dans l'identifiant : ailleurs, il
	// peut s'agir d'un nombre d'items (« 40 items ») ou d'une année.
	for (const jeton of normaliser(source.id).split(" ")) {
		if (/^\d{2}$/.test(jeton) && LIBELLES_PAR_CODE.has(jeton)) candidats.add(jeton);
	}
	return candidats.size === 1 ? [...candidats][0]! : null;
}

function ajouter(compteurs: Map<string, number>, code: string, valeur: number): void {
	compteurs.set(code, (compteurs.get(code) ?? 0) + Number(valeur));
}

export default async function (app: FastifyInstance) {
	app.get("/stats/departements", async () => {
		const [orgs, evenementsOrg, evenementsSource, sources] = await Promise.all([
			query<{ dept: string; n: number }>(
				`SELECT dept, count(*)::int AS n FROM org
				  WHERE dept IS NOT NULL AND btrim(dept) <> '' GROUP BY dept`,
			),
			query<{ dept: string; n: number }>(
				`SELECT o.dept, count(*)::int AS n
				   FROM event e JOIN org o ON o.id = e.org_id
				  WHERE o.dept IS NOT NULL AND btrim(o.dept) <> ''
				    AND COALESCE(e.observed_at, e.collected_at) >= now() - interval '7 days'
				  GROUP BY o.dept`,
			),
			query<{ source_id: string; n: number }>(
				`SELECT source_id, count(*)::int AS n
				   FROM event
				  WHERE org_id IS NULL
				    AND COALESCE(observed_at, collected_at) >= now() - interval '7 days'
				  GROUP BY source_id`,
			),
			// Aucun filtre SQL : l'inférence du département se fait en JS, avec
			// les alias et la règle d'ambiguïté documentés en tête de fichier.
			query<SourceRow>("SELECT id, name, url, description, enabled FROM source"),
		]);

		const parOrg = new Map<string, number>();
		const parEvenement = new Map<string, number>();
		const parSourceActive = new Map<string, number>();
		const deptParSource = new Map<string, string>();

		for (const ligne of orgs.rows) ajouter(parOrg, ligne.dept, ligne.n);
		for (const ligne of evenementsOrg.rows) ajouter(parEvenement, ligne.dept, ligne.n);

		for (const source of sources.rows) {
			const dept = departementDeLaSource(source);
			if (dept !== null) deptParSource.set(source.id, dept);
			if (source.enabled !== true || dept === null) continue;
			ajouter(parSourceActive, dept, 1);
		}
		for (const ligne of evenementsSource.rows) {
			const dept = deptParSource.get(ligne.source_id);
			if (dept !== undefined) ajouter(parEvenement, dept, ligne.n);
		}

		// Les douze départements de Nouvelle-Aquitaine sont toujours présents,
		// même à zéro : une carte ne doit pas deviner pourquoi un département
		// manque. Un dept hors région rencontré en base est ajouté, pas tu.
		const codes = new Set<string>([
			...CODES_DEPT,
			...parOrg.keys(),
			...parEvenement.keys(),
			...parSourceActive.keys(),
		]);
		return {
			windowDays: 7,
			departements: [...codes].sort((a, b) => a.localeCompare(b, "fr")).map((code) => ({
				departement: code,
				organisations: parOrg.get(code) ?? 0,
				evenements7j: parEvenement.get(code) ?? 0,
				sourcesActives: parSourceActive.get(code) ?? 0,
			})),
		};
	});
}
