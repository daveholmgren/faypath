"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

type RoleChoice = "candidate" | "employer";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleChoice>("candidate");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ error: "Registration failed." }))) as {
        error?: string;
      };
      setError(payload.error ?? "Registration failed.");
      setBusy(false);
      return;
    }

    await signIn("credentials", {
      email,
      password,
      redirect: true,
      callbackUrl: "/"
    });
  }

  return (
    <main className="shell">
      <section className="panel">
        <h1>Create Account</h1>
        <p className="lead">Register as a candidate or employer.</p>

        <form className="post-form" onSubmit={handleRegister}>
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password (min 8 chars)"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <select value={role} onChange={(event) => setRole(event.target.value as RoleChoice)}>
            <option value="candidate">Candidate</option>
            <option value="employer">Employer</option>
          </select>
          <button className="primary-btn wide-btn" type="submit" disabled={busy}>
            {busy ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <div className="moderation-actions">
          <Link className="ghost-btn" href="/sign-in">
            Back to Sign In
          </Link>
        </div>

        {error ? <p className="notice">{error}</p> : null}
      </section>
    </main>
  );
}
