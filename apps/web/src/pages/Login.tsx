import { useState } from "react";

export function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error("invalid credentials");
      const data = await res.json();
      localStorage.setItem("radar_token", data.token);
      onLogin(data.token);
    } catch (e: any) {
      setErr(e.message ?? "login failed");
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 320, margin: "4rem auto", display: "grid", gap: 12 }}>
      <h2>Sign in</h2>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" type="email" required />
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" required />
      {err && <div style={{ color: "red" }}>{err}</div>}
      <button type="submit">Sign in</button>
    </form>
  );
}
