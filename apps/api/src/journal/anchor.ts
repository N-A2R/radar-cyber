/**
 * Ancrage quotidien de la racine du journal de vérité.
 *
 * Un jour UTC est ancré par une ligne immuable de `journal_anchor` et un
 * fichier `journal_root_AAAA-MM-JJ.json`. La racine est recomputable depuis
 * `journal` en relisant les lignes d'id `journal_debut_id..journal_fin_id`
 * dont `recorded_at` tombe ce jour-là : corriger une projection plus tard ne
 * change ni la racine, ni le jeton temporel, ni le fichier publié.
 *
 * Les bornes d'id sont essentielles : une ligne ajoutée après coup avec un
 * `recorded_at` rétroactif ne doit pas invalider un ancrage déjà publié.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { query, withIngestTransaction } from "../db.js";
import { racineJournal, type LigneJournal } from "./merkle.js";
import {
	empreinteRacine,
	fournisseurRfc3161,
	verifierJeton,
	type FournisseurJeton,
	type JetonVerifie,
} from "./rfc3161.js";

export const DOSSIER_ANCRAGE = process.env.RADAR_JOURNAL_ANCHOR_DIR ?? "journal";
const SCHEMA_FICHIER = "radar.journal.root/v1";

type LigneJournalDb = {
	id: string;
	kind: string;
	subject: string;
	summary: string;
	payload: unknown;
	actor: string;
	valid_at: Date | string | null;
	recorded_at: Date | string;
};

export type Ancrage = {
	jour: string;
	racine_sha256: string;
	token_rfc3161: string;
	certificat_tsa: string;
	journal_debut_id: string;
	journal_fin_id: string;
	journal_lignes: string;
	fichier: string;
	ancre_le: Date;
	tsa_url?: string | null;
	tsa_gen_time?: string | null;
	tsa_serial?: string | null;
};

export type ResultatAncrage = { statut: "cree" | "existant"; ancrage: Ancrage };

function verifierJourFormat(jour: string): void {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || new Date(`${jour}T00:00:00Z`).toISOString().slice(0, 10) !== jour) {
		throw new Error(`jour invalide : ${jour} (AAAA-MM-JJ attendu)`);
	}
}

export function cheminRelatif(jour: string): string {
	verifierJourFormat(jour);
	return `journal/journal_root_${jour}.json`;
}

type Bornes = { debut: number; fin: number };

/**
 * Bornes numériques d'un ensemble de lignes : 0/0 pour un jour vide (la
 * branche `journal_debut_id = 0 AND journal_fin_id = 0` de la contrainte).
 * On prend le min et le max *numériques* : la position dans la liste ne suffit
 * pas, un tri lexicographique produit des bornes inversées dès qu'un jour
 * chevauche un changement de largeur d'id (99999 → 100000).
 */
export function bornesDeLignes(lignes: readonly LigneJournal[]): Bornes {
	if (lignes.length === 0) return { debut: 0, fin: 0 };
	let debut = Number(lignes[0]!.id);
	let fin = debut;
	for (const ligne of lignes) {
		const id = Number(ligne.id);
		if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`id de journal inattendu : ${String(ligne.id)}`);
		if (id < debut) debut = id;
		if (id > fin) fin = id;
	}
	return { debut, fin };
}

export async function lignesDuJour(jour: string, bornes?: Bornes): Promise<LigneJournal[]> {
	// Un ancrage d'un jour vide porte les bornes 0/0 : la racine gravée est
	// celle d'un arbre vide. Une ligne rétroactive inscrite plus tard avec ce
	// `recorded_at` reste hors bornes et ne doit donc pas être relue ici.
	if (bornes && bornes.fin === 0) return [];
	const resultat = await query<LigneJournalDb>(
		// `ORDER BY id` se résoudrait sur l'alias texte de la projection et
		// trierait « 100000 » avant « 99999 » : la racine et les bornes
		// dépendent donc d'un tri explicitement numérique.
		`SELECT id::text AS id, kind, subject, summary, payload, actor, valid_at, recorded_at
		   FROM journal
		  WHERE (recorded_at AT TIME ZONE 'UTC')::date = $1::date
		    AND ($2::bigint = 0 OR id >= $2::bigint)
		    AND ($3::bigint = 0 OR id <= $3::bigint)
		  ORDER BY journal.id ASC`,
		[jour, bornes?.debut ?? 0, bornes?.fin ?? 0],
	);
	return resultat.rows.map((ligne) => ({
		id: Number(ligne.id),
		kind: ligne.kind,
		subject: ligne.subject,
		summary: ligne.summary,
		payload: ligne.payload ?? {},
		actor: ligne.actor,
		valid_at: ligne.valid_at,
		recorded_at: ligne.recorded_at,
	}));
}

function contenuFichier(ancrage: Ancrage): Record<string, unknown> {
	return {
		schema: SCHEMA_FICHIER,
		jour: ancrage.jour,
		racine_sha256: ancrage.racine_sha256,
		journal_debut_id: Number(ancrage.journal_debut_id),
		journal_fin_id: Number(ancrage.journal_fin_id),
		journal_lignes: Number(ancrage.journal_lignes),
		token_rfc3161: ancrage.token_rfc3161,
		certificat_tsa: ancrage.certificat_tsa,
		tsa_url: ancrage.tsa_url ?? null,
		tsa_gen_time: ancrage.tsa_gen_time ?? null,
		tsa_serial: ancrage.tsa_serial ?? null,
		ancre_le: ancrage.ancre_le instanceof Date ? ancrage.ancre_le.toISOString() : String(ancrage.ancre_le),
	};
}

async function publierFichier(ancrage: Ancrage, dossier: string): Promise<string> {
	const chemin = resolve(dossier, `journal_root_${ancrage.jour}.json`);
	const contenu = `${JSON.stringify(contenuFichier(ancrage), null, 2)}\n`;
	await mkdir(dirname(chemin), { recursive: true });
	try {
		const actuel = await readFile(chemin, "utf8");
		if (actuel === contenu) return chemin;
	} catch {
		// fichier absent : on le crée
	}
	// Écriture atomique : un lecteur ne voit jamais un fichier à moitié écrit,
	// et une republication ne laisse pas de contenu tronqué derrière elle.
	const temporaire = `${chemin}.${process.pid}.tmp`;
	await writeFile(temporaire, contenu, "utf8");
	await rename(temporaire, chemin);
	return chemin;
}

async function lireAncrage(jour: string): Promise<Ancrage | undefined> {
	const resultat = await query<Ancrage & { jour_text: string }>(
		"SELECT a.*, a.jour::text AS jour_text FROM journal_anchor a WHERE jour = $1",
		[jour],
	);
	const ligne = resultat.rows[0];
	return ligne ? { ...ligne, jour: ligne.jour_text } : undefined;
}

/** Date UTC courante : le fuseau de la base (Europe/Paris) ne doit jamais décider d'un ancrage. */
export async function jourUtcCourant(): Promise<string> {
	const resultat = await query<{ jour: string }>("SELECT ((now() AT TIME ZONE 'UTC')::date)::text AS jour");
	const jour = resultat.rows[0]?.jour;
	if (!jour) throw new Error("date UTC indisponible");
	return jour;
}

/**
 * Ancre un jour. Un second passage retombe sur la même racine et republie le
 * fichier s'il manque ; il ne modifie jamais la ligne existante.
 */
export async function ancrerJour(options: {
	jour: string;
	fournisseur?: FournisseurJeton;
	verificateur?: (jeton: string, empreinte: Buffer) => JetonVerifie;
	dossier?: string;
}): Promise<ResultatAncrage> {
	verifierJourFormat(options.jour);
	const aujourdHui = await jourUtcCourant();
	if (options.jour >= aujourdHui) {
		throw new Error(`ancrage refusé : ${options.jour} n'est pas un jour UTC clos (aujourd'hui : ${aujourdHui})`);
	}
	const dossier = options.dossier ?? DOSSIER_ANCRAGE;
	const verificateur = options.verificateur ?? verifierJeton;
	const existant = await lireAncrage(options.jour);
	if (existant) {
		const lignes = await lignesDuJour(options.jour, {
			debut: Number(existant.journal_debut_id),
			fin: Number(existant.journal_fin_id),
		});
		const racine = racineJournal(lignes);
		if (racine !== existant.racine_sha256) {
			throw new Error(`ancrage ${options.jour} divergent : la racine recomputée ne correspond plus`);
		}
		verificateur(existant.token_rfc3161, empreinteRacine(racine));
		await publierFichier(existant, dossier);
		return { statut: "existant", ancrage: existant };
	}

	const lignes = await lignesDuJour(options.jour);
	const bornes = bornesDeLignes(lignes);
	// Garde-fou avant l'INSERT : la contrainte `journal_anchor_bornes_ordonnees`
	// est la preuve d'intégrité, pas un filet à laisser rejeter une ligne. Un
	// jour vide garde les bornes 0/0 (ancrage valide de l'arbre vide) ; toute
	// autre combinaison inversée est un défaut de calcul et n'écrit rien.
	if (bornes.fin !== 0 && bornes.debut > bornes.fin) {
		throw new Error(
			`bornes d'ancrage incohérentes pour ${options.jour} (${bornes.debut} > ${bornes.fin}) : ancrage non écrit`,
		);
	}
	const racine = racineJournal(lignes);
	const jeton = await (options.fournisseur ?? fournisseurRfc3161())(racine);
	const ancrage: Ancrage = {
		jour: options.jour,
		racine_sha256: racine,
		token_rfc3161: jeton.jeton,
		certificat_tsa: jeton.certificat,
		journal_debut_id: String(bornes.debut),
		journal_fin_id: String(bornes.fin),
		journal_lignes: String(lignes.length),
		fichier: cheminRelatif(options.jour),
		ancre_le: new Date(),
		tsa_url: jeton.tsaUrl,
		tsa_gen_time: jeton.genTime,
		tsa_serial: jeton.serial,
	};

	let resultat!: ResultatAncrage;
	await withIngestTransaction(async (client) => {
		const insertion = await client.query(
			`INSERT INTO journal_anchor
			   (jour, racine_sha256, token_rfc3161, certificat_tsa,
			    journal_debut_id, journal_fin_id, journal_lignes, fichier,
			    tsa_url, tsa_gen_time, tsa_serial, ancre_le)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			 ON CONFLICT (jour) DO NOTHING`,
			[
				ancrage.jour, ancrage.racine_sha256, ancrage.token_rfc3161, ancrage.certificat_tsa,
				ancrage.journal_debut_id, ancrage.journal_fin_id, ancrage.journal_lignes, ancrage.fichier,
				ancrage.tsa_url, ancrage.tsa_gen_time, ancrage.tsa_serial, ancrage.ancre_le,
			],
		);
		if (insertion.rowCount === 0) {
			// Un concurrent a gagné la clé `jour` : c'est sa ligne, pas notre
			// jeton, qui fait foi. On la relit dans la même transaction et on
			// publie exactement les octets qu'elle porte.
			const concurrent = await client.query<Ancrage & { jour_text: string }>(
				"SELECT a.*, a.jour::text AS jour_text FROM journal_anchor a WHERE jour = $1",
				[options.jour],
			);
			const ligne = concurrent.rows[0];
			if (!ligne) throw new Error(`ancrage ${options.jour} concurrent introuvable`);
			const retenu: Ancrage = { ...ligne, jour: ligne.jour_text };
			if (retenu.racine_sha256 !== ancrage.racine_sha256) {
				throw new Error(`ancrage ${options.jour} concurrent divergent`);
			}
			verificateur(retenu.token_rfc3161, empreinteRacine(retenu.racine_sha256));
			resultat = { statut: "existant", ancrage: retenu };
		} else {
			resultat = { statut: "cree", ancrage };
		}
	});
	// La base est la source de vérité : on ne publie le fichier qu'après que
	// l'insertion a réussi, avec la ligne retenue en cas de course.
	await publierFichier(resultat.ancrage, dossier);
	return resultat;
}

/** Hier en UTC : c'est le critère SQL des lignes du journal, pas `current_date` (Europe/Paris). */
export async function jourHier(): Promise<string> {
	const resultat = await query<{ jour: string }>("SELECT ((now() AT TIME ZONE 'UTC')::date - 1)::text AS jour");
	const jour = resultat.rows[0]?.jour;
	if (!jour) throw new Error("date UTC indisponible");
	return jour;
}

/** Jours UTC du journal encore sans ancrage, du plus récent au plus ancien. */
export async function joursManquants(limite = 366): Promise<string[]> {
	const resultat = await query<{ jour: string }>(
		`SELECT DISTINCT ((recorded_at AT TIME ZONE 'UTC')::date)::text AS jour
		   FROM journal j
		  WHERE (recorded_at AT TIME ZONE 'UTC')::date <= (now() AT TIME ZONE 'UTC')::date - 1
		    AND NOT EXISTS (SELECT 1 FROM journal_anchor a WHERE a.jour = (j.recorded_at AT TIME ZONE 'UTC')::date)
		  ORDER BY jour DESC
		  LIMIT $1`,
		[limite],
	);
	return resultat.rows.map((ligne) => ligne.jour);
}

/** Recompute la racine, vérifie le jeton et le fichier publié. */
export async function verifierJour(options: {
	jour: string;
	dossier?: string;
	verificateur?: (jeton: string, empreinte: Buffer) => JetonVerifie;
}): Promise<{ ok: true; jour: string; racine: string; lignes: number; tsaGenTime: string }> {
	const ancrage = await lireAncrage(options.jour);
	if (!ancrage) throw new Error(`aucun ancrage pour ${options.jour}`);
	const lignes = await lignesDuJour(options.jour, {
		debut: Number(ancrage.journal_debut_id),
		fin: Number(ancrage.journal_fin_id),
	});
	const racine = racineJournal(lignes);
	if (racine !== ancrage.racine_sha256) {
		throw new Error(`racine recomputée différente pour ${options.jour}`);
	}
	const jeton = (options.verificateur ?? verifierJeton)(ancrage.token_rfc3161, empreinteRacine(racine));
	const chemin = resolve(options.dossier ?? DOSSIER_ANCRAGE, `journal_root_${options.jour}.json`);
	const publie = JSON.parse(await readFile(chemin, "utf8")) as Record<string, unknown>;
	const attendu = contenuFichier(ancrage);
	for (const [cle, valeur] of Object.entries(attendu)) {
		if (JSON.stringify(publie[cle]) !== JSON.stringify(valeur)) {
			throw new Error(`fichier d'ancrage divergent pour ${options.jour} (champ ${cle})`);
		}
	}
	return { ok: true, jour: options.jour, racine, lignes: lignes.length, tsaGenTime: jeton.genTime };
}

export type ResultatJournee = {
	ancres: ResultatAncrage[];
	echecs: { jour: string; erreur: string }[];
	/** Plus vieux jour encore sans ancrage après le passage (aucun si null). */
	plusVieuxJourManquant: string | null;
};

/**
 * Ancrage quotidien : la veille d'abord, puis *tous* les jours manquants,
 * par lots bornés jusqu'à épuisement. Un échec sur un jour (TSA indisponible)
 * est rapporté sans bloquer les autres ; il sera retenté au passage suivant.
 */
export async function ancrerJournalDuJour(options: {
	rattrapage?: number;
	fournisseur?: FournisseurJeton;
	verificateur?: (jeton: string, empreinte: Buffer) => JetonVerifie;
	dossier?: string;
} = {}): Promise<ResultatJournee> {
	const hier = await jourHier();
	const tailleLot = Math.max(30, Math.min(366, options.rattrapage ?? 30));
	const ancres: ResultatAncrage[] = [];
	const echecs: { jour: string; erreur: string }[] = [];
	const dejaTentes = new Set<string>();
	let manquants = await joursManquants(tailleLot);
	while (manquants.length > 0 && dejaTentes.size < 400) {
		const jours = [...new Set([hier, ...manquants])].filter((jour) => !dejaTentes.has(jour));
		if (jours.length === 0) break;
		for (const jour of jours) {
			dejaTentes.add(jour);
			try {
				ancres.push(await ancrerJour({
					jour,
					fournisseur: options.fournisseur,
					verificateur: options.verificateur,
					dossier: options.dossier,
				}));
			} catch (erreur) {
				echecs.push({ jour, erreur: erreur instanceof Error ? erreur.message : String(erreur) });
			}
		}
		manquants = (await joursManquants(tailleLot)).filter((jour) => !dejaTentes.has(jour));
	}
	return { ancres, echecs, plusVieuxJourManquant: manquants.at(-1) ?? null };
}
