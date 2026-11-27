import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type DeptStat, type Stats, type StatsDepartements } from "../api";
import "./login.css";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Field } from "@astryxdesign/core/Field";
import { TextInput } from "@astryxdesign/core/TextInput";

type LoginScreenProps = {
  /** Appelé avec le jeton de session dès que l'API l'a délivré. */
  onAuthenticated: (token: string) => void;
};

type FieldErrors = {
  email?: string;
  password?: string;
};

/** Chiffres publics de la bande de faits, lus sur l'API, jamais inventés. */
type Faits = {
  sources: number;
  incidents7j: number;
  departements: number;
};

/** Les douze départements de la région, dans l'ordre du GeoJSON. */
const DEPTS_NA: Readonly<Record<string, true>> = {
  "16": true, "17": true, "19": true, "23": true, "24": true, "33": true,
  "40": true, "47": true, "64": true, "79": true, "86": true, "87": true,
};

/**
 * Silhouette simplifiée de la région (Douglas-Peucker, ~5,8 Ko) : le tracé
 * complet fait 100 Ko et n'a rien à faire dans le bundle du premier écran.
 * Projection identique à `NaView` (équirectangulaire, viewBox 331 × 445).
 */
const CARTE_NA: Readonly<Record<string, string>> = {
  "16": "M 98 145 L 103 146 L 101 151 L 104 154 L 100 157 L 104 158 L 110 164 L 108 167 L 114 170 L 111 174 L 114 179 L 109 182 L 114 184 L 111 189 L 123 191 L 123 195 L 131 197 L 131 201 L 135 197 L 140 199 L 150 190 L 148 183 L 152 174 L 161 171 L 167 165 L 167 157 L 172 156 L 181 144 L 181 140 L 186 141 L 188 127 L 193 128 L 198 123 L 189 115 L 188 106 L 181 106 L 173 113 L 166 106 L 162 110 L 165 113 L 161 115 L 138 109 L 128 115 L 128 121 L 124 123 L 124 127 L 120 127 L 123 133 L 120 142 L 111 139 Z",
  "17": "M 20 96 L 24 101 L 38 106 L 42 104 L 30 100 L 31 97 L 25 100 L 25 94 Z M 31 115 L 33 125 L 41 132 L 44 140 L 47 131 L 43 121 Z M 43 143 L 44 153 L 46 150 L 59 158 L 75 172 L 80 187 L 89 188 L 89 186 L 91 190 L 101 193 L 104 206 L 105 203 L 117 211 L 125 208 L 128 210 L 131 197 L 123 195 L 123 191 L 120 189 L 111 189 L 114 184 L 109 182 L 114 179 L 111 174 L 114 170 L 108 167 L 110 164 L 104 158 L 100 157 L 104 154 L 101 151 L 103 146 L 98 145 L 111 139 L 120 142 L 123 133 L 120 127 L 125 125 L 120 116 L 87 106 L 88 104 L 82 102 L 78 95 L 74 86 L 65 89 L 63 88 L 65 83 L 56 85 L 51 88 L 52 94 L 43 104 L 49 104 L 48 106 L 56 116 L 56 121 L 52 120 L 55 124 L 61 123 L 60 127 L 63 128 L 60 123 L 53 125 L 54 132 L 48 135 L 53 143 L 63 150 L 49 140 Z",
  "19": "M 218 193 L 221 195 L 218 199 L 222 201 L 220 204 L 231 207 L 228 210 L 234 218 L 240 215 L 246 217 L 258 228 L 266 222 L 269 225 L 282 222 L 279 214 L 285 212 L 289 204 L 286 198 L 298 186 L 297 179 L 306 183 L 310 181 L 307 178 L 309 165 L 305 160 L 309 156 L 309 149 L 307 146 L 291 154 L 292 151 L 284 146 L 278 147 L 276 143 L 264 154 L 257 152 L 243 164 L 236 163 L 226 173 L 222 171 L 220 180 L 225 182 Z",
  "23": "M 228 98 L 234 102 L 236 110 L 240 112 L 239 120 L 242 122 L 238 127 L 247 127 L 247 131 L 243 132 L 248 137 L 256 133 L 257 137 L 264 141 L 265 150 L 276 143 L 278 147 L 284 146 L 292 151 L 291 154 L 307 146 L 300 137 L 315 123 L 312 104 L 306 92 L 294 86 L 296 84 L 292 78 L 261 77 L 257 74 L 253 81 L 250 78 L 247 82 L 245 78 L 240 81 L 239 77 L 231 86 L 233 93 Z",
  "24": "M 128 209 L 134 208 L 136 213 L 131 225 L 133 229 L 128 235 L 144 238 L 148 233 L 151 234 L 150 241 L 155 248 L 156 255 L 170 254 L 175 249 L 179 252 L 187 250 L 191 253 L 190 260 L 200 255 L 209 263 L 212 253 L 222 249 L 223 240 L 233 232 L 231 219 L 233 218 L 228 210 L 231 207 L 222 206 L 220 204 L 222 201 L 218 200 L 221 195 L 218 193 L 218 188 L 225 182 L 220 180 L 222 177 L 210 173 L 213 168 L 207 167 L 203 159 L 192 158 L 188 162 L 184 158 L 186 153 L 175 149 L 171 156 L 166 158 L 167 165 L 161 171 L 152 174 L 148 183 L 150 190 L 140 199 L 131 200 Z",
  "33": "M 42 257 L 49 243 L 59 253 L 55 256 L 46 254 L 42 273 L 54 267 L 61 269 L 58 278 L 85 275 L 85 280 L 104 291 L 103 299 L 112 301 L 115 299 L 115 294 L 121 297 L 129 293 L 125 286 L 133 282 L 130 278 L 131 265 L 136 265 L 142 259 L 144 254 L 138 250 L 144 245 L 146 248 L 147 244 L 152 244 L 150 237 L 153 235 L 148 233 L 144 238 L 136 238 L 128 235 L 133 229 L 131 225 L 136 213 L 134 208 L 124 208 L 120 211 L 107 203 L 104 206 L 101 193 L 91 190 L 89 186 L 89 188 L 80 187 L 88 216 L 83 212 L 88 219 L 79 206 L 74 185 L 55 169 L 55 163 L 49 172 Z",
  "40": "M 23 367 L 39 370 L 48 365 L 50 371 L 77 362 L 80 366 L 86 363 L 87 366 L 92 366 L 99 360 L 99 365 L 109 364 L 114 362 L 111 356 L 117 346 L 115 339 L 118 333 L 114 330 L 118 326 L 124 327 L 128 322 L 131 325 L 129 327 L 136 330 L 135 318 L 140 308 L 122 305 L 117 293 L 115 299 L 103 299 L 104 291 L 85 280 L 85 275 L 58 278 L 61 269 L 54 267 L 42 273 L 29 355 Z",
  "47": "M 121 297 L 122 305 L 140 308 L 135 318 L 136 322 L 140 320 L 142 323 L 146 318 L 152 321 L 173 312 L 179 317 L 187 309 L 187 306 L 194 306 L 191 302 L 195 301 L 198 292 L 192 289 L 194 282 L 197 286 L 206 283 L 200 266 L 207 263 L 207 260 L 200 255 L 190 260 L 191 253 L 187 250 L 179 252 L 175 249 L 170 254 L 156 255 L 153 245 L 147 244 L 146 248 L 144 245 L 138 250 L 144 254 L 136 265 L 131 265 L 130 278 L 133 282 L 125 285 L 129 293 Z",
  "64": "M 4 383 L 8 390 L 16 389 L 17 395 L 22 391 L 33 395 L 31 407 L 27 411 L 29 415 L 35 417 L 37 409 L 41 408 L 38 413 L 50 419 L 52 418 L 64 425 L 78 423 L 79 430 L 92 442 L 95 437 L 100 440 L 108 436 L 111 419 L 118 415 L 117 408 L 123 402 L 126 402 L 130 393 L 128 390 L 133 385 L 131 376 L 126 379 L 126 374 L 130 373 L 128 367 L 124 362 L 118 360 L 99 365 L 99 360 L 88 366 L 86 363 L 80 366 L 77 362 L 50 371 L 48 365 L 34 371 L 26 366 L 13 381 Z",
  "79": "M 67 23 L 74 28 L 72 31 L 76 36 L 81 39 L 79 43 L 88 65 L 85 68 L 88 75 L 86 80 L 93 81 L 85 88 L 77 90 L 82 102 L 95 109 L 117 115 L 123 123 L 128 121 L 128 115 L 138 109 L 145 110 L 146 104 L 138 101 L 143 87 L 140 85 L 136 89 L 132 87 L 133 83 L 129 80 L 130 73 L 128 72 L 134 61 L 130 59 L 131 56 L 126 57 L 134 47 L 129 43 L 131 39 L 127 38 L 133 35 L 128 33 L 128 22 L 125 21 L 124 13 L 118 13 L 121 10 L 103 11 L 97 15 L 96 12 L 91 14 L 89 20 L 75 19 Z",
  "86": "M 123 13 L 125 21 L 128 22 L 128 33 L 133 35 L 127 38 L 131 39 L 129 43 L 134 47 L 126 57 L 131 56 L 130 59 L 134 61 L 128 72 L 130 73 L 129 80 L 133 83 L 132 87 L 136 89 L 140 85 L 143 87 L 138 101 L 146 104 L 145 110 L 161 115 L 165 113 L 162 110 L 166 106 L 173 113 L 181 106 L 190 107 L 188 97 L 195 91 L 202 92 L 205 84 L 211 85 L 217 77 L 212 75 L 209 67 L 203 66 L 195 60 L 195 47 L 181 30 L 180 23 L 171 19 L 173 24 L 154 27 L 152 15 L 143 14 L 144 9 L 137 8 L 132 2 L 128 11 L 125 10 Z",
  "87": "M 175 149 L 186 153 L 184 158 L 188 162 L 192 158 L 203 159 L 207 167 L 213 168 L 210 173 L 219 176 L 222 171 L 226 173 L 236 163 L 243 164 L 257 152 L 266 152 L 264 141 L 257 137 L 256 133 L 248 137 L 243 132 L 247 131 L 247 127 L 238 127 L 242 122 L 239 120 L 240 112 L 236 110 L 234 102 L 228 98 L 233 87 L 226 80 L 218 83 L 213 81 L 211 85 L 205 84 L 202 92 L 195 91 L 188 97 L 191 106 L 188 108 L 189 115 L 198 123 L 193 128 L 188 127 L 186 141 L 181 140 L 181 144 Z",
};

const NOMBRE = new Intl.NumberFormat("fr-FR");

/**
 * La bande lit exactement les contrats publics du serveur : `GET /api/stats`
 * et `GET /api/today/departements` (24 h, champs `dept` / `evenements`).
 * `/api/stats/departements` est la fenêtre 7 jours, avec d'autres noms de
 * champs : l'utiliser ici donnait une bande toujours vide.
 */
function estStats(valeur: unknown): valeur is Stats {
  if (!valeur || typeof valeur !== "object") return false;
  const sources = (valeur as Partial<Stats>).sources;
  return Boolean(sources && typeof sources.total === "number" && Number.isFinite(sources.total) && sources.total >= 0);
}

function estStatsDepartements(valeur: unknown): valeur is StatsDepartements {
  if (!valeur || typeof valeur !== "object") return false;
  const lignes = (valeur as Partial<StatsDepartements>).departements;
  if (!Array.isArray(lignes)) return false;
  return lignes.every((ligne: unknown) => {
    if (!ligne || typeof ligne !== "object") return false;
    const dept = (ligne as Partial<DeptStat>).dept;
    const evenements = (ligne as Partial<DeptStat>).evenements;
    return typeof dept === "string" && typeof evenements === "number" && Number.isFinite(evenements);
  });
}

/** Réponse HTTP et contrat vérifiés séparément : un 500 n'est pas un schéma faux. */
async function lireContrat<T>(reponse: Response, valide: (valeur: unknown) => valeur is T): Promise<T> {
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
  const corps: unknown = await reponse.json();
  if (!valide(corps)) throw new Error("contrat inattendu");
  return corps;
}

function entier(valeur: unknown): number | null {
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0
    ? Math.trunc(valeur)
    : null;
}

/**
 * Charge la bande de faits en silence : un échec réseau, un statut HTTP ou un
 * schéma inattendu n'affichent jamais de chiffre inventé sur l'écran de
 * connexion. L'annulation (démontage) n'est pas traitée comme une erreur.
 */
function useFaits(): Faits | null {
  const [faits, setFaits] = useState<Faits | null>(null);

  useEffect(() => {
    const controleur = new AbortController();
    const signal = controleur.signal;

    async function charger(): Promise<void> {
      try {
        const [stats, departements] = await Promise.all([
          fetch("/api/stats", { signal }).then((r) => lireContrat(r, estStats)),
          fetch("/api/today/departements", { signal }).then((r) => lireContrat(r, estStatsDepartements)),
        ]);

        let incidents7j = 0;
        let couverts = 0;
        for (const ligne of departements.departements) {
          if (DEPTS_NA[ligne.dept] !== true) continue;
          const evenements = entier(ligne.evenements);
          if (evenements === null) continue;
          incidents7j += evenements;
          if (evenements > 0) couverts += 1;
        }
        setFaits({ sources: stats.sources.total, incidents7j, departements: couverts });
      } catch {
        if (signal.aborted) return;
        setFaits(null);
      }
    }

    void charger();
    return () => controleur.abort();
  }, []);

  return faits;
}

/** Écran de connexion : seul chemin d'accès au shell pour un jeton absent. */
export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const faits = useFaits();

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    const address = email.trim();
    if (!address) next.email = "indiquez votre adresse e-mail";
    else if (!address.includes("@") || address.endsWith("@")) {
      next.email = "cette adresse e-mail semble incomplète";
    }
    if (!password) next.password = "indiquez votre mot de passe";
    return next;
  }

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy) return;

    const found = validate();
    setFieldErrors(found);
    setError(null);
    if (found.email) {
      emailRef.current?.focus();
      return;
    }
    if (found.password) {
      passwordRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      const res = await api.login(email.trim().toLowerCase(), password);
      onAuthenticated(res.token);
    } catch (err) {
      const status = err instanceof Error && "status" in err ? err.status : undefined;
      const refused = typeof status === "number" && status === 401;
      setError(
        refused
          ? "Adresse e-mail ou mot de passe incorrect. Vérifiez la saisie, puis réessayez."
          : "Impossible de joindre le serveur. Vérifiez votre connexion, puis réessayez.",
      );
      if (refused) {
        passwordRef.current?.focus();
        passwordRef.current?.select();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <Card className="login__form" padding={0}>
        <form
          className="login__form-body"
          onSubmit={submit}
          noValidate
          aria-busy={busy}
          aria-labelledby="login-title"
        >
          <section className="login__identity">
            <header className="login__head">
              <p className="login__kicker">
                <span className="login__mark" aria-hidden="true" />
                Nouvelle-Aquitaine
              </p>
              <h1 className="login__title" id="login-title">
                Radar Cyber
              </h1>
              <p className="login__subtitle">
                L&apos;observatoire des incidents cyber signalés dans la région.
              </p>
            </header>

            {faits ? (
              <dl className="login__facts" role="group" aria-label="Le radar en chiffres">
                <Card variant="transparent" padding={0} className="login__fact">
                  <dt>sources suivies</dt>
                  <dd>{NOMBRE.format(faits.sources)}</dd>
                </Card>
                <Card variant="transparent" padding={0} className="login__fact">
                  <dt>incidents sur 7 jours</dt>
                  <dd>{NOMBRE.format(faits.incidents7j)}</dd>
                </Card>
                <Card variant="transparent" padding={0} className="login__fact">
                  <dt>départements couverts</dt>
                  <dd>
                    {NOMBRE.format(faits.departements)}
                    <span className="login__fact-of">/12</span>
                  </dd>
                </Card>
              </dl>
            ) : null}

            <Card variant="transparent">
              <figure className="login__map" aria-hidden="true">
                <svg viewBox="0 0 331 445" focusable="false">
                  {Object.entries(CARTE_NA).map(([code, trace]) => (
                    <path key={code} d={trace} />
                  ))}
                </svg>
              </figure>
            </Card>
          </section>

          <section className="login__panel">
            <Field
              label="Identifiants"
              labelID="login-credentials-label"
              inputID="login-email"
              isGroupLabel
              isLabelHidden
            >
              <Card
                variant="transparent"
                padding={0}
                className="login__fields"
                role="group"
                aria-labelledby="login-credentials-label"
              >
                <TextInput
                  id="login-email"
                  ref={emailRef}
                  label="adresse e-mail"
                  type="email"
                  htmlName="email"
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  hasSpellCheck={false}
                  value={email}
                  onChange={(value) => {
                    setEmail(value);
                    if (fieldErrors.email) {
                      setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }
                  }}
                  isDisabled={busy}
                  isRequired
                  status={fieldErrors.email ? { type: "error", message: fieldErrors.email } : undefined}
                />
                <TextInput
                  id="login-password"
                  ref={passwordRef}
                  label="mot de passe"
                  type="password"
                  htmlName="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(value) => {
                    setPassword(value);
                    if (fieldErrors.password) {
                      setFieldErrors((prev) => ({ ...prev, password: undefined }));
                    }
                  }}
                  isDisabled={busy}
                  isRequired
                  status={fieldErrors.password ? { type: "error", message: fieldErrors.password } : undefined}
                />
              </Card>
            </Field>

            {error ? (
              <Card variant="muted" className="login__error" role="alert">
                {error}
              </Card>
            ) : null}

            <Button
              type="submit"
              label={busy ? "Connexion…" : "Se connecter"}
              variant="secondary"
              className="login__submit"
              isLoading={busy}
            />

            <p className="login__status" role="status" aria-live="polite">
              {busy ? "Vérification des identifiants…" : ""}
            </p>

            <p className="login__note">
              Accès réservé aux agents habilités. Les actions effectuées dans l'outil sont tracées.
            </p>
          </section>
        </form>
      </Card>
    </main>
  );
}
