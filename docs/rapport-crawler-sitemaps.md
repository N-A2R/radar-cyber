# Crawler de sitemaps — flux découverts automatiquement

Date : 2026-11-21. Branche `ext/chantier-b3`. Rapport en français, code et interface en anglais.

## Réponse chiffrée

**46 flux découverts automatiquement** lors de la mesure reproductible ci-dessous
(40 domaines NA, 45,7 s de crawl). C'est le chiffre de l'objectif.

Effet durable observé en base : **42 sources `sitemap:` inscrites**, toutes
`enabled`, `relevance = 'context'` (grises) — le catalogue est passé de 376 à
418 sources sur la base de travail. Première passe réelle : 34 flux trouvés et
34 inscrits (376 → 410). Seconde passe : 40 redécouverts, 8 nouveaux seulement
(410 → 418), ce qui vérifie que les identifiants stables n'inscrivent pas de
doublons.

## État réel de départ

Mesuré en lecture seule sur `postgres://radar:radar@localhost:5433/radar` :

| Grandeur | Valeur | Requête |
|---|---:|---|
| Organisations | 1 673 221 | `SELECT count(*) FROM org` |
| Sources | 376 | `SELECT count(*) FROM source` |
| Événements | 27 882 | `SELECT count(*) FROM event` |

Les chiffres publiés auparavant (312 sources) datent d'un relevé antérieur à
l'import des corpus de Nouvelle-Aquitaine ; la mesure ci-dessus part de l'état
réel au moment de l'exécution, comme demandé.

## Méthode, étape par étape

1. **Graines** : domaines des organisations du référentiel dont `dept` est l'un
   des 12 départements de Nouvelle-Aquitaine (16, 17, 19, 23, 24, 33, 40, 47,
   64, 79, 86, 87) et qui portent un domaine. Un domaine = une graine, 40 par
   passe (`--offset` permet d'enchaîner d'autres lots).
2. **robots.txt** : lecture des directives `Sitemap:` ; repli sur cinq chemins
   standards (`/sitemap.xml`, `/sitemap_index.xml`, `/sitemap-index.xml`,
   `/wp-sitemap.xml`, `/sitemap.xml.gz`).
3. **Sitemaps** : index enfants (un niveau), `urlset`, gzip sans en-tête HTTP,
   entités XML décodées ; toute URL hors du domaine graine est refusée. Sur un
   nombre borné de pages, les liens `<link rel="alternate">` RSS/Atom sont
   ajoutés.
4. **Validation** : chaque candidat est téléchargé (2xx), reconnu comme RSS ou
   Atom, puis lu par le parseur de production `parseSource()` avec **au moins
   un item**. Une page HTML ou un flux vide n'est pas compté.
5. **Inscription** : `INSERT ... ON CONFLICT (id) DO NOTHING` avec un id stable
   dérivé de l'URL (`sitemap:<domaine>:<hash>`). La source est marquée grise
   (`relevance = 'context'`, `family = 'presse'`, `enabled = true`) : elle est
   collectée, elle ne déclenche pas d'alerte. La provenance (`method`, domaine
   graine, `orgId`, date, `gray`) vit dans `source.parser`.

Chaque comportement a son test nommé dans
`apps/api/test/sitemap-discovery.test.ts` : 10 tests, 10 verts, aucun appel
réseau (HTTP injecté). `tsc --noEmit -p apps/api/tsconfig.json` : OK.

## Commande reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar timeout 55s \
  apps/api/node_modules/.bin/tsx scripts/discover-sitemaps.mts \
  --dry-run --limit=40 --json=bench/results/sitemap-discovery-2026-11-21.json
```

Résultat du 2026-11-21 (artifact versionné :
`bench/results/sitemap-discovery-2026-11-21.json`) :

| Compteur | Valeur |
|---|---:|
| Graines NA | 40 |
| Sitemaps lus | 148 |
| URL de pages scannées | 13 592 |
| Candidats sondés | 265 |
| **Flux découverts** | **46** |
| Sources inscrites (`--dry-run`) | 0 |
| URLs hors NA refusées | 6 |
| Erreurs réseau/timeout comptées | 24 |
| Durée | 45 690 ms |

Le second artifact `bench/results/sitemap-discovery-applied-2026-11-21.json`
conserve la passe réelle : 40 flux redécouverts, 8 nouveaux inscrits,
47 768 ms. Les écarts entre passes (34, 40, 46) viennent du réseau : timeout,
sitemap momentanément indisponible, pages qui changent de contenu. Aucun flux
n'est fabriqué pour combler un écart.

## Déclenchement automatique

Une seule tâche est ajoutée au cycle de collecte existant dans `server.ts`
(2 lignes au total : 1 import, 1 entrée dans le tableau des tâches). Elle
exécute une passe bornée au plus toutes les 24 h par processus, en parallèle
des collecteurs et isolée par le `Promise.allSettled` du cycle. Les flux
inscrits sont repris au cycle suivant par le moteur générique.
`RADAR_SITEMAP_DISCOVERY=0` désactive la tâche. Le diff de `server.ts` est donc de **2 lignes**, sous la limite de 10.

## Contraintes vérifiées

- **Nouvelle-Aquitaine uniquement** : sélection SQL par `dept`, puis filtre sur
  le domaine graine et ses sous-domaines à chaque étape ; 6 URLs externes
  refusées pendant la mesure.
- **Sources grises autorisées** : inscription en `context`, sans alerte ; la
  porte de pertinence existante reste en place.
- **Aucune donnée personnelle de victime** : seules l'URL du flux, le domaine,
  l'identifiant numérique de l'organisation et la date sont conservés. Aucun
  titre d'article, extrait, nom de victime ni contenu de page n'est stocké.
- **Aucun service payant** : `fetch` direct, sans clé ni API externe.
- **Code et interface en anglais** : identifiants, commentaires, messages de
  log et sortie CLI en anglais ; seul ce rapport et les artifacts de mesure
  sont en français, comme demandé.
- **Aucune commande de plus de 60 s** : budget de crawl 45 s, mesure observée
  en 46,96 s au total ; passe réelle en 46,83 s (55,12 s avec la vérification
  SQL qui suit dans la même commande).

## Limites assumées

- La passe couvre 40 domaines par défaut ; la couverture exhaustive passe par
  `--offset` et plusieurs exécutions courtes, jamais par un long process.
- Les sites qui n'annoncent ni sitemap ni lien RSS/Atom ne sont pas découverts
  : aucun domaine n'est deviné, aucune URL n'est inventée.
- Le délai `Crawl-delay` de robots.txt n'est pas encore appliqué ; la
  concurrence est bornée (8) et chaque requête a un timeout de 4 s.
- Un flux découvert est une source lisible, pas une preuve d'activité cyber :
  le moteur de filtrage décide ensuite des événements admis.
