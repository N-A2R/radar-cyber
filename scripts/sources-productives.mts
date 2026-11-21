/**
 * Rendement des sources par famille : productivité, rougeur et délai de production.
 *
 * Les familles demandées (presse, radio, CERT, ransomware, CT log) ne sont pas
 * toutes des valeurs de `source.family` : la radio et le CT log se déduisent
 * des métadonnées de la source. Les règles sont écrites une seule fois, dans
 * le SQL ci-dessous, et publiées telles quelles dans le rapport JSON.
 *
 * Métriques, toutes calculées sur les sources déclarées du groupe :
 *   - productive  : au moins un événement, toutes dates confondues
 *                   (même définition que le README) ;
 *   - rouge       : aucun événement, ou dernier fait plus vieux que 7 jours
 *                   (même définition que /health/detail et /health/causes) ;
 *   - délai       : moyenne, par source productive ayant au moins un run, du
 *                   temps entre son premier run et son premier événement
 *                   collecté, borné à 0 (horodatages importés parfois
 *                   antérieurs au premier run enregistré).
 *
 * Lecture seule : agrégats, aucun verrou, aucune écriture en base.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/sources-productives.mts
 *   apps/api/node_modules/.bin/tsx scripts/sources-productives.mts --json
 *   apps/api/node_modules/.bin/tsx scripts/sources-productives.mts --out docs/sources-productives.md
 */
import { query, closePools } from "../apps/api/src/db.js";

export const FAMILLES = ["presse", "radio", "CERT", "ransomware", "CT log"] as const;
export type Famille = (typeof FAMILLES)[number];

export interface MesureFamille {
	famille: Famille;
	declarees: number;
	actives: number;
	productives: number;
	rouges: number;
	rougesActives: number;
	tauxRouges: number;
	/** Heures ; null = aucune source productive avec un run enregistré. */
	delaiMoyenH: number | null;
}

export interface Rapport {
	genereLe: string;
	regles: string[];
	familles: MesureFamille[];
}

/** Les valeurs `values` garantissent cinq lignes, même pour un groupe vide. */
const SQL = `
WITH familles(groupe, ordre) AS (
	VALUES ('presse', 1), ('radio', 2), ('CERT', 3), ('ransomware', 4), ('CT log', 5)
),
groupees AS (
	SELECT s.id,
	       s.enabled,
	       CASE
	         WHEN s.id = 'ctlog'
	              OR s.name ILIKE '%certificate transparency%'
	              OR s.url ILIKE '%crt.sh%' THEN 'CT log'
	         WHEN s.license ILIKE 'radio publique%'
	              OR s.name ILIKE 'ICI %'
	              OR s.name ILIKE 'France Bleu%' THEN 'radio'
	         WHEN s.family IN ('cert', 'cert_fr') THEN 'CERT'
	         WHEN s.family = 'ransomware' THEN 'ransomware'
	         WHEN s.family IN ('presse', 'presse_cyber')
	              OR s.license ILIKE 'presse%'
	              OR s.id LIKE 'presse-%'
	              OR s.id LIKE 'gn-%'
	              OR s.id LIKE 'eco-%' THEN 'presse'
	       END AS groupe
	  FROM source s
),
evenements AS (
	SELECT source_id,
	       count(*)::int AS nb,
	       min(collected_at) AS premiere_collecte,
	       max(COALESCE(observed_at, collected_at)) AS dernier_fait
	  FROM event
	 GROUP BY source_id
),
premiers_runs AS (
	SELECT source_id, min(started_at) AS premier_run
	  FROM collector_run
	 GROUP BY source_id
),
mesures AS (
	SELECT g.groupe,
	       count(*)::int AS declarees,
	       count(*) FILTER (WHERE g.enabled)::int AS actives,
	       count(*) FILTER (WHERE e.nb > 0)::int AS productives,
	       count(*) FILTER (WHERE e.dernier_fait IS NULL
	                           OR e.dernier_fait < now() - interval '7 days')::int AS rouges,
	       count(*) FILTER (WHERE g.enabled
	                           AND (e.dernier_fait IS NULL
	                                OR e.dernier_fait < now() - interval '7 days'))::int AS rouges_actives,
	       avg(GREATEST(0, extract(epoch FROM (e.premiere_collecte - r.premier_run)) / 3600))
	         FILTER (WHERE e.nb > 0 AND r.premier_run IS NOT NULL) AS delai_h
	  FROM groupees g
	  JOIN source s ON s.id = g.id
	  LEFT JOIN evenements e ON e.source_id = g.id
	  LEFT JOIN premiers_runs r ON r.source_id = g.id
	 WHERE g.groupe IS NOT NULL
	 GROUP BY g.groupe
)
SELECT f.groupe,
       coalesce(m.declarees, 0)::int AS declarees,
       coalesce(m.actives, 0)::int AS actives,
       coalesce(m.productives, 0)::int AS productives,
       coalesce(m.rouges, 0)::int AS rouges,
       coalesce(m.rouges_actives, 0)::int AS rouges_actives,
       m.delai_h
  FROM familles f
  LEFT JOIN mesures m ON m.groupe = f.groupe
 ORDER BY f.ordre
`;

const REGLES = [
	"productive : au moins un événement, toutes dates confondues",
	"rouge : aucun événement ou dernier fait antérieur à 7 jours",
	"délai : premier run → premier événement collecté, moyenne par source productive, bornée à 0",
	"CT log : id `ctlog`, nom contenant « certificate transparency » ou URL crt.sh",
	"radio : licence « radio publique », nom ICI/France Bleu",
	"CERT : source.family cert ou cert_fr",
	"ransomware : source.family ransomware",
	"presse : source.family presse/presse_cyber, licence presse ou identifiant presse-/gn-/eco-",
];

interface LigneSQL {
	groupe: Famille;
	declarees: number;
	actives: number;
	productives: number;
	rouges: number;
	rouges_actives: number;
	delai_h: string | null;
}

async function charger(): Promise<Rapport> {
	const { rows } = await query<LigneSQL>(SQL);
	const familles = rows.map((ligne): MesureFamille => {
		const declarees = Number(ligne.declarees);
		const rouges = Number(ligne.rouges);
		return {
			famille: ligne.groupe,
			declarees,
			actives: Number(ligne.actives),
			productives: Number(ligne.productives),
			rouges,
			rougesActives: Number(ligne.rouges_actives),
			tauxRouges: declarees === 0 ? 0 : Math.round((rouges / declarees) * 1000) / 10,
			delaiMoyenH:
				ligne.delai_h === null ? null : Math.round(Number(ligne.delai_h) * 10) / 10,
		};
	});
	for (const famille of FAMILLES) {
		if (!familles.some((f) => f.famille === famille)) {
			throw new Error(`famille absente du rapport : ${famille}`);
		}
	}
	return { genereLe: new Date().toISOString(), regles: REGLES, familles };
}

const nombre = new Intl.NumberFormat("fr-FR", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});

function cellule(texte: string): string {
	return texte.replace(/\|/g, "\\|");
}

function rendreMarkdown(rapport: Rapport): string {
	const lignes = [
		`# Sources productives par famille — ${rapport.genereLe.slice(0, 10)}`,
		"",
		"| Famille | Sources déclarées | Sources productives | Taux de sources rouges | Délai moyen de production |",
		"| --- | ---: | ---: | ---: | ---: |",
	];
	for (const f of rapport.familles) {
		lignes.push(
			`| ${cellule(f.famille)} | ${f.declarees} | ${f.productives} | ${nombre.format(f.tauxRouges)} % | ${f.delaiMoyenH === null ? "—" : `${nombre.format(f.delaiMoyenH)} h`} |`,
		);
	}
	lignes.push("", ...rapport.regles.map((regle) => `- ${regle}`), "");
	return lignes.join("\n");
}

interface Options {
	out: string | null;
	json: boolean;
}

function options(argv: string[]): Options {
	const resultat: Options = { out: null, json: false };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--json") {
			resultat.json = true;
		} else if (arg === "--out") {
			const chemin = argv[i + 1];
			if (chemin === undefined || chemin.startsWith("--")) {
				throw new Error("--out attend un chemin de fichier");
			}
			resultat.out = chemin;
			i++;
		} else {
			throw new Error(`argument inconnu : ${arg}`);
		}
	}
	if (resultat.json && resultat.out !== null) {
		throw new Error("--json et --out sont exclusifs");
	}
	return resultat;
}

async function main(): Promise<void> {
	const choix = options(process.argv.slice(2));
	const rapport = await charger();
	if (choix.json) {
		process.stdout.write(JSON.stringify(rapport, null, 2) + "\n");
		return;
	}
	const markdown = rendreMarkdown(rapport);
	if (choix.out === null) {
		process.stdout.write(markdown);
		return;
	}
	const { writeFile } = await import("node:fs/promises");
	await writeFile(choix.out, markdown, "utf8");
	process.stdout.write(`tableau écrit : ${choix.out}\n`);
}

try {
	await main();
} catch (erreur) {
	const message = erreur instanceof Error ? erreur.message : String(erreur);
	process.stderr.write(`sources-productives: ${message}\n`);
	await closePools();
	process.exit(1);
}
await closePools();
process.exit(0);
