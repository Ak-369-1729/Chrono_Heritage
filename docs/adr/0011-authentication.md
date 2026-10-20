# ADR 0011 — Authentication and authorization

**Status:** accepted · **Date:** 2026-10-18

Accounts with roles viewer < researcher < reviewer < admin; scrypt password hashes; HMAC-SHA256 signed tokens with
expiry, delivered as an HttpOnly SameSite=Lax cookie (and as a bearer token for API clients). Cookie-authenticated
writes must carry `x-chronoheritage-client` (CSRF guard). Login is rate-limited per client and email. Records,
analyses, observations and photographs are private by default; restricted locations are generalised to 0.1° for
non-reviewers. Every edit, review, sign-off and run is an audit event. Self-registration is off by default.
