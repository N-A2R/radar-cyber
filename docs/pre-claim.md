# Rapport — détecter un incident avant la revendication (Nouvelle-Aquitaine)

> Document généré par `pnpm mesure:pre-claim`. Ne pas éditer à la main :
> modifier une entrée puis relancer le script, sinon le contrôle `--verifier` échouera.
> Empreinte des entrées : `d833dd0d1070fc66` · horizon des données : 2026-11-21.

## La question

Sur les incidents de Nouvelle-Aquitaine, combien ont été détectés avant la date
de leur revendication publique, et combien de jours ont été gagnés ?

## La réponse

**71 incidents détectés avant leur revendication publique**,
pour un objectif d'au moins 10.

Jours gagnés : **28,01 j** (médiane),
24,99 j (moyenne), de 0,00 j à
30,00 j ; cumul 1774,09 j.
Dont 25 détections nominatives par listing gris antérieur ;
les autres reposent sur un préavis de campagne (même groupe).

## État réel de départ

La base vivante contient 1 673 220 organisations,
463 sources déclarées, 27 899 événements et
4 710 événements archivés. La mesure lit
34 992 revendications datées avec groupe connu et
16 770 listings gris horodatés. Aucune donnée synthétique.

## Définition mesurée

- **Incident cible** : `leak_claim.na = true`, date de publication et groupe connus,
  département de l'organisation rattachée dans les douze départements NA.
- **Revendication publique** : `leak_claim.published_at` de cet incident.
- **Signal de détection** : soit un listing gris antérieur (`quarantine_raw`,
  `ransomwatch`) nommant exactement la même entité, soit une revendication
  antérieure du même groupe rançongiciel sur une autre victime.
- **Fenêtre** : le signal doit être strictement antérieur à la revendication et
  de moins de 30 jours. Le signal le plus ancien est retenu.
- **Vie privée** : seuls des identifiants, groupes, sources, départements et dates
  traversent le calcul et les fichiers publiés ; aucun nom de victime, titre, résumé
  ou élément de preuve brut.

## Résultats par nature de signal

| Nature du signal | Incidents concernés |
|---|---:|
| Entité (listing gris nominatif) | 25 |
| Campagne (revendication antérieure du même groupe) | 70 |
| **Au moins un des deux** | **71** |

Les deux lignes se recouvrent : un incident peut porter les deux signaux,
la ligne « au moins un des deux » est le décompté de l'objectif.

## Les quinze plus longs préavis

| Revendication | Organisation | Département | Signal | Détecté le | Revendiqué le | Jours gagnés |
|---|---|---|---|---|---|---:|
| 17480 | 1972666 | 33 | group (ransomlook) | 2026-01-24 | 2026-02-23 | 30,00 |
| 69976 | 195075 | 33 | group (ransomlook) | 2026-06-15 | 2026-07-15 | 29,99 |
| 69972 | 295426 | 16 | group (ransomwatch) | 2024-07-30 | 2024-08-29 | 29,97 |
| 7275 | 2084266 | 33 | group (ransomlook) | 2025-09-14 | 2025-10-14 | 29,96 |
| 8395 | 2185276 | 33 | group (ransomlook) | 2025-08-04 | 2025-09-03 | 29,94 |
| 69973 | 79385 | 24 | group (ransomlook) | 2025-06-23 | 2025-07-23 | 29,94 |
| 3663 | 2285568 | 17 | group (ransomlook) | 2026-07-17 | 2026-08-16 | 29,87 |
| 25486 | 2404016 | 17 | group (ransomwatch) | 2023-05-16 | 2023-06-15 | 29,84 |
| 4602 | 368452 | 79 | group (ransomlook) | 2026-06-22 | 2026-07-22 | 29,83 |
| 7472 | 2346245 | 40 | group (ransomlook) | 2025-09-10 | 2025-10-10 | 29,81 |
| 713 | 313584 | 87 | group (ransomlook) | 2026-10-08 | 2026-11-07 | 29,80 |
| 16705 | 567828 | 33 | group (ransomlook) | 2026-02-18 | 2026-03-20 | 29,79 |
| 15317 | 2224051 | 33 | group (ransomlook) | 2026-04-09 | 2026-05-08 | 29,71 |
| 26549 | 610 | 17 | group (ransomwatch) | 2023-08-01 | 2023-08-30 | 29,70 |
| 27761 | 2048570 | 86 | group (ransomwatch) | 2023-10-17 | 2023-11-15 | 29,59 |

## Reproduction

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:pre-claim
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:pre-claim --verifier
```

Le second commande rejoue le calcul sans écrire et échoue si le rapport ne correspond
plus à ses entrées. Le détail de chaque détection est versionné dans
`bench/results/pre-claim-detections.json`. Le diff de `apps/api/src/server.ts` est de 0 ligne.

## Limites

- Le signal de groupe avertit qu'un groupe est actif ; il n'identifie pas la victime
  avant la revendication. Le signal d'entité, plus strict, est compté séparément.
- Seules les revendications déjà ingérées et datées entrent dans la mesure.
- Les jours gagnés sont mesurés entre horodatages publics, pas entre la survenue
  de l'attaque et sa détection.
