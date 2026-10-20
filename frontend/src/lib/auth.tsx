"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { applyMotionPreference, readLocalPrefs, writeLocalPrefs } from "./prefs";
import type { Preferences, Role, RoleRequest, User } from "./types";
import { installHashLinks, installUnsavedGuard } from "./unsaved";

/** Mirrors backend ROLE_RANK. Used only to decide what to *show*; every rule is enforced by the API. */
export const RANK: Record<Role, number> = { viewer: 0, researcher: 1, steward: 2, reviewer: 3, admin: 4 };

export const ROLE_LABEL: Record<Role, string> = {
  viewer: "Visitor", researcher: "Researcher", steward: "Data Steward", reviewer: "Reviewer", admin: "Administrator",
};

export interface RegisterInput {
  email: string;
  display_name: string;
  password: string;
  requested_role: "researcher" | "steward" | "reviewer";
  affiliation?: string;
  statement?: string;
}
export interface RegisterResult { user: User; signed_in: boolean; role_request: RoleRequest | null; message: string }

interface AuthState {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: (everywhere?: boolean) => Promise<void>;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  refresh: () => Promise<void>;
  savePreferences: (p: Preferences) => Promise<void>;
  can: (role: Role) => boolean;
  preferences: Preferences;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [localPrefs, setLocalPrefs] = useState<Preferences>({});

  const refresh = useCallback(async () => {
    try {
      const d = await api<{ user: User | null }>("/auth/me");
      setUser(d.user);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    installUnsavedGuard();
    installHashLinks();
    setLocalPrefs(readLocalPrefs());
    void refresh();
  }, [refresh]);

  // Signed-in users carry their preferences between devices; visitors keep them in this browser only.
  const preferences = useMemo<Preferences>(() => ({ ...localPrefs, ...(user?.preferences ?? {}) }), [localPrefs, user]);
  useEffect(() => applyMotionPreference(preferences.motion), [preferences.motion]);

  const signIn = useCallback(async (email: string, password: string) => {
    await api<{ user: User }>("/auth/login", { method: "POST", json: { email, password } });
    const me = await api<{ user: User | null }>("/auth/me");
    setUser(me.user);
    return me.user as User;
  }, []);

  const signOut = useCallback(async (everywhere = false) => {
    try {
      await api(`/auth/logout${everywhere ? "?everywhere=true" : ""}`, { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const d = await api<RegisterResult>("/auth/register", { method: "POST", json: input });
    if (d.signed_in) setUser(d.user);
    return d;
  }, []);

  const savePreferences = useCallback(async (p: Preferences) => {
    const next = { ...localPrefs, ...p };
    setLocalPrefs(next);
    writeLocalPrefs(next);
    if (user) {
      const d = await api<{ user: User }>("/auth/me", { method: "PATCH", json: { preferences: p } });
      setUser(d.user);
    }
  }, [localPrefs, user]);

  const can = useCallback((role: Role) => !!user && RANK[user.role] >= RANK[role], [user]);
  const value = useMemo(
    () => ({ user, ready, signIn, signOut, register, refresh, savePreferences, can, preferences }),
    [user, ready, signIn, signOut, register, refresh, savePreferences, can, preferences],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
