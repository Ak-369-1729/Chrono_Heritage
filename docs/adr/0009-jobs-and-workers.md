# ADR 0009 — Background jobs in PostgreSQL

**Status:** accepted · **Date:** 2026-10-18

Analyses and benchmark runs are jobs in a `jobs` table, claimed with `SELECT … FOR UPDATE SKIP LOCKED` and an atomic
status change, so several workers can run without Redis or a paid queue. Jobs are idempotent by key; failures are
recorded on the job and on the subject (no partial success). For single-process development the API runs jobs
in-process (`CHRONO_RUN_JOBS_INLINE=true`). Both paths were tested.
