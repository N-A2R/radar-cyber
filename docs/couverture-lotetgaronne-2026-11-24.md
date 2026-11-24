# Couverture Lot-et-Garonne — recherche de saturation (24 novembre 2026)

## Périmètre

Le tableau de `bench/couverture/README.md` donne le Lot-et-Garonne à **1 ligne sur 50**
dans le corpus consolidé mesuré (`na-couv-029`, Ville de Fumel). C'est le département
le moins couvert de Nouvelle-Aquitaine. Le corpus de travail par département est
`bench/corpus/incidents-lotetgaronne.jsonl` : 11 lignes, publications du 2024-11-07 au
2026-11-05. Ce chantier n'a ni modifié ni reconsolidé `bench/couverture/` : le chiffre
publié (0/50) et son empreinte restent intacts.

Règles appliquées : sources publiques, gratuites et lues passivement ; aucune donnée
personnelle, aucun SIREN, aucun forum criminel, aucune date ou preuve inventée ; une
ligne par événement réel, daté, localisé en Lot-et-Garonne, avec URL publique, extrait
mot pour mot et date de publication lue sur la page.

## Requêtes publiées et résultats

Moteur : `web_search` (plusieurs fournisseurs, dont Tavily et DuckDuckGo selon la
disponibilité) et flux RSS de Google Actualités, requêtes en français, fenêtre
2024-01-01 → 2026-11-24. Aucun accès payant, aucun scrape de forum.

| # | Requête | Résultat |
| --- | --- | --- |
| 1 | `cyberattaque Agen Lot-et-Garonne 2026 piratage mairie entreprise` | Fumel (déjà `na-lg-001`) ; agglo d'Agen sans date d'incident |
| 2 | `"Lot-et-Garonne" cyberattaque 2025 piratage données Marmande Agen Villeneuve` | Fumel uniquement ; Agglo d'Agen et Coaxis sans incident 2025 daté |
| 3 | `site:actu.fr "Lot-et-Garonne" cyberattaque OR piratage 2026` | Coaxis (2023), Fumel, supermarchés ; aucun fait nouveau |
| 4 | `site:france3-regions.franceinfo.fr/nouvelle-aquitaine/lot-et-garonne cyberattaque piratage` | Fumel uniquement |
| 5 | `"Lot-et-Garonne" "cyberattaque" 2026 site:ladepeche.fr` | FNC (`na-lg-004`), supermarchés (`na-lg-005/006`), La Sauvegarde (`na-lg-010`) |
| 6 | `"Lot-et-Garonne" "piratage" 2025 commune OR lycée OR association` | La Sauvegarde (`na-lg-002`), Fumel |
| 7 | `"Marmande" cyberattaque 2026 OR 2025 entreprise piratage données` | Aucun incident 2025/2026 localisé à Marmande trouvé |
| 8 | `"Agen" cyberattaque 2024 2025 2026 piratage système informatique` | Incidents nationaux hors région ; rien sur Agen |
| 9 | `"Lot-et-Garonne" "arnaque au président" mairie OR association 2024 2025 2026` | Aucune victime nommée en 47 |
| 10 | `"Lot-et-Garonne" "données" "piratage" hôpital OR clinique OR laboratoire 2025 2026` | Novabio (`na-lg-011`) ; aucun hôpital/clinique du 47 |
| 11 | `"Villeneuve-sur-Lot" cyberattaque OR piratage informatique 2025 2026` | Aucun incident localisé trouvé |
| 12 | `site:cyberattaque.org "Lot-et-Garonne" OR Agen OR Marmande OR Fumel OR Villeneuve` | Une seule page : Novabio (`na-lg-011`) |
| 13 | `"Nérac" OR "Tonneins" OR "Casteljaloux" cyberattaque piratage informatique 2024 2025 2026` | Aucun incident localisé trouvé |
| 14 | `"Fauguerolles" OR "Saint-Macaire" OR "Sainte-Bazeille" cyberattaque piratage données` | Coaxis (2023) uniquement |
| 15 | `"Lot-et-Garonne" "attaque informatique" 2024 commune entreprise` | Fumel, start-up anonyme (victime non nommée) |
| 16 | `"Lot-et-Garonne" "usurpation" SMS mairie 2026 arnaque` | Montauban (82) et Figeac (46), hors 47 |
| 17 | `"cyberattaque" "Lot-et-Garonne" 2026 -Fumel -Marmande -chasseurs` | Coaxis 2023 et Novabio, déjà au corpus |
| 18 | `"piratage" "Lot-et-Garonne" 2026 site:ladepeche.fr -chasse` | Aucun incident nouveau ; actualités nationales |
| 19 | `"fuite de données" "Lot-et-Garonne" entreprise 2025 2026` | Aucune entreprise du 47 nommée |
| 20 | `"arnaque" SMS "mairie" "Lot-et-Garonne" 2025 2026` | Aucune commune du 47 nommée |
| 21 | `site:actu.fr/nouvelle-aquitaine/lot-et-garonne cyberattaque piratage` | Fumel, Coaxis, La Sauvegarde : déjà au corpus |
| 22 | `site:actu.fr/nouvelle-aquitaine/agen_47001 cyberattaque OR piratage OR hackers` | Aucun incident ; résultats économiques sans rapport |
| 23 | `site:petitbleu.fr cyberattaque Agen Marmande Fumel piratage` | Fumel, FNC, La Sauvegarde, Coaxis : déjà traités |
| 24 | `"cyberattaque" "Lot-et-Garonne" association 2025 pirate rançon` | La Sauvegarde (`na-lg-002`) |
| 25 | `site:fuitesinfos.fr Agen OR Marmande OR "Lot-et-Garonne" fuite données entreprise` | Aucune fiche locale |
| 26 | `site:frenchbreaches.com "Lot-et-Garonne" OR Agen OR Marmande breach` | Aucune alerte locale |
| 27 | `"Super U" OR "Leclerc" OR "Carrefour" Villeneuve-sur-Lot cyberattaque frigos octobre 2026` | Aucun magasin de Villeneuve nommé ; Marmande seulement |
| 28 | `"cyberattaque" "Agen" 2026 mairie OR hôpital OR entreprise site:francebleu.fr OR site:ici.fr` | Aucun incident local |
| 29 | `site:cnil.fr "Lot-et-Garonne" violation données sanction 2025 2026` | Aucune sanction locale ; sanctions de collectivités pour manquements, pas des incidents |
| 30 | `"tribunal" OR "cour d'appel d'Agen" cyberattaque piratage 2025 2026` | Aucune affaire locale datée |
| 31 | `"Lot-et-Garonne" "cyberattaque" décembre 2025 OR novembre 2025 OR août 2025` | Fumel uniquement |
| 32 | `"Prix de l'économie Néo Aquitains 2026" "ciblée par les hackers"` | Coaxis, incident 2023 |
| 33 | `"Je voulais intégrer Science Po" deux ados condamnés piratage Pronote lycée` | Aucun établissement du 47 identifié |
| 34 | `"Agglo d'Agen" cyberattaque pirate rançon date attaque informatique` | Témoignage d'attaque sans date ni page d'incident lisible |
| 35 | `"Weda" cyberattaque "Lot-et-Garonne" médecins Agen cabinet 2025` | Aucun cabinet du 47 nommé ; wave nationale déjà documentée ailleurs |
| 36 | Google Actualités RSS `cyberattaque "Lot-et-Garonne"` | 10 titres : Fumel, Novabio, FNC, Coaxis, supermarchés, La Sauvegarde — tous déjà au corpus ou hors fenêtre |
| 37 | Google Actualités RSS `piratage "Lot-et-Garonne"` | FNC, Palissy (`na-lg-007`), Fumel, Coaxis, La Sauvegarde |
| 38 | Google Actualités RSS `cyberattaque Agen OR Marmande OR Fumel when:900d` | Intermarché Marmande, Fumel, La Sauvegarde, Garonn'Hack (événement, pas incident) |
| 39 | Google Actualités RSS `"données" volées "Lot-et-Garonne"` | FNC (arrestation en avril 2026), fisc (national), Coaxis (2023) |
| 40 | Google Actualités RSS `escroquerie informatique "Lot-et-Garonne"` | Aucun incident cyber local |
| 41 | Google Actualités RSS `cyberattaque "Villeneuve-sur-Lot" OR "Nérac" OR "Tonneins"` | La Sauvegarde, Intermarché Marmande, CH Marmande-Tonneins (2021) |
| 42 | `site:lot-et-garonne.gouv.fr cyberattaque piratage commune 2025 2026` | Aucun communiqué cyber local |
| 43 | `site:agma47.fr OR site:sdis47.fr OR site:ch-marmande.fr cyberattaque piratage` | Aucun incident daté trouvé |
| 44 | `"Lot-et-Garonne" "cyberattaque" 2024 mairie OR collège OR lycée OR hopital -Fumel` | Aucun incident 2024 localisé ; WEDA et académie de Toulouse hors 47 |

Une recherche locale complémentaire dans `bench/corpus/*.jsonl` (mots-clés
`Lot-et-Garonne|Agen|Marmande|Fumel|Villeneuve-sur-Lot`) n'a fait ressortir aucun
incident cyber daté absent de `incidents-lotetgaronne.jsonl` : les autres occurrences
sont des sources d'institutions, des flux de presse générale ou des doublons d'événements.

## Pages lues — extraits et décisions

| Page (date de publication lue) | Extrait mot pour mot | Décision |
| --- | --- | --- |
| [Sud Ouest, 12 octobre 2026](https://www.sudouest.fr/economie/cybersecurite/cyberattaque-dans-les-supermarches-75-000-euros-de-pertes-a-intermarche-marmande-un-acte-ecoeurant-selon-la-directrice-31038815.php) — « Le surgelé, le rayon frais libre-service, les étals de fromages, de charcuterie et de viande : tout est hors service dans le magasin Intermarché de Marmande. » | déjà `na-lg-005` ; la mise à jour du 13 octobre cite aussi Carrefour Market, déjà `na-lg-006` | non ajouté (déduplication) |
| [Sud Ouest, 11 septembre 2026](https://www.sudouest.fr/lot-et-garonne/agen/c-est-problematique-un-lycee-d-agen-victime-de-piratage-pronote-et-les-emplois-du-temps-en-ligne-indisponibles-30558465.php) — « il faut que tout le monde prenne ses marques dans un contexte de rentrée perturbée par un piratage d’ampleur » | déjà `na-lg-007` ; l'extrait porte sur l'organisation de la rentrée, pas sur des élèves identifiables | non ajouté (déduplication) |
| [Petit Bleu, 6 octobre 2025](https://www.petitbleu.fr/2025/10/06/cyberattaque-a-fumel-le-groupe-dragon-force-paralyse-la-mairie-la-commune-sappuie-sur-son-assurance-cyber-pour-rebondir-12975365.php) — « Dans la nuit de jeudi à vendredi, le système informatique de la mairie de Fumel a été victime d’une cyberattaque d’ampleur. » | même événement que `na-lg-001` (3 octobre 2025), source différente | non ajouté (déduplication) |
| [Cyberattaque.org, 5 novembre 2026](https://www.cyberattaque.org/le-laboratoire-novabio-victime-de-deux-cyberattaques-des-donnees-de-sante-en-fuite) — « Novabio est un réseau de laboratoires de biologie médicale implanté principalement en Dordogne, mais également en Corrèze et dans le Lot-et-Garonne. » | déjà `na-lg-011` ; les deux incidents de la page y sont décrits | non ajouté (déduplication) |
| [Actu.fr, 12 mars 2024](https://actu.fr/nouvelle-aquitaine/marmande_47157/cyberattaque-massive-en-lot-et-garonne-comment-les-entreprises-sen-sont-sorties_60811091.html) — « La cyberattaque contre l’hébergeur informatique Coaxis survenue le 8 décembre dernier a ainsi mis des centaines de salariés au chômage technique dans le département » | incident **8 décembre 2023**, hors fenêtre 2024-2026 | non ajouté (hors période) |
| [Sud Ouest, 10 novembre 2026](https://www.sudouest.fr/lot-et-garonne/marmande/des-tentatives-de-piratage-tous-les-jours-d-une-enquete-locale-a-une-traque-internationale-une-entreprise-de-lot-et-garonne-victime-de-malveillance-temoigne-dans-un-documentaire-choc-31417296.php) — « Près de trois ans après la cyberattaque qui lui a coûté des millions d'euros, la plaie est à peine refermée. » | documentaire sur l'attaque Coaxis de décembre 2023 : même fait, hors fenêtre | non ajouté (hors période/déduplication) |

Quatre pistes ont été écartées sans ajout : la start-up piratée citée sans nom par
Sud Ouest en 2025 (victime anonyme), la fuite de l'Association des maires de France en
septembre 2026 (aucune commune du 47 explicitement nommée dans la page lue), la
mise en cause d'un cyberpirate en avril 2026 dans l'affaire FNC (même incident que
`na-lg-004`, titre seul consulté) et les alertes nationales DGFiP/AMF (pas d'ancrage
local documenté). La revendication Ledil Immobilier, déjà présente en `na-lg-008`,
n'a pas été relue ni étendue : elle repose sur une publication de forum criminel,
donc hors des critères de ce chantier.

Aucune ligne n'a été ajoutée au corpus départemental : les 44 requêtes et les pages
lues n'ont produit aucun incident public, daté, sourcé, localisé dans le 47 et distinct
des 11 déjà présents. C'est une **preuve de plafond** sur les sources gratuites et
publiques consultées, pas une affirmation qu'aucun incident n'a eu lieu dans le département.

## Validation du corpus

```bash
cd /tmp/radar-parallel2/corpus-gaps
mkdir -p /tmp/valider-lg && cp bench/corpus/incidents-lotetgaronne.jsonl /tmp/valider-lg/
apps/api/node_modules/.bin/tsx scripts/valider-corpus.mts \
  --dir=/tmp/valider-lg --json=/tmp/valider-lg/rapport.json --concurrence=6
```

Résultat observé le 2026-11-24 à 22:06 UTC (`genereLe` du rapport) :
**11 lignes, 11 URL, 11 valides, 0 morte, 0 sans contenu, 0 incohérente, 100 %**,
repli lecteur : 0. Chaque URL est recalculée par le validateur du dépôt, avec
exigence d'un jeton discriminant du nom de l'organisation dans le texte lu.

## Limites

- Seules les sources accessibles sans paiement ni compte et indexées par les moteurs
  interrogés ont été couvertes ; les incidents non médiatisés ou communiqués seulement
  en interne échappent à la recherche, comme le note déjà `bench/couverture/README.md`.
- Les articles de presse régionale affichés comme « réservés aux abonnés » ont été lus
  sur leur page publique ; aucun texte payant n'a été contourné ni reproduit.
- Le corpus consolidé de 50 incidents, son empreinte `bench/couverture/HASH` et le
  rapport `bench/results/couverture-mesuree.json` n'ont pas été modifiés : la mesure
  0/50 publiée reste celle du 21 novembre 2026.
