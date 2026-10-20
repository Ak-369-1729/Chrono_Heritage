"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { PasswordField, StrengthMeter } from "@/components/auth/PasswordField";
import { Glyph } from "@/components/Glyph";
import { ErrorState, Field, KeyValue, Loading, Notice, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { RANK, ROLE_LABEL, useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import { passwordProblems } from "@/lib/password";
import type { Preferences, RegistrationInfo, RequestableRole, User } from "@/lib/types";
import { useSubmit } from "@/lib/useSubmit";

export default function AccountPage() {
  const { user, ready } = useAuth();
  return (
    <main className="chamber chamber-narrow">
      <PageHeader title="Account and preferences" lede="Your profile, your access, and how the observatory moves on your screens." />
      {!ready ? (
        <Loading label="Loading your account" />
      ) : !user ? (
        <div className="space-y-6">
          <Notice tone="info" title="Not signed in">
            <Link className="inline" href="/login?next=/account">Sign in</Link> or <Link className="inline" href="/register">create an account</Link> to manage your profile.
            Display preferences below are kept in this browser.
          </Notice>
          <PreferencesPanel />
        </div>
      ) : (
        <div className="space-y-12">
          <AccessPanel user={user} />
          <ProfilePanel user={user} />
          <PreferencesPanel />
          <PasswordPanel user={user} />
          <SessionsPanel />
        </div>
      )}
    </main>
  );
}

function AccessPanel({ user }: { user: User }) {
  const { refresh } = useAuth();
  const info = useResource<RegistrationInfo>("/auth/registration");
  const req = user.pending_role_request;
  const options = (info.data?.roles ?? []).filter((r) => r.key !== "researcher" && RANK[r.key] > RANK[user.role]) as { key: RequestableRole; label: string; summary: string }[];
  const [role, setRole] = useState<RequestableRole | "">("");
  const [statement, setStatement] = useState("");
  const ask = useSubmit(async () => {
    await api("/auth/me/role-requests", { method: "POST", json: { requested_role: role, statement } });
    await refresh();
    setStatement("");
    return true;
  });
  const withdraw = useSubmit(async (id: string) => {
    await api(`/auth/me/role-requests/${id}/withdraw`, { method: "POST" });
    await refresh();
    return true;
  });
  const roleInfo = info.data?.roles.find((r) => r.key === user.role);
  return (
    <Panel id="access" title="Your access" framed>
      <KeyValue rows={[
        ["Role", <span key="r" className="text-ivory">{ROLE_LABEL[user.role]}</span>],
        ["Account status", <StatusBadge key="s" status={user.status === "active" ? "validated" : user.status ?? "pending"} label={user.status === "active" ? "Active" : user.status?.replace("_", " ")} />],
        ["Email", user.email],
        ["Member since", user.created_at ? dateTime(user.created_at) : "—"],
        ["Last sign-in", user.last_login_at ? dateTime(user.last_login_at) : "—"],
      ]} />
      {roleInfo && (
        <ul className="mt-4 grid gap-1.5 text-sm text-ivory-dim sm:grid-cols-2">
          {roleInfo.can.map((c) => <li key={c} className="flex gap-2"><span className="mt-1.5 text-copper-bright"><Glyph kind="solid" /></span>{c}</li>)}
        </ul>
      )}
      {user.role === "admin" && <p className="mt-4 text-sm text-ivory-dim">You can grant roles on the <Link className="inline" href="/admin">users and role requests</Link> page.</p>}

      <div className="mt-6 border-t border-rule pt-5">
        <h3 className="heading text-lg">Request more access</h3>
        <p className="mt-1 text-sm text-ivory-dim">Roles are granted by an administrator, never by choosing them yourself. Until a request is approved you keep your current access.</p>
        {req ? (
          <div className="mt-4 space-y-3">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge status="pending" label="Pending review" />
              <span>{ROLE_LABEL[req.requested_role]} requested {dateTime(req.created_at)}</span>
            </p>
            {req.statement && <p className="border-l-2 border-rule pl-3 text-sm text-ivory-dim">{req.statement}</p>}
            {withdraw.error && <ErrorState error={withdraw.error} />}
            <button className="btn btn-quiet btn-sm" disabled={withdraw.pending} onClick={() => void withdraw.run(req.id)}>
              {withdraw.pending ? "Withdrawing…" : "Withdraw request"}
            </button>
          </div>
        ) : options.length === 0 ? (
          <p className="mt-3 text-sm text-mist">{info.loading ? "Loading roles…" : "You already have the highest role available by request."}</p>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); void ask.run(); }}>
            <fieldset>
              <legend className="text-[0.8125rem] font-medium text-ivory-dim">Role</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {options.map((o) => (
                  <label key={o.key} className={`niche flex cursor-pointer gap-3 p-3 ${role === o.key ? "border-brass" : ""}`}>
                    <input type="radio" name="req-role" className="mt-1 accent-[var(--color-brass)]" checked={role === o.key} onChange={() => setRole(o.key)} />
                    <span><span className="block text-ivory">{o.label}</span><span className="block text-xs text-ivory-dim">{o.summary}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Why do you need it?" htmlFor="acct-statement" hint="At least 20 characters. An administrator reads this.">
              <textarea id="acct-statement" rows={3} className="field" value={statement} maxLength={2000} onChange={(e) => setStatement(e.target.value)} aria-describedby="acct-statement-hint" />
            </Field>
            {ask.error && <ErrorState error={ask.error} />}
            {ask.done && <Notice tone="ok" title="Request sent">An administrator will review it.</Notice>}
            <button className="btn btn-quiet" disabled={!role || statement.trim().length < 20 || ask.pending}>{ask.pending ? "Sending…" : "Send request"}</button>
          </form>
        )}
      </div>
    </Panel>
  );
}

function ProfilePanel({ user }: { user: User }) {
  const { refresh } = useAuth();
  const [name, setName] = useState(user.display_name);
  const [aff, setAff] = useState(user.affiliation ?? "");
  const save = useSubmit(async () => {
    await api("/auth/me", { method: "PATCH", json: { display_name: name.trim(), affiliation: aff.trim() || null } });
    await refresh();
    return true;
  });
  const dirty = name.trim() !== user.display_name || (aff.trim() || null) !== (user.affiliation ?? null);
  return (
    <Panel id="profile" title="Profile">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save.run(); }}>
        <Field label="Name" htmlFor="p-name"><input id="p-name" className="field" value={name} maxLength={200} autoComplete="name" onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Affiliation" htmlFor="p-aff"><input id="p-aff" className="field" value={aff} maxLength={300} autoComplete="organization" onChange={(e) => setAff(e.target.value)} /></Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button className="btn btn-quiet" disabled={!dirty || !name.trim() || save.pending}>{save.pending ? "Saving…" : "Save profile"}</button>
          {save.done && !dirty && <span role="status" className="text-sm text-copper-bright">Profile saved.</span>}
        </div>
        {save.error && <div className="sm:col-span-2"><ErrorState error={save.error} /></div>}
      </form>
    </Panel>
  );
}

const MOTION: { key: NonNullable<Preferences["motion"]>; label: string; note: string }[] = [
  { key: "system", label: "Follow my device", note: "Uses your operating system's reduced-motion setting." },
  { key: "reduced", label: "Reduce motion", note: "No scroll animation or camera movement anywhere." },
  { key: "full", label: "Allow motion", note: "Animated scenes even if the device asks for less." },
];
const LANDING: { key: NonNullable<Preferences["landing"]>; label: string; note: string }[] = [
  { key: "auto", label: "Choose for this device", note: "3D on capable computers, layered illustrations on phones." },
  { key: "3d", label: "3D scene", note: "Needs WebGL; heavier on battery." },
  { key: "layers", label: "Layered illustrations", note: "Light, no WebGL." },
  { key: "static", label: "Still images", note: "No scroll-driven movement." },
];

function PreferencesPanel() {
  const { preferences, savePreferences, user } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(t);
  }, [status]);
  const set = async (p: Preferences) => {
    setErr(null);
    try {
      await savePreferences(p);
      setStatus(user ? "Saved to your account." : "Saved in this browser.");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Panel id="preferences" title="Motion and display" meta={<span role="status">{status}</span>}>
      <div className="grid gap-8 md:grid-cols-2">
        <Choice legend="Motion" name="motion" value={preferences.motion ?? "system"} options={MOTION} onChange={(v) => void set({ motion: v as Preferences["motion"] })} />
        <Choice legend="Landing page" name="landing" value={preferences.landing ?? "auto"} options={LANDING} onChange={(v) => void set({ landing: v as Preferences["landing"] })} />
      </div>
      {err && <p role="alert" className="mt-3 text-sm text-uncertain">{err}</p>}
    </Panel>
  );
}

function Choice({ legend, name, value, options, onChange }: { legend: string; name: string; value: string; options: { key: string; label: string; note: string }[]; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="text-[0.8125rem] font-medium text-ivory-dim">{legend}</legend>
      <div className="mt-2 grid gap-1">
        {options.map((o) => (
          <label key={o.key} className="flex cursor-pointer items-start gap-3 rounded-xs px-2 py-2 hover:bg-indigo-2">
            <input type="radio" name={name} className="mt-1 accent-[var(--color-brass)]" checked={value === o.key} onChange={() => onChange(o.key)} />
            <span><span className="block text-ivory">{o.label}</span><span className="block text-xs text-mist">{o.note}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PasswordPanel({ user }: { user: User }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const problems = next ? passwordProblems(next, user.email, user.display_name) : [];
  const mismatch = confirm.length > 0 && confirm !== next;
  const s = useSubmit(async () => {
    const r = await api<{ other_sessions_revoked: number }>("/auth/me/password", { method: "POST", json: { current_password: cur, new_password: next } });
    setCur(""); setNext(""); setConfirm("");
    return r;
  });
  return (
    <Panel id="password" title="Password">
      <form className="grid max-w-xl gap-4" onSubmit={(e) => { e.preventDefault(); void s.run(); }}>
        <PasswordField id="pw-current" label="Current password" value={cur} onChange={setCur} autoComplete="current-password" />
        <div className="space-y-2">
          <PasswordField id="pw-new" label="New password" value={next} onChange={setNext} autoComplete="new-password" error={problems[0]} />
          <StrengthMeter password={next} />
        </div>
        <PasswordField id="pw-confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" error={mismatch ? "The two passwords do not match." : null} />
        {s.error && <ErrorState error={s.error} />}
        {s.done && <Notice tone="ok" title="Password changed">{s.done.other_sessions_revoked > 0 ? `${s.done.other_sessions_revoked} other session(s) were signed out.` : "No other sessions were open."}</Notice>}
        <div><button className="btn btn-quiet" disabled={!cur || !next || problems.length > 0 || confirm !== next || s.pending}>{s.pending ? "Changing…" : "Change password"}</button></div>
      </form>
    </Panel>
  );
}

function SessionsPanel() {
  const { signOut } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<"one" | "all" | null>(null);
  const go = async (everywhere: boolean) => {
    setPending(everywhere ? "all" : "one");
    await signOut(everywhere);
    router.push("/login?signedout=1");
  };
  return (
    <Panel id="sessions" title="Sign out">
      <p className="text-sm text-ivory-dim">Signing out ends the session on the server, so a copied session token stops working too.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="btn btn-quiet" disabled={!!pending} onClick={() => void go(false)}>{pending === "one" ? "Signing out…" : "Sign out on this device"}</button>
        <button className="btn btn-danger" disabled={!!pending} onClick={() => void go(true)}>{pending === "all" ? "Signing out…" : "Sign out everywhere"}</button>
      </div>
    </Panel>
  );
}
