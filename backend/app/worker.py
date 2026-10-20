"""Background worker: ``python -m app.worker``.

Polls the ``jobs`` table using ``SELECT … FOR UPDATE SKIP LOCKED`` so several
workers can run safely.  Used when ``CHRONO_RUN_JOBS_INLINE=false``.
"""

from __future__ import annotations

import logging
import signal
import time

from .db import session_scope
from .services import jobs

log = logging.getLogger("chronoheritage.worker")
_stop = False


def _handle(signum, frame):  # pragma: no cover - signal handling
    global _stop
    _stop = True


def main(poll_seconds: float = 1.0) -> None:  # pragma: no cover - long-running loop
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    signal.signal(signal.SIGTERM, _handle)
    signal.signal(signal.SIGINT, _handle)
    log.info("worker started")
    while not _stop:
        session = session_scope()
        try:
            job_id = jobs.claim_next(session)
            session.commit()
        finally:
            session.close()
        if job_id:
            log.info("running job %s", job_id)
            jobs.run_job(job_id)
        else:
            time.sleep(poll_seconds)
    log.info("worker stopped")


if __name__ == "__main__":  # pragma: no cover
    main()
