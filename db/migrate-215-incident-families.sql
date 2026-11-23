-- 215 : clustering sémantique des incidents — Corpus étiqueté et tables d'évaluation.
--
-- Le critère de sortie se lit directement :
--   SELECT nmi, silhouette FROM cluster_eval WHERE n >= 500;
--   cible : nmi >= 0,70 ; silhouette >= 0,40 ; aucune famille > 30 % du corpus.
--
-- `incident_family_corpus` porte 500 incidents de benchmark fabriqués (10
-- familles × 50 descriptions), sans victime nommée, sans organisation réelle,
-- sans URL et sans source présentée comme locale : `origin` indique
-- explicitement le benchmark synthétique. Les cinq formulations par famille
-- n'utilisent pas toutes le même mot ; le contexte (type d'établissement,
-- ville) est partagé entre les familles pour empêcher une lecture par mots-clés.
--
-- `incident_family_cluster` garde l'affectation produite par le modèle
-- `semantic-tfidf@1` (concepts + TF-IDF + cosinus + agrégation average-link).
-- `cluster_eval` ne stocke que des agrégats numériques ; les étiquettes du
-- corpus servent UNIQUEMENT au calcul du NMI, jamais aux features.
--
-- Ce fichier crée le schéma et le corpus. La mesure est écrite par
-- `scripts/measure-incident-families.mts` et figée dans la migration 216.

BEGIN;

CREATE TABLE IF NOT EXISTS incident_family_corpus (
  id           text PRIMARY KEY,
  description  text NOT NULL,
  family       text NOT NULL,
  origin       text NOT NULL DEFAULT 'benchmark-semantique@1',
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE incident_family_corpus IS
  'Corpus synthétique étiqueté de 500 incidents, vérité terrain du clustering sémantique.';
COMMENT ON COLUMN incident_family_corpus.family IS
  'Étiquette humaine de la famille sémantique ; utilisée par le NMI, jamais par le clustering.';

CREATE TABLE IF NOT EXISTS incident_family_cluster (
  incident_id   text PRIMARY KEY REFERENCES incident_family_corpus(id) ON DELETE CASCADE,
  model         text NOT NULL,
  cluster_id    text NOT NULL,
  cluster_label text NOT NULL,
  measured_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE incident_family_cluster IS
  'Affectation auditable de chaque incident à une famille calculée, sans étiquette lue.';
COMMENT ON COLUMN incident_family_cluster.cluster_label IS
  'Libellé dérivé des concepts dominants du cluster, pas de l’étiquette de vérité terrain.';

CREATE INDEX IF NOT EXISTS incident_family_cluster_model_idx
  ON incident_family_cluster (model, cluster_id);

CREATE TABLE IF NOT EXISTS cluster_eval (
  model                 text PRIMARY KEY,
  n                     integer NOT NULL CHECK (n >= 500),
  k                     integer NOT NULL CHECK (k > 1),
  nmi                   double precision NOT NULL CHECK (nmi >= 0 AND nmi <= 1),
  silhouette            double precision NOT NULL CHECK (silhouette >= -1 AND silhouette <= 1),
  largest_family_share  double precision NOT NULL
    CHECK (largest_family_share > 0 AND largest_family_share <= 1),
  source                text NOT NULL,
  measured_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cluster_eval_family_balance CHECK (largest_family_share <= 0.30)
);

COMMENT ON TABLE cluster_eval IS
  'Mesure reproductible du clustering : NMI, silhouette et taille de la plus grande famille.';
COMMENT ON COLUMN cluster_eval.nmi IS
  'Information mutuelle normalisée entre clusters calculés et familles annotées.';
COMMENT ON COLUMN cluster_eval.silhouette IS
  'Silhouette moyenne dans l’espace de similarité cosine (distance = 1 − cosinus).';
COMMENT ON COLUMN cluster_eval.largest_family_share IS
  'Part du corpus dans le plus gros cluster calculé ; doit rester <= 0,30.';

-- 10 familles × (5 formulations × 10 contextes) = 500 descriptions uniques.
WITH templates(ord, family, variants) AS (
  VALUES
    (0, 'ransomware', ARRAY[
      $t$À {t}, les systèmes de {v} ont été chiffrés ; les assaillants réclament une rançon pour rendre l'accès aux fichiers.$t$,
      $t$Une attaque par cryptolocker a verrouillé les postes de {v} à {t}. Le paiement est exigé pour obtenir la clé de déchiffrement.$t$,
      $t${v} à {t} voit ses serveurs bloqués : des criminels ont pris les données en otage et demandent une récompense financière.$t$,
      $t$Le réseau de {v} à {t} a été paralysé par un chiffrement massif. Une rançon est fixée pour la restauration des systèmes.$t$,
      $t$Des pirates ont installé un ransomware chez {v} à {t}, puis ont exigé un paiement contre la récupération des dossiers chiffrés.$t$
    ]),
    (1, 'data_leak', ARRAY[
      $t$Des archives internes de {v} à {t} ont été publiées sur un forum ; des milliers de dossiers circulent en ligne.$t$,
      $t$Une fuite de documents chez {v} à {t} expose des enregistrements volés. Les fichiers sont diffusés publiquement.$t$,
      $t${v} à {t} confirme une exfiltration de données : des extraits de sa base ont été mis en ligne par un tiers.$t$,
      $t$Des fichiers dérobés à {v} à {t} sont désormais accessibles sur un site de partage ; l'ampleur de la divulgation est examinée.$t$,
      $t$Un volume important d'informations internes concernant {v} à {t} a été dévoilé par des inconnus.$t$
    ]),
    (2, 'phishing', ARRAY[
      $t$Un courriel frauduleux imitant {v} à {t} invite les usagers à saisir leurs identifiants sur une page copiée.$t$,
      $t${v} à {t} alerte sur une campagne d'hameçonnage : des messages demandent le mot de passe des employés.$t$,
      $t$Des courriels usurpant l'identité de {v} à {t} redirigent vers un formulaire volant les codes d'accès.$t$,
      $t$Une arnaque par message électronique vise les clients de {v} à {t} ; le lien mène à un site imitation.$t$,
      $t$Les équipes de {v} à {t} signalent des messages trompeurs qui réclament les identifiants de connexion sous prétexte de vérification.$t$
    ]),
    (3, 'ddos', ARRAY[
      $t$Le portail de {v} à {t} a été saturé par un flot de requêtes ; le service en ligne est resté indisponible pendant plusieurs heures.$t$,
      $t${v} à {t} subit un déni de service : le trafic massif a rendu ses plateformes inaccessibles.$t$,
      $t$Une attaque par inondation de requêtes a paralysé les serveurs de {v} à {t}, sans vol de données signalé.$t$,
      $t$Les sites de {v} à {t} ont été rendus inaccessibles par une masse de connexions automatisées.$t$,
      $t$Un déferlement de trafic a coupé l'accès aux services numériques de {v} à {t}.$t$
    ]),
    (4, 'defacement', ARRAY[
      $t$La page d'accueil du site de {v} à {t} a été remplacée par un message de hackers.$t$,
      $t$Le site web de {v} à {t} a été détourné : des inconnus ont publié leur propre contenu à la place des pages officielles.$t$,
      $t${v} à {t} constate une défiguration de son portail ; l'interface a été modifiée par des activistes.$t$,
      $t$Des vandales numériques ont changé le visuel du site de {v} à {t} et y ont laissé une revendication.$t$,
      $t$L'accueil du site institutionnel de {v} à {t} affichait un message non autorisé après une intrusion dans l'hébergement.$t$
    ]),
    (5, 'vulnerability', ARRAY[
      $t$Une faille critique référencée CVE-2026-7712 dans un composant utilisé par {v} à {t} expose ses services ; un correctif est attendu.$t$,
      $t$Les équipes de {v} à {t} ont appliqué un correctif d'urgence après la découverte d'une vulnérabilité exploitable sur leur serveur.$t$,
      $t$Un défaut de sécurité dans la messagerie de {v} à {t} permet l'exécution de code à distance ; la mise à jour est recommandée.$t$,
      $t${v} à {t} est exposé à une vulnérabilité de type injection, signalée par un chercheur ; un patch est en préparation.$t$,
      $t$Une version obsolète d'un logiciel interne chez {v} à {t} laisse une faille ouverte aux attaquants.$t$
    ]),
    (6, 'supply_chain', ARRAY[
      $t$Une mise à jour compromise diffusée par un éditeur a introduit un composant malveillant dans les systèmes de {v} à {t}.$t$,
      $t${v} à {t} a été touchée via une dépendance logicielle empoisonnée, sans intrusion directe dans son réseau.$t$,
      $t$Un paquet tiers utilisé par {v} à {t} contenait un code hostile ; la chaîne d'approvisionnement numérique est en cause.$t$,
      $t$Les outils de {v} à {t} ont intégré une bibliothèque modifiée par des attaquants, puis diffusée par le fournisseur.$t$,
      $t$Une compromission chez un prestataire a propagé un programme indésirable vers les postes de {v} à {t}.$t$
    ]),
    (7, 'credential_stuffing', ARRAY[
      $t$Des tentatives automatisées de connexion avec des identifiants volés ont visé les comptes de {v} à {t}.$t$,
      $t${v} à {t} signale une vague de connexions suspectes utilisant des mots de passe issus d'anciennes fuites.$t$,
      $t$Des robots ont testé des paires identifiant/mot de passe sur les services en ligne de {v} à {t}.$t$,
      $t$Plusieurs comptes de {v} à {t} ont été pris pour cible par une attaque automatisée au mot de passe.$t$,
      $t$Les journaux de {v} à {t} montrent un déferlement de connexions avec des identifiants récupérés ailleurs.$t$
    ]),
    (8, 'payment_fraud', ARRAY[
      $t$Un virement a été détourné après un échange de courriels usurpant la direction de {v} à {t}.$t$,
      $t${v} à {t} a versé une somme sur un compte frauduleux à la suite d'une demande de paiement falsifiée.$t$,
      $t$Un message se prétendant du cabinet comptable de {v} à {t} a demandé une modification d'IBAN.$t$,
      $t$Une fraude au president a visé les services financiers de {v} à {t} : le virement a été redirigé.$t$,
      $t$Des escrocs ont imité un fournisseur de {v} à {t} pour obtenir le règlement d'une facture inexistante.$t$
    ]),
    (9, 'intrusion', ARRAY[
      $t$Des intrus ont exploité un accès distant non sécurisé pour s'introduire dans le réseau de {v} à {t}.$t$,
      $t${v} à {t} a détecté une présence inhabituelle sur ses serveurs : les attaquants ont installé un outil de contrôle persistant.$t$,
      $t$Un accès non autorisé aux systèmes internes de {v} à {t} a permis à des inconnus de naviguer dans les dossiers pendant plusieurs jours.$t$,
      $t$Les équipes de {v} à {t} ont isolé un poste compromis après une connexion suspecte depuis l'étranger.$t$,
      $t$Un point d'entrée dans l'infrastructure de {v} à {t} a été utilisé par des inconnus pour observer le réseau interne.$t$
    ])
),
slot AS (SELECT generate_series(0, 49) AS k),
refs AS (
  SELECT ARRAY[
    'un hôpital', 'une mairie', 'une université', 'une communauté d’agglomération',
    'un club sportif', 'une association', 'une banque locale', 'un cabinet médical',
    'une entreprise de transport', 'une collectivité territoriale'
  ] AS victims,
  ARRAY[
    'Bordeaux', 'Limoges', 'Poitiers', 'La Rochelle', 'Niort',
    'Pau', 'Angoulême', 'Brive', 'Guéret', 'Saintes'
  ] AS towns
),
expanded AS (
  SELECT t.family, s.k, t.variants[(s.k % 5) + 1] AS tpl,
         (s.k / 5) AS si, (s.k % 5) AS ti, t.ord, r.victims, r.towns
  FROM templates t CROSS JOIN slot s CROSS JOIN refs r
),
built AS (
  SELECT t.family || '-' || lpad(k::text, 2, '0') AS id,
         replace(
           replace(tpl, '{v}', victims[((si + ord * 2) % 10) + 1]),
           '{t}', towns[((si * 3 + ti + ord) % 10) + 1]
         ) AS description,
         t.family
  FROM expanded t
)
INSERT INTO incident_family_corpus (id, description, family, origin)
SELECT id, description, family, 'benchmark-semantique@1' FROM built
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  family = EXCLUDED.family,
  origin = EXCLUDED.origin;

COMMIT;
