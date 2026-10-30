// Optimiza videos e imágenes en el navegador antes de subirlos (sin servidor y sin instalar nada).
// Videos: se re-codifican a H.264 MP4 de máx. 960×540, ~1 Mbps, sin audio, + una imagen fija (poster) para las miniaturas.
// Si el navegador no soporta WebCodecs, se sube el original igual (con su poster si se pudo sacar).
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

const MAX_W = 960,
  MAX_H = 540,
  FPS = 24,
  BITRATE = 1_000_000,
  MAX_SEC = 20,
  POSTER_W = 480;
const even = n => Math.max(2, Math.round(n / 2) * 2);

function loadVideo(file) {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = URL.createObjectURL(file);
    v.onloadeddata = () => res(v);
    v.onerror = () => rej(new Error("No se pudo leer el video"));
  });
}
const seek = (v, t) =>
  new Promise(res => {
    const done = () => {
      v.removeEventListener("seeked", done);
      res();
    };
    v.addEventListener("seeked", done);
    v.currentTime = t;
  });
const toBlob = (canvas, type, q) => new Promise(res => canvas.toBlob(res, type, q));

async function posterOf(v, w, h) {
  const pw = Math.min(POSTER_W, w),
    ph = even((pw * h) / w);
  const c = document.createElement("canvas");
  c.width = pw;
  c.height = ph;
  await seek(v, Math.min(1, (v.duration || 1) / 3));
  c.getContext("2d").drawImage(v, 0, 0, pw, ph);
  return toBlob(c, "image/jpeg", 0.8);
}

async function encodeH264(v, w, h, dur, onProgress) {
  const codecs = ["avc1.640028", "avc1.4d0028", "avc1.42001f"];
  let config = null;
  for (const codec of codecs) {
    const cfg = { codec, width: w, height: h, bitrate: BITRATE, framerate: FPS, avc: { format: "avc" } };
    try {
      if ((await VideoEncoder.isConfigSupported(cfg)).supported) {
        config = cfg;
        break;
      }
    } catch (e) {}
  }
  if (!config) return null;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: w, height: h, frameRate: FPS },
    fastStart: "in-memory"
  });
  let failed = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => {
      failed = e;
    }
  });
  enc.configure(config);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const total = Math.max(1, Math.floor(dur * FPS));
  for (let i = 0; i < total; i++) {
    if (failed) throw failed;
    await seek(v, i / FPS);
    ctx.drawImage(v, 0, 0, w, h);
    const frame = new VideoFrame(c, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    if (enc.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 0));
    if (onProgress && i % 6 === 0) onProgress(i / total);
  }
  await enc.flush();
  enc.close();
  if (failed) throw failed;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}

// Devuelve { file, poster, info } listo para subir
export async function optimizeVideo(file, onProgress) {
  let v;
  try {
    v = await loadVideo(file);
  } catch (e) {
    return { file, poster: null, info: "original" };
  }
  try {
    const sw = v.videoWidth,
      sh = v.videoHeight,
      dur = Math.min(v.duration || 0, MAX_SEC);
    const k = Math.min(1, MAX_W / sw, MAX_H / sh),
      w = even(sw * k),
      h = even(sh * k);
    const poster = await posterOf(v, w, h).catch(() => null);
    let out = null;
    if (typeof VideoEncoder !== "undefined" && dur > 0) {
      try {
        out = await encodeH264(v, w, h, dur, onProgress);
      } catch (e) {
        out = null;
      }
    }
    if (!out || out.size >= file.size) return { file, poster, info: "original" };
    return {
      file: new File([out], (file.name || "video").replace(/\.\w+$/, "") + ".mp4", { type: "video/mp4" }),
      poster,
      info:
        Math.round(file.size / 1024) +
        " KB → " +
        Math.round(out.size / 1024) +
        " KB" +
        ((v.duration || 0) > MAX_SEC ? " (recortado a " + MAX_SEC + " s)" : "")
    };
  } finally {
    URL.revokeObjectURL(v.src);
  }
}

// Imágenes grandes → JPEG de máx. 1280 px
export async function optimizeImage(file) {
  if (file.type === "image/gif" || file.size < 300 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1280 / bmp.width, 1280 / bmp.height);
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const b = await toBlob(c, "image/jpeg", 0.85);
    return b && b.size < file.size
      ? new File([b], (file.name || "imagen").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })
      : file;
  } catch (e) {
    return file;
  }
}

// URL de la imagen fija de un video: mismo nombre con .jpg
export const posterURL = url =>
  /\.(mp4|webm|mov)(\?.*)?$/i.test(url || "") ? url.replace(/\.(mp4|webm|mov)(\?.*)?$/i, ".jpg") : null;
