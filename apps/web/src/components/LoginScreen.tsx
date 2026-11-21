import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api";
import { LoadingSkeleton } from "./Skeleton";
import "./login.css";

type LoginScreenProps = {
  /** Appelé avec le jeton de session dès que l'API l'a délivré. */
  onAuthenticated: (token: string) => void;
};

/** Écran de connexion : seul chemin d'accès au shell pour un jeton absent. */
export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(email.trim().toLowerCase(), password);
      onAuthenticated(res.token);
    } catch (err) {
      const status = err instanceof Error && "status" in err ? err.status : undefined;
      const refused = typeof status === "number" && status === 401;
      setError(refused ? "identifiants refusés" : "connexion impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login__form" onSubmit={submit} noValidate>
        <h1 className="login__title">radar cyber</h1>

        <div className="login__field">
          <label htmlFor="login-email">email</label>
          <input
            id="login-email"
            ref={emailRef}
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="login__field">
          <label htmlFor="login-password">mot de passe</label>
          <input
            id="login-password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="login__submit" disabled={busy}>
          entrer
        </button>
        {busy ? <LoadingSkeleton label="connexion en cours…" /> : null}

        <p className="login__error" role="status" aria-live="polite">
          {error ?? ""}
        </p>
      </form>
    </main>
  );
}
