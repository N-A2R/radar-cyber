# Couverture — santé et collectivités de Nouvelle-Aquitaine

Mesure rejouée le **21 novembre 2026** sur la base live
`postgres://radar:radar@localhost:5432/radar` (1 673 151 organisations) et le
corpus versionné `bench/fixtures/corpus-reference-na.json`. Fenêtre de mesure :
**2025-11-01 → 2026-10-31**.

« Domaine » signifie ici `org.domain` non vide — un nom de domaine web déclaré
dans le référentiel —, pas un secteur d'activité. « Touché » vient de
`entiteType` dans le corpus ; « vu » vient du re-jeu de `scripts/mesure-couverture.mts`
(porte d'admission + moteur de rattachement réels).

## Les trois nombres

| Famille | Référentiel NA | Dont avec un domaine | Touchées (corpus, tout dates) | Dans la fenêtre | Vues | Taux |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Établissements de santé | 10 009 | **0** | 9 | 7 | 5 | 71,4 % |
| Collectivités | 4 461 | **0** | 13 | 6 | 5 | 83,3 % |
| **Total** | **14 470** | **0** | **22** | **13** | **10** | **76,9 %** |

Le dénominateur du taux est le nombre d'incidents **dans la fenêtre** (13), pas
les 22 incidents du corpus : les 9 incidents antérieurs à la fenêtre restent
dans le tableau comme contexte et ne comptent ni dans le numérateur ni dans le
dénominateur.

Deux précisions de périmètre :

- Le référentiel compte 88 organisations avec un domaine sur 1 673 151. Parmi
  les établissements de santé et collectivités, 10 ont un domaine, mais **toutes
  hors Nouvelle-Aquitaine** (départements 25, 44, 45, 49, 57, 59, 75, 88, 92,
  94). Le chiffre NA est donc bien 0.
- Les 10 incidents vus sont tous des rattachements **exact** : aucun « partiel »
  ni « hors sujet » dans cette famille, contre 6 et 4 sur l'ensemble des
  33 vus / 42 du re-jeu global du même jour.

## Tableau nominatif

Les 22 incidents `sante` ou `collectivite` du corpus. La colonne « Domaine »
porte sur l'organisation du référentiel désignée par le moteur ; elle est `non`
pour les 22, conformément au comptage ci-dessus. `—` signifie « hors fenêtre,
non décompté ».

| Incident | Entité touchée (corpus) | Famille | Publication | Domaine | Vu | Organisation désignée / motif |
| --- | --- | --- | --- | --- | --- | --- |
| na-2026-002 | Mairie de Marennes-Hiers-Brouage | collectivité | 2026-08-19 | non | oui | `mairie de marennes hiers brouage` |
| na-2026-003 | Ville de Tarnos | collectivité | 2026-08-29 | non | oui | `ville de tarnos` |
| na-2026-004 | Mairie d'Espelette | collectivité | 2026-09-16 | non | oui | `mairie d espelette` |
| na-2026-005 | EHPAD Résidence du Parc de Champdeniers | santé | 2025-12-11 | non | oui | `ehpad residence du parc` |
| na-2026-006 | Ville de Gradignan — police municipale | collectivité | 2026-05-13 | non | oui | `ville de gradignan` |
| na-2026-007 | Mairie de Fumel | collectivité | 2025-10-03 | non | — | hors fenêtre |
| na-2026-015 | Mairie de Sarran | collectivité | 2025-06-20 | non | — | hors fenêtre |
| na-2026-017 | Ville de Poitiers et Grand Poitiers | collectivité | 2025-09-05 | non | — | hors fenêtre |
| na-2026-022 | Institut Bergonié | santé | 2026-04-09 | non | oui | `institut bergonie` |
| na-2026-028 | Ville de La Rochelle — fuite via le prestataire Synbird | collectivité | 2025-11-24 | non | oui | `ville de la rochelle` |
| na-2026-029 | Bordeaux Métropole — portail de la taxe de séjour | collectivité | 2026-04-27 | non | non | présent au référentiel, non reconnu par le moteur |
| na-2026-039 | Cerballiance — réseau de laboratoires de biologie médicale | santé | 2026-03-28 | non | non | présent au référentiel, non reconnu par le moteur |
| na-2026-040 | Cegedim Santé — logiciel MonLogicielMedical (MLM) | santé | 2026-02-26 | non | non | présent au référentiel, non reconnu par le moteur |
| na-2026-041 | Polyclinique Bordeaux Nord Aquitaine | santé | 2026-04-09 | non | oui | `polyclinique bordeaux nord aquitaine` |
| na-2026-042 | Ville de Limoges — centre de vaccination municipal et campagne HPV | santé | 2026-06-26 | non | oui | `ville de limoges` |
| na-2026-043 | Weda — logiciel médical (cabinets touchés jusqu'en Charente) | santé | 2025-11-13 | non | oui | `weda` |
| na-2026-048 | Ville de Bergerac — QR codes des horodateurs (quishing) | collectivité | 2025-08-11 | non | — | hors fenêtre |
| na-2026-049 | Mairie de Berson | collectivité | 2025-02-28 | non | — | hors fenêtre |
| na-2026-052 | Camping municipal d'Évaux-les-Bains | collectivité | 2025-07-11 | non | — | hors fenêtre |
| na-2026-057 | Sites internet des villes de Bordeaux et Pau et du département des Landes (DDoS) | collectivité | 2025-01-02 | non | — | hors fenêtre |
| na-2026-058 | SPSTI 16 — service de prévention et de santé au travail interentreprises de la Charente | santé | 2024-06-14 | non | — | hors fenêtre |
| na-2026-059 | Centre hospitalier de Girac (Angoulême) | santé | 2025-09-09 | non | — | hors fenêtre |

La classification `sante` / `collectivite` est celle du corpus, pas une
re-qualification : `na-2026-042` (centre de vaccination municipal) reste classé
santé et `na-2026-052` (camping municipal) reste classé collectivité.

## Lecture

- **Les 3 incidents non vus ne sont pas des trous de référentiel.** Bordeaux
  Métropole, Cerballiance et Cegedim Santé sont présents dans la base ; c'est le
  moteur qui ne les désigne pas. Le travail porte ici sur la désignation, pas
  sur l'import.
- **Aucun domaine web n'est exploitable pour ces deux familles en NA.** Les
  10 vus le sont par alias de nom (« ville de Tarnos », « ehpad residence du
  parc », …) : un rattachement par domaine ne peut pas contribuer aujourd'hui.
- **Le corpus est petit.** 13 faits dans la fenêtre, 7 en santé et 6 en
  collectivité : les taux de 71,4 % et 83,3 % sont des observations, pas des
  estimations robustes de la couverture régionale.

## Ce qui diffère de la mesure publiée plus tôt

`docs/couverture-mesuree.md`, écrit le même jour sur un état de base de
4 480 organisations, publiait 8 vus sur ces 13 incidents (3 santé, 5
collectivité). Le re-jeu sur la base courante (1 673 151 organisations) en
compte 10 (5 et 5) : l'écart vient de l'état du référentiel, pas d'un changement
de moteur. Les chiffres ci-dessus sont ceux de la base mesurée le 21 novembre
2026 ; un re-jeu sur un autre état de base doit être publié avec sa date.

## Reproductible

Comptage du référentiel (lecture seule) :

```sql
SELECT kind,
       count(*) AS total,
       count(*) FILTER (WHERE domain IS NOT NULL AND btrim(domain) <> '') AS avec_domaine
FROM org
WHERE dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
  AND kind IN ('sante','collectivite')
GROUP BY kind
ORDER BY kind;
```

Re-jeu du corpus :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-couverture.mts --json=/tmp/couv-hopitaux.json
```

La mesure a été rejouée avec une adaptation locale temporaire : le script
versionné sélectionne `org_alias.nom_normalise`, colonne absente de la base
courante ; cette colonne a été omise de la requête le temps du re-jeu, le
gazetteer recalculant la clé normalisée depuis `alias`. Le fichier
`apps/api/src/collectors/org-gazetteer.ts` a été restauré ensuite et n'est pas
modifié. Le global du re-jeu est 33/42 (78,6 %), dont 29/42 (69,0 %) de
rattachements défendables.
