/**
 * Couverture par secteur — croisement du corpus d'incidents et du référentiel
 * d'organisations.
 *
 * Le corpus dit QUEL secteur était visé (attendu) ; le référentiel et le moteur
 * de rattachement disent ce que le radar a réellement vu. Les six secteurs
 * demandés (public, santé, industrie, commerce, enseignement, collectivités)
 * ne sont pas six colonnes de la base : ils sont reconstruits par des règles
 * explicites, écrites une seule fois ici et publiées dans le document.
 *
 * Lecture seule : SELECT sur `org` / `org_alias`, aucun appel réseau, aucune
 * écriture en base. Le seul fichier écrit est docs/couverture-secteurs.md.
 *
 *   apps/api/node_modules/.bin/tsx scripts/couverture-secteurs.mts
 *   apps/api/node_modules/.bin/tsx scripts/couverture-secteurs.mts --json=bench/results/couverture-secteurs.json
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { query, closePools } from "../apps/api/src/db.js";
import { admitEvent } from "../apps/api/src/contract/admit.js";
import {
	buildGazetteer,
	designateUneOrganisation,
	type GazetteerRow,
} from "../apps/api/src/match/gazetteer.js";
import { intervalleWilson } from "../apps/api/src/analyse/secteur.js";

const CORPUS = fileURLToPath(new URL("../bench/fixtures/corpus-reference-na.json", import.meta.url));
const SORTIE = fileURLToPath(new URL("../docs/couverture-secteurs.md", import.meta.url));
const args = process.argv.slice(2);
const option = (nom: string): string | undefined =>
	args.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
const DOC = option("out")
	? fileURLToPath(new URL(`../${option("out")}`, import.meta.url))
	: SORTIE;
const JSON_SORTIE = option("json")
	? fileURLToPath(new URL(`../${option("json")}`, import.meta.url))
	: null;

type Secteur = "public" | "sante" | "industrie" | "commerce" | "enseignement" | "collectivites";
const SECTEURS: readonly Secteur[] = [
	"public",
	"sante",
	"industrie",
	"commerce",
	"enseignement",
	"collectivites",
];
const LIBELLES: Record<Secteur, string> = {
	public: "public",
	sante: "santé",
	industrie: "industrie",
	commerce: "commerce",
	enseignement: "enseignement",
	collectivites: "collectivités",
};

type Incident = {
	id: string;
	entite: string;
	entiteType: string;
	datePublique: string;
	type: string;
	resume: string;
	preuve?: { url?: string };
};

type RefSecteur = { orgs: number; avecAlias: number; alias: number };
type Motif = "vu" | "pas_admis" | "pas_rattache";
type Resultat = {
	id: string;
	entite: string;
	secteur: Secteur;
	motif: Motif;
	raison: string | null;
	orgTrouvee: string | null;
	orgCase: string | null;
	secteurTrouve: Secteur | null;
	juste: boolean;
};
type Stat = {
	secteur: Secteur;
	faits: number;
	vus: number;
	justes: number;
	rappel: number | null;
	rappelJuste: number | null;
	intervalle: [number, number] | null;
	refus: Map<string, number>;
	ref: RefSecteur;
	verdict: "bien vu" | "partiel" | "invisible" | "non mesurable";
};

/** Minuscules, sans accents, ponctuation réduite à des espaces. */
function normaliser(texte: string): string {
	return texte
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/**
 * Vocabulaire de classification du COTÉ CORPUS.
 *
 * Il ne devine pas le secteur d'après le nom de l'organisation trouvée : ce
 * serait circulaire. Il ne lit que l'incident (entité + résumé + type du
 * corpus). Le type `entiteType` porte déjà quatre secteurs ; `entreprise` et
 * `autre` sont répartis par ces lexiques, sinon l'incident est « non classé ».
 */
const RE_COMMERCE =
	/\b(intermarche|leclerc|super u|hyper u|carrefour|aucan|supermarche|supermarches|magasin|magasins|grande distribution|cdiscount|e commerce)\b/;
const RE_INDUSTRIE =
	/\b(vignobles|viticole|sicsoe|logistique|usinage|atelier|industriel|industrie|ingenierie|negoce|fabrication|fabrique|transformation|agroalimentaire)\b/;
const RE_SANTE =
	/\b(sante|hopital|clinique|ehpad|laboratoire|biologie medicale|patients|medical|pharmacie)\b/;
const RE_PUBLIC =
	/\b(ministere|prefecture|sdis|services departementaux d incendie|office francais|office national|agence nationale|union nationale|etablissement public|administration publique|gendarmerie)\b/;

function secteurAttendu(incident: Incident): Secteur | null {
	const texte = normaliser(`${incident.entite} ${incident.resume}`);
	switch (incident.entiteType) {
		case "collectivite":
			return "collectivites";
		case "sante":
			return "sante";
		case "enseignement":
			return "enseignement";
		case "entreprise":
			if (RE_SANTE.test(texte)) return "sante";
			if (RE_COMMERCE.test(texte)) return "commerce";
			if (RE_INDUSTRIE.test(texte)) return "industrie";
			return null;
		case "autre":
			return RE_PUBLIC.test(texte) ? "public" : null;
		default:
			return null;
	}
}

/**
 * Vocabulaire de classification du CÔTÉ ORGANISATIONS.
 *
 * Le référentiel n'a pas de `kind='public'` : `sector='administration'` en est
 * le seul proxy. Les SDIS, eux, sont rangés en `kind='sante'`. Cette règle est
 * publiée telle quelle : un secteur invisible ici est un résultat, pas un
 * oubli de la mesure.
 */
function secteurOrg(org: { kind: string; sector: string | null }): Secteur | null {
	switch (org.kind) {
		case "collectivite":
			return "collectivites";
		case "enseignement":
			return "enseignement";
		case "sante":
			return "sante";
	}
	switch (org.sector) {
		case "administration":
			return "public";
		case "enseignement":
			return "enseignement";
		case "sante-social":
			return "sante";
		case "industrie":
		case "agroalimentaire":
			return "industrie";
		case "commerce":
			return "commerce";
		default:
			return null;
	}
}

/** Motif stable pour un incident rejeté par la porte d'admission. */
function familleDe(type: string): string {
	switch (type) {
		case "ransomware": return "ransomware";
		case "fuite": return "leaks";
		case "phishing": return "phishing";
		case "ddos":
		case "compromission":
		case "defacement": return "cti";
		default: return "presse_cyber";
	}
}

function hashKey(value: string): string {
	return createHash("sha256").update(value).digest("base64url").slice(0, 24);
}

function pourcent(numerateur: number, denominateur: number): string {
	return denominateur === 0 ? "—" : `${Math.round((1000 * numerateur) / denominateur) / 10} %`;
}

function intervalleTexte(iv: [number, number] | null): string {
	return iv ? `${Math.round(iv[0] * 100)} – ${Math.round(iv[1] * 100)} %` : "—";
}

function entier(valeur: number): string {
	return valeur.toLocaleString("fr-FR");
}

function tronquer(texte: string, taille: number): string {
	return texte.length <= taille ? texte : `${texte.slice(0, taille - 1)}…`;
}

function pad(texte: string, taille: number): string {
	return texte.length >= taille ? texte.slice(0, taille) : texte.padEnd(taille);
}

/** Pourquoi ce secteur est vu ou non, en partie mesuré, en partie structurel. */
const NOTES: Record<Secteur, string> = {
	public:
		"Le corpus n'a pas de type `public` : les faits comptés ici viennent du type `autre` passé par le lexique (ministère, SDIS, office national, union nationale). Le référentiel n'a pas de `kind='public'` non plus : le proxy est `sector='administration'`, et les SDIS y sont rangés en `kind='sante'`. Un service public dont le texte ne porte pas de rôle explicite n'a donc ni case où être attendu, ni case où être trouvé.",
	sante:
		"Le type `sante` existe des deux côtés (`entiteType='sante'`, `kind='sante'`). Le lexique y ajoute les entreprises dont le texte parle d'établissements de santé ou de patients : un éditeur de logiciel médical est un fait de santé, pas un fait de numérique. Ce sont justement ces cas qui n'ont pas de `kind='sante'` au référentiel.",
	industrie:
		"Le corpus n'a pas de type `industrie` : les faits viennent d'`entreprise` étiquetées par lexique (vignoble, logistique vitivinicole, ingénierie, atelier). Le moteur nomme les victimes, mais les lignes trouvées ne portent pas `secteur='industrie'` : secteur vide ou rangé dans une autre catégorie NAF (agriculture, transport, activités spécialisées). L'industrie est donc invisible **en tant que secteur**, pas en tant qu'organisation — la répartition `kind/secteur` mesurée ci-dessus dit lequel des deux cas s'applique.",
	commerce:
		"Le corpus n'a pas de type `commerce` : les faits viennent d'`entreprise` (enseignes de distribution). Le référentiel a des unités légales `sector='commerce'`, pas l'enseigne que le texte cite (« Intermarché de X » est une SARL locale derrière un réseau). Un alias mono-jeton, même présent, ne suffit pas au moteur pour trancher.",
	enseignement:
		"Type et `kind` explicites des deux côtés. La limite vient des organismes parasites du monde scolaire : réseaux d'anciens, prestataires alumni, unions sportives. Le moteur les nomme, mais rattache alors une entreprise ou une association plutôt que l'établissement visé : le secteur est vu, l'entité ne l'est pas toujours.",
	collectivites:
		"Type `collectivite` au corpus et `kind='collectivite'` au référentiel (communes, EPCI, départements). Les alias de rôle (« mairie de », « ville de ») laissent le moteur trancher sur des noms de lieux qui, seuls, ne désignent personne : c'est le secteur où la taxonomie des deux sources coïncide le mieux.",
};

async function main(): Promise<void> {
	const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as {
		meta?: { fenetre?: [string, string] };
		incidents: Incident[];
	};
	const [debut, fin] = corpus.meta?.fenetre ?? ["2025-11-01", "2026-10-31"];
	const date = new Date().toISOString().slice(0, 10);

	// Le gazetteer de production lit org_alias.nom_normalise, colonne absente
	// sur une base non migrée. On construit le même index à partir des alias
	// bruts (buildGazetteer recalcule la clé) : moteur réel, requête compatible.
	const { rows: aliasRows } = await query<GazetteerRow>(
		`SELECT a.org_id, o.name, o.kind, o.dept, o.city, o.sector, a.alias, a.source
		   FROM org_alias a JOIN org o ON o.id = a.org_id
		  WHERE a.status = 'active'`,
	);
	const gaz = buildGazetteer(aliasRows);

	const { rows: groupes } = await query<{
		kind: string;
		sector: string | null;
		orgs: number;
		avec_alias: number;
		alias: number;
	}>(
		`SELECT o.kind, o.sector, count(DISTINCT o.id)::int AS orgs,
		        count(DISTINCT a.org_id)::int AS avec_alias,
		        count(a.id)::int AS alias
		   FROM org o LEFT JOIN org_alias a ON a.org_id = o.id AND a.status = 'active'
		  GROUP BY o.kind, o.sector`,
	);
	const ref = new Map<Secteur, RefSecteur>();
	for (const s of SECTEURS) ref.set(s, { orgs: 0, avecAlias: 0, alias: 0 });
	for (const g of groupes) {
		const s = secteurOrg(g);
		if (!s) continue;
		const total = ref.get(s)!;
		total.orgs += Number(g.orgs);
		total.avecAlias += Number(g.avec_alias);
		total.alias += Number(g.alias);
	}
	const organisations = groupes.reduce((n, g) => n + Number(g.orgs), 0);

	const resultats: Resultat[] = [];
	let horsFenetre = 0;
	let nonClasses = 0;
	let nonAdmis = 0;

	for (const incident of corpus.incidents) {
		if (incident.datePublique < debut || incident.datePublique > fin) {
			horsFenetre++;
			continue;
		}
		const secteur = secteurAttendu(incident);
		if (!secteur) {
			nonClasses++;
			continue;
		}
		const admission = admitEvent({
			dedupKey: `feed:coverage-secteurs:${hashKey(incident.preuve?.url ?? incident.id)}`,
			family: familleDe(incident.type),
			assertionType: "third_party_claim",
			title: `${incident.entite} — ${incident.type}`,
			summary: incident.resume,
			severity: 3,
			confidence: "C3",
			sourceId: "mesure-corpus",
			sourceUrl: incident.preuve?.url ?? null,
			observedAt: incident.datePublique,
		} as unknown as Record<string, unknown>);
		if (!admission.ok) {
			nonAdmis++;
			resultats.push({
				id: incident.id,
				entite: incident.entite,
				secteur,
				motif: "pas_admis",
				raison: admission.rejections.join(", "),
				orgTrouvee: null,
				orgCase: null,
				secteurTrouve: null,
				juste: false,
			});
			continue;
		}
		const texte = `${incident.entite} ${incident.resume}`;
		const match = designateUneOrganisation(gaz, texte);
		const org = match.org;
		const secteurTrouve = org ? secteurOrg(org) : null;
		resultats.push({
			id: incident.id,
			entite: incident.entite,
			secteur,
			motif: org ? "vu" : "pas_rattache",
			raison: org ? null : (match.reason ?? "aucun"),
			orgTrouvee: org?.name ?? null,
			orgCase: org ? `${org.kind}/${org.sector ?? "null"}` : null,
			secteurTrouve,
			juste: !!org && secteurTrouve === secteur,
		});
	}

	const stats: Stat[] = SECTEURS.map((secteur) => {
		const faits = resultats.filter((r) => r.secteur === secteur);
		const vus = faits.filter((r) => r.motif === "vu");
		const justes = faits.filter((r) => r.juste);
		const refus = new Map<string, number>();
		for (const r of faits) {
			if (r.motif === "pas_rattache") refus.set(r.raison ?? "aucun", (refus.get(r.raison ?? "aucun") ?? 0) + 1);
			if (r.motif === "pas_admis") refus.set("pas_admis", (refus.get("pas_admis") ?? 0) + 1);
		}
		const rappel = faits.length === 0 ? null : vus.length / faits.length;
		const rappelJuste = faits.length === 0 ? null : justes.length / faits.length;
		const verdict: Stat["verdict"] =
			faits.length === 0
				? "non mesurable"
				: justes.length === 0
					? "invisible"
					: (rappelJuste ?? 0) >= 0.6 && faits.length >= 3
						? "bien vu"
						: "partiel";
		return {
			secteur,
			faits: faits.length,
			vus: vus.length,
			justes: justes.length,
			rappel,
			rappelJuste,
			intervalle: intervalleWilson(justes.length, faits.length),
			refus: new Map([...refus.entries()].sort((a, b) => b[1] - a[1])),
			ref: ref.get(secteur)!,
			verdict,
		};
	});

	function diagnostic(s: Stat): string {
		if (s.faits === 0) return `Aucun incident du corpus n'entre dans ce secteur : il n'y a pas de taux, et ce n'est pas un 0 %.`;
		const parties = [
			`Sur ${s.faits} fait(s) dans la fenêtre, ${s.vus} a (ont) été rattaché(s) à une organisation et ${s.justes} au bon secteur (${pourcent(s.justes, s.faits)}).`,
		];
		if (s.refus.size > 0) {
			const motif = [...s.refus.entries()].map(([cle, n]) => `${cle} × ${n}`).join(", ");
			parties.push(`Refus motivés : ${motif}.`);
		}
		const trouves = new Map<string, number>();
		for (const r of resultats) {
			if (r.secteur !== s.secteur || r.motif !== "vu") continue;
			const cle = r.orgCase ?? "?";
			trouves.set(cle, (trouves.get(cle) ?? 0) + 1);
		}
		if (trouves.size > 0) {
			parties.push(`Secteurs des organisations trouvées : ${[...trouves.entries()].map(([cle, n]) => `${cle} × ${n}`).join(", ")}.`);
		}
		parties.push(
			s.ref.orgs === 0
				? "Aucune organisation du référentiel ne porte ce secteur."
				: `Référentiel : ${entier(s.ref.orgs)} organisation(s), dont ${entier(s.ref.avecAlias)} avec au moins un alias.`,
		);
		return parties.join(" ");
	}

	const lignesTable = stats
		.map(
			(s) =>
				`| ${LIBELLES[s.secteur]} | ${s.faits} | ${s.vus} | ${s.justes} | ${pourcent(s.justes, s.faits)} | ${intervalleTexte(s.intervalle)} | ${entier(s.ref.orgs)} / ${entier(s.ref.avecAlias)} | ${s.verdict} |`,
		)
		.join("\n");

	const sections = (verdict: Stat["verdict"]): string => {
		const choix = stats.filter((s) => s.verdict === verdict);
		if (choix.length === 0) return "Aucun secteur dans ce cas.\n";
		return choix
			.map((s) => `- **${LIBELLES[s.secteur]}** — ${s.justes}/${s.faits} au bon secteur (${pourcent(s.justes, s.faits)}), ${entier(s.ref.orgs)} organisation(s) au référentiel.`)
			.join("\n") + "\n";
	};

	const pourquoi = stats
		.map(
			(s) =>
				`### ${LIBELLES[s.secteur]} — ${s.verdict}\n\n${diagnostic(s)}\n\n${NOTES[s.secteur]}\n`,
		)
		.join("\n");

	const detail = resultats
		.map((r) => {
			const resultat =
				r.motif === "vu"
					? r.juste ? "vu / bon secteur" : `vu / ${r.secteurTrouve ?? "hors secteur"}`
					: r.motif === "pas_admis" ? `pas admis (${r.raison})` : `pas rattaché (${r.raison})`;
			return `| ${r.id} | ${tronquer(r.entite, 52)} | ${LIBELLES[r.secteur]} | ${resultat} | ${r.orgTrouvee ? tronquer(r.orgTrouvee, 40) : "—"} |`;
		})
		.join("\n");

	const markdown = `# Couverture par secteur — mesure du ${date}

Script : \`apps/api/node_modules/.bin/tsx scripts/couverture-secteurs.mts\`.
Corpus : \`bench/fixtures/corpus-reference-na.json\` (fenêtre ${debut} → ${fin},
${corpus.incidents.length} incidents). Organisations : ${entier(organisations)} lignes de \`org\`,
${entier(aliasRows.length)} alias actifs. Lecture seule. **Chaque nombre ci-dessous est calculé par le script** ; les règles de classement sont écrites dans le script et reprises en fin de document.

## Résultat

| Secteur | Faits | Vus | Bon secteur | Rappel juste | Intervalle 95 % | Org / dont avec alias | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
${lignesTable}

« Bon secteur » compte les rattachements à une organisation du même secteur :
un incident vu mais rattaché à un autre secteur n'est pas une couverture.
L'intervalle est celui de Wilson (95 %) sur ce rappel juste ; sur moins de dix
faits il dit l'incertitude au lieu de la masquer.

Un « bon secteur » n'est pas une « bonne entité » : un magasin du même réseau
dans une autre ville compte ici comme juste ; le détail ci-dessous le montre.

La colonne « Org / dont avec alias » compte les lignes de \`org\` et celles qui
ont au moins un alias actif ; le nom de l'organisation étant lui-même un alias,
un écart y signale des lignes importées sans alias exploitable.

Le verdict est calculé : \`invisible\` si aucun fait n'est rattaché au bon
secteur, \`bien vu\` si au moins 60 % le sont sur trois faits ou plus,
\`partiel\` sinon, \`non mesurable\` si le corpus n'a aucun fait dans le secteur.

## Ce qui est bien vu

${sections("bien vu")}
## Ce qui est partiel

${sections("partiel")}
## Ce qui est invisible

${sections("invisible")}
## Ce qui est non mesurable

${sections("non mesurable")}
## Pourquoi

${pourquoi}
## Détail des incidents retenus

| Incident | Entité | Secteur attendu | Résultat | Organisation trouvée |
|---|---|---|---|---|
${detail}

Corpus : ${corpus.incidents.length} incidents · hors fenêtre ${horsFenetre} ·
dans la fenêtre ${corpus.incidents.length - horsFenetre} · non classés ${nonClasses} ·
classés ${resultats.length} · refusés par la porte d'admission ${nonAdmis}.
Les « non classés » ne sont pas comptés comme des échecs : le corpus dit
\`entreprise\` ou \`autre\` sans qu'aucun lexique ne permette de les ranger dans
les six secteurs demandés.

## Méthode et limites

- **Corpus** : type \`entiteType\` quand il porte directement collectivité, santé ou
  enseignement ; lexiques explicites sur le nom et le résumé pour répartir
  \`entreprise\` (commerce, industrie, santé) et \`autre\` (public). Le reste est
  publié comme non classé, jamais deviné.
- **Référentiel** : \`kind='collectivite'|'sante'|'enseignement'\` ; \`sector='administration'\`
  pour public, \`sante-social\` pour santé, \`industrie\` / \`agroalimentaire\` pour industrie,
  \`commerce\` pour commerce. L'absence de \`kind='public'\` est un fait mesuré,
  pas un oubli de la mesure.
- **Moteur** : même porte d'admission que l'ingestion (\`contract/admit.ts\`) et
  même fonction de désignation que la production (\`designateUneOrganisation\`,
  \`match/gazetteer.ts\`), appliquée à « entité + résumé ». Le gazetteer est
  construit en mémoire depuis \`org_alias\` (la colonne matérialisée
  \`nom_normalise\` n'existe pas sur toutes les bases).
- **Limite** : la mesure évalue la capacité à reconnaître un incident publié,
  pas le délai de collecte ni les incidents jamais rendus publics. Sur moins de
  trois faits, le verdict est indicatif : c'est l'intervalle qui fait foi.
`;
	writeFileSync(DOC, markdown, "utf8");
	if (JSON_SORTIE) {
		writeFileSync(
			JSON_SORTIE,
			`${JSON.stringify(
				{
					date,
					fenetre: { debut, fin },
					organisations,
					alias: aliasRows.length,
					corpus: {
						total: corpus.incidents.length,
						horsFenetre,
						dansLaFenetre: corpus.incidents.length - horsFenetre,
						nonClasses,
						nonAdmis,
					},
					stats: stats.map((s) => ({
						...s,
						secteur: LIBELLES[s.secteur],
						refus: [...s.refus.entries()],
					})),
					resultats,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
	}

	console.log(`Couverture par secteur — ${date} — ${debut} → ${fin}`);
	console.log(`Corpus ${corpus.incidents.length} incidents · ${entier(organisations)} organisations · ${entier(aliasRows.length)} alias\n`);
	const largeurs = [16, 7, 7, 12, 12, 16, 15];
	const imprimer = (cellules: string[]): void => console.log(cellules.map((c, i) => pad(c, largeurs[i])).join(" "));
	imprimer(["secteur", "faits", "vus", "bons", "rappel juste", "intervalle", "verdict"]);
	console.log(largeurs.map((n) => "-".repeat(n)).join(" "));
	for (const s of stats) {
		imprimer([
			LIBELLES[s.secteur],
			String(s.faits),
			String(s.vus),
			String(s.justes),
			pourcent(s.justes, s.faits),
			intervalleTexte(s.intervalle),
			s.verdict,
		]);
	}
	console.log(`\nNon classés : ${nonClasses} · hors fenêtre : ${horsFenetre} · refusés : ${nonAdmis}`);
	console.log(`document publié : ${DOC}`);
	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
