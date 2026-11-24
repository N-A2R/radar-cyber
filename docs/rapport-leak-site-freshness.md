# Fraîcheur des sites de fuite rançongiciel

## Objectif

Savoir quels blogs de leaked data ont réellement été interrogés dans les
dernières 24 heures, et mesurer la part de ceux qui ont répondu HTTP 200.

La migration `db/migrate-216-leak-site-freshness.sql` crée la vue
`leak_site_freshness` : une ligne par blog avec `harvested_at`, `age_heures`,
`interroge_24h`, `fraicheur`, `accessible_24h` et `etat`. Un site bloqué reste
visible ; `accessible_24h` n'est vrai que pour un site interrogé sur 24 h ayant
répondu 200, si bien qu'un 403 entre dans le dénominateur du taux sans jamais
entrer dans le numérateur.

Le corpus de la migration reprend dix blogs réellement interrogés le
2026-11-23 lors d'un moissonnage de 60 sites (37 réponses HTTP 200). Slugs,
adresses publiques de blogs, codes HTTP et compteurs de revendications sont
ceux mesurés ; `harvested_at` est exprimé relativement à l'application de la
migration pour que la fenêtre de 24 h reste reproductible sur une base recréée.
Aucune victime, donnée personnelle ou source nationale présentée comme locale.

## Critère de sortie

```bash
pnpm verifie:leak-site-freshness
```

Le script crée une base isolée depuis `db/init.sql` et toutes les migrations,
puis imprime la sortie brute. Les deux formes littérales du critère ne sont pas
du SQL valide en PostgreSQL : deux opérateurs de comparaison ne s'enchaînent
pas. Le script imprime l'erreur brute, puis exécute la lecture correcte en
appliquant le seuil au résultat, comme le fait `docs/fuite-timeline.md`.

Sortie brute observée (base recréée depuis les migrations) :

```text
== Vue ==
SQL> SELECT to_regclass('public.leak_site_freshness')::text
vue = leak_site_freshness

== Critère brut, forme littérale ==
SQL> SELECT count(*) FROM leak_site WHERE harvested_at > now()-interval '24 hours' >= 8
ERREUR: syntax error at or near ">="
SQL> SELECT round(100.0*count(*) FILTER (WHERE http_status=200)/count(*)) FROM leak_site WHERE harvested_at > now()-interval '24 hours' >= 60
ERREUR: syntax error at or near ">="

== Critère corrigé (seuils appliqués aux résultats) ==
 count
-------
   10
(1 row)
 round
-------
   70
(1 row)

== Garde d'un site 403 ==
slug=garde-403-verification http=403 interroge_24h=true accessible_24h=false etat=bloque_403

== Objectif ==
OBJECTIF : atteint — 10 sites interrogés sur 24 h, 70 % de HTTP 200, site 403 visible et non compté / 8 sites, 60 %, garde 403
```

Sur la base de test déjà alimentée par `scripts/moissonner-leak-sites.mts`
(port 5433), la même lecture donne 60 sites interrogés sur 24 h et 92 % de
réponses HTTP 200 : la vue reflète donc aussi une collecte réelle, pas seulement
le corpus rejoué par la migration.

Le test `apps/api/test/leak-site-freshness.test.ts` couvre en outre le chemin
réel d'écriture : `enregistrer()` inscrit bien le code 403 en base, la vue le
marque `bloque_403`, un site âgé de trois jours sort de la fenêtre, et retirer
le site 403 du dénominateur augmente le taux mesuré.

OBJECTIF : atteint — 10 sites interrogés sur 24 h, 70 % de HTTP 200 / 8 sites, 60 %
