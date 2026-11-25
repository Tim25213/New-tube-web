// Ad-free playback: asks YouTube for the raw streams (app clients that need no
// extra tokens), builds a DASH manifest and plays it with Shaka through your Worker.
// Falls back to a single 360p file, then to YouTube's embed player.
import { yt, proxied, sponsorSegments, LS } from "./api.js?v=2";

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function getPlayerResponse(id) {
  const errors = [];
  for (const client of ["vr", "ios"]) {
    try {
      const pr = await yt("player", {
        videoId: id, contentCheckOk: true, racyCheckOk: true,
        playbackContext: { contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" } },
      }, { client });
      const st = pr.playabilityStatus || {};
      if (st.status === "OK" && pr.streamingData) return { pr, client, errors };
      errors.push(`${client}: ${st.status || "?"} ${st.reason || ""}`.trim());
      if (!errors.pr) errors.pr = pr;
    } catch (e) {
      errors.push(`${client}: ${e.message}`);
    }
  }
  return { pr: errors.pr || null, client: null, errors };
}

export function buildMpd(sd, durationSec) {
  const fmts = (sd.adaptiveFormats || []).filter((f) => f.url && f.initRange && f.indexRange && !f.drmFamilies);
  if (!fmts.length) return "";
  const audioDefault = fmts.find((f) => f.audioTrack && f.audioTrack.audioIsDefault);
  const groups = new Map();
  for (const f of fmts) {
    const m = /^(\w+)\/(\w+);\s*codecs="([^"]+)"/.exec(f.mimeType || "");
    if (!m) continue;
    const [, kind, container, codecs] = m;
    if (kind === "audio" && audioDefault && f.audioTrack && f.audioTrack.id !== audioDefault.audioTrack.id) continue;
    if (/drc/i.test(f.xtags || "") || f.isDrc) continue;
    const family = codecs.split(".")[0];
    const key = `${kind}/${container}/${family}`;
    if (!groups.has(key)) groups.set(key, { kind, mime: `${kind}/${container}`, list: [] });
    groups.get(key).list.push({ ...f, codecs });
  }
  const dur = durationSec || Number(fmts[0].approxDurationMs || 0) / 1000;
  let i = 0;
  const sets = [...groups.values()].map((g) => {
    const reps = g.list.map((f) => {
      const attrs = g.kind === "video"
        ? `width="${f.width || 0}" height="${f.height || 0}" frameRate="${f.fps || 30}"`
        : `audioSamplingRate="${f.audioSampleRate || 44100}"`;
      const ch = g.kind === "audio"
        ? `<AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="${f.audioChannels || 2}"/>`
        : "";
      return `<Representation id="${f.itag}" codecs="${xml(f.codecs)}" bandwidth="${f.bitrate || f.averageBitrate || 100000}" ${attrs}>${ch}` +
        `<BaseURL>${xml(proxied(f.url))}</BaseURL>` +
        `<SegmentBase indexRange="${f.indexRange.start}-${f.indexRange.end}"><Initialization range="${f.initRange.start}-${f.initRange.end}"/></SegmentBase>` +
        `</Representation>`;
    }).join("");
    return `<AdaptationSet id="${i++}" mimeType="${g.mime}" subsegmentAlignment="true" startWithSAP="1">${reps}</AdaptationSet>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" minBufferTime="PT1.5S" mediaPresentationDuration="PT${dur.toFixed(3)}S"><Period>${sets}</Period></MPD>`;
}

export async function mountPlayer(box, id, meta, { onSkip, onMode } = {}) {
  box.innerHTML = "";
  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.controls = true;
  video.autoplay = true;
  video.poster = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  box.appendChild(video);

  const ctl = {
    video, mode: "loading", shaka: null, pr: null, errors: [],
    qualities() {
      if (!this.shaka) return [];
      const hs = [...new Set(this.shaka.getVariantTracks().map((t) => t.height).filter(Boolean))];
      return hs.sort((a, b) => b - a);
    },
    currentHeight() {
      const t = this.shaka && this.shaka.getVariantTracks().find((t) => t.active);
      return t ? t.height : 0;
    },
    setQuality(h) {
      if (!this.shaka) return;
      if (h === "auto") { this.shaka.configure({ abr: { enabled: true } }); LS.set("quality", "auto"); return; }
      this.shaka.configure({ abr: { enabled: false } });
      const t = this.shaka.getVariantTracks().filter((t) => t.height === h).sort((a, b) => b.bandwidth - a.bandwidth)[0];
      if (t) this.shaka.selectVariantTrack(t, true);
      LS.set("quality", h);
    },
    destroy() {
      try { savePos(); } catch (_) {}
      clearInterval(this._iv);
      if (this.shaka) this.shaka.destroy();
      video.removeAttribute("src");
      try { video.load(); } catch (_) {}
      box.innerHTML = "";
    },
  };

  const posKey = "pos." + id;
  const savePos = () => {
    if (!video.duration || ctl.mode === "embed") return;
    const t = video.currentTime;
    if (t > 10 && t < video.duration - 15) LS.set(posKey, Math.floor(t));
    else if (t >= video.duration - 15) LS.del(posKey);
  };
  ctl._iv = setInterval(savePos, 5000);
  const start = LS.get(posKey, 0) || 0;

  const embed = (why) => {
    ctl.mode = "embed";
    if (ctl.shaka) { ctl.shaka.destroy(); ctl.shaka = null; }
    box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0&start=${start}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Video player"></iframe>`;
    onMode && onMode("embed", why);
  };

  const { pr, errors } = await getPlayerResponse(id);
  ctl.pr = pr; ctl.errors = errors;
  if (!pr || !pr.streamingData || (pr.videoDetails && pr.videoDetails.isLive)) {
    embed(pr && pr.videoDetails && pr.videoDetails.isLive ? "live" : errors.join(" | ") || "no streams");
    return ctl;
  }
  const sd = pr.streamingData;
  const dur = Number((pr.videoDetails && pr.videoDetails.lengthSeconds) || 0);

  const progressive = () => {
    const f = (sd.formats || []).filter((f) => f.url).sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    if (!f) return embed("no progressive stream");
    if (ctl.shaka) { ctl.shaka.destroy(); ctl.shaka = null; }
    ctl.mode = "progressive";
    video.src = proxied(f.url);
    if (start) video.currentTime = start;
    video.onerror = () => embed("progressive stream failed");
    video.play().catch(() => {});
    onMode && onMode("progressive");
  };

  const mpd = buildMpd(sd, dur);
  const shaka = window.shaka;
  if (mpd && shaka && shaka.Player.isBrowserSupported()) {
    try {
      shaka.polyfill.installAll();
      const p = new shaka.Player();
      await p.attach(video);
      ctl.shaka = p;
      p.configure({
        preferredVideoCodecs: ["avc1", "vp09", "av01"],
        preferredAudioCodecs: ["mp4a", "opus"],
        streaming: { bufferingGoal: 40, rebufferingGoal: 1.5, retryParameters: { maxAttempts: 3, timeout: 20000 } },
        abr: { enabled: true, defaultBandwidthEstimate: 2500000 },
      });
      let fellBack = false;
      p.addEventListener("error", (ev) => {
        console.warn("shaka", ev.detail);
        if (!fellBack) { fellBack = true; progressive(); }
      });
      const uri = "data:application/dash+xml;base64," + btoa(unescape(encodeURIComponent(mpd)));
      await p.load(uri, start || null, "application/dash+xml");
      ctl.mode = "dash";
      const q = LS.get("quality", "auto");
      if (q !== "auto") ctl.setQuality(q);
      video.play().catch(() => {});
      onMode && onMode("dash");
    } catch (e) {
      console.warn("dash failed", e);
      progressive();
    }
  } else {
    progressive();
  }

  // Lock-screen / headset controls
  if ("mediaSession" in navigator && meta) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: meta.title || "", artist: meta.channel || "",
        artwork: [{ src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, sizes: "480x360", type: "image/jpeg" }],
      });
      navigator.mediaSession.setActionHandler("seekbackward", () => { video.currentTime -= 10; });
      navigator.mediaSession.setActionHandler("seekforward", () => { video.currentTime += 10; });
    } catch (_) {}
  }

  // SponsorBlock
  if (LS.get("settings", {}).sponsorblock !== false) {
    sponsorSegments(id).then((segs) => {
      if (!segs.length) return;
      const done = new Set();
      video.addEventListener("timeupdate", () => {
        const t = video.currentTime;
        for (const s of segs) {
          const [a, b] = s.segment;
          if (t >= a && t < b - 0.3 && !done.has(s.UUID)) {
            done.add(s.UUID);
            video.currentTime = b;
            onSkip && onSkip(s.category);
          }
        }
      });
    });
  }
  return ctl;
}
