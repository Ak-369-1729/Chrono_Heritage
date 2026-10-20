"""ChronoHeritage API (FastAPI)."""

from __future__ import annotations

import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.v2 import analyses, auth, benchmarks, evidence, feasibility, meta, sites, sky, sources
from .config import get_settings

log = logging.getLogger("chronoheritage.api")
API_VERSION = "3.0.0"


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    app = FastAPI(
        title="ChronoHeritage API", version=API_VERSION,
        description="Reproducible research workflow for testing historical astronomical alignment hypotheses. "
                    "Candidate alignments are never presented as evidence of intent.",
        docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None,
    )
    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                           allow_methods=["*"], allow_headers=["*"])

    @app.middleware("http")
    async def correlation(request: Request, call_next):
        cid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        t0 = time.perf_counter()
        response = await call_next(request)
        response.headers["x-request-id"] = cid
        response.headers["x-content-type-options"] = "nosniff"
        response.headers["referrer-policy"] = "same-origin"
        log.info("%s %s %s %.1fms cid=%s", request.method, request.url.path, response.status_code,
                 (time.perf_counter() - t0) * 1000, cid)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        errors = []
        for e in exc.errors():
            loc = ".".join(str(x) for x in e.get("loc", []) if x != "body")
            errors.append(f"{loc}: {e.get('msg')}" if loc else e.get("msg"))
        return JSONResponse(status_code=422, content={"detail": {"code": "validation_error",
                                                                 "message": "Request validation failed.",
                                                                 "errors": errors}})

    prefix = "/api/v2"
    for r in (meta.router, auth.router, sources.router, sites.router, feasibility.router, sky.router,
              analyses.router, benchmarks.router, evidence.router):
        app.include_router(r, prefix=prefix)
    return app


app = create_app()
