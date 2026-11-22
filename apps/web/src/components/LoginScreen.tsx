import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api";
import "./login.css";

type LoginScreenProps = {
  /** Appelé avec le jeton de session dès que l'API l'a délivré. */
  onAuthenticated: (token: string) => void;
};

type FieldErrors = {
  email?: string;
  password?: string;
};

/** Écran de connexion : seul chemin d'accès au shell pour un jeton absent. */
export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

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
      <form
        className="login__form"
        onSubmit={submit}
        noValidate
        aria-busy={busy}
        aria-labelledby="login-title"
      >
        <header className="login__head">
          <p className="login__kicker">
            <span className="login__mark" aria-hidden="true" />
            Nouvelle-Aquitaine
          </p>
          <h1 className="login__title" id="login-title">
            Radar Cyber
          </h1>
          <p className="login__subtitle">
            L'observatoire des incidents cyber signalés dans la région.
          </p>
        </header>

        <div className="login__fields">
          <div className="login__field">
            <label htmlFor="login-email">adresse e-mail</label>
            <input
              id="login-email"
              ref={emailRef}
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              disabled={busy}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
              required
            />
            {fieldErrors.email ? (
              <p className="login__field-error" id="login-email-error">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className="login__field">
            <label htmlFor="login-password">mot de passe</label>
            <input
              id="login-password"
              ref={passwordRef}
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              disabled={busy}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              required
            />
            {fieldErrors.password ? (
              <p className="login__field-error" id="login-password-error">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="login__error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="login__submit" disabled={busy}>
          {busy ? <span className="login__spinner" aria-hidden="true" /> : null}
          {busy ? "connexion…" : "se connecter"}
        </button>

        <p className="login__status" role="status" aria-live="polite">
          {busy ? "Vérification des identifiants…" : ""}
        </p>

        <p className="login__note">
          Accès réservé aux agents habilités. Les actions effectuées dans l'outil sont tracées.
        </p>
      </form>
    </main>
  );
}
