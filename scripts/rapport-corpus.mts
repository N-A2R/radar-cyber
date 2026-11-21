/**
 * Rapport de progression du corpus : `docs/corpus-progression.md`.
 *
 * Chaque exécution recalcule cinq compteurs par département et par famille,
 * lit le dernier snapshot de `docs/corpus-progression-historique.json`, écrit
 * les écarts signés dans le rapport, puis ajoute le snapshot courant à
 * l'historique. Deux exécutions sans changement des données affichent donc
 * des écarts nuls à la seconde.
 *
 *   apps/api/node_modules/.bin/tsx scripts/rapport-corpus.mts
 *   apps/api/node_modules/.bin/tsx scripts/rapport-corpus.mts --out /tmp/rapport.md
 *   apps/api/node_modules/.bin/tsx scripts/rapport-corpus.mts --out /tmp/rapport.md --historique /tmp/historique.json
 *
 * Lecture seule sur la base : seuls le Markdown et l'historique JSON sont
 * écrits. Les sources sans département inférable ne comptent nulle part ; les
 * incidents sont lus uniquement dans `bench/corpus/incidents-*.jsonl` (les
 * fiches de sources du même dossier ne sont pas des incidents).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	INDICATEURS,
	LIBELLES_INDICATEURS,
	SANS_FAMILLE,
	HORS_NA,
	ajouterIncident,
	ajouterOrganisation,
	ajouterSnapshot,
	ajouterSource,
	ecrireHistorique,
	lireHistorique,
	rendreRapport,
	recomposerTotal,
	snapshotVide,
	type Snapshot,
} from "../apps/api/src/analyse/rapport-corpus.js";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";

const { query, closePools } = await import("../apps/api/src/db.js");
const { departementDeLaSource } = await import("../apps/api/src/routes/stats.js");
const { DEPT_LABELS } = await import("../apps/api/src/collectors/relevance.js");

const CORPUS = fileURLToPath(new URL("../bench/corpus/", import.meta.url));
const SORTIE_PAR_DEFAUT = fileURLToPath(new URL("../docs/corpus-progression.md", import.meta.url));
const HISTORIQUE_PAR_DEFAUT = fileURLToPath(
	new URL("../docs/corpus-progression-historique.json", import.meta.url),
);

type SourceRow = {
	id: string;
	name: string;
	url: string;
	description: string | null;
	family: string;
	evenements: number;
	dernier_fait: Date | null;
};

type OrganisationRow = { dept: string; famille: string; n: number };
type IncidentCorpus = { dept: string; famille: string };

function normaliser(texte: string): string {
	return texte
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

const DEPTS: readonly string[] = Object.keys(DEPT_LABELS).sort((a, b) => a.localeCompare(b, "fr"));
const CODE_PAR_LIBELLE: ReadonlyMap<string, string> = new Map(
	Object.entries(DEPT_LABELS).map(([code, libelle]) => [normaliser(libelle), code]),
);

function dateDuJour(): string {
	return new Intl.DateTimeFormat("fr-CA", {
		timeZone: "Europe/Paris",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function historiquePour(out: string): string {
	return out.endsWith(".md") ? `${out.slice(0, -3)}-historique.json` : `${out}-historique.json`;
}

function options(argv: string[]): { out: string; historique: string } {
	let out = SORTIE_PAR_DEFAUT;
	let historique: string | null = null;
	for (let i = 0; i < argv.length; i++) {
		const option = argv[i];
		const cible = argv[i + 1];
		if (option !== "--out" && option !== "--historique") {
			throw new Error(`argument inconnu : ${option ?? ""}`);
		}
		if (cible === undefined || cible.startsWith("--")) {
			throw new Error(`${option} attend un chemin`);
		}
		const chemin = fileURLToPath(new URL(cible, `file://${process.cwd()}/`));
		if (option === "--out") out = chemin;
		else historique = chemin;
		i++;
	}
	return { out, historique: historique ?? historiquePour(out) };
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
		 SELECT s.id, s.name, s.url, s.description, s.family,
		        coalesce(e.nb, 0)::int AS evenements, e.dernier_fait
		   FROM source s
		   LEFT JOIN evenements e ON e.source_id = s.id`,
	);
	return rows;
}

async function chargerOrganisations(): Promise<OrganisationRow[]> {
	const { rows } = await query<OrganisationRow>(
		`SELECT o.dept,
		        coalesce(e.family, $2::text) AS famille,
		        count(DISTINCT o.id)::int AS n
		   FROM org o
		   LEFT JOIN LATERAL (
		     SELECT ev.family
		       FROM event ev
		      WHERE ev.org_id = o.id
		      ORDER BY COALESCE(ev.observed_at, ev.collected_at) DESC, ev.id DESC
		      LIMIT 1
		   ) e ON true
		  WHERE o.dept = ANY($1::text[])
		    AND o.domain IS NOT NULL
		    AND btrim(o.domain) <> ''
		  GROUP BY 1, 2`,
		[DEPTS, SANS_FAMILLE],
	);
	return rows;
}

/** Un incident = une ligne de `incidents-*.jsonl`, jamais une fiche source. */
function chargerIncidents(): IncidentCorpus[] {
	const incidents: IncidentCorpus[] = [];
	const identifiants = new Set<string>();
	for (const entree of readdirSync(CORPUS, { withFileTypes: true })) {
		if (!entree.isFile() || !/^incidents-.*\.jsonl$/.test(entree.name)) continue;
		const texte = readFileSync(join(CORPUS, entree.name), "utf8");
		for (const ligne of texte.split("\n")) {
			if (ligne.trim() === "") continue;
			const objet = JSON.parse(ligne) as { id?: unknown; departement?: unknown; type?: unknown };
			if (typeof objet.id !== "string" || identifiants.has(objet.id)) continue;
			if (typeof objet.departement !== "string") continue;
			const brut = objet.departement.trim();
			const dept = /^\d{2}$/.test(brut) ? brut : CODE_PAR_LIBELLE.get(normaliser(brut));
			if (dept === undefined) continue;
			identifiants.add(objet.id);
			const famille =
				typeof objet.type === "string" && objet.type.trim() !== ""
					? objet.type.trim().toLowerCase()
					: SANS_FAMILLE;
			incidents.push({ dept, famille });
		}
	}
	return incidents;
}

async function main(): Promise<void> {
	const { out, historique: cheminHistorique } = options(process.argv.slice(2));
	const [sources, organisations] = await Promise.all([chargerSources(), chargerOrganisations()]);
	const incidents = chargerIncidents();
	const affiches = [...DEPTS, HORS_NA];
	const snapshot: Snapshot = snapshotVide(dateDuJour(), affiches);
	const seuilRouge = Date.now() - 7 * 86_400_000;

	for (const source of sources) {
		const infere = departementDeLaSource(source);
		if (infere === null || !(infere in snapshot.depts)) continue;
		ajouterSource(
			snapshot,
			infere,
			source.family,
			source.evenements,
			source.dernier_fait?.getTime() ?? null,
			seuilRouge,
		);
	}
	for (const organisation of organisations) {
		if (organisation.dept in snapshot.depts) {
			ajouterOrganisation(snapshot, organisation.dept, organisation.famille, organisation.n);
		}
	}
	for (const incident of incidents) {
		if (incident.dept in snapshot.depts) ajouterIncident(snapshot, incident.dept, incident.famille);
	}
	recomposerTotal(snapshot);

	const historique = existsSync(cheminHistorique)
		? lireHistorique(readFileSync(cheminHistorique, "utf8"))
		: [];
	const precedent = historique.at(-1) ?? null;
	const cheminHistoriqueAffiche =
		cheminHistorique === HISTORIQUE_PAR_DEFAUT
			? "docs/corpus-progression-historique.json"
			: cheminHistorique;
	const markdown = rendreRapport(
		snapshot,
		precedent,
		affiches,
		DEPT_LABELS,
		cheminHistoriqueAffiche,
	);

	mkdirSync(dirname(out), { recursive: true });
	mkdirSync(dirname(cheminHistorique), { recursive: true });
	writeFileSync(out, markdown, "utf8");
	writeFileSync(
		cheminHistorique,
		ecrireHistorique(ajouterSnapshot(historique, snapshot)),
		"utf8",
	);

	process.stdout.write(`${out} — ${snapshot.date} — ${snapshot.total.incidents} incidents\n`);
	process.stdout.write(`historique : ${cheminHistorique} — ${historique.length} rapport(s) précédent(s)\n`);
	if (precedent !== null) {
		const ecarts = INDICATEURS.map((i) => {
			const diff = snapshot.total[i] - precedent.total[i];
			return `${LIBELLES_INDICATEURS[i]} ${diff > 0 ? "+" : ""}${diff}`;
		}).join(", ");
		process.stdout.write(`delta depuis ${precedent.date} : ${ecarts}\n`);
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
