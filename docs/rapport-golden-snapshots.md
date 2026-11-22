# Rapports golden — garde-fou contre les régressions de chiffres publiés

**Suite livrée (22 novembre 2026) : 4 rapports golden (vidéo, organisation,
hebdomadaire, vide), diff octet à octet après normalisation des dates, et
`SELECT count(*) FROM report_run WHERE statut = 'golden'` = 4.**

## Le risque couvert

Les rapports publiés (hebdomadaire, veille audiovisuelle, organisation) exposent
des chiffres — volumes d'événements, taux de couverture, vues cumulées,
signalements. Une régression de rendu ou de calcul peut changer un chiffre sans
casser le typecheck ni un test de forme. La suite golden fige donc les octets
**normalisés** de chaque rapport, et échoue au premier octet différent.

## Emplacement

| Élément | Rôle |
|---|---|
| `apps/api/src/analyse/rapport-hebdo.ts` | Rendu Markdown + HTML du rapport hebdomadaire, pur (aucune base). Utilisé par `scripts/weekly-report.mts` **et** par la suite golden : la régression est donc détectée sur le rendu réellement publié. |
| `apps/api/src/analyse/rapports-golden.ts` | Les quatre rapports figés : `video`, `org`, `hebdo`, `vide` ; normalisation des dates ; empreinte sha256. `hebdo` et `vide` passent par le renderer réel ; `video` et `org` sont des spécimens déterministes en attendant un producteur. |
| `apps/api/test/fixtures/golden/{video,org,hebdo,vide}.md` | Snapshots versionnés. |
| `apps/api/test/rapports-golden.test.ts` | Diff octet à octet, preuve qu'un chiffre modifié échoue, registre `report_run`. |
| `db/migrate-200-report-run-golden.sql` | Table `report_run` et ses quatre lignes `golden` (idempotent). |
| `scripts/golden-rapports.mts` | Vérification autonome, et régénération assumée des snapshots. |

## Commandes

```bash
pnpm -F @radar/api test test/rapports-golden.test.ts   # suite golden (base de test jetable)
tsx scripts/golden-rapports.mts                        # diff octet à octet sur la base locale
tsx scripts/golden-rapports.mts --db                   # idem + registre report_run et comptage SQL
tsx scripts/golden-rapports.mts --write                # régénère les snapshots (changement assumé)
```

Sortie attendue en fin de vérification :

```
rapports golden : 4/4 conformes ; SELECT count(*) FROM report_run WHERE statut='golden' = 4
registre report_run : SELECT count(*) FROM report_run WHERE statut='golden' = 4
```

## Normalisation des dates

`normaliserDates` remplace les horodatages ISO, les dates `AAAA-MM-JJ` et les
formats `JJ/MM/AAAA` par `<DATE>`. Tout le reste est comparé à l'octet : un
chiffre public (compteur, pourcentage, taux, volume) qui bouge fait échouer le
test. Le registre `report_run` conserve l'empreinte du rapport normalisé, pour
qu'une régression publiée reste traçable après coup.

## Régénérer après un changement assumé

Un chiffre change volontairement (nouvelle règle de calcul, nouvelle section) :
`tsx scripts/golden-rapports.mts --write` puis relire le diff des snapshots
avant de commiter. Le diff doit montrer **uniquement** le changement voulu.
