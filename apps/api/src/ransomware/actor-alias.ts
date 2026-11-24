/**
 * Fusion des alias d'acteurs et de programmes rançongiciel.
 *
 * Le référentiel MISP Galaxy décrit un même acteur sous plusieurs formes :
 * `LockBit`, `Lockbit3`, `.LockBit`, `ABCD ransomware`… Ce module les
 * rassemble en composantes connexes (union-find) et choisit une forme
 * canonique par composante.
 *
 * Règle dure : **aucune fusion sans source**. Chaque nom d'alias porte la
 * grappe Galaxy qui l'atteste ; une grappe sans source lève une erreur au
 * lieu de produire une fusion silencieuse.
 */

/** Une grappe MISP Galaxy (un acteur ou un programme) et ses alias déclarés. */
export type GalaxyClusterInput = {
	/** Nom de la grappe, forme affichée par MISP Galaxy. */
	value: string;
	/** Alias déclarés dans `meta.synonyms`. */
	synonyms?: readonly string[];
	/** Extensions de chiffrement déclarées dans `meta.extensions`. */
	extensions?: readonly string[];
	/** Nombre de références de la grappe ; sert à choisir la forme canonique. */
	refs?: number;
	/** UUID de la grappe Galaxy. */
	uuid?: string;
	/** Identifiant de la source, ex. `misp-galaxy:ransomware`. */
	source: string;
	/** URL de la source, ex. le fichier de grappes MISP Galaxy. */
	sourceUrl: string;
};

/** Une ligne de la table `actor_alias`. */
export type ActorAliasRow = {
	canonique: string;
	alias: string;
	aliasNorm: string;
	source: string;
	sourceUrl: string;
	galaxyUuid: string | null;
};

export type ActorAliasComponent = {
	/** Forme retenue pour l'acteur/programme. */
	canonique: string;
	/** Toutes les graphies distinctes de la composante, triées. */
	aliases: string[];
	/** Toutes les preuves (une par graphie et par source). */
	rows: ActorAliasRow[];
};

/** Suffixes génériques qui ne distinguent pas deux acteurs. */
const GENERIC_SUFFIXES: Record<string, true> = {
	ransomware: true,
	ransomwares: true,
	group: true,
	groups: true,
	team: true,
	teams: true,
	gang: true,
	gangs: true,
	locker: true,
	lockers: true,
	crypt: true,
	cryptor: true,
	decryptor: true,
	unknown: true,
	fake: true,
	the: true,
};

/** Clés génériques : les fusionner créerait de faux positifs. */
const GENERIC_KEYS: Record<string, true> = {
	group: true,
	team: true,
	gang: true,
	ransomware: true,
	locker: true,
	crypt: true,
	cryptor: true,
	decryptor: true,
	unknown: true,
	fake: true,
	the: true,
};

/**
 * Normalise une graphie : minuscules, diacritiques retirés, ponctuation
 * ramenée à des espaces. Les scripts non latins sont conservés.
 *
 * `LockBit` et `.LockBit` donnent tous deux `lockbit`.
 */
export function normalizeActorAlias(raw: string): string {
	return raw
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim()
		.replace(/\s+/g, " ");
}

/**
 * Clé de fusion : normalisation + retrait des suffixes génériques et des
 * numéros de version. `LockBit`, `LockBit 3.0` et `Lockbit3` partagent la
 * clé `lockbit`.
 *
 * Garde-fous contre les fusions abusives :
 *  - une clé générique (`group`, `ransomware`…) n'est jamais fusionnée ;
 *  - un suffixe numérique collé n'est retiré que si le radical alphabétique
 *    fait au moins 5 lettres et se termine par une minuscule. `APT1` garde
 *    donc sa clé `apt1` et ne fusionne pas avec `APT2`.
 */
export function actorAliasKey(raw: string): string {
	const tokens = normalizeActorAlias(raw).split(" ").filter(Boolean);
	if (tokens.length === 0) return "";

	while (tokens.length > 1 && GENERIC_SUFFIXES[tokens[tokens.length - 1]!] === true) {
		tokens.pop();
	}
	while (tokens.length > 1 && /^v?\d{1,2}$/.test(tokens[tokens.length - 1]!)) {
		tokens.pop();
	}

	let compact = tokens.join("");
	// `Lockbit3` -> `lockbit`. Un suffixe de 1 ou 2 chiffres seulement : un
	// identifiant comme `Storm-0558` ou `GTG-1002` reste distinct.
	const attached = compact.match(/^(.*\p{L}{5,})(\d{1,2})$/u);
	if (attached?.[1] && /\p{Ll}$/u.test(attached[1])) compact = attached[1];

	if (compact.length < 3 || GENERIC_KEYS[compact] === true) return "";
	return compact;
}

/** Union-find déterministe, à compression de chemin et union par rang. */
export class UnionFind<T> {
	private readonly parent = new Map<T, T>();
	private readonly rank = new Map<T, number>();

	add(item: T): void {
		if (!this.parent.has(item)) {
			this.parent.set(item, item);
			this.rank.set(item, 0);
		}
	}

	find(item: T): T {
		this.add(item);
		let root = item;
		while (this.parent.get(root) !== root) root = this.parent.get(root)!;
		let cursor = item;
		while (this.parent.get(cursor) !== root) {
			const next = this.parent.get(cursor)!;
			this.parent.set(cursor, root);
			cursor = next;
		}
		return root;
	}

	/** Renvoie `true` si les deux éléments étaient dans deux composantes. */
	union(a: T, b: T): boolean {
		const rootA = this.find(a);
		const rootB = this.find(b);
		if (rootA === rootB) return false;
		const rankA = this.rank.get(rootA)!;
		const rankB = this.rank.get(rootB)!;
		if (rankA < rankB) this.parent.set(rootA, rootB);
		else if (rankA > rankB) this.parent.set(rootB, rootA);
		else {
			this.parent.set(rootB, rootA);
			this.rank.set(rootA, rankA + 1);
		}
		return true;
	}

	/** Toutes les composantes, chaque groupe trié. */
	groups(): Map<T, T[]> {
		const groups = new Map<T, T[]>();
		for (const item of this.parent.keys()) {
			const root = this.find(item);
			const group = groups.get(root);
			if (group) group.push(item);
			else groups.set(root, [item]);
		}
		for (const group of groups.values()) group.sort((a, b) => String(a).localeCompare(String(b)));
		return groups;
	}

	get size(): number {
		return this.parent.size;
	}
}

type Occurrence = {
	node: string;
	/** Graphie réellement observée dans la grappe. */
	alias: string;
	source: string;
	sourceUrl: string;
	galaxyUuid: string | null;
};

type NodeInfo = {
	/** Forme affichée retenue pour un nœud (utile aux diagnostics). */
	display: string;
	/** Nombre maximal de références quand le nom est une valeur de grappe. */
	refs: number;
	/** Vrai si le nom est la forme affichée d'au moins une grappe. */
	isClusterValue: boolean;
};

function assertSourced(cluster: GalaxyClusterInput, name: string): void {
	if (!cluster.source?.trim()) {
		throw new Error(`alias sans source : « ${name} » (${cluster.value})`);
	}
	if (!cluster.sourceUrl?.trim()) {
		throw new Error(`alias sans URL de source : « ${name} » (${cluster.value})`);
	}
}

/**
 * Construit les composantes d'alias à partir de grappes Galaxy.
 *
 * Règles de fusion, du plus fort au plus faible :
 *  1. **Même grappe** : valeur, synonymes et extensions d'une grappe sont les
 *     alias d'un même acteur. La grappe est la preuve.
 *  2. **Synonyme égal à une valeur** : si une grappe déclare `Akira` en
 *     synonyme et qu'une autre grappe s'appelle `Akira`, les deux grappes
 *     désignent le même acteur. La correspondance exacte est la preuve.
 *  3. **Même clé de valeur** : deux valeurs de grappes partagent
 *     `actorAliasKey` (`LockBit`, `Lockbit3`) : même acteur.
 *
 * On ne fusionne **pas** deux grappes parce qu'elles partagent un synonyme ou
 * une extension : MISP Galaxy réutilise des formes génériques (`.locked`,
 * `.crypt`, codes de suivi). Les fusionner relierait des centaines d'acteurs
 * distincts — constaté sur les données réelles avant cette règle.
 *
 * La forme canonique est la valeur de grappe la plus citée de la composante,
 * puis la plus courte, puis l'ordre lexicographique.
 */
export function clusterActorAliases(
	clusters: readonly GalaxyClusterInput[],
): ActorAliasComponent[] {
	const unionFind = new UnionFind<string>();
	const occurrences = new Map<string, Occurrence[]>();
	const nodeInfo = new Map<string, NodeInfo>();
	const valueNodeByNorm = new Map<string, string>();

	const addOccurrence = (
		cluster: GalaxyClusterInput,
		rawName: string,
		node: string,
		isClusterValue: boolean,
	): void => {
		const alias = rawName.trim();
		assertSourced(cluster, alias);
		unionFind.add(node);

		const occurrence: Occurrence = {
			node,
			alias,
			source: cluster.source,
			sourceUrl: cluster.sourceUrl,
			galaxyUuid: cluster.uuid?.toLowerCase() ?? null,
		};
		const list = occurrences.get(node);
		if (list) list.push(occurrence);
		else occurrences.set(node, [occurrence]);

		const info = nodeInfo.get(node) ?? { display: alias, refs: 0, isClusterValue: false };
		if (isClusterValue) {
			info.isClusterValue = true;
			info.refs = Math.max(info.refs, cluster.refs ?? 0);
		}
		nodeInfo.set(node, info);
	};

	// Première passe : toutes les valeurs, pour connaître les correspondances
	// synonyme == valeur avant d'ajouter les synonymes.
	for (const cluster of clusters) {
		const value = cluster.value.trim();
		const normalized = normalizeActorAlias(value);
		if (!value || !normalized) continue;
		const node = `v:${normalized}`;
		addOccurrence(cluster, value, node, true);
		if (!valueNodeByNorm.has(normalized)) valueNodeByNorm.set(normalized, node);
	}

	// Seconde passe : synonymes et extensions, rattachés à leur grappe.
	for (const cluster of clusters) {
		const value = cluster.value.trim();
		const valueNorm = normalizeActorAlias(value);
		if (!value || !valueNorm) continue;
		const valueNode = `v:${valueNorm}`;
		const clusterId = `${cluster.source}\u0000${cluster.sourceUrl}\u0000${value}`;

		for (const synonym of cluster.synonyms ?? []) {
			const alias = synonym.trim();
			const normalized = normalizeActorAlias(alias);
			if (!alias || !normalized) continue;
			const node = `s:${clusterId}\u0000synonym\u0000${normalized}`;
			addOccurrence(cluster, alias, node, false);
			unionFind.union(valueNode, node);
			// Correspondance exacte avec une valeur d'une autre grappe : preuve
			// forte que les deux grappes nomment le même acteur.
			const otherValue = valueNodeByNorm.get(normalized);
			if (otherValue) unionFind.union(node, otherValue);
		}

		for (const extension of cluster.extensions ?? []) {
			const alias = extension.trim();
			const normalized = normalizeActorAlias(alias);
			if (!alias || !normalized) continue;
			const node = `s:${clusterId}\u0000extension\u0000${normalized}`;
			addOccurrence(cluster, alias, node, false);
			unionFind.union(valueNode, node);
			const otherValue = valueNodeByNorm.get(normalized);
			if (otherValue) unionFind.union(node, otherValue);
		}
	}

	// Même clé de fusion entre valeurs de grappes : `LockBit` / `Lockbit3`.
	const valuesByKey = new Map<string, string[]>();
	for (const [node, info] of nodeInfo) {
		if (!info.isClusterValue) continue;
		const key = actorAliasKey(info.display);
		if (!key) continue;
		const list = valuesByKey.get(key);
		if (list) list.push(node);
		else valuesByKey.set(key, [node]);
	}
	for (const list of valuesByKey.values()) {
		for (let i = 1; i < list.length; i += 1) unionFind.union(list[0]!, list[i]!);
	}

	const components: ActorAliasComponent[] = [];
	for (const nodes of unionFind.groups().values()) {
		const canonique = chooseCanonical(nodes, nodeInfo);
		const rowKeys = new Set<string>();
		const aliasSet = new Set<string>();
		const rows: ActorAliasRow[] = [];
		for (const node of nodes) {
			for (const occurrence of occurrences.get(node) ?? []) {
				aliasSet.add(occurrence.alias);
				const aliasNorm = actorAliasKey(occurrence.alias) || normalizeActorAlias(occurrence.alias);
				if (!aliasNorm) continue;
				const rowKey = `${canonique}\u0000${occurrence.alias}\u0000${occurrence.source}\u0000${occurrence.sourceUrl}`;
				if (rowKeys.has(rowKey)) continue;
				rowKeys.add(rowKey);
				rows.push({
					canonique,
					alias: occurrence.alias,
					aliasNorm,
					source: occurrence.source,
					sourceUrl: occurrence.sourceUrl,
					galaxyUuid: occurrence.galaxyUuid,
				});
			}
		}
		rows.sort(
			(a, b) =>
				a.aliasNorm.localeCompare(b.aliasNorm) ||
				a.alias.localeCompare(b.alias) ||
				a.sourceUrl.localeCompare(b.sourceUrl),
		);
		const aliases = [...aliasSet].sort((a, b) => a.localeCompare(b));
		components.push({ canonique, aliases, rows });
	}

	components.sort((a, b) => a.canonique.localeCompare(b.canonique));
	return components;
}

/**
 * Choisit la forme canonique : valeur de grappe la plus référencée, puis la
 * plus courte, puis l'ordre lexicographique. Repli sur le nom le plus court
 * si la composante ne contient aucune valeur (cas théorique).
 */
function chooseCanonical(nodes: readonly string[], info: Map<string, NodeInfo>): string {
	const values = nodes.filter((node) => info.get(node)?.isClusterValue);
	const candidates = values.length > 0 ? values : nodes;
	const best = [...candidates].sort((a, b) => {
		const displayA = info.get(a)?.display ?? a;
		const displayB = info.get(b)?.display ?? b;
		const refsA = info.get(a)?.refs ?? 0;
		const refsB = info.get(b)?.refs ?? 0;
		if (refsA !== refsB) return refsB - refsA;
		if (displayA.length !== displayB.length) return displayA.length - displayB.length;
		return displayA.localeCompare(displayB);
	})[0]!;
	return info.get(best)?.display ?? best;
}

/** Objectif déclaré : au moins 20 canoniques avec deux alias ou plus. */
export const OBJECTIF_CANONIQUES_MIN = 20;

export type ObjectifActorAlias = {
	valeur: number;
	cible: number;
	atteint: boolean;
	ligne: string;
};

/** Produit la ligne OBJECTIF à partir du critère mesuré, sans arrondi. */
export function mesurerObjectifActorAlias(valeur: number): ObjectifActorAlias {
	const atteint = valeur >= OBJECTIF_CANONIQUES_MIN;
	const ligne = atteint
		? `OBJECTIF : atteint — ${valeur} canoniques avec >= 2 alias / cible >= ${OBJECTIF_CANONIQUES_MIN}`
		: `OBJECTIF : partiel — ${valeur} canoniques avec >= 2 alias / cible >= ${OBJECTIF_CANONIQUES_MIN}, manque ${OBJECTIF_CANONIQUES_MIN - valeur} canoniques`;
	return { valeur, cible: OBJECTIF_CANONIQUES_MIN, atteint, ligne };
}

/** La déclaration publiée doit être exacte et unique, jamais une variante périmée. */
export function verifierDeclarationObjectifActorAlias(rapport: string, ligne: string): boolean {
	return rapport.split(/\r?\n/).filter((publiee) => publiee === ligne).length === 1;
}
