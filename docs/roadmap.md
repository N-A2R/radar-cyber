# Radar Cyber — roadmap

Établie le 10 novembre 2026 à partir de 47 réponses. Chaque phase a un critère
de sortie observable. Une phase n'est finie que quand son critère est vrai.

## Ce que le projet doit être à la fin

Un écran allumé en permanence sur un second moniteur, qui montre en direct ce
qui tombe sur les organisations de Nouvelle-Aquitaine. Pas un tableau de bord
qu'on consulte : une veille qui tourne.

Trois propriétés non négociables :

1. **Rien de faux.** Une alerte qui sort doit être défendable devant la personne
   concernée. On préfère rater un signal que d'en inventer un.
2. **Rien d'illisible.** L'information se lit à deux mètres, sans cliquer.
3. **Rien de payant.** Zéro euro. Ce qui coûte de l'argent n'entre pas.

Ce que ce n'est pas : un produit commercial, un outil multi-utilisateurs, une
plateforme CTI complète. Usage personnel, plus quelques personnes de confiance.

---

## État au 10 novembre 2026, mesuré

Ce tableau remplace toute impression : chaque chiffre vient d'une requête ou
d'une exécution, pas d'une estimation.

| Phase | Critère de sortie | Mesure | Verdict |
|---|---|---|---|
| 0 | carte lisible, fil sans hors-sujet, graphe utile | `/api/graph` 500 → 200 en 8 ms ; 2 834 événements EPSS synthétiques purgés ; 12 arcs agrégés par destination | **atteint** |
| 1 | 50 % des événements rattachés | **22 sur 1 932 événements cyber (1,1 %)**, après retrait de 416 rattachements que le texte ne justifiait pas ; 613 organisations, 61 avec un événement | **non atteint** |
| 2 | provenance, confiance, corroboration par alerte | note sur 100 à 4 composantes (source, nature, rattachement, corroboration), seuil 0,65, affichée et détaillée | **livré** |
| 3 | 800 sources actives dont `.onion` | 463 déclarées, 424 actives, 410 en succès, **0 source onion**, Tor non configuré | **non atteint** |
| 4 | vue plein écran autonome | **retiré du produit** le 10 novembre sur décision utilisateur : l'usage réel est la consultation, pas l'écran fixe | **abandonné** |
| 5 | rapport hebdomadaire automatique | timer du lundi 07:00, HTML et Markdown datés | **atteint** |
| 6 | accès distant authentifié, sauvegardes hors site | sauvegarde locale chiffrée AES-256, vérifiée par déchiffrement **et par restauration réelle** ; aucune exposition externe (choix utilisateur) | **partiel** |

### Ce que la mesure a corrigé dans ce plan

1. **La donnée n'était pas du renseignement.** 91 % de la famille `cti` était de
   la presse régionale généraliste, et 85 % de la famille `vuln` était
   l'historique CVE de 1999-2000, aspiré par une source NVD appelée sans
   paramètre de date. Après assainissement : 3 216 événements dont 1 419 cyber,
   contre 7 257 dont on croyait 4 683 utiles.
2. **Le critère « 50 % rattachés » n'est pas atteignable.** Les événements ne
   nomment presque jamais une organisation : même un matcher parfait ne trouve
   que 22 correspondances supplémentaires. Le bon critère est « aucun faux
   positif mesuré », pas un volume.
3. **`geo_type` ne localise rien.** 1 371 événements le portent sans une seule
   coordonnée. Le seul signal régional défendable reste le rattachement à une
   organisation.
4. **29 % des indicateurs étaient des valeurs légitimes.** 200 000 domaines
   populaires et 54 378 réseaux de datacenter sont désormais écartés avant
   insertion.
5. **303 sources répondent en 200 sans rien produire.** Le gisement de
   couverture n'est pas l'ajout de sources, c'est la réparation du parsing.
6. **La règle EPSS était inerte.** La table \`epss\` ne contenait que 100 lignes de test, donc l'admission par score d'exploitabilité rendait zéro événement. Un rafraîchissement réel depuis l'API FIRST est nécessaire avant que la règle serve à quelque chose.

## Phase 0 — Terminer ce qui est cassé

| | |
|---|---|
| **Pourquoi** | trois défauts visibles aujourd'hui : la carte est illisible, le fil contient de la presse non cyber, le graphe ne calcule rien |
| **Sortie** | la carte affiche 12 tracés au lieu de 568 ; aucun article hors sujet dans les 50 derniers événements ; le graphe a une vue qui informe |
| **Coût** | 2 à 3 soirées |

- Agréger les arcs de la carte par destination (284 → 12)
- Filtrer le fil avec le décideur déjà branché : un événement sans organisation
  doit être reconnu comme régional pour entrer
- Remplacer le graphe force-directed par une matrice famille × département
- Ajouter `graphology` pour les calculs, garder le rendu actuel

## Phase 1 — Le référentiel devient fiable

| | |
|---|---|
| **Pourquoi** | 19 organisations sur 529 ont un événement rattaché. Sans rattachement, ni graphe, ni historique, ni observatoire |
| **Sortie** | au moins 50 % des événements sont rattachés à une organisation, avec un taux d'erreur mesuré |
| **Coût** | 1 à 2 semaines |

- Brancher SIRENE pour les noms officiels et les dénominations historiques
- Table `org_alias` : acronyme, ancien nom, marque, période de validité
- Mesurer précision et rappel sur un échantillon annoté à la main
- Ne jamais fusionner une filiale avec sa société mère

## Phase 2 — La confiance devient visible

| | |
|---|---|
| **Pourquoi** | tu as demandé une note unique, mais une alerte a besoin de dire *pourquoi* on la croit |
| **Sortie** | chaque alerte affiche sa provenance, son niveau de confiance, le texte qui l'a déclenchée, et les sources qui la confirment |
| **Coût** | 1 semaine |

- Note unique sur 100, calculée à partir de quatre composantes internes :
  fiabilité de la source, nature de l'affirmation, qualité du rattachement,
  corroboration indépendante
- La note unique reste affichée, les quatre composantes sont consultables
- Statut « à vérifier » pour les décisions du modèle sous le seuil

## Phase 3 — La couverture s'élargit

| | |
|---|---|
| **Pourquoi** | tu veux beaucoup plus de sources, et le dark web public manque |
| **Sortie** | 800 sources actives, dont des pages `.onion` de revendication |
| **Coût** | 2 semaines |

- Tor en proxy SOCKS, collecte des pages publiques de revendication
- Sites de paste et index de fuites publics
- Warninglists MISP pour arrêter de considérer des valeurs légitimes comme des IOC
- Aucun forum criminel, aucune marketplace : la ligne ne bouge pas

## Phase 4 — L'écran mural

| | |
|---|---|
| **Pourquoi** | l'usage réel est un écran fixe, pas une consultation |
| **Sortie** | une vue plein écran qui tourne seule, sans souris, lisible à cinq mètres |
| **Coût** | 1 semaine |

- Quatre zones maximum, une seule animation
- Rafraîchissement automatique par le flux SSE existant
- Mode sans interaction, sortie par une touche

## Phase 5 — Le rapport

| | |
|---|---|
| **Pourquoi** | tu veux un export PDF hebdomadaire, et c'est ce qui rend l'outil transmissible |
| **Sortie** | un PDF hebdomadaire généré automatiquement, avec les incidents de la semaine |
| **Coût** | 1 semaine |

- Gabarit sobre, imprimable en noir et blanc
- Une page par incident, une page de synthèse par département
- TLP:RED exclu de l'export par défaut

## Phase 6 — L'infrastructure

| | |
|---|---|
| **Pourquoi** | tu veux blinder l'infra et la pentester toi-même, plus tard |
| **Sortie** | l'application accessible hors de la machine, derrière une authentification, avec des sauvegardes hors site |
| **Coût** | 1 semaine, et seulement quand les phases 0 à 5 tiennent |

- Cloudflare Tunnel pour l'exposition, sans ouvrir de port
- Cloudflare Access devant l'UI à la place du JWT maison
- **Les données TLP:RED ne sortent pas** par un tiers
- Sauvegarde chiffrée hors site

---

## Ce qu'on ne fait pas

| Écarté | Raison |
|---|---|
| OpenCTI, MISP, TheHive installés | 8 à 16 Go de RAM, et on ne fait pas le même métier |
| Splink, matching probabiliste | on a 19 organisations rattachées ; il faut d'abord en rattacher |
| IntelOwl, Cortex, MISP Modules | Python lourd, AGPL, contraire au « zéro euro » |
| Forums criminels, marketplaces | recel de données volées, même sans usage |
| Deuxième réécriture du design | on a déjà une direction qui tient |

## Les briques open source retenues

| Brique | Rôle | Licence |
|---|---|---|
| `graphology` | algorithmes de graphe | MIT |
| warninglists MISP | arrêter de fausser les IOC | données |
| MISP Galaxy | acteurs et ransomwares | données |
| MITRE ATT&CK STIX | techniques | données |
| `pg-boss` | remplacer la planification maison | MIT |

## Le rythme

Quelques soirées par semaine, projet long, aucune échéance externe. À ce rythme,
les phases 0 à 2 représentent environ un mois, les phases 3 à 5 deux mois de plus.

## Le risque principal

C'est toi qui l'as nommé : **la complexité technique qui s'accumule**. C'est pour
ça que ce document liste autant ce qu'on ne fait pas que ce qu'on fait.

La règle : à chaque fois qu'un composant peut être remplacé par une donnée ou par
un dépôt existant, on prend la donnée ou le dépôt.
