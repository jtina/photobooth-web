import {
  CAPTURE_COUNT,
  COUNTDOWN_SECONDS,
  FILTERS,
  FRAME_COLORS,
  MULTI_FRAME_LAYOUTS,
  frameGeometry,
  photoCountFor,
} from './config.js';
import { applyFilter, renderPhotoStrip } from './render.js';
import { CameraSession, buildSelectedVideo, extensionFor } from './media.js';
import { ensureAuthenticated, makeSessionID, uploadMedia, uploadsConfigured } from './upload.js';
import { addCustomStickers, deleteCustomSticker, listCustomStickers } from './sticker-store.js';
import { canReadClipboard, onPasteImages, readClipboardImages } from './clipboard.js';
import { SETTINGS_PIN, countdownTickMs, loadSettings, prepareStartImage, setSetting, settings, startScreenImage } from './settings.js';
import {
  MAX_THEME_PHOTOS,
  deleteTheme,
  draftFromFile,
  draftFromTheme,
  listThemes,
  rectsForCount,
  saveTheme,
} from './theme-store.js';

// ---------------------------------------------------------------------------
// Tiny DOM helper
// ---------------------------------------------------------------------------

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'html') el.innerHTML = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const ICONS = {
  camera: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"/></svg>',
  cameraRotate: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 4.5a5 5 0 0 1 4.6 3H18l-2.5 3-2.5-3h1.4A3.2 3.2 0 0 0 9 11.2l-1.3-.9A5 5 0 0 1 12 7.5Zm-4.5 4 2.5 3H8.6a3.2 3.2 0 0 0 5.4 1.3l1.3.9A5 5 0 0 1 7.4 14.5H6l2.5-3Z"/></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M19 12H5m6-7-7 7 7 7"/></svg>',
  arrowRight: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m-6-7 7 7-7 7"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="m15 5-7 7 7 7"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M4 4v6h6M5.5 15a7.5 7.5 0 1 0 1.8-7.8L4 10"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 2.5 11.8 8l5.7 1.8-5.7 1.8L10 17.3l-1.8-5.7-5.7-1.8L8.2 8 10 2.5Zm8 10 .9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z"/></svg>',
  videoSlash: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M15 10l6-3v10l-2-1M4 6h9a2 2 0 0 1 2 2v8M15 18H4a2 2 0 0 1-2-2V8"/></svg>',
  paste: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 4H6.5A1.5 1.5 0 0 0 5 5.5v14A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-14A1.5 1.5 0 0 0 17.5 4H15M9 3h6v3H9zM9 11h6M9 15h4"/></svg>',
  cog: '<svg viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.8a7 7 0 0 1 0 1.9l2 1.8-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6a7 7 0 0 1-1.7-.9l-2.5.9-1.7-2.9 2-1.8a7 7 0 0 1 0-1.9l-2-1.8 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9L10.3 2Zm1.7 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/></svg>',
  qr: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h8v8H3V3Zm2 2v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 13h8v8H3v-8Zm2 2v4h4v-4H5Zm8-2h2v2h-2v-2Zm2 2h2v2h-2v-2Zm2-2h4v2h-4v-2Zm2 4h2v4h-4v-2h2v-2Zm-6 2h2v2h-2v-2Z"/></svg>',
};

const icon = (name) => h('span', { class: 'icon', html: ICONS[name] });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

/** @type {{canvas: HTMLCanvasElement, url: string, clip: Promise<Blob|null>}[]} */
const session = {
  frameColor: '#000000',
  template: null,
  layout: null,
  facing: 'user',
  captureFacing: 'user',
  photos: [],
  selected: [],
  filter: 'normal',
  filterCache: new Map(),
  stickers: [],
};

function clearPhotos() {
  session.photos.forEach((p) => URL.revokeObjectURL(p.url));
  session.filterCache.forEach((entries) => entries.forEach((e) => e && URL.revokeObjectURL(e.url)));
  session.filterCache.clear();
  session.photos = [];
  session.selected = [];
  session.filter = 'normal';
  session.stickers = [];
}

function resetSession() {
  clearPhotos();
  session.frameColor = '#000000';
  session.template = null;
  session.layout = null;
  session.facing = 'user';
}

const hasPhotos = () => session.photos.length > 0;
const maxSelections = () => photoCountFor(session);

function canvasToURL(canvas) {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(URL.createObjectURL(blob)), 'image/jpeg', 0.92),
  );
}

/** Filtered copy of photo `index`; cached per filter. */
async function filteredPhoto(filterId, index) {
  const photo = session.photos[index];
  if (filterId === 'normal') return photo;
  if (!session.filterCache.has(filterId)) session.filterCache.set(filterId, []);
  const cache = session.filterCache.get(filterId);
  if (!cache[index]) {
    const canvas = applyFilter(filterId, photo.canvas);
    cache[index] = { canvas, url: await canvasToURL(canvas) };
  }
  return cache[index];
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const stage = document.getElementById('stage');
const stack = [];
let current = null;

const screens = {};

function render() {
  current?.cleanup?.();
  const name = stack[stack.length - 1];
  const screen = screens[name]();
  current = screen;
  stage.replaceChildren(screen.el);
}

const nav = {
  push(name) {
    stack.push(name);
    render();
  },
  replace(name) {
    stack.pop();
    stack.push(name);
    render();
  },
  back() {
    if (stack.length > 1) stack.pop();
    render();
  },
  /** Pops back to an existing screen, or pushes it if it is not in the stack. */
  popTo(name) {
    const index = stack.lastIndexOf(name);
    if (index === -1) return nav.push(name);
    stack.length = index + 1;
    render();
  },
  restart() {
    resetSession();
    stack.length = 0;
    stack.push('start');
    render();
  },
};

/** After a frame change, keep the selection only as long as the new frame allows. */
function goToSelection() {
  session.selected = session.selected.slice(0, maxSelections());
  nav.popTo('selection');
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** The Back button: always the rounded pill at the bottom left of a screen. */
function backButton(onClick = () => nav.back()) {
  return h('button', { class: 'pill back', onClick }, 'Back');
}

/** Print options page, unless it is turned off in Settings. */
function goToPrint() {
  nav.push(settings.showPrintPage ? 'print' : 'printing');
}

function pillButton(label, onClick, { cls = '', disabled = false } = {}) {
  return h('button', { class: `pill ${cls}`, onClick, disabled }, label);
}

/** Fits an aspect ratio inside a box. */
function fit(aspect, maxW, maxH) {
  const width = Math.min(maxW, maxH * aspect);
  return { width, height: width / aspect };
}

/**
 * DOM preview of the current frame. Photo windows are positioned with the same
 * normalized rects the renderer uses, so the preview matches the final image.
 */
function framePreview({ maxW, maxH, photos = [], showTemplate = true, color = session.frameColor, layout = session.layout, template = session.template }) {
  const tpl = template;
  const geometry = frameGeometry({ layout, template: tpl });
  const size = fit(geometry.width / geometry.height, maxW, maxH);
  const el = h('div', {
    class: 'frame-preview',
    style: { width: `${size.width}px`, height: `${size.height}px`, background: tpl ? '#fff' : color },
  });
  geometry.photoRects.forEach((r, i) => {
    el.append(
      h(
        'div',
        {
          class: 'photo-window',
          style: { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` },
        },
        photos[i] ? h('img', { src: photos[i], alt: '' }) : null,
      ),
    );
  });
  if (tpl && showTemplate) {
    const art = h('img', { class: 'template-overlay', src: tpl.image, alt: '' });
    // Photos behind the artwork show through its see-through windows.
    if (tpl.photosBehind) el.append(art);
    else el.prepend(art);
  }
  return { el, size };
}

// ---------------------------------------------------------------------------
// Start (ContentView)
// ---------------------------------------------------------------------------

screens.start = () => {
  // The whole screen starts a session (custom start photos may put their
  // START button anywhere). The cog opens Settings behind a PIN.
  const el = h(
    'div',
    { class: 'screen start-screen' },
    h('img', { class: 'start-image', src: startScreenImage(), alt: 'MiKi Booth' }),
    h('button', {
      class: 'start-hotspot',
      'aria-label': 'Start',
      onClick: () => {
        resetSession();
        nav.push('format');
      },
    }),
    h('button', { class: 'settings-cog', 'aria-label': 'Settings', onClick: () => nav.push('pin') }, icon('cog')),
  );
  return { el };
};

// ---------------------------------------------------------------------------
// Format selection (FormatSelectionView)
// ---------------------------------------------------------------------------

screens.format = () => {
  const card = (src, label, onClick) =>
    h('button', { class: 'format-card', onClick, 'aria-label': label }, h('img', { src, alt: label }));

  const el = h(
    'div',
    { class: 'screen pink-bg format-screen' },
    h(
      'div',
      { class: 'format-cards' },
      card('assets/format-photostrip.png', 'Photo Strip', () => {
        session.layout = null;
        nav.push('frame');
      }),
      card('assets/format-multiframe.png', 'Multi-Frame', () => nav.push('multiframe')),
    ),
    h('div', { class: 'bottom-bar edge' }, backButton()),
  );
  return { el };
};

// ---------------------------------------------------------------------------
// Multi-frame layout picker (MultiFrameView)
// ---------------------------------------------------------------------------

screens.multiframe = () => {
  const cards = MULTI_FRAME_LAYOUTS.map((layout) => {
    const { el: preview } = framePreview({ maxW: 330, maxH: 230, layout, template: null });
    return h(
      'button',
      {
        class: 'layout-card',
        onClick: () => {
          session.layout = layout;
          session.template = null;
          nav.push('frame');
        },
      },
      h('div', { class: 'layout-preview' }, preview),
      h(
        'div',
        { class: 'layout-text' },
        h('div', { class: 'layout-name' }, layout.name),
        h('div', { class: 'layout-count' }, `${layout.photoRects.length} photos`),
      ),
    );
  });

  const el = h(
    'div',
    { class: 'screen pink-bg' },
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-title-row' }, h('h1', { class: 'title' }, 'Multi-Frame')),
      h('div', { class: 'subtitle center' }, 'Choose Your Layout'),
      h('div', { class: 'layout-grid' }, cards),
      h('div', { class: 'bottom-bar' }, backButton()),
    ),
  );
  return { el };
};

// ---------------------------------------------------------------------------
// Frame editor: camera, color and theme (PhotoStripView)
// ---------------------------------------------------------------------------

screens.frame = () => {
  let tab = session.template ? 'theme' : 'color';
  let disposed = false;
  const previewArea = h('div', { class: 'frame-edit-preview' });
  const controls = h('div', { class: 'frame-edit-controls' });

  const renderPreview = () => {
    previewArea.replaceChildren();
    if (session.layout && !session.template) {
      previewArea.append(framePreview({ maxW: 430, maxH: 470 }).el);
    } else if (session.template) {
      previewArea.append(framePreview({ maxW: 430, maxH: 500 }).el);
    } else {
      const left = framePreview({ maxW: 150, maxH: 450 }).el;
      const right = framePreview({ maxW: 150, maxH: 450 }).el;
      left.style.transform = 'rotate(-7deg)';
      right.style.transform = 'rotate(8deg)';
      previewArea.append(h('div', { class: 'strip-pair' }, left, right));
    }
  };

  const toggle = (label, iconName, active, onClick) =>
    h('button', { class: `toggle ${active ? 'active' : ''}`, onClick }, iconName ? icon(iconName) : null, label);

  // Themes are added from the iPad's photos and saved on the device. Photo
  // strips and multi-frame prints each have their own list of themes.
  const themeKind = session.layout ? 'multi' : 'strip';
  const themeGrid = h('div', { class: 'template-grid' });
  const themeInput = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
  const addThemeTile = h(
    'button',
    { class: 'template-card add-theme', onClick: () => themeInput.click() },
    h('div', { class: 'template-thumb add-theme-thumb' }, h('span', { class: 'add-plus' }, '+')),
    h('div', { class: 'template-name' }, 'Add Theme'),
    h('div', { class: 'template-count' }, 'from Photos'),
  );
  const pasteThemeTile = h(
    'button',
    {
      class: 'template-card add-theme',
      onClick: async () => {
        try {
          startTheme((await readClipboardImages('Pasted Theme'))[0]);
        } catch (error) {
          alert(error.message);
        }
      },
    },
    h('div', { class: 'template-thumb add-theme-thumb' }, h('span', { class: 'icon paste-icon', html: ICONS.paste })),
    h('div', { class: 'template-name' }, 'Paste Theme'),
    h('div', { class: 'template-count' }, 'copied image'),
  );

  async function startTheme(file) {
    if (!file || addThemeTile.disabled) return;
    addThemeTile.disabled = pasteThemeTile.disabled = true;
    try {
      session.themeDraft = await draftFromFile(file, themeKind);
      if (!disposed) nav.push('themeEditor');
    } catch (error) {
      alert(error.message ?? 'That image could not be used as a theme.');
    } finally {
      addThemeTile.disabled = pasteThemeTile.disabled = false;
    }
  }

  themeInput.addEventListener('change', () => {
    const file = themeInput.files[0];
    themeInput.value = '';
    startTheme(file);
  });

  // Ctrl+V / ⌘V with an image starts a new theme.
  const stopPaste = onPasteImages('Pasted Theme', (files) => {
    startTheme(files[0]);
  });

  async function refreshThemes() {
    const themes = (await listThemes()).filter((t) => t.kind === themeKind);
    if (disposed) return;
    themeGrid.replaceChildren(
      themeInput,
      addThemeTile,
      canReadClipboard ? pasteThemeTile : null,
      ...themes.map((theme) =>
        h(
          'div',
          { class: 'template-card-wrap' },
          h(
            'button',
            {
              class: `template-card ${session.template?.id === theme.id ? 'selected' : ''}`,
              onClick: () => {
                session.template = theme;
                renderPreview();
                refreshThemes();
              },
            },
            h('div', { class: 'template-thumb' }, h('img', { src: theme.image, alt: '' })),
            h('div', { class: 'template-name' }, theme.name),
            h('div', { class: 'template-count' }, `${theme.photoCount} photo${theme.photoCount === 1 ? '' : 's'}`),
          ),
          h(
            'button',
            {
              class: 'theme-edit',
              onClick: () => {
                session.themeDraft = draftFromTheme(theme);
                nav.push('themeEditor');
              },
            },
            'Edit',
          ),
        ),
      ),
    );
    if (!themes.length) {
      themeGrid.append(
        h('div', { class: 'sticker-hint' }, `Tap “Add Theme” to choose your ${themeKind === 'multi' ? 'multi-frame' : 'photo strip'} artwork from Photos, or copy it and tap “Paste Theme”. PNGs with see-through photo windows work best.`),
      );
    }
  }

  const renderControls = () => {
    controls.replaceChildren();

    if (!hasPhotos()) {
      controls.append(
        h(
          'div',
          { class: 'camera-choice' },
          h('div', { class: 'control-label' }, 'Camera'),
          h(
            'div',
            { class: 'toggle-row small' },
            toggle('Front', 'camera', session.facing === 'user', () => {
              session.facing = 'user';
              renderControls();
            }),
            toggle('Rear', 'cameraRotate', session.facing === 'environment', () => {
              session.facing = 'environment';
              renderControls();
            }),
          ),
        ),
      );
    }

    controls.append(
      h(
        'div',
        { class: 'toggle-row tabs' },
        toggle('Color', null, tab === 'color', () => {
          tab = 'color';
          renderControls();
        }),
        toggle('Theme', null, tab === 'theme', () => {
          tab = 'theme';
          renderControls();
        }),
      ),
    );

    if (tab === 'color') {
      const swatches = FRAME_COLORS.map((color) => {
        const selected = !session.template && sameColor(color, session.frameColor);
        return h(
          'button',
          {
            class: 'swatch',
            style: { background: color },
            'aria-label': color,
            onClick: () => {
              session.frameColor = color;
              session.template = null;
              renderPreview();
              renderControls();
            },
          },
          selected ? h('span', { class: `swatch-check ${color === '#000000' ? 'on-dark' : ''}` }, icon('check')) : null,
        );
      });
      const picker = h('input', {
        type: 'color',
        class: 'color-input',
        value: toHex(session.frameColor),
        'aria-label': 'Custom color',
      });
      picker.addEventListener('input', () => {
        session.frameColor = picker.value;
        session.template = null;
        renderPreview();
      });
      picker.addEventListener('change', renderControls);
      controls.append(
        h('div', { class: 'swatch-grid' }, swatches),
        h('label', { class: 'swatch custom-swatch' }, picker, h('span', { class: 'rainbow' })),
      );
    } else {
      controls.append(themeGrid);
      refreshThemes();
    }
  };

  renderPreview();
  renderControls();

  const el = h(
    'div',
    { class: 'screen pink-bg' },
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-header' }, h('h1', { class: 'title' }, 'Edit your Frame')),
      h('div', { class: 'divider' }),
      h('div', { class: 'frame-edit-body' }, previewArea, controls),
      h(
        'div',
        { class: 'bottom-bar' },
        backButton(),
        h('div', { class: 'spacer' }),
        pillButton('Next', () => {
          if (hasPhotos()) goToSelection();
          else nav.push('camera');
        }),
      ),
    ),
  );
  return {
    el,
    cleanup() {
      disposed = true;
      stopPaste();
    },
  };
};

function toHex(color) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = color;
  return ctx.fillStyle.startsWith('#') ? ctx.fillStyle : '#000000';
}

function sameColor(a, b) {
  return toHex(a) === toHex(b);
}

// ---------------------------------------------------------------------------
// Theme setup: choose how many photos and line each photo window up with the
// artwork. Drag a window to move it, drag its corners to resize it, and use
// the arrow pad for fine adjustments. Saved on the device.
// ---------------------------------------------------------------------------

screens.themeEditor = () => {
  const draft = session.themeDraft;
  const isNew = !draft.id;
  let selected = 0;
  let zoom = 1;
  let disposed = false;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const MIN = 0.03;

  function constrain(r) {
    r.w = clamp(r.w, MIN, 1.04);
    r.h = clamp(r.h, MIN, 1.04);
    r.x = clamp(r.x, -0.02, 1.02 - r.w);
    r.y = clamp(r.y, -0.02, 1.02 - r.h);
  }

  // Workspace -------------------------------------------------------------
  const workspace = h('div', { class: 'theme-workspace' });
  let artStage = null;
  const windowEls = [];
  const boxEls = [];

  // Real photos make alignment easier; otherwise use numbered samples.
  const sample = (i) =>
    session.photos[i % Math.max(1, session.photos.length)]?.url
      ? h('img', { src: session.photos[i % session.photos.length].url, alt: '' })
      : h('div', { class: 'sample-photo' }, String(i + 1));

  function buildStage() {
    const size = fit(draft.imageWidth / draft.imageHeight, 520 * zoom, 560 * zoom);
    artStage = h('div', { class: 'art-stage', style: { width: `${size.width}px`, height: `${size.height}px` } });
    const art = h('img', { class: 'art-image', src: draft.src, alt: '', draggable: 'false' });
    const photoLayer = h('div', { class: 'art-layer' });
    const boxLayer = h('div', { class: 'art-layer boxes' });
    windowEls.length = 0;
    boxEls.length = 0;
    draft.photoRects.forEach((_, i) => {
      const win = h('div', { class: 'photo-window' }, sample(i));
      windowEls.push(win);
      photoLayer.append(win);
      const box = h(
        'div',
        { class: 'win-box' },
        h('span', { class: 'win-label' }, String(i + 1)),
        ['nw', 'ne', 'sw', 'se'].map((corner) => h('span', { class: `handle ${corner}`, 'data-corner': corner })),
      );
      box.dataset.index = i;
      attachDrag(box);
      boxEls.push(box);
      boxLayer.append(box);
    });
    if (draft.photosBehind) artStage.append(photoLayer, art, boxLayer);
    else artStage.append(art, photoLayer, boxLayer);
    workspace.replaceChildren(h('div', { class: 'art-scroll-inner' }, artStage));
    positionAll();
  }

  function positionAll() {
    draft.photoRects.forEach((r, i) => {
      for (const el of [windowEls[i], boxEls[i]]) {
        if (!el) continue;
        el.style.left = `${r.x * 100}%`;
        el.style.top = `${r.y * 100}%`;
        el.style.width = `${r.w * 100}%`;
        el.style.height = `${r.h * 100}%`;
      }
      boxEls[i]?.classList.toggle('selected', i === selected);
    });
    selectedLabel.textContent = `Photo ${selected + 1} of ${draft.photoRects.length}`;
  }

  function attachDrag(box) {
    let start = null;
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selected = Number(box.dataset.index);
      positionAll();
      box.setPointerCapture(e.pointerId);
      start = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        rect: { ...draft.photoRects[selected] },
        bounds: artStage.getBoundingClientRect(),
        corner: e.target.dataset.corner ?? null,
      };
    });
    box.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = (e.clientX - start.x) / start.bounds.width;
      const dy = (e.clientY - start.y) / start.bounds.height;
      const s = start.rect;
      const r = draft.photoRects[selected];
      if (!start.corner) {
        r.x = s.x + dx;
        r.y = s.y + dy;
      } else {
        const right = s.x + s.w;
        const bottom = s.y + s.h;
        if (start.corner.includes('w')) {
          r.x = Math.min(s.x + dx, right - MIN);
          r.w = right - r.x;
        } else {
          r.w = s.w + dx;
        }
        if (start.corner.includes('n')) {
          r.y = Math.min(s.y + dy, bottom - MIN);
          r.h = bottom - r.y;
        } else {
          r.h = s.h + dy;
        }
      }
      constrain(r);
      positionAll();
    });
    const end = (e) => {
      if (start && e.pointerId === start.id) start = null;
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
  }

  // Controls ---------------------------------------------------------------
  const nameInput = h('input', { class: 'text-input', type: 'text', value: draft.name, maxlength: '40', 'aria-label': 'Theme name' });
  nameInput.addEventListener('input', () => (draft.name = nameInput.value));

  const countValue = h('div', { class: 'stepper-value' });
  const setCount = (n) => {
    n = clamp(n, 1, MAX_THEME_PHOTOS);
    if (n === draft.photoRects.length) return;
    draft.photoRects = rectsForCount(draft, n, draft.photoRects);
    selected = Math.min(selected, n - 1);
    countValue.textContent = String(n);
    buildStage();
  };
  countValue.textContent = String(draft.photoRects.length);

  const layerRow = h('div', { class: 'toggle-row small' });
  const drawLayerRow = () =>
    layerRow.replaceChildren(
      h('button', { class: `toggle ${draft.photosBehind ? 'active' : ''}`, onClick: () => setBehind(true) }, 'Behind frame'),
      h('button', { class: `toggle ${!draft.photosBehind ? 'active' : ''}`, onClick: () => setBehind(false) }, 'On top of frame'),
    );
  const setBehind = (value) => {
    draft.photosBehind = value;
    drawLayerRow();
    buildStage();
  };
  drawLayerRow();

  const zoomRow = h('div', { class: 'toggle-row small' });
  const drawZoomRow = () =>
    zoomRow.replaceChildren(
      ...[1, 2, 3].map((z) =>
        h('button', { class: `toggle ${zoom === z ? 'active' : ''}`, onClick: () => { zoom = z; drawZoomRow(); buildStage(); } }, `${z}×`),
      ),
    );
  drawZoomRow();

  // Hold-to-repeat buttons for fine alignment.
  const STEP = 0.002;
  const repeatButton = (label, aria, fn) => {
    const button = h('button', { class: 'nudge', 'aria-label': aria }, label);
    let timer = null;
    const stop = () => {
      clearTimeout(timer);
      clearInterval(timer);
      timer = null;
    };
    const apply = () => {
      const r = draft.photoRects[selected];
      fn(r);
      constrain(r);
      positionAll();
    };
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      apply();
      timer = setTimeout(() => (timer = setInterval(apply, 50)), 350);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => button.addEventListener(t, stop));
    return button;
  };
  const selectedLabel = h('div', { class: 'control-label left' });

  const movePad = h(
    'div',
    { class: 'nudge-pad' },
    h('span'),
    repeatButton('↑', 'Move up', (r) => (r.y -= STEP)),
    h('span'),
    repeatButton('←', 'Move left', (r) => (r.x -= STEP)),
    h('span', { class: 'nudge-caption' }, 'Move'),
    repeatButton('→', 'Move right', (r) => (r.x += STEP)),
    h('span'),
    repeatButton('↓', 'Move down', (r) => (r.y += STEP)),
    h('span'),
  );
  const sizePad = h(
    'div',
    { class: 'nudge-pad' },
    h('span'),
    repeatButton('+', 'Taller', (r) => { r.y -= STEP / 2; r.h += STEP; }),
    h('span'),
    repeatButton('−', 'Narrower', (r) => { r.x += STEP / 2; r.w -= STEP; }),
    h('span', { class: 'nudge-caption' }, 'Size'),
    repeatButton('+', 'Wider', (r) => { r.x -= STEP / 2; r.w += STEP; }),
    h('span'),
    repeatButton('−', 'Shorter', (r) => { r.y += STEP / 2; r.h -= STEP; }),
    h('span'),
  );

  const prevNext = h(
    'div',
    { class: 'toggle-row small' },
    h('button', { class: 'toggle', onClick: () => { selected = (selected - 1 + draft.photoRects.length) % draft.photoRects.length; positionAll(); } }, '‹ Prev'),
    h('button', {
      class: 'toggle',
      onClick: () => {
        // Copy the selected window's size to all the others.
        const s = draft.photoRects[selected];
        draft.photoRects.forEach((r) => { r.w = s.w; r.h = s.h; constrain(r); });
        positionAll();
      },
    }, 'Same size all'),
    h('button', { class: 'toggle', onClick: () => { selected = (selected + 1) % draft.photoRects.length; positionAll(); } }, 'Next ›'),
  );

  async function save() {
    if (!draft.name.trim()) draft.name = 'My Theme';
    try {
      session.template = await saveTheme(draft);
      if (!disposed) nav.back();
    } catch (error) {
      alert(`The theme could not be saved: ${error.message ?? error}`);
    }
  }

  async function remove() {
    if (!confirm('Delete this theme from the iPad?')) return;
    await deleteTheme(draft.id);
    if (session.template?.id === draft.id) session.template = null;
    if (!disposed) nav.back();
  }

  const el = h(
    'div',
    { class: 'screen pink-bg' },
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-header' }, h('h1', { class: 'title' }, isNew ? 'Set Up Your Theme' : 'Edit Theme')),
      h('div', { class: 'divider' }),
      h(
        'div',
        { class: 'theme-editor-body' },
        workspace,
        h(
          'div',
          { class: 'theme-controls' },
          h('label', { class: 'field' }, h('span', { class: 'control-label left' }, 'Name'), nameInput),
          h(
            'div',
            { class: 'field-row' },
            h('span', { class: 'control-label left' }, 'Number of photos'),
            h(
              'div',
              { class: 'stepper' },
              h('button', { class: 'stepper-btn', 'aria-label': 'Fewer photos', onClick: () => setCount(draft.photoRects.length - 1) }, '−'),
              countValue,
              h('button', { class: 'stepper-btn', 'aria-label': 'More photos', onClick: () => setCount(draft.photoRects.length + 1) }, '+'),
            ),
          ),
          h('div', { class: 'field' }, h('span', { class: 'control-label left' }, 'Photos go'), layerRow),
          h('div', { class: 'field' }, selectedLabel, prevNext, h('div', { class: 'nudge-row' }, movePad, sizePad)),
          h('div', { class: 'field-row' }, h('span', { class: 'control-label left' }, 'Zoom'), zoomRow),
        ),
      ),
      h(
        'div',
        { class: 'bottom-bar' },
        pillButton('Cancel', () => nav.back()),
        isNew ? null : h('button', { class: 'pill', onClick: remove }, icon('trash'), 'Delete'),
        h('div', { class: 'spacer' }),
        h('div', { class: 'editor-tip' }, 'Drag a box to move it · drag its corners to resize'),
        h('div', { class: 'spacer' }),
        pillButton('Save Theme', save, { cls: 'soft wide' }),
      ),
    ),
  );

  buildStage();

  return {
    el,
    cleanup() {
      disposed = true;
      if (isNew) URL.revokeObjectURL(draft.src);
    },
  };
};

// ---------------------------------------------------------------------------
// Camera (CameraView)
// ---------------------------------------------------------------------------

screens.camera = () => {
  clearPhotos();
  session.captureFacing = session.facing;
  const camera = new CameraSession(session.facing);
  let cancelled = false;

  const countdownEl = h('div', { class: 'countdown' }, String(COUNTDOWN_SECONDS));
  const counterEl = h('div', { class: 'shot-counter' }, `1 / ${CAPTURE_COUNT}`);
  const video = h('video', { class: `camera-video ${camera.mirrored ? 'mirrored' : ''}`, autoplay: true, muted: true, playsinline: true });
  const still = h('img', { class: 'camera-still hidden', alt: '' });
  const capturing = h('div', { class: 'white-cover hidden' });
  const flash = h('div', { class: 'flash' });
  const errorBox = h('div', { class: 'camera-error hidden' });

  const showError = (message) => {
    errorBox.replaceChildren(
      h('span', { class: 'icon big', html: ICONS.camera }),
      h('div', { class: 'error-title' }, 'Camera Error'),
      h('div', { class: 'error-text' }, message),
      pillButton('Try Again', () => nav.replace('camera'), { cls: 'small' }),
    );
    errorBox.classList.remove('hidden');
  };

  const guard = () => {
    if (cancelled) throw new Error('cancelled');
  };

  async function run() {
    await camera.start(video);
    guard();
    for (let shot = 0; shot < CAPTURE_COUNT; shot++) {
      counterEl.textContent = `${shot + 1} / ${CAPTURE_COUNT}`;
      still.classList.add('hidden');
      const clip = camera.startClip();
      for (let n = COUNTDOWN_SECONDS; n >= 1; n--) {
        countdownEl.textContent = String(n);
        await sleep(countdownTickMs());
        guard();
      }
      countdownEl.textContent = '0';

      capturing.classList.remove('hidden');
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.classList.add('go');
      const canvas = camera.capturePhoto();
      camera.stopClip();
      const url = await canvasToURL(canvas);
      guard();
      session.photos.push({ canvas, url, clip });
      still.src = url;
      still.classList.remove('hidden');
      capturing.classList.add('hidden');
      await sleep(shot < CAPTURE_COUNT - 1 ? 2000 : 2500);
      guard();
    }
    camera.stop();
    nav.replace('selection');
  }

  run().catch((error) => {
    if (cancelled) return;
    camera.stop();
    showError(error.message ?? String(error));
  });

  const el = h(
    'div',
    { class: 'screen pink-bg camera-screen' },
    h('div', { class: 'camera-hud' }, countdownEl, h('div', { class: 'spacer' }), counterEl),
    h('div', { class: 'camera-frame' }, video, still, capturing, flash, errorBox),
    h('div', { class: 'bottom-bar edge' }, backButton()),
  );

  return {
    el,
    cleanup() {
      cancelled = true;
      camera.stop();
    },
  };
};

// ---------------------------------------------------------------------------
// Photo selection (PhotoSelectionView)
// ---------------------------------------------------------------------------

screens.selection = () => {
  const counter = h('div', { class: 'subtitle center' });
  const previewArea = h('div', { class: 'selection-preview' });
  const grid = h('div', { class: 'photo-grid' });
  const nextButton = session.template
    ? pillButton('Next', () => goToPrint(), { cls: 'soft' })
    : pillButton('Edit PhotoStrip', () => {
        session.filter = 'normal';
        session.stickers = [];
        nav.push('stickers');
      }, { cls: 'soft wide' });

  const update = () => {
    counter.textContent = `${session.selected.length} / ${maxSelections()} selected`;
    const urls = session.selected.map((i) => session.photos[i].url);
    previewArea.replaceChildren(
      session.layout
        ? framePreview({ maxW: 300, maxH: 600, photos: urls }).el
        : framePreview({ maxW: session.template ? 300 : 200, maxH: 600, photos: urls }).el,
    );
    grid.replaceChildren(
      ...session.photos.map((photo, index) => {
        const order = session.selected.indexOf(index);
        return h(
          'button',
          { class: `photo-cell ${order >= 0 ? 'selected' : ''}`, onClick: () => toggle(index) },
          h('img', { src: photo.url, alt: `Photo ${index + 1}` }),
          order >= 0 ? h('span', { class: 'order-badge' }, String(order + 1)) : null,
        );
      }),
    );
    nextButton.disabled = session.selected.length === 0;
  };

  const toggle = (index) => {
    const at = session.selected.indexOf(index);
    if (at >= 0) session.selected.splice(at, 1);
    else if (session.selected.length < maxSelections()) session.selected.push(index);
    update();
  };

  update();

  const el = h(
    'div',
    { class: 'screen pink-bg selection-screen' },
    h('h1', { class: 'title hot center' }, 'Select Your Photos'),
    counter,
    h('div', { class: 'selection-body' }, previewArea, grid),
    h(
      'div',
      { class: 'bottom-bar' },
      h('button', { class: 'pill', onClick: () => nav.replace('camera') }, icon('redo'), 'Redo Photos'),
      pillButton('Change Your Frame', () => nav.push('format')),
      pillButton('Change Your Theme', () => nav.push('frame')),
      h('div', { class: 'spacer' }),
      nextButton,
    ),
  );
  return { el };
};

// ---------------------------------------------------------------------------
// Stickers and filters (StickerEditorView)
// ---------------------------------------------------------------------------

let stickerManifest = null;
async function loadStickers() {
  if (!stickerManifest) {
    stickerManifest = fetch('stickers.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((names) =>
        names
          .slice()
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
          .map((name) => ({ name: name.replace(/\.[^.]+$/, ''), src: `assets/stickers/${encodeURIComponent(name)}` })),
      )
      .catch(() => []);
  }
  return stickerManifest;
}

screens.stickers = () => {
  const isMulti = !!session.layout;
  let selectedId = null;
  let disposed = false;

  const filterName = h('div', { class: 'filter-name' });
  const canvasHolder = h('div', { class: 'sticker-canvas-holder' });
  const picker = h('div', { class: `sticker-picker ${isMulti ? 'compact' : ''}` });
  const deleteButton = h(
    'button',
    { class: 'pill hidden', onClick: () => deleteSelected() },
    icon('trash'),
    'Delete Sticker',
  );

  // The canvas is a frame preview with stickers layered on top.
  let canvasEl = null;
  const stickerEls = new Map();

  async function renderCanvas() {
    const filterId = session.filter;
    filterName.textContent = FILTERS.find((f) => f.id === filterId).name;
    const photos = await Promise.all(session.selected.map((i) => filteredPhoto(filterId, i)));
    if (disposed || filterId !== session.filter) return;
    const { el } = framePreview({ maxW: isMulti ? 300 : 200, maxH: 520, photos: photos.map((p) => p.url), template: null });
    el.classList.add('sticker-canvas');
    canvasEl = el;
    attachGestures(el);
    stickerEls.clear();
    session.stickers.forEach((s) => el.append(stickerElement(s)));
    canvasHolder.replaceChildren(el);
    refreshSelection();
  }

  function stickerElement(sticker) {
    const img = h('img', { class: 'placed-sticker', src: sticker.src, alt: '', draggable: 'false' });
    img.dataset.id = sticker.id;
    stickerEls.set(sticker.id, img);
    positionSticker(sticker);
    return img;
  }

  function positionSticker(sticker) {
    const img = stickerEls.get(sticker.id);
    if (!img) return;
    img.style.left = `${sticker.centerX * 100}%`;
    img.style.top = `${sticker.centerY * 100}%`;
    img.style.width = `${sticker.width * 100}%`;
    img.style.transform = `translate(-50%, -50%) rotate(${sticker.rotation}deg)`;
  }

  function refreshSelection() {
    stickerEls.forEach((img, id) => img.classList.toggle('selected', id === selectedId));
    deleteButton.classList.toggle('hidden', !selectedId);
  }

  function select(id) {
    selectedId = id;
    // Bring the selected sticker to the front (like the iOS editor).
    const index = session.stickers.findIndex((s) => s.id === id);
    if (index >= 0) {
      const [s] = session.stickers.splice(index, 1);
      session.stickers.push(s);
      stickerEls.get(id)?.parentElement?.append(stickerEls.get(id));
    }
    refreshSelection();
  }

  function addSticker(asset) {
    const count = session.stickers.length;
    const sticker = {
      id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()),
      src: asset.src,
      centerX: Math.min(0.5 + count * 0.04, 0.66),
      centerY: 0.5,
      width: 0.2,
      rotation: 0,
    };
    session.stickers.push(sticker);
    canvasEl?.append(stickerElement(sticker));
    select(sticker.id);
  }

  function deleteSelected() {
    if (!selectedId) return;
    session.stickers = session.stickers.filter((s) => s.id !== selectedId);
    stickerEls.get(selectedId)?.remove();
    stickerEls.delete(selectedId);
    selectedId = null;
    refreshSelection();
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function attachGestures(el) {
    const pointers = new Map();
    let start = null;

    const snapshot = () => {
      const sticker = session.stickers.find((s) => s.id === selectedId);
      if (!sticker) return (start = null);
      const pts = [...pointers.values()];
      const rect = el.getBoundingClientRect();
      start = {
        sticker: { ...sticker },
        rect,
        pts,
        mid: pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0],
        dist: pts.length > 1 ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : 0,
        angle: pts.length > 1 ? Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) : 0,
      };
    };

    el.addEventListener('pointerdown', (e) => {
      const target = e.target.closest('.placed-sticker');
      if (target) select(target.dataset.id);
      else if (pointers.size === 0) {
        selectedId = null;
        refreshSelection();
      }
      if (!selectedId) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      snapshot();
    });

    el.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId) || !start) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const sticker = session.stickers.find((s) => s.id === selectedId);
      if (!sticker) return;
      const pts = [...pointers.values()];
      const { rect } = start;
      if (pts.length === 1) {
        sticker.centerX = clamp(start.sticker.centerX + (pts[0].x - start.mid.x) / rect.width, 0.02, 0.98);
        sticker.centerY = clamp(start.sticker.centerY + (pts[0].y - start.mid.y) / rect.height, 0.01, 0.99);
      } else {
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
        sticker.centerX = clamp(start.sticker.centerX + (mid.x - start.mid.x) / rect.width, 0.02, 0.98);
        sticker.centerY = clamp(start.sticker.centerY + (mid.y - start.mid.y) / rect.height, 0.01, 0.99);
        if (start.dist > 0) sticker.width = clamp(start.sticker.width * (dist / start.dist), 0.05, 0.75);
        sticker.rotation = start.sticker.rotation + ((angle - start.angle) * 180) / Math.PI;
      }
      positionSticker(sticker);
    });

    const end = (e) => {
      if (!pointers.delete(e.pointerId)) return;
      snapshot();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    // Trackpad / mouse: wheel resizes, shift + wheel rotates.
    el.addEventListener(
      'wheel',
      (e) => {
        const sticker = session.stickers.find((s) => s.id === selectedId);
        if (!sticker) return;
        e.preventDefault();
        if (e.shiftKey) sticker.rotation += e.deltaY * 0.2;
        else sticker.width = clamp(sticker.width * Math.exp(-e.deltaY * 0.002), 0.05, 0.75);
        positionSticker(sticker);
      },
      { passive: false },
    );
  }

  function moveFilter(direction) {
    const index = FILTERS.findIndex((f) => f.id === session.filter);
    session.filter = FILTERS[(index + direction + FILTERS.length) % FILTERS.length].id;
    renderCanvas();
  }

  // "Add Stickers" opens the iPad photo picker; chosen images are saved on
  // this device and listed after any stickers bundled in web/assets/stickers.
  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden' });
  const addTile = h(
    'button',
    { class: 'sticker-option add-sticker', onClick: () => fileInput.click() },
    h('span', { class: 'add-plus' }, '+'),
    h('span', { class: 'add-label' }, 'Add Stickers'),
  );
  const pasteTile = h(
    'button',
    {
      class: 'sticker-option add-sticker',
      onClick: async () => {
        try {
          await addStickerFiles(await readClipboardImages('Pasted sticker'));
        } catch (error) {
          alert(error.message);
        }
      },
    },
    h('span', { class: 'icon paste-icon', html: ICONS.paste }),
    h('span', { class: 'add-label' }, 'Paste'),
  );

  async function addStickerFiles(files) {
    if (!files.length) return;
    addTile.disabled = pasteTile.disabled = true;
    const failed = await addCustomStickers(files);
    addTile.disabled = pasteTile.disabled = false;
    if (failed) alert(`${failed} image${failed === 1 ? '' : 's'} could not be added as stickers.`);
    if (!disposed) refreshPicker();
  }

  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    addStickerFiles(files);
  });

  // Ctrl+V / ⌘V with an image adds it as a sticker.
  const stopPaste = onPasteImages('Pasted sticker', addStickerFiles);

  async function removeCustom(asset) {
    if (!confirm('Remove this sticker from the iPad?')) return;
    await deleteCustomSticker(asset.id);
    if (!disposed) refreshPicker();
  }

  async function refreshPicker() {
    const [bundled, custom] = await Promise.all([loadStickers(), listCustomStickers()]);
    if (disposed) return;
    const assets = [...bundled, ...custom];
    picker.replaceChildren(
      fileInput,
      addTile,
      canReadClipboard ? pasteTile : null,
      ...assets.map((asset) =>
        h(
          'div',
          { class: 'sticker-option-wrap' },
          h(
            'button',
            { class: 'sticker-option', 'aria-label': asset.name, onClick: () => addSticker(asset) },
            h('img', { src: asset.src, alt: '', loading: 'lazy' }),
          ),
          asset.custom
            ? h('button', { class: 'sticker-remove', 'aria-label': `Remove ${asset.name}`, onClick: () => removeCustom(asset) }, '×')
            : null,
        ),
      ),
    );
    if (!assets.length) {
      picker.append(
        h(
          'div',
          { class: 'sticker-hint' },
          'Tap “Add Stickers” to choose images from your Photos, or copy an image and tap “Paste”. Transparent PNGs work best.',
        ),
      );
    }
  }

  refreshPicker();

  renderCanvas();

  const arrow = (dir) =>
    h('button', { class: 'filter-arrow', 'aria-label': dir < 0 ? 'Previous filter' : 'Next filter', onClick: () => moveFilter(dir) }, icon(dir < 0 ? 'arrowLeft' : 'arrowRight'));

  const el = h(
    'div',
    { class: 'screen pink-bg' },
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-header' }, h('h1', { class: 'title' }, 'Edit your Frame')),
      h('div', { class: 'divider' }),
      h(
        'div',
        { class: `sticker-body ${isMulti ? 'multi' : ''}` },
        h('div', { class: 'filter-section' }, h('div', { class: 'filter-row' }, arrow(-1), canvasHolder, arrow(1)), filterName),
        picker,
      ),
      h(
        'div',
        { class: 'bottom-bar' },
        backButton(),
        deleteButton,
        h('div', { class: 'spacer' }),
        pillButton('Next', () => goToPrint(), { cls: 'soft' }),
      ),
    ),
  );

  return {
    el,
    cleanup() {
      disposed = true;
      stopPaste();
    },
  };
};

// ---------------------------------------------------------------------------
// Print options (PrintView)
// ---------------------------------------------------------------------------

const printOptions = { standardCopies: 2, miniSheets: 1, combinationSheets: 1 };

screens.print = () => {
  const section = (lines, note, key, values) => {
    const row = h('div', { class: 'option-row' });
    const draw = () =>
      row.replaceChildren(
        ...values.map((v) =>
          h(
            'button',
            {
              class: `option ${printOptions[key] === v ? 'active' : ''}`,
              onClick: () => {
                printOptions[key] = v;
                draw();
              },
            },
            String(v),
          ),
        ),
      );
    draw();
    return h(
      'div',
      { class: 'print-section' },
      lines.map((l) => h('div', { class: 'print-heading' }, l)),
      note ? h('div', { class: 'print-note' }, note) : null,
      row,
    );
  };

  const el = h(
    'div',
    { class: 'screen print-bg print-screen' },
    h('h1', { class: 'title hot center' }, 'Print'),
    h(
      'div',
      { class: 'print-sections' },
      section(['How Many Standard', 'Copies?'], null, 'standardCopies', [2, 4, 6, 8, 10]),
      section(['Additional Mini Strips'], '1 sheet = 8 minis', 'miniSheets', [0, 1, 2]),
      section(['Additional', 'Combination Mini'], '(1 Standard Strip + 4 Minis)', 'combinationSheets', [0, 1, 2]),
    ),
    h('div', { class: 'spacer' }),
    h('div', { class: 'bottom-bar edge' }, backButton(), h('div', { class: 'spacer' }), pillButton('Next', () => nav.push('printing'))),
  );
  return { el };
};

// ---------------------------------------------------------------------------
// Printing / share (PrintingView)
// ---------------------------------------------------------------------------

function qrDataURL(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(8, 0);
}

screens.printing = () => {
  let disposed = false;
  let restartTimer = null;
  const objectURLs = [];

  // With the print page turned off in Settings there is no "Printing...." step.
  const printing = settings.showPrintPage;
  const title = h('div', { class: 'printing-title' }, printing ? 'Printing....' : 'Almost done...');
  const statusLine = h('div', { class: 'printing-status' });

  const qrBox = (label) => {
    const box = h('div', { class: 'qr-box' }, h('div', { class: 'spinner' }));
    return {
      box,
      el: h('div', { class: 'qr-section' }, box, h('div', { class: 'qr-label' }, label)),
      set(url) {
        if (url) {
          box.replaceChildren(h('a', { href: url, target: '_blank', rel: 'noopener' }, h('img', { src: qrDataURL(url), alt: `${label} QR code` })));
        } else {
          box.replaceChildren(h('span', { class: 'icon qr-placeholder', html: ICONS.qr }));
        }
      },
    };
  };
  const videoQR = qrBox('Video');
  const photoQR = qrBox('Photo');

  const videoArea = h(
    'div',
    { class: 'video-preview' },
    h('div', { class: 'video-status' }, h('div', { class: 'spinner' }), h('div', {}, 'Preparing video...')),
  );
  const restartArea = h('div', { class: 'restart-area' });

  const showVideoUnavailable = () =>
    videoArea.replaceChildren(
      h('div', { class: 'video-status' }, h('span', { class: 'icon big', html: ICONS.videoSlash }), h('div', {}, 'Video unavailable')),
    );

  const finish = () => {
    setTimeout(
      () => {
        if (disposed) return;
        title.textContent = 'Done!';
        const button = h('button', { class: 'restart-button', onClick: () => nav.restart() });
        restartArea.replaceChildren(button);
        if (!settings.restartCountdown) {
          button.replaceChildren(icon('redo'), 'Restart');
          return;
        }
        let remaining = 30;
        const label = () => button.replaceChildren(icon('redo'), `Restart (${remaining})`);
        label();
        restartTimer = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) nav.restart();
          else label();
        }, 1000);
      },
      printing ? 3000 : 0,
    );
  };

  async function process() {
    const errors = [];
    const sessionID = makeSessionID();
    const filterId = session.template ? 'normal' : session.filter;
    const indices = session.selected.slice();

    if (uploadsConfigured) ensureAuthenticated().catch(() => {});
    else errors.push('Uploads are off, so there are no QR codes. Add your Supabase details to js/config.js to turn them on.');
    const upload = async (path, blob, type) => {
      if (!uploadsConfigured) return null;
      return uploadMedia(path, blob, type);
    };

    // Photo strip
    try {
      const photos = await Promise.all(indices.map((i) => filteredPhoto(filterId, i)));
      const blob = await renderPhotoStrip({
        photos: photos.map((p) => p.canvas),
        frameColor: session.frameColor,
        template: session.template,
        layout: session.layout,
        stickers: session.template ? [] : session.stickers,
      });
      if (disposed) return;
      try {
        photoQR.set(await upload(`${sessionID}/photo.jpg`, blob, 'image/jpeg'));
      } catch (error) {
        photoQR.set(null);
        errors.push(`Photo upload failed: ${error.message ?? error}`);
      }
    } catch (error) {
      photoQR.set(null);
      errors.push(error.message ?? String(error));
    }
    if (disposed) return;

    // Video: the countdown before each selected photo, at 4× speed.
    try {
      const clips = await Promise.all(indices.map((i) => session.photos[i].clip));
      const video = await buildSelectedVideo(clips, { mirrored: session.captureFacing === 'user' });
      if (disposed) return;
      const url = URL.createObjectURL(video);
      objectURLs.push(url);
      videoArea.replaceChildren(h('video', { src: url, autoplay: true, loop: true, muted: true, playsinline: true }));
      try {
        const ext = extensionFor(video.type);
        videoQR.set(await upload(`${sessionID}/video.${ext}`, video, video.type.split(';')[0]));
      } catch (error) {
        videoQR.set(null);
        errors.push(`Video upload failed: ${error.message ?? error}`);
      }
    } catch (error) {
      if (disposed) return;
      showVideoUnavailable();
      videoQR.set(null);
      errors.push(error.message ?? String(error));
    }

    if (disposed) return;
    if (errors.length) {
      console.warn(errors);
      statusLine.textContent = errors[0];
    }
    finish();
  }

  process();

  const el = h(
    'div',
    { class: 'screen pink-bg' },
    h(
      'div',
      { class: 'panel printing-panel' },
      h('div', { class: 'printing-header' }, videoQR.el, title, photoQR.el),
      h('div', { class: 'divider' }),
      videoArea,
      statusLine,
      h('div', { class: 'spacer' }),
      restartArea,
    ),
  );

  return {
    el,
    cleanup() {
      disposed = true;
      clearInterval(restartTimer);
      objectURLs.forEach((u) => URL.revokeObjectURL(u));
    },
  };
};

// ---------------------------------------------------------------------------
// Settings (behind a PIN, from the cog on the start screen)
// ---------------------------------------------------------------------------

screens.pin = () => {
  let entered = '';
  const dots = h('div', { class: 'pin-dots' });
  const drawDots = () =>
    dots.replaceChildren(...[0, 1, 2, 3].map((i) => h('span', { class: `pin-dot ${i < entered.length ? 'filled' : ''}` })));
  drawDots();

  const press = (digit) => {
    if (entered.length >= SETTINGS_PIN.length) return;
    entered += digit;
    drawDots();
    if (entered.length < SETTINGS_PIN.length) return;
    if (entered === SETTINGS_PIN) {
      nav.replace('settings');
      return;
    }
    dots.classList.add('wrong');
    setTimeout(() => {
      dots.classList.remove('wrong');
      entered = '';
      drawDots();
    }, 500);
  };

  const key = (label, onClick, cls = '') => h('button', { class: `pin-key ${cls}`, onClick }, label);
  const el = h(
    'div',
    { class: 'screen pink-bg' },
    h(
      'div',
      { class: 'panel pin-panel' },
      h('h1', { class: 'title center pin-title' }, 'Enter PIN'),
      dots,
      h(
        'div',
        { class: 'pin-pad' },
        ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => press(d))),
        h('span'),
        key('0', () => press('0')),
        key('⌫', () => {
          entered = entered.slice(0, -1);
          drawDots();
        }, 'small-text'),
      ),
      h('div', { class: 'spacer' }),
      h('div', { class: 'bottom-bar' }, backButton()),
    ),
  );

  // Number keys on a keyboard work too.
  const onKey = (e) => {
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') {
      entered = entered.slice(0, -1);
      drawDots();
    }
  };
  document.addEventListener('keydown', onKey);
  return { el, cleanup: () => document.removeEventListener('keydown', onKey) };
};

screens.settings = () => {
  let disposed = false;
  const body = h('div', { class: 'settings-body' });

  const onOff = (key) =>
    h(
      'div',
      { class: 'toggle-row small settings-toggle' },
      [true, false].map((value) =>
        h(
          'button',
          {
            class: `toggle ${settings[key] === value ? 'active' : ''}`,
            onClick: async () => {
              await setSetting(key, value);
              draw();
            },
          },
          value ? 'On' : 'Off',
        ),
      ),
    );

  const row = (title, note, control) =>
    h(
      'div',
      { class: 'settings-row' },
      h('div', { class: 'settings-text' }, h('div', { class: 'settings-title' }, title), note ? h('div', { class: 'settings-note' }, note) : null),
      control,
    );

  const setSeconds = async (value) => {
    await setSetting('countdownSeconds', Math.min(15, Math.max(3, value)));
    draw();
  };

  const startInput = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
  const useStartImage = async (file) => {
    if (!file) return;
    try {
      await setSetting('startImage', await prepareStartImage(file));
      if (!disposed) draw();
    } catch (error) {
      alert(error.message ?? 'That image could not be used.');
    }
  };
  startInput.addEventListener('change', () => {
    const file = startInput.files[0];
    startInput.value = '';
    useStartImage(file);
  });
  const stopPaste = onPasteImages('Start screen', (files) => useStartImage(files[0]));

  function draw() {
    if (disposed) return;
    body.replaceChildren(
      row('Restart countdown', 'Go back to the start screen automatically 30 seconds after a session ends.', onOff('restartCountdown')),
      row('Print page', 'Show the print options page and the “Printing....” message.', onOff('showPrintPage')),
      row(
        'Photo countdown',
        'How long the countdown before each photo takes. It still counts down from 10.',
        h(
          'div',
          { class: 'stepper' },
          h('button', { class: 'stepper-btn', 'aria-label': 'Shorter', onClick: () => setSeconds(settings.countdownSeconds - 1) }, '−'),
          h('div', { class: 'stepper-value wide' }, `${settings.countdownSeconds} s`),
          h('button', { class: 'stepper-btn', 'aria-label': 'Longer', onClick: () => setSeconds(settings.countdownSeconds + 1) }, '+'),
        ),
      ),
      h(
        'div',
        { class: 'settings-row start-row' },
        h(
          'div',
          { class: 'settings-text' },
          h('div', { class: 'settings-title' }, 'Start screen photo'),
          h('div', { class: 'settings-note' }, 'Shown before each session; tapping anywhere on it starts. A landscape image (about 4:3) fits best.'),
          h(
            'div',
            { class: 'settings-actions' },
            startInput,
            h('button', { class: 'pill small', onClick: () => startInput.click() }, 'Choose Photo'),
            canReadClipboard
              ? h('button', {
                  class: 'pill small',
                  onClick: async () => {
                    try {
                      await useStartImage((await readClipboardImages('Start screen'))[0]);
                    } catch (error) {
                      alert(error.message);
                    }
                  },
                }, 'Paste')
              : null,
            settings.startImage
              ? h('button', {
                  class: 'pill small',
                  onClick: async () => {
                    await setSetting('startImage', null);
                    draw();
                  },
                }, 'Use Default')
              : null,
          ),
        ),
        h('img', { class: 'start-thumb', src: startScreenImage(), alt: 'Start screen' }),
      ),
    );
  }
  draw();

  const el = h(
    'div',
    { class: 'screen pink-bg' },
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-header' }, h('h1', { class: 'title' }, 'Settings')),
      h('div', { class: 'divider' }),
      body,
      h('div', { class: 'bottom-bar' }, backButton()),
    ),
  );
  return {
    el,
    cleanup() {
      disposed = true;
      stopPaste();
    },
  };
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const DESIGN_WIDTH = 1194;
const DESIGN_HEIGHT = 834;

function fitStage() {
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const scale = Math.min(vw / DESIGN_WIDTH, vh / DESIGN_HEIGHT);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

window.addEventListener('resize', fitStage);
window.addEventListener('orientationchange', () => setTimeout(fitStage, 300));
window.visualViewport?.addEventListener('resize', fitStage);
fitStage();

// Prevent pinch-zoom of the whole page on iOS (stickers handle their own gestures).
document.addEventListener('gesturestart', (e) => e.preventDefault());

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

loadSettings().finally(() => nav.restart());
