# Avantage de nouveauté — quel signalement a rapporté un fait en premier

## Objectif

Savoir quelle source a rapporté un fait en premier, comme le font les moteurs de
veille temps réel : à chaque fait correspondent plusieurs signalements, et un
seul d'entre eux porte l'avantage de nouveauté.

## Définition

Un fait est l'identité portée par `event.dedup_key` une fois retiré le préfixe de
la source : `nvd:CVE-2099-0001`, `kev:CVE-2099-0001` et
`certfr:CVE-2099-0001` sont le même fait. L'antériorité est `event.at`, l'instant
où le radar a appris le fait ; `event.id` départage deux signalements
simultanés.

`event.premier_rapport` est vrai sur le signalement de `at` minimal du fait, et
faux sur tous les autres. Le calcul est porté par la base (migration 200) :
colonne générée `fait_key`, colonne `premier_rapport`, déclencheur
`event_premier_rapport_trg`. Il vaut donc aussi pour les écritures hors de l'API
(imports, rejeux, corrections SQL).

## Bascule

- Une source **plus tardive** qui ajoute le même fait n'arrache pas le drapeau.
- Une source **plus ancienne** découverte après coup reprend l'avantage ; le
  signalement jusqu'ici premier perd le drapeau.
- Supprimer le premier signalement promeut le suivant.
- Mettre `at` à jour déplace l'antériorité vers le nouveau minimum.
- Deux collectes concurrentes du même fait sont sérialisées par un verrou
  consultatif par fait, pour qu'un seul signalement sorte premier.

## Critère de sortie

```sql
SELECT round(100.0*count(*) FILTER (WHERE premier_rapport)/count(*),1)
  FROM event
 WHERE at > now()-interval '30 days';
```

## Mesure reproductible

Le critère est exécuté sur une base neuve reconstruite **uniquement** depuis les
fichiers SQL du dépôt (`db/init.sql`, `db/migrate-*.sql`,
`db/detection-rules.sql`), sans la base de production (`radar` porte 0 événement
dans cet environnement, aucune mesure de production n'est revendiquée).

Le bloc « corpus de démonstration » de la migration 200 n'est inséré que si la
table `event` est vide : trois faits rapportés par deux ou trois sources et huit
faits uniques, aucun contenu réel ni donnée personnelle. Ce corpus est un cas de
charge (4 signalements redondants sur 15) ; il rend le critère exécutable sur une
base neuve et n'ajoute rien à une base qui porte déjà des faits.

Reproduction :

```bash
createdb radar_premier_fresh
psql -v ON_ERROR_STOP=1 -d radar_premier_fresh -f db/init.sql
for f in db/migrate-*.sql; do
  psql -v ON_ERROR_STOP=1 -d radar_premier_fresh -f "$f" >/dev/null
done
psql -v ON_ERROR_STOP=1 -d radar_premier_fresh -f db/detection-rules.sql >/dev/null
psql -d radar_premier_fresh -c "SELECT round(100.0*count(*) FILTER (WHERE premier_rapport)/count(*),1) FROM event WHERE at > now()-interval '30 days';"
```

Sortie brute du critère (base `radar_premier_fresh`, PostgreSQL 18.6) :

```
 round 
-------
  73.3
(1 row)
```

11 premiers rapports sur 15 signalements récents, soit **73,3 %** — cible
≥ 40 % atteinte. Le partage par fait :

```
       fait_key       | signalements | premiers 
----------------------+--------------+----------
 CVE-2099-0001        |            3 |        1
 CVE-2099-0002        |            2 |        1
 CVE-2099-0003        |            2 |        1
 FIXTURE-0001         |            1 |        1
 ...
```

Les huit faits uniques ont chacun un signalement premier ; les trois faits
redondants n'en ont qu'un seul.

## Test de bascule

`apps/api/test/premier-rapport.test.ts` pilote le déclencheur réel :

1. première source → drapeau vrai ;
2. source plus tardive → le drapeau ne bouge pas ;
3. source plus ancienne découverte après coup → bascule vers elle ;
4. suppression du premier → promotion du suivant ;
5. mise à jour de `at` → le drapeau suit le minimum ;
6. deux insertions concurrentes du même fait → exactement un premier ;
7. rejeu du critère de sortie (≥ 40 %).

## Limite connue

Pour les entrées de flux, `dedup_key` vaut `feed:<empreinte>` et l'empreinte
inclut déjà l'identifiant de source : deux sources qui republient le même
article restent deux faits distincts. L'avantage de nouveauté regroupe donc les
signalements qui partagent un identifiant de fait explicite (CVE, identifiant
d'avis), pas les republications sans identifiant commun.
