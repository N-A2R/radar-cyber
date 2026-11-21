/**
 * Chargement paresseux et partagé du gazetteer pour l'ingestion.
 *
 * L'index est construit une fois par processus puis réutilisé par tous les
 * collecteurs. Il est invalidé par `resetGazetteer`, que le chargement du
 * référentiel appelle : sans cela, un référentiel rechargé à chaud laisserait
 * le moteur sur un index périmé.
 *
 * À 1,7 M d'alias, l'ancien `ingestQuery` matérialisait 1,7 M objets `pg` :
 * 573 Mo de tas avant même `buildGazetteer`. Le chargement passe par un
 * curseur serveur (lots de 20 000) ; les textes sont stockés dans des blocs
 * `Buffer` et les identifiants dans des tableaux typés. Aucun objet de ligne
 * n'est retenu : `buildGazetteer` reçoit une vue qui réutilise une seule
 * ligne mutable. Le builder garde ce dont il a besoin (clés d'alias, noms),
 * les textes de transit disparaissent dès la fin de la construction.
 */
import { ingestPool } from "../db.js";
import { buildGazetteer, normaliser, type Gazetteer, type GazetteerRow } from "../match/gazetteer.js";

let cache: { at: number; gaz: Gazetteer } | null = null;
let pending: Promise<Gazetteer> | null = null;
const TTL_MS = 10 * 60 * 1000;
const LOT = 20_000;
const TAILLE_BLOC = 1024 * 1024;

/**
 * Textes encodés en UTF-8 dans des blocs de 1 Mo : un `Buffer` n'a pas
 * l'empreinte d'une chaîne V8 par ligne, et il est libéré en bloc.
 */
class StockageTextes {
	private blocs: Buffer[] = [];
	private courant = Buffer.allocUnsafe(TAILLE_BLOC);
	private ecrits = 0;
	/** Début du bloc courant dans l'espace d'adresses global. */
	private base = 0;
	/** Chaînes trop longues pour un bloc (jamais vu dans le référentiel). */
	private extras = new Map<number, Buffer>();

	ecrire(texte: string): number {
		const octets = Buffer.from(texte, "utf8");
		if (octets.length > TAILLE_BLOC) {
			const adresse = this.base + TAILLE_BLOC + this.extras.size;
			this.extras.set(adresse, octets);
			return adresse;
		}
		if (this.ecrits + octets.length > TAILLE_BLOC) {
			this.blocs.push(this.courant);
			this.base += TAILLE_BLOC;
			this.courant = Buffer.allocUnsafe(TAILLE_BLOC);
			this.ecrits = 0;
		}
		const adresse = this.base + this.ecrits;
		octets.copy(this.courant, this.ecrits);
		this.ecrits += octets.length;
		return adresse;
	}

	lire(adresse: number, longueur: number): string {
		const extra = this.extras.get(adresse);
		if (extra) return extra.toString("utf8");
		const index = Math.floor(adresse / TAILLE_BLOC);
		const debut = adresse - index * TAILLE_BLOC;
		const bloc = index === this.blocs.length ? this.courant : this.blocs[index];
		if (!bloc || debut + longueur > TAILLE_BLOC) return "";
		return bloc.toString("utf8", debut, debut + longueur);
	}
}

/** Dictionnaire des champs de faible cardinalité (kind, dept, city, source). */
class Dictionnaire {
	private ids = new Map<string, number>();
	private valeurs: (string | null)[] = [null];

	id(valeur: string | null): number {
		if (valeur === null) return 0;
		const connu = this.ids.get(valeur);
		if (connu !== undefined) return connu;
		const id = this.valeurs.length;
		this.ids.set(valeur, id);
		this.valeurs.push(valeur);
		return id;
	}

	valeur(id: number): string | null {
		return this.valeurs[id] ?? null;
	}
}

type Colonnes = {
	orgIds: Uint32Array;
	nomAdresses: Uint32Array;
	nomLongueurs: Uint32Array;
	aliasAdresses: Uint32Array;
	aliasLongueurs: Uint32Array;
	kinds: Uint16Array;
	depts: Uint16Array;
	cities: Uint16Array;
	sectors: Uint16Array;
	sources: Uint16Array;
	textes: StockageTextes;
	dicts: {
		kinds: Dictionnaire;
		depts: Dictionnaire;
		cities: Dictionnaire;
		sectors: Dictionnaire;
		sources: Dictionnaire;
	};
};

type LigneAlias = {
	org_id: number;
	name: string;
	kind: string;
	dept: string | null;
	city: string | null;
	sector: string | null;
	alias: string;
	source: string | null;
};

async function chargerColonnes(): Promise<Colonnes> {
	const orgIds: number[] = [];
	const nomAdresses: number[] = [];
	const nomLongueurs: number[] = [];
	const aliasAdresses: number[] = [];
	const aliasLongueurs: number[] = [];
	const kinds: number[] = [];
	const depts: number[] = [];
	const cities: number[] = [];
	const sectors: number[] = [];
	const sources: number[] = [];
	const textes = new StockageTextes();
	const dicts = {
		kinds: new Dictionnaire(), depts: new Dictionnaire(), cities: new Dictionnaire(),
		sectors: new Dictionnaire(), sources: new Dictionnaire(),
	};
	const ajouterTexte = (valeur: string, adresses: number[], longueurs: number[]) => {
		adresses.push(textes.ecrire(valeur));
		longueurs.push(Buffer.byteLength(valeur, "utf8"));
	};

	const client = await ingestPool.connect();
	try {
		await client.query("BEGIN");
		await client.query(
			`DECLARE radar_gazetteer_alias CURSOR FOR
			   SELECT a.org_id, o.name, o.kind, o.dept, o.city, o.sector, a.alias, a.source
			     FROM org_alias a
			     JOIN org o ON o.id = a.org_id
			    WHERE a.status = 'active'`,
		);
		for (;;) {
			const { rows } = await client.query<LigneAlias>(`FETCH ${LOT} FROM radar_gazetteer_alias`);
			for (const row of rows) {
				orgIds.push(row.org_id);
				ajouterTexte(row.name, nomAdresses, nomLongueurs);
				ajouterTexte(row.alias, aliasAdresses, aliasLongueurs);
				kinds.push(dicts.kinds.id(row.kind));
				depts.push(dicts.depts.id(row.dept));
				cities.push(dicts.cities.id(row.city));
				sectors.push(dicts.sectors.id(row.sector));
				sources.push(dicts.sources.id(row.source));
			}
			if (rows.length === 0) break;
		}
		await client.query("CLOSE radar_gazetteer_alias");
		await client.query("COMMIT");
	} catch (e) {
		await client.query("ROLLBACK").catch(() => {});
		throw e;
	} finally {
		client.release();
	}
	return {
		orgIds: Uint32Array.from(orgIds),
		nomAdresses: Uint32Array.from(nomAdresses),
		nomLongueurs: Uint32Array.from(nomLongueurs),
		aliasAdresses: Uint32Array.from(aliasAdresses),
		aliasLongueurs: Uint32Array.from(aliasLongueurs),
		kinds: Uint16Array.from(kinds),
		depts: Uint16Array.from(depts),
		cities: Uint16Array.from(cities),
		sectors: Uint16Array.from(sectors),
		sources: Uint16Array.from(sources),
		textes,
		dicts,
	};
}

/**
 * Vue conforme au contrat de `buildGazetteer` : deux parcours, aucune ligne
 * conservée. La normalisation est recalculée à chaque passe (~5 s sur 1,7 M
 * alias) plutôt que matérialisée, ce qui économise 100 Mo de chaînes.
 */
function vueLignes(c: Colonnes): GazetteerRow[] {
	let position = -1;
	const ligne = {
		org_id: 0,
		get name(): string {
			return c.textes.lire(c.nomAdresses[position] as number, c.nomLongueurs[position] as number);
		},
		get kind(): string {
			return c.dicts.kinds.valeur(c.kinds[position] as number) as string;
		},
		get dept(): string | null {
			return c.dicts.depts.valeur(c.depts[position] as number);
		},
		get city(): string | null {
			return c.dicts.cities.valeur(c.cities[position] as number);
		},
		get sector(): string | null {
			return c.dicts.sectors.valeur(c.sectors[position] as number);
		},
		get alias(): string {
			return c.textes.lire(c.aliasAdresses[position] as number, c.aliasLongueurs[position] as number);
		},
		get source(): string | null {
			return c.dicts.sources.valeur(c.sources[position] as number);
		},
		get nom_normalise(): string {
			return normaliser(this.alias).join(" ");
		},
	};
	const n = c.orgIds.length;
	const vue: Iterable<GazetteerRow> & { length: number } = {
		length: n,
		*[Symbol.iterator]() {
			for (let i = 0; i < n; i++) {
				position = i;
				ligne.org_id = c.orgIds[i] as number;
				yield ligne as GazetteerRow;
			}
		},
	};
	return vue as GazetteerRow[];
}

async function charger(): Promise<Gazetteer> {
	const colonnes = await chargerColonnes();
	return buildGazetteer(vueLignes(colonnes));
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
