# Ancrage quotidien du journal de vérité

Un journal append-only ne suffit pas à prouver qu'une décision existait déjà
le jour qu'elle déclare : une projection peut être corrigée après coup. Chaque
jour UTC est donc scellé par trois objets concordants :

1. une ligne de `journal_anchor` (table immuable, migration `201`) ;
2. un fichier `journal/journal_root_AAAA-MM-JJ.json` publié ;
3. un jeton temporel **RFC 3161** obtenu auprès d'une TSA, dont le
   `messageImprint` couvre l'empreinte SHA-256 de la racine.

## Ce qui est ancré

Le « jour » est le jour UTC de `recorded_at` (horloge de connaissance), pas de
`valid_at` (date de validité, souvent rétroactive). Une décision du 3 novembre
sue le 3 novembre est ancrée le 3 novembre, même si sa projection est corrigée
le 4.

La racine est un arbre de hachage binaire calculé par
`apps/api/src/journal/merkle.ts` sur les lignes du journal d'id croissant,
entre `journal_debut_id` et `journal_fin_id`. Chaque feuille contient les huit
champs canoniques de la ligne (dont les deux horloges) sérialisés avec des clés
triées : le résultat ne dépend ni du moteur PostgreSQL, ni de l'ordre des clés
JSON, ni du fuseau du processus.

Les bornes d'id sont enregistrées : une ligne ajoutée plus tard avec un
`recorded_at` rétroactif ne change pas la racine déjà publiée. La ligne
`journal_anchor` ne peut être ni modifiée ni supprimée (trigger DB).

## Fonctionnement

- Au démarrage de l'API, puis toutes les 24 h, `ancrerJournalDuJour()` ancre
  la veille (`current_date - 1` côté base) et rattrape jusqu'à sept jours
  laissés nus par un arrêt. `RADAR_ANCRAGE_JOURNAL=0` coupe ce déclenchement ;
  `RADAR_TSA_URL` choisit la TSA (défaut `https://freetsa.org/tsr`).
- Un second passage sur le même jour ne réécrit pas l'ancrage : il recompute
  la racine, vérifie le jeton et republie le fichier s'il manque. Une racine
  divergente fait échouer le passage au lieu de remplacer la preuve.
- Aucun secret n'est stocké : seul le certificat **public** de la TSA est joint
  au fichier. Aucune donnée personnelle n'entre dans la feuille de hachage.

## Commandes

```sh
pnpm journal:anchor                        # ancre la veille
pnpm journal:anchor --jour 2026-11-03     # ancre/rejoue un jour précis
pnpm journal:anchor --all --limite 30     # comble les jours manquants
pnpm journal:anchor:check --jour 2026-11-03
```

`--check` ne écrit rien : il relit les lignes, recalcule la racine, vérifie le
jeton et le fichier, puis exécute le critère SQL du juge externe :

```sql
SELECT count(*) FROM journal_anchor WHERE jour=current_date-1 AND (racine_sha256 IS NULL OR token_rfc3161 IS NULL OR journal_debut_id IS NULL OR journal_fin_id IS NULL);
```

La table ayant des colonnes `NOT NULL`, un `0` signifie « aucun ancrage
incomplet pour la veille ». Pour éviter qu'un `0` vide ne masque une absence
d'ancrage, le test `apps/api/test/journal-anchor.test.ts` vérifie aussi
qu'une ligne existe réellement pour la veille.
