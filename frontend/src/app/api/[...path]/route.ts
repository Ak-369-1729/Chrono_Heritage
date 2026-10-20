/**
 * Runtime reverse proxy to the FastAPI backend.
 * CHRONO_API_URL is read per request, so one build works in every environment.
 * Cookies, the CSRF client header and Set-Cookie are passed through unchanged.
 */
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "host", "content-length"]);

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const base = process.env.CHRONO_API_URL ?? "http://localhost:8000";
  const { path } = await ctx.params;
  const target = `${base.replace(/\/$/, "")}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v);
  });
  const init: RequestInit & { duplex?: "half" } = { method: req.method, headers, redirect: "manual" };
  if (!["GET", "HEAD"].includes(req.method)) {
    init.body = req.body;
    init.duplex = "half";
  }
  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return Response.json(
      { detail: { code: "api_unreachable", message: "The ChronoHeritage API is not reachable from the web server." } },
      { status: 502 },
    );
  }
  const out = new Headers();
  upstream.headers.forEach((v, k) => {
    const key = k.toLowerCase();
    if (!HOP_BY_HOP.has(key) && key !== "content-encoding" && key !== "set-cookie") out.append(k, v);
  });
  for (const c of upstream.headers.getSetCookie()) out.append("set-cookie", c);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
