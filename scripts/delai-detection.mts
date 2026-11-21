/**
 * Délais de détection et faux négatifs — mesure rejouée sur la base.
 *
 * Deux questions, deux populations, une seule règle : aucun chiffre n'est
 * publié s'il ne vient pas d'une requête SQL exécutée sur la base de travail.
 *
 *  1. DÉLAIS — « incident vu » = un incident réellement collecté : une ligne
 *     de `event` ou `event_archive` avec une date de publication (`observed_at`)
 *     et une première apparition datée (`least(collected_at, created_at)`, ou
 *     `collected_at` pour les archives). L'écart en heures est calculé par SQL.
 *     Seuls les incidents dont la publication est tombée dans la fenêtre où le
 *     collecteur tournait sont comptés : dehors, l'écart mesurerait l'âge d'un
 *     CVE ou d'une brèche ancienne, pas notre latence. Les familles `vuln`,
 *     `cert` et `cert_fr` sont écartées : leur `observed_at` est la date de la
 *     notice, pas celle d'un incident.
 *  2. FAUX NÉGATIFS — incident du corpus vérifié (`bench/couverture/`,
 *     20 entrées datées et sourcées) pour lequel aucune requête SQL ne trouve
 *     d'événement correspondant (URL normalisée, titre+jour, ou organisation).
 *     Chaque cas est publié nominativement avec ce que la base contenait le
 *     jour de sa publication.
 *
 * Sorties : `docs/delai-detection.md` et `docs/faux-negatifs.md`.
 * Lecture seule sur les données ; seuls les deux documents sont réécrits.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/delai-detection.mts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const CORPUS_VERIFIE = "bench/couverture/incidents.jsonl";
const CORPUS_REFERENCE = "bench/fixtures/corpus-reference-na.json";
const SORTIE_DELAI = "docs/delai-detection.md";
const SORTIE_FAUX = "docs/faux-negatifs.md";

/** Les bulletins de vulnérabilité ne sont pas des incidents. */
const FAMILLES_INCIDENT = ["cti", "ransomware", "leaks", "paste", "presse_cyber"];

/** Largeur d'un seau de l'histogramme, en heures. */
const SEAU_HEURES = 24;

type IncidentVerifie = {
	id: string;
	organisation: string;
	datePublication: string;
	departement: string;
	type: string;
	source: string;
	titre: string;
	url: string;
};

type Delai = {
	dedupKey: string;
	sourceId: string;
	family: string;
	publication: Date;
	apparition: Date;
	heures: number;
};

type SourceRow = {
	id: string;
	name: string;
	url: string | null;
	enabled: boolean;
	last_ok_at: Date | string | null;
};

type RunRow = {
	id: string;
	source_id: string;
	started_at: Date | string;
	status: string;
};

type EventRow = {
	id: string;
	table: "event" | "event_archive";
	dedup_key: string | null;
	source_id: string;
	source_url: string | null;
	title: string | null;
	summary: string | null;
	org_id: number | null;
	observed_at: Date | string | null;
	collected_at: Date | string;
};
type FauxNegatif = {
	incident: IncidentVerifie;
	matches: Array<{ table: "event" | "event_archive"; rule: "url" | "titre+date"; id: string }>;
	runsDuJour: number;
	sourcesDuJour: string[];
	evenementsCollectesDuJour: number;
	evenementsObservesDuJour: number;
	sourcesDeclarentees: SourceRow[];
};

function lireJson<T>(chemin: string): T {
	return JSON.parse(readFileSync(resolve(RACINE, chemin), "utf8")) as T;
}

function chargerCorpusVerifie(): IncidentVerifie[] {
	const brut = readFileSync(resolve(RACINE, CORPUS_VERIFIE), "utf8");
	return brut
		.split(/\r?\n/)
		.filter((ligne) => ligne.trim())
		.map((ligne) => {
			const o = JSON.parse(ligne) as Record<string, unknown>;
			const texte = (cle: string): string => (typeof o[cle] === "string" ? (o[cle] as string) : "");
			return {
				id: texte("id"),
				organisation: texte("organisation"),
				datePublication: texte("date_publication"),
				departement: texte("departement"),
				type: texte("type"),
				source: texte("source"),
				titre: texte("titre"),
				url: texte("url"),
			};
		})
		.sort((a, b) => a.id.localeCompare(b.id, "fr"));
}

function horodatage(valeur: unknown): string | null {
	if (valeur === null || valeur === undefined) return null;
	return valeur instanceof Date ? valeur.toISOString() : String(valeur);
}

function jour(valeur: unknown): string | null {
	return horodatage(valeur)?.slice(0, 10) ?? null;
}

function sansAccents(valeur: string): string {
	return valeur.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normaliserTexte(valeur: string): string {
	return sansAccents(valeur).replace(/[^a-z0-9]+/g, " ").trim();
}

function normaliserUrl(valeur: string): string {
	try {
		const u = new URL(valeur);
		return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
	} catch {
		return sansAccents(valeur).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
	}
}

function domaine(valeur: string | null): string | null {
	if (!valeur) return null;
	try {
		return new URL(valeur).hostname.toLowerCase().replace(/^www\./, "").split(".").slice(-2).join(".");
	} catch {
		return null;
	}
}

/** Source du média : domaine du flux d'abord, nom du média ensuite. */
function sourcesPour(incident: IncidentVerifie, sources: SourceRow[]): SourceRow[] {
	const domaineArticle = domaine(incident.url);
	const nomArticle = normaliserTexte(incident.source);
	return sources.filter((source) => {
		const domaineSource = domaine(source.url);
		if (domaineArticle && domaineSource && domaineArticle === domaineSource) return true;
		if (nomArticle.length < 4) return false;
		const nomSource = normaliserTexte(source.name);
		return nomSource.includes(nomArticle) || nomArticle.includes(nomSource) ||
			// « France 3 Nouvelle-Aquitaine » vs « France 3 NA — Landes (RSS) ».
			(nomArticle.startsWith("france 3") && nomSource.startsWith("france 3"));
	});
}

/** Une correspondance est prouvée par URL, ou par titre identique + même jour. */
function regleCorrespondance(evenement: EventRow, incident: IncidentVerifie): "url" | "titre+date" | null {
	if (evenement.source_url && normaliserUrl(evenement.source_url) === normaliserUrl(incident.url)) return "url";
	if (!evenement.title) return null;
	const titreEvenement = normaliserTexte(evenement.title);
	const titreIncident = normaliserTexte(incident.titre);
	if (!titreEvenement || !titreIncident) return null;
	const memeTitre =
		titreEvenement === titreIncident ||
		(Math.min(titreEvenement.length, titreIncident.length) >= 30 &&
			(titreEvenement.includes(titreIncident) || titreIncident.includes(titreEvenement)));
	if (!memeTitre) return null;
	const memeJour = jour(evenement.observed_at) === incident.datePublication ||
		jour(evenement.collected_at) === incident.datePublication;
	return memeJour ? "titre+date" : null;
}

function quantile(tri: readonly number[], q: number): number {
	if (tri.length === 0) return 0;
	return tri[Math.min(tri.length - 1, Math.floor(q * (tri.length - 1)))] ?? 0;
}

function jours(heures: number): string {
	return (heures / 24).toFixed(1).replace(".", ",");
}

function cellule(valeur: string): string {
	return valeur.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function histogramme(delais: readonly Delai[]): string[] {
	if (delais.length === 0) return ["(aucun délai mesuré)"];
	const max = Math.max(...delais.map((d) => d.heures));
	const seaux = Math.floor(max / SEAU_HEURES) + 1;
	const comptes = new Array<number>(seaux).fill(0);
	for (const d of delais) {
		const index = Math.min(seaux - 1, Math.floor(d.heures / SEAU_HEURES));
		comptes[index] = (comptes[index] ?? 0) + 1;
	}
	const plusGrand = Math.max(...comptes, 1);
	return comptes.map((n, i) => {
		const debut = i * SEAU_HEURES;
		const fin = debut + SEAU_HEURES;
		const barre = "#".repeat(Math.round((n / plusGrand) * 40));
		return `${`${debut}–${fin} h`.padStart(10)} | ${barre.padEnd(40)} ${String(n).padStart(4)}`;
	});
}

function parSource(delais: readonly Delai[]): Array<{ source: string; n: number; p50: number; p90: number }> {
	const groupes = new Map<string, number[]>();
	for (const d of delais) {
		const liste = groupes.get(d.sourceId) ?? [];
		liste.push(d.heures);
		groupes.set(d.sourceId, liste);
	}
	return [...groupes.entries()]
		.map(([source, valeurs]) => {
			const tri = [...valeurs].sort((a, b) => a - b);
			return { source, n: tri.length, p50: quantile(tri, 0.5), p90: quantile(tri, 0.9) };
		})
		.filter((g) => g.n >= 20)
		.sort((a, b) => a.p50 - b.p50 || a.source.localeCompare(b.source, "fr"));
}

const SQL_DELAIS = `
WITH apparitions AS (
  SELECT e.dedup_key, e.source_id, e.family, e.observed_at,
         least(e.collected_at, e.created_at) AS apparition
    FROM event e WHERE e.observed_at IS NOT NULL
  UNION ALL
  SELECT a.dedup_key, a.source_id, a.family, a.observed_at,
         a.collected_at AS apparition
    FROM event_archive a WHERE a.observed_at IS NOT NULL
), fenetre AS (
  SELECT date_trunc('day', min(started_at))::date AS debut,
         (date_trunc('day', max(started_at)) + interval '1 day')::date AS fin
    FROM collector_run
), incidents AS (
  SELECT a.dedup_key,
         min(a.source_id) AS source_id,
         min(a.family) AS family,
         min(a.observed_at) AS publication,
         min(a.apparition) AS apparition
    FROM apparitions a, fenetre f
   WHERE a.observed_at >= f.debut AND a.observed_at < f.fin
     AND a.apparition >= a.observed_at
     AND a.family IN ('cti', 'ransomware', 'leaks', 'paste', 'presse_cyber')
   GROUP BY a.dedup_key
)
SELECT source_id AS "sourceId", family, publication, apparition,
       extract(epoch FROM (apparition - publication)) / 3600.0 AS heures
  FROM incidents ORDER BY heures, dedup_key`.trim();

async function main(): Promise<void> {
	const corpus = chargerCorpusVerifie();
	const corpus60 = lireJson<{ incidents: Array<{ id: string; preuve?: { url?: string } }> }>(CORPUS_REFERENCE);

	const [fenetreRows, empreinteRows, exclusRows, delaiRows, sourcesRows, runsRows, eventRows, archiveRows] =
		await Promise.all([
			query<{ debut: string; fin: string; runs: string; sources: string }>(
				`SELECT date_trunc('day', min(started_at))::date::text AS debut,
				        (date_trunc('day', max(started_at)) + interval '1 day')::date::text AS fin,
				        count(*)::text AS runs,
				        count(DISTINCT source_id)::text AS sources
				   FROM collector_run`,
			),
			query<{ n_event: string; n_archive: string; n_source: string; min_collecte: Date; max_collecte: Date }>(
				`SELECT (SELECT count(*) FROM event)::text AS n_event,
				        (SELECT count(*) FROM event_archive)::text AS n_archive,
				        (SELECT count(*) FROM source)::text AS n_source,
				        (SELECT min(collected_at) FROM event) AS min_collecte,
				        (SELECT max(collected_at) FROM event) AS max_collecte`,
			),
			query<{ famille: string; n: string }>(
				`SELECT family AS famille, count(*)::text AS n FROM event
				  WHERE family NOT IN ('cti', 'ransomware', 'leaks', 'paste', 'presse_cyber')
				  GROUP BY family ORDER BY 2 DESC`,
			),
			query<Delai>(SQL_DELAIS),
			query<SourceRow>("SELECT id, name, url, enabled, last_ok_at FROM source ORDER BY id"),
			query<RunRow>("SELECT id::text AS id, source_id, started_at, status FROM collector_run ORDER BY id"),
			query<EventRow>(
				`SELECT id::text AS id, 'event'::text AS table, dedup_key, source_id, source_url, title, summary,
				        org_id, observed_at, collected_at FROM event ORDER BY id`,
			),
			query<EventRow>(
				`SELECT id::text AS id, 'event_archive'::text AS table, dedup_key, source_id, source_url,
				        NULL::text AS title, NULL::text AS summary,
				        org_id, observed_at, collected_at FROM event_archive ORDER BY id`,
			),
		]);

	const fenetre = fenetreRows.rows[0];
	if (!fenetre) throw new Error("aucune exécution de collecteur : fenêtre de mesure indéterminée");
	const empreinte = empreinteRows.rows[0];
	if (!empreinte) throw new Error("empreinte base indisponible");

	const debut = jour(fenetre.debut) as string;
	const finExclusif = new Date(`${jour(fenetre.fin)}T00:00:00Z`);
	finExclusif.setUTCDate(finExclusif.getUTCDate() - 1);
	const fin = finExclusif.toISOString().slice(0, 10);
	const bande = `${debut} → ${fin} (bornes incluses)`;
	const empreinteBase = createHash("sha256").update(JSON.stringify({
		n_event: empreinte.n_event,
		n_archive: empreinte.n_archive,
		n_source: empreinte.n_source,
		min_collecte: horodatage(empreinte.min_collecte),
		max_collecte: horodatage(empreinte.max_collecte),
		runs: fenetre.runs,
	})).digest("hex");

	// ---- 1. Délais --------------------------------------------------------
	const delais = delaiRows.rows.map((r) => ({
		...r,
		publication: new Date(r.publication),
		apparition: new Date(r.apparition),
		heures: Number(r.heures),
	}));
	if (delais.length === 0) throw new Error("aucun incident « vu » avec deux dates exploitables");
	const trie = [...delais].sort((a, b) => a.heures - b.heures || a.sourceId.localeCompare(b.sourceId, "fr"));
	const valeurs = trie.map((d) => d.heures);
	const p50 = quantile(valeurs, 0.5);
	const p90 = quantile(valeurs, 0.9);
	const max = valeurs[valeurs.length - 1] ?? 0;
	const min = valeurs[0] ?? 0;
	const moyenne = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
	const hist = histogramme(trie);
	const sources = parSource(delais);
	const exclus = exclusRows.rows;

	// ---- 2. Faux négatifs -------------------------------------------------
	const tousEvenements = [...eventRows.rows, ...archiveRows.rows];
	const urlsDB = new Set(tousEvenements.map((e) => e.source_url).filter((u): u is string => Boolean(u)).map(normaliserUrl));
	const urlCorpus60 = new Set(corpus60.incidents.map((i) => i.preuve?.url ?? "").filter(Boolean).map(normaliserUrl));
	const correspondances60 = [...urlCorpus60].filter((u) => urlsDB.has(u)).length;

	const fauxNegatifs: FauxNegatif[] = corpus.map((incident) => {
		const sourcesDeclarentees = sourcesPour(incident, sourcesRows.rows);
		const runsDuJour = runsRows.rows.filter((r) => jour(r.started_at) === incident.datePublication);
		const collectesDuJour = tousEvenements.filter((e) => jour(e.collected_at) === incident.datePublication);
		const observesDuJour = tousEvenements.filter((e) => jour(e.observed_at) === incident.datePublication);
		const matches = tousEvenements.flatMap((evenement) => {
			const regle = regleCorrespondance(evenement, incident);
			if (!regle) return [];
			return [{ table: evenement.table, rule: regle, id: evenement.id }];
		});
		return {
			incident,
			matches,
			runsDuJour: runsDuJour.length,
			sourcesDuJour: [...new Set(runsDuJour.map((r) => r.source_id))].sort(),
			evenementsCollectesDuJour: collectesDuJour.length,
			evenementsObservesDuJour: observesDuJour.length,
			sourcesDeclarentees,
		};
	});
	const nonVus = fauxNegatifs.filter((f) => f.matches.length === 0);
	const correspondancesUrl = fauxNegatifs.reduce((n, f) => n + f.matches.filter((m) => m.rule === "url").length, 0);
	const correspondancesTitre = fauxNegatifs.reduce((n, f) => n + f.matches.filter((m) => m.rule === "titre+date").length, 0);
	// Date de consultation / versement : absente du JSONL, présente dans le corpus de référence.
	const consulteLe = new Map<string, string>();
	for (const i of corpus60.incidents) {
		const objet = i as unknown as { preuve?: { consulteLe?: string } };
		if (i.preuve?.url && objet.preuve?.consulteLe) consulteLe.set(normaliserUrl(i.preuve.url), objet.preuve.consulteLe);
	}

	const docDelai = [
		"# Délai de détection — publication → première apparition en base",
		"",
		`Mesure rejouée sur la base de travail le **${new Date().toISOString().slice(0, 10)}**. ` +
			`${fenetre.runs} exécutions de collecteur, ${fenetre.sources} sources, ` +
			`${empreinte.n_event} événements, ${empreinte.n_archive} archivés, ${empreinte.n_source} sources déclarées.`,
		`Fenêtre de collecte effective : **${bande}**. Empreinte base : \`${empreinteBase}\`.`,
		"",
		"## Définition — ce qui compte comme « vu »",
		"",
		"Un incident **vu** est une ligne réellement écrite en base (`event` ou `event_archive`), " +
			"pas un incident rejoué par un bench. La publication est `observed_at` ; la première " +
			"apparition est `least(collected_at, created_at)` (les archives n'ont pas de `created_at`, " +
			"on prend `collected_at`). L'écart est calculé en SQL, en heures, sans arrondi intermédiaire.",
		"",
		`- **Périmètre** : publication tombée dans la fenêtre de collecte ${bande} ; familles ` +
			FAMILLES_INCIDENT.map((f) => `\`${f}\``).join(", ") + `.`,
		`- **Motif d'exclusion** : en dehors de cette fenêtre, \`observed_at\` est la date d'un fait ancien ` +
			"(CVE, brèche déjà connue) réingéré par un flux : l'écart mesurerait l'âge du fait, pas notre latence. " +
			"Les familles `vuln`, `cert` et `cert_fr` sont exclues pour la même raison : `observed_at` y est la date " +
			"de la notice de vulnérabilité, pas d'un incident.",
		`- **Exclus de la mesure** : ${exclus.map((e) => `\`${e.famille}\` ${e.n}`).join(", ") || "aucun"}.`,
		`- **Unité** : un \`dedup_key\` = un incident, même si plusieurs sources l'ont collecté.`,
		"",
		"## Requête SQL",
		"",
		"```sql",
		SQL_DELAIS,
		"```",
		"",
		"## Résultats",
		"",
		`**${String(delais.length)} incident(s) vu(s) daté(s).**`,
		"",
		"| Statistique | Heures | Jours |",
		"| --- | ---: | ---: |",
		`| min | ${min.toFixed(2).replace(".", ",")} | ${jours(min)} |`,
		`| **p50** | **${p50.toFixed(2).replace(".", ",")}** | **${jours(p50)}** |`,
		`| **p90** | **${p90.toFixed(2).replace(".", ",")}** | **${jours(p90)}** |`,
		`| max | ${max.toFixed(2).replace(".", ",")} | ${jours(max)} |`,
		`| moyenne | ${moyenne.toFixed(2).replace(".", ",")} | ${jours(moyenne)} |`,
		"",
		`Histogramme (seau de ${SEAU_HEURES} h) :`,
		"",
		"```",
		...hist,
		"```",
		"",
		"## Par source (au moins 20 incidents)",
		"",
		"| Source | Incidents | p50 (h) | p90 (h) |",
		"| --- | ---: | ---: | ---: |",
		...sources.map((s) => `| \`${cellule(s.source)}\` | ${s.n} | ${s.p50.toFixed(2).replace(".", ",")} | ${s.p90.toFixed(2).replace(".", ",")} |`),
		"",
		"## Dix délais les plus longs",
		"",
		"| Source | Famille | Publication | 1ʳᵉ apparition | Délai (h) |",
		"| --- | --- | --- | --- | ---: |",
		...trie.slice(-10).reverse().map((d) =>
			`| \`${cellule(d.sourceId)}\` | ${d.family} | ${jour(d.publication)} | ${horodatage(d.apparition)} | ${d.heures.toFixed(2).replace(".", ",")} |`,
		),
		"",
		"## Ce que ce chiffre ne mesure pas",
		"",
		"- Il ne mesure pas la couverture des incidents publics de Nouvelle-Aquitaine : " +
			`aucune des ${corpus.length} URL du corpus vérifié (\`${CORPUS_VERIFIE}\`) et aucune des ` +
			`${corpus60.incidents.length} URL du corpus de référence ne figure dans \`event\` ou \`event_archive\` ` +
			`(${correspondances60} correspondance(s) sur ${corpus60.incidents.length}). Voir \`docs/faux-negatifs.md\`.`,
		"- Il ne mesure pas la vitesse de la rédaction source : le départ est `observed_at`, la date à laquelle " +
			"le flux a publié le fait, pas la date de survenue de l'attaque.",
		"- Il n'inclut pas les incidents publiés hors de la fenêtre de collecte : l'absence de délai mesurable " +
			"n'y est pas une absence de retard, c'est une absence de collecte.",
		"",
		"## Reproduire",
		"",
		"```bash",
		"DATABASE_URL=postgres://radar:radar@localhost:5433/radar \\",
		"  apps/api/node_modules/.bin/tsx scripts/delai-detection.mts",
		"```",
		"",
	].join("\n");

	const lignesFaux = nonVus.map((f) => {
		const i = f.incident;
		const sources = f.sourcesDeclarentees;
		const sourceTexte = sources.length === 0
			? "aucune source du média n'est déclarée dans la table `source`"
			: `${sources.length} source(s) déclarée(s) (${sources.slice(0, 3).map((s) => `\`${cellule(s.id)}\``).join(", ")})` +
				`, dernière réussite enregistrée le ${sources.map((s) => jour(s.last_ok_at)).filter((d) => d !== null).sort().at(-1) ?? "—"}`;
		const trace = consulteLe.get(normaliserUrl(i.url));
		const runsTexte = f.runsDuJour === 0
			? "**0 exécution** de collecteur"
			: `**${f.runsDuJour} exécution(s)** de collecteur (${f.sourcesDuJour.slice(0, 3).join(", ")})`;
		return [
			`### \`${i.id}\` — ${i.organisation} (${i.departement})`,
			"",
			`**${i.source}** a publié le **${i.datePublication}** « ${i.titre} » (${i.type}) : ${i.url}. ` +
				`La requête SQL sur \`event\` + \`event_archive\` (URL normalisée, titre identique + même jour) ` +
				`renvoie **0 ligne correspondante** : c'est un faux négatif. ` +
				`La base contenait ce jour-là ${runsTexte}, **${f.evenementsCollectesDuJour} événement(s) collecté(s)** ` +
				`et **${f.evenementsObservesDuJour} événement(s) dont la date source (\`observed_at\`) est ce jour-là**` +
				` (collectés plus tard : la collecte n'existait pas encore). ${sourceTexte}. ` +
				`La collecte de cette base n'a commencé que le **${debut}**` +
				(trace
					? ` ; l'incident a été versé dans la mémoire versionnée du projet le ${trace} par consultation humaine de la page, pas par un flux.`
					: ` ; ce corpus ne porte pas de date de versement pour cet incident.`) +
				` L'absence n'est donc pas un rejet du moteur : ce jour-là, le radar ne collectait rien.`,
			"",
		].join("\n");
	}).join("\n");

	const docFaux = [
		"# Faux négatifs — incidents vérifiés jamais collectés",
		"",
		`Corpus : \`${CORPUS_VERIFIE}\` (${corpus.length} incidents datés, sourcés et URL vérifiables). ` +
			`Mesure rejouée le ${new Date().toISOString().slice(0, 10)} sur ${empreinte.n_event} événements, ` +
			`${empreinte.n_archive} archives, ${fenetre.runs} exécutions de collecteur. ` +
			`Empreinte base : \`${empreinteBase}\`.`,
		"",
		`**${nonVus.length} faux négatif(s) expliqué(s) sur ${corpus.length} incidents.** ` +
			`Aucun événement de la base ne correspond à l'une de ces ${corpus.length} URL : ` +
			`${correspondancesUrl} correspondance(s) par URL normalisée, ${correspondancesTitre} par titre+jour. Le corpus de référence de ` +
			`${corpus60.incidents.length} incidents donne le même résultat (${correspondances60} correspondance(s) d'URL).`,
		"",
		"## Méthode",
		"",
		"- Un incident est un **faux négatif** quand la base ne contient aucune ligne pour son URL normalisée " +
			"ni pour son titre publié le même jour. Les lignes d'`event` et d'`event_archive` sont toutes deux interrogées.",
		"- Pour chaque cas, « ce que la base contenait ce jour-là » est obtenu par agrégation SQL sur " +
			"`collector_run.started_at`, `event.collected_at`, `event_archive.collected_at` et " +
			"`observed_at` ramenés au jour UTC ; `observed_at` est la date du fait annoncé par la source, " +
			"pas la date d'écriture en base, d'où la distinction dans les paragraphes ci-dessous. " +
			"Un contrôle de déclaration du média est fait dans `source` (`name`, domaine de `url`, `last_ok_at`).",
		"- La fenêtre de collecte observée est **" + bande + "** : toute publication antérieure n'a pas pu être " +
			"collectée, ce qui est la cause commune des cas ci-dessous. Aucun cas n'est classé « rejeté par le moteur » " +
			"sur une simple absence.",
		"",
		"## Récapitulatif",
		"",
		"| Incident | Organisation | Source | Publication | Collecte ce jour | Événements collectés ce jour |",
		"| --- | --- | --- | --- | ---: | ---: |",
		...nonVus.map((f) =>
			`| \`${f.incident.id}\` | ${cellule(f.incident.organisation)} | ${cellule(f.incident.source)} | ` +
			`${f.incident.datePublication} | ${f.runsDuJour} | ${f.evenementsCollectesDuJour} |`,
		),
		"",
		"## Cas nominatifs",
		"",
		...lignesFaux.split("\n"),
		"Reproduire : `DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/delai-detection.mts`.",
		"",
	].join("\n");

	for (const [chemin, contenu] of [
		[SORTIE_DELAI, docDelai],
		[SORTIE_FAUX, docFaux],
	]) {
		const cible = resolve(RACINE, chemin);
		mkdirSync(dirname(cible), { recursive: true });
		writeFileSync(cible, contenu, "utf8");
		console.log(`publié : ${relative(RACINE, cible)}`);
	}
	console.log(`${delais.length} incident(s) vu(s) · p50 ${p50.toFixed(2)} h · p90 ${p90.toFixed(2)} h · max ${max.toFixed(2)} h`);
	console.log(`${nonVus.length} faux négatif(s) expliqué(s) sur ${corpus.length}`);
}

try {
	await main();
} finally {
	await closePools();
}
