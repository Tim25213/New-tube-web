// NewTube Web backend: a Cloudflare Worker (free plan is enough).
//
// The website can't call YouTube directly (browsers block cross-site requests),
// so this Worker forwards three kinds of request:
//   POST /yt/<endpoint>?client=web|tv|vr   -> www.youtube.com/youtubei/v1/<endpoint>
//   POST /oauth/device, /oauth/token, /oauth/refresh -> Google's TV sign-in (code flow)
//   GET  /vp?u=<googlevideo url>           -> video bytes (with Range), so playback is ad-free
// It keeps nothing: tokens live in your browser and are only passed through.
//
// Optional settings (Worker > Settings > Variables):
//   ALLOWED_ORIGINS  e.g. "https://yourname.github.io" (comma-separated). Strongly recommended.
//   TV_CLIENT_ID / TV_CLIENT_SECRET  override the YouTube TV sign-in client.

const VERSION = "1.0.0";
const YT = "https://www.youtube.com/youtubei/v1/";

const CLIENTS = {
  web: {
    id: "1",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    client: { clientName: "WEB", clientVersion: "2.20251120.01.00", platform: "DESKTOP" },
  },
  tv: {
    id: "7",
    ua: "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)",
    client: { clientName: "TVHTML5", clientVersion: "7.20251120.13.00" },
  },
  vr: {
    id: "28",
    ua: "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
    client: {
      clientName: "ANDROID_VR", clientVersion: "1.65.10", deviceMake: "Oculus", deviceModel: "Quest 3",
      androidSdkVersion: 32, osName: "Android", osVersion: "12L",
    },
  },
  ios: {
    id: "5",
    ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
    client: {
      clientName: "IOS", clientVersion: "20.10.4", deviceMake: "Apple", deviceModel: "iPhone16,2",
      osName: "iPhone", osVersion: "18.3.2.22D82",
    },
  },
};

const ENDPOINTS = new Set([
  "browse", "search", "next", "player", "guide", "navigation/resolve_url", "music/get_search_suggestions",
  "subscription/subscribe", "subscription/unsubscribe",
  "like/like", "like/dislike", "like/removelike", "browse/edit_playlist", "account/account_menu",
]);

// Public YouTube TV client, used only if it can't be read from youtube.com/tv.
const TV_FALLBACK = {
  id: "861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com",
  secret: "SboVhoG9s0rNafixCSGGKXAT",
};
const SCOPE = "http://gdata.youtube.com https://www.googleapis.com/auth/youtube-paid-content";
const CONSENT = "SOCS=CAI; CONSENT=YES+1";
let tvCreds = null;

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (allowed.length && origin && !allowed.includes(origin)) {
      return new Response("Origin not allowed", { status: 403 });
    }
    const cors = {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/") return json({ ok: true, name: "newtube-web-backend", version: VERSION }, 200, cors);
      if (path === "/vp") return await proxyVideo(req, url, cors);
      if (path.startsWith("/yt/") && req.method === "POST") return await innertube(req, url, path.slice(4), cors);
      if (path === "/oauth/device" && req.method === "POST") return await oauthDevice(env, cors);
      if (path === "/oauth/token" && req.method === "POST") return await oauthToken(req, env, cors);
      if (path === "/oauth/refresh" && req.method === "POST") return await oauthRefresh(req, env, cors);
      return json({ error: "not_found" }, 404, cors);
    } catch (e) {
      return json({ error: "worker_error", message: String(e && e.message || e) }, 502, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function innertube(req, url, endpoint, cors) {
  if (!ENDPOINTS.has(endpoint)) return json({ error: "endpoint_not_allowed" }, 400, cors);
  const c = CLIENTS[url.searchParams.get("client") || "web"];
  if (!c) return json({ error: "unknown_client" }, 400, cors);
  const body = await req.json().catch(() => ({}));
  const { hl = "en", gl = "US", visitorData, ...rest } = body;
  const client = { ...c.client, hl, gl };
  if (visitorData) client.visitorData = visitorData;
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": c.ua,
    "X-YouTube-Client-Name": c.id,
    "X-YouTube-Client-Version": c.client.clientVersion,
    Origin: "https://www.youtube.com",
    Cookie: CONSENT,
  };
  if (visitorData) headers["X-Goog-Visitor-Id"] = visitorData;
  const auth = req.headers.get("Authorization");
  if (auth && /^Bearer [\w.\-~+/=]+$/.test(auth)) headers.Authorization = auth;
  const r = await fetch(YT + endpoint + "?prettyPrint=false", {
    method: "POST",
    headers,
    body: JSON.stringify({ context: { client, user: { lockedSafetyMode: false } }, ...rest }),
  });
  return new Response(r.body, { status: r.status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function proxyVideo(req, url, cors) {
  const target = url.searchParams.get("u");
  if (!target) return json({ error: "missing_u" }, 400, cors);
  const t = new URL(target);
  if (t.protocol !== "https:" || !t.hostname.endsWith(".googlevideo.com")) {
    return json({ error: "host_not_allowed" }, 400, cors);
  }
  const headers = { "User-Agent": CLIENTS.vr.ua };
  const range = req.headers.get("Range");
  if (range) headers.Range = range;
  const r = await fetch(t.toString(), { headers, redirect: "follow" });
  const out = new Headers(cors);
  for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Last-Modified"]) {
    const v = r.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("Cache-Control", "private, max-age=3600");
  return new Response(r.body, { status: r.status, headers: out });
}

async function getTvCreds(env) {
  if (env.TV_CLIENT_ID && env.TV_CLIENT_SECRET) return { id: env.TV_CLIENT_ID, secret: env.TV_CLIENT_SECRET };
  if (tvCreds) return tvCreds;
  try {
    const html = await (await fetch("https://www.youtube.com/tv", {
      headers: { "User-Agent": CLIENTS.tv.ua, Cookie: CONSENT },
    })).text();
    const m = html.match(/<script[^>]+src="([^"]+base\.js)"/) || html.match(/"(\/s\/_\/kabuki\/[^"]+)"/);
    if (m) {
      const js = await (await fetch(new URL(m[1], "https://www.youtube.com").toString(), {
        headers: { "User-Agent": CLIENTS.tv.ua },
      })).text();
      const k = js.match(/clientId:"([-\w]+\.apps\.googleusercontent\.com)",\w+:"([-\w]+)"/);
      if (k) return (tvCreds = { id: k[1], secret: k[2] });
    }
  } catch (_) { /* fall through */ }
  return (tvCreds = TV_FALLBACK);
}

async function google(endpoint, params) {
  const r = await fetch("https://oauth2.googleapis.com/" + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": CLIENTS.tv.ua },
    body: new URLSearchParams(params).toString(),
  });
  return r.json();
}

async function oauthDevice(env, cors) {
  const { id } = await getTvCreds(env);
  const d = await google("device/code", {
    client_id: id, scope: SCOPE, device_id: crypto.randomUUID().replace(/-/g, ""), device_model: "ytlr::",
  });
  return json(d, 200, cors);
}

async function oauthToken(req, env, cors) {
  const { device_code } = await req.json();
  const { id, secret } = await getTvCreds(env);
  const t = await google("token", {
    client_id: id, client_secret: secret, code: device_code, grant_type: "http://oauth.net/grant_type/device/1.0",
  });
  return json(t, 200, cors);
}

async function oauthRefresh(req, env, cors) {
  const { refresh_token } = await req.json();
  const { id, secret } = await getTvCreds(env);
  const t = await google("token", {
    client_id: id, client_secret: secret, refresh_token, grant_type: "refresh_token",
  });
  return json(t, 200, cors);
}
