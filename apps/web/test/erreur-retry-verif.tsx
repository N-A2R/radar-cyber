/**
 * Surface d'erreur : le message et le bouton Réessayer doivent apparaître
 * dans le rendu réel des vues, pas seulement dans le code source.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorRetry } from "../src/components/ErrorRetry";
import TodayView from "../src/components/TodayView";
import HealthDetailView from "../src/components/HealthDetailView";
import JournalListe from "../src/components/JournalListe";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const message = "erreur du serveur (HTTP 500) sur /health";
const html = renderToStaticMarkup(<ErrorRetry message={message} onRetry={() => {}} />);
check("message rendu", html.includes(message));
check("bouton Réessayer rendu", html.includes("<button") && html.includes("Réessayer"));
check("rôle alert pour lecteur d'écran", html.includes('role="alert"'));

const sansAction = renderToStaticMarkup(<ErrorRetry message={message} />);
check("sans action, aucun bouton trompeur", !sansAction.includes("<button"));

const today = renderToStaticMarkup(
  <TodayView data={null} loading={false} error={message} family={null} dept={null}
    onFamily={() => {}} onDept={() => {}} onOpenOrg={() => {}} onOpenEvent={() => {}}
    onRetry={() => {}} />,
);
check("Aujourd'hui : message et rejeu", today.includes(message) && today.includes("Réessayer"));

const sante = renderToStaticMarkup(
  <HealthDetailView detail={null} error={message} onRetry={() => {}} />,
);
check("Santé : message et rejeu", sante.includes(message) && sante.includes("Réessayer"));

const journal = renderToStaticMarkup(
  <JournalListe rows={[]} loading={false} error={message} suivant={null} page={1}
    onPrecedent={() => {}} onSuivant={() => {}} onRetry={() => {}} />,
);
check("Journal : message et rejeu", journal.includes(message) && journal.includes("Réessayer"));

console.log(failures === 0 ? "\nerreur-retry: tout est vert" : `\nerreur-retry: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
