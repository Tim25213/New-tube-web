// Turns YouTube's InnerTube JSON (web, TV and app layouts) into plain items.
// It walks the whole tree and recognises renderers by name, so it keeps working
// when YouTube moves shelves around. Ads and Shorts are dropped here.

const SKIP = /^(adSlotRenderer|promoted\w*|searchPyvRenderer|compactPromoted\w*|statementBannerRenderer|brandVideo\w*|mealbarPromoRenderer|bannerPromoRenderer|movingThumbnailRenderer|reel\w*|shorts\w*|frameworkUpdates|engagementPanels?|topbar|header|microformat|playerOverlays|adPlacements|playerAds)$/i;

export function text(t) {
  if (t == null) return "";
  if (typeof t === "string") return t;
  if (typeof t === "number") return String(t);
  if (t.simpleText != null) return String(t.simpleText);
  if (Array.isArray(t.runs)) return t.runs.map((r) => r.text || "").join("");
  if (t.content != null) return String(t.content);
  if (t.text != null) return text(t.text);
  return "";
}

export function bestThumb(list) {
  if (!Array.isArray(list) || !list.length) return "";
  const s = [...list].sort((a, b) => (b.width || 0) - (a.width || 0));
  const pick = s.find((x) => (x.width || 0) <= 720) || s[0];
  let u = pick.url || "";
  if (u.startsWith("//")) u = "https:" + u;
  return u;
}

export function ytThumb(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function findKey(obj, key, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 60) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  for (const k in obj) {
    const v = findKey(obj[k], key, depth + 1);
    if (v !== undefined) return v;
  }
  return undefined;
}

function findChannelId(obj) {
  const be = findKey(obj, "browseEndpoint");
  const id = be && be.browseId;
  return id && id.startsWith("UC") ? id : "";
}

export function parseDuration(s) {
  if (!s) return 0;
  const p = String(s).trim().split(":").map(Number);
  if (p.some(isNaN)) return 0;
  return p.reduce((a, b) => a * 60 + b, 0);
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
}

// "3 days ago" -> seconds ago (for sorting the local subscriptions feed)
export function agoSeconds(t) {
  const m = /(\d+)\s*(second|minute|hour|day|week|month|year)/i.exec(t || "");
  if (!m) return 9e9;
  const mult = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
  return Number(m[1]) * mult[m[2].toLowerCase()];
}

const isShort = (r) => JSON.stringify(r).includes("reelWatchEndpoint");

function classicVideo(r) {
  if (!r.videoId || isShort(r)) return null;
  const owner = r.ownerText || r.shortBylineText || r.longBylineText;
  const overlay = (r.thumbnailOverlays || []).map((o) => o.thumbnailOverlayTimeStatusOverlayRenderer).find(Boolean);
  const duration = text(r.lengthText) || text(overlay && overlay.text);
  const live = (r.badges || []).some((b) => /LIVE/.test(JSON.stringify(b))) || (overlay && overlay.style === "LIVE");
  const avatar =
    bestThumb(findKey(r.channelThumbnailSupportedRenderers, "thumbnails")) ||
    bestThumb(r.channelThumbnail && r.channelThumbnail.thumbnails);
  return {
    type: "video",
    id: r.videoId,
    title: text(r.title) || text(r.headline),
    channel: text(owner),
    channelId: findChannelId(owner),
    thumb: ytThumb(r.videoId),
    duration: live ? "" : duration,
    views: text(r.shortViewCountText) || text(r.viewCountText),
    published: text(r.publishedTimeText),
    live: !!live,
    avatar,
  };
}

function lockup(r) {
  if (r.contentType && r.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null;
  if (!r.contentId || isShort(r)) return null;
  const md = (r.metadata && r.metadata.lockupMetadataViewModel) || {};
  const rows = (findKey(md, "metadataRows") || []).map((row) =>
    (row.metadataParts || []).map((p) => text(p.text)).filter(Boolean));
  const badges = [];
  JSON.stringify(r.contentImage || {}, (k, v) => {
    if (k === "thumbnailBadgeViewModel" && v && v.text) badges.push(v.text);
    return v;
  });
  const dur = badges.find((b) => /^\d+(:\d+)+$/.test(b)) || "";
  const live = badges.some((b) => /live/i.test(b));
  const line2 = rows[1] || [];
  return {
    type: "video",
    id: r.contentId,
    title: text(md.title),
    channel: (rows[0] || [])[0] || "",
    channelId: findChannelId(md.image) || findChannelId(md),
    thumb: ytThumb(r.contentId),
    duration: dur,
    views: line2[0] || "",
    published: line2[1] || "",
    live,
    avatar: bestThumb(findKey(md.image, "sources")),
  };
}

function tile(r) {
  const ct = r.contentType || "";
  const md = (r.metadata && r.metadata.tileMetadataRenderer) || {};
  const lines = (md.lines || []).map((l) =>
    ((l.lineRenderer && l.lineRenderer.items) || []).map((i) => text(i.lineItemRenderer && i.lineItemRenderer.text)).filter((s) => s && s !== "•"));
  if (ct.includes("CHANNEL")) {
    const id = r.contentId || findChannelId(r.onSelectCommand);
    return id ? { type: "channel", id, title: text(md.title), thumb: bestThumb(findKey(r.header, "thumbnails")), subs: (lines[0] || []).join(" · ") } : null;
  }
  if (ct && !ct.includes("VIDEO")) return null;
  if (isShort(r)) return null;
  const we = findKey(r.onSelectCommand, "watchEndpoint");
  const id = (we && we.videoId) || r.contentId;
  if (!id) return null;
  const ov = findKey(r.header, "thumbnailOverlayTimeStatusOverlayRenderer");
  const flat = lines.flat();
  return {
    type: "video",
    id,
    title: text(md.title),
    channel: flat[0] || "",
    channelId: findChannelId(r.menu) || "",
    thumb: ytThumb(id),
    duration: ov && ov.style !== "LIVE" ? text(ov.text) : "",
    views: flat.find((s) => /view|watching/i.test(s)) || flat[1] || "",
    published: flat.find((s) => /ago|streamed|premiere/i.test(s)) || "",
    live: !!(ov && ov.style === "LIVE"),
    avatar: "",
  };
}

function channel(r) {
  if (!r.channelId) return null;
  const subs = [text(r.subscriberCountText), text(r.videoCountText)].find((s) => /subscriber/i.test(s)) || text(r.subscriberCountText);
  return {
    type: "channel",
    id: r.channelId,
    title: text(r.title),
    thumb: bestThumb(r.thumbnail && r.thumbnail.thumbnails),
    subs,
    handle: /^@/.test(text(r.subscriberCountText)) ? text(r.subscriberCountText) : "",
  };
}

const RENDERERS = {
  videoRenderer: classicVideo,
  compactVideoRenderer: classicVideo,
  gridVideoRenderer: classicVideo,
  videoWithContextRenderer: classicVideo,
  playlistVideoRenderer: classicVideo,
  playlistPanelVideoRenderer: classicVideo,
  lockupViewModel: lockup,
  tileRenderer: tile,
  channelRenderer: channel,
  gridChannelRenderer: channel,
};

export function collectItems(root) {
  const out = [];
  const seen = new Set();
  let continuation = "";
  (function walk(node, depth) {
    if (!node || typeof node !== "object" || depth > 80) return;
    if (Array.isArray(node)) { for (const n of node) walk(n, depth + 1); return; }
    for (const k in node) {
      const v = node[k];
      if (RENDERERS[k]) {
        let item = null;
        try { item = RENDERERS[k](v || {}); } catch (_) { item = null; }
        if (item && item.title) {
          const key = item.type + item.id;
          if (!seen.has(key)) { seen.add(key); out.push(item); }
        }
        continue;
      }
      if (k === "continuationCommand" && v && v.token) continuation = v.token;
      else if (k === "nextContinuationData" && v && v.continuation) continuation = v.continuation;
      else if (k === "reloadContinuationData" && v && v.continuation && !continuation) continuation = v.continuation;
      if (SKIP.test(k)) continue;
      walk(v, depth + 1);
    }
  })(root, 0);
  return { items: out, continuation };
}

// /next (WEB) -> details, related and the comments token
export function parseNext(data) {
  const res = findKey(data, "twoColumnWatchNextResults") || {};
  const primary = findKey(res.results, "videoPrimaryInfoRenderer") || {};
  const secondary = findKey(res.results, "videoSecondaryInfoRenderer") || {};
  const owner = (secondary.owner && secondary.owner.videoOwnerRenderer) || {};
  const related = collectItems(res.secondaryResults || {});
  let commentsToken = "";
  const sections = findKey(res.results, "contents") || [];
  for (const s of sections) {
    const isr = s.itemSectionRenderer;
    if (isr && /comment/i.test(isr.sectionIdentifier || isr.targetId || "")) {
      const c = findKey(isr, "continuationCommand");
      if (c) commentsToken = c.token;
    }
  }
  return {
    title: text(primary.title),
    views: text(findKey(primary.viewCount, "viewCount")) || text(findKey(primary.viewCount, "shortViewCount")),
    date: text(primary.relativeDateText) || text(primary.dateText),
    channel: text(owner.title),
    channelId: findChannelId(owner.title) || findChannelId(owner),
    avatar: bestThumb(owner.thumbnail && owner.thumbnail.thumbnails),
    subs: text(owner.subscriberCountText),
    description: text(secondary.attributedDescription) || text(secondary.description),
    related: related.items.filter((i) => i.type === "video"),
    relatedContinuation: related.continuation,
    commentsToken,
  };
}

export function parseComments(data) {
  const out = [];
  const muts = (findKey(data, "mutations") || []);
  const byKey = {};
  for (const m of muts) {
    const p = m.payload && m.payload.commentEntityPayload;
    if (p) byKey[m.entityKey] = p;
  }
  for (const p of Object.values(byKey)) {
    const pr = p.properties || {}, au = p.author || {}, tb = p.toolbar || {};
    out.push({
      author: au.displayName || "",
      avatar: au.avatarThumbnailUrl || "",
      text: text(pr.content),
      time: pr.publishedTime || "",
      likes: tb.likeCountNotliked || "",
      replies: tb.replyCount || "",
    });
  }
  // Older layout
  if (!out.length) {
    JSON.stringify(data, (k, v) => {
      if (k === "commentRenderer" && v) {
        out.push({
          author: text(v.authorText), avatar: bestThumb(v.authorThumbnail && v.authorThumbnail.thumbnails),
          text: text(v.contentText), time: text(v.publishedTimeText), likes: text(v.voteCount), replies: "",
        });
      }
      return v;
    });
  }
  let continuation = "";
  const items = findKey(data, "onResponseReceivedEndpoints") || [];
  JSON.stringify(items, (k, v) => {
    if (k === "continuationItemRenderer" && v) {
      const c = findKey(v, "continuationCommand");
      if (c && c.token) continuation = c.token;
    }
    return v;
  });
  return { comments: out, continuation };
}

export function parseChannel(data) {
  const md = findKey(data, "channelMetadataRenderer") || {};
  let subs = "";
  JSON.stringify(findKey(data, "header") || {}, (k, v) => {
    if (!subs && typeof v === "string" && /subscriber/i.test(v) && v.length < 40) subs = v;
    if (!subs && v && typeof v === "object" && v.simpleText && /subscriber/i.test(v.simpleText)) subs = v.simpleText;
    return v;
  });
  const banner = findKey(findKey(data, "header") || {}, "banner");
  const { items, continuation } = collectItems(findKey(data, "tabs") || findKey(data, "onResponseReceivedActions") || data);
  return {
    id: md.externalId || "",
    title: md.title || "",
    avatar: bestThumb(md.avatar && md.avatar.thumbnails),
    description: md.description || "",
    subs,
    banner: bestThumb(findKey(banner || {}, "sources") || findKey(banner || {}, "thumbnails")),
    items: items.filter((i) => i.type === "video"),
    continuation,
  };
}
