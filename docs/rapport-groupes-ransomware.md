# Rapport — 50 groupes ransomware suivis avec leurs victimes de Nouvelle-Aquitaine

**Mesure du 22 novembre 2026, base réelle `radar` sur `localhost:5433`.**

## Chiffre obtenu

**50 groupes ransomware suivis**, dont **21 groupes avec au moins une victime en Nouvelle-Aquitaine** ; **36 paires groupe/organisation NA** au total.

| Indicateur | Valeur |
| --- | --- |
| Groupes suivis (`ransomware_group`) | **50** |
| Groupes suivis ayant ≥ 1 victime NA | **21** |
| Victimes organisationnelles NA (`ransomware_victim`) | **36** |
| Répartition des preuves | curated 4, domaine 2, événement 21, nom 9 |

Les 29 autres groupes suivis n'ont aucune victime NA confirmée : ils complètent le
quota de 50 par volume de revendications, sans victime inventée. Le chiffre
publié est donc **50 groupes suivis, 21 avec victimes NA**.

## Commande reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-groupes-ransomware.mts
```

La mesure est intégralement SQL ; les trois requêtes sont enregistrées dans
`bench/results/groupes-ransomware.json` avec leur sortie. Reconstruire la table
avant de mesurer :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm groups:ingest
```

## État de départ et méthode

- État réel : **1 673 151 organisations**, **312 sources**, **26 688 événements**.
- **16 901 revendications** de quarantaine, **196 groupes** distincts : ce sont
  les sources grises autorisées, interrogées sans service payant.
- Trois preuves, du plus fort au plus faible : événement déjà rattaché à une
  organisation NA (21), correspondance exacte de domaine public (2), nom
  d'organisation distinctif (9), corpus éditorial vérifié avec similarité
  trigramme ≥ 0,75 (4).
- Périmètre : les 12 départements de Nouvelle-Aquitaine uniquement
  (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87).
- Aucune donnée personnelle de victime : l'indice brut n'est jamais écrit.
  La table ne garde que l'identifiant d'organisation, l'URL publique de la
  preuve, la date, le type de correspondance et l'identifiant de revendication.
  L'API `/api/ransomware-groups` et l'écran anglais `Ransomware groups`
  n'exposent que ces champs.

## Étapes livrées et vérifications

1. Migration `db/migrate-052-ransomware-groups.sql` : tables de groupes et de
   victimes, index borné sur `org(name_norm)` pour les organisations NA.
2. `scripts/track-ransomware-groups.mts` : reconstruction idempotente et
   transactionnelle à partir des preuves locales.
3. `scripts/mesure-groupes-ransomware.mts` : mesure reproductible écrite dans
   `bench/results/groupes-ransomware.json`.
4. Route publique `GET /api/ransomware-groups` enregistrée dans le registre
   unique des routes et dans la matrice de contrôle d'accès ; écran anglais.
5. `apps/api/test/ransomware-groups.test.ts` : un test par comportement
   (noms canoniques, indices personnels rejetés, noms distinctifs, URL propres,
   déduplication des victimes, priorité aux groupes avec victimes NA).

Vérifications exécutées : **6/6 tests ciblés réussis**, typecheck API et web
verts. Le diff de `apps/api/src/server.ts` est de **0 ligne** : la route est
branchée par le registre `routes/index.ts`, sans toucher au serveur.
