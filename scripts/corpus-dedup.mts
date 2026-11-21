#!/usr/bin/env -S npx tsx
/**
 * Détection et fusion des incidents en double dans `bench/corpus/*.jsonl`.
 *
 * Deux incidents sont considérés comme le même fait dès que l'un des critères
 * coïncide (union-find : les chaînes A~B par organisation, B~C par URL forment
 * un seul groupe) :
 *   - organisation normalisée (NFKD, diacritiques et ponctuation retirés,
 *     casse ignorée) + mois. Les mois de `date_incident` ET de
 *     `date_publication` comptent : deux signalements du même fait publiés à
 *     cheval sur deux mois restent reconnus si leur date d'incident coïncide ;
 *   - URL canonique (schéma/hôte en minuscules, `www.` et slash final retirés,
 *     fragment ignoré, paramètres de suivi écartés, reste trié).
 *
 * Une ligne est un incident si elle porte une `organisation` (ou `organization`,
 * `org`) ; les autres lignes JSONL (sources, par exemple) sont ignorées et
 * laissées intactes. Les lignes invalides sont comptées et préservées.
 *
 * Survivant : première occurrence dans l'ordre (fichiers triés par nom, puis
 * lignes), donc stable. La fusion ne remplit que les champs absents ou vides
 * du survivant à partir des doublons ; les valeurs présentes ne sont jamais
 * écrasées. En mode `--appliquer`, seules les lignes concernées sont réécrites
 * et les doublons retirés, dans leur fichier d'origine.
 *
 * Usage :
 *   tsx scripts/corpus-dedup.mts                       # rapport, aucune écriture
 *   tsx scripts/corpus-dedup.mts --json=rapport.json   # rapport JSON sur disque
 *   tsx scripts/corpus-dedup.mts --appliquer           # fusionne les groupes
 *   tsx scripts/corpus-dedup.mts --dir /tmp/corpus --appliquer
 *
 * L'empreinte `bench/corpus/HASH` est recalculée après fusion du corpus réel.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { calculerHashCorpus } from "./corpus-hash.mjs";

export const CHEMIN_CORPUS = fileURLToPath(new URL("../bench/corpus/", import.meta.url));

type Critere = { type: "organisation_mois" | "url"; valeur: string };
type Membre = { fichier: string; ligne: number; id: string; organisation: string };

export type Groupe = {
  id: string;
  criteres: Critere[];
  membres: Membre[];
  survivant: Membre;
};

export type Rapport = {
  genereA: string;
  repertoire: string;
  fichiers: string[];
  lignes: number;
  incidents: number;
  lignesInvalides: number;
  groupes: Groupe[];
  lignesEnTrop: number;
  regles: { organisationEtMois: string; url: string; survivant: string };
  mode: "rapport" | "application";
};

type Incident = Membre & {
  index: number;
  donnees: Record<string, unknown>;
};

type Fichier = {
  chemin: string;
  nom: string;
  lignes: string[];
  finale: boolean;
};

type GroupeInterne = Groupe & { indexes: number[] };

export type Analyse = {
  rapport: Rapport;
  incidents: Incident[];
  groupes: GroupeInterne[];
  fichiers: Fichier[];
};

export type Options = {
  dir: string;
  appliquer: boolean;
  jsonStdout: boolean;
  jsonFichier: string | null;
};

/** Union-find : une même ligne peut appartenir à plusieurs clés (organisation/mois, URL). */
class UnionFind {
  private readonly parent = new Map<number, number>();

  ajouter(id: number): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  trouver(id: number): number {
    let racine = id;
    while (this.parent.get(racine) !== racine) racine = this.parent.get(racine)!;
    while (this.parent.get(id) !== id) {
      const suivant = this.parent.get(id)!;
      this.parent.set(id, racine);
      id = suivant;
    }
    return racine;
  }

  unir(a: number, b: number): void {
    const ra = this.trouver(a);
    const rb = this.trouver(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function usage(): string {
  return [
    "Usage : tsx scripts/corpus-dedup.mts [--appliquer] [--dir <dossier>]",
    "  défaut       : rapport humain, aucune écriture",
    "  --appliquer  : retire les doublons et fusionne les champs manquants",
    "  --dir        : dossier à analyser au lieu de bench/corpus",
    "  --json       : rapport JSON sur stdout",
    "  --json=<fichier> : rapport JSON écrit dans un fichier",
  ].join("\n");
}

export function analyserArgs(argv: string[]): Options {
  const options: Options = {
    dir: CHEMIN_CORPUS,
    appliquer: false,
    jsonStdout: false,
    jsonFichier: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--appliquer" || arg === "--apply") options.appliquer = true;
    else if (arg === "--dir") {
      const valeur = argv[i + 1];
      if (valeur === undefined || valeur.startsWith("--")) throw new Error("--dir attend un dossier");
      options.dir = resolve(valeur);
      i++;
    } else if (arg === "--json") options.jsonStdout = true;
    else if (arg.startsWith("--json=")) {
      const chemin = arg.slice("--json=".length);
      if (!chemin) throw new Error("--json= attend un chemin de fichier");
      options.jsonFichier = chemin;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else throw new Error(`argument inconnu : ${arg}`);
  }
  if (options.jsonStdout && options.jsonFichier !== null) {
    throw new Error("--json et --json=<fichier> sont exclusifs");
  }
  return options;
}

function texte(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye === "" ? null : nettoye;
}

function normaliserOrganisation(valeur: string): string {
  return valeur
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function mois(valeur: unknown): string | null {
  const chaine = texte(valeur);
  if (chaine === null) return null;
  const correspondance = /^(\d{4})-(\d{2})(?:-|$)/.exec(chaine);
  if (correspondance === null) return null;
  const numero = Number(correspondance[2]);
  if (numero < 1 || numero > 12) return null;
  return `${correspondance[1]}-${correspondance[2]}`;
}

function moisCandidats(donnees: Record<string, unknown>): string[] {
  const trouves = new Set<string>();
  for (const champ of ["date_incident", "date_publication", "date"]) {
    const valeur = mois(donnees[champ]);
    if (valeur !== null) trouves.add(valeur);
  }
  return [...trouves].sort();
}

function normaliserUrl(valeur: string): string | null {
  const brut = valeur.trim();
  if (brut === "") return null;
  try {
    const url = new URL(brut);
    if (url.protocol !== "http:" && url.protocol !== "https:") return brut.toLowerCase();
    const hote = url.hostname.toLowerCase().replace(/^www\./, "");
    const chemin = url.pathname.replace(/\/+$/, "") || "/";
    const params = [...url.searchParams.entries()]
      .filter(([cle]) => !/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(cle))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cle, valeur]) => `${encodeURIComponent(cle)}=${encodeURIComponent(valeur)}`);
    const recherche = params.length === 0 ? "" : `?${params.join("&")}`;
    return `${url.protocol}//${hote}${url.port === "" ? "" : `:${url.port}`}${chemin}${recherche}`;
  } catch {
    return brut.toLowerCase();
  }
}

function lireFichiers(dir: string): Fichier[] {
  const noms = readdirSync(dir, { withFileTypes: true })
    .filter((entree) => entree.isFile() && entree.name.endsWith(".jsonl"))
    .map((entree) => entree.name)
    .sort();
  return noms.map((nom) => {
    const chemin = join(dir, nom);
    const contenu = readFileSync(chemin, "utf8");
    const morceaux = contenu.split("\n");
    const finale = morceaux[morceaux.length - 1] === "";
    if (finale) morceaux.pop();
    return {
      chemin,
      nom,
      lignes: morceaux.map((ligne) => (ligne.endsWith("\r") ? ligne.slice(0, -1) : ligne)),
      finale,
    };
  });
}

export function analyserCorpus(dir: string): Analyse {
  const fichiers = lireFichiers(dir);
  const incidents: Incident[] = [];
  const union = new UnionFind();
  const liens: { a: number; b: number; critere: Critere }[] = [];
  const parOrganisationMois = new Map<string, number>();
  const parUrl = new Map<string, number>();
  let lignes = 0;
  let lignesInvalides = 0;

  for (const fichier of fichiers) {
    for (let i = 0; i < fichier.lignes.length; i++) {
      const brut = fichier.lignes[i];
      const contenu = brut.replace(/^\uFEFF/, "").trim();
      if (contenu === "" || contenu.startsWith("#")) continue;
      lignes++;

      let objet: unknown;
      try {
        objet = JSON.parse(contenu);
      } catch {
        lignesInvalides++;
        continue;
      }
      if (objet === null || typeof objet !== "object" || Array.isArray(objet)) {
        lignesInvalides++;
        continue;
      }
      const donnees = objet as Record<string, unknown>;
      const organisation = texte(donnees.organisation ?? donnees.organization ?? donnees.org);
      if (organisation === null) continue; // pas un incident (source, etc.)

      const index = incidents.length;
      union.ajouter(index);
      incidents.push({
        index,
        fichier: fichier.nom,
        ligne: i + 1,
        id: texte(donnees.id) ?? `${fichier.nom}:${i + 1}`,
        organisation,
        donnees,
      });

      const cleOrganisation = normaliserOrganisation(organisation);
      for (const moisIncident of moisCandidats(donnees)) {
        const cle = `organisation_mois:${cleOrganisation}|${moisIncident}`;
        const precedent = parOrganisationMois.get(cle);
        if (precedent === undefined) parOrganisationMois.set(cle, index);
        else {
          liens.push({ a: precedent, b: index, critere: { type: "organisation_mois", valeur: `${cleOrganisation}|${moisIncident}` } });
          union.unir(precedent, index);
        }
      }

      const url = texte(donnees.url);
      if (url !== null) {
        const cleUrl = normaliserUrl(url);
        if (cleUrl !== null) {
          const precedent = parUrl.get(cleUrl);
          if (precedent === undefined) parUrl.set(cleUrl, index);
          else {
            liens.push({ a: precedent, b: index, critere: { type: "url", valeur: cleUrl } });
            union.unir(precedent, index);
          }
        }
      }
    }
  }

  const parRacine = new Map<number, number[]>();
  for (const incident of incidents) {
    const racine = union.trouver(incident.index);
    const membres = parRacine.get(racine);
    if (membres === undefined) parRacine.set(racine, [incident.index]);
    else membres.push(incident.index);
  }
  const criteresParRacine = new Map<number, Map<string, Critere>>();
  for (const lien of liens) {
    const racine = union.trouver(lien.a);
    let criteres = criteresParRacine.get(racine);
    if (criteres === undefined) {
      criteres = new Map<string, Critere>();
      criteresParRacine.set(racine, criteres);
    }
    criteres.set(`${lien.critere.type}:${lien.critere.valeur}`, lien.critere);
  }

  const groupes: GroupeInterne[] = [];
  for (const [racine, indexes] of parRacine) {
    if (indexes.length < 2) continue;
    const membres = indexes.map((index) => incidents[index]);
    const criteres = [...(criteresParRacine.get(racine)?.values() ?? [])].sort(
      (a, b) => a.type.localeCompare(b.type) || a.valeur.localeCompare(b.valeur),
    );
    const empreinte = createHash("sha256").update(indexes.join(",")).digest("hex").slice(0, 8);
    const membresRapport = membres.map((membre) => ({
      fichier: membre.fichier,
      ligne: membre.ligne,
      id: membre.id,
      organisation: membre.organisation,
    }));
    groupes.push({
      id: `g-${indexes[0] + 1}-${empreinte}`,
      criteres,
      membres: membresRapport,
      survivant: membresRapport[0],
      indexes,
    });
  }
  groupes.sort((a, b) => a.indexes[0] - b.indexes[0]);

  const rapport: Rapport = {
    genereA: new Date().toISOString(),
    repertoire: dir,
    fichiers: fichiers.map((fichier) => fichier.nom),
    lignes,
    incidents: incidents.length,
    lignesInvalides,
    groupes: groupes.map(({ id, criteres, membres, survivant }) => ({ id, criteres, membres, survivant })),
    lignesEnTrop: groupes.reduce((total, groupe) => total + groupe.indexes.length - 1, 0),
    regles: {
      organisationEtMois:
        "organisation normalisée (NFKD, sans diacritiques ni ponctuation) + mois de date_incident ou date_publication",
      url: "URL canonique (hote/www/slash/fragment/params de suivi normalisés)",
      survivant: "première occurrence par ordre de fichier puis de ligne",
    },
    mode: "rapport",
  };
  return { rapport, incidents, groupes, fichiers };
}

function estVide(valeur: unknown): boolean {
  return (
    valeur === null ||
    valeur === undefined ||
    (typeof valeur === "string" && valeur.trim() === "") ||
    (Array.isArray(valeur) && valeur.length === 0)
  );
}

/** Champs absents ou vides du survivant complétés par les doublons, sans écraser ses valeurs. */
function fusionnerDonnees(incidents: Incident[]): Record<string, unknown> | null {
  const base = { ...incidents[0].donnees };
  let modifie = false;
  for (const incident of incidents.slice(1)) {
    for (const [cle, valeur] of Object.entries(incident.donnees)) {
      if ((!(cle in base) || estVide(base[cle])) && !estVide(valeur)) {
        base[cle] = valeur;
        modifie = true;
      }
    }
  }
  return modifie ? base : null;
}

export function appliquer(analyse: Analyse): { fichiersModifies: string[]; lignesSupprimees: number } {
  const retraits = new Map<string, Set<number>>();
  const remplacements = new Map<string, Map<number, string>>();
  let lignesSupprimees = 0;

  for (const groupe of analyse.groupes) {
    const membres = groupe.indexes.map((index) => analyse.incidents[index]);
    const fusion = fusionnerDonnees(membres);
    if (fusion !== null) {
      const survivant = membres[0];
      let parFichier = remplacements.get(survivant.fichier);
      if (parFichier === undefined) {
        parFichier = new Map<number, string>();
        remplacements.set(survivant.fichier, parFichier);
      }
      parFichier.set(survivant.ligne, JSON.stringify(fusion));
    }
    for (const doublon of membres.slice(1)) {
      let numeros = retraits.get(doublon.fichier);
      if (numeros === undefined) {
        numeros = new Set<number>();
        retraits.set(doublon.fichier, numeros);
      }
      numeros.add(doublon.ligne);
      lignesSupprimees++;
    }
  }

  const fichiersModifies: string[] = [];
  for (const fichier of analyse.fichiers) {
    const aRetirer = retraits.get(fichier.nom);
    const aRemplacer = remplacements.get(fichier.nom);
    if (aRetirer === undefined && aRemplacer === undefined) continue;
    const sortie: string[] = [];
    for (let i = 0; i < fichier.lignes.length; i++) {
      const numero = i + 1;
      if (aRetirer?.has(numero) === true) continue;
      sortie.push(aRemplacer?.get(numero) ?? fichier.lignes[i]);
    }
    writeFileSync(fichier.chemin, sortie.join("\n") + (fichier.finale ? "\n" : ""), "utf8");
    fichiersModifies.push(fichier.nom);
  }
  return { fichiersModifies, lignesSupprimees };
}

export function formaterRapport(rapport: Rapport): string {
  const lignes = [
    `${rapport.mode === "application" ? "APPLICATION" : "RAPPORT (aucune écriture)"} — corpus-dedup`,
    `répertoire : ${rapport.repertoire}`,
    `${rapport.fichiers.length} fichier(s) · ${rapport.lignes} ligne(s) · ${rapport.incidents} incident(s) · ${rapport.lignesInvalides} ligne(s) invalide(s)`,
    `règles : ${rapport.regles.organisationEtMois} OU ${rapport.regles.url}`,
    `${rapport.groupes.length} groupe(s) · ${rapport.lignesEnTrop} ligne(s) en trop`,
  ];
  for (const groupe of rapport.groupes) {
    lignes.push(
      "",
      `${groupe.id} — ${groupe.membres.length} lignes [${groupe.criteres.map((critere) => `${critere.type}:${critere.valeur}`).join(", ")}]`,
      `  conservée : ${groupe.survivant.fichier}:${groupe.survivant.ligne} (${groupe.survivant.id})`,
    );
    for (const membre of groupe.membres) {
      if (membre === groupe.survivant) continue;
      lignes.push(`  doublon   : ${membre.fichier}:${membre.ligne} (${membre.id})`);
    }
  }
  if (rapport.mode === "rapport" && rapport.lignesEnTrop > 0) {
    lignes.push("", `Relancer avec --appliquer pour fusionner ${rapport.lignesEnTrop} ligne(s).`);
  }
  return `${lignes.join("\n")}\n`;
}

async function main(): Promise<void> {
  const options = analyserArgs(process.argv.slice(2));
  const analyse = analyserCorpus(options.dir);
  if (options.appliquer) analyse.rapport.mode = "application";
  process.stdout.write(formaterRapport(analyse.rapport));

  if (options.appliquer) {
    const resultat = appliquer(analyse);
    process.stdout.write(
      `\n${resultat.lignesSupprimees} ligne(s) supprimée(s) dans ${resultat.fichiersModifies.length} fichier(s) : ${resultat.fichiersModifies.join(", ") || "aucun"}.\n`,
    );
    if (resultat.lignesSupprimees > 0 && resolve(options.dir) === resolve(CHEMIN_CORPUS)) {
      const hash = calculerHashCorpus();
      writeFileSync(join(CHEMIN_CORPUS, "HASH"), `${hash}\n`, "utf8");
      process.stdout.write(`Empreinte du corpus recalculée : ${hash}\n`);
    }
  } else if (analyse.rapport.lignesEnTrop === 0) {
    process.stdout.write("\nAucun doublon détecté : aucune écriture.\n");
  }

  if (options.jsonStdout || options.jsonFichier !== null) {
    const json = `${JSON.stringify(analyse.rapport, null, 2)}\n`;
    if (options.jsonStdout) process.stdout.write(json);
    else if (options.jsonFichier !== null) writeFileSync(options.jsonFichier, json, "utf8");
  }
}

function estLanceDirectement(): boolean {
  const entre = process.argv[1];
  return entre !== undefined && import.meta.url === pathToFileURL(entre).href;
}

if (estLanceDirectement()) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`corpus-dedup: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
