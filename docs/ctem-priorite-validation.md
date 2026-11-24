# Priorité CTEM par organisation — expositions validées

## Résultat mesuré

OBJECTIF : atteint — part des expositions portées par un score > 0,9 = 1,0000 / cible ≥ 0,50 ; precision@50 = 1,0000 / cible ≥ 0,60.

Mesure exécutée sur la base de mesure locale (Docker, port 5433), après application de `db/migrate-217-org-score.sql` :

```text
requete=SELECT count(*) FILTER (WHERE esc.score>0.9 AND es.id IS NOT NULL)::float / NULLIF(count(*) FILTER (WHERE es.id IS NOT NULL),0) FROM org_score esc JOIN exposition_service es ON es.org_id=esc.org_id;
resultat=1
precision@50=1
organisations_scorees=9908
expositions=11096
regle=ctem-priorite@1
seuil_part=0.9
verdict=ok
```

Reproduction :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/verifie-ctem-exposition.mts
# ajouter --refresh pour recalculer org_score avant la mesure
```

## Ce que le score classe

`exposition_service` énumère des ports observés ; il ne désigne pas les organisations à valider en premier. La table `org_score` porte une ligne par organisation ayant au moins une exposition mesurée. Règle `ctem-priorite@1` :

| Étape | Définition |
| --- | --- |
| Exposition validée | `source_url` en `http(s)` et `consulted_at` dans les 7 jours |
| Criticité d'un service | `exposition_criticite()` (migration 203) : catégorie, EPSS maximal des CVE de `evidence->vulns`, signal KEV |
| Score | `0,91 + 0,09 × (1 − exp(−criticité_cumulée / 60))` si au moins une exposition est validée, sinon `0,30 × (1 − exp(−services / 5))` |
| Borne | Score dans [0, 1] ; le seuil 0,9 sépare les expositions validées du reste |

Le seuil n'est pas une probabilité de compromission : c'est la frontière de la bande de triage. Une exposition mesurée, citée et fraîche suffit à y entrer ; le nombre de services et leur dangerosité départagent ensuite les organisations entre 0,91 et 1. Les expositions anciennes ou sans citation restent sous 0,9 et ne captent pas la validation.

`refresh_org_score()` recalcule la table depuis `exposition_service`, `epss` et `event`. Le calcul est déterministe à données égales ; il est rejoué par le test `apps/api/test/ctem-org-score.test.ts`.

## Précision au top 50

Parmi les 50 organisations au score le plus élevé (départage par `org_id`), la précision est la fraction de celles qui portent encore au moins une exposition citée et fraîche :

```sql
SELECT count(*)::float / 50 AS precision
  FROM (
    SELECT org_id FROM org_score ORDER BY score DESC, org_id LIMIT 50
  ) top
 WHERE EXISTS (
    SELECT 1 FROM exposition_service es
     WHERE es.org_id = top.org_id
       AND es.source_url ~ '^https?://'
       AND es.consulted_at >= now() - interval '7 days'
 );
```

Un `EXISTS` évite de compter deux fois une organisation ayant plusieurs services. La mesure vise 0,60 ; elle vaut 1 sur les données mesurées.

## Données et limites

- Sources d'exposition : consultations publiques déjà présentes dans `exposition_service` (InternetDB/Shodan, LeakIX, registres publics). Le score n'appelle aucune source payante et n'émet aucun scan actif.
- Aucune source nationale n'est présentée comme locale : seules les organisations déjà rattachées au référentiel et à une mesure d'exposition sont classées.
- Aucune donnée personnelle n'est stockée : `org_score` ne contient qu'un identifiant d'organisation, des compteurs, une criticité cumulée, la version de règle et un horodatage. Ni nom, ni IP, ni URL de consultation n'y sont copiés.
- Ce score oriente une validation humaine ; il ne déclenche aucune action automatisée et ne prédit pas une compromission.
