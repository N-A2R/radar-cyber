/**
 * Vérification runtime des composants du chantier C, sans navigateur.
 * Rendu statique React : suffit à exécuter useTable (TanStack v9), les
 * colonnes, le tri initial et la pagination — donc à attraper une erreur
 * d'API que le typecheck ne voit pas.
 */
import { renderToStaticMarkup } from "react-dom/server";
import DirectoryView from "../src/components/DirectoryView";
import CommandPalette from "../src/components/CommandPalette";
import QuarantineReviewView from "../src/components/QuarantineReviewView";
import { reduceSelection, reviewIntent, reviewTargets, type ReviewKeyState } from "../src/review-keys";
import { mockData, mockOrgDetail } from "../src/mock";
import { DEFAULT_DIRECTORY, DEFAULT_STATE, parseHash, shareableUrl, toHash } from "../src/url-state";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures++;
}

const html = renderToStaticMarkup(
	<DirectoryView orgs={mockData.orgs} loading={false} error={null} onOpenOrg={() => {}} />,
);

check("annuaire rendu", html.includes("Annuaire"));
check("effectif affiché", html.includes("38"), `${mockData.orgs.length} orgs en démonstration`);
check("première organisation présente", html.includes("CHU de Bordeaux"));
check("50 lignes par page par défaut", (html.match(/<tr/g) ?? []).length === mockData.orgs.length + 1, `${(html.match(/<tr/g) ?? []).length - 1} lignes`);
check("en-tête trié décroissant", html.includes('aria-sort="descending"'));
check("facettes de nature", html.includes("Collectivité") && html.includes("Enseignement"));
check("pagination une page", html.includes("1 / 1"));

const paged = renderToStaticMarkup(
	<DirectoryView orgs={mockData.orgs} loading={false} error={null} onOpenOrg={() => {}}
		urlState={{ ...DEFAULT_DIRECTORY, size: 25 }} />,
);
check("25 lignes si demandé", (paged.match(/<tr/g) ?? []).length === 26, `${(paged.match(/<tr/g) ?? []).length - 1} lignes`);
check("pagination 2 pages à 25", paged.includes("1 / 2"));

const linked = renderToStaticMarkup(
	<DirectoryView orgs={mockData.orgs} loading={false} error={null} onOpenOrg={() => {}}
		urlState={{ ...DEFAULT_DIRECTORY, dept: "33" }} onCopyLink={() => {}} />,
);
check("filtre département lu depuis l'URL", linked.includes('value="33"'));
check("bouton de partage présent", linked.includes("copier le lien"));

const serverSide = renderToStaticMarkup(
	<DirectoryView orgs={[]} loading={false} error={null} onOpenOrg={() => {}} server />,
);
check("mode serveur rendu sans données locales", serverSide.includes("Chargement du référentiel"));

// --- état d'URL : liens profonds -------------------------------------------
const round = { ...DEFAULT_STATE, view: "map" as const, mapPanel: "directory" as const, directory: { ...DEFAULT_DIRECTORY, q: "mairie de pessac", dept: "33", page: 2, size: 100 }, org: 412 };
const hash = toHash(round);
const back = parseHash(hash);
check("URL Aller-retour conserve la vue", back.view === "map" && back.mapPanel === "directory");
check("URL Aller-retour conserve la recherche", back.directory.q === "mairie de pessac");
check("URL Aller-retour conserve le département", back.directory.dept === "33");
check("URL Aller-retour conserve la page et la taille", back.directory.page === 2 && back.directory.size === 100);
check("URL Aller-retour conserve la fiche ouverte", back.org === 412);
check("URL par défaut reste courte", toHash({ ...DEFAULT_STATE, view: "map", directory: DEFAULT_DIRECTORY, org: null }) === "#/map");
check("URL invalide neutralisée", parseHash("#/nimportequoi?dept=zzz&page=-4&org=abc&size=9999").directory.dept === null);
check("URL invalide : page et fiche rejetées", parseHash("#/directory?page=-4&org=abc").org === null && parseHash("#/directory?page=-4").directory.page === 0);
check("lien partageable absolu", shareableUrl(round, "https://radar.exemple", "/") .startsWith("https://radar.exemple/#/directory?"));
check("état vide absent", !html.includes("Aucune organisation ne correspond"));

const empty = renderToStaticMarkup(
	<DirectoryView orgs={[]} loading={false} error={null} onOpenOrg={() => {}} />,
);
check("état vide géré", empty.includes("Aucune organisation ne correspond"));

const loading = renderToStaticMarkup(
	<DirectoryView orgs={[]} loading error={null} onOpenOrg={() => {}} />,
);
check("état chargement géré", loading.includes("Chargement du référentiel"));

const errored = renderToStaticMarkup(
	<DirectoryView orgs={mockData.orgs} loading={false} error="API indisponible" onOpenOrg={() => {}} />,
);
check("état erreur géré", errored.includes("API indisponible") && errored.includes('role="alert"'));

const palette = renderToStaticMarkup(
	<CommandPalette
		open
		onClose={() => {}}
		onOpenOrg={() => {}}
		onOpenEvent={() => {}}
		mock={{ orgs: mockData.orgs, events: mockData.events }}
	/>,
);
const paletteFermee = renderToStaticMarkup(
	<CommandPalette open={false} onClose={() => {}} onOpenOrg={() => {}} onOpenEvent={() => {}} mock={null} />,
);
check("palette : aucun dialogue prérendu côté serveur",
	!palette.includes('role="dialog"') && !paletteFermee.includes('role="dialog"'));

// --- la vue « revue » est une URL partageable --------------------------------
check("URL : la vue revue est reconnue", parseHash("#/review").view === "action");
check("URL : la vue revue survit à un aller-retour", parseHash(toHash({ ...parseHash("#/review"), view: "action", actionTab: "review" })).actionTab === "review");
const revueHash = "#/review?bucket=tiede&q=acme";
const revueState = parseHash(revueHash);
check("URL revue : bucket et q relus", revueState.review.bucket === "tiede" && revueState.review.q === "acme");
const revueCanonical = toHash({ ...revueState, view: "action", actionTab: "review" });
check("URL revue : bucket et q sérialisés", revueCanonical === "#/action?tab=review&bucket=tiede&q=acme", revueCanonical);
check("URL revue : bucket invalide neutralisé", parseHash("#/review?bucket=nimportequoi").review.bucket === "");

// --- clavier de la file de revue (fonction pure) ---------------------------
const keyBase: ReviewKeyState = { count: 5, active: 2, selected: new Set(), ids: [10, 11, 12, 13, 14], rejecting: false };
const intentOf = (key: string, shift = false, state: ReviewKeyState = keyBase) => reviewIntent(key, shift, state);

check("clavier : J descend", intentOf("j").kind === "move" && (intentOf("j") as { active: number }).active === 3);
check("clavier : K monte", intentOf("k").kind === "move" && (intentOf("k") as { active: number }).active === 1);
check("clavier : flèches équivalentes", intentOf("ArrowDown").kind === "move" && intentOf("ArrowUp").kind === "move");
check("clavier : bornes respectées", (reviewIntent("j", false, { ...keyBase, active: 4 }) as { active: number }).active === 4
	&& (reviewIntent("k", false, { ...keyBase, active: 0 }) as { active: number }).active === 0);
check("clavier : P majuscule décide aussi", intentOf("P").kind === "act");
check("clavier : sans sélection, la décision porte sur le fait courant",
	JSON.stringify(reviewTargets(keyBase)) === "[12]");
check("clavier : la sélection prime sur le fait courant",
	JSON.stringify(reviewTargets({ ...keyBase, selected: new Set([10, 14]) })) === "[10,14]");
check("clavier : X coche le fait courant", intentOf("x").kind === "toggle" && (intentOf("x") as { id: number }).id === 12);
check("clavier : X décoche un fait déjà coché",
	reduceSelection(intentOf("x"), { ...keyBase, selected: new Set([12]) }).selected.size === 0);
check("clavier : Maj+A coche toute la page", reduceSelection(intentOf("A", true), keyBase).selected.size === 5);
check("clavier : A accepte le fait courant", intentOf("a", false).kind === "decide");
check("clavier : Échap désélectionne", reduceSelection(intentOf("Escape"), { ...keyBase, selected: new Set([10]) }).selected.size === 0);
check("clavier : R ouvre la saisie du motif", intentOf("r").kind === "askReject");
check("clavier : aucune décision pendant la saisie du motif",
	intentOf("p", false, { ...keyBase, rejecting: true }).kind === "none"
	&& intentOf("j", false, { ...keyBase, rejecting: true }).kind === "none");
check("clavier : Échap ferme la saisie du motif", intentOf("Escape", false, { ...keyBase, rejecting: true }).kind === "cancelReject");
check("clavier : file vide, aucune décision possible",
	intentOf("p", false, { ...keyBase, count: 0, ids: [] }).kind === "none"
	&& intentOf("r", false, { ...keyBase, count: 0, ids: [] }).kind === "none");
check("clavier : U annule la dernière décision", (intentOf("u") as { action: string }).action === "undo");
check("clavier : touche inconnue sans effet", intentOf("z").kind === "none");

// --- file de revue ---------------------------------------------------------
const reviewOffline = renderToStaticMarkup(
	<QuarantineReviewView canWrite={false} server={false} onUnauthorized={() => {}} onOpenOrg={() => {}} />,
);
check("revue hors ligne : explique l'exigence d'API", reviewOffline.includes("exige l") && reviewOffline.includes("API"));
check("revue hors ligne : aucune décision simulée", !reviewOffline.includes("Promouvoir"));

const reviewLoading = renderToStaticMarkup(
	<QuarantineReviewView canWrite server onUnauthorized={() => {}} onOpenOrg={() => {}} />,
);
check("revue rendue en mode serveur", reviewLoading.includes("Chargement de la file"));
check("revue : raccourcis clavier annoncés", reviewLoading.includes("J/K parcourir") && reviewLoading.includes("Maj+A"));
check("revue : actions presentes", reviewLoading.includes("Promouvoir") && reviewLoading.includes("Rejeter"));
check("revue : compteurs affiches", reviewLoading.includes("en attente") && reviewLoading.includes("rejetés"));

const reviewReadOnly = renderToStaticMarkup(
	<QuarantineReviewView canWrite={false} server onUnauthorized={() => {}} onOpenOrg={() => {}} />,
);
check("revue lecture seule : actions désactivées", reviewReadOnly.includes("Lecture seule") && reviewReadOnly.includes("disabled"));

const detail = mockOrgDetail(1);
check("fiche org simulée", detail !== null && detail.org.name === "CHU de Bordeaux");
check("fiche org: exposition 12 mois", detail?.exposure.length === 12);
check("fiche org: événements rattachés", (detail?.events.total ?? 0) > 0, `${detail?.events.total} événements`);
check("fiche org: id inconnu → null", mockOrgDetail(9999) === null);

console.log(failures === 0 ? "\nTous les contrôles passent." : `\n${failures} contrôle(s) en échec.`);
if (failures > 0) process.exitCode = 1;
