# Chantiers — liste globale

Établie le 13 novembre 2026. Remplace le découpage en petits chantiers : on prend
la liste dans l'ordre et on enchaîne, sans point d'étape intermédiaire.

Chaque chantier a un **critère de sortie vérifiable**. Un chantier n'est fini que
quand son critère est vrai, mesuré, dans le dépôt.

## L'ordre, et pourquoi cet ordre

Les quatre premiers ne se discutent pas : chacun débloque le suivant. Les trois
derniers sont parallélisables et peuvent attendre.

| # | Chantier | Débloque | Taille |
|---|---|---|---|
| 1 | **Journal de vérité** (event sourcing pragmatique) | tout le reste | ~3 semaines |
| 2 | **Mémoire longue** (archive + datation + rejeu) | la mesure | ~1 semaine |
| 3 | **Couverture mesurée** (étage 2) | les agents | ~1 semaine |
| 4 | **Agents CPU** (étage 3) | l'anticipation | ~2 semaines |
| 5 | **Anticipation** (étage 4) | — | ~2 semaines |
| 6 | **Référentiel entreprises complet** | la couverture réelle | bloqué externe |
| 7 | **Carte hors ligne** | l'usage terrain | ~1 semaine |

---

## 1. Journal de vérité — le chantier qui englobe

**Le constat.** Neuf chemins d'écriture, aucun ne conserve l'état antérieur.
`UPDATE org`, `ON CONFLICT DO UPDATE` sur l'ingestion, la purge à 90 jours, la
revue, la promotion de quarantaine : on corrige le présent et on perd le passé.

**L'invariant visé.**

> Aucune écriture destructive. On n'insère que des faits datés ; tout le reste
> est une vue calculée.

**Les trois couches.**

1. **Le journal** — append-only, jamais purgé. Chaque décision : *ce qui a été
   décidé, par quoi, quand, à partir de quelles preuves*. Deux temps par ligne :
   `valid_at` (quand le fait était vrai dans le monde) et `at` (quand on l'a su).
2. **Les vues** — `event.org_id`, `org.name`, les alertes, la file de revue
   deviennent des projections recalculables. Donc rejouables avec un autre
   moteur, un autre seuil, un autre référentiel.
3. **La doctrine** — vérifiée par le socle, pas écrite dans un README : une
   vérification qui échoue si une projection diverge du journal.

**Ce que ça absorbe.** Le bi-temporel du référentiel (chantier 6 de la liste
précédente) et la majeure partie de la mémoire longue.

**Critère de sortie.**
- migration du journal, contrainte d'append-only vérifiée par la base ;
- trois voies câblées : admission d'événement, rattachement d'organisation,
  chargement de référentiel ;
- `pnpm verify:journal` compare projection et journal, et échoue en divergeant ;
- **le diff reel du changement de moteur** : rejouer le corpus, produire la
  liste nominative des rattachements corrigés — ce qu'on n'a pas pu faire faute
  d'historique.

**Décision de conception : pragmatique, pas orthodoxe.** Les projections font
foi pour la lecture ; le journal fait foi pour l'audit et le rejeu ; une
réconciliation périodique détecte la dérive. L'event sourcing complet (rien ne
fait autorité hors journal) coûterait une latence de lecture et une complexité
dont on n'a pas besoin.

## 2. Mémoire longue

Aujourd'hui : `runRetention` supprime les événements de plus de 90 jours, **au
démarrage du serveur**. Impossible de répondre à une question portant sur
12 mois.

**Critère de sortie.** Une requête répond sur 12 mois glissants alors que le
brut est purgé à 90 jours ; le rejeu d'une période donne le même résultat qu'à
l'époque (au moteur près).

## 3. Couverture mesurée — étage 2

L'étoile du nord : *« sur 12 mois d'incidents publics NA, quelle part aurions-nous
vue et quand ? »*

**Critère de sortie.** Contre le corpus témoin, publication d'un tableau
nominatif : incident par incident, vu ou non, délai entre publication et
première détection, motif d'absence (`pas collecté` / `pas rattaché` /
`pas jugé cyber`).

## 4. Agents CPU — étage 3

Détection de ruptures : une organisation qui n'apparaissait jamais et soudain
apparaît trois fois ; un secteur qui bascule ; une source qui se tait.

**Critère de sortie.** Trois agents, chacun avec un taux de fausses alertes
mesuré sur le corpus, branchés sur la file de revue et non sur la diffusion.

## 5. Anticipation — étage 4

**Critère de sortie.** Sur le corpus, la réponse à « qu'est-ce qui, dans les
données disponibles trois semaines avant l'incident, l'aurait annoncé » — même
si la réponse est « rien », à condition qu'elle soit mesurée.

## 6. Référentiel entreprises complet — bloqué externe

Manquent les secteurs « 50 salariés et plus, tous secteurs » : zéro ligne en
agroalimentaire, industrie, construction, commerce. Une couverture mesurée
contre ce référentiel serait flatteuse à tort.

**Ce qu'on peut faire sans l'IA externe.** Mesurer et publier le trou, préparer
la voie de chargement, et refuser de publier un taux de couverture trompeur
tant qu'il n'est pas comblé. Ce dernier point est le plus important.

## 7. Carte hors ligne

Les 34 330 organisations sont géolocalisées ; la carte est débloquée.

**Critère de sortie.** Carte utilisable sans réseau, avec les organisations et
pas seulement les communes.
