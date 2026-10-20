"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, Loading, Notice, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { ROLE_LABEL, useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Role, RoleRequest, User } from "@/lib/types";
import { useSubmit } from "@/lib/useSubmit";

type RequestRow = RoleRequest & { user: User & { affiliation: string | null; status: string } };
const ROLES: Role[] = ["researcher", "steward", "reviewer", "admin"];

export default function AdminPage() {
  const { user, ready, can } = useAuth();
  return (
    <main className="chamber">
      <PageHeader
        title="Users and role requests"
        lede="Grant Data Steward, Reviewer and Administrator access, activate new accounts and suspend accounts. Every decision is written to the audit log."
      />
      {!ready ? (
        <Loading />
      ) : !user ? (
        <Notice tone="info" title="Sign in required"><Link className="inline" href="/login?next=/admin">Sign in</Link> as an administrator.</Notice>
      ) : !can("admin") ? (
        <Notice tone="blocked" title="Administrators only">
          Your role is {ROLE_LABEL[user.role]}. The server refuses these actions for any other role, whatever this page shows.
        </Notice>
      ) : (
        <AdminConsole me={user} />
      )}
    </main>
  );
}

function AdminConsole({ me }: { me: User }) {
  const requests = useResource<{ requests: RequestRow[] }>("/auth/role-requests?status=pending");
  const users = useResource<{ users: User[] }>("/auth/users");
  const reload = async () => {
    await Promise.all([requests.reload(), users.reload()]);
  };
  const pendingAccounts = users.data?.users.filter((u) => u.status === "pending_activation") ?? [];
  return (
    <div className="space-y-12">
      <Panel id="requests" title="Pending role requests" meta={requests.data ? `${requests.data.requests.length} waiting` : undefined}>
        {requests.loading ? <Loading /> : requests.error ? <ErrorState error={requests.error} onRetry={requests.reload} /> :
          requests.data!.requests.length === 0 ? <EmptyState title="No requests waiting">New requests appear here when someone asks for Data Steward or Reviewer access.</EmptyState> : (
            <ul className="space-y-4">
              {requests.data!.requests.map((r) => <RequestItem key={r.id} r={r} onDone={reload} />)}
            </ul>
          )}
      </Panel>

      {pendingAccounts.length > 0 && (
        <Panel id="activation" title="Accounts waiting for activation">
          <ul className="space-y-2">
            {pendingAccounts.map((u) => <ActivationItem key={u.id} u={u} onDone={reload} />)}
          </ul>
        </Panel>
      )}

      <Panel id="users" title="All accounts" meta={users.data ? `${users.data.users.length} accounts` : undefined}>
        {users.loading ? <Loading /> : users.error ? <ErrorState error={users.error} onRetry={users.reload} /> : (
          <div className="table-frame">
            <table className="dtable min-w-[760px]">
              <thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Created</th><th>Last sign-in</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{users.data!.users.map((u) => <UserRow key={u.id} u={u} me={me} onDone={reload} />)}</tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function RequestItem({ r, onDone }: { r: RequestRow; onDone: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const s = useSubmit(async (decision: "approve" | "decline") => {
    await api(`/auth/role-requests/${r.id}/decision`, { method: "POST", json: { decision, note: note.trim() || undefined } });
    await onDone();
    return decision;
  });
  return (
    <li className="niche p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-ivory">
          <span className="font-medium">{r.user.display_name}</span> <span className="text-mist">{r.user.email}</span>
        </p>
        <p className="text-sm">asks for <span className="text-brass-bright">{ROLE_LABEL[r.requested_role]}</span> (currently {ROLE_LABEL[r.user.role]})</p>
      </div>
      {r.user.affiliation && <p className="mt-1 text-xs text-mist">Affiliation: {r.user.affiliation}</p>}
      <p className="mt-3 border-l-2 border-rule pl-3 text-sm text-ivory-dim">{r.statement || "No statement given."}</p>
      <p className="mt-2 text-xs text-mist">Requested {dateTime(r.created_at)}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs text-ivory-dim">Decision note (optional, recorded in the audit log)
          <input className="field mt-1" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" disabled={s.pending} onClick={() => void s.run("approve")}>Approve</button>
          <button className="btn btn-quiet btn-sm" disabled={s.pending} onClick={() => void s.run("decline")}>Decline</button>
        </div>
      </div>
      {s.error && <div className="mt-2"><ErrorState error={s.error} /></div>}
    </li>
  );
}

function ActivationItem({ u, onDone }: { u: User; onDone: () => Promise<void> }) {
  const s = useSubmit(async () => {
    await api(`/auth/users/${u.id}`, { method: "PATCH", json: { status: "active" } });
    await onDone();
    return true;
  });
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-2">
      <span>{u.display_name} <span className="text-mist">{u.email}</span></span>
      <button className="btn btn-quiet btn-sm" disabled={s.pending} onClick={() => void s.run()}>{s.pending ? "Activating…" : "Activate"}</button>
      {s.error && <ErrorState error={s.error} />}
    </li>
  );
}

function UserRow({ u, me, onDone }: { u: User; me: User; onDone: () => Promise<void> }) {
  const [role, setRole] = useState<Role>(u.role);
  const self = u.id === me.id;
  const save = useSubmit(async (body: { role?: Role; status?: "active" | "suspended" }) => {
    await api(`/auth/users/${u.id}`, { method: "PATCH", json: body });
    await onDone();
    return true;
  });
  return (
    <tr>
      <td><span className="text-ivory">{u.display_name}</span><span className="block text-xs text-mist">{u.email}</span></td>
      <td>
        <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.email}</label>
        <select id={`role-${u.id}`} className="field py-1" value={role} disabled={self || save.pending} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        {u.pending_role_request && <span className="mt-1 block text-xs text-brass-bright">requests {ROLE_LABEL[u.pending_role_request.requested_role]}</span>}
      </td>
      <td><StatusBadge status={u.status === "active" ? "validated" : u.status === "suspended" ? "blocked" : "pending"} label={u.status?.replace("_", " ") ?? "—"} /></td>
      <td className="num text-xs">{dateTime(u.created_at)}</td>
      <td className="num text-xs">{dateTime(u.last_login_at)}</td>
      <td className="whitespace-nowrap">
        {self ? <span className="text-xs text-mist">You</span> : (
          <div className="flex gap-2">
            <button className="btn btn-quiet btn-sm" disabled={role === u.role || save.pending} onClick={() => void save.run({ role })}>Save role</button>
            {u.status === "active"
              ? <button className="btn btn-danger btn-sm" disabled={save.pending} onClick={() => void save.run({ status: "suspended" })}>Suspend</button>
              : <button className="btn btn-quiet btn-sm" disabled={save.pending} onClick={() => void save.run({ status: "active" })}>Activate</button>}
          </div>
        )}
        {save.error && <p role="alert" className="mt-1 max-w-[16rem] whitespace-normal text-xs text-uncertain">{save.error.message}</p>}
      </td>
    </tr>
  );
}
