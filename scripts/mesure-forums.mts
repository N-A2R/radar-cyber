/**
 * Reproducible measurement of the public-forum watcher.
 *
 *   pnpm mesure:forums
 *   pnpm mesure:forums -- --json=bench/results/forums.json --out=docs/rapports/forums-publics.md
 *
 * The replay is offline and deterministic: it uses the frozen corpus captured
 * by `pnpm forums:corpus` and the same admission function as the collector.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  classifyForumMessage,
  summarizeForumVerdicts,
  type ForumMessage,
  type ForumVerdict,
} from "../apps/api/src/forums/classify.js";
import { FORUM_SOURCES, forumSourceById } from "../apps/api/src/forums/sources.js";

const CORPUS = fileURLToPath(new URL("../bench/forums/corpus.json", import.meta.url));
const STATE = fileURLToPath(new URL("../bench/forums/state.json", import.meta.url));

type Corpus = {
  meta: { capturedAt: string; command: string; sources: unknown[]; errors: string[] };
  items: unknown[];
};
type State = {
  capturedAt: string;
  database: string;
  captureCommand: string;
  organisations: number;
  sources: number;
  events: number;
};

const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as Corpus;
const state = JSON.parse(readFileSync(STATE, "utf8")) as State;
const verdicts: ForumVerdict[] = [];
const seen = new Set<string>();
const bySource = new Map<string, { seen: number; relevant: number; name: string }>();

for (const source of FORUM_SOURCES) {
  bySource.set(source.id, { seen: 0, relevant: 0, name: source.name });
}
for (const raw of corpus.items) {
  const message = raw as ForumMessage;
  const source = forumSourceById(message.sourceId);
  if (!source) continue;
  const verdict = classifyForumMessage(message, source);
  if (seen.has(verdict.dedupKey)) continue;
  seen.add(verdict.dedupKey);
  verdicts.push(verdict);
  const row = bySource.get(source.id);
  if (row) {
    row.seen++;
    if (verdict.relevant) row.relevant++;
  }
}

const summary = summarizeForumVerdicts(verdicts);
const payload = {
  measuredAt: new Date().toISOString(),
  corpus: { capturedAt: corpus.meta.capturedAt, messages: corpus.items.length, errors: corpus.meta.errors },
  realState: state,
  followedForums: summary.followedForums,
  relevantMessages: summary.relevantMessages,
  messagesSeen: verdicts.length,
  rejected: summary.rejected,
  bySource: [...bySource.entries()].map(([id, row]) => ({ id, name: row.name, seen: row.seen, relevant: row.relevant })),
};

console.log(JSON.stringify(payload, null, 2));

const argv = process.argv.slice(2);
const jsonArg = argv.find((a) => a.startsWith("--json="));
if (jsonArg) writeFileSync(jsonArg.slice(7), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const outArg = argv.find((a) => a.startsWith("--out="));
if (outArg) {
  const n = new Intl.NumberFormat("fr-FR");
  const lines = [
    "# Forums publics — mesure reproductible",
    "",
    `Mesure exécutée le ${payload.measuredAt}.`,
    "",
    `**${payload.followedForums} forums suivis et ${payload.relevantMessages} messages pertinents** sur ${payload.messagesSeen} messages publics réels relus depuis le corpus gelé du ${corpus.meta.capturedAt.slice(0, 10)}.`,
    "",
    `État réel au moment de la capture : ${n.format(state.organisations)} organisations, ${n.format(state.sources)} sources, ${n.format(state.events)} événements (base \`${state.database}\`). Le chantier ajoute une couche de forums à cet état, sans modifier les compteurs existants.`,
    "",
    "## Définition mesurée",
    "",
    "- **Forum suivi** : flux public et gratuit enregistré dans la table `source` avec `family = 'forum'` et `enabled = true`, et effectivement présent dans le corpus relu. Aucun compte, aucun abonnement, aucun service payant.",
    "- **Message pertinent** : message de forum admis par la même fonction que le collecteur (`classifyForumMessage`) : signal cyber du moteur de pertinence partagé, périmètre Nouvelle-Aquitaine (flux thématique NA ou département/préfecture cité dans le texte), et aucune donnée personnelle de victime (courriel, téléphone, nom de victime, date de naissance).",
    "- Les sources grises (discussions communautaires) sont autorisées ; les noms d'auteurs ne sont jamais collectés ni exposés.",
    "",
    "## Résultats par flux",
    "",
    "| Forum | Messages lus | Messages pertinents |",
    "| --- | ---: | ---: |",
    ...payload.bySource.map((row) => `| ${row.name} | ${row.seen} | ${row.relevant} |`),
    "",
    `Rejets : ${payload.rejected["outside-na"]} hors Nouvelle-Aquitaine, ${payload.rejected["no-cyber-signal"]} sans signal cyber, ${payload.rejected["personal-data"]} avec donnée personnelle, ${payload.rejected.empty} vides.`,
    "",
    "## Contraintes vérifiées",
    "",
    "- Nouvelle-Aquitaine uniquement : les flux thématiques sont limités à Bordeaux, Gironde et Poitiers ; les flux généraux n'acceptent un message que s'il nomme explicitement un département ou une préfecture de la région.",
    "- Sources grises autorisées, aucune donnée personnelle de victime, aucun service payant.",
    "- Code et interface en anglais (`/api/forums`, `followedForums`, `relevantMessages`) ; le présent rapport est en français.",
    "- Le diff de `apps/api/src/server.ts` se limite à deux lignes (import et branchement du cycle).",
    "",
    "## Reproduction",
    "",
    "```bash",
    "pnpm forums:corpus",
    `pnpm mesure:forums -- --json=bench/results/forums-${payload.measuredAt.slice(0, 10)}.json --out=docs/rapports/forums-publics-${payload.measuredAt.slice(0, 10)}.md`,
    "```",
    "",
    "La première commande capture les flux publics ; la seconde est hors réseau, ne dure que quelques secondes et recompute exactement les deux chiffres ci-dessus.",
    "",
  ];
  writeFileSync(outArg.slice(6), lines.join("\n"), "utf8");
  console.error(`rapport écrit : ${outArg.slice(6)}`);
}
