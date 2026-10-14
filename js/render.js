// Canvas helpers: photo filters and the final photo strip renderer
// (ported from PhotoStripRenderer.swift and PhotoFilter in StickerEditorView.swift).

import { frameGeometry } from './config.js';

const imageCache = new Map();

export function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Could not load ${src}`));
        img.src = src;
      }),
    );
  }
  return imageCache.get(src);
}

export function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  return canvas;
}

/** Like CIColorControls: saturation, then brightness, then contrast. */
function colorControls(canvas, { saturation = 1, contrast = 1, brightness = 0 }) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  const b = brightness * 255;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], bl = d[i + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    r = luma + (r - luma) * saturation + b;
    g = luma + (g - luma) * saturation + b;
    bl = luma + (bl - luma) * saturation + b;
    d[i] = (r - 127.5) * contrast + 127.5;
    d[i + 1] = (g - 127.5) * contrast + 127.5;
    d[i + 2] = (bl - 127.5) * contrast + 127.5;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Cheap gaussian-ish blur: downscale then upscale with smoothing. */
function blurred(source, radius) {
  const factor = Math.max(2, radius);
  const small = createCanvas(Math.max(1, source.width / factor), Math.max(1, source.height / factor));
  const sctx = small.getContext('2d');
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(source, 0, 0, small.width, small.height);
  const out = createCanvas(source.width, source.height);
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

function copyOf(source) {
  const canvas = createCanvas(source.width, source.height);
  canvas.getContext('2d').drawImage(source, 0, 0);
  return canvas;
}

/** Returns a new canvas with the filter applied; same size as the source. */
export function applyFilter(filterId, source) {
  if (filterId === 'normal') return source;
  const base = copyOf(source);
  // Filter radii were tuned for ~1280px wide photos on iOS; scale accordingly.
  const scale = source.width / 1280;

  if (filterId === 'blackAndWhite') {
    return colorControls(base, { saturation: 0, contrast: 1.08 });
  }

  if (filterId === 'dreamy') {
    colorControls(base, { saturation: 1.03, contrast: 0.88, brightness: 0.045 });
    const glow = blurred(base, 9 * scale * 2);
    const ctx = base.getContext('2d');
    ctx.globalAlpha = 0.22;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(glow, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return base;
  }

  if (filterId === 'softLight') {
    colorControls(base, { saturation: 0.96, contrast: 0.9, brightness: 0.025 });
    const soft = blurred(base, 6 * scale * 2);
    const ctx = base.getContext('2d');
    ctx.globalCompositeOperation = 'soft-light';
    ctx.drawImage(soft, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    return base;
  }

  return source;
}

/** Draws `image` to fill `rect`, cropping the overflow (aspect fill). */
export function drawAspectFill(ctx, image, rect) {
  const iw = image.naturalWidth || image.videoWidth || image.width;
  const ih = image.naturalHeight || image.videoHeight || image.height;
  if (!iw || !ih) return;
  const scale = Math.max(rect.w / iw, rect.h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.drawImage(image, rect.x + (rect.w - dw) / 2, rect.y + (rect.h - dh) / 2, dw, dh);
  ctx.restore();
}

/**
 * Renders the final design and resolves to a JPEG Blob.
 * photos: canvases in selection order. stickers: normalized placements.
 */
export async function renderPhotoStrip({ photos, frameColor, template, layout, stickers = [] }) {
  const geometry = frameGeometry({ layout, template });
  const canvas = createCanvas(geometry.width, geometry.height);
  const ctx = canvas.getContext('2d');
  const toPx = (r) => ({ x: r.x * canvas.width, y: r.y * canvas.height, w: r.w * canvas.width, h: r.h * canvas.height });

  if (template) {
    // Photos either show through see-through holes in the artwork (drawn
    // behind it) or sit on top of it, depending on how the theme was set up.
    const art = await loadImage(template.image);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!template.photosBehind) ctx.drawImage(art, 0, 0, canvas.width, canvas.height);
    geometry.photoRects.forEach((r, i) => {
      if (photos[i]) drawAspectFill(ctx, photos[i], toPx(r));
    });
    if (template.photosBehind) ctx.drawImage(art, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = frameColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    geometry.photoRects.forEach((r, i) => {
      const rect = toPx(r);
      if (photos[i]) {
        drawAspectFill(ctx, photos[i], rect);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      ctx.lineWidth = layout ? 2 : 7;
      ctx.strokeStyle = layout ? '#ffffff' : frameColor;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    });

    for (const sticker of stickers) {
      const img = await loadImage(sticker.src);
      const w = canvas.width * sticker.width;
      const h = w * (img.naturalHeight / img.naturalWidth);
      ctx.save();
      ctx.translate(canvas.width * sticker.centerX, canvas.height * sticker.centerY);
      ctx.rotate((sticker.rotation * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The photo strip could not be converted to JPEG.'))), 'image/jpeg', 0.95),
  );
}
