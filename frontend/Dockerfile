# ChronoHeritage web client (Next.js standalone output)
# Debian slim (glibc) rather than Alpine (musl): the same C library as CI and most developer machines, which the
# native build tools (Tailwind's oxide engine, lightningcss) are tested against.
FROM node:22-slim AS deps
WORKDIR /web
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund

FROM node:22-slim AS build
WORKDIR /web
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /web/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN useradd --create-home --uid 10001 web
COPY --from=build --chown=web /web/.next/standalone ./
COPY --from=build --chown=web /web/.next/static ./.next/static
COPY --from=build --chown=web /web/public ./public
USER web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# CHRONO_API_URL is read at request time by the /api proxy route.
CMD ["node", "server.js"]
