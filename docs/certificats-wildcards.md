# Certificats CT : wildcards, émetteurs hors liste, certificats étendus
OBJECTIF : atteint — 52 lignes ct_anomalie, liste blanche 2026-11-22 (17 émetteurs), 4 certificats synthétiques classés / ≥ 15 lignes, liste blanche versionnée, 4 certificats synthétiques

Établi le 22 novembre 2026. Migration `db/migrate-200-ct-anomalies.sql`, code
`apps/api/src/ctlogs/anomalies.ts`, vérification `pnpm verifie:ct-anomalies`.

## Le problème

Un certificat n'est pas une preuve d'incident, mais sa forme élargit la surface
d'attaque :

- un SAN `*.exemple.fr` couvre tous les sous-domaines d'un cran, y compris ceux
  qu'aucun inventaire ne connaît ;
- un certificat signé par une autorité hors de la liste vérifiée sort du cadre
  de confiance que l'on a réellement examiné ;
- un certificat qui porte plus de cinq identités distinctes multiplie les noms
  couverts par une seule clé privée.

Ces trois constats sont calculés uniquement à partir des champs observés dans
les CT logs (identités SAN, émetteur). Aucune ligne n'est déduite d'une
réputation ou d'un score.

## Les trois motifs

| Motif | Déclencheur | `cible` |
|---|---|---|
| `wildcard` | une identité SAN commence par `*.` | l'identité wildcard |
| `emetteur_hors_liste` | clé normalisée absente de la version courante | la clé normalisée |
| `certificat_etendu` | plus de 5 identités distinctes | chaque identité au-delà du seuil |

Une ligne vaut pour un élément fautif : un certificat avec sept identités
produit deux lignes `certificat_etendu`, pas une. L'unicité
`(certificat_id, motif, cible)` rend les rejeux stériles.

## Liste blanche versionnée

La table `ct_emetteur_whitelist` porte une colonne `version` (date ISO). La
version `2026-11-22` contient les 17 chaînes déjà vérifiées sur l'inventaire CT
de Nouvelle-Aquitaine (Let's Encrypt X3/R3/R10–R14, Gandi, Certigna,
Certinomis, Sectigo, DigiCert, TERENA, GeoTrust G2).

Règles :

- une version publiée n'est **jamais** modifiée : une autorité légitime absente
  s'ajoute dans une nouvelle version ;
- un émetteur hors liste est un **signal de revue**, pas une fraude : la
  version 2026-11-22 laisse volontairement dehors les chaînes anciennes ou non
  revues (VeriSign, Thawte, GlobalSign, Cloudflare, Amazon, anciens
  intermédiaires Let's Encrypt) ;
- la clé `emetteur_norm` est produite par `normaliserEmetteur()` : valeurs
  `O=` et `CN=` du DN, minuscules, triées et jointes par `|`. Le tri absorbe
  l'ordre des attributs et les variantes de casse.

## Mesure du 22 novembre 2026

Base neuve, inventaires versionnés `bench/results/ctlogs-inventaire-2026-11-21/22.json` :

```
Inventaires chargés : 415 sous-domaine(s), 296 certificat(s) distinct(s).
Liste blanche : version 2026-11-22, 17 émetteur(s).

Détection : 52 anomalie(s), 52 ligne(s) persistée(s) (wildcard 0, hors liste 45, étendu 7).

Critère : SELECT count(*) FROM ct_anomalie WHERE motif IN ('wildcard','emetteur_hors_liste','certificat_etendu') >= 15
 count
-------
    52
(1 row)
```

`wildcard = 0` sur l'inventaire réel : le collecteur n'inscrit que les noms
concrets, jamais les `*.` seuls. La détection wildcard reste couverte par les
quatre certificats synthétiques (dont un wildcard) et s'appliquera dès qu'une
ligne d'inventaire portera un `*.`.

## Vérifier

```
pnpm verifie:ct-anomalies
```

Le script crée une base dédiée, applique `init.sql`, toutes les migrations et
le jeu de test, charge les inventaires versionnés, détecte et persiste, exécute
la requête du juge mot pour mot, puis rejoue quatre certificats synthétiques
(wildcard, émetteur inconnu, étendu, propre) sans les insérer, puis vérifie la
ligne OBJECTIF déclarée ci-dessus. Il échoue si le compte est `< 15`, si un cas
synthétique n'est pas classé comme attendu, ou si la déclaration est absente.

Tests unitaires : `apps/api/test/ctlogs-anomalies.test.ts` (4 certificats
synthétiques, idempotence, normalisation des DN, regroupement par certificat,
ligne OBJECTIF calculée et déclaration unique dans ce rapport).
