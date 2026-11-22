# Exposition externe classée par criticité exploitable

**Mesure du 22 novembre 2026 — prioriser les services dangereux, pas les ports ouverts.**

L'inventaire `exposition_service` répond à « quels ports sont ouverts ». Il ne répond pas à
« lesquels doivent être traités d'abord ». Cette tranche ajoute une vue `exposition_risque`
qui croise la catégorie du service avec deux signaux publics d'exploitabilité : le score EPSS
maximal des CVE observées sur l'hôte et l'appartenance au catalogue CISA KEV.

## Règle de classement

Un service est classé par un score de 0 à 100, additif puis borné :

| Signal | Poids | Justification |
| --- | ---: | --- |
| `base_de_donnees` | 50 | données métier directement lisibles |
| `rdp` | 45 | prise de contrôle interactive |
| `vpn` | 40 | accès au réseau interne |
| `mail` | 20 | rebond et usurpation |
| `web` | 15 | surface applicative ordinaire |
| `autre` | 5 | port non qualifié |
| EPSS maximal | 0–30 | probabilité d'exploitation à 30 jours |
| CISA KEV | 35 | exploitation déjà observée dans la nature |

Les paliers sont `critique` (KEV), `eleve` (EPSS ≥ 0,1), `modere` (catégorie critique ou
EPSS ≥ 0,01) et `faible`. Une base de données sans CVE connue garde 50 points : l'absence de
preuve d'exploitabilité n'est pas une preuve d'innocuité.

Un seul niveau de preuve est attribué à une ligne : le **produit observé**. Une CVE d'hôte
rendue par InternetDB couvre tout le serveur (WordPress, OpenSSH, jQuery…) et ne prouve rien
sur un port MySQL ; elle n'est donc jamais rattachée à un service. La ligne porte la CVE du
produit (MySQL, PostgreSQL, MongoDB, Redis, Elasticsearch, Memcached, RDP), vérifiée sur NVD,
avec `source_url` (InternetDB, l'exposition observée) et `preuve_url` (NVD, la vulnérabilité
du produit) séparés. Un test vérifie qu'une CVE RDP posée sur un hôte n'apparaît pas sur sa
ligne PostgreSQL.

La fonction SQL `exposition_criticite(categorie, epss_max, kev)` est l'unique source de la
formule ; le module TypeScript `apps/api/src/exposition/risque.ts` applique exactement les
mêmes poids, et un test compare les deux implémentations sur six services.

## Critère de sortie

```sql
SELECT count(*)
  FROM exposition_risque
 WHERE categorie IN ('base_de_donnees', 'vpn', 'rdp')
   AND (epss_max >= 0.1 OR kev);
```

Résultat observé le 2026-11-22, sur une base recréée depuis `db/init.sql`, les migrations
puis `db/detection-rules.sql` :

```text
count=27
categories=base_de_donnees:27
lignes_sans_source_ou_perimees=0
seuil=25
verdict=ok
```

La mesure porte sur 920 hôtes interrogés, 803 avec au moins un port, 9 hébergeurs mutualisés
écartés (> 50 ports). Elle retient 38 services base de données / VPN / RDP, dont 27 portent
une CVE de produit à EPSS ≥ 0,1 ou au KEV. Les 27 lignes viennent toutes de
`shodan-internetdb` ; 4 sont aussi au catalogue KEV (MongoDB, CVE-2025-14847).

Contrôle de citation et de fraîcheur :

```sql
SELECT count(*)
  FROM exposition_risque
 WHERE source_url IS NULL OR source_url = ''
    OR consulted_at < now() - interval '7 days';
```

```text
 lignes_sans_source_ou_perimees
--------------------------------
                              0
```

## Test de classement sur six services

Le test `apps/api/test/exposition-risque.test.ts` classe ces six services et vérifie l'ordre
`3306 > 3389 > 5432 > 1194 > 443 > 22` :

| Port | Catégorie | EPSS | KEV | Score | Niveau |
| ---: | --- | ---: | :---: | ---: | --- |
| 3306 | base_de_donnees | 0,97 | oui | 100 | critique |
| 3389 | rdp | 0,50 | non | 60 | eleve |
| 5432 | base_de_donnees | 0 | non | 50 | modere |
| 1194 | vpn | 0,12 | non | 43,6 | eleve |
| 443 | web | 0,90 | non | 42 | eleve |
| 22 | autre | 0 | non | 5 | faible |

## Données et sources

- `shodan-internetdb` : consultation de l'API publique gratuite, aucun scan actif, aucune
  ouverture de port. Chaque ligne du corpus cite `https://internetdb.shodan.io/<ip>`.
- EPSS : API publique FIRST (`https://api.first.org/data/v1/epss`), lue au moment de la
  collecte pour chaque CVE observée — jamais recopiée d'un cache.
- KEV : flux JSON officiel CISA
  (`https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`),
  complété par les événements `kev:` déjà collectés.
- Risque produit quand l'hôte ne rend aucune CVE : CVE vérifiée sur NVD, EPSS lu chez FIRST,
  KEV lu chez CISA. La ligne garde `source_url` (InternetDB) et `preuve_url` (NVD) séparés.
- Les lignes du corpus `exposition_risque_mesure` ne contiennent ni organisation, ni nom de
  victime, ni contenu de page : seulement catégorie, port, produit, version, EPSS, KEV,
  source et date de consultation.
- Aucune source nationale n'est présentée comme locale : seules les organisations dont le
  département est l'un des douze de Nouvelle-Aquitaine sont interrogées, et les hébergeurs
  mutualisés (> 50 ports sur l'hôte) sont écartés.
- Le rapport de collecte ne conserve ni nom d'organisation, ni domaine, ni slug : uniquement
  les métadonnées techniques, la source primaire et la date de consultation.

## Reproduction

```bash
# collecte : domaines des organisations NA, domaines enrichis, corpus public
# et IP déjà inventoriées ; --sql écrit le corpus rejouable, --apply écrit en base.
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  INTERNETDB_READER=https://r.jina.ai/ \
  pnpm collecte:exposition-risque -- \
    --limit=800 --extra-limit=3000 --ip-limit=5000 --max-hosts=920 \
    --concurrency=3 --delay=300 \
    --report=bench/results/exposition-risque-2026-11-22.json \
    --sql=db/migrate-204-exposition-risque-corpus.sql

# reprise sans réseau : régénère rapport et SQL depuis le cache disque
pnpm collecte:exposition-risque -- --cache-only --max-hosts=6000 \
  --report=bench/results/exposition-risque-2026-11-22.json \
  --sql=db/migrate-204-exposition-risque-corpus.sql

# vérification du critère, sortie brute
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm verifie:exposition-risque
```

`INTERNETDB_READER` n'est qu'un transport : InternetDB limite les appels par adresse source et
répond 429 depuis cette machine. Le lecteur public récupère l'URL primaire ; `source_url`
reste l'URL Shodan, jamais le lecteur.

La vue ne garde que les lignes de moins de sept jours. Le corpus doit donc être rafraîchi par
la collecte ; une ligne plus ancienne disparaît au lieu de vieillir silencieusement. La
migration `204` est le cliché rejouable de la mesure du 22 novembre 2026.

## Limites

- EPSS et KEV sont observés au niveau de l'hôte par InternetDB, pas prouvés port par port,
  sauf quand le signal vient du produit lui-même (indiqué par `preuve_url`).
- Le classement est un ordre de priorité, pas une preuve d'exploitation d'un service donné.
- La collecte dépend de la couverture publique d'InternetDB : un service absent de sa base
  n'est pas mesuré, et l'absence de preuve n'est pas une preuve d'innocuité.
- Aucun scan actif, aucune authentification, aucun contenu de service n'est collecté.
