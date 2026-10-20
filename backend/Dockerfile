# ChronoHeritage API / worker image
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# requirements.txt pins every direct dependency; de406 (≈180 MB of JPL coefficients) is installed from PyPI.
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY alembic.ini pyproject.toml requirements.lock ./
COPY alembic ./alembic
COPY app ./app
COPY docker-entrypoint.sh ./
# strip Windows line endings in case the file was edited on Windows, then create an unprivileged user
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh \
 && useradd --create-home --uid 10001 chrono && mkdir -p /data/artifacts && chown -R chrono /data /app
USER chrono
ENV CHRONO_ARTIFACT_DIR=/data/artifacts
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v2/health', timeout=4).status==200 else 1)" || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["api"]
