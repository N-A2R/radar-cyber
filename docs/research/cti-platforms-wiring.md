# Plateformes open-source de CTI — comment les gens les câblent

Date : 2026-11-10. Métadonnées vérifiées via `gh api repos/<o>/<r>` (stars, dernier push, licence). URLs ouvertes et lues.

## 1. Tableau comparatif

| Outil | Licence | ⭐ | Dernier push | Composants / déploiement | Limites connues |
|---|---|---|---|---|---|
| OpenCTI (OpenCTI-Platform/opencti) | Apache-2.0 (CE) / commercial (EE) | 10 288 | 2026-11-10 | Node.js+React, GraphQL, ES/OpenSearch (≥8.0, 2c/≥8 Go), Redis, RabbitMQ, S3/MinIO, workers Python | Lourd : ES+Redis+Rabbit+MinIO pour démarrer ; ~8 Go RAM mini pour la plateforme seule. Runtime interdit pour nous (voir similar-projects). |
| MISP (MISP/MISP) | AGPL-3.0 | 6 657 | 2026-11-09 | PHP + MySQL + Redis ; feeds TAXII/HTTP, galaxies/taxonomies JSON | Lourd à maintenir, UI vieillissante ; utile comme **source de taxonomies/galaxies JSON** importables en Postgres, pas comme plateforme. |
| ThreatFox (abuse.ch) | service public (pas de code à héberger) | — | — | API REST + exports CSV/JSON, feeds quotidiens ; ingestion via collector maison | Rate limits ; données mondiales bruyantes → filtre anti-bruit obligatoire (cf. contexte). |
| YARA (VirusTotal/yara) + Valhalla (Nextron) | Apache-2.0 (YARA) / commercial (Valhalla) | — | — | Moteur de règles ; Valhalla = repo de règles YARA commerciales | Valhalla payant ; YARA côté détection endpoint, pas CTI ingestion. |
| Yeti (yeti-platform/yeti) | Apache-2.0 | 2 044 | 2026-10-28 | Python/Django + ES ; bulk search observables, YARA/Sigma/DFIQ, export | Plus léger qu'OpenCTI mais toujours ES ; DFIR-oriented. |
| IntelOwl (intelowlproject/IntelOwl) | AGPL-3.0 | 4 811 | 2026-11-10 | Django + Celery + Postgres + RabbitMQ ; catalogue d'analyzers IOC | AGPL → pattern only ; catalogue d'analyzers à copier comme liste. |
| Cuckoo (cuckoosandbox/cuckoo) / CAPEv2 | GPL-3.0 (Cuckoo archivé) | — | archivé | Sandbox dynamique malware, KVM/QEMU | Cuckoo archivé ; CAPEv2 = fork actif mais lourd (VM Windows + KVM). Hors périmètre box instabox. |
| n8n (n8n-io/n8n) | Sustainable Use License (source-available, non-OSI) | 209 989 | 2026-11-10 | Node.js, workflows low-code, 400+ intégrations | Licence non-OSI : ok usage interne, pas de redistribution ; RAM ~1-2 Go. |
| Shuffle (Shuffle/Shuffle) | AGPL-3.0 | 2 477 | 2026-11-10 | Go + React, SOAR, 2500+ apps générées | AGPL ; plus léger que n8n ; orienté playbooks SOC. |
| TheHive (TheHive-Project/TheHive) | AGPL-3.0 | 3 950 | 2025-07-25 (dormant, passé SaaS) | Scala + Cassandra/Elastic ; cases/alerts | Dormant open-source ; éviter. |
| Cortex (TheHive-Project/Cortex) | AGPL-3.0 | 1 646 | 2026-10-20 | Analyzers/responders, dépend de TheHive | Couplé à TheHive ; peu d'intérêt standalone. |

## 2. Comment les gens les relient

- **MISP feeds** : abonnement HTTP à des feeds MISP publics (CIRCL, abuse.ch) → import JSON dans Postgres, dédup par UUID. Pattern = registry déclaratif de feeds (cf. osiris `feedStore.ts`).
- **TAXII 2.1** : standard OASIS pour partager STIX ; OpenCTI/MISP exposent des collections TAXII. Consommation via client Python `taxii2-client`.
- **abuse.ch** : ThreatFox, URLhaus, MalwareBazaar, Feodo Tracker — API REST + dumps quotidiens. Collecteurs maison suffisent (cf. `apps/api/src/collectors/`).
- **RSS / blogs** : collecteurs génériques Fastify → normalisation IOC → Postgres.
- **Honeypots** : T-Pot (Telekom) → export ECS → collecteur. Données régionales précieuses pour NAq.
- **SIGMA/YARA** : Yeti stocke règles ; conversion SIGMA→SQL pour filtrage local (sigmac). YARA côté endpoint, pas ingestion.
- **n8n/Shuffle** : orchestration visuelle des playbooks (enrichissement IOC, notification). Alternative à un daemon résident.

## 3. Ce que les retours d'expérience disent

- OpenCTI : issues GitHub ~2k ouvertes ; plaintes récurrentes sur la lourdeur (ES + Rabbit + Redis) et le coût RAM pour petites équipes ; la CE manque de RBAC/SSO (réservé EE). Source : https://github.com/OpenCTI-Platform/opencti/issues
- MISP : UI datée, courbe d'apprentissage ; mais galaxies/taxonomies = référence. Source : https://github.com/MISP/MISP/issues
- n8n : licence Sustainable Use bloque la redistribution ; pour usage interne OK. Très grosse communauté. Source : https://github.com/n8n-io/n8n
- Shuffle : moins de traction, AGPL ; bon pour playbooks SOC légers. Source : https://github.com/Shuffle/Shuffle
- TheHive : abandonné en open-source au profit du SaaS ; ne pas investir.
- IntelOwl : AGPL mais catalogue d'analyzers utile comme liste.

## 4. Alternatives légères (notre voie)

Un simple ETL + PostgreSQL (notre choix) : collecteurs TS maison, normalisation IOC, filtre anti-bruit (522k→65), Postgres 18, React 19 + MapLibre. Pas de plateforme CTI lourde. Avantages : contrôle total, RAM maîtrisée (box 4 vCPU/7 Go), pas de dépendance ES/Rabbit. Inconvénients : pas de graphe STIX natif, pas de UI d'investigation riche (à compenser par frontend custom).

## 5. À transposer dans radar-cyber

1. Importer les taxonomies/galaxies MISP (JSON) dans Postgres comme tables de référence (threat-actor, malware) — fichiers JSON directement téléchargeables.
2. Adopter le pattern registry déclaratif de feeds (osiris) dans `apps/api/src/collectors/` pour déclarer les 380 sources.
3. Garder le filtre anti-bruit existant ; ne pas importer les blocklists mondiales brutes.
4. Utiliser n8n (licence interne OK) ou daemon résident pour l'orchestration, pas Shuffle (AGPL) si on diffuse.
5. Consommer ThreatFox/URLhaus/Feodo via collecteurs maison plutôt que déployer une plateforme CTI.
6. Éviter OpenCTI/TheHive/IntelOwl en runtime (AGPL + lourd) ; ne prendre que les schémas/patterns.

## 6. Détail par plateforme (composants, ressources, limites)

### OpenCTI (OpenCTI-Platform/opencti) — Apache-2.0 CE
- Composants : frontend React + API GraphQL (Node.js), workers Python, Elasticsearch/OpenSearch ≥8.0, Redis, RabbitMQ, S3/MinIO.
- Ressources constatées : ≥2 vCPU, ≥8 Go RAM pour la plateforme seule ; OpenSearch seul ~2-4 Go.
- Limites : lourdeur opérationnelle (5 services), RBAC/SSO réservés à l'EE ; CE suffisante pour usage interne.
- Doc officielle : https://docs.opencti.io (vérifié 200).

### MISP (MISP/MISP) — AGPL-3.0
- Composants : PHP (CakePHP) + MySQL/MariaDB + Redis ; workers de fond via `misp-workers`.
- Ressources : ~2 vCPU, ~4 Go RAM minimum.
- Limites : UI datée, courbe d'apprentissage ; valeur principale = taxonomies/galaxies JSON importables.
- Doc officielle : https://www.misp-project.org/documentation/ (vérifié 200).

### Yeti (yeti-platform/yeti) — Apache-2.0
- Composants : Python/Django + Elasticsearch ; bulk search d'observables, YARA/Sigma/DFIQ.
- Ressources : ~2 vCPU, ~4 Go RAM (ES).
- Limites : DFIR-oriented, moins de connecteurs que OpenCTI.
- Repo : https://github.com/yeti-platform/yeti (vérifié 200).

### IntelOwl (intelowlproject/IntelOwl) — AGPL-3.0
- Composants : Django + Celery + PostgreSQL + RabbitMQ ; catalogue d'analyzers IOC.
- Ressources : ~2 vCPU, ~4 Go RAM.
- Limites : AGPL → pattern/liste seulement ; ne pas réutiliser le code.
- Doc officielle : https://github.com/intelowlproject/IntelOwl (vérifié 200).

### n8n (n8n-io/n8n) — Sustainable Use License (source-available, non-OSI)
- Composants : Node.js, workflows low-code, 400+ intégrations.
- Ressources : ~1-2 Go RAM ; CPU léger.
- Limites : licence non-OSI → usage interne OK, pas de redistribution.
- Doc officielle : https://docs.n8n.io (vérifié 200).

### Shuffle (Shuffle/Shuffle) — AGPL-3.0
- Composants : Go + React, SOAR, ~2500 apps générées.
- Ressources : plus léger que n8n ; ~1 Go RAM.
- Limites : AGPL ; moins de traction communautaire.
- Doc officielle : https://github.com/Shuffle/Shuffle (vérifié 200).

### TheHive / Cortex (TheHive-Project) — AGPL-3.0
- TheHive : Scala + Cassandra/Elastic ; dormant (passé SaaS) ; dernier push 2025-07-25.
- Cortex : analyzers/responders, couplé à TheHive.
- Recommandation : éviter l'investissement runtime.
- Repo : https://github.com/TheHive-Project/TheHive (vérifié 200).

## 7. Sources officielles vérifiées

| Outil | URL doc officielle | HTTP |
|---|---|---|
| OpenCTI | https://docs.opencti.io | 200 |
| MISP | https://www.misp-project.org/documentation/ | 200 |
| Yeti | https://github.com/yeti-platform/yeti | 200 |
| IntelOwl | https://github.com/intelowlproject/IntelOwl | 200 |
| n8n | https://docs.n8n.io | 200 |
| Shuffle | https://github.com/Shuffle/Shuffle | 200 |
| TheHive | https://docs.strangebee.com | 200 |
## 8. Synthèse pour radar-cyber (box 4 vCPU / 7 Go)

- OpenCTI et TheHive/IntelOwl sont hors périmètre runtime (lourds, AGPL).
- n8n reste l'option d'orchestration visuelle si besoin, sinon daemon résident (déjà en place pour Hermes).
- MISP : importer uniquement les taxonomies/galaxies JSON comme tables de référence Postgres.
- ThreatFox/URLhaus/Feodo : collecteurs maison (déjà le pattern dans `apps/api/src/collectors/`).
- Yeti : à évaluer si besoin de bulk search d'observables, mais ES à provisionner.
- Cortex : liste d'analyzers utile comme catalogue, pas de déploiement.

## À transposer dans radar-cyber

1. Importer les taxonomies/galaxies MISP (JSON) dans Postgres comme tables de référence (threat-actor, malware).
2. Adopter le pattern registry déclaratif de feeds (osiris) dans `apps/api/src/collectors/` pour déclarer les 380 sources.
3. Garder le filtre anti-bruit existant ; ne pas importer les blocklists mondiales brutes.
4. Utiliser n8n (licence interne OK) ou daemon résident pour l'orchestration, pas Shuffle (AGPL) si on diffuse.
5. Consommer ThreatFox/URLhaus/Feodo via collecteurs maison plutôt que déployer une plateforme CTI.
6. Éviter OpenCTI/TheHive/IntelOwl en runtime (AGPL + lourd) ; ne prendre que les schémas/patterns.
