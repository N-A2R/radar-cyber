# Sources candidates — URL vérifiées

Vérification du 2026-11-10, méthode unique pour toutes les lignes :
`curl -sS -L -A 'Mozilla/5.0 (X11; Linux x86_64) Chrome/131' -o /dev/null -w "%{http_code}\t%{content_type}\t%{size_download}" --max-time 20 <url>`
Toute URL ci-dessous a été appelée dans cette session ; les codes et tailles sont ceux mesurés.

## Tableau

| Nom | URL vérifiée | Code HTTP | Content-type | Taille | Format | Licence / conditions | Intérêt régional |
|---|---|---|---|---|---|---|---|
| CERT-FR — avis | https://cert.cyber.gouv.fr/avis/feed/ | 200 | application/xml | 23 082 o | RSS 2.0 | Licence Ouverte 2.0 (mentionnée dans les mentions légales) | National, utile comme référentiel de vulnérabilités affectant les administrations et PME de la région |
| CERT-FR — alertes | https://cert.cyber.gouv.fr/alerte/feed/ | 200 | application/xml | 26 106 o | RSS 2.0 | Licence Ouverte 2.0 | Priorité maximale : campagnes d'attaque en cours, à recouper avec les incidents locaux |
| CERT-FR — CTI (menaces) | https://cert.cyber.gouv.fr/cti/feed/ | 200 | application/xml | 26 380 o | RSS 2.0 | Licence Ouverte 2.0 | Groupes APT et IoC visant la France ; corrélation avec les secteurs régionaux (santé, industrie) |
| CERT-FR — IoC | https://cert.cyber.gouv.fr/ioc/feed/ | 200 | application/xml | 10 074 o | RSS 2.0 | Licence Ouverte 2.0 | Flux d'indicateurs techniques exploitable directement par le collecteur |
| CERT-FR — liste des CSIRT | https://cert.cyber.gouv.fr/csirt/ | 200 | text/html | 23 771 o | HTML (page, pas de flux) | Licence Ouverte 2.0 | Annuaire officiel des CSIRT régionaux : sert à identifier le bon interlocuteur pour un incident en Nouvelle-Aquitaine |
| ARS Nouvelle-Aquitaine — actualités | https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite | 200 | application/rss+xml; charset=utf-8 | 15 393 o | RSS 2.0 | À vérifier (site public ARS) | Directement régional ; 17 items au contrôle, dont « Point de situation sur les cas autochtones d'arboviroses » (28/09/2026) |
| ARS Nouvelle-Aquitaine — alertes sanitaires | https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_alerte_sanitaire | 200 | application/rss+xml; charset=utf-8 | 2 426 o | RSS 2.0 | À vérifier | Signal faible mais très spécifique : une alerte sanitaire régionale est souvent le premier indice d'un incident sur un établissement de santé |
| ARS Nouvelle-Aquitaine — communiqués de presse | https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_communiques_de_presse | 200 | application/rss+xml; charset=utf-8 | 19 699 o | RSS 2.0 | À vérifier | Couvre les fermetures d'établissements et incidents déclarés dans la région |
| Recent Breaches — flux | https://recentbreaches.com/feed.xml | 200 | application/rss+xml; charset=utf-8 | 30 349 o | RSS 2.0 | Gratuit usage personnel/recherche/journalisme, attribution obligatoire, usage commercial non accordé par défaut (page /terms) | Fuites de données mondiales ; filtre par secteur/entité régionale à faire côté collecteur |
| Recent Breaches — API JSON | https://recentbreaches.com/api/breaches | 200 | application/json | 23 153 o | JSON (sans clé) | Idem flux ; CORS ouvert, cache ~10 min | Alternative structurée au RSS, ~50 dernières fuites, paramètre `?limit=` |
| Privacy Unpacked | https://privacyunpacked.com/feed.xml | 200 | text/xml; charset=utf-8 | 34 801 o | RSS 2.0 | À vérifier (aucune mention de licence trouvée sur le site) | Veille vie privée/RGPD, utile pour la qualification CNIL des incidents |
| BreachTally | https://breachtally.com/feed.xml | 200 | application/rss+xml; charset=utf-8 | 30 323 o | RSS 2.0 | À vérifier | Agrégateur de fuites ; recoupement des revendications |
| Cybermalveillance.gouv.fr — flux complet | https://www.cybermalveillance.gouv.fr/feed/atom-flux-complet | 200 | application/rss+xml; charset=utf-8 | 15 177 o | RSS 2.0 | Licence Ouverte 2.0 (mentions légales) | Vulgarisation et alertes grand public ; bon canal pour les TPE/PME et collectivités de la région |
| Cybermalveillance.gouv.fr — alertes | https://www.cybermalveillance.gouv.fr/feed/atom-flux-alertes | 200 | application/rss+xml; charset=utf-8 | 1 283 o | RSS 2.0 | Licence Ouverte 2.0 | Volume faible mais signal fort : campagne active signalée au grand public |
| data.gouv.fr — jeu de données SIRENE (API) | https://www.data.gouv.fr/api/1/datasets/base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret/ | 200 | application/json | 63 200 o | JSON | lov2 (Licence Ouverte 2.0), producteur Insee | Permet de résoudre SIREN/SIRET et l'adresse des victimes régionales ; donne aussi l'URL courante des exports (versions datées) |
| SIRENE — export Parquet StockUniteLegale | https://static.data.gouv.fr/resources/base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret/20261103-095402/stock-stockunitelegale-parquet.parquet | 206 | application/vnd.apache.parquet | 717 824 037 o (range 0-1023 → 1 024 o, magic Parquet confirmé) | Parquet | lov2 | Référentiel complet des entreprises, sans clé, téléchargement direct |
| SIRENE — export CSV ZIP StockUniteLegale | https://static.data.gouv.fr/resources/base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret/20261103-091933/stock-stockunitelegale-csv.zip | 206 | application/zip | 984 970 049 o (range 0-511 → 512 o, ZIP confirmé) | ZIP/CSV | lov2 | Même contenu, si le pipeline ne lit pas Parquet |
| API Recherche d'entreprises (Etalab) | https://recherche-entreprises.api.gouv.fr/search?q=cyber&departement=87 | 200 | application/json | 45 334 o | JSON (sans clé) | Licence Ouverte 2.0 (à confirmer sur la fiche data.gouv) | **Le plus utile du lot** : recherche plein texte + filtre par département, donc requêtable pour toute la Nouvelle-Aquitaine (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87) sans télécharger 700 Mo |
| Région Nouvelle-Aquitaine — actualités | https://www.nouvelle-aquitaine.fr/actualites | 200 | text/html; charset=UTF-8 | 193 136 o | HTML (aucun flux RSS) | À vérifier | Communiqués régionaux (cybersécurité, aides aux entreprises) ; scraping ou pas de collecte |

## Les 3 à ajouter en premier

1. **API Recherche d'entreprises — `https://recherche-entreprises.api.gouv.fr/search?q=cyber&departement=87`** (paramètres `q` et `departement` à substituer)
   La seule source qui rend le référentiel d'entreprises *requêtable* au lieu de téléchargeable : `?q=` + `?departement=` filtrent directement sur la Nouvelle-Aquitaine, sans clé, réponse JSON de 45 Ko. Attention : l'appel sans paramètre `/search` seul renvoie **400** (67 o) — il faut au moins `q`. Elle transforme le rattachement SIREN → commune → secteur en un appel HTTP au lieu d'un téléchargement de 718 Mo (Parquet) ou 985 Mo (ZIP). C'est ce qui permettra de dire « cette fuite touche une PME de 87 » plutôt que « une entreprise française ».
2. **CERT-FR alertes + avis — `https://cert.cyber.gouv.fr/alerte/feed/` et `/avis/feed/`**
   Licence Ouverte 2.0, XML stable, et le seul flux national qui signale une campagne *en cours* avec le niveau d'urgence officiel. À titre de comparaison : CISA KEV déjà en base donne l'exploitation, CERT-FR donne la consigne française et la cible sectorielle, ce qui manque pour qualifier un incident régional. Les deux flux sont distincts et complémentaires (alerte = attaque active, avis = vulnérabilité documentée) ; les prendre tous les deux, pas un seul.
3. **ARS Nouvelle-Aquitaine — `rss.xml?type=ars_actualite` (et `?type=ars_alerte_sanitaire`)**
   La seule source régionale *thématiquement adjacente* à la cyber qui expose un vrai flux : santé, établissements, arrêtés. Un incident cyber dans un hôpital de la région apparaît souvent d'abord comme une actualité ARS avant d'être qualifié cyber. Le flux « alerte sanitaire » est petit (2,4 Ko) mais à très haute précision, donc peu coûteux en bruit.

Ordre de mise en œuvre suggéré : (1) API Recherche d'entreprises pour l'enrichissement, puis (2) CERT-FR alertes/avis pour le déclencheur, puis (3) ARS pour la coloration régionale. Recent Breaches et Cybermalveillance viennent ensuite, ils sont déjà couverts fonctionnellement par RansomLook et la presse en base.

## Pistes écartées

| Piste | URL testée | Résultat | Motif |
|---|---|---|---|
| Recent Breaches (ancien hôte) | https://recentbreaches.azurewebsites.net/rss | `000`, `getent hosts` → NODNS | Le domaine `azurewebsites.net` ne résout plus. La source existe désormais sur `recentbreaches.com` (voir tableau). |
| Privacy Unpacked `/feed/` (chemin WordPress classique) | https://privacyunpacked.com/feed/ | 404 (text/html, 4 683 o) | Chemin inexistant ; le flux réel est `/feed.xml` (200, voir tableau). |
| Campus Cyber Nouvelle-Aquitaine | https://www.campuscyber-na.fr/ | 403 (text/html, 377 o) | WAF bloque le client, y compris `/feed/`, `/rss.xml` et `/actualites` (403 chacun). Aucune URL utilisable sans navigateur authentifié ; le DNS résout bien. À reconsidérer si un accès navigateur est disponible. |
| CSIRT Nouvelle-Aquitaine | `csirt-na.fr`, `www.csirt-na.fr`, `csirt-nouvelle-aquitaine.fr` | NODNS (aucun enregistrement) | Aucun site à ces noms. Le CSIRT régional existe peut-être sous un autre nom, mais je n'ai pas d'URL résolvable à citer — ne pas inventer. La page `cert.cyber.gouv.fr/csirt/` reste le point d'entrée officiel pour l'identifier. |
| Région Nouvelle-Aquitaine — flux RSS | https://www.nouvelle-aquitaine.fr/feed/ | 404 (110 722 o) | Pas de RSS. Testés également : `/rss.xml` 404, `/rss` 404, `/flux-rss` 404. Seul le HTML `/actualites` répond (200). |
| Préfecture de la Gironde — flux RSS | https://www.gironde.gouv.fr/rss.xml | 404 (89 500 o) | Sites préfectoraux sans flux. Testés : `/feed/` 404, `/Actualites/Communiques-de-presse/rss` 404, `/rss/actualites` 404, `/actualites/rss.xml` 404. |
| Préfecture des Pyrénées-Atlantiques — flux RSS | https://www.pyrenees-atlantiques.gouv.fr/rss.xml | 404 (80 809 o) | Idem Gironde ; `/feed/` également 404. Les deux sites répondent en HTML (200) sur `/Actualites`, donc seul du scraping serait possible. |
| API SIRENE INSEE V3 (officielle, par SIREN) | https://api.insee.fr/entreprises/sirene/V3.11/siren/552100554 | `000`, curl (92) HTTP/2 stream reset / (56) connexion réinitialisée | Le domaine résout (194.254.37.207) mais la passerelle coupe la connexion sans jeton OAuth. **Accès avec clé obligatoire** → écartée au profit de `recherche-entreprises.api.gouv.fr` et des exports data.gouv, tous deux sans clé. |
| CERT-FR — anciens chemins de flux | https://cert.cyber.gouv.fr/feed/avis/ et /feed/alerte/ | 200 mais `text/html` sur `error-404/index.html` (19 585 o) | Piège classique : ces URL renvoient 200 avec une page 404 en HTML. Les bons chemins sont `/avis/feed/` et `/alerte/feed/`. À ne pas confondre avec `/feed/` (200, `application/xml`, 23 233 o) qui est un flux global valide. |

## Notes de mise en œuvre

- **Piège de vérification** : `curl -sE -o /dev/null ...` ne teste rien — `-E` est `--cert`, qui consomme `-o` comme nom de certificat, d'où un `000` général et l'erreur 58 (`CURLE_SSL_CLIENTCERT`). Utiliser `-sS` + `-L`.
- Certaines URL renvoient **200 avec une page 404 HTML** (voir CERT-FR ci-dessus). Le contrôle qualité doit donc vérifier le `content-type` en plus du code.
- Les exports SIRENE data.gouv sont **versionnés par date dans l'URL** (ici `20261103-*`). Ne pas coder ces URL en dur : lire l'URL courante via l'API dataset (ligne 15 du tableau), qui renvoie la ressource la plus récente.
- Aucune source de ce document n'est un forum criminel ou une marketplace ; Recent Breaches et BreachTally agrègent des revendications publiques de fuites, pas des données volées.
