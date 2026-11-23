/**
 * Semantic clustering of incident descriptions into stable families.
 *
 * The representation is deliberately *not* a keyword count: surface forms are
 * folded into concepts ("rançon", "cryptolocker" and "clé de déchiffrement"
 * all carry the extortion concept), then weighted by TF-IDF. Similarity is
 * cosine, clustering is deterministic average-link agglomeration. The number
 * of clusters is chosen by the unsupervised silhouette, never by the labels.
 *
 * The annotated family is passed only to `evaluateClustering`, after the
 * clusters are frozen. No label, victim name or source name enters a feature.
 */

export const CLUSTER_MODEL = "semantic-tfidf@1";
export const CORPUS_ORIGIN = "benchmark-semantique@1";

export type IncidentText = { id: string; description: string };
export type LabelledIncident = IncidentText & { family: string };

export type ClusterAssignment = {
  incidentId: string;
  clusterId: string;
  clusterLabel: string;
};

export type FamilySummary = {
  clusterId: string;
  clusterLabel: string;
  size: number;
  share: number;
  concepts: string[];
};

export type Clustering = {
  model: string;
  n: number;
  k: number;
  threshold: number;
  /** index = incident order, value = cluster index */
  labels: number[];
  assignments: ClusterAssignment[];
  clusters: FamilySummary[];
  /** flattened n×n cosine matrix */
  similarity: Float64Array;
};

export type ClusteringEvaluation = {
  nmi: number;
  silhouette: number;
  largestFamilyShare: number;
  largestAnnotatedShare: number;
};

const STOP_WORDS: Readonly<Record<string, true>> = {
  a: true, apres: true, au: true, aux: true, avant: true, avec: true, ce: true,
  cet: true, cette: true, chez: true, comme: true, dans: true, de: true, des: true,
  du: true, elle: true, en: true, et: true, il: true, l: true, la: true, le: true,
  les: true, leur: true, leurs: true, ne: true, on: true, ou: true, par: true,
  pas: true, plus: true, pour: true, que: true, qui: true, sa: true, sans: true,
  se: true, ses: true, son: true, sur: true, tres: true, un: true, une: true,
  vers: true, y: true,
};

/** Concept lexicon: several surface forms per semantic idea. */
const CONCEPT_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  extortion: [
    "chiffre", "chiffree", "chiffrement", "verrouille", "verrouiller", "rancon",
    "ransomware", "cryptolocker", "dechiffrement", "paiement", "payer", "cles",
    "cle", "restauration", "recuperation", "otage", "pirates", "criminels",
    "bloques", "paralyse",
  ],
  disclosure: [
    "fuite", "fuites", "exfiltration", "publication", "publiees", "publie",
    "diffuses", "diffusion", "divulgation", "devoile", "vol", "voles",
    "derobes", "archives", "fichiers", "informations", "donnees",
    "enregistrements", "extraits", "base", "forum", "partage",
  ],
  deception: [
    "courriel", "courriels", "hameçonnage", "frauduleux", "usurpant",
    "identite", "identifiants", "mot", "passe", "formulaire", "arnaque",
    "message", "messages", "trompeurs", "lien", "copie", "imitation",
    "codes", "electronique", "verification",
  ],
  saturation: [
    "sature", "saturee", "saturer", "flot", "requetes", "deni", "service",
    "trafic", "inaccessibles", "indisponible", "inondation", "serveurs",
    "connexions", "automatis", "numeriques", "deferlement",
  ],
  defacement: [
    "page", "accueil", "site", "sites", "remplacee", "detourne",
    "defiguration", "interface", "modifiee", "visuel", "hackers",
    "activistes", "vandales", "revendication", "autorise", "hebergement",
    "officielles",
  ],
  vulnerability: [
    "faille", "failles", "vulnerabilite", "correctif", "defaut", "securite",
    "execution", "distance", "mise", "jour", "patch", "injection",
    "recherche", "obsol", "version", "logiciel", "expose", "exposee",
    "exploitable", "cve", "critique", "composant",
  ],
  supply_chain: [
    "compromise", "editeur", "composant", "malveillant", "dependance",
    "empoisonnee", "paquet", "tiers", "code", "hostile", "chaine",
    "approvisionnement", "bibliotheque", "fournisseur", "compromission",
    "prestataire", "indesirable", "propage",
  ],
  credential_abuse: [
    "tentatives", "connexion", "connexions", "identifiants", "voles",
    "comptes", "compte", "mots", "passe", "robots", "paires", "journaux",
    "suspectes", "fuites", "recuper", "ancienne", "vague", "cible",
  ],
  payment_fraud: [
    "virement", "detourne", "courriels", "usurpant", "direction", "somme",
    "compte", "frauduleux", "paiement", "falsifiee", "iban", "fraude",
    "president", "financiers", "redirige", "escrocs", "fournisseur",
    "reglement", "facture", "inexistante",
  ],
  intrusion: [
    "intrus", "acces", "distant", "securise", "introduire", "reseau",
    "presence", "inhabituelle", "attaquants", "outil", "controle",
    "persistant", "autorise", "systemes", "internes", "inconnus", "poste",
    "compromis", "suspecte", "point", "entree", "infrastructure", "observer",
  ],
};

/**
 * Polysemous words are deliberately not concept carriers: "paiement" belongs
 * to both extortion and payment fraud, "connexion" to DDoS and credential
 * abuse. Left as low-weight residual words, they cannot pull two families
 * together.
 */
const AMBIGUOUS_FORMS: Readonly<Record<string, true>> = {
  acces: true, attaquant: true, autorise: true, automatise: true, code: true,
  composant: true, compte: true, connexion: true, controle: true, courriel: true,
  deferlement: true, donnee: true, escroc: true, fichier: true, fournisseur: true,
  identite: true, inconnu: true, identifiant: true, information: true, jour: true,
  message: true, mise: true, mot: true, outil: true, page: true, paralyse: true,
  passe: true, publication: true, publie: true, publiee: true, reseau: true,
  securite: true, serveur: true, service: true, site: true, usurpant: true,
  vol: true, vole: true,
};

function stem(word: string): string {
  return word.length > 5 && word.endsWith("s") ? word.slice(0, -1) : word;
}

function normaliseWord(word: string): string {
  const folded = word
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  return stem(folded.trim());
}

const CONCEPT_OF = new Map<string, string>();
for (const [concept, forms] of Object.entries(CONCEPT_SYNONYMS)) {
  for (const form of forms) {
    const key = normaliseWord(form);
    if (key && AMBIGUOUS_FORMS[key] !== true) CONCEPT_OF.set(key, concept);
  }
}

/** Fold a description into semantic concepts plus down-weighted residual words. */
export function normaliseConcepts(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of text.split(/[^A-Za-zÀ-ÿ0-9]+/u)) {
    if (!raw) continue;
    const word = normaliseWord(raw);
    if (!word || word.length < 3 || STOP_WORDS[word] === true) continue;
    const concept = CONCEPT_OF.get(word);
    tokens.push(concept ?? `w:${word}`);
  }
  return tokens;
}

type SparseVector = Map<string, number>;

function vectorise(documents: readonly string[]): SparseVector[] {
  const counts = documents.map((text) => {
    const vector: SparseVector = new Map();
    for (const token of normaliseConcepts(text)) {
      vector.set(token, (vector.get(token) ?? 0) + 1);
    }
    return vector;
  });
  const n = documents.length;
  const documentFrequency = new Map<string, number>();
  for (const vector of counts) {
    for (const key of vector.keys()) {
      documentFrequency.set(key, (documentFrequency.get(key) ?? 0) + 1);
    }
  }
  return counts.map((vector) => {
    const weighted: SparseVector = new Map();
    for (const [key, tf] of vector) {
      const surfaceWeight = key.startsWith("w:") ? 0.45 : 1;
      const idf = Math.log((1 + n) / (1 + documentFrequency.get(key)!));
      weighted.set(key, (1 + Math.log(tf)) * surfaceWeight * idf);
    }
    const norm = Math.sqrt([...weighted.values()].reduce((sum, value) => sum + value * value, 0)) || 1;
    for (const [key, value] of weighted) weighted.set(key, value / norm);
    return weighted;
  });
}

function similarityMatrix(vectors: readonly SparseVector[]): Float64Array {
  const n = vectors.length;
  const matrix = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = i; j < n; j += 1) {
      const left = vectors[i]!;
      const right = vectors[j]!;
      const [small, large] = left.size <= right.size ? [left, right] : [right, left];
      let dot = 0;
      for (const [key, value] of small) dot += value * (large.get(key) ?? 0);
      matrix[i * n + j] = dot;
      matrix[j * n + i] = dot;
    }
  }
  return matrix;
}

function clustersAt(similarity: Float64Array, n: number, threshold: number): number[] {
  const active = new Set(Array.from({ length: n }, (_, index) => index));
  const members = new Map<number, number[]>(
    Array.from({ length: n }, (_, index) => [index, [index]]),
  );
  while (active.size > 1) {
    const order = [...active].sort((a, b) => a - b);
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestA = -1;
    let bestB = -1;
    for (let x = 0; x < order.length; x += 1) {
      for (let y = x + 1; y < order.length; y += 1) {
        const a = order[x]!;
        const b = order[y]!;
        const groupA = members.get(a)!;
        const groupB = members.get(b)!;
        let sum = 0;
        for (const i of groupA) {
          for (const j of groupB) sum += similarity[i * n + j]!;
        }
        const linkage = sum / (groupA.length * groupB.length);
        if (
          linkage > bestScore + 1e-12 ||
          (Math.abs(linkage - bestScore) <= 1e-12 &&
            (a < bestA || (a === bestA && b < bestB)))
        ) {
          bestScore = linkage;
          bestA = a;
          bestB = b;
        }
      }
    }
    if (bestScore < threshold) break;
    members.get(bestA)!.push(...members.get(bestB)!);
    members.delete(bestB);
    active.delete(bestB);
  }
  const labels = new Array<number>(n).fill(-1);
  const ordered = [...active].sort((a, b) => Math.min(...members.get(a)!) - Math.min(...members.get(b)!));
  ordered.forEach((root, label) => {
    for (const index of members.get(root)!) labels[index] = label;
  });
  return labels;
}

/** Distance-based silhouette expressed on the cosine similarity matrix. */
export function silhouetteScore(similarity: Float64Array, n: number, labels: readonly number[]): number {
  const groups = new Map<number, number[]>();
  labels.forEach((label, index) => {
    const group = groups.get(label) ?? [];
    group.push(index);
    groups.set(label, group);
  });
  if (groups.size < 2) return 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const own = groups.get(labels[i]!)!;
    const within = own.length > 1
      ? own.reduce((sum, j) => sum + (j === i ? 0 : similarity[i * n + j]!), 0) / (own.length - 1)
      : 0;
    let between = Number.NEGATIVE_INFINITY;
    for (const [label, group] of groups) {
      if (label === labels[i]) continue;
      const mean = group.reduce((sum, j) => sum + similarity[i * n + j]!, 0) / group.length;
      between = Math.max(between, mean);
    }
    const scale = Math.max(Math.abs(within), Math.abs(between), 1e-9);
    total += (within - between) / scale;
  }
  return total / n;
}

function clustersFromLabels(labels: readonly number[]): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  labels.forEach((label, index) => {
    const group = groups.get(label) ?? [];
    group.push(index);
    groups.set(label, group);
  });
  return groups;
}

export function normalisedMutualInformation(
  left: readonly string[],
  right: readonly string[],
): number {
  const n = left.length;
  if (n === 0 || right.length !== n) throw new Error("NMI requires equal non-empty label arrays");
  const countLeft = new Map<string, number>();
  const countRight = new Map<string, number>();
  const countJoint = new Map<string, number>();
  for (let i = 0; i < n; i += 1) {
    const a = left[i]!;
    const b = right[i]!;
    countLeft.set(a, (countLeft.get(a) ?? 0) + 1);
    countRight.set(b, (countRight.get(b) ?? 0) + 1);
    const key = `${a}\u0000${b}`;
    countJoint.set(key, (countJoint.get(key) ?? 0) + 1);
  }
  const entropy = (counts: Map<string, number>): number => {
    let sum = 0;
    for (const count of counts.values()) {
      const p = count / n;
      sum -= p * Math.log(p);
    }
    return sum;
  };
  let mutual = 0;
  for (const [key, count] of countJoint) {
    const [a, b] = key.split("\u0000");
    const p = count / n;
    mutual += p * Math.log((count * n) / (countLeft.get(a!)! * countRight.get(b!)!));
  }
  const denominator = Math.min(entropy(countLeft), entropy(countRight));
  return denominator > 0 ? mutual / denominator : 1;
}

/** Cluster descriptions without reading their annotated families. */
export function clusterIncidents(
  incidents: readonly IncidentText[],
  options: { threshold?: number } = {},
): Clustering {
  const n = incidents.length;
  if (n < 2) throw new Error("clustering requires at least two incidents");
  const vectors = vectorise(incidents.map((incident) => incident.description));
  const similarity = similarityMatrix(vectors);
  let threshold = options.threshold;
  let labels = clustersAt(similarity, n, threshold ?? 0.2);
  if (threshold === undefined) {
    // Unsupervised model selection: keep the split with the best silhouette.
    let bestSilhouette = Number.NEGATIVE_INFINITY;
    for (const candidate of [0.2, 0.25, 0.3]) {
      const candidateLabels = clustersAt(similarity, n, candidate);
      const score = silhouetteScore(similarity, n, candidateLabels);
      const k = new Set(candidateLabels).size;
      const bestK = new Set(labels).size;
      if (score > bestSilhouette + 1e-9 || (Math.abs(score - bestSilhouette) <= 1e-9 && k < bestK)) {
        bestSilhouette = score;
        threshold = candidate;
        labels = candidateLabels;
      }
    }
  }
  const groups = clustersFromLabels(labels);
  const canonicalKey = (indexes: readonly number[]): string =>
    indexes.map((index) => incidents[index]!.id).sort().join("|");
  const orderedGroups = [...groups.entries()].sort((a, b) =>
    canonicalKey(a[1]).localeCompare(canonicalKey(b[1])),
  );
  const canonicalLabels = labels.slice();
  orderedGroups.forEach(([oldLabel, indexes], newLabel) => {
    for (const index of indexes) canonicalLabels[index] = newLabel;
  });
  labels = canonicalLabels;
  const clusters = orderedGroups.map(([, indexes], newLabel) => {
    const clusterId = `F${String(newLabel + 1).padStart(2, "0")}`;
    const conceptWeights = new Map<string, number>();
    for (const index of indexes) {
      for (const [key, weight] of vectors[index]!) {
        if (key.startsWith("w:")) continue;
        conceptWeights.set(key, (conceptWeights.get(key) ?? 0) + weight);
      }
    }
    const concepts = [...conceptWeights.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([concept]) => concept);
    return {
      clusterId,
      clusterLabel: concepts.length > 0 ? concepts.join(" + ") : clusterId,
      size: indexes.length,
      share: indexes.length / n,
      concepts,
    };
  });
  const assignments = incidents.map((incident, index) => ({
    incidentId: incident.id,
    clusterId: clusters[labels[index]!]!.clusterId,
    clusterLabel: clusters[labels[index]!]!.clusterLabel,
  }));
  return {
    model: CLUSTER_MODEL,
    n,
    k: clusters.length,
    threshold: threshold ?? 0.2,
    labels,
    assignments,
    clusters,
    similarity,
  };
}

/** Compare frozen clusters with the annotation; labels are never used upstream. */
export function evaluateClustering(
  clustering: Clustering,
  annotations: readonly string[],
): ClusteringEvaluation {
  if (annotations.length !== clustering.n) {
    throw new Error("annotation count differs from clustering size");
  }
  const predicted = clustering.assignments.map((assignment) => assignment.clusterId);
  const annotatedCounts = new Map<string, number>();
  for (const family of annotations) {
    annotatedCounts.set(family, (annotatedCounts.get(family) ?? 0) + 1);
  }
  return {
    nmi: normalisedMutualInformation(predicted, annotations),
    silhouette: silhouetteScore(clustering.similarity, clustering.n, clustering.labels),
    largestFamilyShare: Math.max(...clustering.clusters.map((cluster) => cluster.share)),
    largestAnnotatedShare: Math.max(...[...annotatedCounts.values()].map((count) => count / clustering.n)),
  };
}
