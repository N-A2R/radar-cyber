# Couverture des sources « numerique » — Charente (16)

OBJECTIF : atteint — 10 / 5

10 sources d'information concernant le secteur du numérique en Charente (16),
vérifiées le 2026-11-22. Pour chaque source, le site, la page d'actualités et le
flux ont répondu HTTP 200 sous un user-agent de navigateur (`curl -L`). Les flux
sont bien du XML/RSS (`application/rss+xml`, `application/xml` ou `text/xml`) ;
le flux `actu.fr` a été contrôlé avec un user-agent complet, la version courte
étant renvoyée vers une page Cloudflare « Attention Required ».

| # | source | type | flux |
|---|---|---|---|
| 1 | Charente Numérique | syndicat mixte fibre (16) | https://www.charente-numerique.fr/feed/ |
| 2 | Absolument Angoulême | agence de développement économique | https://www.absolument-angouleme.fr/feed/ |
| 3 | GrandAngoulême | communauté d'agglomération | https://www.grandangouleme.fr/feed/ |
| 4 | IUT Angoulême — Université de Poitiers | formation en informatique | https://iut-angouleme.univ-poitiers.fr/feed/ |
| 5 | Charente Libre | presse quotidienne régionale | https://www.charentelibre.fr/rss.xml |
| 6 | actu.fr — Charente | presse locale numérique | https://actu.fr/nouvelle-aquitaine/charente_16/rss.xml |
| 7 | France 3 Nouvelle-Aquitaine — Charente | télévision publique | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente/rss |
| 8 | Sud Ouest — édition Charente | presse quotidienne régionale | https://www.sudouest.fr/charente/rss.xml |
| 9 | Eurekatech — technopole de GrandAngoulême | technopole / incubateur | https://www.eurekatech.fr/feed/ |
| 10 | CPME16 | organisation patronale (16) | https://cpme16.fr/feed |

Exemples cyber observés : cyberattaque de la billetterie des Visites Hennessy
à Cognac (Charente Libre), entreprise charentaise de la tech gérant ses mails
par IA exposée à Las Vegas et à l'Élysée (France 3), dojo du programme
1 000 Dojos à Barbezieux-Saint-Hilaire (Sud Ouest), déploiement de la fibre à
Ruffec (Charente Numérique), studios angoumoisins au festival Pixelatl 2026
(GrandAngoulême), formation B.U.T. GEII en génie électrique et informatique
industrielle (IUT Angoulême), « Digital Expresso SPN – La cybersécurité, tous
concernés » (Eurekatech).

Écartées après vérification : `charentelibre.fr/high-tech/`, `/tech/`,
`/numerique/` (404), `angouleme.fr/actualites` (404), `charente.fr`,
`cci-charente.fr` et `technopole-angouleme.fr` (DNS/TLS invalide). Les homonymes
hors du département 16 ont été exclus.

Intégration : `bench/corpus/sources-numerique-16.jsonl`,
`db/migrate-071-sources-numerique-16.sql` (ids `corpus:numerique16-*`,
`department='16'`, 10 sources) et empreinte du corpus `bench/corpus/HASH`.
