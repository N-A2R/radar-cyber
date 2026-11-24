# Mesure de base CTEM — exposition réseau par organisation

## Objectif

Établir la mesure de base CTEM : qui est exposé, sur quel port, avec quelle fraîcheur. Le critère demande qu'au moins 80 % des organisations disposant d'au moins un actif aient une ligne dans `exposition_service`, avec une fraîcheur médiane ≤ 7 jours, et que le taux d'organisations consultées sur 7 days soit ≥ 0,80.

## Ce qui a été ajouté

- Migration 220 : elle inscrit dans `asset` les domaines publics déjà déclarés dans `org.domain` (statut `candidat` : aucune nouvelle preuve DNS n'est inventée), puis crée :
  - `ctem_exposition_baseline` — une ligne par organisation avec actif : ports, services, sources, dernière consultation, âge et fraîcheur ;
  - `ctem_exposition_baseline_mesurer(org_ids)` — couverture, âge médian et taux de fraîcheur, avec un périmètre optionnel ;
  - `ctem_exposition_baseline_mesure` — la mesure sur toute la base.
- `apps/api/src/exposition/ctem-baseline.ts` : lecture typée de la vue et de la fonction, conversion des `bigint`/`numeric` renvoyés en texte par `pg`.
- `scripts/mesure-base-ctem.mts` : sortie reproductible, y compris la requête exacte du critère.
- `apps/api/test/ctem-exposition-baseline.test.ts` : quatre tests sur base jetable, réseau interdit (vue par organisation, couverture, taux de fraîcheur, périmètre restreint).

Aucune donnée personnelle n'est stockée : uniquement des domaines d'organisation, des ports, des sources et des dates de consultation. Aucune source nationale n'est présentée comme locale.

## Sortie brute observée le 2026-11-23

```text
$ DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/mesure-base-ctem.mts
requete=SELECT count(DISTINCT org_id) FILTER (WHERE consulted_at > now()-interval '7 days')::float/count(DISTINCT org_id) FROM exposition_service;
resultat=1
organisations_avec_actif=1809
organisations_exposees=1685
couverture=0.9315
age_median_jours=1.87
organisations_fraiches=1685
services=2512
ports_distincts=76
verdict=ok
```

La requête du critère exécutée directement dans PostgreSQL renvoie `1` (une colonne, une ligne). Les 1 809 organisations avec actif sont celles qui portent un domaine public déclaré ; 1 685 d'entre elles (93,15 %) ont au moins une ligne dans `exposition_service`. L'âge médian de la dernière consultation par organisation exposée est de 1,87 jour.

## Contraintes vérifiées

- Suite `pnpm -F @radar/api test` et typecheck : voir le compte rendu du chantier ; dans ce worktree le wrapper `pnpm` refuse le `node_modules` symlinké (`ERR_PNPM_UNSAFE_TASK_RUN_STATE_PATH`), les exécutables locaux `tsx test/run.ts` et `tsc --noEmit -p tsconfig.json` ont été lancés directement.
- Le jeu de tests exposition préexistant reste vert ; aucun test n'a été assoupli.
- La collecte n'a pas été relancée : les observations viennent des mesures publiques déjà enregistrées par les tranches précédentes.
