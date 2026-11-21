/**
 * Santé des sources — historique glissant sur 12 semaines.
 *
 * Pour chaque source déclarée, on compte les événements par semaine
 * calendaire (UTC, lundi → dimanche) et on cherche les sources qui se
 * taisent : une source qui a déjà produit sur la fenêtre mais plus rien
 * depuis les deux dernières semaines. Une source sans historique n'est pas
 * muette — on ne peut pas parler de silence là où il n'y a jamais eu de
 * production (même piège que dans `apps/api/src/analyse/agent-source-muette.ts`).
 *
 * La date du « dernier item » est l'horodatage du fait lui-même
 * (`coalesce(observed_at, collected_at)`), toutes périodes confondues, et non
 * la date de dernière collecte — conforme à `/api/health/detail`.
 *
 *   pnpm exec tsx scripts/sante-sources-historique.mts
 *   pnpm exec tsx scripts/sante-sources-historique.mts --out /tmp/sante.md
 *   pnpm exec tsx scripts/sante-sources-historique.mts --json > /tmp/sante.json
 *
 * Lecture seule ; seule la sortie Markdown est écrite.
 */
import { writeFile } from "node:fs/promises";
import { closePools, query } from "../apps/api/src/db.js";

const NB_SEMAINES = 12;
const SEMAINES_SILENCE = 2;
const SORTIE_DEFAUT = "docs/sante-sources.md";
const JOUR_MS = 86_400_000;

/** Semaine calendaire UTC (lundi 00:00) contenant l'instant donné. */
function debutSemaineUTC(instant: Date): Date {
	const debut = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
	debut.setUTCDate(debut.getUTCDate() - ((debut.getUTCDay() + 6) % 7));
	return debut;
}

/**
 * Les 12 semaines sont matérialisées côté SQL : une source sans événement
 * doit avoir douze zéros, pas une ligne absente. Le détecteur reste côté JS,
 * pur et lisible ; seule la borne de temps est passée en paramètre.
 */
const SQL = `
WITH borne AS (
	SELECT date_trunc('week', ($1::timestamptz AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC' AS debut
),
semaines AS (
	SELECT generate_series(
		b.debut - ($2::int - 1) * interval '1 week',
		b.debut,
		interval '1 week'
	) AS debut
	FROM borne b
),
evenements AS (
	SELECT e.source_id,
	       date_trunc('week', (COALESCE(e.observed_at, e.collected_at) AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC' AS debut,
	       count(*)::int AS nb
	FROM event e, borne b
	WHERE COALESCE(e.observed_at, e.collected_at) >= b.debut - ($2::int - 1) * interval '1 week'
	  AND COALESCE(e.observed_at, e.collected_at) < b.debut + interval '1 week'
	GROUP BY e.source_id, 2
),
derniers AS (
	SELECT source_id, max(COALESCE(observed_at, collected_at)) AS dernier_item
	FROM event
	GROUP BY source_id
)
SELECT s.id,
       s.name,
       s.family,
       s.enabled,
       s.statut,
       d.dernier_item,
       array_agg(coalesce(e.nb, 0) ORDER BY w.debut) AS semaines
FROM source s
CROSS JOIN semaines w
LEFT JOIN evenements e ON e.source_id = s.id AND e.debut = w.debut
LEFT JOIN derniers d ON d.source_id = s.id
GROUP BY s.id, s.name, s.family, s.enabled, s.statut, d.dernier_item
ORDER BY s.id
`;

type LigneBrute = {
	id: string;
	name: string;
	family: string;
	enabled: boolean;
	statut: string;
	dernier_item: string | Date | null;
	semaines: unknown[];
};

type Source = {
	id: string;
	name: string;
	family: string;
	enabled: boolean;
	statut: string;
	dernierItem: string | null;
	semaines: number[];
	muette: boolean;
};

type Rapport = {
	generatedAt: string;
	fenetre: { debut: string; fin: string; semaines: number; silenceSemaines: number };
	regle: string;
	muettes: Source[];
	sources: Source[];
};

function estMuette(source: Omit<Source, "muette">): boolean {
	if (!source.enabled || source.statut === "morte") return false;
	const avant = source.semaines.slice(0, -SEMAINES_SILENCE).reduce((a, b) => a + b, 0);
	const recent = source.semaines.slice(-SEMAINES_SILENCE).reduce((a, b) => a + b, 0);
	return avant > 0 && recent === 0;
}

function dateJour(value: string | Date | null): string | null {
	if (value === null) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function charger(now: Date): Promise<Source[]> {
	const { rows } = await query<LigneBrute>(SQL, [now.toISOString(), NB_SEMAINES]);
	return rows.map((row) => {
		const source: Omit<Source, "muette"> = {
			id: row.id,
			name: row.name,
			family: row.family,
			enabled: row.enabled === true,
			statut: row.statut,
			dernierItem: dateJour(row.dernier_item),
			semaines: row.semaines.map((n) => Number(n) || 0),
		};
		if (source.semaines.length !== NB_SEMAINES) {
			throw new Error(`${source.id}: ${source.semaines.length} semaines au lieu de ${NB_SEMAINES}`);
		}
		return { ...source, muette: estMuette(source) };
	});
}

function cell(texte: string): string {
	return texte.replace(/\|/g, "\\|");
}

function etat(source: Source): string {
	if (source.statut === "morte") return "morte";
	return source.enabled ? "active" : "désactivée";
}

function joursDeSilence(source: Source, now: Date): number {
	if (source.dernierItem === null) return 0;
	return Math.max(0, Math.floor((now.getTime() - Date.parse(source.dernierItem)) / JOUR_MS));
}

function renderMarkdown(rapport: Rapport, now: Date, debuts: Date[]): string {
	const { sources, muettes, fenetre } = rapport;
	const sansHistorique = sources.filter((s) => s.semaines.every((n) => n === 0)).length;
	const actives = sources.filter((s) => s.enabled).length;
	const entetes = debuts.map((d, i) => `${d.toISOString().slice(5, 10).replace("-", "/")} (S-${NB_SEMAINES - 1 - i})`);

	const lignes: string[] = [
		`# Santé des sources — historique ${NB_SEMAINES} semaines`,
		"",
		`Généré le ${rapport.generatedAt} par \`scripts/sante-sources-historique.mts\`.`,
		"",
		`**Fenêtre.** ${fenetre.debut} au ${fenetre.fin} (semaines calendaires UTC, lundi → dimanche, semaine en cours incluse).`,
		"",
		`**Règle de détection.** Est dite *muette* une source active (hors statut \`morte\`) qui a produit au moins un événement durant les ${NB_SEMAINES - SEMAINES_SILENCE} premières semaines de la fenêtre et aucun durant les ${SEMAINES_SILENCE} dernières. Une source sans production sur la fenêtre n'est pas muette : son silence n'a pas de point de départ mesuré.`,
		"",
		`**Synthèse.** ${sources.length} sources (${actives} actives) ; ${muettes.length} muettes ; ${sansHistorique} sans événement sur la fenêtre.`,
		"",
		`## Sources muettes (${muettes.length})`,
		"",
	];
	if (muettes.length === 0) {
		lignes.push("Aucune source muette sur la fenêtre.", "");
	} else {
		lignes.push("| Source | Famille | Dernier item | Silence (j) | Événements 12 sem. |");
		lignes.push("| --- | --- | --- | ---: | ---: |");
		for (const s of [...muettes].sort((a, b) => (a.dernierItem ?? "").localeCompare(b.dernierItem ?? "") || a.id.localeCompare(b.id))) {
			lignes.push(`| ${cell(s.name)} \`${cell(s.id)}\` | ${s.family} | ${s.dernierItem ?? "—"} | ${joursDeSilence(s, now)} | ${s.semaines.reduce((a, b) => a + b, 0)} |`);
		}
		lignes.push("");
	}

	lignes.push(
		`## Historique par source (${sources.length})`,
		"",
		`| Source | État | ${entetes.join(" | ")} | Dernier item |`,
		`| --- | --- | ${entetes.map(() => "---:").join(" | ")} | --- |`,
	);
	for (const s of sources) {
		lignes.push(
			`| ${cell(s.name)} \`${cell(s.id)}\` | ${etat(s)} | ${s.semaines.join(" | ")} | ${s.dernierItem ?? "—"} |`,
		);
	}
	lignes.push("", "Pour régénérer : `pnpm exec tsx scripts/sante-sources-historique.mts`.", "");
	return lignes.join("\n");
}

type Options = { out: string | null; json: boolean };

function parseArgs(argv: string[]): Options {
	const options: Options = { out: SORTIE_DEFAUT, json: false };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--json") {
			options.json = true;
		} else if (arg === "--out") {
			const cible = argv[i + 1];
			if (cible === undefined || cible.startsWith("--")) throw new Error("--out attend un chemin de fichier");
			options.out = cible;
			i++;
		} else if (arg === "--help") {
			throw new Error("usage : sante-sources-historique.mts [--out fichier.md | --json]");
		} else {
			throw new Error(`argument inconnu : ${arg}`);
		}
	}
	if (options.json) options.out = null;
	return options;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const now = new Date();
	const sources = await charger(now);
	const muettes = sources.filter((s) => s.muette);
	const debutSemaine = debutSemaineUTC(now);
	const debuts = Array.from({ length: NB_SEMAINES }, (_, i) => {
		const d = new Date(debutSemaine);
		d.setUTCDate(d.getUTCDate() - (NB_SEMAINES - 1 - i) * 7);
		return d;
	});
	const rapport: Rapport = {
		generatedAt: now.toISOString(),
		fenetre: {
			debut: debuts[0].toISOString().slice(0, 10),
			fin: new Date(debutSemaine.getTime() + 6 * JOUR_MS).toISOString().slice(0, 10),
			semaines: NB_SEMAINES,
			silenceSemaines: SEMAINES_SILENCE,
		},
		regle: `active, ${NB_SEMAINES - SEMAINES_SILENCE} semaines avec production puis ${SEMAINES_SILENCE} sans événement`,
		muettes,
		sources,
	};

	if (options.json) {
		process.stdout.write(`${JSON.stringify(rapport, null, 2)}\n`);
		return;
	}
	const chemin = options.out ?? SORTIE_DEFAUT;
	await writeFile(chemin, renderMarkdown(rapport, now, debuts), "utf8");
	process.stdout.write(`${sources.length} sources, ${muettes.length} muettes — publié : ${chemin}\n`);
}

try {
	await main();
} catch (erreur) {
	const message = erreur instanceof Error ? erreur.message : String(erreur);
	process.stderr.write(`sante-sources-historique: ${message}\n`);
	process.exitCode = 1;
} finally {
	await closePools();
}
