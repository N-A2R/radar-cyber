# CERT-FR — flux MISP public TLP:CLEAR

## Ce qui est livré

- `db/migrate-200-certfr-misp.sql` : source `certfr_misp` (`region = 'national'`,
  aucun département, `interval_sec = 86400`) et index partiel sur
  `event.evidence->>'mispUuid'`.
- `db/migrate-202-certfr-misp-corpus.sql` : corpus durable `certfr_misp_event`,
  un enregistrement par UUID MISP. Indispensable : `event` archive au bout de
  90 jours sur `observed_at`, et un événement MISP daté de 2020 est archivé le
  jour de son ingestion.
- `apps/api/src/collectors/certfr-misp.collector.ts` : lecture du manifeste
  `https://misp.cert.ssi.gouv.fr/feed-misp/manifest.json`, puis des fichiers
  `{uuid}.json`. Seuls les événements `tlp:clear` / `cert-fr:TLP="clear"` (ou le
  `tlp:white` historique) sont admis ; un tag TLP plus restrictif rejette
  l'événement. Les attributs d'objet (`Event.Object[].Attribute`) sont lus
  comme les attributs directs. Les types porteurs de données personnelles
  (courriel, téléphone, registrant Whois) ne sont ni copiés ni comptés, et une
  pièce jointe qui déclare un TLP plus restrictif n'est pas recopiée.
- `apps/api/src/collectors/certfr-misp-correlate.ts` : corrélation
  `suggested_relation` entre le corpus MISP et un événement régional déjà
  rattaché à une organisation. L'UUID MISP, l'événement régional et la règle
  appliquée sont dans `evidence` ; `correlationBasis` dit ce qui fonde le lien
  (`semantique`, `categorie`, `contexte-du-jour`).
- `apps/api/src/collectors/index.ts` : collecteur enregistré (collecteur dédié,
  pas le moteur générique, qui l'exclut explicitement).
- `apps/api/src/server.ts` : la corrélation MISP tourne au tick serveur, à côté
  de la corrélation organisationnelle. `source.last_ok_at` est rafraîchi par
  l'ingestion (`enregistrerCorpusMisp`), jamais par la corrélation : un flux
  arrêté ne peut pas rester « sain » grâce aux jours déjà rejoués.
- `scripts/ingest-certfr-misp.mts` : exécution reproductible (ingestion +
  corrélation des jours manquants) et impression du critère de sortie.

## Ingestion sans perte — mesure du 2026-11-22

Flux réel : 18 entrées au manifeste, 18 corps lus, 18 admis (tous `tlp:clear`),
0 illisible, 0 refus. 2 287 attributs lus (directs et d'objets compris, sur
212 objets), 2 074 entrées d'indicateur (doublons entre événements compris),
2 046 valeurs distinctes sur l'ensemble du corpus (autant de lignes
`indicator`), 0 refus d'admission. Aucun courriel ni téléphone dans
`certfr_misp_event` :

```text
 evenements | attributs | objets | indicateurs
------------+-----------+--------+-------------
         18 |      2287 |    212 |        2074
(1 row)

 count
-------
     0
(1 row)   -- lignes du corpus contenant « @ »
```

## Corrélation — mesure du 2026-11-22

```text
 critère de sortie (exécuté tel quel)
 count
-------
     0
(1 row)

    jour    | correlations | sans_uuid
------------+--------------+-----------
 2026-11-16 |            1 |         0
 2026-11-17 |            1 |         0
 2026-11-18 |            1 |         0
 2026-11-19 |            1 |         0
 2026-11-20 |            1 |         0
 2026-11-21 |            1 |         0
 2026-11-22 |            1 |         0
(7 rows)
```

Rejeu du script : `7 jour(s) couvert(s), 0 corrélation(s) écrite(s), 0 relation(s)`.

## Ce que la corrélation ne prétend pas

Sur le corpus observé, **aucun recoupement sémantique n'existe** entre les 18
événements CERT-FR et les 46 événements régionaux rattachés à une organisation
de Nouvelle-Aquitaine (comptés au rejeu du 2026-11-22). Mesuré le 2026-11-22 :

- aucun acteur du flux (`Sandworm`, `TA505`, `Silence`, `FIN11`, `UNC1878`,
  `APT31`, `TeleBots`, `ELECTRUM`, `IRIDIUM`, `Dridex`) n'apparaît dans un
  titre ou résumé régional ;
- aucun des 2 046 indicateurs distincts ne touche un domaine d'organisation, un actif ou
  un domaine DNS connu (`org`, `asset`, `dns_domaine` : 0 correspondance) ;
- aucune CVE du flux (le CERT-FR publie des IOC, pas des avis CVE).

Les 7 liens écrits sont donc : 1 rapprochement **de catégorie** (ensemble d'IOC
ransomware face à une revendication ransomware) et 6 rapprochements **de
contexte du jour**, tous en confiance C3, avec la mention explicite
« Contexte, pas un incident » dans `evidence.correlationNote`. Dès qu'un
recoupement réel apparaît (acteur ou indicateur présent dans un événement
régional), la règle `certfr-misp:indicateur-partage` prend le dessus en
confiance B2 et le motif `semantique` est inscrit.

Cette conception est testée : `apps/api/test/certfr-misp.test.ts` vérifie que
l'acteur commun donne bien `semantique` et qu'à défaut la catégorie est
retenue, sur un corpus contrôlé.

## Exécution

```bash
export DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar
apps/api/node_modules/.bin/tsx scripts/migrate.mts
apps/api/node_modules/.bin/tsx scripts/ingest-certfr-misp.mts
```

Le collecteur est aussi dans la boucle serveur (`interval_sec = 86400`) : la
commande ci-dessus sert au premier remplissage et à la mesure reproductible,
pas l'unique voie d'ingestion. Le script imprime le critère de sortie tel
quel et le décompte quotidien.

La source est nationale et le reste : `source.region = 'national'`,
`source.department IS NULL`. Seules les corrélations portent le rattachement
régional, et elles déclarent qu'il s'agit d'une hypothèse
(`assertion_type = 'suggested_relation'`).
