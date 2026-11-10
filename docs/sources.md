# Sources de données — Radar Cyber Nouvelle-Aquitaine

Vérifié le **2026-11-09**. Statuts : **VÉRIFIÉ** (réponse HTTP observée) / **DOCUMENTÉ** / **NON VÉRIFIÉ**.

## Collecteurs actifs

| id | Source | URL | Famille | Assertion | Sévérité | Fréquence | ToS / licence | Risque FP |
|---|---|---|---|---|---|---|---|---|
| `cert_fr` | CERT-FR / ANSSI | https://www.cert.ssi.gouv.fr/feed/ | `cert_fr` | `ambient_signal` | 3 | 15 min | ANSSI, diffusion publique | faible |
| `cisa_kev` | CISA KEV | https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json | `vuln` | `confirmed_incident` | 3-5 | 6 h | US Government, public domain | très faible |
| `ransomlook` | RansomLook | https://www.ransomlook.io/api/recent | `ransomware` | `third_party_claim` | 4 | 1 h | CC BY 4.0 | modéré (nom ambigu) |
| `epss` | FIRST EPSS | https://api.first.org/data/v1/epss | `vuln` | `technical_indicator` | 3-5 | 24 h | FIRST, gratuit | nul |

Tous ces points de terminaison ont répondu **HTTP 200** le 2026-11-09 (codes mesurés par `curl -o /dev/null -w '%{http_code}'`).

## Mesures du 2026-11-09

| Mesure | Résultat |
|---|---|
| RansomLook, revendications mondiales sur 30 jours | **1 206** (≈ 40/jour) |
| dont mentionnant une organisation de Nouvelle-Aquitaine | **0** (les 6 « hits » sont des faux positifs : « agency », « Landesentwicklungsgesellschaft ») |
| Groupes les plus actifs | n0n (262), The Gentlemen (124), Qilin (112) |
| `crt.sh` sur `chu-bordeaux.fr` | **28 s**, 43 certificats ⇒ ~50 min pour 111 domaines |
| `ransomware.live` API | **404** sur `/recentvictims`, `/v1/…`, `/v2/…` — API indisponible |
| CERT-FR | 3 flux RSS valides (`/feed/`, `/avis/feed/`, `/alerte/feed/`) |
| CISA KEV | JSON complet, 1,84 Mo |
| EPSS | réponse < 1 s |

## Ce que ces sources ne couvrent pas

- **Phishing régional** : OpenPhish / URLhaus indexent les grandes marques ; une ETI néo-aquitaine y apparaît rarement.
- **Données dark web** : uniquement via un prestataire contractuel (métadonnées, jamais de secret).
- **Scan actif** : hors périmètre du cahier des charges (collecte strictement passive).
- **Certificats en temps réel** : `crt.sh` est trop lent pour un balayage quotidien ; prévoir un flux CT auto-hébergé (`certstream-server-go`).

## Conséquence pour le produit

La couverture régionale provient principalement de **nos propres domaines** (typosquatting, certificats) et des **CVE rattachées aux actifs**. Les flux mondiaux donnent le contexte, pas le signal local.
