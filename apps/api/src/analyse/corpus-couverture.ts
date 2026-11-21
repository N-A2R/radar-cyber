/**
 * Corpus de couverture consolidé — lecture, contrôle et empreinte.
 *
 * Le corpus publié est `bench/couverture/incidents.jsonl`. D'autres fichiers
 * JSONL déposés dans le même dossier sont consolidés avec lui : l'identifiant
 * `id` est la clé de déduplication (la première occurrence gagne). Les lignes
 * sont ensuite triées par `id` et resérialisées, de sorte que l'empreinte
 * SHA-256 ne dépende ni de l'ordre des fichiers ni de l'ordre des lignes.
 *
 * Cette empreinte est l'identifiant du jeu d'incidents mesuré : tout chiffre
 * publié doit la citer. Aucun appel réseau, aucune date courante.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DOSSIER_CORPUS = fileURLToPath(new URL("../../../../bench/couverture/", import.meta.url));
export const FICHIER_CORPUS = join(DOSSIER_CORPUS, "incidents.jsonl");

export type IncidentCorpus = {
	id: string;
	date_publication: string;
	date_incident: string | null;
	organisation: string;
	departement: string | null;
	type: string | null;
	source: string | null;
	titre: string;
	url: string;
	extrait: string | null;
	resume: string | null;
	confiance: string | null;
	verifie_le: string | null;
};

export type CorpusConsolide = {
	incidents: IncidentCorpus[];
	/** Lignes source resérialisées, triées par id : ce sont les octets hashés. */
	canonique: string;
	sha256: string;
	fichiers: string[];
	/** Lignes rejetées lors de la déduplication (id déjà vu). */
	doublons: string[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CHAMPS_OBLIGATOIRES = ["id", "date_publication", "organisation", "url"] as const;

function chaine(valeur: unknown): string | null {
	return typeof valeur === "string" && valeur.trim() !== "" ? valeur.trim() : null;
}

/** Valide une ligne et la projette sur le contrat du corpus (champs stables). */
function projeter(objet: Record<string, unknown>, origine: string, numero: number): IncidentCorpus {
	for (const champ of CHAMPS_OBLIGATOIRES) {
		if (!chaine(objet[champ])) {
			throw new Error(`${origine}:${numero} — champ obligatoire ${champ} absent ou vide`);
		}
	}
	const publication = chaine(objet.date_publication)!;
	if (!DATE.test(publication) || Number.isNaN(Date.parse(`${publication}T00:00:00Z`))) {
		throw new Error(`${origine}:${numero} — date_publication invalide : ${publication}`);
	}
	const url = chaine(objet.url)!;
	try {
		new URL(url);
	} catch {
		throw new Error(`${origine}:${numero} — URL invalide : ${url}`);
	}
	const incident = chaine(objet.date_incident);
	if (incident !== null && !DATE.test(incident)) {
		throw new Error(`${origine}:${numero} — date_incident invalide : ${incident}`);
	}
	const titre = chaine(objet.titre) ?? chaine(objet.organisation)!;
	return {
		id: chaine(objet.id)!,
		date_publication: publication,
		date_incident: incident,
		organisation: chaine(objet.organisation)!,
		departement: chaine(objet.departement),
		type: chaine(objet.type),
		source: chaine(objet.source),
		titre,
		url,
		extrait: chaine(objet.extrait),
		resume: chaine(objet.resume),
		confiance: chaine(objet.confiance),
		verifie_le: chaine(objet.verifie_le),
	};
}

/**
 * Consolide `bench/couverture/*.jsonl`. Le fichier de référence est inclus
 * même s'il est absent du listing (contrôle explicite du contrat).
 */
export function consoliderCorpus(dossier: string = DOSSIER_CORPUS): CorpusConsolide {
	const fichiers = existsSync(dossier)
		? readdirSync(dossier, { withFileTypes: true })
				.filter((entree) => entree.isFile() && entree.name.endsWith(".jsonl"))
				.map((entree) => entree.name)
				.sort()
		: [];
	if (!fichiers.includes("incidents.jsonl")) fichiers.unshift("incidents.jsonl");

	const parId = new Map<string, { incident: IncidentCorpus; ligne: string }>();
	const doublons: string[] = [];
	for (const nom of fichiers) {
		const chemin = join(dossier, nom);
		const contenu = readFileSync(chemin, "utf8");
		contenu.split(/\r?\n/).forEach((ligne, index) => {
			if (ligne.trim() === "") return;
			let objet: Record<string, unknown>;
			try {
				objet = JSON.parse(ligne) as Record<string, unknown>;
			} catch {
				throw new Error(`${nom}:${index + 1} — JSON invalide`);
			}
			if (objet === null || typeof objet !== "object" || Array.isArray(objet)) {
				throw new Error(`${nom}:${index + 1} — objet JSON attendu`);
			}
			const incident = projeter(objet, nom, index + 1);
			if (parId.has(incident.id)) doublons.push(incident.id);
			else parId.set(incident.id, { incident, ligne: JSON.stringify(objet) });
		});
	}

	const entrees = [...parId.values()].sort((a, b) => a.incident.id.localeCompare(b.incident.id, "fr"));
	if (entrees.length === 0) throw new Error("corpus vide : aucun incident à mesurer");
	const canonique = `${entrees.map((entree) => entree.ligne).join("\n")}\n`;
	return {
		incidents: entrees.map((entree) => entree.incident),
		canonique,
		sha256: createHash("sha256").update(canonique, "utf8").digest("hex"),
		fichiers,
		doublons,
	};
}

/** Empreinte seule, sans rejouer la lecture complète. */
export function hashCorpus(dossier: string = DOSSIER_CORPUS): string {
	return consoliderCorpus(dossier).sha256;
}
