/**
 * Index compact en lecture seule, partagé par le gazetteer.
 *
 * Un `Map<string, T>` usuel garde une entrée de table de hachage, la clé et un
 * tableau de valeurs par alias : à 1,6 M d'alias, le conteneur pèse plus que
 * les données. Ici les clés sont triées une seule fois, les identifiants sont
 * rangés dans une `Uint32Array` contiguë, et la vue `Map` ne fabrique une
 * valeur qu'à la demande. Le coût d'une consultation passe de O(1) à O(log n)
 * sur des chaînes, soit ~20 comparaisons : négligeable devant la construction
 * des fenêtres de jetons faite par `resoudre`.
 *
 * `trierPaires` est le point d'entrée unique du tri : le gazetteer trie ses
 * alias *une seule fois* (clés, ids et drapeaux dans la même permutation) au
 * lieu de construire deux Maps géantes pour détecter les clés ambiguës.
 */

/** Clés triées, uniques ; `offsets[i]..offsets[i+1]` délimite les valeurs de la clé i. */
export type IndexCompact<T> = {
	cles: string[];
	offsets: Uint32Array;
	valeurs: ArrayLike<T>;
};

/** Paires triées par clé puis par id, sans doublon (clé, id). */
export type PairesTriees = {
	cles: string[];
	offsets: Uint32Array;
	ids: Uint32Array;
	/** Drapeaux de la paire ; `OR` de ceux des doublons fusionnés. */
	drapeaux: Uint16Array;
};

/**
 * Trie des paires (clé, id) collectées en ordre d'apparition, déduplique les
 * ids d'une même clé et conserve leur ordre d'insertion.
 *
 * La permutation est un `Uint32Array` (4 octets par entrée) plutôt qu'un
 * tableau JS : à 1,7 M d'alias, c'est 7 Mo au lieu d'un tableau de pointeurs.
 */
export function trierPaires(
	cles: readonly string[],
	ids: readonly number[],
	drapeaux?: readonly number[],
): PairesTriees {
	const n = cles.length;
	if (n === 0) {
		return { cles: [], offsets: new Uint32Array(1), ids: new Uint32Array(0), drapeaux: new Uint16Array(0) };
	}
	const ordre = Uint32Array.from({ length: n }, (_, i) => i);
	ordre.sort((a, b) => {
		const ca = cles[a] as string;
		const cb = cles[b] as string;
		if (ca < cb) return -1;
		if (ca > cb) return 1;
		return (a - b); // départage explicite : garde l'ordre d'apparition
	});

	const clesTriees: string[] = [];
	const bornes: number[] = [0];
	const idsUniques: number[] = [];
	const drapeauxUniques: number[] = [];
	const vus = new Set<number>();
	let debut = 0;
	for (let i = 1; i <= n; i++) {
		if (i < n && cles[ordre[i] as number] === cles[ordre[debut] as number]) continue;
		clesTriees.push(cles[ordre[debut] as number] as string);
		vus.clear();
		for (let j = debut; j < i; j++) {
			const position = ordre[j] as number;
			const id = ids[position] as number;
			if (vus.has(id)) {
				if (drapeaux) drapeauxUniques[drapeauxUniques.length - 1] |= drapeaux[position] as number;
				continue;
			}
			vus.add(id);
			idsUniques.push(id);
			drapeauxUniques.push(drapeaux ? (drapeaux[position] as number) : 0);
		}
		bornes.push(idsUniques.length);
		debut = i;
	}
	return {
		cles: clesTriees,
		offsets: Uint32Array.from(bornes),
		ids: Uint32Array.from(idsUniques),
		drapeaux: Uint16Array.from(drapeauxUniques),
	};
}

/** Construit un index depuis des paires déjà triées et dédupliquées. */
export function indexTrie(cles: string[], offsets: Uint32Array, ids: Uint32Array): IndexCompact<number> {
	return { cles, offsets, valeurs: ids };
}

/** Vue `Map` en lecture seule : mutations et itération conforme à Map. */
export abstract class CarteLectureSeule<K, V> implements Map<K, V> {
	readonly [Symbol.toStringTag] = "Map";

	abstract get size(): number;
	abstract get(cle: K): V | undefined;
	abstract has(cle: K): boolean;
	abstract entries(): MapIterator<[K, V]>;
	abstract keys(): MapIterator<K>;
	abstract values(): MapIterator<V>;

	forEach(callback: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
		for (const [cle, valeur] of this) callback.call(thisArg, valeur, cle, this);
	}

	[Symbol.iterator](): MapIterator<[K, V]> {
		return this.entries();
	}

	/** L'index est figé à la construction ; un appelant qui l'écrit a un bug. */
	set(): never {
		throw new Error("gazetteer : index en lecture seule");
	}

	delete(): never {
		throw new Error("gazetteer : index en lecture seule");
	}

	clear(): never {
		throw new Error("gazetteer : index en lecture seule");
	}
}

/** Vue `Map<string, V>` sur un index compact, materialisant les valeurs. */
export class CarteIndexee<V> extends CarteLectureSeule<string, V> {
	constructor(
		private readonly index: IndexCompact<number>,
		private readonly materialiser: (ids: Uint32Array) => V,
	) {
		super();
	}

	get size(): number {
		return this.index.cles.length;
	}

	get(cle: string): V | undefined {
		const i = this.position(cle);
		return i < 0 ? undefined : this.valeur(i);
	}

	has(cle: string): boolean {
		return this.position(cle) >= 0;
	}

	*entries(): MapIterator<[string, V]> {
		for (let i = 0; i < this.index.cles.length; i++) {
			yield [this.index.cles[i] as string, this.valeur(i)];
		}
	}

	*keys(): MapIterator<string> {
		yield* this.index.cles;
	}

	*values(): MapIterator<V> {
		for (let i = 0; i < this.index.cles.length; i++) yield this.valeur(i);
	}

	private valeur(i: number): V {
		const debut = this.index.offsets[i] as number;
		const fin = this.index.offsets[i + 1] as number;
		return this.materialiser((this.index.valeurs as Uint32Array).subarray(debut, fin));
	}

	private position(cle: string): number {
		let bas = 0;
		let haut = this.index.cles.length - 1;
		while (bas <= haut) {
			const milieu = (bas + haut) >>> 1;
			const courante = this.index.cles[milieu] as string;
			if (courante === cle) return milieu;
			if (courante < cle) bas = milieu + 1;
			else haut = milieu - 1;
		}
		return -1;
	}
}

/**
 * Index des clés d'alias par premier jeton, pour la porte d'admission.
 *
 * Les clés triées qui partagent un premier jeton forment une plage contiguë :
 * aucun tableau de clés dupliqué n'est nécessaire, seulement les bornes.
 */
export class CartePremiersJetons extends CarteLectureSeule<string, string[]> {
	private readonly tokens: string[] = [];
	private readonly offsets: Uint32Array;

	constructor(private readonly cles: readonly string[]) {
		super();
		const bornes: number[] = [];
		let courant: string | null = null;
		for (let i = 0; i < cles.length; i++) {
			const token = (cles[i] as string).split(" ", 1)[0] as string;
			if (token === courant) continue;
			courant = token;
			this.tokens.push(token);
			bornes.push(i);
		}
		bornes.push(cles.length);
		this.offsets = Uint32Array.from(bornes);
	}

	get size(): number {
		return this.tokens.length;
	}

	get(token: string): string[] | undefined {
		const i = this.position(token);
		return i < 0 ? undefined : this.cles.slice(this.offsets[i] as number, this.offsets[i + 1] as number);
	}

	has(token: string): boolean {
		return this.position(token) >= 0;
	}

	*entries(): MapIterator<[string, string[]]> {
		for (let i = 0; i < this.tokens.length; i++) {
			yield [this.tokens[i] as string, this.get(this.tokens[i] as string) as string[]];
		}
	}

	*keys(): MapIterator<string> {
		yield* this.tokens;
	}

	*values(): MapIterator<string[]> {
		for (const token of this.tokens) yield this.get(token) as string[];
	}

	private position(token: string): number {
		let bas = 0;
		let haut = this.tokens.length - 1;
		while (bas <= haut) {
			const milieu = (bas + haut) >>> 1;
			const courant = this.tokens[milieu] as string;
			if (courant === token) return milieu;
			if (courant < token) bas = milieu + 1;
			else haut = milieu - 1;
		}
		return -1;
	}
}
