"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { PasswordField } from "@/components/auth/PasswordField";
import { ThresholdLayout } from "@/components/auth/Threshold";
import { ErrorState, Field, Notice, PageHeader } from "@/components/ui";
import { ROLE_LABEL, useAuth } from "@/lib/auth";
import { safeNext } from "@/lib/nav";
import { useSubmit } from "@/lib/useSubmit";

function LoginForm() {
  const { signIn, signOut, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const s = useSubmit(async (e: string, p: string) => signIn(e, p));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await s.run(email.trim(), password)) router.push(next);
  }
  if (user)
    return (
      <div className="space-y-4">
        <Notice tone="ok" title="Signed in">as {user.display_name} ({ROLE_LABEL[user.role]}).</Notice>
        <div className="flex flex-wrap gap-3">
          <Link href={next} className="btn btn-primary">Continue</Link>
          <Link href="/account" className="btn btn-quiet">Account</Link>
          <button className="btn btn-quiet" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>
    );
  return (
    <form onSubmit={submit} className="max-w-md space-y-5">
      {params.get("signedout") && <Notice tone="ok" title="Signed out">Your session has ended on this device.</Notice>}
      <Field label="Email" htmlFor="l-email">
        <input id="l-email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false}
          className="field" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <PasswordField id="l-pw" label="Password" value={password} onChange={setPassword} autoComplete="current-password" required={false} />
      {s.error && <ErrorState error={s.error} />}
      <button className="btn btn-primary w-full sm:w-auto sm:px-8" disabled={s.pending || !email || !password}>
        {s.pending ? "Signing in…" : "Sign in"}
      </button>
      <div className="space-y-2 border-t border-rule pt-5 text-sm text-ivory-dim">
        <p>New here? <Link className="inline" href="/register">Create an account</Link>. Researcher access is immediate; steward and reviewer access is approved by an administrator.</p>
        <p className="text-xs text-mist">Forgotten password? There is no email reset on this server: an administrator can set a new one with the <code className="text-ivory-dim">app.manage reset-password</code> command.</p>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="chamber">
      <PageHeader title="Sign in" lede="Browsing is open to everyone. Recording data, running analyses and reviewing need an account." />
      <ThresholdLayout aside={<p>Sessions last up to 12 hours and end on sign-out on the server, not only in this browser.</p>}>
        <Suspense fallback={null}><LoginForm /></Suspense>
      </ThresholdLayout>
    </main>
  );
}
