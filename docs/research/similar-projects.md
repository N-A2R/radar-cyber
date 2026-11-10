# Projets similaires — ce qu'on peut prendre

Date : 2026-11-10. Toutes les métadonnées (étoiles, licence, dernier commit) vérifiées aujourd'hui via `gh api repos/<o>/<r>` et `gh api repos/<o>/<r>/license` / `git/trees`. Code HTTP 200 partout sauf mention.

## Cadre légal (rappel, valable pour tout ce doc)

Usage **personnel / interne, non diffusé, non commercial**. Conséquence :

- Copier du code **GPL / AGPL** dans radar-cyber est acceptable **uniquement si le repo reste privé et jamais diffusé**. Sinon : on copie le **pattern** (architecture, algorithme, UX), pas le code.
- Les extraits cités comme « copiables » ci-dessous sont uniquement des projets **MIT / Apache-2.0** (obligation : conserver l'attribution dans le fichier copié).
- Dépôts **sans licence** = pas de droit d'utilisation par défaut → consommation externe (données/API publiques) ou inspiration conceptuelle seulement.

## 1. Cartes de cybermenaces

| Projet | URL | ⭐ | Licence | Dernier commit | Stack | Verdict |
|---|---|---|---|---|---|---|
| osiris | https://github.com/carbon-evolution/osiris | 57 | MIT | 2026-11-10 | Next.js + MapLibre, collectors workers | **RÉUTILISER** — le plus proche techniquement de radar-cyber |
| IRONSIGHT | https://github.com/NoblerWorks-HQ/IRONSIGHT | 676 | MIT | 2026-11-07 | Next.js + TypeScript, map + panels | **ADAPTER** — UX et découpage composants |
| pharos-ai | https://github.com/Juliusolsson05/pharos-ai | 187 | AGPL-3.0 | 2026-05-16 | DeckGL/MapLibre + Prisma | **ADAPTER (pattern seul)** — le mieux structuré en features/map, mais AGPL |
| worldmonitor | https://github.com/koala73/worldmonitor | 90 432 | AGPL-3.0 | 2026-11-10 | dashboard global temps réel | **ADAPTER (pattern seul)** — référence UX n°1, licence interdite au copier-codes si diffusion |
| radar | https://github.com/Syntax-Error-1337/radar | 64 | MIT | 2026-04-09 | React client + Node server, modules par domaine | **ADAPTER** — découpage modulaire (cyber/flight/monitor) |
| geoip-attack-map | https://github.com/MatthewClarkMay/geoip-attack-map | 371 | Apache-2.0 | 2023-09-26 (mort ~3 ans) | Python syslog + JS map | **ADAPTER** — vieux mais parser syslog→geoip simple |
| pewview | https://github.com/AlexGustafsson/pewview | 19 | MIT | 2025-03-09 | Go + TS, globe 3D custom WebGL | **ADAPTER** — shaders globe/arc réutilisables tels quels |
| knock-knock | https://github.com/djkurlander/knock-knock | 214 | MIT | 2026-10-28 | honeypots multi-protocoles + web dashboard + DB IOC | **ADAPTER** — côté données, pas côté carte |
| qeeqbox/raven | https://github.com/qeeqbox/raven | 235 | AGPL-3.0 | 2023-08-08 (mort) | carte de menaces standalone | **ÉVITER** — mort + AGPL ; rien qu'on n'ait déjà |
| HoneyMap | https://github.com/AminZibayi/HoneyMap | 11 | MIT | 2024-07-20 | geo-viz d'attaques honeypot | **ÉVITER** — trop petit, peu de valeur ajoutée vs osiris/IRONSIGHT |
| ransomware_map (OCD) | https://github.com/cert-orangecyberdefense/ransomware_map | 495 | **AUCUNE** (« All rights reserved ») | 2026-02-20 | PDFs uniquement | **ÉVITER (copie)** / **CONSOMMER (référence)** — graphe écosystème ransomware v29 à répliquer comme modèle de données, pas comme asset |
| LiveThreatMap-dashboard | https://github.com/RavinduRathnayaka/LiveThreatMap-dashboard | 31 | MIT | 2026-11-10 | GitHub Action → SVG monde (Shodan) | **ÉVITER** — SVG statique, incompatible avec l'approche MapLibre/deck.gl |

## 2. Plateformes (à ne PAS adopter — prendre schémas/taxonomies)

| Projet | URL | ⭐ | Licence | Dernier commit | Ce qu'on en prend |
|---|---|---|---|---|---|
| OpenCTI | https://github.com/OpenCTI-Platform/opencti | 10 288 | AGPL-3.0 (spdx « NOASSERTION » dans l'API, licence AGPL dans le repo) | 2026-11-10 | Modèle de données STIX 2.1 + grakn/otel : schéma `StixCoreObject`, relations observables↔menaces. Runtime interdit (plateforme lourde, GraphQL+Redis+ES+Rabbit). |
| MISP | https://github.com/MISP/MISP | 6 656 | AGPL-3.0 | 2026-11-09 | Taxonomies & galaxy JSON (galaxies threat-actor, malware) — fichiers JSON directement importables dans Postgres. |
| TheHive | https://github.com/TheHive-Project/TheHive | 3 950 | AGPL-3.0 | 2025-07-25 (dormant, projet passé en closed-source SaaS) | Rien de critique ; modèle case/alert si un jour on gère des incidents. |
| IntelOwl | https://github.com/intelowlproject/IntelOwl | 4 811 | AGPL-3.0 | 2026-11-10 | Catalogue d'analyzers IOC (quels API publics interroger pour enrichir un IP/domaine/hash) — liste à copier, pas le code. |
| misp-dashboard | https://github.com/MISP/misp-dashboard | 219 | AGPL-3.0 | 2023-07-10 (mort) | Idée « contributors ranking + live geo feed » ; code mort, ÉVITER. |

## 3. Observatoires / régionaux / francophones

Rien de réutilisable trouvé :

- Recherche `observatoire cyber` : 4 repos, tous ≤1 ⭐, sans licence, projets étudiants (https://github.com/OumaimaKourchte/observatoire-cyber-rag, https://github.com/Pazificateur69/observatoire-cra). **ÉVITER tous.**
- Recherche `cti france` / `cybersecurite france dashboard` : aucun dashboard CTI francophone actif. Le seul artefact français pertinent est **cert-orangecyberdefense/ransomware_map** (cf. §1) — référence méthodologique d'observatoire (Orange Cyberdefense World Watch), pas un repo de code.
- Org **ANSSI-FR** (https://github.com/ANSSI-FR) : outils d'analyse (ADTimeline GPL-3.0, ORADAD GPL-3.0, bmc-tools CECILL-2.1), aucun observatoire/carte. **Hors périmètre.**
- Conclusion : radar-cyber n'a **pas de concurrent francophone open-source direct** — positionnement à creuser (§5).

## 4. Extraits copiables (licences permissives, avec fichier cible)

| # | Source (licence) | Fichier source | Ce qu'on copie | Cible radar-cyber | Effort |
|---|---|---|---|---|---|
| 1 | osiris (MIT) | `src/lib/feedStore.ts` (1,5 Ko) + `src/lib/feeds/registry.ts` (1,6 Ko) + `src/workers/collectors/threatfox.ts` (1,3 Ko) | Pattern registry de feeds déclaratif + store de déduplication/rétention par feed ; collector ThreatFox comme gabarit de collector (fetch → normalize → dedup) | `apps/server/src/collectors/` (moteur générique) — comparer au moteur RSS/JSON existant, y importer la notion de registry déclaratif | ~0,5 j |
| 2 | IRONSIGHT (MIT) | `src/components/panels/ThreatClock.tsx` (2,0 Ko) | Composant « horloge de menace » (compteur d'événements temps réel) — petit, autonome, React pur | `apps/web/src/components/panels/` | ~2 h |
| 3 | IRONSIGHT (MIT) | `src/components/map/ConflictMap.tsx` (41,7 Ko) | Layout carte plein-écran + panneau latéral + gestion des layers/filtres (à reprendre partiellement, pas en bloc) | `apps/web/src/map/` (adapter vers MapLibre+deck.gl au lieu de son rendu) | ~1–2 j |
| 4 | pewview (MIT) | `frontend/src/rendering/shaders/globe.frag` + `globe.vert` + `halo.frag` | Shaders globe/atmosphère/arc — réutilisables quasi tels quels dans notre couche three.js/3d-tiles | `apps/web/src/three/shaders/` | ~0,5 j |
| 5 | geoip-attack-map (Apache-2.0) | `AttackMapServer/AttackMapServer.py` + `static/map.js` | Parser syslog → extraction IP/port → geolocation → flux d'arcs ; logique à porter en TS pour nos collecteurs | `apps/server/src/collectors/syslog.ts` | ~1 j |

AGPL (pharos-ai, worldmonitor, raven) : **pattern only** — structure `features/map/{components,hooks,lib,state}` de pharos-ai est le meilleur découpage à imiter pour `apps/web/src/map/`, mais aucun fichier ne peut être copié si le repo sort du privé.

## 5. Positionnement (une page)

**Ce que radar-cyber est et qu'aucun projet trouvé ne fait :**

1. **Observatoire régional CTI** — tous les projets trouvés sont globaux (monde) ou mono-organisation (SOC/honeypot). Aucun n'agrège CERT-FR + CISA KEV + EPSS + RansomLook + NVD + crt.sh avec une focale France/régionale.
2. **Stack moderne cohérente** — MapLibre 6 + deck.gl 9.4 interleaved + 3d-tiles. osiris est le seul à combiner MapLibre + feeds CTI, mais sans 3D ni deck.gl ; pewview a la 3D mais pas de CTI.
3. **Francophone** — vide total côté open-source francophone (§3).

**Ce qu'on devrait copier, et chez qui :**

| Besoin radar-cyber | Chez qui | Pourquoi |
|---|---|---|
| Moteur de collecte déclaratif (feeds registry, dedup, rétention) | **osiris** (MIT) | Le plus proche de notre moteur RSS/JSON ; petit code, lisible |
| UX dashboard temps réel (panels, feeds latéraux, horloge) | **IRONSIGHT** (MIT), pattern **worldmonitor** (AGPL, inspiration visuelle seulement) | IRONSIGHT copiable, worldmonitor = référence d'expérience utilisateur |
| Découpage front `features/map/*` (components/hooks/lib/state) | **pharos-ai** (AGPL, pattern) | Meilleure architecture front map vue, mais code verrouillé |
| Shaders globe/arc 3D | **pewview** (MIT) | Seul projet avec shaders propres et permissifs |
| Modèle de données menaces (STIX, taxonomies, galaxies) | **OpenCTI / MISP** (AGPL, données JSON importables) | Les galaxies MISP sont des données, pas du code — importables |
| Graphe écosystème ransomware (groupes, filiations, timeline) | **cert-orangecyberdefense/ransomware_map** (sans licence, référence) | À répliquer comme schéma Postgres, en citant la source, sans copier le PDF/contenu |
| Enrichissement IOC (quels API interroger) | **IntelOwl** (AGPL, catalogue d'idées) | Liste d'analyzers à reproduire en collecteurs |

**Pièges identifiés :** raven et misp-dashboard (morts + AGPL), geoip-attack-map (mort, mais Apache-2.0 → copie légitime), ARGUS (https://github.com/0xhav0c/ARGUS, licence NOASSERTION → statut juridique incertain, ÉVITER la copie), Threatelligence (https://github.com/syphon1c/Threatelligence, **sans licence**, mort 2014), plateformes OpenCTI/MISP/TheHive/IntelOwl (AGPL + poids opérationnel incompatible avec « briques, pas plateformes »).
