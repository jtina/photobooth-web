// Camera capture and video processing (ported from CameraService.swift,
// CameraView.swift and PhotoBoothMediaProcessor.swift).
//
// Instead of one long recording that is cut up afterwards, each countdown is
// recorded as its own clip that ends at the moment the photo is taken. That is
// exactly the "10 seconds before each photo" segment the iOS app extracted, and
// it avoids seeking inside MediaRecorder output (unreliable in some browsers).

import { createCanvas } from './render.js';

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}

export function extensionFor(mimeType) {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}

export class CameraSession {
  constructor(facing) {
    this.facing = facing; // 'user' | 'environment'
    this.stream = null;
    this.recorder = null;
    this.mimeType = pickMimeType();
  }

  async start(videoEl) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not allow camera access. Open the app over HTTPS in Safari.');
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: this.facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        throw new Error('Camera access was denied. Allow camera access for this site in Settings, then try again.');
      }
      throw new Error(`The camera could not be started: ${error?.message ?? error}`);
    }
    this.videoEl = videoEl;
    videoEl.srcObject = this.stream;
    videoEl.muted = true;
    videoEl.playsInline = true;
    await videoEl.play().catch(() => {});
    if (!videoEl.videoWidth) {
      await new Promise((resolve) => videoEl.addEventListener('loadedmetadata', resolve, { once: true }));
    }
  }

  get mirrored() {
    return this.facing === 'user';
  }

  /** Grabs the current frame. Front-camera photos are mirrored like the preview. */
  capturePhoto() {
    const v = this.videoEl;
    const canvas = createCanvas(v.videoWidth, v.videoHeight);
    const ctx = canvas.getContext('2d');
    if (this.mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /** Starts recording a clip. Returns a promise for the finished clip Blob (or null). */
  startClip() {
    if (this.mimeType === null || !this.stream) return Promise.resolve(null);
    let recorder;
    try {
      recorder = new MediaRecorder(this.stream, {
        ...(this.mimeType ? { mimeType: this.mimeType } : {}),
        videoBitsPerSecond: 4_000_000,
      });
    } catch {
      return Promise.resolve(null);
    }
    const chunks = [];
    const done = new Promise((resolve) => {
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || this.mimeType }) : null);
      recorder.onerror = () => resolve(null);
    });
    recorder.start(1000);
    this.recorder = recorder;
    return done;
  }

  stopClip() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null;
  }

  stop() {
    this.stopClip();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.videoEl) this.videoEl.srcObject = null;
  }
}

function waitFor(target, event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    target.addEventListener(
      event,
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Plays each clip (in selection order) at 4× speed into a canvas and records
 * the result, like createSelectedVideo() in the iOS app.
 */
export async function buildSelectedVideo(clips, { mirrored, speed = 4, maxHeight = 480 } = {}) {
  const usable = clips.filter(Boolean);
  if (!usable.length) throw new Error('No camera video was recorded.');
  const mimeType = pickMimeType();
  if (mimeType === null) throw new Error('This browser cannot record video.');

  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;overflow:hidden;';
  document.body.appendChild(holder);

  const urls = [];
  const videos = await Promise.all(
    usable.map(async (blob) => {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      const url = URL.createObjectURL(blob);
      urls.push(url);
      v.src = url;
      holder.appendChild(v);
      await waitFor(v, 'loadeddata', 10000);
      return v;
    }),
  );

  try {
    const first = videos[0];
    const scale = Math.min(1, maxHeight / first.videoHeight);
    const canvas = createCanvas(Math.round((first.videoWidth * scale) / 2) * 2, Math.round((first.videoHeight * scale) / 2) * 2);
    const ctx = canvas.getContext('2d');
    const draw = (v) => {
      ctx.save();
      if (mirrored) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    };
    draw(first);

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 3_000_000,
    });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.start(500);

    for (const v of videos) {
      v.currentTime = 0;
      v.playbackRate = speed;
      let running = true;
      const loop = () => {
        if (!running) return;
        draw(v);
        requestAnimationFrame(loop);
      };
      const duration = Number.isFinite(v.duration) ? v.duration : 12;
      const ended = waitFor(v, 'ended', (duration / speed) * 1000 + 6000).catch(() => {});
      await v.play();
      v.playbackRate = speed; // Safari can reset the rate when playback starts.
      loop();
      await ended;
      running = false;
      draw(v);
    }

    recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    const type = recorder.mimeType || mimeType || 'video/webm';
    return new Blob(chunks, { type });
  } finally {
    holder.remove();
    urls.forEach((u) => URL.revokeObjectURL(u));
  }
}
