# Annuaire et recherche à l'échelle — chantier 2

**Livré le 2026-11-12.** Deuxième gros chantier. Rend le référentiel de 4 462
organisations réellement consultable, et tient la charge à 100 000.

---

## 1. Ce qui n'allait pas

| Défaut vérifié | Conséquence |
| --- | --- |
| `GET /orgs` renvoyait **toute la table**, sans pagination | 961 Ko à 4 462 orgs, **22,4 Mo à 104 462** |
| Recherche = trois `ILIKE` + `LIMIT 20`, sans classement | « pessac » noyé ; l'ordre était celui du disque |
| Recherche ignorant `org_alias` | « mairie de Pessac » ne trouvait pas « Commune de Pessac » |
| Filtrage, tri et facettes en mémoire dans le navigateur | tout devait être téléchargé avant de chercher |
| **Aucun état d'URL** | impossible de partager une vue, rechargement = retour à la carte |
| Aucune virtualisation | 200 lignes = 200 lignes dans le DOM |

## 2. Ce qui est livré

**Serveur** — `GET /api/directory`, lecture publique (même régime que `/orgs`),
paramètres tous validés par liste blanche et bornes dures.

- Sans recherche : filtrage, tri, pagination et facettes **en SQL**.
- Avec recherche : présélection SQL large (nom, ville, domaine, **alias**, plus
  un préfixe de quatre caractères pour absorber une faute de frappe), puis
  classement en mémoire, puis pagination.
- Classement (`directory/rank.ts`, pur) : égalité exacte > préfixe > couverture
  de jetons > sous-chaîne > flou. **Le flou ne double jamais l'exact.**
  Départage à force égale : activité, puis nom.
- Chaque ligne rend `matchedAlias` et `reason` : l'interface affiche
  « via "Mairie de Pessac" · alias ». On voit *pourquoi* un résultat est là.
- Facettes : chaque dimension est comptée **hors de son propre filtre**, pour
  qu'on puisse changer de département sans vider la liste des départements.
- `%` et `_` saisis sont échappés : ce sont des littéraux, pas des jokers.
- Présélection plafonnée à 2 000 candidats ; au-delà, `truncated: true` est
  renvoyé **et affiché**. Pas de total silencieusement faux.

**Interface**

- Annuaire branché sur l'API : page de 50 lignes, facettes serveur, tri serveur.
- Recherche différée de 220 ms, requêtes précédentes annulées (`AbortController`).
- **Virtualisation** au-delà de 100 lignes (TanStack Virtual 3.14.26, MIT) :
  seules les lignes visibles sont dans le DOM.
- **Liens profonds** : `#/directory?q=mairie+de+pessac&dept=33&page=2&org=412`.
  Bouton « copier le lien ». Précédent/suivant du navigateur relit l'URL.
- Mode démonstration hors ligne conservé : mêmes opérations en mémoire.

## 3. Mesures

Banc : `bench/directory/probe.mts`, 25 répétitions, résultats bruts
`bench/results/NA-directory.json`. Le palier synthétique est inséré puis
**supprimé** ; le référentiel n'est pas pollué.

### Référentiel réel — 4 462 organisations, 22 904 alias

| Chemin | p50 | p95 | Charge utile |
| --- | ---: | ---: | ---: |
| **Ancien** `GET /orgs` (tout) | 19,9 ms | 30,2 ms | **961 Ko** |
| Première page | **5,3 ms** | 8,7 ms | **11,8 Ko** |
| Page 80 | 9,7 ms | 13,6 ms | 11,2 Ko |
| Filtre département | 2,1 ms | 2,7 ms | 11,3 Ko |
| Recherche exacte « Pessac » | 9,9 ms | 13,9 ms | 0,7 Ko |
| Recherche par alias « mairie de pessac » | 14,5 ms | 18,2 ms | 0,8 Ko |
| Recherche fautive « Pesssac » | 9,9 ms | 12,6 ms | 0,5 Ko |
| Recherche large « saint » (891 résultats) | 56,9 ms | 93,8 ms | 14,3 Ko |

### Palier synthétique — 104 462 organisations

| Chemin | p50 | p95 | Charge utile |
| --- | ---: | ---: | ---: |
| **Ancien** `GET /orgs` (tout) | 567,6 ms | 665,4 ms | **22 427 Ko** |
| Première page | **54,7 ms** | 64,2 ms | **12,0 Ko** |
| Page 80 | 55,0 ms | 66,6 ms | 11,4 Ko |
| Recherche exacte | 80,6 ms | 88,8 ms | 0,7 Ko |
| Recherche par alias | 110,5 ms | 143,6 ms | 0,8 Ko |
| Recherche large | 137,7 ms | 161,4 ms | 14,3 Ko |

**Charge utile divisée par 1 870** à 100 000 organisations (22,4 Mo → 12 Ko).
Le temps de la première page reste sous 65 ms au p95.

**Limite visible** : la recherche large plafonne autour de 140-200 ms à
100 000 lignes, parce que la présélection balaie large. C'est le prix de la
tolérance aux fautes sans extension `pg_trgm`. Acceptable pour un poste solo ;
à surveiller si le référentiel dépasse 200 000.

## 4. Comportement vérifié en conditions réelles

Sur l'instance locale chargée du référentiel :

```
q=mairie de pessac → Commune de Pessac (33), via « Mairie de Pessac », alias
                     Commune de Pessac-sur-Dordogne, via son alias, préfixe
q=Pesssac          → Commune de Pessac (33), approximatif
q=saint            → 891 résultats, non tronqué
sans recherche     → 4 462, facettes : 4 293 communes / 156 EPCI / 12 dép. / 1 région
```

## 5. Vérifications

- `test/directory-rank.test.ts` : **9/9**, sans base.
- `test/directory-query.test.ts` : **8/8**, en base (pagination, facettes,
  alias, faute de frappe, jokers, page hors limites).
- Suite API : 122 → **139/139**.
- Contrôles de rendu web : **32**, dont l'aller-retour d'URL, les valeurs
  invalides neutralisées, le mode serveur et le bouton de partage.
- Typechecks API et web : 0 erreur. Build web : succès.

## 6. Ce qui reste ouvert

- **La carte charge encore `GET /orgs` en entier.** L'annuaire n'en dépend plus,
  mais la carte et la palette oui. À 100 000 organisations il faudra une route
  bornée par emprise géographique. Non fait ici.
- **Pas de recherche plein texte pondérée** : sans `pg_trgm` ni index GIN, la
  tolérance aux fautes passe par le préfixe + RapidFuzz. Une migration
  permettrait d'aller plus vite, mais les migrations sont hors périmètre.
- **Deux fautes de frappe ne sont pas rattrapées** (seuil 88). Volontaire :
  mieux vaut manquer qu'inventer une organisation.
- **Le compteur d'événements est une sous-requête par ligne.** Négligeable à
  50 lignes ; à revoir si l'on ajoute des colonnes agrégées supplémentaires.
