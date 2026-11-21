# Rejeu d'une période — `event_archive` → `event`

`scripts/rejeu-periode.mts` rejoue une période depuis l'archive longue vers la
projection `event`, en recalculant chaque rattachement avec le moteur courant,
et imprime le **diff nominatif** des rattachements changés.

## Ce que « rejouer » veut dire ici

L'archive (migration 028, table `event_archive`) garde volontairement le
minimum : identité (`dedup_key`), organisation au moment de la purge (`org_id`,
`org_name`, `org_kind`, `dept`), provenance, dates et confiance. Depuis la
migration 049, elle garde aussi les deux horloges (`valid_at` et `at`). Elle ne
garde ni titre ni résumé — c'est le compromis qui permet de conserver des années
sans stocker de corps de fuite.

Le rejeu ne reconstruit donc pas un article disparu. Il soumet au moteur courant
**le seul texte d'organisation que l'archive a conservé**, `org_name` (avec
`org.dept` en repli si le nom a été perdu). Le diff mesure : *pour ce même nom,
l'organisation choisie à la purge contre l'organisation choisie aujourd'hui*.
C'est une mesure de changement de décision, pas une vérité terrain sur
l'événement d'origine.

Le moteur est le chemin d'ingestion lui-même : `preparerGazetteer()` puis
`designateUneOrganisation()` (`apps/api/src/match/gazetteer.ts`), identifié
`gazetteer@4` par `MOTEURS.rattachement`. Aucune règle locale dans le script.

## Usage

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/rejeu-periode.mts \
  --depuis=2024-01-01 --jusqu-a=2025-01-01
```

- `--depuis` / `--jusqu-a` bornent la période sur `COALESCE(valid_at,
  observed_at, collected_at)`, la même horloge que `GET /api/history`.
  `--jusqua` est accepté comme alias. Au moins une borne est obligatoire ; une
  date illisible, une borne inversée ou égale sont refusées en code 1, avant
  toute écriture.
- Une période sans archive n'est pas une erreur : le script l'annonce, ne
  journalise rien et reste idempotent.
- `--dry-run` calcule et affiche le diff sans écrire.
- `--afficher=N` limite le diff affiché (`0` = tous, défaut). L'empreinte est
  calculée sur le diff entier, quel que soit le nombre de lignes affichées.
- `--mesurer-idempotence` rejoue deux fois de suite et compare les empreintes
  du diff et de la projection, ainsi que le nombre d'écritures de la seconde
  passe. Sort en code 1 si une différence apparaît.

## Écritures

La projection est écrite dans une transaction :

1. `INSERT … ON CONFLICT (dedup_key) DO NOTHING` recrée les événements purgés du
   brut. Les champs absents de l'archive (`title`, `evidence`, `geo_type`,
   `tlp`, `regional`, `created_at`) prennent leur valeur par défaut ; la
   provenance est posée dans `evidence` (`rejeu: event_archive`, ancien `org_id`
   et ancien nom). `title` reprend le nom archivé, ou la clé de dédup à défaut.
   `valid_at` et `at` sont repris de l'archive : une projection recréée n'a pas
   le droit de dater le fait du jour du rejeu.
2. `UPDATE event SET org_id = …` ne touche que les événements déjà présents,
   et seulement si le rattachement diffère. Le texte réellement collecté n'est
   jamais écrasé par une reconstruction.
3. Un fait `event.rattachement` est ajouté au journal (append-only) pour chaque
   décision qui n'est pas déjà le dernier fait connu du sujet. Le fait porte le
   moteur, le motif, l'alias, la confiance et l'ancien rattachement archivé.
   `valid_at` reprend la date de vérité archivée.

Deux rejeux de la même période sont donc idempotents : la seconde passe ne
trouve ni événement à insérer, ni `org_id` à changer, ni fait nouveau à
consigner. Les empreintes imprimées (`sha256/16` d'un JSON canonique trié par
`dedup_key`) permettent de comparer deux exécutions sans comparer les logs.

## Sortie

La sortie donne les volumes, le diff nominatif (`date`, `dedup_key`, ancien
nom et id, nouveau nom et id, nature du changement, motif et alias du moteur),
l'empreinte du diff, les écritures réelles et l'empreinte de la projection.
Les changements se classent en `nouveau` (archive sans organisation), `perdu`
(le moteur ne rattache plus) et `modifie` (organisation différente).

## Mesure

Exécuté par `apps/api/test/memoire-longue.test.ts` sur une archive témoin :
1 archive lue, 1 rattachement corrigé (`nouveau`), 1 événement inséré, 1 fait
journalisé, seconde passe à 0 écriture, `IDEMPOTENT : oui`. Sur l'archive où le
rattachement n'a pas changé : 1 archive lue, 1 rattachement identique, empreintes
du diff et de la projection égales entre les deux passes.
