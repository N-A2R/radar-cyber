#!/usr/bin/env -S npx tsx
/**
 * Détection et fusion contrôlée des organisations en doublon.
 *
 * Deux critères, appliqués avec les fonctions du dépôt (aucune règle parallèle) :
 *   - nom normalisé par `normalize()` (apps/api/src/match/core.ts) ;
 *   - domaine normalisé par `normalizeDomainValue()` (apps/api/src/match/domaine.ts).
 * Les clés vides ou invalides sont ignorées. Un même groupe peut être formé par
 * l'un ou l'autre critère : les paires sont réunies par union-find, ce qui
 * clôture les chaînes A~B (nom), B~C (domaine) → {A, B, C}.
 *
 * Survivant : le **plus petit id** du groupe. `org.id` est une clé primaire
 * sérielle : c'est l'enregistrement le plus ancien, et ce choix est stable,
 * déterministe et reproductible d'une exécution à l'autre (contrairement à un
 * score de complétude, qui change dès qu'une fiche est enrichie). Toutes les
 * autres lignes du groupe sont supprimées après réaffectation.
 *
 * Dépendances réaffectées, dans une seule transaction (ROLLBACK sur erreur) :
 *   - org_alias.org_id       (FK CASCADE ; conflits (org_id, alias) ignorés,
 *                             l'alias existe déjà chez le survivant) ;
 *   - event.org_id           (FK SET NULL) ;
 *   - asset.org_id           (FK CASCADE ; UNIQUE (org_id, kind, value)) ;
 *   - event.asset_id         (remappé vers l'actif équivalent du survivant) ;
 *   - org_history.org_id     (FK CASCADE) ;
 *   - org.parent_org_id      (FK SET NULL sur org elle-même) ;
 *   - alert.org_id           (pas de FK déclarée, mais référence logique) ;
 *   - journal                (fait d'audit `org.fusion`, append-only).
 * `event_archive.org_id` n'est PAS réécrit : c'est un état historique figé.
 * `relation` et `journal.subject` stockent des ids sous forme texte, sans FK :
 * ils ne sont pas réécrits non plus (leur sujet reste l'identité d'origine).
 *
 * Sécurité : rapport JSON sur stdout par défaut, aucune écriture en base. La fusion exige
 *   `--appliquer --groupe=<id>` (un seul groupe, id tiré du rapport)
 *   ou `--appliquer --confirmer=TOUS` (confirmation explicite de tous).
 *
 * Prérequis : migrations 011 (alert), 014a/016 (org_alias), 027 (journal),
 * 030 (org_alias.valid_from/valid_to, org_history).
 *
 * Usage :
 *   pnpm -F @radar/api exec tsx ../../scripts/doublons-orgs.mts
 *   pnpm -F @radar/api exec tsx ../../scripts/doublons-orgs.mts --json
 *   pnpm -F @radar/api exec tsx ../../scripts/doublons-orgs.mts --json=bench/results/doublons-orgs.json
 *   pnpm -F @radar/api exec tsx ../../scripts/doublons-orgs.mts --appliquer --groupe=g-123-abcd
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PoolClient } from "pg";
import { closePools, pool, withTransaction } from "../apps/api/src/db.js";
import { normalize } from "../apps/api/src/match/core.js";
import { normalizeDomainValue } from "../apps/api/src/match/domaine.js";

type Critere = { type: "nom" | "domaine"; valeur: string };
type Lien = { a: number; b: number; critere: Critere };

type LigneOrg = { id: number; name: string; domain: string | null };

type OrgDetail = {
  id: number;
  name: string;
  slug: string;
  domain: string | null;
  kind: string;
  status: string;
  creeA: string;
  alias: number;
  evenements: number;
  actifs: number;
  historique: number;
  alertes: number;
  enfants: number;
};

type GroupeDetecte = { id: string; taille: number; ids: number[]; criteres: Critere[] };
type Groupe = GroupeDetecte & { survivant: OrgDetail; doublons: OrgDetail[] };

type Options = {
  appliquer: boolean;
  groupe: string | null;
  confirmerTous: boolean;
  jsonStdout: boolean;
  jsonFichier: string | null;
};

type Rapport = {
  genereA: string;
  totalOrganisations: number;
  nombreGroupes: number;
  organisationsConcernées: number;
  mode: "rapport" | "application";
  groupesFusionnes: string[];
  regles: {
    nom: string;
    domaine: string;
    unionFind: boolean;
    survivant: string;
  };
  groupes: Groupe[];
};

function usage(): never {
  console.error(
    [
      "usage : tsx scripts/doublons-orgs.mts",
      "  [--json] [--json=<fichier>] [--groupe=<id-groupe>]",
      "  [--appliquer (--groupe=<id-groupe> | --confirmer=TOUS)]",
      "",
      "Par défaut : rapport JSON sur stdout (logs sur stderr), aucune écriture.",
    ].join("\n"),
  );
  process.exit(2);
}

function analyserArgs(argv: string[]): Options {
  const options: Options = {
    appliquer: false,
    groupe: null,
    confirmerTous: false,
    jsonStdout: false,
    jsonFichier: null,
  };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") usage();
    else if (arg === "--appliquer") options.appliquer = true;
    else if (arg === "--json") options.jsonStdout = true;
    else if (arg.startsWith("--json=")) {
      const chemin = arg.slice("--json=".length);
      if (!chemin) throw new Error("--json= attend un chemin de fichier");
      options.jsonFichier = chemin;
    } else if (arg.startsWith("--groupe=")) {
      const id = arg.slice("--groupe=".length);
      if (!id) throw new Error("--groupe= attend un identifiant de groupe");
      options.groupe = id;
    } else if (arg === "--confirmer=TOUS") options.confirmerTous = true;
    else throw new Error(`argument inconnu : ${arg}`);
  }
  if (options.jsonStdout && options.jsonFichier !== null) {
    throw new Error("--json et --json=<fichier> sont exclusifs");
  }
  if (options.appliquer && !options.groupe && !options.confirmerTous) {
    throw new Error("--appliquer exige --groupe=<id> ou --confirmer=TOUS (aucune fusion globale implicite)");
  }
  if (options.confirmerTous && !options.appliquer) {
    throw new Error("--confirmer=TOUS n'a de sens qu'avec --appliquer");
  }
  return options;
}

/** Union-find sur les ids : permet de clore les chaînes nom → domaine → nom. */
class UnionFind {
  private readonly parent = new Map<number, number>();
  private readonly taille = new Map<number, number>();

  ajouter(id: number): void {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
      this.taille.set(id, 1);
    }
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
    if (ra === rb) return;
    const sa = this.taille.get(ra) ?? 1;
    const sb = this.taille.get(rb) ?? 1;
    const [petit, grand] = sa < sb ? [ra, rb] : [rb, ra];
    this.parent.set(petit, grand);
    this.taille.set(grand, sa + sb);
  }

  ids(): IterableIterator<number> {
    return this.parent.keys();
  }
}

/**
 * Parcours streaming : 1,6 M organisations tiennent mal dans un `pool.query`
 * qui matérialise toutes les lignes. Un `SET LOCAL statement_timeout = 0`
 * évite que le scan dépasse le timeout usuel de 15 s du pool API.
 */
async function detecter(): Promise<{ total: number; groupes: GroupeDetecte[] }> {
  const union = new UnionFind();
  const premierNom = new Map<string, number>();
  const premierDomaine = new Map<string, number>();
  const liens: Lien[] = [];
  let total = 0;

  await withTransaction(async (client) => {
    await client.query("SET LOCAL statement_timeout = 0");
    await client.query("DECLARE doublons_orgs_cur CURSOR FOR SELECT id, name, domain FROM org ORDER BY id");
    try {
      // Curseur serveur : au plus 50 000 lignes en mémoire, quel que soit le
      // volume (1,6 M organisations), et sans import runtime de `pg` ici.
      while (true) {
        const { rows } = await client.query<LigneOrg>("FETCH 50000 FROM doublons_orgs_cur");
        if (rows.length === 0) break;
        for (const ligne of rows) {
          total += 1;
          union.ajouter(ligne.id);

          const nom = normalize(ligne.name);
          if (nom !== "") {
            const premier = premierNom.get(nom);
            if (premier === undefined) premierNom.set(nom, ligne.id);
            else {
              liens.push({ a: premier, b: ligne.id, critere: { type: "nom", valeur: nom } });
              union.unir(ligne.id, premier);
            }
          }

          const domaine = normalizeDomainValue(ligne.domain);
          if (domaine !== null && domaine !== "") {
            const premier = premierDomaine.get(domaine);
            if (premier === undefined) premierDomaine.set(domaine, ligne.id);
            else {
              liens.push({ a: premier, b: ligne.id, critere: { type: "domaine", valeur: domaine } });
              union.unir(ligne.id, premier);
            }
          }
        }
      }
    } finally {
      await client.query("CLOSE doublons_orgs_cur").catch(() => {});
    }
  });

  const parRacine = new Map<number, number[]>();
  for (const id of union.ids()) {
    const racine = union.trouver(id);
    const membres = parRacine.get(racine);
    if (membres) membres.push(id);
    else parRacine.set(racine, [id]);
  }

  // Un seul passage sur les liens, indexés par racine : O(nombre de liens)
  // au total, au lieu de O(groupes × liens). La clôture union-find garantit
  // que les deux extrémités d'un lien ont déjà la même racine.
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

  const groupes: GroupeDetecte[] = [];
  for (const [racine, membres] of parRacine) {
    if (membres.length < 2) continue;
    const ids = membres.sort((a, b) => a - b);
    const criteres = criteresParRacine.get(racine);
    const empreinte = createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 10);
    groupes.push({
      id: `g-${ids[0]}-${empreinte}`,
      taille: ids.length,
      ids,
      criteres: [...(criteres?.values() ?? [])].sort(
        (a, b) => a.type.localeCompare(b.type) || a.valeur.localeCompare(b.valeur),
      ),
    });
  }
  groupes.sort((a, b) => b.ids.length - a.ids.length || a.ids[0] - b.ids[0]);
  return { total, groupes };
}

function tranches<T>(elements: T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < elements.length; i += taille) lots.push(elements.slice(i, i + taille));
  return lots;
}

/** Détails et volumes des dépendances, uniquement pour les ids en doublon. */
async function chargerDetails(ids: number[]): Promise<Map<number, OrgDetail>> {
  const details = new Map<number, OrgDetail>();
  for (const lot of tranches(ids, 5_000)) {
    const { rows } = await pool.query<OrgDetail>(
      `SELECT o.id, o.name, o.slug, o.domain, o.kind, o.status, o.created_at::text AS "creeA",
              (SELECT count(*) FROM org_alias a WHERE a.org_id = o.id)::int AS alias,
              (SELECT count(*) FROM event e WHERE e.org_id = o.id)::int AS evenements,
              (SELECT count(*) FROM asset a WHERE a.org_id = o.id)::int AS actifs,
              (SELECT count(*) FROM org_history h WHERE h.org_id = o.id)::int AS historique,
              (SELECT count(*) FROM alert x WHERE x.org_id = o.id)::int AS alertes,
              (SELECT count(*) FROM org c WHERE c.parent_org_id = o.id)::int AS enfants
         FROM org o
        WHERE o.id = ANY($1::int[])
        ORDER BY o.id`,
      [lot],
    );
    for (const ligne of rows) details.set(ligne.id, ligne);
  }
  return details;
}

/** Une fusion = une transaction ; toute erreur annule toutes les réaffectations. */
async function fusionner(client: PoolClient, groupe: Groupe): Promise<void> {
  const survivant = groupe.survivant.id;
  const doublons = groupe.doublons.map((org) => org.id);

  const { rows } = await client.query<{ id: number }>(
    "SELECT id FROM org WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE",
    [[survivant, ...doublons]],
  );
  const presents = new Set(rows.map((ligne) => ligne.id));
  if (!presents.has(survivant) || doublons.some((id) => !presents.has(id))) {
    throw new Error(`groupe ${groupe.id} : une organisation a disparu depuis le rapport`);
  }

  for (const id of doublons) {
    // Alias : ON CONFLIT = l'alias existe déjà chez le survivant, on garde
    // celui du survivant et on supprime seulement la ligne redondante.
    await client.query(
      `INSERT INTO org_alias (org_id, alias, source, valid_from, valid_to)
       SELECT $1, a.alias, a.source, a.valid_from, a.valid_to
         FROM org_alias a WHERE a.org_id = $2
       ON CONFLICT (org_id, alias) DO NOTHING`,
      [survivant, id],
    );
    await client.query("DELETE FROM org_alias WHERE org_id = $1", [id]);

    // Événements et alertes : simple changement de clé étrangère.
    await client.query("UPDATE event SET org_id = $1 WHERE org_id = $2", [survivant, id]);
    await client.query("UPDATE alert SET org_id = $1 WHERE org_id = $2", [survivant, id]);
    await client.query("UPDATE org_history SET org_id = $1 WHERE org_id = $2", [survivant, id]);

    // parent_org_id est une auto-FK : éviter de créer un cycle survivant→survivant.
    await client.query("UPDATE org SET parent_org_id = NULL WHERE id = $1 AND parent_org_id = $2", [
      survivant,
      id,
    ]);
    await client.query("UPDATE org SET parent_org_id = $1 WHERE parent_org_id = $2", [survivant, id]);

    // Actifs : on déplace ceux qui n'existent pas déjà chez le survivant, puis
    // on remappe les événements qui pointaient sur les actifs confondus avant
    // de supprimer ces derniers (le ON DELETE SET NULL ne doit rien effacer).
    await client.query(
      `UPDATE asset a SET org_id = $1
        WHERE a.org_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM asset c
             WHERE c.org_id = $1 AND c.kind = a.kind AND c.value = a.value
          )`,
      [survivant, id],
    );
    await client.query(
      `UPDATE event e SET asset_id = c.id
         FROM asset s
         JOIN asset c ON c.org_id = $1 AND c.kind = s.kind AND c.value = s.value
        WHERE e.asset_id = s.id AND s.org_id = $2 AND c.id <> s.id`,
      [survivant, id],
    );
    await client.query("DELETE FROM asset WHERE org_id = $1", [id]);

    await client.query("DELETE FROM org WHERE id = $1", [id]);
    await client.query(
      `INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
       VALUES ('org.fusion', $1, $2, $3::jsonb, 'humain:doublons-orgs', now())`,
      [
        String(survivant),
        `fusion du doublon #${id} dans l'organisation #${survivant}`,
        JSON.stringify({
          groupe: groupe.id,
          doublon: id,
          survivant,
          criteres: groupe.criteres,
          doublons: groupe.doublons.map((org) => org.id),
        }),
      ],
    );
  }
}

async function main(): Promise<void> {
  const options = analyserArgs(process.argv.slice(2));
  const journal = (message: string): void => {
    console.error(`[doublons-orgs] ${message}`);
  };

  journal("analyse des organisations (nom normalisé + domaine, union-find)…");
  const detecte = await detecter();
  journal(`${detecte.total.toLocaleString("fr-FR")} organisations lues`);

  const ids = detecte.groupes.flatMap((groupe) => groupe.ids);
  const details = await chargerDetails(ids);
  const groupes: Groupe[] = [];
  for (const groupe of detecte.groupes) {
    const survivant = details.get(groupe.ids[0]);
    if (!survivant) throw new Error(`groupe ${groupe.id} : survivant #${groupe.ids[0]} introuvable`);
    const doublons = groupe.ids.slice(1).map((id) => {
      const org = details.get(id);
      if (!org) throw new Error(`groupe ${groupe.id} : doublon #${id} introuvable`);
      return org;
    });
    groupes.push({ ...groupe, survivant, doublons });
  }

  journal(
    `${groupes.length} groupe(s) de doublons, ${ids.length.toLocaleString("fr-FR")} organisation(s) concernée(s)`,
  );
  for (const groupe of groupes.slice(0, 20)) {
    journal(
      `  ${groupe.id}  ${groupe.taille} orgs  survivant #${groupe.survivant.id}` +
        `  [${groupe.criteres.map((c) => `${c.type}:${c.valeur}`).join(", ")}]`,
    );
  }
  if (groupes.length > 20) journal(`  … ${groupes.length - 20} autre(s) groupe(s) dans le JSON`);

  const cibles = options.confirmerTous
    ? groupes
    : options.groupe
      ? groupes.filter((groupe) => groupe.id === options.groupe)
      : [];
  if (options.groupe && cibles.length === 0) {
    throw new Error(`groupe « ${options.groupe} » introuvable dans le rapport`);
  }

  const groupesFusionnes: string[] = [];
  if (options.appliquer) {
    await withTransaction(async (client) => {
      for (const groupe of cibles) {
        await fusionner(client, groupe);
        groupesFusionnes.push(groupe.id);
      }
    });
    journal(`${groupesFusionnes.length} groupe(s) fusionné(s) dans une seule transaction`);
  } else {
    journal("mode rapport : aucune écriture. --appliquer --groupe=<id> pour fusionner un groupe.");
  }

  const rapport: Rapport = {
    genereA: new Date().toISOString(),
    totalOrganisations: detecte.total,
    nombreGroupes: groupes.length,
    organisationsConcernées: ids.length,
    mode: options.appliquer ? "application" : "rapport",
    groupesFusionnes,
    regles: {
      nom: "normalize() — apps/api/src/match/core.ts",
      domaine: "normalizeDomainValue() — apps/api/src/match/domaine.ts",
      unionFind: true,
      survivant: "plus petit org.id du groupe (le plus ancien, choix stable)",
    },
    groupes,
  };

  const json = `${JSON.stringify(rapport, null, 2)}\n`;
  if (options.jsonFichier) {
    const chemin = resolve(options.jsonFichier);
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, json, "utf8");
    journal(`rapport JSON écrit : ${chemin}`);
  } else {
    // `--json` est accepté comme synonyme explicite de ce comportement par défaut.
    process.stdout.write(json);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
