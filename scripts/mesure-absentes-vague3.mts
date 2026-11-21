/**
 * Mesure des entités « absentes » de la cohorte de reprise (chantier
 * couverture, S1.3) : pour chaque entité marquée `absent` dans
 * bench/results/na-lot-reprise-*.json, l'entité est-elle désormais présente
 * dans le référentiel (org ou org_alias) ?
 *
 * « Présente » = même définition honnête que le moteur : tous les jetons
 * discriminants de l'un figurent dans l'autre (nom ou alias), à une
 * normalisation identique (NFD, diacritiques ôtés, minuscules). SIREN jamais
 * inventé — l'entité ne devient présente que si le référentiel porte un nom
 * ou un alias qui la couvre.
 *
 * Usage :
 *   tsx scripts/mesure-absentes-vague3.mts --sortie=bench/results/couverture-absentes-avant.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import { jetonsDiscriminants } from "../apps/api/src/match/regles-precision.js";

const args = process.argv.slice(2);
const opt = (nom: string): string | null =>
	args.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=") ?? null;
const SORTIE = opt("sortie") ?? "bench/results/couverture-absentes.json";

function normaliser(texte: string): string {
	return texte
		.replace(/œ/g, "oe")
		.replace(/æ/g, "ae")
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Titre de fuite nettoyé : annotations ((old), <Updated>) ôtées, comme les lots. */
function nomLisible(nom: string): string {
	return nom.replace(/\s*\((old|part \d+)\)\s*$/i, "").replace(/<[^>]*>/g, "").trim();
}

async function main(): Promise<void> {
	// La cohorte absente, telle que les lots l'ont posée.
	const absentes = new Set<string>();
	const lots: string[] = [];
	for (let n = 1; n <= 17; n++) {
		const chemin = `bench/results/na-lot-reprise-${n}.json`;
		let d: { resolutions?: { nomLisible: string; verdict: string }[]; arbitrages?: { nomLisible: string; verdict: string }[] };
		try {
			d = JSON.parse(readFileSync(chemin, "utf8"));
		} catch { continue; }
		lots.push(chemin);
		for (const e of [...(d.resolutions ?? []), ...(d.arbitrages ?? [])]) {
			if (e.verdict === "absent") absentes.add(nomLisible(e.nomLisible));
		}
	}
	console.log(`cohorte absente : ${absentes.size} entités sur ${lots.length} lots`);

	// Le référentiel en mémoire : nom normalisé + alias actifs, par organisation.
	const { rows: orgs } = await query<{ id: number; name: string }>("SELECT id, name FROM org");
	const { rows: aliases } = await query<{ org_id: number; alias: string }>(
		"SELECT org_id, alias FROM org_alias WHERE status = 'active'",
	);
	const orgsParJeton = new Map<string, { id: number; jetons: Set<string> }[]>();
	for (const o of orgs) {
		const jetons = jetonsDiscriminants(o.name);
		for (const t of jetons) {
			const l = orgsParJeton.get(t) ?? [];
			l.push({ id: o.id, jetons: new Set(jetons) });
			orgsParJeton.set(t, l);
		}
	}
	const aliasParTexte = new Map<string, number[]>();
	for (const a of aliases) {
		const cle = normaliser(a.alias);
		if (cle.length === 0) continue;
		const l = aliasParTexte.get(cle) ?? [];
		l.push(a.org_id);
		aliasParTexte.set(cle, l);
	}
	const nomsOrgs = new Map(orgs.map((o) => [o.id, o.name] as const));

	/** Identité au sens strict (le référentiel porte l'entité, pas un simple
	 * candidat du moteur) : soit le nom de l'org (≥ 2 jetons discriminants)
	 * est tout entier dans l'entité, soit égalité exacte. Le bras jeton-unique
	 * du moteur est volontairement absent : « glass » dans « Royal Glass » ne
	 * prouve pas SAS GLASS CORP — c'est le piège que la règle sigle ferme. */
	function couvert(orgJetons: string[], entiteJetons: string[]): boolean {
		return orgJetons.length >= 2 && orgJetons.every((t) => entiteJetons.includes(t));
	}

	function chercher(nom: string): { presente: boolean; orgId: number | null; orgName: string | null; par: string | null } {
		const jetonsEntite = jetonsDiscriminants(nom);
		if (jetonsEntite.length === 0) return { presente: false, orgId: null, orgName: null, par: null };
		// Candidats via le jeton d'entité le plus rare dans les noms d'org.
		const rare = jetonsEntite.reduce((meilleur, t) =>
			(orgsParJeton.get(t)?.length ?? 0) < (orgsParJeton.get(meilleur)?.length ?? Infinity) ? t : meilleur,
		);
		const candidats = orgsParJeton.get(rare) ?? [];
		for (const c of candidats) {
			if (couvert([...c.jetons], jetonsEntite)) {
				return { presente: true, orgId: c.id, orgName: nomsOrgs.get(c.id) ?? null, par: "nom" };
			}
		}
		// Alias : égalité normalisée du nom entier, ou de l'entité sans ses
		// suffixes de domaine (.fr → ôté par la normalisation).
		const cle = normaliser(nom);
		const cles = new Set([cle, cle.replace(/\s(fr|com|org|net)$/, "").trim()]);
		for (const c of cles) {
			if (c.length < 4) continue;
			const ids = aliasParTexte.get(c);
			if (ids?.length) return { presente: true, orgId: ids[0], orgName: nomsOrgs.get(ids[0]) ?? null, par: "alias" };
		}
		return { presente: false, orgId: null, orgName: null, par: null };
	}

	const detail: { nom: string; presente: boolean; orgId: number | null; orgName: string | null; par: string | null }[] = [];
	for (const nom of [...absentes].sort()) {
		detail.push({ nom, ...chercher(nom) });
	}
	const presentes = detail.filter((d) => d.presente);
	const resultat = {
		date: new Date().toISOString().slice(0, 10),
		source: "bench/results/na-lot-reprise-{1..17}.json (verdict absent)",
		methode: "jetons discriminants couverts par le nom de l'org, ou alias actif égal à la normalisation ; aucun SIREN inventé",
		cohorte: detail.length,
		presentes: presentes.length,
		detail,
	};
	writeFileSync(SORTIE, JSON.stringify(resultat, null, "\t") + "\n");
	console.log(`présentes : ${presentes.length} / ${detail.length}`);
	for (const p of presentes) console.log(`  ✓ ${p.nom} → ${p.orgName} (${p.par})`);
	console.log(`écrit : ${SORTIE}`);
	await closePools();
}

await main().catch(async (e) => {
	console.error(e);
	await closePools().catch(() => {});
	process.exit(1);
});
