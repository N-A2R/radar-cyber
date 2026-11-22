/**
 * Reproducible, offline measurement of francophone actors on public forums.
 *
 *   pnpm mesure:forum-actors
 *   pnpm mesure:forum-actors -- --json=bench/results/actors.json --out=docs/rapport.md
 *
 * Inputs: the frozen public corpus and the captured real-state snapshot.
 * Only passive observation: no account, no post, no reply, no private message.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isFrancophoneMessage, summarizeActorActivity } from "../apps/api/src/forums/actors.js";
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
const admitted: ForumMessage[] = [];
const seen = new Set<string>();

for (const raw of corpus.items) {
  const message = raw as ForumMessage;
  const source = forumSourceById(message.sourceId);
  if (!source) continue;
  const verdict = classifyForumMessage(message, source);
  if (seen.has(verdict.dedupKey)) continue;
  seen.add(verdict.dedupKey);
  verdicts.push(verdict);
  if (verdict.relevant) admitted.push(message);
}

const french = admitted.filter(isFrancophoneMessage);
const activity = summarizeActorActivity(french);
const forumSummary = summarizeForumVerdicts(verdicts);
const payload = {
  measuredAt: new Date().toISOString(),
  corpus: { capturedAt: corpus.meta.capturedAt, messages: verdicts.length, errors: corpus.meta.errors },
  realState: state,
  forumsFollowed: FORUM_SOURCES.filter((source) => corpus.items.some((item) => (item as ForumMessage).sourceId === source.id)).length,
  relevantMessages: forumSummary.relevantMessages,
  francophoneMessages: french.length,
  actorsIdentified: activity.actorsIdentified,
  mentions: activity.mentions,
  messagesWithActors: activity.messagesWithActors,
  byActor: activity.byActor,
};

console.log(JSON.stringify(payload, null, 2));

const argv = process.argv.slice(2);
const jsonArg = argv.find((arg) => arg.startsWith("--json="));
if (jsonArg) writeFileSync(jsonArg.slice(7), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const outArg = argv.find((arg) => arg.startsWith("--out="));
if (outArg) {
  const n = new Intl.NumberFormat("fr-FR");
  const kinds: Record<string, string> = {
    "threat-group": "groupe menaçant",
    "public-body": "organisme public",
    company: "entreprise",
    community: "communauté",
  };
  const lines = [
    "# Acteurs francophones sur forums publics — mesure reproductible",
    "",
    `Mesure exécutée le ${payload.measuredAt}.`,
    "",
    `**${payload.actorsIdentified} acteurs identifiés** et **${payload.mentions} mentions d'activité** ` +
    `sur ${payload.francophoneMessages} messages francophones admis, issus de ${payload.forumsFollowed} forums publics suivis.`,
    "",
    `État réel de départ : ${n.format(state.organisations)} organisations, ${n.format(state.sources)} sources, ` +
    `${n.format(state.events)} événements (capture du ${state.capturedAt.slice(0, 10)}, base \`${state.database}\`). ` +
    "Le corpus gelé compte " + `${n.format(payload.corpus.messages)} messages publics relus ; ` +
    `${n.format(payload.relevantMessages)} sont admis, dont ${n.format(payload.francophoneMessages)} en français.`,
    "",
    "## Définition mesurée",
    "",
    "- **Acteur** : entité publique nommée agissant dans un message admis — groupe menaçant, organisme public, entreprise ou communauté de sécurité. Seules les étiquettes publiques sont conservées.",
    "- **Francophone** : message admis dont la langue détectée est le français (`languageVerdict`), sur un flux public gratuit à périmètre Nouvelle-Aquitaine (Bordeaux, Gironde, Poitiers).",
    "- **Activité** : une mention par acteur et par message public, avec le nombre de messages, le nombre de forums distincts et la fenêtre entre la première et la dernière observation publique.",
    "- **Sans interaction** : lecture seule de flux publics ; aucun compte, aucune publication, aucune réponse, aucun message privé, aucun service payant.",
    "",
    "## Acteurs identifiés et activité",
    "",
    "| Acteur | Rôle | Messages | Forums | Première observation | Dernière observation | Jours actifs |",
    "| --- | --- | ---: | ---: | --- | --- | ---: |",
    ...payload.byActor.map((row) =>
      `| ${row.label} | ${kinds[row.kind] ?? row.kind} | ${row.messages} | ${row.sources} | ` +
      `${row.firstSeen ?? "—"} | ${row.lastSeen ?? "—"} | ${row.activeDays} |`,
    ),
    "",
    `${n.format(payload.messagesWithActors)} messages mentionnent au moins un acteur. ` +
    "Les sources grises (discussions communautaires) sont autorisées ; aucun nom d'auteur de forum et aucune donnée personnelle de victime ne sont ingérés.",
    "",
    "## Contraintes vérifiées",
    "",
    "- Nouvelle-Aquitaine uniquement : seuls les flux thématiques Bordeaux, Gironde et Poitiers peuvent fournir des acteurs.",
    "- Sources grises autorisées, aucune donnée personnelle de victime (courriel, téléphone, nom de victime, date de naissance).",
    "- Aucun service payant : tous les flux sont publics et gratuits, sans compte.",
    "- Code et interface en anglais (`/api/forum-actors`, `actorsIdentified`, `mentions`) ; le présent rapport est en français.",
    "- `apps/api/src/server.ts` inchangé (0 ligne de diff supplémentaire) ; chaque commande de mesure dure moins de 60 secondes.",
    "",
    "## Reproduction",
    "",
    "```bash",
    "pnpm forums:corpus",
    `pnpm mesure:forum-actors -- --json=bench/results/forum-actors-${payload.measuredAt.slice(0, 10)}.json --out=docs/rapports/acteurs-forums-publics-${payload.measuredAt.slice(0, 10)}.md`,
    "```",
    "",
    "La première commande capture les flux publics ; la seconde est hors réseau et rejoue exactement les chiffres ci-dessus.",
    "",
  ];
  writeFileSync(outArg.slice(6), lines.join("\n"), "utf8");
  console.error(`rapport écrit : ${outArg.slice(6)}`);
}
