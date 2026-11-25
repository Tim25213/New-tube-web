import { yt, auth, LS, workerUrl, ping, dislikes, ApiError, locale } from "./api.js?v=3";
import { collectItems, parseNext, parseComments, parseChannel, text, findKey, bestThumb, agoSeconds, fmtDuration, parseDuration, ytThumb } from "./parse.js?v=3";
import { mountPlayer, getPlayerResponse } from "./player.js?v=3";
import { downloadOptions, downloadVideo } from "./download.js?v=3";

{
const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const I = {
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M7.5 10.5v9.5h-3v-9.5zM7.5 10.5l3.8-6.6a1.9 1.9 0 0 1 3.4 1.5l-.9 4.6h5.4a2 2 0 0 1 2 2.4l-1.3 6A2 2 0 0 1 18 20H7.5"/></svg>',
  down: '<svg viewBox="0 0 24 24" style="transform:rotate(180deg)"><path d="M7.5 10.5v9.5h-3v-9.5zM7.5 10.5l3.8-6.6a1.9 1.9 0 0 1 3.4 1.5l-.9 4.6h5.4a2 2 0 0 1 2 2.4l-1.3 6A2 2 0 0 1 18 20H7.5"/></svg>',
  later: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 3.5v12M7.5 8 12 3.5 16.5 8M5 13.5v5A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2v-5"/></svg>',
  comment: '<svg viewBox="0 0 24 24"><path d="M4.5 5.5h15v10.5H10l-5.5 4z"/></svg>',
  hd: '<svg viewBox="0 0 24 24"><path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9"/><circle cx="15" cy="7.5" r="2"/><circle cx="9" cy="16.5" r="2"/></svg>',
  speed: '<svg viewBox="0 0 24 24"><path d="M4.5 16a7.5 7.5 0 1 1 15 0"/><path d="m12 16 4-5"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/></svg>',
  hide: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M12 3.5v12M7.5 11 12 15.5 16.5 11M5 19.5h14"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  yt: '<svg viewBox="0 0 24 24"><path d="M14 4.5h5.5V10M19.5 4.5 11 13M9.5 5.5H6A1.5 1.5 0 0 0 4.5 7v11A1.5 1.5 0 0 0 6 19.5h11a1.5 1.5 0 0 0 1.5-1.5v-3.5"/></svg>',
};

// ---------- Local library ----------
const store = {
  list(k) { return LS.get(k, []); },
  has(k, id) { return this.list(k).some((x) => x.id === id); },
  add(k, item, max = 500) { const l = this.list(k).filter((x) => x.id !== item.id); l.unshift({ ...item, at: Date.now() }); LS.set(k, l.slice(0, max)); },
  remove(k, id) { LS.set(k, this.list(k).filter((x) => x.id !== id)); },
  toggle(k, item) { if (this.has(k, item.id)) { this.remove(k, item.id); return false; } this.add(k, item); return true; },
};
// "Not interested": hidden videos and channels never show up in lists again.
const hidden = {
  video(id) { return store.has("hiddenVideos", id); },
  channel(id) { return !!id && store.has("hiddenChannels", id); },
  item(v) { return v && v.type !== "channel" && (this.video(v.id) || this.channel(v.channelId)); },
};
const settings = () => ({ sponsorblock: true, autoplay: true, ...LS.get("settings", {}) });
const setSetting = (k, v) => LS.set("settings", { ...LS.get("settings", {}), [k]: v });

// ---------- UI bits ----------
let toastT;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2400);
}

const openSheets = new Set();
function sheet(html, onClose) {
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.innerHTML = `<div class="sheet glass" role="dialog" aria-modal="true"><div class="grab"></div><button class="close" aria-label="Close">${I.x}</button>${html}</div>`;
  document.body.appendChild(scrim);
  const el = $(".sheet", scrim);
  const close = () => { if (!scrim.isConnected) return; openSheets.delete(close); scrim.remove(); document.removeEventListener("keydown", onKey); onClose && onClose(); };
  openSheets.add(close);
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  $(".close", el).addEventListener("click", close);
  return { el, close };
}

async function copy(textValue, msg = "Copied") {
  try { await navigator.clipboard.writeText(textValue); toast(msg); }
  catch (_) { toast("Couldn't copy"); }
}

function errorBox(e, retry) {
  const isSetup = e instanceof ApiError && e.status === 0 && !workerUrl();
  const id = "r" + Math.random().toString(36).slice(2);
  setTimeout(() => { const b = document.getElementById(id); if (b && retry) b.onclick = retry; });
  return `<div class="empty"><h2>${isSetup ? "Connect your backend" : "Something went wrong"}</h2>
    <p>${esc(e.message || e)}</p>
    ${isSetup ? `<a class="btn" href="#/settings" style="display:inline-grid;place-items:center">Open Settings</a>` : retry ? `<button class="btn" id="${id}">Try again</button>` : ""}</div>`;
}

const skeleton = (n = 8) => `<div class="grid skeleton">${Array.from({ length: n }, () => `<div class="card"><div class="thumb"></div><div class="meta"><div style="flex:1"><h3></h3><p></p></div></div></div>`).join("")}</div>`;

function progressOf(id) {
  const p = LS.get("pos." + id, 0);
  const h = store.list("history").find((x) => x.id === id);
  const d = h && h.seconds;
  return p && d ? Math.min(100, (p / d) * 100) : 0;
}

function card(v) {
  if (v.type === "channel") {
    return `<a class="chan-card" href="#/channel/${esc(v.id)}"><img loading="lazy" src="${esc(v.thumb)}" alt="" referrerpolicy="no-referrer"><div><h3>${esc(v.title)}</h3><p>${esc(v.subs || "Channel")}</p></div></a>`;
  }
  if (hidden.item(v)) return "";
  const pct = progressOf(v.id);
  const sub = [v.channel && `<span data-ch="${esc(v.channelId)}">${esc(v.channel)}</span>`, esc(v.views), esc(v.published)].filter(Boolean).join(" · ");
  return `<a class="card" href="#/watch?v=${esc(v.id)}">
    <div class="thumb"><img loading="lazy" src="${esc(v.thumb || ytThumb(v.id))}" alt="" referrerpolicy="no-referrer">
      ${v.live ? '<span class="badge live">LIVE</span>' : v.duration ? `<span class="badge">${esc(v.duration)}</span>` : ""}
      ${pct ? `<span class="progress"><i style="width:${pct.toFixed(1)}%"></i></span>` : ""}
    </div>
    <div class="meta">${v.avatar ? `<img class="av" loading="lazy" src="${esc(v.avatar)}" alt="" referrerpolicy="no-referrer">` : ""}
      <div class="grow"><h3>${esc(v.title)}</h3><p>${sub}</p></div>
      <button class="more" type="button" aria-label="More options" data-more="${esc(v.id)}" data-title="${esc(v.title)}" data-chname="${esc(v.channel || "")}" data-chid="${esc(v.channelId || "")}" data-dur="${esc(v.duration || "")}">${I.more}</button></div></a>`;
}

// A grid that keeps loading as you scroll.
function feed(container, first, more, { empty, filter } = {}) {
  container.innerHTML = skeleton();
  let token = "", busy = false, seen = new Set(), obs;
  const grid = document.createElement("div");
  grid.className = "grid";
  const sentinel = document.createElement("div");
  sentinel.className = "sentinel";
  const add = (items) => {
    const fresh = items.filter((i) => !seen.has(i.type + i.id) && !hidden.item(i) && (!filter || filter(i)));
    fresh.forEach((i) => seen.add(i.type + i.id));
    grid.insertAdjacentHTML("beforeend", fresh.map(card).join(""));
    return fresh.length;
  };
  const load = async () => {
    if (busy || !token || !more) return;
    busy = true;
    try {
      const r = await more(token);
      token = r.continuation && r.continuation !== token ? r.continuation : "";
      add(r.items);
    } catch (e) { token = ""; console.warn(e); }
    busy = false;
  };
  (async () => {
    try {
      const r = await first();
      container.innerHTML = "";
      container.append(grid, sentinel);
      token = r.continuation || "";
      if (!add(r.items)) container.innerHTML = empty || `<div class="empty"><h2>Nothing here yet</h2></div>`;
      obs = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && load(), { rootMargin: "1200px" });
      obs.observe(sentinel);
    } catch (e) {
      container.innerHTML = errorBox(e, () => feed(container, first, more, { empty, filter }));
    }
  })();
  return () => obs && obs.disconnect();
}

// ---------- Views ----------
let cleanup = () => {};

// Shelves YouTube adds for everyone (trending, news, gaming…), not picked for you.
const GENERIC_SHELF = /trending|news|breaking|popular|gaming|sports|movies|explore|fashion|learning|podcasts|new to you|top (songs|videos|hits)|^music$|^live( now)?$|^shorts$/i;
function shelfTitle(r) {
  const sr = r.shelfRenderer || r.richShelfRenderer || (r.richSectionRenderer && r.richSectionRenderer.content && r.richSectionRenderer.content.richShelfRenderer);
  if (!sr) return "";
  const h = sr.headerRenderer && (sr.headerRenderer.shelfHeaderRenderer || sr.headerRenderer);
  return text(sr.title) || (h && text(h.title)) || "";
}
function pruneGeneric(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 40) return node;
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) {
      const el = node[i];
      if (el && typeof el === "object" && GENERIC_SHELF.test(shelfTitle(el))) node.splice(i, 1);
      else pruneGeneric(el, depth + 1);
    }
    return node;
  }
  for (const k in node) pruneGeneric(node[k], depth + 1);
  return node;
}

async function homeItems() {
  if (auth.signedIn) {
    for (const client of ["tv", "web"]) {
      try {
        const d = await yt("browse", { browseId: "FEwhat_to_watch" }, { client, withAuth: true });
        const r = collectItems(pruneGeneric(d));
        if (r.items.filter((i) => i.type === "video").length >= 4) return { ...r, client, withAuth: true };
      } catch (e) { if (e.status === 401) throw e; console.warn("home", client, e); }
    }
  }
  for (const client of ["tv", "web"]) {
    try {
      const d = await yt("browse", { browseId: "FEwhat_to_watch" }, { client });
      const r = collectItems(d);
      if (r.items.filter((i) => i.type === "video").length >= 4) return { ...r, client, withAuth: false };
    } catch (e) { console.warn("home anon", client, e); }
  }
  // Signed out with an empty home: build one from what you watched.
  const hist = store.list("history").slice(0, 4);
  if (hist.length) {
    const lists = await Promise.all(hist.map((h) => yt("next", { videoId: h.id }).then((d) => parseNext(d).related).catch(() => [])));
    const mixed = [];
    for (let i = 0; i < 20; i++) for (const l of lists) if (l[i]) mixed.push(l[i]);
    const watched = new Set(store.list("history").map((h) => h.id));
    if (mixed.length) return { items: mixed.filter((v) => !watched.has(v.id)), continuation: "" };
  }
  const d = await yt("search", { query: "trending" });
  return { ...collectItems(d), search: true };
}

function viewHome() {
  const signed = auth.signedIn;
  view.innerHTML = `<h1 class="large-title">${signed ? "For you" : "Home"}</h1>
    ${!signed ? `<div class="banner-cta glass"><p>Sign in with Google to see your own recommendations and subscriptions.</p><button class="btn" id="si">Sign in</button></div>` : ""}
    <div id="feed"></div>`;
  const b = $("#si"); if (b) b.onclick = signIn;
  let ctx = {};
  cleanup = feed($("#feed"), async () => { const r = await homeItems(); ctx = r; return r; },
    async (token) => {
      if (ctx.search) return collectItems(await yt("search", { continuation: token }));
      return collectItems(pruneGeneric(await yt("browse", { continuation: token }, { client: ctx.client || "web", withAuth: !!ctx.withAuth })));
    },
    { empty: `<div class="empty"><h2>No recommendations yet</h2><p>Search for something you like and Home fills up from what you watch.</p></div>` });
}

function viewSearch(q) {
  $("#q").value = q;
  view.innerHTML = `<h1 class="large-title">${esc(q)}</h1><div id="feed"></div>`;
  cleanup = feed($("#feed"), async () => collectItems(await yt("search", { query: q })),
    async (token) => collectItems(await yt("search", { continuation: token })),
    { empty: `<div class="empty"><h2>No results</h2><p>Try different words.</p></div>` });
}

function linkify(s) {
  return esc(s)
    .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`)
    .replace(/(^|[\s(])((?:\d{1,2}:)?\d{1,2}:\d{2})(?=$|[\s)])/gm, (m, pre, ts) => `${pre}<button class="ts" data-seek="${parseDuration(ts)}">${ts}</button>`);
}

const short = (n) => {
  n = Number(n);
  if (!isFinite(n)) return "";
  return n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B" : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(n);
};

function subscribeButton(ch) {
  const on = subCache.has(ch.id) ? subCache.get(ch.id) : store.has("subs", ch.id);
  return `<button class="btn ${on ? "sub-on" : ""}" data-sub="${esc(ch.id)}" data-on="${on ? "1" : ""}">${on ? "Subscribed" : "Subscribe"}</button>`;
}
// Asks your YouTube account whether you're subscribed (once per channel per visit).
const subCache = new Map();
function readSubscribed(d) {
  let found = null;
  JSON.stringify(d, (k, v) => {
    if (found === null && v && typeof v === "object" && typeof v.subscribed === "boolean" &&
        (k === "subscribeButtonRenderer" || k === "subscriptionStateEntity" || k === "subscribeButtonViewModel")) found = v.subscribed;
    return v;
  });
  return found;
}
async function checkSubscribed(id) {
  if (subCache.has(id)) return subCache.get(id);
  for (const client of ["tv", "web"]) {
    try {
      const on = readSubscribed(await yt("browse", { browseId: id }, { client, withAuth: true }));
      if (on !== null) { subCache.set(id, on); return on; }
    } catch (e) { console.warn("sub check", client, e); }
  }
  return null;
}
function bindSubscribe(root, ch) {
  const b = $(`[data-sub]`, root);
  if (!b) return;
  const show = (on) => { b.textContent = on ? "Subscribed" : "Subscribe"; b.classList.toggle("sub-on", on); b.dataset.on = on ? "1" : ""; };
  b.onclick = async () => {
    const on = b.dataset.on !== "1";
    if (on) store.add("subs", { id: ch.id, title: ch.title, thumb: ch.thumb }); else store.remove("subs", ch.id);
    subCache.set(ch.id, on);
    show(on);
    toast(on ? `Subscribed to ${ch.title || "channel"}` : "Unsubscribed");
    if (auth.signedIn) {
      yt(on ? "subscription/subscribe" : "subscription/unsubscribe", { channelIds: [ch.id] }, { client: "tv", withAuth: true })
        .catch(() => toast("Saved here, but your YouTube account didn't update"));
    }
  };
  if (auth.signedIn && ch.id) {
    checkSubscribed(ch.id).then((on) => {
      if (on === null || !b.isConnected) return;
      show(on);
      if (on && !store.has("subs", ch.id)) store.add("subs", { id: ch.id, title: ch.title, thumb: ch.thumb });
    });
  }
}

// Share sheet on phones, copy elsewhere.
async function shareLink(url, title) {
  if (navigator.share) {
    try { await navigator.share({ title: title || "", url }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  copy(url, "Link copied");
}

function viewWatch(id) {
  view.innerHTML = `<div class="watch"><div class="watch-main">
      <div class="player" id="player"><div class="spin"><div class="spinner"></div></div></div>
      <div id="info"><h1 class="v-title">&nbsp;</h1></div>
    </div><aside><div class="related skeleton" id="related">${Array.from({ length: 6 }, () => `<div class="card"><div class="thumb"></div><div class="meta"><div style="flex:1"><h3></h3><p></p></div></div></div>`).join("")}</div></aside></div>`;
  let ctl = null, alive = true, meta = { id }, nextData = null;

  const playerReady = mountPlayer($("#player"), id, null, {
    onSkip: (cat) => toast(`Skipped ${String(cat).replace("_", " ")}`),
    onMode: (mode, why) => {
      if (mode === "recovering") toast("Reconnecting…");
      if (mode === "embed") {
        const n = document.createElement("div");
        n.className = "note";
        n.textContent = why === "live"
          ? "Live streams use YouTube's own player, which may show ads."
          : "Couldn't load the ad-free stream for this video, so YouTube's own player is used (it may show ads).";
        $("#player").after(n);
      }
    },
  }).then((c) => {
    if (!alive) { c.destroy(); return; }
    ctl = c;
    const vd = c.pr && c.pr.videoDetails;
    if (vd) {
      meta = { ...meta, title: meta.title || vd.title, channel: meta.channel || vd.author, channelId: meta.channelId || vd.channelId, seconds: Number(vd.lengthSeconds) || 0 };
      if (!nextData) renderInfo();
      remember();
      if ("mediaSession" in navigator) {
        try { navigator.mediaSession.metadata = new MediaMetadata({ title: meta.title, artist: meta.channel, artwork: [{ src: ytThumb(id), sizes: "480x360", type: "image/jpeg" }] }); } catch (_) {}
      }
    }
    c.video.addEventListener("ended", () => {
      const nxt = nextData && nextData.related[0];
      if (settings().autoplay && nxt && alive) location.hash = "#/watch?v=" + nxt.id;
    });
    return c;
  }).catch((e) => { $("#player").innerHTML = `<div class="empty" style="color:#fff">${esc(e.message)}</div>`; });

  const remember = () => {
    if (!meta.title) return;
    store.add("history", { id, title: meta.title, channel: meta.channel, channelId: meta.channelId, seconds: meta.seconds, duration: meta.seconds ? fmtDuration(meta.seconds) : "" }, 300);
  };

  const renderInfo = () => {
    const d = nextData || {};
    const vd = (ctl && ctl.pr && ctl.pr.videoDetails) || {};
    const title = d.title || vd.title || "";
    document.title = title ? title + " · NewTube" : "NewTube Web";
    const ch = { id: d.channelId || vd.channelId || "", title: d.channel || vd.author || "", thumb: d.avatar || "" };
    const views = d.views || (vd.viewCount ? Number(vd.viewCount).toLocaleString() + " views" : "");
    const desc = d.description || vd.shortDescription || "";
    const later = store.has("later", id);
    $("#info").innerHTML = `
      <h1 class="v-title">${esc(title)}</h1>
      <p class="v-stats">${[esc(views), esc(d.date)].filter(Boolean).join(" · ")}</p>
      <div class="owner">
        <a href="#/channel/${esc(ch.id)}">${ch.thumb ? `<img src="${esc(ch.thumb)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar-btn glass">${I.user}</span>`}</a>
        <a class="who" href="#/channel/${esc(ch.id)}"><b>${esc(ch.title)}</b><span>${esc(d.subs || "")}</span></a>
        ${ch.id ? subscribeButton(ch) : ""}
      </div>
      <div class="actions">
        <button class="pill" id="like">${I.up}<span id="likes">Like</span></button>
        <button class="pill" id="dislike">${I.down}<span id="dislikes"></span></button>
        <button class="pill ${later ? "on" : ""}" id="later">${later ? I.check : I.later}<span>Watch later</span></button>
        <button class="pill" id="copylink">${I.link}<span>Copy link</span></button>
        <button class="pill" id="share">${I.share}<span>Share</span></button>
        <button class="pill" id="download">${I.dl}<span>Download</span></button>
        <button class="pill" id="quality">${I.hd}<span>Quality</span></button>
        <button class="pill" id="speed">${I.speed}<span>Speed</span></button>
        ${d.commentsToken ? `<button class="pill" id="comments">${I.comment}<span>Comments</span></button>` : ""}
        <a class="pill" href="https://www.youtube.com/watch?v=${esc(id)}" target="_blank" rel="noopener noreferrer">${I.yt}<span>YouTube</span></a>
      </div>
      ${desc ? `<div class="desc clamp" id="desc">${linkify(desc)}</div>` : ""}`;
    bindSubscribe($("#info"), ch);
    const dEl = $("#desc");
    if (dEl) dEl.addEventListener("click", (e) => {
      const ts = e.target.closest("[data-seek]");
      if (ts) { e.stopPropagation(); if (ctl && ctl.video) { ctl.video.currentTime = Number(ts.dataset.seek); ctl.video.play().catch(() => {}); } return; }
      if (e.target.closest("a")) return;
      dEl.classList.toggle("clamp");
    });
    $("#later").onclick = (e) => {
      const on = store.toggle("later", { id, title, channel: ch.title, channelId: ch.id, duration: meta.seconds ? fmtDuration(meta.seconds) : "" });
      e.currentTarget.classList.toggle("on", on);
      e.currentTarget.innerHTML = `${on ? I.check : I.later}<span>Watch later</span>`;
      toast(on ? "Saved to Watch later" : "Removed from Watch later");
    };
    $("#copylink").onclick = () => copy(`https://youtu.be/${id}`, "Link copied");
    $("#share").onclick = () => shareLink(`https://youtu.be/${id}`, title);
    $("#like").onclick = () => rate("like/like", "Liked");
    $("#dislike").onclick = () => rate("like/dislike", "Disliked");
    $("#quality").onclick = qualitySheet;
    $("#download").onclick = downloadSheet;
    $("#speed").onclick = speedSheet;
    const cb = $("#comments"); if (cb) cb.onclick = () => commentsSheet(d.commentsToken);
    dislikes(id).then((r) => {
      if (!r || !alive) return;
      const l = $("#likes"), dl = $("#dislikes");
      if (l && r.likes != null) l.textContent = short(r.likes);
      if (dl && r.dislikes != null) dl.textContent = short(r.dislikes);
    });
  };

  const rate = async (ep, msg) => {
    if (!auth.signedIn) { toast("Sign in to rate videos"); return; }
    try { await yt(ep, { target: { videoId: id } }, { client: "tv", withAuth: true }); toast(msg); }
    catch (e) { toast("Couldn't rate: " + e.message); }
  };

  const qualitySheet = () => {
    if (!ctl || ctl.mode !== "dash") { toast(ctl && ctl.mode === "embed" ? "Use the player's own settings" : "Only one quality available"); return; }
    const hs = ctl.qualities(), cur = LS.get("quality", "auto");
    const s = sheet(`<h2>Quality</h2>${["auto", ...hs].map((h) => `<button class="opt ${String(cur) === String(h) ? "on" : ""}" data-h="${h}">${h === "auto" ? `Auto${ctl.currentHeight() ? ` (${ctl.currentHeight()}p)` : ""}` : h + "p"}${String(cur) === String(h) ? I.check : ""}</button>`).join("")}`);
    s.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-h]"); if (!b) return;
      ctl.setQuality(b.dataset.h === "auto" ? "auto" : Number(b.dataset.h));
      s.close();
    });
  };
  const downloadSheet = () => {
    const sd = ctl && ctl.pr && ctl.pr.streamingData;
    const opts = sd ? downloadOptions(sd) : [];
    if (!opts.length) { toast(ctl ? "Download isn't available for this video" : "Still loading, try again in a moment"); return; }
    const mb = (n) => n ? ` · ${Math.max(1, Math.round(n / 1048576))} MB` : "";
    const s = sheet(`<h2>Download</h2><div id="dlbody">${opts.map((o, i) => `<button class="opt" data-i="${i}">${esc(o.label)}<span class="muted">${mb(o.size)}</span></button>`).join("")}
      <p class="muted" style="font-size:13px;margin:10px 4px 0">Keep this open until it finishes. Long videos in 1080p take a while and use a lot of memory.</p></div>`, () => ac.abort());
    const ac = new AbortController();
    s.el.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-i]"); if (!b) return;
      const opt = opts[Number(b.dataset.i)];
      const body = $("#dlbody", s.el);
      body.innerHTML = `<p style="margin:6px 4px">Downloading ${esc(opt.label)}…</p><div class="dlbar"><i id="dlfill"></i></div><p class="muted" id="dlpct" style="margin:8px 4px">0%</p>`;
      const title = (nextData && nextData.title) || meta.title || id;
      const name = title.replace(/[\\/:*?"<>|]+/g, "").slice(0, 80).trim() + ` (${opt.label.split(" ")[0]}).mp4`;
      try {
        const blob = await downloadVideo(opt, {
          durationSec: meta.seconds || Number((ctl.pr.videoDetails || {}).lengthSeconds) || 0,
          refresh: async () => (await getPlayerResponse(id)).pr.streamingData,
          signal: ac.signal,
          onProgress: (f, bytes) => {
            const fill = $("#dlfill", s.el), pct = $("#dlpct", s.el);
            if (fill) fill.style.width = (f * 100).toFixed(1) + "%";
            if (pct) pct.textContent = f ? Math.floor(f * 100) + "%" : Math.round(bytes / 1048576) + " MB";
          },
        });
        const file = new File([blob], name, { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        body.innerHTML = `<p style="margin:6px 4px">Ready: ${esc(name)} (${Math.round(blob.size / 1048576)} MB)</p>
          <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap">
            ${navigator.canShare && navigator.canShare({ files: [file] }) ? `<button class="btn" id="dlsave">Save video</button>` : ""}
            <a class="btn ${navigator.canShare ? "ghost" : ""}" href="${url}" download="${esc(name)}" style="display:inline-grid;place-items:center">Save to Files</a>
          </div><p class="muted" style="font-size:13px;margin:10px 4px 0">"Save video" lets you put it in Photos.</p>`;
        const sv = $("#dlsave", s.el);
        if (sv) sv.onclick = async () => { try { await navigator.share({ files: [file], title }); } catch (_) {} };
      } catch (err) {
        if (ac.signal.aborted) return;
        body.innerHTML = `<p style="margin:6px 4px">Couldn't download: ${esc(err.message)}</p>`;
      }
    });
  };
  const speedSheet = () => {
    if (!ctl || ctl.mode === "embed") { toast("Use the player's own settings"); return; }
    const cur = ctl.video.playbackRate;
    const s = sheet(`<h2>Playback speed</h2>${[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => `<button class="opt ${cur === r ? "on" : ""}" data-r="${r}">${r === 1 ? "Normal" : r + "×"}${cur === r ? I.check : ""}</button>`).join("")}`);
    s.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-r]"); if (!b) return;
      ctl.video.playbackRate = Number(b.dataset.r); s.close();
    });
  };

  const commentsSheet = (token) => {
    const s = sheet(`<h2>Comments</h2><div id="clist"><div class="spinner dark"></div></div>`);
    let next = token, busy = false;
    const list = $("#clist", s.el);
    const load = async (first) => {
      if (!next || busy) return;
      busy = true;
      try {
        const r = parseComments(await yt("next", { continuation: next }));
        next = r.continuation && r.continuation !== next ? r.continuation : "";
        if (first) list.innerHTML = r.comments.length ? "" : `<p class="muted">No comments.</p>`;
        list.insertAdjacentHTML("beforeend", r.comments.map((c) => `<div class="comment">${c.avatar ? `<img src="${esc(c.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "<span></span>"}<div><b>${esc(c.author)}</b><time>${esc(c.time)}</time><p>${linkify(c.text)}</p><small>${c.likes ? esc(c.likes) + " likes" : ""}${c.replies ? ` · ${esc(c.replies)} replies` : ""}</small></div></div>`).join(""));
      } catch (e) { if (first) list.innerHTML = `<p class="muted">${esc(e.message)}</p>`; next = ""; }
      busy = false;
    };
    list.addEventListener("click", (e) => {
      const ts = e.target.closest("[data-seek]");
      if (ts && ctl && ctl.video && ctl.mode !== "embed") { ctl.video.currentTime = Number(ts.dataset.seek); ctl.video.play().catch(() => {}); s.close(); }
    });
    s.el.addEventListener("scroll", () => { if (s.el.scrollTop + s.el.clientHeight > s.el.scrollHeight - 400) load(false); });
    load(true);
  };

  // Related
  let relToken = "";
  const relEl = $("#related");
  yt("next", { videoId: id }).then((d) => {
    if (!alive) return;
    nextData = parseNext(d);
    meta = { ...meta, title: nextData.title || meta.title, channel: nextData.channel || meta.channel, channelId: nextData.channelId || meta.channelId };
    renderInfo();
    remember();
    relEl.classList.remove("skeleton");
    relEl.innerHTML = nextData.related.map(card).join("") || `<p class="muted">No related videos.</p>`;
    relToken = nextData.relatedContinuation;
    const sen = document.createElement("div"); sen.className = "sentinel"; relEl.after(sen);
    let busy = false;
    const obs = new IntersectionObserver(async (es) => {
      if (!es.some((e) => e.isIntersecting) || busy || !relToken) return;
      busy = true;
      try {
        const r = collectItems(await yt("next", { continuation: relToken }));
        relToken = r.continuation !== relToken ? r.continuation : "";
        relEl.insertAdjacentHTML("beforeend", r.items.filter((i) => i.type === "video").map(card).join(""));
      } catch (_) { relToken = ""; }
      busy = false;
    }, { rootMargin: "800px" });
    obs.observe(sen);
    const prev = cleanup; cleanup = () => { obs.disconnect(); prev(); };
  }).catch((e) => {
    relEl.classList.remove("skeleton");
    relEl.innerHTML = `<p class="muted">Couldn't load related videos: ${esc(e.message)}</p>`;
    if (ctl && !nextData) renderInfo();
  });

  cleanup = () => { alive = false; if (ctl) ctl.destroy(); else playerReady.then((c) => c && c.destroy()); };
}

function viewChannel(id) {
  view.innerHTML = `<div id="chead"><div class="spinner dark"></div></div><div id="feed"></div>`;
  let ch = null;
  cleanup = feed($("#feed"), async () => {
    let browseId = id;
    if (id.startsWith("@")) {
      const r = await yt("navigation/resolve_url", { url: "https://www.youtube.com/" + id });
      browseId = findKey(r, "browseId") || id;
    }
    const d = await yt("browse", { browseId, params: "EgZ2aWRlb3PyBgQKAjoA" });
    ch = parseChannel(d);
    ch.id = ch.id || browseId;
    document.title = ch.title + " · NewTube";
    $("#chead").innerHTML = `${ch.banner ? `<div class="banner"><img src="${esc(ch.banner)}" alt="" referrerpolicy="no-referrer"></div>` : ""}
      <div class="chead"><img src="${esc(ch.avatar)}" alt="" referrerpolicy="no-referrer"><div style="flex:1"><h1>${esc(ch.title)}</h1><p>${esc(ch.subs)}</p></div>${subscribeButton({ id: ch.id })}</div>`;
    bindSubscribe($("#chead"), { id: ch.id, title: ch.title, thumb: ch.avatar });
    return { items: ch.items.map((v) => ({ ...v, channel: v.channel || ch.title, channelId: ch.id, avatar: "" })), continuation: ch.continuation };
  }, async (token) => {
    const r = collectItems(await yt("browse", { continuation: token }));
    return { items: r.items.map((v) => ({ ...v, channel: v.channel || (ch && ch.title), avatar: "" })), continuation: r.continuation };
  });
}

// ---------- Shorts (from your own recommendations) ----------
function collectShorts(data) {
  const out = [], seen = new Set();
  const push = (v) => { if (v.id && !seen.has(v.id) && !hidden.video(v.id)) { seen.add(v.id); out.push(v); } };
  const thumbOf = (t) => bestThumb((t && (t.thumbnails || t.sources)) || []);
  (function walk(n, d) {
    if (!n || typeof n !== "object" || d > 90) return;
    if (Array.isArray(n)) { for (const x of n) walk(x, d + 1); return; }
    for (const k in n) {
      const v = n[k];
      if (k === "reelItemRenderer" && v && v.videoId) {
        push({ id: v.videoId, title: text(v.headline), views: text(v.viewCountText), thumb: thumbOf(v.thumbnail) });
        continue;
      }
      if (k === "shortsLockupViewModel" && v) {
        const ep = findKey(v, "reelWatchEndpoint");
        const om = v.overlayMetadata || {};
        if (ep && ep.videoId) push({ id: ep.videoId, title: (om.primaryText && om.primaryText.content) || text(v.accessibilityText) || "", views: (om.secondaryText && om.secondaryText.content) || "", thumb: thumbOf(v.thumbnail) });
        continue;
      }
      if ((k === "tileRenderer" || k === "videoRenderer" || k === "gridVideoRenderer" || k === "compactVideoRenderer") && v && JSON.stringify(v).includes("reelWatchEndpoint")) {
        const ep = findKey(v, "reelWatchEndpoint");
        const id = (ep && ep.videoId) || v.videoId || v.contentId;
        const title = text(v.title) || text(v.headline) || text(findKey(v, "title"));
        if (id) push({ id, title, views: text(v.viewCountText) || "", thumb: thumbOf(v.thumbnail || findKey(v, "thumbnail")) });
        continue;
      }
      walk(v, d + 1);
    }
  })(data, 0);
  return out;
}

async function shortsBatch(state) {
  // Pull pages of your signed-in home feed and keep only the Shorts.
  const found = [];
  if (!state.sources) {
    state.sources = auth.signedIn
      ? [{ client: "web", withAuth: true }, { client: "tv", withAuth: true }]
      : [{ client: "web", withAuth: false }, { client: "tv", withAuth: false }];
    state.tokens = {};
  }
  for (let round = 0; round < 4 && found.length < 6; round++) {
    let progressed = false;
    for (const src of state.sources) {
      const key = src.client;
      if (state.tokens[key] === "") continue;
      try {
        const d = state.tokens[key]
          ? await yt("browse", { continuation: state.tokens[key] }, src)
          : await yt("browse", { browseId: "FEwhat_to_watch" }, src);
        found.push(...collectShorts(d));
        const c = collectItems(d).continuation;
        state.tokens[key] = c && c !== state.tokens[key] ? c : "";
        progressed = true;
      } catch (e) { state.tokens[key] = ""; console.warn("shorts", key, e); }
    }
    if (!progressed) break;
  }
  if (found.length < 3 && !state.searched) {
    // Not enough Shorts in your feed yet: fill up from Shorts on topics you watch.
    state.searched = true;
    const topics = store.list("history").slice(0, 3).map((h) => h.channel).filter(Boolean);
    for (const q of topics.length ? topics : ["shorts"]) {
      try { found.push(...collectShorts(await yt("search", { query: q + " #shorts" }))); } catch (_) {}
    }
  }
  return found;
}

function viewShorts() {
  view.innerHTML = `<div class="shorts" id="shorts"><div class="short"><div class="spinner"></div></div></div>`;
  const wrap = $("#shorts");
  const state = {}, have = new Set();
  let current = null, currentId = "", loading = false, alive = true, done = false;

  const slide = (v) => `<section class="short" data-id="${esc(v.id)}">
      <div class="splayer" style="background-image:url('${esc(v.thumb || ytThumb(v.id))}')"></div>
      <div class="sinfo"><h3>${esc(v.title)}</h3><p>${esc(v.views || "")}</p></div>
      <div class="sbtns">
        <button class="sbtn" data-act="copy" aria-label="Copy link">${I.link}</button>
        <button class="sbtn" data-act="share" aria-label="Share">${I.share}</button>
        <a class="sbtn" href="#/watch?v=${esc(v.id)}" aria-label="Open as video">${I.yt}</a>
        <button class="sbtn" data-act="hide" aria-label="Not interested">${I.hide}</button>
      </div></section>`;

  const more = async () => {
    if (loading || done) return;
    loading = true;
    try {
      const items = (await shortsBatch(state)).filter((v) => !have.has(v.id));
      if (!alive) return;
      if (!items.length && !have.size) {
        wrap.innerHTML = `<div class="short"><div class="empty" style="color:#fff"><h2>No Shorts yet</h2><p>Your recommendations didn't include any Shorts. Watch a few and check back.</p></div></div>`;
        done = true;
      } else if (!items.length) done = true;
      if (!have.size) wrap.innerHTML = "";
      items.forEach((v) => have.add(v.id));
      wrap.insertAdjacentHTML("beforeend", items.map(slide).join(""));
      wrap.querySelectorAll(".short:not([data-seen])").forEach((el) => { el.dataset.seen = "1"; io.observe(el); });
    } catch (e) {
      if (!have.size) wrap.innerHTML = `<div class="short">${errorBox(e, () => { done = false; more(); })}</div>`;
    }
    loading = false;
  };

  const play = async (el) => {
    const id = el.dataset.id;
    if (id === currentId) return;
    if (current) { try { current.destroy(); } catch (_) {} current = null; }
    wrap.querySelectorAll(".splayer").forEach((p) => { if (p.closest(".short") !== el) p.innerHTML = ""; });
    currentId = id;
    const box = $(".splayer", el);
    box.innerHTML = `<div class="spin"><div class="spinner"></div></div>`;
    const c = await mountPlayer(box, id, { title: $("h3", el).textContent });
    if (!alive || currentId !== id) { c.destroy(); return; }
    current = c;
    c.video.controls = false;
    c.video.loop = true;
    c.video.addEventListener("click", () => { if (c.video.paused) c.video.play().catch(() => {}); else c.video.pause(); });
    store.add("history", { id, title: $("h3", el).textContent, seconds: Number((c.pr && c.pr.videoDetails || {}).lengthSeconds) || 0 }, 300);
    // Keep a few ahead loaded
    const left = [...wrap.children].length - [...wrap.children].indexOf(el);
    if (left < 4) more();
  };

  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting && e.intersectionRatio > 0.6) play(e.target);
  }, { root: wrap, threshold: [0.6] });

  wrap.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const el = b.closest(".short"), id = el.dataset.id, url = `https://youtube.com/shorts/${id}`;
    if (b.dataset.act === "copy") copy(url, "Link copied");
    if (b.dataset.act === "share") shareLink(url, $("h3", el).textContent);
    if (b.dataset.act === "hide") {
      store.add("hiddenVideos", { id }, 2000);
      const nx = el.nextElementSibling;
      if (nx) nx.scrollIntoView({ behavior: "smooth" });
      toast("Got it, you won't see this one again");
    }
  });

  more();
  cleanup = () => { alive = false; io.disconnect(); if (current) current.destroy(); };
}

function viewSubs() {
  const subs = store.list("subs");
  view.innerHTML = `<h1 class="large-title">Subscriptions</h1>
    ${subs.length ? `<div class="strip">${subs.map((c) => `<a href="#/channel/${esc(c.id)}"><img src="${esc(c.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${esc(c.title)}</span></a>`).join("")}</div>` : ""}
    <div id="feed"></div>`;
  if (auth.signedIn) {
    cleanup = feed($("#feed"), async () => collectItems(await yt("browse", { browseId: "FEsubscriptions" }, { client: "tv", withAuth: true })),
      async (token) => collectItems(await yt("browse", { continuation: token }, { client: "tv", withAuth: true })));
    return;
  }
  if (!subs.length) {
    view.insertAdjacentHTML("beforeend", `<div class="empty"><h2>No subscriptions yet</h2><p>Tap Subscribe on any channel and its new videos show up here. Or sign in to use your YouTube subscriptions.</p><button class="btn" id="si">Sign in</button></div>`);
    $("#si").onclick = signIn;
    cleanup = () => {};
    return;
  }
  cleanup = feed($("#feed"), async () => {
    const pick = subs.slice(0, 30);
    const out = [];
    for (let i = 0; i < pick.length; i += 6) {
      const batch = await Promise.all(pick.slice(i, i + 6).map((c) =>
        yt("browse", { browseId: c.id, params: "EgZ2aWRlb3PyBgQKAjoA" }).then((d) => parseChannel(d).items.slice(0, 8).map((v) => ({ ...v, channel: c.title, channelId: c.id, avatar: c.thumb }))).catch(() => [])));
      out.push(...batch.flat());
    }
    out.sort((a, b) => agoSeconds(a.published) - agoSeconds(b.published));
    return { items: out, continuation: "" };
  }, null);
}

function viewLibrary(tab) {
  tab = tab || "history";
  const tabs = [["history", "History"], ["later", "Watch later"], ["channels", "Channels"]];
  if (auth.signedIn) tabs.push(["account", "YouTube history"]);
  view.innerHTML = `<h1 class="large-title">Library</h1>
    <div class="seg glass" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" class="${k === tab ? "on" : ""}" data-t="${k}">${l}</button>`).join("")}</div>
    <div id="lib"></div>`;
  $(".seg").onclick = (e) => { const b = e.target.closest("[data-t]"); if (b) location.hash = "#/library?tab=" + b.dataset.t; };
  const lib = $("#lib");
  if (tab === "account") { cleanup = feed(lib, async () => collectItems(await yt("browse", { browseId: "FEhistory" }, { client: "tv", withAuth: true })), async (t) => collectItems(await yt("browse", { continuation: t }, { client: "tv", withAuth: true }))); return; }
  cleanup = () => {};
  if (tab === "channels") {
    const subs = store.list("subs");
    lib.innerHTML = subs.length ? `<div class="grid">${subs.map((c) => card({ type: "channel", id: c.id, title: c.title, thumb: c.thumb, subs: "" })).join("")}</div>`
      : `<div class="empty"><h2>No channels</h2><p>Channels you subscribe to here appear in this list.</p></div>`;
    return;
  }
  const list = store.list(tab);
  if (!list.length) {
    lib.innerHTML = `<div class="empty"><h2>${tab === "later" ? "Nothing saved" : "No history"}</h2><p>${tab === "later" ? "Tap Watch later under any video to save it here." : "Videos you watch appear here. History stays in this browser."}</p></div>`;
    return;
  }
  lib.innerHTML = `<div class="row" style="margin:0 2px 16px"><span class="muted">${list.length} videos</span><span style="flex:1"></span><button class="pill" id="clear">Clear</button></div>
    <div class="grid">${list.map((v) => card({ type: "video", ...v, thumb: ytThumb(v.id), views: "", published: "" })).join("")}</div>`;
  $("#clear").onclick = () => { LS.set(tab, []); viewLibrary(tab); toast("Cleared"); };
}

function viewSettings() {
  const s = settings();
  const acct = LS.get("account", null);
  const { hl, gl } = locale();
  view.innerHTML = `<h1 class="large-title">Settings</h1>
    <p class="group-label">Google account</p>
    <div class="group">
      ${auth.signedIn
        ? `<div class="item">${acct && acct.photo ? `<img src="${esc(acct.photo)}" alt="" style="width:40px;height:40px;border-radius:50%" referrerpolicy="no-referrer">` : ""}<div class="grow">${esc((acct && acct.name) || "Signed in")}<small>Recommendations, subscriptions and history come from your account.</small></div></div>
           <div class="item"><button class="link danger" id="so">Sign out</button></div>`
        : `<div class="item"><div class="grow">Not signed in<small>Sign in with a code at google.com/device, like on a TV.</small></div><button class="btn" id="si">Sign in</button></div>`}
    </div>
    <p class="group-label">Backend (your Cloudflare Worker)</p>
    <div class="group">
      <div class="item"><div class="grow"><input type="url" id="wurl" placeholder="https://newtube-web.yourname.workers.dev" value="${esc(workerUrl())}" inputmode="url" autocapitalize="off" spellcheck="false" aria-label="Worker URL"></div></div>
      <div class="item"><button class="link" id="wsave">Save and test</button><span class="muted" id="wstat"></span></div>
    </div>
    <p class="group-label">Playback</p>
    <div class="group">
      <label class="item"><div class="grow">SponsorBlock<small>Skip sponsors, self-promotion, intros and outros.</small></div><span class="switch"><input type="checkbox" id="sb" ${s.sponsorblock ? "checked" : ""}><i></i></span></label>
      <label class="item"><div class="grow">Autoplay next video</div><span class="switch"><input type="checkbox" id="ap" ${s.autoplay ? "checked" : ""}><i></i></span></label>
      <div class="item"><div class="grow">Preferred quality</div><select id="dq" style="width:auto">${["auto", 1080, 720, 480, 360].map((q) => `<option value="${q}" ${String(LS.get("quality", "auto")) === String(q) ? "selected" : ""}>${q === "auto" ? "Auto" : q + "p"}</option>`).join("")}</select></div>
    </div>
    <p class="group-label">Region</p>
    <div class="group">
      <div class="item"><div class="grow">Language</div><input type="text" id="hl" value="${esc(hl)}" style="width:90px" maxlength="8" aria-label="Language code"></div>
      <div class="item"><div class="grow">Country</div><input type="text" id="gl" value="${esc(gl)}" style="width:90px" maxlength="2" aria-label="Country code"></div>
    </div>
    <p class="group-label">Your data (stays in this browser)</p>
    <div class="group">
      <div class="item"><button class="link" id="exp">Copy backup</button></div>
      <div class="item"><button class="link" id="imp">Restore from backup</button></div>
      <div class="item"><button class="link danger" id="wipe">Clear history and saved videos</button></div>
    </div>
    <p class="group-label">Troubleshooting</p>
    <div class="group"><div class="item"><button class="link" id="diag">Run diagnostics</button></div></div>
    <pre class="diag" id="diagout" hidden></pre>
    <p class="muted" style="max-width:720px;font-size:13px;margin:22px 4px">Unofficial web version inspired by NewTube and SmartTube. Not affiliated with YouTube or Google. Uses SponsorBlock and Return YouTube Dislike.</p>`;

  const si = $("#si"); if (si) si.onclick = signIn;
  const so = $("#so"); if (so) so.onclick = () => { auth.signOut(); renderAccount(); viewSettings(); toast("Signed out"); };
  $("#wsave").onclick = async () => {
    const u = $("#wurl").value.trim().replace(/\/+$/, "");
    LS.set("worker", u);
    const st = $("#wstat");
    st.textContent = "Testing…";
    try { const r = await ping(); st.textContent = r.ok ? `Connected (v${r.version})` : "Unexpected reply"; }
    catch (e) { st.textContent = "Can't reach it. Check the address."; }
  };
  $("#sb").onchange = (e) => setSetting("sponsorblock", e.target.checked);
  $("#ap").onchange = (e) => setSetting("autoplay", e.target.checked);
  $("#dq").onchange = (e) => LS.set("quality", e.target.value === "auto" ? "auto" : Number(e.target.value));
  $("#hl").onchange = (e) => setSetting("hl", e.target.value.trim());
  $("#gl").onchange = (e) => setSetting("gl", e.target.value.trim().toUpperCase());
  $("#exp").onclick = () => copy(JSON.stringify({ subs: store.list("subs"), history: store.list("history"), later: store.list("later") }), "Backup copied");
  $("#imp").onclick = () => {
    const s2 = sheet(`<h2>Restore</h2><p class="muted">Paste a backup you copied earlier.</p><textarea id="impt" aria-label="Backup"></textarea><div class="row" style="margin-top:12px"><button class="btn" id="impgo">Restore</button></div>`);
    $("#impgo", s2.el).onclick = () => {
      try {
        const d = JSON.parse($("#impt", s2.el).value);
        for (const k of ["subs", "history", "later"]) if (Array.isArray(d[k])) LS.set(k, d[k].filter((x) => x && typeof x.id === "string"));
        s2.close(); toast("Restored");
      } catch (_) { toast("That isn't a valid backup"); }
    };
  };
  $("#wipe").onclick = () => {
    const s2 = sheet(`<h2>Clear history and saved videos?</h2><p class="muted">Subscriptions are kept.</p><div class="row" style="margin-top:14px"><button class="btn" id="wipego" style="background:var(--danger)">Clear</button></div>`);
    $("#wipego", s2.el).onclick = () => {
      LS.set("history", []); LS.set("later", []);
      Object.keys(localStorage).filter((k) => k.startsWith("nt.pos.")).forEach((k) => localStorage.removeItem(k));
      s2.close(); toast("Cleared");
    };
  };
  $("#diag").onclick = runDiagnostics;
  cleanup = () => {};
}

async function runDiagnostics() {
  const out = $("#diagout");
  out.hidden = false;
  const lines = [];
  const log = (l) => { lines.push(l); out.textContent = lines.join("\n"); };
  log(`Worker: ${workerUrl() || "(not set)"}`);
  log(`Signed in: ${auth.signedIn}  ·  ${navigator.userAgent}`);
  const step = async (name, fn) => {
    const t = performance.now();
    try { log(`✓ ${name}: ${await fn()} (${Math.round(performance.now() - t)} ms)`); }
    catch (e) { log(`✗ ${name}: ${e.message}${e.detail ? " " + JSON.stringify(e.detail).slice(0, 300) : ""}`); }
  };
  await step("backend", async () => JSON.stringify(await ping()));
  await step("search", async () => collectItems(await yt("search", { query: "sintel" })).items.length + " items");
  await step("home (signed out, tv)", async () => collectItems(await yt("browse", { browseId: "FEwhat_to_watch" }, { client: "tv" })).items.length + " items");
  if (auth.signedIn) await step("home (account, tv)", async () => collectItems(await yt("browse", { browseId: "FEwhat_to_watch" }, { client: "tv", withAuth: true })).items.length + " items");
  await step("player", async () => {
    const r = await getPlayerResponse("eRsGyueVLvQ");
    if (!r.client) throw new Error(r.errors.join(" | "));
    const sd = r.pr.streamingData;
    return `${r.client}: ${(sd.adaptiveFormats || []).filter((f) => f.url).length} adaptive, ${(sd.formats || []).filter((f) => f.url).length} progressive`;
  });
  await step("shaka", async () => (window.shaka && shaka.Player.isBrowserSupported() ? "supported" : "not supported (360p fallback)"));
  out.insertAdjacentHTML("afterend", "");
  const b = document.createElement("button");
  b.className = "pill"; b.textContent = "Copy report"; b.style.margin = "0 0 20px";
  b.onclick = () => copy(lines.join("\n"), "Report copied");
  out.after(b);
}

// ---------- Sign-in ----------
async function signIn() {
  if (!workerUrl()) { location.hash = "#/settings"; toast("Add your backend first"); return; }
  let stop = false, timer;
  const s = sheet(`<h2>Sign in with Google</h2><div id="sbody"><div class="spinner dark"></div></div>`, () => { stop = true; clearTimeout(timer); });
  const body = $("#sbody", s.el);
  try {
    const d = await auth.startDevice();
    if (!d.user_code) throw new Error(d.error_description || d.error || "Google didn't return a code");
    const url = d.verification_url || "https://www.google.com/device";
    body.innerHTML = `<ol class="steps"><li>Open <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">${esc(url.replace(/^https?:\/\/(www\.)?/, ""))}</a> on any device</li><li>Enter this code and pick your account</li></ol>
      <div class="code">${esc(d.user_code)}</div>
      <div class="row"><button class="btn" id="cc">Copy code</button><a class="btn plain" style="display:inline-grid;place-items:center" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open page</a></div>
      <p class="muted" id="sstat" style="margin-top:14px">Waiting for you to confirm…</p>`;
    $("#cc", s.el).onclick = () => copy(d.user_code, "Code copied");
    let interval = (d.interval || 5) * 1000;
    const deadline = Date.now() + (d.expires_in || 1800) * 1000;
    const poll = async () => {
      if (stop) return;
      if (Date.now() > deadline) { $("#sstat", s.el).textContent = "The code expired. Close this and try again."; return; }
      try {
        const t = await auth.poll(d.device_code);
        if (t.access_token) {
          auth.save(t);
          s.close();
          toast("Signed in");
          fetchAccount();
          renderAccount();
          location.hash = "#/";
          route();
          return;
        }
        if (t.error === "slow_down") interval += 2000;
        else if (t.error && t.error !== "authorization_pending") { $("#sstat", s.el).textContent = "Sign-in failed: " + (t.error_description || t.error); return; }
      } catch (e) { console.warn(e); }
      timer = setTimeout(poll, interval);
    };
    timer = setTimeout(poll, interval);
  } catch (e) {
    body.innerHTML = `<p>${esc(e.message)}</p><p class="muted">Check that your Worker is up to date and reachable (Settings → Run diagnostics).</p>`;
  }
}

async function fetchAccount() {
  try {
    const d = await yt("account/account_menu", {}, { client: "tv", withAuth: true });
    const name = text(findKey(d, "accountName")) || text(findKey(d, "title"));
    const photo = bestThumb(findKey(findKey(d, "accountPhoto") || {}, "thumbnails"));
    if (name || photo) LS.set("account", { name, photo });
    renderAccount();
  } catch (_) {}
}

function renderAccount() {
  const a = LS.get("account", null);
  $("#acctBtn").innerHTML = auth.signedIn && a && a.photo ? `<img src="${esc(a.photo)}" alt="" referrerpolicy="no-referrer">` : I.user;
}

// ---------- Router ----------
function route() {
  try { cleanup(); } catch (_) {}
  cleanup = () => {};
  [...openSheets].forEach((c) => c());
  const h = location.hash.slice(1) || "/";
  const [path, qs] = h.split("?");
  const q = new URLSearchParams(qs || "");
  const parts = path.split("/").filter(Boolean);
  const tab = { "": "home", shorts: "shorts", subs: "subs", library: "library", settings: "settings" }[parts[0] || ""] || "";
  document.body.classList.toggle("in-shorts", parts[0] === "shorts");
  document.querySelectorAll("#tabbar a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
  document.title = "NewTube Web";
  if (parts[0] !== "search") $("#q").value = "";
  window.scrollTo(0, 0);
  if (!workerUrl() && parts[0] !== "settings") {
    view.innerHTML = `<h1 class="large-title">Welcome</h1>
      <div class="group" style="padding:18px 20px"><p style="margin-top:0">NewTube Web needs its free backend (a Cloudflare Worker) to reach YouTube. Paste its address below. You only do this once per browser, or once for everyone by editing <code>config.js</code>.</p>
      <input type="url" id="w1" placeholder="https://newtube-web.yourname.workers.dev" style="width:100%;height:44px;border-radius:12px;border:1px solid var(--line);background:var(--bg);padding:0 12px;font-size:16px" aria-label="Worker URL">
      <div class="row" style="margin-top:12px"><button class="btn" id="w1go">Connect</button><span class="muted" id="w1s"></span></div></div>`;
    $("#w1go").onclick = async () => {
      LS.set("worker", $("#w1").value.trim().replace(/\/+$/, ""));
      $("#w1s").textContent = "Testing…";
      try { await ping(); toast("Connected"); route(); } catch (_) { $("#w1s").textContent = "Can't reach it. Check the address."; }
    };
    return;
  }
  if (parts[0] === "watch" && q.get("v")) return viewWatch(q.get("v"));
  if (parts[0] === "search" && q.get("q")) return viewSearch(q.get("q"));
  if (parts[0] === "channel" && parts[1]) return viewChannel(decodeURIComponent(parts[1]));
  if (parts[0] === "shorts") return viewShorts();
  if (parts[0] === "subs") return viewSubs();
  if (parts[0] === "library") return viewLibrary(q.get("tab"));
  if (parts[0] === "settings") return viewSettings();
  return viewHome();
}

// Paste a YouTube link into search to open it directly.
function videoIdFrom(s) {
  const m = /(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/.exec(s) || /^([\w-]{11})$/.exec(s.trim());
  return m ? m[1] : "";
}

$("#searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#q").value.trim();
  if (!v) return;
  $("#q").blur();
  const id = videoIdFrom(v);
  location.hash = id && /youtu|^[\w-]{11}$/.test(v) ? "#/watch?v=" + id : "#/search?q=" + encodeURIComponent(v);
});

function cardMenu(b) {
  const v = { id: b.dataset.more, title: b.dataset.title, channel: b.dataset.chname, channelId: b.dataset.chid, duration: b.dataset.dur };
  const url = `https://youtu.be/${v.id}`;
  const later = store.has("later", v.id);
  const s = sheet(`<h2 style="padding-right:40px">${esc(v.title)}</h2>
    <button class="opt" data-a="copy">Copy link${I.link}</button>
    <button class="opt" data-a="share">Share…${I.share}</button>
    <button class="opt" data-a="later">${later ? "Remove from Watch later" : "Save to Watch later"}${I.later}</button>
    <button class="opt" data-a="hide">Not interested${I.hide}</button>
    ${v.channelId ? `<button class="opt" data-a="hidech">Don't recommend ${esc(v.channel || "this channel")}${I.hide}</button>` : ""}`);
  s.el.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]"); if (!a) return;
    const card = b.closest(".card");
    const act = a.dataset.a;
    s.close();
    if (act === "copy") copy(url, "Link copied");
    else if (act === "share") shareLink(url, v.title);
    else if (act === "later") toast(store.toggle("later", v) ? "Saved to Watch later" : "Removed from Watch later");
    else if (act === "hide") { store.add("hiddenVideos", { id: v.id }, 2000); if (card) card.remove(); toast("Got it, you won't see this video again"); }
    else if (act === "hidech") {
      store.add("hiddenChannels", { id: v.channelId, title: v.channel }, 1000);
      document.querySelectorAll(`[data-chid="${CSS.escape(v.channelId)}"]`).forEach((x) => { const c = x.closest(".card"); if (c) c.remove(); });
      toast(`You won't see ${v.channel || "this channel"} in your feed`);
    }
  });
}

document.addEventListener("click", (e) => {
  const more = e.target.closest("[data-more]");
  if (more) { e.preventDefault(); e.stopPropagation(); cardMenu(more); return; }
  const ch = e.target.closest("[data-ch]");
  if (ch && ch.dataset.ch) { e.preventDefault(); e.stopPropagation(); location.hash = "#/channel/" + ch.dataset.ch; }
});

const topbar = $("#topbar");
addEventListener("scroll", () => topbar.classList.toggle("scrolled", scrollY > 4), { passive: true });
addEventListener("hashchange", route);

// Allow ?worker=... once, e.g. a link you send to your phone.
const initWorker = new URLSearchParams(location.search).get("worker");
if (initWorker) { LS.set("worker", initWorker.replace(/\/+$/, "")); history.replaceState(null, "", location.pathname + location.hash); }

renderAccount();
if (auth.signedIn && !LS.get("account", null)) fetchAccount();
route();
}
