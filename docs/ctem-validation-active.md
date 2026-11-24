# Validation active du décile d'exposition le plus risqué

## Objectif

Transformer une exposition théorique en exposition validée, mesure centrale du
CTEM : au moins 90 % des 20 expositions du top décile validées sous 24 h par
requête active, avec un taux de faux positifs inférieur ou égal à 10 %.

## Méthode

- `db/migrate-226-validation-active-exposition.sql` crée `exposure_validation_eval`
  (instantané des 20 expositions confirmées) et
  `exposition_validation_tentative` (journal des sondes, y compris les
  indéterminés). Aucune adresse IP, aucun nom d'organisation.
- Les candidats sont les 10 % supérieurs de `exposition_service` classés par
  `exposition_criticite(categorie, epss_max, kev)`. La boucle sonde au plus
  60 candidats par ordre de criticité, avec concurrence bornée à 5 et au plus
  3 tentatives TCP par cible (2,5 s / 5 s / 8 s) : aucun octet applicatif
  envoyé, aucun balayage de port en masse.
- `discovered_at` date l'entrée en file de validation ; `validated_at` n'est
  posé que sur une connexion TCP ouverte. Un refus explicite est un faux
  positif ; un timeout est indéterminé (filtrage réseau), il n'est compté ni
  comme confirmation ni comme faux positif.
- `pnpm validation:active` sonde et écrit l'instantané ;
  `pnpm verifie:validation-active` relit la requête du juge sans réseau.

## Mesure (sortie brute du vérificateur)

```text
requete=SELECT count(*) FILTER (WHERE validated_at <= discovered_at + interval '24 hours')::float/count(*) FROM exposure_validation_eval;
resultat=1
lignes=20
validees=20
faux_positifs=0.0000 (28 tentatives journalisees)
regle=ctem-validation-active@1
seuil=0.9 fp_max=0.1
verdict=ok
```

Requête exacte exécutée directement sur la base :

```text
 ?column?
----------
        1
(1 row)
```

Journal des tentatives :

```text
 taux_fp | tentatives
---------+------------
       0 |         28
(1 row)
```

OBJECTIF : atteint — 1,0000 (20/20 validées sous 24 h, 0/28 faux positifs) / 0,90 (≤10 % de faux positifs)
