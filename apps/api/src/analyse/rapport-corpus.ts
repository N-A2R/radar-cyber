/**
 * Progression du corpus : agrégation, historique JSON et rendu Markdown.
 *
 * Ce module ne touche ni à la base ni au système de fichiers : le script
 * `scripts/rapport-corpus.mts` fournit les données, il ne fait que les
 * compter, les comparer au snapshot précédent et écrire le rapport.
 *
 * Les compteurs sont des minimums : une source sans département inférable ne
 * compte dans aucun département, et une organisation sans événement n'a pas
 * de famille observable (elle est rangée sous `sans-famille`).
 */
export type Indicateur = "declarees" | "productives" | "rouges" | "orgsAvecDomaine" | "incidents";

export type Compteurs = Record<Indicateur, number>;

export type Snapshot = {
	date: string;
	depts: Record<string, Compteurs>;
	familles: Record<string, Compteurs>;
	total: Compteurs;
};

export type Historique = {
	version: 1;
	snapshots: Snapshot[];
};

export const INDICATEURS: readonly Indicateur[] = [
	"declarees",
	"productives",
	"rouges",
	"orgsAvecDomaine",
	"incidents",
];

export const OBJECTIF_CORPUS_PROGRESSION = {
	departements: 12,
	indicateurs: INDICATEURS.length,
	cellules: 12 * INDICATEURS.length,
} as const;

export const LIBELLES_INDICATEURS: Record<Indicateur, string> = {
	declarees: "Sources déclarées",
	productives: "Sources productives",
	rouges: "Sources rouges",
	orgsAvecDomaine: "Organisations avec domaine",
	incidents: "Incidents du corpus",
};

export const SANS_FAMILLE = "sans-famille";
export const HORS_NA = "hors-na";
export const HISTORIQUE_VERSION = 1 as const;
export const LIMITE_SNAPSHOTS = 30;

export function compteursVides(): Compteurs {
	return { declarees: 0, productives: 0, rouges: 0, orgsAvecDomaine: 0, incidents: 0 };
}

/** Snapshot vierge : les départements sont toujours présents, même à zéro. */
export function snapshotVide(date: string, depts: readonly string[]): Snapshot {
	const snapshot: Snapshot = { date, depts: {}, familles: {}, total: compteursVides() };
	for (const dept of depts) snapshot.depts[dept] = compteursVides();
	return snapshot;
}

function ajouter(
	groupe: Record<string, Compteurs>,
	cle: string,
	indicateur: Indicateur,
	valeur = 1,
): void {
	groupe[cle] ??= compteursVides();
	groupe[cle]![indicateur] += valeur;
}

/** Une source compte dans son département et dans sa famille. */
export function ajouterSource(
	snapshot: Snapshot,
	dept: string,
	famille: string,
	evenements: number,
	dernierFait: number | null,
	seuilRouge: number,
): void {
	const rouge = dernierFait === null || dernierFait < seuilRouge;
	snapshot.depts[dept] ??= compteursVides();
	snapshot.familles[famille] ??= compteursVides();
	for (const compteurs of [snapshot.depts[dept]!, snapshot.familles[famille]!]) {
		compteurs.declarees++;
		if (evenements > 0) compteurs.productives++;
		if (rouge) compteurs.rouges++;
	}
}

/** Une organisation avec domaine est comptée une seule fois, dans sa famille. */
export function ajouterOrganisation(
	snapshot: Snapshot,
	dept: string,
	famille: string,
	nombre = 1,
): void {
	ajouter(snapshot.depts, dept, "orgsAvecDomaine", nombre);
	ajouter(snapshot.familles, famille, "orgsAvecDomaine", nombre);
}

/** Un incident du corpus est compté dans son département et sa famille. */
export function ajouterIncident(snapshot: Snapshot, dept: string, famille: string): void {
	ajouter(snapshot.depts, dept, "incidents");
	ajouter(snapshot.familles, famille, "incidents");
}

/** Le total suit les départements : jamais de double compte entre familles. */
export function recomposerTotal(snapshot: Snapshot): void {
	const total = compteursVides();
	for (const compteurs of Object.values(snapshot.depts)) {
		for (const indicateur of INDICATEURS) total[indicateur] += compteurs[indicateur];
	}
	snapshot.total = total;
}

function estCompteurs(valeur: unknown): valeur is Compteurs {
	return (
		typeof valeur === "object" &&
		valeur !== null &&
		INDICATEURS.every((indicateur) =>
			Number.isInteger((valeur as Record<string, unknown>)[indicateur]),
		)
	);
}

function estGroupe(valeur: unknown): valeur is Record<string, Compteurs> {
	return (
		typeof valeur === "object" &&
		valeur !== null &&
		Object.values(valeur).every(estCompteurs)
	);
}

export function estSnapshot(valeur: unknown): valeur is Snapshot {
	if (typeof valeur !== "object" || valeur === null) return false;
	const snapshot = valeur as Record<string, unknown>;
	return (
		typeof snapshot.date === "string" &&
		/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date) &&
		estGroupe(snapshot.depts) &&
		estGroupe(snapshot.familles) &&
		estCompteurs(snapshot.total)
	);
}

/** Relit l'historique JSON ; un fichier corrompu est une erreur, pas un zéro. */
export function lireHistorique(texte: string): Snapshot[] {
	let brut: unknown;
	try {
		brut = JSON.parse(texte) as unknown;
	} catch {
		throw new Error("historique JSON illisible");
	}
	if (typeof brut !== "object" || brut === null) throw new Error("historique JSON invalide");
	const snapshots = (brut as Record<string, unknown>).snapshots;
	if (!Array.isArray(snapshots) || !snapshots.every(estSnapshot)) {
		throw new Error("historique JSON invalide");
	}
	return snapshots;
}

export function ecrireHistorique(snapshots: readonly Snapshot[]): string {
	const historique: Historique = { version: HISTORIQUE_VERSION, snapshots: [...snapshots] };
	return `${JSON.stringify(historique, null, 2)}\n`;
}

/** Deux runs le même jour sont deux rapports : on garde les deux snapshots. */
export function ajouterSnapshot(
	snapshots: readonly Snapshot[],
	snapshot: Snapshot,
	limite = LIMITE_SNAPSHOTS,
): Snapshot[] {
	return [...snapshots, snapshot].slice(-limite);
}

function signe(valeur: number): string {
	return valeur > 0 ? "+" : "";
}

export function delta(valeur: number, precedent: number | undefined): string {
	if (precedent === undefined) return String(valeur);
	return `${valeur} (${signe(valeur - precedent)}${valeur - precedent})`;
}

function ecartJours(date: string, precedent: string): string {
	const jours = Math.round(
		(Date.parse(`${date}T00:00:00Z`) - Date.parse(`${precedent}T00:00:00Z`)) / 86_400_000,
	);
	return `${signe(jours)}${jours} j`;
}

function unionClefs(...groupes: (Record<string, Compteurs> | undefined)[]): string[] {
	const clefs = new Set<string>();
	for (const groupe of groupes) if (groupe !== undefined) for (const clef of Object.keys(groupe)) clefs.add(clef);
	return [...clefs].sort((a, b) => a.localeCompare(b, "fr"));
}

function ecartSigne(valeur: number, precedent: number | undefined): string {
	if (precedent === undefined) return "—";
	const diff = valeur - precedent;
	return `${signe(diff)}${diff}`;
}

function tableau(
	lignes: string[],
	titre: string,
	nomColonne: string,
	clefs: readonly string[],
	label: (clef: string) => string,
	snapshot: Snapshot,
	precedent: Snapshot | null,
	groupe: "depts" | "familles",
): void {
	lignes.push(`## ${titre}`, "");
	lignes.push(
		`| ${nomColonne} |` +
			INDICATEURS.map((i) => ` ${LIBELLES_INDICATEURS[i]} |`).join(""),
		`| --- |${INDICATEURS.map(() => " ---: |").join("")}`,
	);
	for (const clef of clefs) {
		const compteurs = snapshot[groupe][clef] ?? compteursVides();
		lignes.push(
			`| ${label(clef)} | ` +
				INDICATEURS.map((i) => delta(compteurs[i], precedent?.[groupe][clef]?.[i])).join(" | ") +
				" |",
		);
	}
	lignes.push("");
}

function conclusion(snapshot: Snapshot, precedent: Snapshot | null): string {
	const chiffres = INDICATEURS.map(
		(i) => `${LIBELLES_INDICATEURS[i].toLowerCase()} ${snapshot.total[i]}`,
	).join(", ");
	if (precedent === null) return `**Conclusion** : ${chiffres} au ${snapshot.date}.`;
	const ecarts = INDICATEURS.map((i) => {
		const diff = snapshot.total[i] - (precedent.total[i] ?? 0);
		return `${LIBELLES_INDICATEURS[i].toLowerCase()} ${signe(diff)}${diff}`;
	}).join(", ");
	return `**Conclusion** : ${chiffres} ; depuis le ${precedent.date}, ${ecarts}.`;
}

/** Rend le document publié. `depts` force les douze départements, même vides. */
export function rendreRapport(
	snapshot: Snapshot,
	precedent: Snapshot | null,
	depts: readonly string[],
	libellesDept: Readonly<Record<string, string>>,
	cheminHistorique: string,
): string {
	const lignes: string[] = [];
	lignes.push(`# Progression du corpus — ${snapshot.date}`, "");
	lignes.push(
		`Date : ${snapshot.date} (Europe/Paris) · rapport précédent : ` +
			(precedent === null
				? "aucun (premier rapport)"
				: `${precedent.date} · écart : ${ecartJours(snapshot.date, precedent.date)}`),
		"",
		`Historique JSON : \`${cheminHistorique}\`.`,
		"",
	);

	lignes.push("## Synthèse", "");
	lignes.push(
		`| Indicateur | Total | Depuis le ${precedent?.date ?? "—"} |`,
		"| --- | ---: | ---: |",
	);
	for (const indicateur of INDICATEURS) {
		const avant = precedent?.total[indicateur];
		lignes.push(
			`| ${LIBELLES_INDICATEURS[indicateur]} | ` +
				`${delta(snapshot.total[indicateur], avant)} | ` +
				`${ecartSigne(snapshot.total[indicateur], avant)} |`,
		);
	}
	lignes.push("");

	const clefsDepts = unionClefs(
		Object.fromEntries(depts.map((d) => [d, compteursVides()])),
		snapshot.depts,
		precedent?.depts,
	);
	tableau(
		lignes,
		"Par département",
		"Département",
		clefsDepts,
		(clef) =>
			clef === HORS_NA
				? "Hors Nouvelle-Aquitaine"
				: `${clef} — ${libellesDept[clef] ?? "hors référentiel"}`,
		snapshot,
		precedent,
		"depts",
	);
	tableau(
		lignes,
		"Par famille",
		"Famille",
		unionClefs(snapshot.familles, precedent?.familles),
		(clef) => clef,
		snapshot,
		precedent,
		"familles",
	);

	lignes.push("## Définitions", "");
	lignes.push(
		"- **Déclarées** : une ligne de `source` dont le département est inféré par `departementDeLaSource` (même règle que `/stats/departements`).",
		"- **Productives** : au moins un événement collecté, toutes dates confondues.",
		"- **Rouges** : aucun événement, ou dernier fait antérieur à 7 jours (axe distinct de « productives » : une source peut être productive et rouge).",
		"- **Organisations avec domaine** : `org.dept` reconnu et `domain` non vide, rangées dans la famille de leur dernier événement, ou `sans-famille` sans événement.",
		"- **Incidents du corpus** : lignes de `bench/corpus/incidents-*.jsonl` avec un `departement` reconnu ; leur famille est le champ `type` en minuscules.",
		"- Les familles des sources viennent de `source.family` ; les familles des incidents viennent du corpus. Les deux vocabulaires se recouvrent sans se confondre.",
		"- Les sources sans périmètre départemental explicite ne comptent nulle part : les totaux de sources sont des minimums.",
		"- `valeur (écart)` donne le chiffre et sa variation signée depuis le rapport précédent ; `—` signifie qu'il n'y avait pas de rapport antérieur.",
		"",
		conclusion(snapshot, precedent),
		"",
	);
	const deptsNA = depts.filter((dept) => dept !== HORS_NA);
	const cellules = deptsNA.length * INDICATEURS.length;
	const etat = deptsNA.length === OBJECTIF_CORPUS_PROGRESSION.departements ? "atteint" : "partiel";
	lignes.push(
		"",
		"Mesure reproductible : `pnpm mesure:corpus-progression --check` (lecture seule, aucune donnée personnelle).",
		"",
		`OBJECTIF : ${etat} — ${deptsNA.length} / ${OBJECTIF_CORPUS_PROGRESSION.departements} départements de Nouvelle-Aquitaine couverts par ${INDICATEURS.length} indicateurs (${cellules} / ${OBJECTIF_CORPUS_PROGRESSION.cellules} cellules)`,
		"",
	);
	return lignes.join("\n");
}
