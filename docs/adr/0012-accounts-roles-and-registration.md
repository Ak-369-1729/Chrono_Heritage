# ADR 0012: Accounts, role requests and revocable sessions

**Status:** accepted. **Date:** 2026-10-18. **Supersedes:** parts of ADR 0011 (self-registration, logout).

## Context
V3 must let people sign up and say what they need (Researcher, Data Steward, Reviewer) without letting a public form
grant privileges. The v2 audit also found three related problems:

* Sign-out only deleted the cookie, so a copied token stayed valid until it expired.
* Any researcher could publish a site straight into the public atlas.
* The seed printed generated passwords to the log.

## Decision
* **Roles** run viewer < researcher < **steward** < reviewer < admin.
  * A **Data Steward** may publish site records to the public registry and curate other contributors' public
    records. Every change is audited, and a material change still resets review.
  * A steward cannot review, approve or archive other people's records.
  * Researchers keep private drafts. The server refuses `visibility=public` from them with `403 steward_required`.
* **Registration** (`POST /auth/register`):
  * There is no `role` field; extra fields are rejected with 422.
  * Every account is created as *researcher*.
  * `requested_role` steward or reviewer creates a `role_requests` row. A database check constraint allows only
    those two values, so admin can never be requested.
  * Only an administrator, through the API/UI or the operator CLI `app.manage`, can grant a role.
  * `CHRONO_REGISTRATION_MODE` is `open`, `approval` (an admin activates each account) or `closed`.
  * Duplicate emails get `409 email_taken`. This tells an anonymous caller that an address is registered. The
    trade-off was accepted because the brief asks for it, and registration is rate-limited per client address.
* **Sessions:**
  * Each token carries a session id bound to an `auth_sessions` row.
  * Sign-out, sign-out-everywhere, password change (other sessions), password reset and suspension revoke it.
  * Tokens without a live session, including v2 tokens, are rejected.
  * The role is read from the database on every request, so a granted or removed role takes effect immediately.
* **Passwords:**
  * scrypt hashes, at least 12 characters, not containing the email name or display name.
  * Never generated, printed, logged, returned or stored in audit events.
  * The browser strength meter is presented as a rough estimate only.
* **Abuse limits:**
  * Sign-in, sign-up, password changes and role requests are rate-limited in process (configurable).
  * Each non-admin user may have at most `CHRONO_MAX_ACTIVE_JOBS_PER_USER` unfinished calculations.
* **CSRF:** cookie writes still need `x-chronoheritage-client`. Sign-out from a cookie without that header revokes
  nothing.

## Consequences
* Migration `0002` adds `users.status/affiliation/preferences/...`, `role_requests` and `auth_sessions`, and a unique
  index on `lower(email)`. Existing users become `active`.
* All v2 tokens are invalid after the upgrade, so users sign in again.
* In-process rate limits are counted per API worker. A multi-host deployment should also limit at the reverse
  proxy.
* There is no email verification or email password reset, because no mail service is required. Administrators reset
  passwords with `app.manage reset-password`.
