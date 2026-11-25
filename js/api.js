// Talks to your Worker. Keeps the sign-in token and a few settings in this browser.

const LS = {
  get(k, d) { try { const v = localStorage.getItem("nt." + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("nt." + k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem("nt." + k); } catch (_) {} },
};
export { LS };

export function workerUrl() {
  const u = LS.get("worker", "") || (window.NT_CONFIG && window.NT_CONFIG.workerUrl) || "";
  return u.replace(/\/+$/, "");
}

// Defaults: English, Cyprus. The phone's own language is ignored on purpose.
// YouTube only accepts ISO country codes, so "UK" must be sent as "GB";
// anything else it would reject ("Request contains an invalid argument") falls back to the default.
const GL_ALIASES = { UK: "GB", EL: "GR" };
export function locale() {
  const s = LS.get("settings", {});
  let hl = String(s.hl || "en").trim();
  if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(hl)) hl = "en";
  let gl = String(s.gl || "CY").trim().toUpperCase();
  gl = GL_ALIASES[gl] || gl;
  if (!/^[A-Z]{2}$/.test(gl)) gl = "CY";
  return { hl, gl };
}
// One-time move from the old auto-detected Russian/UK setting to English/Cyprus.
(() => {
  if (LS.get("localeFix1", false)) return;
  const s = LS.get("settings", {});
  delete s.hl; delete s.gl;
  LS.set("settings", s);
  LS.del("visitor");
  LS.set("localeFix1", true);
})();

export class ApiError extends Error {
  constructor(msg, status, detail) { super(msg); this.status = status; this.detail = detail; }
}

async function call(path, body, headers = {}) {
  const base = workerUrl();
  if (!base) throw new ApiError("No backend set. Open Settings and paste your Worker URL.", 0);
  let r;
  try {
    r = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body || {}),
    });
  } catch (e) {
    throw new ApiError("Can't reach your backend. Check the Worker URL in Settings.", 0, String(e));
  }
  const txt = await r.text();
  let data;
  try { data = JSON.parse(txt); } catch (_) { data = { raw: txt.slice(0, 400) }; }
  if (!r.ok) {
    const msg = (data.error && (data.error.message || data.error)) || data.message || "Request failed";
    throw new ApiError(typeof msg === "string" ? msg : JSON.stringify(msg), r.status, data);
  }
  return data;
}

// ---- Sign-in (Google TV code flow) ----
export const auth = {
  get token() { return LS.get("token", null); },
  get signedIn() { return !!(this.token && this.token.refresh_token); },
  save(t) {
    const prev = this.token || {};
    const tok = {
      access_token: t.access_token,
      refresh_token: t.refresh_token || prev.refresh_token,
      expires_at: Date.now() + ((t.expires_in || 3600) - 60) * 1000,
    };
    LS.set("token", tok);
    return tok;
  },
  signOut() { LS.del("token"); LS.del("account"); },
  async startDevice() { return call("/oauth/device", {}); },
  async poll(device_code) { return call("/oauth/token", { device_code }); },
  async bearer(force) {
    const t = this.token;
    if (!t || !t.refresh_token) return "";
    if (!force && t.access_token && t.expires_at > Date.now()) return t.access_token;
    const r = await call("/oauth/refresh", { refresh_token: t.refresh_token });
    if (!r.access_token) {
      if (r.error === "invalid_grant") this.signOut();
      throw new ApiError("Sign-in expired. Please sign in again.", 401, r);
    }
    return this.save(r).access_token;
  },
};

// ---- InnerTube ----
export async function yt(endpoint, body = {}, { client = "web", withAuth = false } = {}) {
  const { hl, gl } = locale();
  const visitorData = LS.get("visitor", "");
  const send = async (force) => {
    const headers = {};
    if (withAuth && auth.signedIn) headers.Authorization = "Bearer " + (await auth.bearer(force));
    return call(`/yt/${endpoint}?client=${client}`, { hl, gl, visitorData: visitorData || undefined, ...body }, headers);
  };
  let data;
  try {
    data = await send(false);
  } catch (e) {
    if (e.status === 401 && withAuth && auth.signedIn) data = await send(true);
    else throw e;
  }
  const vd = data && data.responseContext && data.responseContext.visitorData;
  if (vd && !visitorData) LS.set("visitor", vd);
  return data;
}

export async function ping() {
  const base = workerUrl();
  const r = await fetch(base + "/", { method: "GET" });
  return r.json();
}

export function proxied(url) {
  return workerUrl() + "/vp?u=" + encodeURIComponent(url);
}

// ---- Extras that allow direct browser calls ----
export async function sponsorSegments(id) {
  const cats = encodeURIComponent(JSON.stringify(["sponsor", "selfpromo", "interaction", "intro", "outro", "music_offtopic"]));
  try {
    const r = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(id)}&categories=${cats}`);
    if (!r.ok) return [];
    return (await r.json()).filter((s) => s.actionType === "skip" || !s.actionType);
  } catch (_) { return []; }
}

export async function dislikes(id) {
  try {
    const r = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(id)}`);
    return r.ok ? r.json() : null;
  } catch (_) { return null; }
}
