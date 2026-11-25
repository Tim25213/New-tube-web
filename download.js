// Download a video as one .mp4 file (up to 1080p).
// YouTube keeps HD picture and sound in separate files, so this downloads both
// (in small pieces through your Worker) and joins them into one MP4 right in the browser.
import { proxied } from "./api.js?v=3";

// ---------- MP4 joining (fragmented MP4 in, fragmented MP4 out) ----------
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const w32 = (b, o, v) => { b[o] = (v >>> 24) & 255; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; };
const u64 = (b, o) => u32(b, o) * 4294967296 + u32(b, o + 4);
const w64 = (b, o, v) => { w32(b, o, Math.floor(v / 4294967296)); w32(b, o + 4, v >>> 0); };
const type = (b, o) => String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);

function boxes(b, start = 0, end = b.length) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = u32(b, o), hdr = 8;
    if (size === 1) { size = u64(b, o + 8); hdr = 16; }
    else if (size === 0) size = end - o;
    if (size < hdr || o + size > end) break;
    out.push({ type: type(b, o), start: o, end: o + size, body: o + hdr });
    o += size;
  }
  return out;
}
const child = (b, box, t) => boxes(b, box.body, box.end).find((x) => x.type === t);
const box = (t, ...parts) => {
  const len = 8 + parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  w32(out, 0, len);
  for (let i = 0; i < 4; i++) out[4 + i] = t.charCodeAt(i);
  let o = 8;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

function setTrackId(b, trakOrTrex, id) {
  // tkhd / trex / tfhd: version+flags, then (dates for tkhd) track_ID
  const v = b[trakOrTrex.body];
  const off = trakOrTrex.type === "tkhd" ? (v === 1 ? 20 : 12) : 4;
  w32(b, trakOrTrex.body + off, id);
}

function readInput(buf) {
  const b = new Uint8Array(buf);
  const top = boxes(b);
  const moov = top.find((x) => x.type === "moov");
  if (!moov) throw new Error("Not an MP4 file");
  const mvhd = child(b, moov, "mvhd");
  const trak = child(b, moov, "trak");
  const mvex = child(b, moov, "mvex");
  const trex = mvex && child(b, mvex, "trex");
  if (!trak || !trex) throw new Error("Unexpected file layout");
  const mdhd = child(b, child(b, trak, "mdia"), "mdhd");
  const timescale = u32(b, mdhd.body + (b[mdhd.body] === 1 ? 20 : 12));
  const frags = [];
  for (let i = 0; i < top.length; i++) {
    if (top[i].type !== "moof") continue;
    const mdat = top[i + 1] && top[i + 1].type === "mdat" ? top[i + 1] : null;
    if (!mdat) continue;
    const traf = child(b, top[i], "traf");
    const tfdt = traf && child(b, traf, "tfdt");
    const t = tfdt ? (b[tfdt.body] === 1 ? u64(b, tfdt.body + 4) : u32(b, tfdt.body + 4)) : 0;
    frags.push({ moof: top[i], mdat, time: t / timescale });
  }
  return { b, top, mvhd, trak, trex, frags };
}

// Returns the parts of the joined file (Uint8Arrays), ready for new Blob(parts).
export function joinMp4(videoBuf, audioBuf, durationSec) {
  const V = readInput(videoBuf), A = readInput(audioBuf);
  const ftyp = V.top.find((x) => x.type === "ftyp");
  const parts = [];
  if (ftyp) parts.push(V.b.slice(ftyp.start, ftyp.end));

  // moov: movie header + both tracks + fragment defaults
  const mvhd = V.b.slice(V.mvhd.start, V.mvhd.end);
  const mv = { type: "mvhd", body: 8 };
  const ver = mvhd[8];
  const tsOff = 8 + (ver === 1 ? 20 : 12);
  const timescale = u32(mvhd, tsOff);
  const dur = Math.round((durationSec || 0) * timescale);
  if (ver === 1) w64(mvhd, tsOff + 4, dur); else w32(mvhd, tsOff + 4, dur);
  w32(mvhd, mvhd.length - 4, 3); // next_track_ID
  void mv;
  const tracks = [[V, 1], [A, 2]].map(([I, id]) => {
    const trak = I.b.slice(I.trak.start, I.trak.end);
    const tkhd = boxes(trak, 8).find((x) => x.type === "tkhd");
    setTrackId(trak, tkhd, id);
    const trex = I.b.slice(I.trex.start, I.trex.end);
    setTrackId(trex, { type: "trex", body: 8 }, id);
    return { trak, trex };
  });
  const mehdBody = new Uint8Array(8); w32(mehdBody, 4, dur);
  const mvex = box("mvex", box("mehd", mehdBody), tracks[0].trex, tracks[1].trex);
  parts.push(box("moov", mvhd, tracks[0].trak, tracks[1].trak, mvex));

  // Fragments from both files, interleaved by time, renumbered.
  const all = [...V.frags.map((f) => ({ ...f, I: V, id: 1 })), ...A.frags.map((f) => ({ ...f, I: A, id: 2 }))]
    .sort((a, b) => a.time - b.time || a.id - b.id);
  let pos = parts.reduce((n, p) => n + p.length, 0);
  let seq = 1;
  for (const f of all) {
    const moof = f.I.b.slice(f.moof.start, f.moof.end);
    for (const x of boxes(moof, 8)) {
      if (x.type === "mfhd") w32(moof, x.body + 4, seq++);
      if (x.type === "traf") {
        const tfhd = boxes(moof, x.body, x.end).find((y) => y.type === "tfhd");
        if (!tfhd) continue;
        const flags = u32(moof, tfhd.body) & 0xffffff;
        w32(moof, tfhd.body + 4, f.id);
        if (flags & 1) { // absolute base offset: shift it to the new position
          const old = u64(moof, tfhd.body + 8);
          w64(moof, tfhd.body + 8, old - f.moof.start + pos);
        }
      }
    }
    parts.push(moof);
    pos += moof.length;
    const mdat = f.I.b.subarray(f.mdat.start, f.mdat.end);
    parts.push(mdat);
    pos += mdat.length;
  }
  return parts;
}

// ---------- Picking formats ----------
export function downloadOptions(sd) {
  const fmts = (sd && sd.adaptiveFormats) || [];
  const audio = fmts.filter((f) => f.url && /^audio\/mp4/.test(f.mimeType || "") && !f.isDrc && !/drc/i.test(f.xtags || ""))
    .filter((f) => !f.audioTrack || f.audioTrack.audioIsDefault !== false)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  const videos = fmts.filter((f) => f.url && /^video\/mp4;\s*codecs="avc1/.test(f.mimeType || "") && f.height && f.initRange);
  const out = [];
  if (audio) {
    for (const h of [1080, 720, 480]) {
      const v = videos.filter((f) => f.height <= h && f.height > (h === 1080 ? 720 : h === 720 ? 480 : 360))
        .sort((a, b) => b.height - a.height || (b.bitrate || 0) - (a.bitrate || 0))[0];
      if (v) out.push({ label: `${v.height}p`, video: v, audio, size: Number(v.contentLength || 0) + Number(audio.contentLength || 0) });
    }
  }
  const prog = ((sd && sd.formats) || []).filter((f) => f.url).sort((a, b) => (b.height || 0) - (a.height || 0))[0];
  if (prog) out.push({ label: `${prog.height || 360}p (quick)`, single: prog, size: Number(prog.contentLength || 0) });
  return out;
}

// ---------- Downloading in pieces ----------
const CHUNK = 4 * 1024 * 1024;
async function fetchAll(getUrl, total, onBytes, signal) {
  if (!total) {
    const r = await fetch(proxied(await getUrl()), { signal });
    if (!r.ok) throw new Error("Download failed (" + r.status + ")");
    const ab = await r.arrayBuffer();
    onBytes(ab.byteLength);
    return ab;
  }
  const out = new Uint8Array(total);
  let next = 0;
  const worker = async () => {
    while (next < total) {
      const a = next, b = Math.min(total, a + CHUNK) - 1;
      next = b + 1;
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await fetch(proxied(await getUrl(attempt > 0)), { headers: { Range: `bytes=${a}-${b}` }, signal });
          if (!r.ok) throw new Error("HTTP " + r.status);
          const ab = new Uint8Array(await r.arrayBuffer());
          if (ab.length !== b - a + 1) throw new Error("short piece");
          out.set(ab, a);
          onBytes(ab.length);
          break;
        } catch (e) {
          if (signal && signal.aborted) throw e;
          if (attempt >= 3) throw new Error("Download failed: " + e.message);
          await new Promise((res) => setTimeout(res, 700 * (attempt + 1)));
        }
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return out.buffer;
}

// opt from downloadOptions; refresh() returns fresh streamingData if YouTube cuts the old addresses.
export async function downloadVideo(opt, { durationSec, refresh, onProgress, signal }) {
  const total = opt.size || 0;
  let done = 0;
  const tick = (n) => { done += n; onProgress && onProgress(total ? Math.min(1, done / total) : 0, done); };
  const urlFor = (fmt) => {
    let url = fmt.url;
    return async (stale) => {
      if (stale && refresh) {
        try {
          const sd = await refresh();
          const all = [...(sd.adaptiveFormats || []), ...(sd.formats || [])];
          const same = all.find((f) => f.itag === fmt.itag && f.url);
          if (same) url = same.url;
        } catch (_) { /* keep old */ }
      }
      return url;
    };
  };
  if (opt.single) {
    const ab = await fetchAll(urlFor(opt.single), Number(opt.single.contentLength || 0), tick, signal);
    return new Blob([ab], { type: "video/mp4" });
  }
  const [v, a] = await Promise.all([
    fetchAll(urlFor(opt.video), Number(opt.video.contentLength || 0), tick, signal),
    fetchAll(urlFor(opt.audio), Number(opt.audio.contentLength || 0), tick, signal),
  ]);
  return new Blob(joinMp4(v, a, durationSec), { type: "video/mp4" });
}
