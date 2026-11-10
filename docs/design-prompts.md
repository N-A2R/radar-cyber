# Prompts de design pour Radar Cyber

Cinq prompts à envoyer tels quels à d'autres IA. Chacun produit une direction
différente. Le but n'est pas d'en choisir une seule mais de comparer.

## Règles communes à rappeler à chaque modèle

À copier avant chaque prompt si le modèle a tendance à produire du générique :

> Ne produis pas de « AI slop » : pas de cartes avec coins arrondis partout, pas
> de dégradés violet-bleu, pas de statistiques inventées, pas de témoignages, pas
> d'emoji comme icônes, pas de gros chiffres isolés sans contexte. Va chercher
> sur GitHub des dépôts réels pour appuyer tes choix, et cite-les avec leur
> nombre d'étoiles. Si tu ne peux pas vérifier un fait, dis-le.

## Contexte à fournir

Radar Cyber est un observatoire du cyber en Nouvelle-Aquitaine. Il agrège
456 sources publiques (CERT-FR, NVD, ransomwatch, presse, Telegram), les
rapproche de 529 organisations géolocalisées dans 12 départements, et produit
des alertes qualifiées.

Données réelles : 8 709 événements, 28 254 indicateurs, 7 incidents
d'organisation, 416 avis régionaux.

Contraintes : usage personnel, écran allumé en permanence, aucun coût, aucun
composant lourd. Stack actuelle : React 19, Vite 8, MapLibre 6, deck.gl 9.

---

## Prompt 1 — La direction « salle de contrôle »

> Tu es directeur artistique. Conçois l'écran principal d'un observatoire de
> cybersécurité régional, affiché en permanence sur un second écran.
>
> Contraintes : fond sombre, aucune carte encadrée, des lignes de séparation
> d'un pixel, une seule police de titres et une monospace pour les chiffres.
> L'information doit être lisible à deux mètres de distance.
>
> Va chercher sur GitHub trois dépôts qui font déjà ça bien (tableaux de bord
> temps réel, consoles de supervision, moniteurs de statut) et cite-les avec
> leur nombre d'étoiles. Explique ce que tu leur empruntes.
>
> Livre : la hiérarchie de l'écran, la palette avec ses valeurs exactes, et la
> description de trois composants (le fil d'événements, la carte, l'inspecteur).

---

## Prompt 2 — La direction « cartographie avant tout »

> Tu es designer de visualisation de données. L'utilisateur veut une carte qui
> soit le centre de l'écran, pas une vignette.
>
> Le problème actuel : trop d'arcs, des couleurs criardes, un rendu illisible.
> Trouve sur GitHub des exemples réels de tracés animés réussis sur MapLibre ou
> deck.gl, cite les dépôts, et explique précisément ce qui rend leurs tracés
> lisibles alors que les nôtres ne le sont pas (épaisseur, opacité, animation
> du dégradé, ordre de rendu, réduction du nombre d'arcs affichés).
>
> Livre : les paramètres exacts à changer, avec les valeurs, et une maquette
> décrite en HTML et CSS sans bibliothèque externe.

---

## Prompt 3 — La direction « dossier d'enquête »

> Tu es designer produit. Conçois la vue de détail d'une alerte : celle qu'on
> ouvre quand une organisation vient d'être revendiquée.
>
> Elle doit répondre à quatre questions dans cet ordre : d'où vient
> l'information, à quel point on peut y croire, pourquoi on pense que ça
> concerne cette organisation, et quelles preuves indépendantes la corroborent.
>
> Interdiction : une note globale unique sur 100. Quatre indicateurs séparés,
> chacun avec sa justification en une phrase.
>
> Va chercher sur GitHub des projets qui présentent des dossiers d'enquête ou
> des rapports d'incident bien structurés, cite-les, et reprends leur
> hiérarchie sans reprendre leur charte.

---

## Prompt 4 — La direction « écran mural »

> Conçois l'affichage pour un mur d'images : un écran 1920×1080 vu à cinq
> mètres. Pas d'interaction à la souris, tout doit se lire en trois secondes.
>
> Contraintes : maximum quatre zones, une seule animation à la fois, aucune
> information critique qui clignote. Le fil d'événements défile lentement, la
> carte reste fixe.
>
> Cherche sur GitHub des projets de dashboards muraux ou de signalétique
> temps réel, cite-les avec leurs étoiles, et explique comment ils évitent la
> surcharge visuelle.
>
> Livre : la maquette complète en HTML autonome, sans script.

---

## Prompt 5 — La direction « sobre institutionnelle »

> Conçois une version claire, imprimable, destinée à un rapport qu'on remet à
> une organisation : fond blanc cassé, encre noire, un seul accent coloré.
>
> Contraintes : aucune ombre, aucun arrondi, des filets d'un pixel, une
> typographie qui tient en impression noir et blanc. Les niveaux de confiance
> doivent rester distinguables sans couleur.
>
> Cherche sur GitHub des systèmes de design éditoriaux ou des gabarits de
> rapport technique, cite-les, et justifie tes choix typographiques avec des
> chiffres (interlignage, corps, mesure en caractères).

---

## Ce qu'il faut demander à chaque modèle en plus

1. **Les dépôts cités doivent exister.** Vérifie qu'ils sont réels et récents,
   et donne leur nombre d'étoiles. Un dépôt inventé disqualifie la réponse.
2. **Aucun chiffre inventé.** Pas de « +43 % de conversions », pas de
   témoignage client. Les seules données autorisées sont celles du contexte.
3. **Une seule idée forte par écran.** Si le modèle propose trois concepts dans
   une même réponse, demande-lui de choisir.
4. **Du code ou rien.** Une description sans HTML n'est pas une maquette.
