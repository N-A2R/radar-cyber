# Échantillons réels des parseurs

Corps capturés le 21 novembre 2026 sur des sources publiques, avec un GET
navigateur (`redirect: follow`). Les fichiers sont des **octets réels** ou des
extraits délimités aux balises utiles ; aucun champ n'a été inventé. Quand un
extrait est délimité, seules les balises fermantes nécessaires à l'isolement du
bloc ont été ajoutées (article/main). Les tests ne réseau pas : ils lisent ces
extraits figés.

| Fichier | URL d'origine | Format | Nature de l'extrait |
| --- | --- | --- | --- |
| `rss2.xml` | https://www.cert.ssi.gouv.fr/feed/ | RSS 2.0 | flux complet (40 items) |
| `atom.xml` | https://www.zdnet.com/topic/security/rss.xml | Atom 1.0 | flux complet (25 entries) |
| `jsonld.html` | https://github.blog/open-source/maintainers/the-best-things-in-open-source-are-built-together/ | JSON-LD | balise `application/ld+json` réelle (sans résumé dans la source) |
| `jsonld-article.html` | https://www.bleepingcomputer.com/news/security/badbox-30-botnet-returns-with-record-breaking-40-billion-daily-ad-requests/ | JSON-LD | balise `NewsArticle` réelle, quatre champs présents |
| `html-article.html` | https://krebsonsecurity.com/2026/11/cto-of-ransomwarehelp-indicted-for-wire-fraud/ | HTML `<article>` | `<head>` réel + bloc `<article>` réel ; la page ne porte pas de date de publication en métadonnée |
| `html-main.html` | https://www.cisa.gov/news-events/cybersecurity-advisories | HTML `<main>` | quatre cartes `<article class="c-teaser">` réelles, regroupées dans un `<main>` |
| `html-sections.html` | https://msrc.microsoft.com/blog/ | HTML `<main>` | première tranche du `<main>` réel, sections `<h2>` avec liens |
| `json-maison.json` | https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=2 | JSON maison | réponse NVD complète (2 CVE, enveloppe `vulnerabilities[].cve`) |

Les contenus évoluent sur les sites d'origine : les tests vérifient la structure
et les champs des extraits figés, pas l'état courant des sites.
