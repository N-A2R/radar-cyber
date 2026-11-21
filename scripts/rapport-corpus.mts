/**
 * Rapport de progression du corpus — un chiffre par département, une date, un
 * écart avec le rapport précédent. Le document publié est
 * `docs/corpus-progression.md` : c'est la preuve que le corpus grossit.
 *
 * Chaque compteur est recalculé au moment du run :
 *   - sources déclarées : lignes de `source` rattachées au département ;
 *   - sources productives : au moins un événement, toutes dates confondues
 *     (même définition que `scripts/sources-productives.mts`) ;
 *   - sources rouges : aucun événement ou dernier fait plus vieux que 7 jours
 *     (même définition que `scripts/sources-productives.mts`) ;
 *   - organisations avec domaine : `org.dept` + `org.domain` non vide ;
 *   - incidents du corpus : lignes de `bench/corpus/*.jsonl` portant un
 *     `departement` (le fichier `sources-nationales.jsonl` n'en a pas).
 *
 * `source` n'a pas de colonne département : le rattachement utilise la même
 * inférence que l'API `/stats/departements` (`departementDeLaSource`). Les
 * sources nationales, ou à périmètre ambigu, ne comptent dans aucun
 * département ; les compteurs de sources sont donc des minimums.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/rapport-corpus.mts
 *   apps/api/node_modules/.bin/tsx scripts/rapport-corpus.mts --out /tmp/rapport.md
 *
 * Lecture seule sur la base ; seule la sortie Markdown est écrite.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";

const { query, closePools } = await import("../apps/api/src/db.js");
const { departementDeLaSource } = await import("../apps/api/src/routes/stats.js");
const { DEPT_LABELS } = await import("../apps/api/src/collectors/relevance.js");

const CORPUS = fileURLToPath(new URL("../bench/corpus/", import.meta.url));
const SORTIE_PAR_DEFAUT = fileURLToPath(new URL("../docs/corpus-progression.md", import.meta.url));

type Indicateur = "declarees" | "productives" | "rouges" | "orgsAvecDomaine" | "incidents";
type Compteurs = Record<Indicateur, number>;

type SourceRow = {
	id: string;
	name: string;
	url: string;
	description: string | null;
	enabled: boolean;
	evenements: number;
	dernier_fait: Date | null;
};

type Snapshot = {
	date: string;
	depts: Record<string, Compteurs>;
	total: Compteurs;
};

const INDICATEURS: readonly Indicateur[] = [
	"declarees",
	"productives",
	"rouges",
	"orgsAvecDomaine",
	"incidents",
];
const LIBELLES_INDICATEURS: Record<Indicateur, string> = {
	declarees: "Sources déclarées",
	productives: "Sources productives",
	rouges: "Sources rouges",
	orgsAvecDomaine: "Organisations avec domaine",
	incidents: "Incidents du corpus",
};

const DEPTS: readonly string[] = Object.keys(DEPT_LABELS).sort((a, b) => a.localeCompare(b, "fr"));
const HORS_NA = "hors-na";

function normaliser(texte: string): string {
	return texte
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

const CODE_PAR_LIBELLE: ReadonlyMap<string, string> = new Map(
	Object.entries(DEPT_LABELS).map(([code, libelle]) => [normaliser(libelle), code]),
);

function compteursVides(): Compteurs {
	return { declarees: 0, productives: 0, rouges: 0, orgsAvecDomaine: 0, incidents: 0 };
}

function dateDuJour(): string {
	return new Intl.DateTimeFormat("fr-CA", {
		timeZone: "Europe/Paris",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function options(argv: string[]): { out: string } {
	let out = SORTIE_PAR_DEFAUT;
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] !== "--out") throw new Error(`argument inconnu : ${argv[i]}`);
		const cible = argv[i + 1];
		if (cible === undefined || cible.startsWith("--")) throw new Error("--out attend un chemin");
		out = fileURLToPath(new URL(cible, `file://${process.cwd()}/`));
		i++;
	}
	return { out };
}

async function chargerSources(): Promise<SourceRow[]> {
	const { rows } = await query<SourceRow>(
		`WITH evenements AS (
		   SELECT source_id,
		          count(*)::int AS nb,
		          max(COALESCE(observed_at, collected_at)) AS dernier_fait
		     FROM event
		    GROUP BY source_id
		 )
		 SELECT s.id, s.name, s.url, s.description, s.enabled,
		        coalesce(e.nb, 0)::int AS evenements, e.dernier_fait
		   FROM source s
		   LEFT JOIN evenements e ON e.source_id = s.id`,
	);
	return rows;
}

async function chargerOrgs(): Promise<Map<string, number>> {
	const { rows } = await query<{ dept: string; n: number }>(
		`SELECT dept, count(*)::int AS n
		   FROM org
		  WHERE dept = ANY($1::text[]) AND domain IS NOT NULL AND btrim(domain) <> ''
		  GROUP BY dept`,
		[DEPTS],
	);
	return new Map(rows.map((ligne) => [ligne.dept, Number(ligne.n)]));
}

function chargerIncidents(): Map<string, number> {
	const comptes = new Map<string, number>();
	for (const entree of readdirSync(CORPUS, { withFileTypes: true })) {
		if (!entree.isFile() || !entree.name.endsWith(".jsonl")) continue;
		const texte = readFileSync(join(CORPUS, entree.name), "utf8");
		for (const ligne of texte.split("\n")) {
			if (ligne.trim() === "") continue;
			const objet = JSON.parse(ligne) as { id?: unknown; departement?: unknown };
			if (typeof objet.id !== "string" || typeof objet.departement !== "string") continue;
			const brut = objet.departement.trim();
			const code = /^\d{2}$/.test(brut) ? brut : CODE_PAR_LIBELLE.get(normaliser(brut));
			const cle = code ?? HORS_NA;
			comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
		}
	}
	return comptes;
}

function estCompteurs(valeur: unknown): valeur is Compteurs {
	if (typeof valeur !== "object" || valeur === null) return false;
	return INDICATEURS.every(
		(indicateur) => Number.isInteger((valeur as Record<string, unknown>)[indicateur]),
	);
}

/** Relit le dernier rapport : snapshot JSON d'abord, tableau Markdown en repli. */
function lirePrecedent(chemin: string): Snapshot | null {
	if (!existsSync(chemin)) return null;
	const texte = readFileSync(chemin, "utf8");
	const marqueur = /<!--\s*corpus-progression:\s*(\{[^\n]*\})\s*-->/.exec(texte);
	if (marqueur !== null) {
		try {
			const brut = JSON.parse(marqueur[1] ?? "") as Partial<Snapshot>;
			if (
				typeof brut.date === "string" &&
				/^\d{4}-\d{2}-\d{2}$/.test(brut.date) &&
				typeof brut.depts === "object" &&
				brut.depts !== null &&
				estCompteurs(brut.total)
			) {
				return { date: brut.date, depts: brut.depts as Record<string, Compteurs>, total: brut.total };
			}
		} catch {
			// Snapshot illisible : on retombe sur le tableau publié.
		}
	}

	const date = /Date\s*:\s*(\d{4}-\d{2}-\d{2})/.exec(texte)?.[1];
	if (date === undefined) return null;
	const depts: Record<string, Compteurs> = {};
	for (const ligne of texte.split("\n")) {
		const cellules = ligne.split("|").map((cellule) => cellule.trim());
		const code = /^(\d{2})\b/.exec(cellules[1] ?? "")?.[1];
		if (code === undefined) continue;
		const valeurs = cellules.slice(2, 7).map((cellule) => /^-?\d+/.exec(cellule)?.[0]);
		if (valeurs.length !== INDICATEURS.length || valeurs.some((v) => v === undefined)) continue;
		depts[code] = Object.fromEntries(
			INDICATEURS.map((indicateur, i) => [indicateur, Number(valeurs[i])]),
		) as Compteurs;
	}
	const total = compteursVides();
	for (const compteurs of Object.values(depts)) {
		for (const indicateur of INDICATEURS) total[indicateur] += compteurs[indicateur];
	}
	return { date, depts, total };
}

function delta(valeur: number, precedent: number | undefined): string {
	if (precedent === undefined) return String(valeur);
	const ecart = valeur - precedent;
	return `${valeur} (${ecart > 0 ? "+" : ""}${ecart})`;
}

function ecartJours(date: string, precedent: string): string {
	const jours = Math.round(
		(Date.parse(`${date}T00:00:00Z`) - Date.parse(`${precedent}T00:00:00Z`)) / 86_400_000,
	);
	return `${jours > 0 ? "+" : ""}${jours} j`;
}

function rendre(snapshot: Snapshot, precedent: Snapshot | null): string {
	const lignes: string[] = [];
	lignes.push(`# Progression du corpus — ${snapshot.date}`, "");
	lignes.push(
		`Date : ${snapshot.date} (Europe/Paris) · rapport précédent : ` +
			(precedent === null
				? "aucun (premier rapport)"
				: `${precedent.date} · écart : ${ecartJours(snapshot.date, precedent.date)}`),
		"",
	);
	lignes.push(`<!-- corpus-progression: ${JSON.stringify(snapshot)} -->`, "");

	lignes.push("## Synthèse", "");
	lignes.push(
		`| Indicateur | Total | Depuis le ${precedent?.date ?? "—"} |`,
		"| --- | ---: | ---: |",
	);
	for (const indicateur of INDICATEURS) {
		const precedentTotal = precedent?.total[indicateur];
		lignes.push(
			`| ${LIBELLES_INDICATEURS[indicateur]} | ${delta(snapshot.total[indicateur], precedentTotal)} | ` +
				`${precedentTotal === undefined ? "—" : `${snapshot.total[indicateur] - precedentTotal > 0 ? "+" : ""}${snapshot.total[indicateur] - precedentTotal}`} |`,
		);
	}
	lignes.push("");

	lignes.push("## Par département", "");
	lignes.push(
		"| Département | Sources déclarées | Sources productives | Sources rouges | Org. avec domaine | Incidents du corpus |",
		"| --- | ---: | ---: | ---: | ---: | ---: |",
	);
	const clefs = [...DEPTS];
	if ((snapshot.depts[HORS_NA]?.incidents ?? 0) > 0) clefs.push(HORS_NA);
	for (const cle of clefs) {
		const compteurs = snapshot.depts[cle] ?? compteursVides();
		const libelle = cle === HORS_NA ? "Hors Nouvelle-Aquitaine" : `${cle} — ${DEPT_LABELS[cle]}`;
		const avant = precedent?.depts[cle];
		lignes.push(
			`| ${libelle} | ` +
				INDICATEURS.map((indicateur) => delta(compteurs[indicateur], avant?.[indicateur])).join(" | ") +
				" |",
		);
	}
	lignes.push(
		`| **Total** | ` +
			INDICATEURS.map((indicateur) => `**${snapshot.total[indicateur]}**`).join(" | ") +
			" |",
		"",
	);

	lignes.push("## Définitions", "");
	lignes.push(
		"- **Déclarées** : une ligne de `source` dont le département est inféré par `/stats/departements` (`departementDeLaSource`).",
		"- **Productives** : au moins un événement collecté, toutes dates confondues.",
		"- **Rouges** : aucun événement, ou dernier fait antérieur à 7 jours (axe distinct de « productives » : une source peut être productive et rouge).",
		"- **Organisations avec domaine** : `org.dept` du département et `domain` non vide.",
		"- **Incidents du corpus** : lignes de `bench/corpus/*.jsonl` avec un `departement` reconnu.",
		"- Les sources sans périmètre départemental explicite ne comptent nulle part : les totaux de sources sont des minimums.",
		"- Les nombres entre parenthèses sont les écarts signés avec le rapport précédent ; un chiffre seul signifie qu'il n'y avait pas de rapport antérieur.",
		"",
	);
	return lignes.join("\n");
}

async function main(): Promise<void> {
	const { out } = options(process.argv.slice(2));
	const [sources, orgs] = await Promise.all([chargerSources(), chargerOrgs()]);
	const incidents = chargerIncidents();
	const depts: Record<string, Compteurs> = {};
	for (const cle of [...DEPTS, HORS_NA]) depts[cle] = compteursVides();
	const seuilRouge = Date.now() - 7 * 86_400_000;

	for (const source of sources) {
		const infere = departementDeLaSource(source);
		const cle = infere !== null && infere in depts ? infere : null;
		if (cle === null) continue;
		const compteurs = depts[cle]!;
		compteurs.declarees++;
		if (source.evenements > 0) compteurs.productives++;
		if (
			source.dernier_fait === null ||
			source.dernier_fait.getTime() < seuilRouge
		) {
			compteurs.rouges++;
		}
	}
	for (const [dept, n] of orgs) {
		if (dept in depts) depts[dept]!.orgsAvecDomaine = n;
	}
	for (const [cle, n] of incidents) {
		if (cle in depts) depts[cle]!.incidents = n;
	}

	const total = compteursVides();
	for (const compteurs of Object.values(depts)) {
		for (const indicateur of INDICATEURS) total[indicateur] += compteurs[indicateur];
	}
	const snapshot: Snapshot = { date: dateDuJour(), depts, total };
	const precedent = lirePrecedent(out);
	const markdown = rendre(snapshot, precedent);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, markdown, "utf8");
	process.stdout.write(`${out} — ${snapshot.date} — ${total.incidents} incidents\n`);
	if (precedent !== null) {
		process.stdout.write(`écart avec ${precedent.date} : `);
		process.stdout.write(
			INDICATEURS.map(
				(indicateur) =>
					`${LIBELLES_INDICATEURS[indicateur]} ${snapshot.total[indicateur] - precedent.total[indicateur] > 0 ? "+" : ""}${snapshot.total[indicateur] - precedent.total[indicateur]}`,
			).join(", ") + "\n",
		);
	}
}

try {
	await main();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`rapport-corpus: ${message}\n`);
	await closePools();
	process.exit(1);
}
await closePools();
