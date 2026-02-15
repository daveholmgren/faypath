"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCredentialsSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: true,
      callbackUrl: "/"
    });

    if (result?.error) {
      setError("Invalid email or password.");
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="panel">
        <h1>Sign In</h1>
        <p className="lead">
          Use demo accounts after seeding:
          <br />
          <code>candidate@faypath.dev</code>, <code>employer@faypath.dev</code>,{" "}
          <code>admin@faypath.dev</code>
          <br />
          Password: <code>demo12345</code>
        </p>

        <form className="post-form" onSubmit={handleCredentialsSignIn}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button className="primary-btn wide-btn" type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign In with Email"}
          </button>
        </form>

        <div className="moderation-actions">
          <button className="ghost-btn" type="button" onClick={() => void signIn("google")}>
            Continue with Google
          </button>
          <button className="ghost-btn" type="button" onClick={() => void signIn("linkedin")}>
            Continue with LinkedIn
          </button>
          <Link className="ghost-btn" href="/register">
            Create Account
          </Link>
        </div>

        {error ? <p className="notice">{error}</p> : null}
      </section>
    </main>
  );
}
