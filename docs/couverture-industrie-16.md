# Couverture des sources « industrie » — Charente (16)

OBJECTIF : atteint — 12 / 5

12 sources d'information concernant l'industrie en Charente (16), vérifiées le
2026-11-22 : 36 URLs contrôlées avec `curl -L` (site, page d'actualités, flux),
toutes en HTTP 200. Chaque flux a un content-type XML/RSS (`application/rss+xml`,
`application/xml` ou `text/xml`).

| # | source | type | flux |
|---|---|---|---|
| 1 | CPME16 | organisation patronale (16) | https://cpme16.fr/feed |
| 2 | Grand Cognac | agglomération, filière spiritueux | https://www.grand-cognac.fr/rss.xml |
| 3 | Charente Libre — Entreprises | presse locale | https://www.charentelibre.fr/economie/entreprises/rss.xml |
| 4 | Sud Ouest — Charente | presse régionale | https://www.sudouest.fr/charente/rss.xml |
| 5 | France 3 — Charente | télévision publique | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente/rss |
| 6 | actu.fr — Charente | presse locale numérique | https://actu.fr/nouvelle-aquitaine/charente_16/rss.xml |
| 7 | ICI Charente | radio publique | https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml |
| 8 | GrandAngoulême — économie | agglomération | https://www.grandangouleme.fr/feed/ |
| 9 | Absolument Angoulême | agence de développement économique | https://www.absolument-angouleme.fr/feed/ |
| 10 | UIMM — La Fabrique de l'avenir | fédération de l'industrie | https://uimm.lafabriquedelavenir.fr/feed/ |
| 11 | Charente Numérique | syndicat mixte fibre | https://www.charente-numerique.fr/feed/ |
| 12 | Journal des Entreprises — Nouvelle-Aquitaine | presse économique | https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine |

Exemples cyber observés : IA dans une entreprise cognacaise (Charente Libre),
IA pour la gestion des mails dans une entreprise charentaise (France 3),
« Matinée-débat IA et droit du travail » (UIMM), cyberattaque de la billetterie
des Visites Hennessy à Cognac, investissement de Grand Cognac contre les
cybercriminels.

Écartées après vérification : CCI Charente et CCI Nouvelle-Aquitaine (403),
charente.fr (TLS invalide), MEDEF Charente et UIMM Charente (DNS inconnu),
MEDEF Nouvelle-Aquitaine et CMA Nouvelle-Aquitaine (aucun flux RSS),
`/rss.xml` de CPME Nouvelle-Aquitaine (renvoie du HTML). Les homonymes hors du
département 16 ont été exclus.

Intégration : `bench/corpus/sources-industrie-16.jsonl`,
`db/migrate-066-sources-industrie-16.sql` (ids `corpus:industrie16-*`,
`department='16'`, 36 traces `source_verification` en `ok200`).
