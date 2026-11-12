/**
 * Dérivation des noms et alias du référentiel territorial.
 *
 * Pourquoi ce module existe : `buildAliasIndex` n'indexe **que** `org_alias`.
 * Le nom de l'organisation n'est jamais indexé implicitement. Un chargeur qui
 * n'insère pas le nom comme alias produit des organisations invisibles au
 * rattachement. Chaque entité reçoit donc son propre nom dans ses alias.
 *
 * Règle de prudence : les formes abrégées (« St Médard ») ne sont produites
 * qu'avec un mot institutionnel devant. Une abréviation nue est trop proche
 * d'une autre commune : « St Médard » seul entrerait en collision avec
 * Saint-Médard-en-Jalles. Les formes pleines, elles, sont sans ambiguïté.
 *
 * Fonctions pures, sans base de données : testables seules.
 */

/** Préfixes de type EPCI tels que les fournit le découpage administratif. */
const EPCI_LABELS: Record<string, string> = {
	CC: "Communauté de communes",
	CA: "Communauté d'agglomération",
	CU: "Communauté urbaine",
	METRO: "Métropole",
};

/**
 * Article contracté des douze départements de la région. Table explicite :
 * le genre des noms de départements ne se déduit pas par une règle fiable.
 */
const DEPT_ARTICLES: Record<string, string> = {
	"16": "de la",
	"17": "de la",
	"19": "de la",
	"23": "de la",
	"24": "de la",
	"33": "de la",
	"40": "des",
	"47": "du",
	"64": "des",
	"79": "des",
	"86": "de la",
	"87": "de la",
};

const VOWELS = /^[aeiouyàâäéèêëîïôöùûüœh]/i;

/** « de Le Bouscat » n'existe pas en français : « du Bouscat ». */
function contract(preposition: string, name: string): string {
	if (/^Le\s+/i.test(name)) return `${preposition} du ${name.replace(/^Le\s+/i, "")}`;
	if (/^Les\s+/i.test(name)) return `${preposition} des ${name.replace(/^Les\s+/i, "")}`;
	return `${preposition} de ${name}`;
}

/** Élision devant voyelle : « Mairie d'Agen », pas seulement « Mairie de Agen ». */
function elide(preposition: string, name: string): string | null {
	if (!VOWELS.test(name)) return null;
	return `${preposition} d'${name}`;
}

/**
 * Alias d'une commune. `children` sont les noms des communes déléguées ou
 * associées rattachées : leurs noms restent employés dans la presse.
 */
export function communeAliases(nom: string, children: readonly string[] = []): string[] {
	const out = new Set<string>();
	const clean = nom.replace(/\s+/g, " ").trim();
	if (clean === "") return [];

	// Nom nu : le moteur le classe « court » s'il ne fait qu'un jeton, et
	// n'y rattache alors qu'en présence d'un mot institutionnel.
	out.add(clean);

	for (const prefix of ["Commune", "Mairie", "Ville"]) {
		out.add(contract(prefix, clean));
		out.add(`${prefix} de ${clean}`);
		const short = elide(prefix, clean);
		if (short) out.add(short);
	}

	// Abréviations Saint/Sainte, uniquement sous forme institutionnelle.
	const abbreviated = clean
		.replace(/^Saint-/i, "St-")
		.replace(/^Sainte-/i, "Ste-")
		.replace(/^Saint\s+/i, "St ")
		.replace(/^Sainte\s+/i, "Ste ");
	if (abbreviated !== clean) {
		for (const prefix of ["Commune", "Mairie", "Ville"]) {
			out.add(contract(prefix, abbreviated));
			out.add(`${prefix} de ${abbreviated}`);
		}
	}

	for (const child of children) {
		const name = child.replace(/\s+/g, " ").trim();
		if (name === "" || name === clean) continue;
		out.add(name);
		for (const prefix of ["Mairie", "Commune", "Ville"]) {
			out.add(contract(prefix, name));
			const short = elide(prefix, name);
			if (short) out.add(short);
		}
	}

	return [...out].filter((alias) => alias.length >= 3);
}

/** Nom officiel reconstitué d'un EPCI : « CA du X » → « Communauté d'agglomération du X ». */
export function epciName(nom: string, type: string): string {
	const label = EPCI_LABELS[type];
	if (!label) return nom;
	// Certaines entrées portent déjà la nature de l'EPCI dans leur nom :
	// « Métropole de Bordeaux », ou « Bordeaux Métropole » où le mot est à la
	// fin. Préfixer produirait « Métropole Bordeaux Métropole ». On détecte le
	// mot distinctif du libellé (« métropole », « agglomération », « communes »,
	// « urbaine ») n'importe où dans le nom.
	const words = label.toLowerCase().split(" ");
	const distinctive = words[words.length - 1];
	if (nom.toLowerCase().includes(distinctive)) return nom;
	const rest = nom.replace(/^(CC|CA|CU|METRO)\s+/i, "").trim();
	return `${label} ${rest}`.trim();
}

export function epciAliases(nom: string, type: string): string[] {
	const out = new Set<string>();
	const full = epciName(nom, type);
	const rest = nom.replace(/^(CC|CA|CU|METRO)\s+/i, "").trim();
	if (full) out.add(full);
	if (nom) out.add(nom);
	// Cœur du nom, sans l'article : « Grand Villeneuvois ».
	const core = rest.replace(/^(de la|du|des|de l'|d'|de|l')\s*/i, "").trim();
	if (core.length >= 6 && core !== full) out.add(core);
	const label = EPCI_LABELS[type];
	if (label && core && core !== rest) out.add(`${label} ${core}`);
	return [...out].filter((alias) => alias.length >= 3);
}

/** « Département de la Gironde », « Conseil départemental de la Gironde », « CD33 ». */
export function departementName(nom: string, code: string): string {
	const article = DEPT_ARTICLES[code] ?? "de";
	return `Département ${article} ${nom}`;
}

export function departementAliases(nom: string, code: string): string[] {
	const article = DEPT_ARTICLES[code] ?? "de";
	const out = new Set<string>([
		departementName(nom, code),
		`Conseil départemental ${article} ${nom}`,
		`Conseil départemental de ${nom}`,
		`Département de ${nom}`,
		nom,
	]);
	if (/^\d{2,3}$/.test(code)) out.add(`CD${code}`);
	return [...out].filter((alias) => alias.length >= 3);
}

export function regionAliases(nom: string): string[] {
	return [...new Set([
		`Région ${nom}`,
		`Conseil régional de ${nom}`,
		`Conseil régional ${nom}`,
		nom,
	])].filter((alias) => alias.length >= 3);
}
