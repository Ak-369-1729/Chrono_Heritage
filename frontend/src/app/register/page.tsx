"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PasswordField, StrengthMeter } from "@/components/auth/PasswordField";
import { ThresholdLayout } from "@/components/auth/Threshold";
import { Glyph } from "@/components/Glyph";
import { ErrorState, Field, Loading, Notice, PageHeader } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { ROLE_LABEL, useAuth, type RegisterResult } from "@/lib/auth";
import { useResource } from "@/lib/hooks";
import { EMAIL_RE, passwordProblems } from "@/lib/password";
import type { RegistrationInfo, RoleInfo } from "@/lib/types";

type RoleKey = RoleInfo["key"];
type Errors = Partial<Record<"email" | "name" | "password" | "confirm" | "statement" | "form", string>>;

export default function RegisterPage() {
  const info = useResource<RegistrationInfo>("/auth/registration");
  const { user, ready } = useAuth();
  const [done, setDone] = useState<RegisterResult | null>(null);

  return (
    <main className="chamber">
      <PageHeader
        title="Create an account"
        lede="Browsing the atlas, the sky and the evidence is open to everyone. An account lets you record sites, register hypotheses, run analyses and keep reports."
      />
      <ThresholdLayout aside={<p>Every account starts with researcher access. Data Steward and Reviewer access is granted only by an administrator, after you ask for it here or later from your account page.</p>}>
        {done ? (
          <Success result={done} />
        ) : !ready || info.loading ? (
          <Loading label="Loading the sign-up form" />
        ) : info.error ? (
          <ErrorState error={info.error} onRetry={info.reload} />
        ) : user ? (
          <Notice tone="info" title="You are signed in">
            as {user.display_name} ({ROLE_LABEL[user.role]}). <Link className="inline" href="/account">Open your account</Link> to request another role.
          </Notice>
        ) : !info.data!.open ? (
          <Notice tone="blocked" title="Sign-up is closed">
            This server does not accept public registrations. Ask an administrator to create an account for you.{" "}
            <Link className="inline" href="/login">Sign in</Link> if you already have one.
          </Notice>
        ) : (
          <RegisterForm info={info.data!} onDone={setDone} />
        )}
      </ThresholdLayout>
    </main>
  );
}

function RegisterForm({ info, onDone }: { info: RegistrationInfo; onDone: (r: RegisterResult) => void }) {
  const { register } = useAuth();
  const [role, setRole] = useState<RoleKey>("researcher");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [statement, setStatement] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [serverErr, setServerErr] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const summary = useRef<HTMLDivElement>(null);
  const privileged = role !== "researcher";

  function validate(): Errors {
    const e: Errors = {};
    if (!name.trim()) e.name = "Enter the name other researchers will see.";
    if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid email address, such as name@example.org.";
    const p = passwordProblems(password, email.trim(), name.trim());
    if (p.length) e.password = p[0];
    if (confirm !== password) e.confirm = "The two passwords do not match.";
    if (privileged && statement.trim().length < 20) e.statement = "Explain in at least 20 characters why you need this role.";
    return e;
  }
  const live = validate();
  const show = (k: keyof Errors) => (touched[k] ? live[k] : undefined) ?? errors[k];

  useEffect(() => {
    if (serverErr || Object.keys(errors).length) summary.current?.focus();
  }, [serverErr, errors]);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setTouched({ name: true, email: true, password: true, confirm: true, statement: true });
    setErrors(e);
    setServerErr(null);
    if (Object.keys(e).length) return;
    setPending(true);
    try {
      const r = await register({
        email: email.trim(), display_name: name.trim(), password, requested_role: role,
        affiliation: affiliation.trim() || undefined, statement: privileged ? statement.trim() : undefined,
      });
      onDone(r);
    } catch (err) {
      const a = err as ApiError;
      if (a.code === "email_taken") setErrors({ email: a.message });
      else setServerErr(a);
    } finally {
      setPending(false);
    }
  }

  const errorList = Object.entries(errors).filter(([, v]) => v) as [keyof Errors, string][];
  return (
    <form onSubmit={submit} noValidate className="space-y-9" aria-describedby="reg-note">
      <div ref={summary} tabIndex={-1} className="outline-none">
        {errorList.length > 0 && (
          <div role="alert" className="border-l-2 border-uncertain bg-indigo/70 px-4 py-3 text-sm">
            <p className="font-medium text-uncertain">Check {errorList.length === 1 ? "this field" : `these ${errorList.length} fields`}</p>
            <ul className="mt-1 list-disc pl-5 text-ivory-dim">
              {errorList.map(([k, v]) => <li key={k}><a className="inline" href={`#reg-${k}`}>{v}</a></li>)}
            </ul>
          </div>
        )}
        {serverErr && <ErrorState error={serverErr} />}
      </div>

      <fieldset>
        <legend className="heading text-xl text-ivory md:text-2xl">What brings you to ChronoHeritage?</legend>
        <p id="reg-note" className="mt-1 max-w-2xl text-sm text-ivory-dim">{info.note}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {info.roles.map((r) => (
            <RoleCard key={r.key} role={r} checked={role === r.key} onSelect={() => setRole(r.key)} />
          ))}
        </div>
      </fieldset>

      {privileged && (
        <Notice tone="info" title="Request, not a grant">
          Your account will be created with researcher access. An administrator reviews your request for{" "}
          {info.roles.find((r) => r.key === role)?.label} access; you can follow it on your account page.
        </Notice>
      )}

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="heading mb-4 text-xl text-ivory md:text-2xl">Your details</legend>
        <Field label="Name" htmlFor="reg-name" required error={show("name")}>
          <input id="reg-name" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))} aria-invalid={show("name") ? true : undefined}
            aria-describedby={show("name") ? "reg-name-error" : undefined} maxLength={200} />
        </Field>
        <Field label="Email" htmlFor="reg-email" required error={show("email")}>
          <input id="reg-email" type="email" className="field" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}
            value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            aria-invalid={show("email") ? true : undefined} aria-describedby={show("email") ? "reg-email-error" : undefined} maxLength={320} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Affiliation (optional)" htmlFor="reg-aff" hint="Institution, project or independent. Shown to administrators reviewing role requests.">
            <input id="reg-aff" className="field" autoComplete="organization" value={affiliation} onChange={(e) => setAffiliation(e.target.value)}
              aria-describedby="reg-aff-hint" maxLength={300} />
          </Field>
        </div>
        <div className="space-y-2">
          <PasswordField id="reg-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password"
            hint={`At least ${info.password_min_length} characters. A passphrase of several words works well.`}
            error={show("password")} onBlur={() => setTouched((t) => ({ ...t, password: true }))} />
          <StrengthMeter password={password} />
        </div>
        <PasswordField id="reg-confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password"
          error={show("confirm")} onBlur={() => setTouched((t) => ({ ...t, confirm: true }))} />
        {privileged && (
          <div className="sm:col-span-2">
            <Field label={`Why do you need ${info.roles.find((r) => r.key === role)?.label} access?`} htmlFor="reg-statement" required
              hint="For example the archive, survey or review body you work with. An administrator reads this." error={show("statement")}>
              <textarea id="reg-statement" rows={4} className="field" value={statement} maxLength={2000}
                onChange={(e) => setStatement(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, statement: true }))}
                aria-invalid={show("statement") ? true : undefined} aria-describedby={`reg-statement-hint${show("statement") ? " reg-statement-error" : ""}`} />
            </Field>
          </div>
        )}
      </fieldset>

      {info.requires_activation && (
        <Notice tone="info" title="Activation needed">This server asks an administrator to activate every new account before first sign-in.</Notice>
      )}

      <div className="flex flex-wrap items-center gap-4 border-t border-rule pt-6">
        {/* mousedown is cancelled so the focused field does not blur first: a blur would reveal its message, move the
            button and swallow the click on touch screens */}
        <button className="btn btn-primary px-6" disabled={pending} onMouseDown={(e) => e.preventDefault()}>{pending ? "Creating your account…" : "Create account"}</button>
        <p className="text-sm text-ivory-dim">Already registered? <Link className="inline" href="/login">Sign in</Link></p>
      </div>
    </form>
  );
}

function RoleCard({ role, checked, onSelect }: { role: RoleInfo; checked: boolean; onSelect: () => void }) {
  const id = `role-${role.key}`;
  return (
    <label htmlFor={id}
      className={`niche flex cursor-pointer flex-col gap-2 p-4 transition-colors ${checked ? "border-brass bg-indigo-2" : "hover:border-sandstone-dim"}`}>
      <span className="flex items-center gap-2.5">
        <input id={id} type="radio" name="requested_role" value={role.key} checked={checked} onChange={onSelect}
          className="h-4 w-4 accent-[var(--color-brass)]" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`} />
        <span id={`${id}-title`} className="heading text-lg text-ivory">{role.label}</span>
      </span>
      <span id={`${id}-desc`} className="text-sm text-ivory-dim">
        {role.summary}
        <span className="mt-2 block text-xs text-mist">{role.requires_approval ? "Needs administrator approval." : "Available immediately."}</span>
      </span>
      <ul className="mt-1 space-y-1 text-xs text-ivory-dim">
        {role.can.map((c) => <li key={c} className="flex gap-2"><span className="mt-1 text-brass"><Glyph kind="diamond" /></span>{c}</li>)}
      </ul>
    </label>
  );
}

function Success({ result }: { result: RegisterResult }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section aria-labelledby="reg-done" className="niche space-y-4 p-6">
      <h2 id="reg-done" ref={heading} tabIndex={-1} className="heading text-2xl text-ivory outline-none">
        {result.signed_in ? `Welcome, ${result.user.display_name}` : "Account created"}
      </h2>
      <p role="status" className="text-ivory-dim">{result.message}</p>
      {result.role_request && (
        <p className="flex items-center gap-2 text-sm text-brass-bright">
          <Glyph kind="half" /> {ROLE_LABEL[result.role_request.requested_role]} request pending administrator review
        </p>
      )}
      {result.signed_in ? (
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/atlas" className="btn btn-primary">Open the atlas</Link>
          <Link href="/analysis/new" className="btn btn-quiet">Register a hypothesis</Link>
          <Link href="/account" className="btn btn-quiet">Account and preferences</Link>
        </div>
      ) : (
        <Link href="/login" className="btn btn-quiet">Go to sign in</Link>
      )}
    </section>
  );
}
