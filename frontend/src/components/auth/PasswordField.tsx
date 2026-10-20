"use client";

import { useId, useState } from "react";
import { estimateStrength } from "@/lib/password";

/** Password input with a show/hide toggle. The toggle is a real button with a state the screen reader announces. */
export function PasswordField({ id, label, value, onChange, autoComplete, error, hint, required = true, onBlur }: {
  id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: "new-password" | "current-password";
  error?: string | null; hint?: string; required?: boolean; onBlur?: () => void;
}) {
  const [shown, setShown] = useState(false);
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[0.8125rem] font-medium text-ivory-dim">
        <span className={required ? "required-mark" : undefined}>{label}</span>
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          className="field pr-20"
          value={value}
          required={required}
          spellCheck={false}
          autoCapitalize="none"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        <button
          type="button"
          className="absolute right-1 top-1/2 min-h-9 -translate-y-1/2 rounded-xs px-2.5 text-xs text-ivory-dim hover:bg-indigo-2 hover:text-ivory"
          aria-pressed={shown}
          aria-controls={id}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? "Hide" : "Show"}<span className="sr-only"> password</span>
        </button>
      </div>
      {hint && <p id={`${id}-hint`} className="text-2xs text-mist">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-uncertain">{error}</p>}
    </div>
  );
}

/** Strength meter: five engraved segments plus a label in words (never colour alone). */
export function StrengthMeter({ password }: { password: string }) {
  const id = useId();
  if (!password) return null;
  const s = estimateStrength(password);
  const tone = s.score <= 1 ? "bg-uncertain" : s.score === 2 ? "bg-brass" : "bg-copper-bright";
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-1.5 flex-1 ${i < s.score ? tone : "bg-rule-strong"}`} />
          ))}
        </div>
        <span id={id} className="w-24 text-right text-xs text-ivory-dim">{s.label}</span>
      </div>
      {s.tips.length > 0 && <p className="text-2xs text-mist">{s.tips[0]}</p>}
      <p className="text-2xs text-mist">A rough estimate from length and variety. It cannot tell whether a password has been used or leaked elsewhere.</p>
    </div>
  );
}
