# Collecte externe — corpus témoin d'incidents cyber Nouvelle-Aquitaine

## 1. Ce qui a été collecté

- **Bloc 1 — Corpus témoin** : `bench/fixtures/corpus-temoin-na.json`, **20 incidents consignés**, dont **16 incidents datés dans la fenêtre 2025-11-01 → 2026-10-31** et **4 incidents/contextes hors fenêtre** (`na-2026-007` Fumel 2025-10-03, `na-2026-008` collège La Salle janvier 2025, `na-2026-014` Coaxis 2023, `na-2026-015` mairie de Sarran 2024), conservés explicitement à titre de vérification et **à exclure du comptage sur la fenêtre**. Pour l'analyse de couverture sur la fenêtre, il faut donc compter les incidents dont `dateIncident`/`datePublique` tombe entre `2025-11-01` et `2026-10-31` et exclure ces deux entrées hors fenêtre.
- **Blocs 2, 3 et 4** : les fichiers `db/data/sante-na.json`, `db/data/enseignement-na.json` et `bench/results/sources-probe.json` présents dans l'arbre ont été générés/structurés au cours de travaux antérieurs de la session ; `db/data/entreprises-na.json` reste absent. La présente livraison se concentre sur le bloc 1 demandé en priorité. Les métadonnées des blocs préexistants restent à revalider en détail avant chargement.

## 2. Comment

### Accès web vérifié
- `https://www.cert.ssi.gouv.fr/feed/` ouvert via `curl` : flux accessible, **40 items**.
- **3 premiers titres du flux CERT-FR et leurs dates** :
  1. `Multiples vulnérabilités dans les produits SAP (10 novembre 2026)` — `Tue, 10 Nov 2026 00:00:00 +0000`
  2. `Vulnérabilité dans Atlassian Confluence Data Center (10 novembre 2026)` — `Tue, 10 Nov 2026 00:00:00 +0000`
  3. `Multiples vulnérabilités dans Roundcube (10 novembre 2026)` — `Tue, 10 Nov 2026 00:00:00 +0000`

### Méthode
1. Recherches web par mots-clés et variantes départementales/sectorielles : « cyberattaque », « rançongiciel », « piratage », « fuite de données », « mairie », « EHPAD », « police municipale », « entreprise », « Nouvelle-Aquitaine », « Gironde », « Charente-Maritime », « Landes », « Pyrénées-Atlantiques », « Deux-Sèvres », « Corrèze », « Lot-et-Garonne », avec bornes de temps 2025-2026.
2. Ouverture et lecture des articles/communiqués candidats pour extraire : victime, localisation, date d'incident et/ou de publication, nature de l'incident, impact déclaré, et citation exacte courte.
3. Vérification croisée lorsque possible (presse locale + source officielle + relais spécialisé).
4. Classement selon le niveau de confiance demandé : `etabli` (confirmation officielle/victime/autorité), `rapporte` (presse sans confirmation directe), `declare` (revendication d'attaquant non confirmée).
5. Utilisation du référentiel local `db/data/referentiel-na.json` pour attribuer les codes INSEE (`codeCommune`) ; aucun code inventé.

### Requêtes principales
Les requêtes figurant dans `meta.recherches` du corpus incluent notamment :
- « cyberattaque ransomware hôpital clinique EHPAD Nouvelle-Aquitaine 2025 2026 »
- « cyberattaque mairie collectivité Gironde Charente-Maritime Pyrénées-Atlantiques 2025 2026 »
- « cyberattaque entreprise université lycée Nouvelle-Aquitaine Bordeaux Limoges Poitiers Pau 2025 2026 »
- « cyberattaque piratage fuite données Nouvelle-Aquitaine novembre 2025 à octobre 2026 »
- « EHPAD Champdeniers cyberattaque rançon »
- « Gradignan police municipale cyberattaque données dérobées »
- « Bordeaux Sciences Agro incident sécurité conventions stage »
- « Vignobles Toutigeac ransomware TheGentleman Gironde »

## 3. Ce qui a échoué / limites opérationnelles

- Plusieurs articles **Sud Ouest** sont inaccessibles en texte intégrale depuis l'environnement de collecte (403/redirections/paywall) ; les extraits retenus pour ces pages proviennent d'aperçus/contenus récupérables et restent volontairement courts. Les pages strictement payantes n'ont pas été utilisées comme preuve au-delà des éléments visibles.
- Les pages **Le Littoral** et **Courrier de Gironde** sont partiellement masquées (extraits payants) ; elles servent uniquement de sources additionnelles, pas de citation principale.
- La couverture presse est hétérogène selon les départements ; certains incidents locaux peuvent ne pas avoir été publiés en ligne, ou ne pas être ressortis des recherches.
- Les incidents nationaux touchant plusieurs sites (ex. attaque des installations frigorifiques de supermarchés) sont décrits via des sites NA précis lorsqu'ils sont nommés, mais la liste des sites touchés n'est pas exhaustive.
- Le validateur `--livraison` n'était pas présent sur `origin/master` au moment de la vérification ; il a été récupéré depuis la branche distante `origin/arena/ac2ede57-radar-cyber` pour être exécuté conformément à la commande demandée.

## 4. Licences et usages

- **Sud Ouest** — presse ; citation courte avec lien, sans reproduction d'article complet.
- **France 3 Nouvelle-Aquitaine / franceinfo** — presse ; citation courte avec lien.
- **actu.fr** — presse ; citation courte avec lien.
- **ICI Poitou** — presse ; citation courte avec lien.
- **Ouest-France** — presse ; citation courte avec lien.
- **La Dépêche** — presse ; citation courte avec lien.
- **Le Populaire du Centre** — presse ; contexte Meymac uniquement, hors corpus de la fenêtre.
- **La République des Pyrénées** — presse ; citation courte avec lien.
- **Charente Libre** — presse ; citation courte avec lien.
- **Bordeaux Sciences Agro** — communiqué officiel de l'établissement ; citation avec lien.
- **Fédération Nationale des Chasseurs** — communiqué officiel ; citation avec lien.
- **FrenchBreaches** — recension spécialisée ; citation courte avec lien, utilisée pour documenter des revendications (pas des faits confirmés).
- **CERT-FR / cert.ssi.gouv.fr** — flux public consulté pour vérification d'accès ; non utilisé comme preuve d'incident NA.

## 5. Limites de la collecte

Ce que la méthode ne peut pas voir :
- les incidents **non médiatisés** ou communiqués seulement en interne ;
- les incidents traités par le **CERT Santé** sans publication nominative (rapports agrégés) ;
- les tentatives bloquées sans communication de la victime ;
- les contenus derrière **paywall intégral** ;
- les incidents publiés uniquement dans des canaux non indexés ou non accessibles depuis l'environnement de collecte ;
- les revendications de ransomware **non confirmées** par la victime : elles sont conservées avec `confiance: "declare"` et ne doivent pas être lues comme des incidents établis.

Pour le corpus d'incidents en particulier, les types d'incidents qui passent le plus facilement sous le radar de la presse sont : incidents de santé/médico-social sans impact public annoncé, petites collectivités ayant réglé l'incident sans communiqué, fraudes au président/RIB non portées à la connaissance du public, incidents d'entreprises privées non cotées, et tentatives bloquées avant exfiltration.

## 6. Résultat du validateur

Commande exécutée : `node scripts/validate-external-data.mts --livraison`

Sortie finale copiée telle quelle :

```text
Validation des données externes — /home/jolt/radar-cyber/
Fichiers de données livrés : 4/5
  présent  db/data/sante-na.json
  présent  db/data/enseignement-na.json
  présent  bench/fixtures/corpus-temoin-na.json
  présent  bench/results/sources-probe.json
Codes INSEE de référence : 4517

sante          10008 enregistrement(s)
enseignement   6528 enregistrement(s)
corpus         20 enregistrement(s)
sources        264 enregistrement(s)

0 erreur(s), 1 avertissement(s)
  [avertissement] entreprises fichier — db/data/entreprises-na.json absent

Structure conforme sur 16820 enregistrement(s) réparti(s) dans 4 fichier(s).
Reste à relire les avertissements avant chargement.
```

Code de sortie : `0`. Le validateur `--livraison` accepte ici l'absence du bloc 2 car au moins un fichier de données est présent et le bloc 1 est livré ; l'avertissement restant documente explicitement l'absence de `db/data/entreprises-na.json`.
