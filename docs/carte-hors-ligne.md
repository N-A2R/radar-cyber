# Carte hors ligne : un plan qui ne disparaît pas quand le réseau tombe

> Chantier 17. `apps/web/src/offline.ts`, vérifié par `apps/web/test/offline-verif.tsx`
> (17 contrôles), branché dans `App.tsx` et `map/Map3D.tsx`.

## Le constat

Deux pannes distinctes, souvent confondues :

1. **le fond de carte** dépend de serveurs tiers (`tiles.openfreemap.org` pour le
   TileJSON des bâtiments, `tile.openstreetmap.org`, `data.geopf.fr` pour
   l'imagerie) ; si le réseau tombe, la carte devient un rectangle noir — alors
   que les contours départementaux et les villes sont **déjà dans le bundle** ;
2. **les données** disparaissent à chaque rechargement, alors que la dernière
   réponse est encore la meilleure information disponible.

Le premier cas est le plus grave : au moment où un incident coupe le réseau,
la carte s'éteint exactement quand on en a besoin.

## Ce qui a été fait

### Fond de secours, zéro octet de réseau

`styleSecours()` construit un style MapLibre complet à partir de données
embarquées : contours des départements, libellés de villes, fond plein. Aucune
tuile, aucun sprite, aucune police distante — c'est vérifié par le test
(`!serialise.includes("http")`).

Il est déclenché quand le TileJSON échoue **et** que rien n'a encore été
construit. Distinction importante : sans TileJSON, la carte est complète mais
plate (pas de bâtiments 3D) ; c'est seulement quand *rien* n'a pu être construit
que le secours s'applique.

### Instantané des données, avec son âge

La dernière réponse complète (organisations + événements) est conservée et
restaurée au chargement suivant. Elle n'est écrite que si **les deux** moitiés
sont là : une carte avec des organisations et sans événements serait un état qui
n'a jamais existé.

Ce qui est affiché au-dessus de la carte :

| Âge | Affichage |
| --- | --- |
| ≤ 15 min | rien (état normal) |
| 45 min | `hors ligne · données de 45 min — carte figée sur la dernière réponse reçue` |
| 3 h | `hors ligne · données de 3 h` |
| 3 j | `hors ligne · données de 3 j` |

Jamais « à jour » pour du cache : le test verrouille les cinq cas. L'âge
recalcule à la minute — une mention « 3 min » qui reste figée devient un
mensonge au bout d'une heure.

## Robustesse

- `localStorage` absent (rendu serveur, navigation privée stricte) → cache
  inactif, écran intact ;
- quota dépassé → l'écriture échoue sans casser l'écran ;
- instantané sans date → écarté : un âge faux est pire qu'une absence ;
- horloge en avance → âge borné à 0.

## Ce qui n'est pas fait, et pourquoi

**Pas de service worker, pas de cache de tuiles.** Mettre en cache des tuiles
raster dans un navigateur est fragile (quota, éviction, CGU des fournisseurs) et
donnerait une fausse impression de disponibilité : la carte marcherait au
bureau et pas sur le terrain, ou l'inverse. Le choix assumé est un fond
**vectoriel embarqué** : moins joli, toujours là, et versionné avec le code.

**Pas d'écriture hors ligne.** Consulter sans réseau : oui. Acquitter une alerte
sans réseau : non — il n'y a pas de file de synchronisation, et en inventer une
sans gestion de conflits produirait des acquittements fantômes.
