// pdf-processor.js — Otiyot+ PDF colorizer v2.0.0 (stream-native engine)
// Text is read straight from the page content stream (exact glyph positions) and edited
// there: glyphs that get redrawn/moved are DELETED from the stream (no white-out, no raster
// clones), and niqqud-only colouring paints the mark glyph itself. pdf.js is no longer used.
// ES module — loaded via <script type="module"> in pdf-processor.html

import { createStreamEngine } from './pdf-stream-engine.js';

// ---------------------------------------------------------------------------
// NIQQUD CONFIG
// ---------------------------------------------------------------------------
const SHVA_CHAR = 'ְ';
const NIKUD_LIST = [
  { char: 'ְ', key: 'nikud_shva_na',   label: 'Shva Na',   color: '#cc0000' },
  { char: 'ְ', key: 'nikud_shva_nach',  label: 'Shva Nach', color: '#ff88aa' },
  { char: 'ִ', key: 'nikud_05B4', label: 'Hiriq',   color: '#ff9900' },
  { char: 'ֵ', key: 'nikud_05B5', label: 'Tsere',   color: '#cccc00' },
  { char: 'ֶ', key: 'nikud_05B6', label: 'Segol',   color: '#00cc00' },
  { char: 'ַ', key: 'nikud_05B7', label: 'Patach',  color: '#6aa84f' },
  { char: 'ָ', key: 'nikud_05B8', label: 'Kamatz',  color: '#6fa8dc' },
  { char: 'ֹ', key: 'nikud_05B9', label: 'Holam',   color: '#0000ff' },
  { char: 'ֻ', key: 'nikud_05BB', label: 'Kubutz',  color: '#9900ff' },
  { char: 'ּ', key: 'nikud_05BC', label: 'Dagesh',  color: '#ff00ff' },
];

const NIKUD_COLORS = {
  'SHVA_NA': '#cc0000', 'SHVA_NACH': '#ff88aa',
  'ִ': '#ff9900', 'ֵ': '#cccc00',
  'ֶ': '#00cc00', 'ַ': '#6aa84f',
  'ָ': '#6fa8dc', 'ֹ': '#0000ff',
  'ֻ': '#9900ff', 'ּ': '#ff00ff',
};
const HATAF_MAP = { 'ֱ': 'ֶ', 'ֲ': 'ַ', 'ֳ': 'ָ' };

function isHebrewLetter(cp) {
  return (cp >= 0x05D0 && cp <= 0x05EA) || (cp >= 0xFB1D && cp <= 0xFB4E);
}
function isZeroWidthMark(cp) {
  // U+05C0 paseq, U+05C3 sof pasuq and U+05C6 nun hafukha are visible, advancing glyphs
  if (cp === 0x05C0 || cp === 0x05C3 || cp === 0x05C6) return false;
  return (cp >= 0x0591 && cp <= 0x05C7);
}
// yud / zayin + dagesh render as ONE ligature glyph in Dyslex-Kriyah (dagesh baked in). To colour that
// dagesh we paint a standalone dagesh on top; offsets (font units, from a dagesh drawn at the letter
// origin) were measured from the glyph outlines of uniFB39 / uniFB36.
const LIG_DAGESH_OVERLAY = {
  '\u05D9': { dx: -114, dy: 108 },
  '\u05D6': { dx:  -85, dy:   0 },
};

// ── SHVA NA / NACH ─────────────────────────────────────────────────────────
// KEEP THIS FUNCTION BYTE-IDENTICAL in content.js and pdf-processor.js. Each file only builds
// the context object differently (text-based vs. glyph-position-based).
// Shva NA rules (voiced):  1 word-initial · 2 after a long vowel (tsere / holam / kamatz /
// shuruk / hiriq male) · 3 under a letter with dagesh chazak · 4 under the first of two
// identical letters · 5 the second of two shvas in mid-word.
// Shva NACH (silent): everything else, i.e. after a short vowel, at the end of a word, and BOTH
// shvas of a word-final pair.
function shvaKind(c) {
  if (c.wordInitial)   return 'SHVA_NA';      // 1
  if (c.wordFinal)     return 'SHVA_NACH';    // word-final shva is silent, even after a long vowel
  if (c.nextFinalShva) return 'SHVA_NACH';    // word-final pair of shvas: both silent
  if (c.hasDagesh)     return 'SHVA_NA';      // 3
  if (c.nextSameLetter) return 'SHVA_NA';     // 4
  if (c.prevWasShva)   return 'SHVA_NA';      // 5
  if (c.prevLong)      return 'SHVA_NA';      // 2
  return 'SHVA_NACH';
}
const LONG_VOWELS = new Set(['\u05B5', '\u05B8', '\u05B9']);   // tsere, kamatz, holam (+ shuruk, tracked separately)
function settingKeyFor(colourKey) {
  return colourKey.length === 1
    ? 'nikud_' + colourKey.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
    : 'nikud_' + colourKey.toLowerCase().replace(/ /g, '_');
}
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16)/255, g: parseInt(h.slice(2,4),16)/255, b: parseInt(h.slice(4,6),16)/255 };
}

function baseChar(ch) {
  const cp = ch.codePointAt(0);
  if (cp < 0xFB1D || cp > 0xFB4E) return ch;
  const d = {0xFB1D:'\u05D9',0xFB2A:'\u05E9',0xFB2B:'\u05E9',0xFB2C:'\u05E9',
    0xFB2D:'\u05E9',0xFB2E:'\u05D0',0xFB2F:'\u05D0',0xFB30:'\u05D0',
    0xFB31:'\u05D1',0xFB32:'\u05D2',0xFB33:'\u05D3',0xFB34:'\u05D4',
    0xFB35:'\u05D5',0xFB36:'\u05D6',0xFB38:'\u05D8',0xFB39:'\u05D9',
    0xFB3A:'\u05DA',0xFB3B:'\u05DB',0xFB3C:'\u05DC',0xFB3E:'\u05DE',
    0xFB40:'\u05E0',0xFB41:'\u05E1',0xFB43:'\u05E3',0xFB44:'\u05E4',
    0xFB46:'\u05E6',0xFB47:'\u05E7',0xFB48:'\u05E8',0xFB49:'\u05E9',
    0xFB4A:'\u05EA',0xFB4B:'\u05D5',0xFB4C:'\u05D1',0xFB4D:'\u05DB',0xFB4E:'\u05E4',
  };
  return d[cp] || ch;
}

// ---------------------------------------------------------------------------
// DEFAULT SETTINGS
// ---------------------------------------------------------------------------
const DEFAULTS = {
  colorNekudot: true,
  fontEnabled: true,          // same defaults as popup.js / content.js
  letterSpacing: 0,
  highlightOpacity: 100,
  highlightMode: 'block',
  nikud_shva_na: true, nikud_shva_nach: true,
  nikud_05B4: true, nikud_05B5: true, nikud_05B6: true,
  nikud_05B7: true, nikud_05B8: true, nikud_05B9: true,
  nikud_05BB: true, nikud_05BC: true,
  nikudColors: {},
};

let settings = { ...DEFAULTS };

// Set to true while debugging mark placement (logs one line per mark type).
const DEBUG = false;
// Yield to the browser so the progress bar can repaint during long, synchronous work.
const tick = () => new Promise(r => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// UI REFS
// ---------------------------------------------------------------------------
const pdfColorToggle  = document.getElementById('pdfColorToggle');
const pdfFontToggle   = document.getElementById('pdfFontToggle');
const pdfSpacingRange = document.getElementById('pdfSpacingRange');
const pdfSpacingVal   = document.getElementById('pdfSpacingVal');
const pdfOpacityRange = document.getElementById('pdfOpacityRange');
const pdfOpacityVal   = document.getElementById('pdfOpacityVal');
const modeBlock       = document.getElementById('modeBlock');
const modeNikud       = document.getElementById('modeNikud');
const expandBtn       = document.getElementById('expandBtn');
const expandChevron   = document.getElementById('expandChevron');
const nikudPanel      = document.getElementById('nikudPanel');
const nikudRows       = document.getElementById('nikudRows');
const bulkOn          = document.getElementById('bulkOn');
const bulkOff         = document.getElementById('bulkOff');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const saveToast       = document.getElementById('saveToast');

const dropZone    = document.getElementById('dropZone');
const fileInput   = document.getElementById('fileInput');
const fileInfo    = document.getElementById('fileInfo');
const fileName    = document.getElementById('fileName');
const fileSize    = document.getElementById('fileSize');
const fileClear   = document.getElementById('fileClear');
const processBtn  = document.getElementById('processBtn');
const downloadBtn = document.getElementById('downloadBtn');
const progressWrap= document.getElementById('progressWrap');
const progressFill= document.getElementById('progressFill');
const progressPct = document.getElementById('progressPct');
const progressText= document.getElementById('progressText');
const resultCard  = document.getElementById('resultCard');
const resultSub   = document.getElementById('resultSub');
const errorMsg    = document.getElementById('errorMsg');
const steps       = [1,2,3,4,5,6].map(i => document.getElementById('step'+i));

let selectedFile = null;
let downloadUrl  = null;
const nikudCheckboxes = {};

// ---------------------------------------------------------------------------
// CUSTOM COLOURS
// Shared with the popup/content script via chrome.storage.sync.nikudColors —
// only overrides are stored, keyed exactly like the enable flags
// ('nikud_05B4', uppercase hex), so all three files read the same keys.
// ---------------------------------------------------------------------------
const DEFAULT_COLORS = {};
NIKUD_LIST.forEach(({ key, color }) => { DEFAULT_COLORS[key] = color; });
const KEY_BY_LOWER = {};
Object.keys(DEFAULT_COLORS).forEach(k => { KEY_BY_LOWER[k.toLowerCase()] = k; });
let customColors = {};

const HEX_RE = /^#[0-9a-f]{6}$/i;
const colorFor = key => customColors[key] || DEFAULT_COLORS[key];

function colorsFromStorage(obj) {
  const out = {};
  if (obj && typeof obj === 'object') {
    Object.entries(obj).forEach(([k, v]) => {
      const key = KEY_BY_LOWER[k.toLowerCase()];
      if (key && typeof v === 'string' && HEX_RE.test(v)) out[key] = v.toLowerCase();
    });
  }
  return out;
}
const colorsToStorage = obj => ({ ...obj });
function hexToRgba(hex, pct) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${Math.round(r*255)}, ${Math.round(g*255)}, ${Math.round(b*255)}, ${(pct/100).toFixed(2)})`;
}

// ---------------------------------------------------------------------------
// BUILD PER-VOWEL ROWS
// ---------------------------------------------------------------------------
NIKUD_LIST.forEach(({ char, key, label, color }) => {
  const row = document.createElement('div');
  row.className = 'nikud-row';
  row.innerHTML = `
    <button type="button" class="nikud-swatch" data-key="${key}" title="Change colour" style="background:${colorFor(key)}"></button>
    <span class="nikud-char">ב${char}</span>
    <span class="nikud-label">${label}</span>
    <label class="switch">
      <input type="checkbox" id="pdf_${key}">
      <span class="track"></span>
    </label>`;
  nikudRows.appendChild(row);
  const cb = row.querySelector('input');
  nikudCheckboxes[key] = cb;
  cb.addEventListener('change', readUIToSettings);
  row.querySelector('.nikud-swatch').addEventListener('click', e => { e.preventDefault(); openPicker(key); });
});

function refreshColorUI(key) {
  const sw = nikudRows.querySelector(`.nikud-swatch[data-key="${key}"]`);
  if (sw) sw.style.background = colorFor(key);
}

// ---------------------------------------------------------------------------
// COLOUR PICKER POPUP
// ---------------------------------------------------------------------------
const PRESETS = [
  '#e53935','#ff7043','#ffb300','#fdd835','#c0ca33','#43a047',
  '#00acc1','#29b6f6','#1e88e5','#3949ab','#8e24aa','#d81b60',
  '#ffcdd2','#ffe0b2','#fff59d','#c8e6c9','#b3e5fc','#e1bee7',
];

const cpOverlay = document.createElement('div');
cpOverlay.className = 'cp-overlay';
cpOverlay.innerHTML = `
  <div class="cp-card" role="dialog" aria-modal="true">
    <div class="cp-head">
      <span class="cp-preview"></span>
      <span class="cp-title"></span>
      <button type="button" class="cp-close" title="Close">\u2715</button>
    </div>
    <div class="cp-grid"></div>
    <div class="cp-hexrow">
      <label for="cpHex">Hex</label>
      <input type="text" id="cpHex" class="cp-hex" maxlength="7" spellcheck="false" placeholder="#RRGGBB">
    </div>
    <div class="cp-actions">
      <button type="button" class="cp-btn reset" id="cpReset">\u21BA Reset to default</button>
      <button type="button" class="cp-btn primary" id="cpDone">Done</button>
    </div>
    <button type="button" class="cp-resetall" id="cpResetAll">Reset all colours</button>
  </div>`;
document.body.appendChild(cpOverlay);

const cpPreview = cpOverlay.querySelector('.cp-preview');
const cpTitle   = cpOverlay.querySelector('.cp-title');
const cpGrid    = cpOverlay.querySelector('.cp-grid');
const cpHex     = cpOverlay.querySelector('#cpHex');
let pickerKey = null;

PRESETS.forEach(hex => {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'cp-chip';
  chip.dataset.hex = hex;
  chip.style.background = hex;
  chip.title = hex;
  chip.addEventListener('click', () => setPickerColor(hex));
  cpGrid.appendChild(chip);
});

function syncPicker() {
  if (!pickerKey) return;
  const c = colorFor(pickerKey);
  cpPreview.style.background = hexToRgba(c, parseInt(pdfOpacityRange.value, 10));
  if (document.activeElement !== cpHex) cpHex.value = c.toUpperCase();
  cpHex.classList.remove('invalid');
  cpGrid.querySelectorAll('.cp-chip').forEach(ch =>
    ch.classList.toggle('selected', ch.dataset.hex.toLowerCase() === c.toLowerCase()));
}

function setPickerColor(hex) {
  if (!pickerKey) return;
  hex = hex.toLowerCase();
  if (hex === DEFAULT_COLORS[pickerKey].toLowerCase()) delete customColors[pickerKey];
  else customColors[pickerKey] = hex;
  refreshColorUI(pickerKey);
  syncPicker();
}

function openPicker(key) {
  pickerKey = key;
  const item = NIKUD_LIST.find(n => n.key === key);
  cpTitle.textContent = item.label;
  cpPreview.textContent = '\u05D1' + item.char;
  cpHex.value = '';
  cpOverlay.classList.add('open');
  syncPicker();
}
function closePicker() { cpOverlay.classList.remove('open'); pickerKey = null; }

cpHex.addEventListener('input', () => {
  let v = cpHex.value.trim().replace(/[^0-9a-fA-F#]/g, '');
  if (v && v[0] !== '#') v = '#' + v;
  cpHex.value = v.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).split('').map(ch => ch + ch).join('');
  if (HEX_RE.test(v)) setPickerColor(v);
  else cpHex.classList.toggle('invalid', v.length > 1);
});
cpHex.addEventListener('blur', syncPicker);

cpOverlay.querySelector('#cpReset').addEventListener('click', () => {
  if (!pickerKey) return;
  delete customColors[pickerKey];
  refreshColorUI(pickerKey);
  cpHex.blur();
  syncPicker();
});
cpOverlay.querySelector('#cpResetAll').addEventListener('click', () => {
  customColors = {};
  NIKUD_LIST.forEach(({ key }) => refreshColorUI(key));
  cpHex.blur();
  syncPicker();
});
cpOverlay.querySelector('#cpDone').addEventListener('click', closePicker);
cpOverlay.querySelector('.cp-close').addEventListener('click', closePicker);
cpOverlay.addEventListener('mousedown', e => { if (e.target === cpOverlay) closePicker(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && pickerKey) closePicker(); });

// ---------------------------------------------------------------------------
// LOAD SETTINGS FROM STORAGE
// ---------------------------------------------------------------------------
chrome.storage.sync.get(DEFAULTS, res => {
  settings = { ...DEFAULTS, ...res };
  customColors = colorsFromStorage(res.nikudColors);
  applySettingsToUI();
});

function setModeButtons(mode) {
  modeBlock.classList.toggle('active', mode !== 'nikud');
  modeNikud.classList.toggle('active', mode === 'nikud');
}

function applySettingsToUI() {
  pdfColorToggle.checked      = settings.colorNekudot;
  pdfFontToggle.checked       = settings.fontEnabled;
  pdfSpacingRange.value       = settings.letterSpacing;
  pdfSpacingVal.textContent   = settings.letterSpacing + ' px';
  pdfOpacityRange.value       = settings.highlightOpacity;
  pdfOpacityVal.textContent   = settings.highlightOpacity + '%';
  setModeButtons(settings.highlightMode);
  NIKUD_LIST.forEach(({ key }) => {
    if (nikudCheckboxes[key]) nikudCheckboxes[key].checked = settings[key] !== false;
    refreshColorUI(key);
  });
}

function readUIToSettings() {
  settings.colorNekudot    = pdfColorToggle.checked;
  settings.fontEnabled     = pdfFontToggle.checked;
  settings.letterSpacing   = parseInt(pdfSpacingRange.value, 10);
  settings.highlightOpacity= parseInt(pdfOpacityRange.value, 10);
  settings.highlightMode   = modeNikud.classList.contains('active') ? 'nikud' : 'block';
  NIKUD_LIST.forEach(({ key }) => {
    if (nikudCheckboxes[key]) settings[key] = nikudCheckboxes[key].checked;
  });
}

// ---------------------------------------------------------------------------
// LIVE UI EVENTS
// ---------------------------------------------------------------------------
// Stay in sync with the popup: if its settings change while this tab is open, follow them.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  let touched = false;
  Object.entries(changes).forEach(([k, c]) => {
    if (k === 'nikudColors') { customColors = colorsFromStorage(c.newValue); touched = true; }
    else if (k in DEFAULTS)  { settings[k] = c.newValue === undefined ? DEFAULTS[k] : c.newValue; touched = true; }
  });
  if (touched) applySettingsToUI();
});

modeBlock.addEventListener('click', () => { setModeButtons('block'); readUIToSettings(); });
modeNikud.addEventListener('click', () => { setModeButtons('nikud'); readUIToSettings(); });

pdfColorToggle.addEventListener('change', readUIToSettings);
pdfFontToggle.addEventListener('change', readUIToSettings);
pdfSpacingRange.addEventListener('input', () => { pdfSpacingVal.textContent = pdfSpacingRange.value + ' px'; readUIToSettings(); });
pdfOpacityRange.addEventListener('input', () => { pdfOpacityVal.textContent = pdfOpacityRange.value + '%'; readUIToSettings(); syncPicker(); });
expandBtn.addEventListener('click', () => {
  const open = nikudPanel.classList.toggle('open');
  expandChevron.textContent = open ? '▲' : '▼';
});
bulkOn.addEventListener('click', () => { Object.values(nikudCheckboxes).forEach(cb => cb.checked = true); readUIToSettings(); });
bulkOff.addEventListener('click', () => { Object.values(nikudCheckboxes).forEach(cb => cb.checked = false); readUIToSettings(); });
saveSettingsBtn.addEventListener('click', () => {
  readUIToSettings();
  chrome.storage.sync.set({ ...settings, nikudColors: colorsToStorage(customColors) }, () => {
    saveToast.classList.add('visible');
    setTimeout(() => saveToast.classList.remove('visible'), 2200);
  });
});

// ---------------------------------------------------------------------------
// FILE HANDLING
// ---------------------------------------------------------------------------
function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1)+' KB';
  return (b/1024/1024).toFixed(1)+' MB';
}
function setFile(file) {
  if (!file || !(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) { showError('Please select a valid PDF file.'); return; }
  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  fileInfo.classList.add('visible');
  processBtn.disabled = false;
  hideError();
  resultCard.classList.remove('visible');
  downloadBtn.classList.remove('visible');
  progressWrap.classList.remove('visible');
}
fileInput.addEventListener('change', e => { if (e.target.files[0]) setFile(e.target.files[0]); });
fileClear.addEventListener('click', () => {
  selectedFile = null; fileInput.value = '';
  fileInfo.classList.remove('visible');
  processBtn.disabled = true;
});
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});

function setProgress(pct, text, stepIndex) {
  progressFill.style.width = pct + '%';
  progressPct.textContent  = pct + '%';
  progressText.textContent = text;
  steps.forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i < stepIndex) s.classList.add('done');
    if (i === stepIndex) s.classList.add('active');
  });
}
function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.add('visible'); }
function hideError()    { errorMsg.classList.remove('visible'); }

processBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  readUIToSettings();
  processBtn.disabled = true;
  downloadBtn.classList.remove('visible');
  resultCard.classList.remove('visible');
  progressWrap.classList.add('visible');
  hideError();
  try { await processPdf(selectedFile); }
  catch (err) {
    console.error('PDF error:', err);
    showError('Could not process this PDF: ' + (err.message || String(err)));
    progressWrap.classList.remove('visible');
    processBtn.disabled = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (!downloadUrl) return;
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = (selectedFile?.name || 'document').replace(/\.pdf$/i, '') + '_otiyot.pdf';
  a.click();
});

// ---------------------------------------------------------------------------
// REFLOW PLANNER (pure geometry — no pdf-lib calls)
// words: array of words (arrays of cells) in reading order, each word carrying
//        .lineInfo = { y, left, right, fs } (the SAME object for every word of a line).
// Returns [{ ltr, x, y, pg }] where pg 0 = the source page, 1+ = overflow pages.
//  • margins come from the page's own text (not a fixed constant)
//  • original line breaks that end a paragraph are kept; full lines are re-wrapped
//  • first baseline, paragraph gaps and line spacing come from the original layout
// ---------------------------------------------------------------------------
function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function planReflow(words, pageH, spacing, widthOf) {
  const out = [];
  const lines = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (!last || last.info !== w.lineInfo) lines.push({ info: w.lineInfo, words: [w] });
    else last.words.push(w);
  }
  if (!lines.length) return out;

  const infos = lines.map(l => l.info);
  const maxW  = Math.max(...infos.map(i => i.right - i.left));
  const wide  = infos.filter(i => i.right - i.left >= 0.6 * maxW);
  const pageRight = Math.max(...wide.map(i => i.right));
  const pageLeft  = Math.min(...wide.map(i => i.left));
  const W = Math.max(pageRight - pageLeft, 1);

  const gaps = [];
  for (let k = 0; k < infos.length - 1; k++) {
    const d = infos[k].y - infos[k + 1].y;
    if (d > 0 && d < 3 * infos[k].fs) gaps.push(d);
  }
  const medGap = median(gaps) || infos[0].fs * 1.6;

  // A line that is "full" flows into the next one; short / indented / spaced-out lines end a paragraph.
  const paras = [];
  let cur = [lines[0]];
  for (let k = 1; k < lines.length; k++) {
    const prev = lines[k - 1].info, ln = lines[k].info;
    const hardBreak =
      (prev.y - ln.y) > 1.6 * medGap ||
      prev.left > pageLeft + 0.15 * W ||
      ln.right < pageRight - 1.5 * ln.fs ||
      Math.abs(prev.fs - ln.fs) > 1;
    if (hardBreak) { paras.push(cur); cur = []; }
    cur.push(lines[k]);
  }
  paras.push(cur);

  const topY    = infos[0].y;
  const lowestY = infos[infos.length - 1].y;
  const bottom  = Math.max(Math.min(lowestY, pageH - topY), 20);   // lowest original baseline, or the mirror of the top margin

  let pg = 0, y = topY, prevLastY = null;
  for (const para of paras) {
    const first = para[0].info;
    y = prevLastY === null ? first.y : y - (prevLastY - first.y);   // keep original paragraph spacing
    prevLastY = para[para.length - 1].info.y;
    if (y < bottom) { pg++; y = topY; }

    const ds = [];
    for (let j = 0; j < para.length - 1; j++) {
      const d = para[j].info.y - para[j + 1].info.y;
      if (d > 0) ds.push(d);
    }
    const fs       = first.fs;
    const lineGap  = Math.max(median(ds) || medGap, fs * 1.25);
    const wordGap  = fs * (0.35 + spacing * 0.55);                  // same rule as content.js

    let cursor = first.right;                                       // keep first-line indent
    let atStart = true;
    for (const ln of para) {
      for (const word of ln.words) {
        const ws    = word.map(widthOf);
        const wordW = ws.reduce((a, b) => a + b, 0) + spacing * Math.max(word.length - 1, 0);
        if (!atStart && cursor - wordW < pageLeft) {
          y -= lineGap;
          cursor = pageRight;
          atStart = true;
          if (y < bottom) { pg++; y = topY; }
        }
        let lc = cursor;
        word.forEach((ltr, i) => {
          const x = lc - ws[i];
          out.push({ ltr, x, y, pg });
          lc = x - spacing;
        });
        cursor = lc - wordGap;
        atStart = false;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// MAIN PIPELINE
// ---------------------------------------------------------------------------
async function processPdf(file) {
  const PDFLib = window.PDFLib;
  if (!PDFLib) throw new Error('pdf-lib not loaded — make sure lib/pdf-lib.min.js is present');

  setProgress(5, 'Reading PDF…', 0);
  const originalBytes = new Uint8Array(await file.arrayBuffer());

  setProgress(15, 'Loading pages…', 0);
  const { PDFDocument, rgb } = PDFLib;
  const existingDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  if (existingDoc.isEncrypted) throw new Error('This PDF is password-protected. Remove the password, then try again.');
  const numPages = existingDoc.getPageCount();

  setProgress(20, 'Reading page content…', 1);
  const engine = createStreamEngine(PDFLib, existingDoc);
  const charsByPage = engine.extract((pct, p) => setProgress(20 + Math.round(pct * 0.2), `Reading page ${p}…`, 1));
  if (engine.stats.hebrewGlyphs === 0) {
    throw new Error(engine.stats.unreadableFonts.size
      ? "Could not read the text in this PDF (its fonts have no Unicode map)."
      : 'No Hebrew text found in this PDF (scanned pages need OCR first).');
  }

  setProgress(45, 'Classifying niqqud…', 2);

  const spacing = settings.letterSpacing > 0 ? settings.letterSpacing : 0;   // works with or without the font

  const renderLetters = [];
  const lineGroups = [];   // spacing 0: the cells of each line, for the 1.1× stretch
  const pageWordStreams = [];

  for (let pi = 0; pi < charsByPage.length; pi++) {
    await tick();
    setProgress(45 + Math.round((pi / charsByPage.length) * 12), `Classifying page ${pi + 1}…`, 2);
    const wordStream = [];
    pageWordStreams.push(wordStream);

    const allChars = charsByPage[pi];   // exact glyph positions from the content stream

    // Group by baseline with a tolerance relative to font size, so cantillation
    // marks above/below the baseline never straddle a bucket boundary.
    const lineMap = new Map();
    const byY = [...allChars].sort((p, q) => q.y - p.y);
    let curKey = null, lastY = 0;
    for (const c of byY) {
      if (curKey === null || (lastY - c.y) > c.fontSize * 0.5) { curKey = c.y; lineMap.set(curKey, []); }
      lineMap.get(curKey).push(c);
      lastY = c.y;
    }
    const lineKeys = [...lineMap.keys()].sort((a, b) => b - a);

    for (let li = 0; li < lineKeys.length; li++) {
      const lineKey    = lineKeys[li];
      const gapAbove   = li > 0 ? lineKeys[li - 1] - lineKey : Infinity;                 // distance to the line above
      const gapBelow   = li < lineKeys.length - 1 ? lineKey - lineKeys[li + 1] : Infinity; // distance to the line below
      const lineChars  = lineMap.get(lineKey);
      const rawLetters = lineChars.filter(c => c.isHebrew);
      const nikudChars = lineChars.filter(c => c.isMark && c.cp >= 0x05B0 && c.cp <= 0x05C7 && c.cp !== 0x05BE);
      if (rawLetters.length === 0) continue;

      const letters = [...rawLetters].sort((a, b) => b.x1 - a.x1);

      const letterNikudMap = new Map();
      for (const nk of nikudChars) {
        let best = null, bestDist = Infinity;
        for (const ltr of letters) {
          if (nk.x0 >= ltr.x0 - 1 && nk.x0 <= ltr.x1 + 1) {
            const dist = Math.abs(nk.x0 - (ltr.x0 + ltr.x1) / 2);
            if (dist < bestDist) { bestDist = dist; best = ltr; }
          }
        }
        if (!best) {
          for (const ltr of letters) {
            const dist = Math.abs(nk.x0 - (ltr.x0 + ltr.x1) / 2);
            if (dist < bestDist && dist < 8) { bestDist = dist; best = ltr; }
          }
        }
        if (best) {
          if (!letterNikudMap.has(best)) letterNikudMap.set(best, []);
          letterNikudMap.get(best).push(nk);
        }
      }

      const gapThresh   = letters[0].fontSize * 0.18;
      const wordInitial = letters.map((ltr, i) => i === 0 || (letters[i - 1].x0 - ltr.x1) > gapThresh);
      const wordFinal   = letters.map((ltr, i) => i === letters.length - 1 || wordInitial[i + 1]);

      const colorOf = new Map();
      const classOf = new Map();
      const colorCpOf = new Map();   // code point of the mark that decides the colour (vowel, else dagesh)
      const dageshColorOf = new Map();   // dagesh colour when a vowel owns the main colour (vowel + dagesh together)
      const vavColorOf = new Map();   // vav + holam / shuruk: the letter itself takes the niqqud colour
      let prevWasShva = false, prevIsLong = false;
      const marksOf  = ltr => letterNikudMap.get(ltr) || [];
      const hasVowel = ltr => marksOf(ltr).some(nk => nk.cp >= 0x05B0 && nk.cp <= 0x05BB);
      letters.forEach((ltr, i) => {
        const nkList = letterNikudMap.get(ltr) || [];
        // Mirrors content.js: a real vowel always wins over dagesh; vav + dagesh
        // with no vowel is shuruk (Kubutz colour); other letter + dagesh = Dagesh.
        const realVowel = nkList.find(nk => nk.cp >= 0x05B0 && nk.cp <= 0x05BB);
        const hasDagesh = nkList.some(nk => nk.cp === 0x05BC);
        // Every dagesh is coloured (yud / zayin included).
        const colorDagesh = hasDagesh;
        let rawNikud = realVowel ? (realVowel.cp === 0x05BA ? '\u05B9' : realVowel.char) : null;
        if (rawNikud === null && colorDagesh) rawNikud = (ltr.char === '\u05D5') ? '\u05BB' : '\u05BC';

        // Where the mark physically sits (for "niqqud only" mode)
        let markClass = null;
        if (realVowel) markClass = (realVowel.cp === 0x05B9 || realVowel.cp === 0x05BA) ? 'above' : 'below';
        else if (colorDagesh) markClass = 'inside';
        classOf.set(ltr, markClass);

        // Mirrors content.js isColoredVav(): holam on vav, or shuruk (vav + dagesh, no vowel).
        // Vav with dagesh AND a vowel is a dagesh chazak, so the letter stays uncoloured.
        vavColorOf.set(ltr, ltr.char === '\u05D5' &&
          (rawNikud === '\u05B9' || (!realVowel && hasDagesh)));

        let colourKey = null;
        const isShuruk = ltr.char === '\u05D5' && !realVowel && hasDagesh;
        if (rawNikud === SHVA_CHAR) {
          // same rules as content.js shvaContext(): word-mates are the neighbours with no word gap between
          const nextLtr = (i + 1 < letters.length && !wordInitial[i + 1]) ? letters[i + 1] : null;
          const afterHiriqMale = i >= 2 && !wordInitial[i] && !wordInitial[i - 1] &&
            baseChar(letters[i - 1].char) === '\u05D9' && !hasVowel(letters[i - 1]) &&
            marksOf(letters[i - 2]).some(nk => nk.cp === 0x05B4);
          colourKey = shvaKind({
            wordInitial: wordInitial[i], wordFinal: wordFinal[i],
            nextFinalShva: !!nextLtr && wordFinal[i + 1] && marksOf(nextLtr).some(nk => nk.cp === 0x05B0),
            nextSameLetter: !!nextLtr && baseChar(nextLtr.char) === baseChar(ltr.char),
            hasDagesh, prevWasShva, prevLong: prevIsLong || afterHiriqMale,
          });
        }
        else if (HATAF_MAP[rawNikud])    colourKey = HATAF_MAP[rawNikud];
        else if (rawNikud)               colourKey = rawNikud;

        prevWasShva = (rawNikud === SHVA_CHAR);
        prevIsLong  = LONG_VOWELS.has(rawNikud) || isShuruk;      // shuruk is long; kubutz is not

        let color = null;
        if (settings.colorNekudot && colourKey) {
          const sk = settingKeyFor(colourKey);
          if (settings[sk] !== false) color = colorFor(sk) || NIKUD_COLORS[colourKey] || null;
        }
        colorOf.set(ltr, color);
        colorCpOf.set(ltr, realVowel ? realVowel.cp : (colorDagesh ? 0x05BC : null));

        // Vowel + dagesh: the vowel keeps the main colour, the dagesh gets the dagesh colour on top.
        let dageshColor = null;
        if (settings.colorNekudot && realVowel && hasDagesh) {
          const dsk = settingKeyFor('\u05BC');
          if (settings[dsk] !== false) dageshColor = colorFor(dsk) || NIKUD_COLORS['\u05BC'] || null;
        }
        dageshColorOf.set(ltr, dageshColor);
      });

      const mkCell = (ltr, extra) => ({
        page: pi, srcPage: pi, x: ltr.x0, y: ltr.y, fontSize: ltr.fontSize,
        char: ltr.char, origW: ltr.x1 - ltr.x0, color: colorOf.get(ltr) || null,
        markClass: classOf.get(ltr) || null,
        colorLetter: vavColorOf.get(ltr) || false,
        colorCp: colorCpOf.get(ltr) ?? null,
        dageshColor: dageshColorOf.get(ltr) || null,
        whiteoutX: ltr.x0, whiteoutY: ltr.y, whiteoutFontSize: ltr.fontSize,
        whiteoutW: ltr.x1 - ltr.x0,
        gapAbove, gapBelow,
        marks: letterNikudMap.get(ltr) || [], src: ltr.src, srcBase: ltr.srcBase, ...extra,
      });

      if (spacing === 0) {
        const group = [];
        for (const ltr of letters) { const c = mkCell(ltr); renderLetters.push(c); group.push(c); }
        // Punctuation, maqaf, sof-pasuq, parentheses... are not redrawn in the font (it lacks most of
        // them), but they MUST ride along with the line stretch below, or they stay put while the
        // letters slide away from them. They become cells and are re-stamped as clones of the original.
        for (const c of lineChars) {
          if (c.isHebrew || c.isMark || !c.char.trim() || !(c.x1 - c.x0 > 0)) continue;
          const oc = mkCell(c, { isOther: true, color: null, markClass: null, colorLetter: false, marks: [] });
          renderLetters.push(oc); group.push(oc);
        }
        lineGroups.push({ pi, cells: group });
      } else {
        // Reflow: every visible glyph on the line (letters AND punctuation / maqaf /
        // sof-pasuq) becomes a cell, so nothing is left behind in its old position.
        const cells = letters.map(ltr => mkCell(ltr));
        for (const c of lineChars) {
          if (c.isHebrew || c.isMark || !c.char.trim() || !(c.x1 - c.x0 > 0)) continue;
          cells.push(mkCell(c, { isOther: true, color: null, markClass: null, colorLetter: false, marks: [] }));
        }
        cells.sort((p, q) => q.x + q.origW - (p.x + p.origW));
        const lineInfo = {
          y: letters[0].y, fs: letters[0].fontSize,
          left:  Math.min(...cells.map(c => c.x)),
          right: Math.max(...cells.map(c => c.x + c.origW)),
        };
        let cur = [];
        cells.forEach((cell, i) => {
          if (i > 0) {
            const prev = cells[i - 1];
            if (prev.x - (cell.x + cell.origW) > gapThresh && cur.length) { cur.lineInfo = lineInfo; wordStream.push(cur); cur = []; }
          }
          cur.push(cell);
        });
        if (cur.length) { cur.lineInfo = lineInfo; wordStream.push(cur); }
      }
    }
  }

  setProgress(58, 'Rebuilding PDF…', 3);

  const opacity = ((settings.highlightOpacity ?? 100) / 100) * 0.90;

  let dyslexiaFont = null;
  let fontWarning  = null;
  const wantsFont = settings.fontEnabled && (renderLetters.length > 0 || pageWordStreams.some(ws => ws.length));
  if (wantsFont) {
    if (!window.fontkit) {
      fontWarning = 'Dyslexia font skipped: fontkit library not loaded. Place lib/fontkit.umd.min.js in the extension folder and reload.';
      console.warn(fontWarning);
    } else {
      try {
        existingDoc.registerFontkit(window.fontkit);
        const fontUrl   = chrome.runtime.getURL('dyslexia-hebrew-extended.otf');
        const fontBytes = await fetch(fontUrl).then(r => r.arrayBuffer());
        dyslexiaFont = await existingDoc.embedFont(fontBytes, { subset: false });
      } catch (fontErr) {
        fontWarning = 'Dyslexia font failed to embed: ' + (fontErr.message || String(fontErr));
        console.warn(fontWarning);
      }
    }
  }

  const glyphSupportCache = new Map();
  function fontSupportsChar(ch) {
    if (!dyslexiaFont) return false;
    const cp = ch.codePointAt(0);
    if (glyphSupportCache.has(cp)) return glyphSupportCache.get(cp);
    let ok = true;
    try {
      const fkFont = dyslexiaFont.embedder && dyslexiaFont.embedder.font;
      if (fkFont && typeof fkFont.glyphForCodePoint === 'function') {
        ok = fkFont.glyphForCodePoint(cp).id !== 0;
      }
    } catch { ok = true; }
    glyphSupportCache.set(cp, ok);
    return ok;
  }

  // Letters are drawn at the PDF's own font size (same as the spacing > 0 path, which looked right).
  // The old "uniformScale" shrink estimated widths from an equal split of each text run, which
  // always made the dyslexia-font letters come out too small at 0 spacing.
  const uniformScale = 1;

  setProgress(65, 'Drawing…', 4);

  let highlightCount = 0;
  let fontAttempted = 0;
  let fontUnsupported = 0;

  const pages = existingDoc.getPages();
  const { pushGraphicsState, popGraphicsState } = PDFLib;

  // Each cell is redrawn one of two ways (or left alone when there is nothing to do):
  //   'font'  – erased, then redrawn in the dyslexia font
  //   'clone' – (letter spacing only) erased, then a clipped slice of the ORIGINAL lettering
  //             (vowels and cantillation included) is stamped at its new spot
  function chooseMode(ltr) {
    if (!ltr.isOther && dyslexiaFont) {
      const bc = baseChar(ltr.char);
      if (fontSupportsChar(bc)) {
        try { if (dyslexiaFont.widthOfTextAtSize(bc, 10) > 0) return 'font'; } catch { /* fall through */ }
      }
    }
    if (ltr.isOther) return (spacing > 0 || dyslexiaFont) ? 'clone' : null;   // unsupported glyphs keep their ORIGINAL shape, just repositioned
    return spacing > 0 ? 'clone' : null;
  }
  const allCells = [...renderLetters, ...pageWordStreams.flat(2)];
  for (const c of allCells) c._mode = chooseMode(c);

  // ┌─────────────────────────────────────────────────────────────────────────────┐
  // │ PDF-EDITOR-ONLY ADJUSTMENT — IGNORE WHEN MATCHING RULES WITH content.js.     │
  // │ This 1.15× letter-pitch stretch compensates for pdf-lib redrawing glyphs at  │
  // │ fixed positions inside the original PDF's letter slots. content.js lets the  │
  // │ browser lay text out natively, so it has no equivalent and must NOT get one. │
  // │ It only runs when the Dyslex-Kriyah font is on AND letter spacing is 0.      │
  // └─────────────────────────────────────────────────────────────────────────────┘
  // At 0 spacing the dyslexia font's letters are a bit wider than the originals, so they crowd
  // or touch. Open every line up by 15% (letter pitch ×1.15), pivoting on the line's right edge
  // (Hebrew starts there) and never past the page's left text margin. Only the redraw position
  // moves — the white-out still uses the original coordinates.
  const LETTER_PITCH_STRETCH = 1.15;
  if (dyslexiaFont && spacing === 0) {
    const edge = g => ({ L: Math.min(...g.cells.map(c => c.x)), R: Math.max(...g.cells.map(c => c.x + c.origW)) });
    for (let pi = 0; pi < pages.length; pi++) {
      const groups = lineGroups.filter(g => g.pi === pi && g.cells.length);
      if (!groups.length) continue;
      const edges   = groups.map(edge);
      const maxW    = Math.max(...edges.map(e => e.R - e.L));
      const pageLeft = Math.min(...edges.filter(e => e.R - e.L >= 0.6 * maxW).map(e => e.L));
      groups.forEach((g, gi) => {
        const { L, R } = edges[gi];
        const span = R - L;
        if (span <= 0) return;
        const sc = Math.min(LETTER_PITCH_STRETCH, (R - pageLeft) / span);   // full-width lines can't grow past the margin
        if (sc <= 1.0001) return;
        // Scale the whole SLOT (left edge, right edge and width) about the right edge, so the
        // highlight boxes keep tiling edge to edge like content.js, and the glyph (drawn centred
        // in its slot) moves with its box. Whiteout still uses whiteoutX/whiteoutW (originals).
        for (const c of g.cells) { c.x = R - (R - c.x) * sc; c.origW *= sc; }
      });
    }
  }

  // ── STREAM EDITS ─────────────────────────────────────────────────────────────────
  // Cells that will be redrawn ('font') or moved ('clone') are DELETED from the page content
  // stream (their advance is preserved, so neighbours never shift) — nothing is whited out and
  // nothing is left behind. "Niqqud only": when the vowel is its own glyph, that glyph itself gets
  // the fill colour (exact, no overlay); fused letter+niqqud glyphs fall back to the tint below.
  const removeIds = new Set(), recolorMap = new Map();
  const nikudOnly = settings.highlightMode === 'nikud';
  for (const c of allCells) {
    if (c._mode) for (const g of (c.src || [])) removeIds.add(g.id);
    if (nikudOnly && c.color && c.markClass && !c.isOther && c._mode !== 'font') {
      let targets = engine.recolorTargets(c);
      // The engine hands back EVERY separate mark glyph of the letter. With a vowel + dagesh (e.g. yud
      // with dagesh chazak and hiriq) that painted the dagesh in the vowel's colour too. Keep only the
      // glyph(s) of the mark that actually owns the colour (plus the vav itself for holam / shuruk).
      if (targets && c.colorCp != null) {
        const only = targets.filter(g => g.kind === 'letter' || (g.cps && g.cps.includes(c.colorCp)));
        targets = (c.colorLetter || only.some(g => g.kind !== 'letter')) ? only : null;
      }
      if (targets) {
        c._streamColored = true; c._targets = targets; highlightCount++;
        if (!c._mode) for (const g of targets) recolorMap.set(g.id, c.color);
      }
    }
    // Vowel + dagesh: the dagesh glyph(s) get their own colour (the vowel's colour went to the vowel above).
    if (nikudOnly && c.dageshColor && !c.isOther && c._mode !== 'font') {
      const all = engine.recolorTargets(c);
      const dg = (all || []).filter(g => g.kind !== 'letter' && g.cps && g.cps.includes(0x05BC));
      if (dg.length) {
        c._dageshTargets = dg; highlightCount++;
        if (!c._mode) for (const g of dg) recolorMap.set(g.id, c.dageshColor);
      }
    }
  }
  setProgress(62, 'Editing page content…', 3);
  engine.rewrite({ remove: removeIds, recolor: recolorMap, opacity: settings.highlightOpacity || 100 });

  // Vector clone: re-emit the cell's ORIGINAL glyphs (same font, same codes, same kerning) as
  // real text at their new position. Replaces the old raster page-slice stamping.
  const cloneFontNames = new Map();
  function cloneFontName(page, ref) {
    let m = cloneFontNames.get(page);
    if (!m) cloneFontNames.set(page, m = new Map());
    if (!m.has(ref.tag)) m.set(ref.tag, page.node.newFontDictionary('OtiyotO', ref));
    return m.get(ref.tag);
  }
  const hexOf = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  function drawClone(targetPage, ltr, x, y) {
    const spec = engine.cloneSpec(ltr);
    if (!spec) return;
    const { beginText, endText, setFontAndSize, setTextMatrix, setFillingRgbColor, showText,
            PDFOperator, PDFNumber, PDFHexString } = PDFLib;
    const hi = ltr._streamColored ? new Set(ltr._targets.map(g => g.id)) : null;
    let hiRgb = null;
    if (hi) {
      const { r, g, b } = hexToRgb(ltr.color), op = (settings.highlightOpacity || 100) / 100;
      hiRgb = [r, g, b].map(v => v * op + (1 - op));
    }
    let dgIds = null, dgRgb = null;
    if (ltr._dageshTargets && ltr._dageshTargets.length) {
      const { r, g, b } = hexToRgb(ltr.dageshColor), op = (settings.highlightOpacity || 100) / 100;
      dgIds = new Set(ltr._dageshTargets.map(t => t.id));
      dgRgb = [r, g, b].map(v => v * op + (1 - op));
    }
    const ops = [
      pushGraphicsState(), beginText(),
      PDFOperator.of('Tc', [PDFNumber.of(0)]), PDFOperator.of('Tw', [PDFNumber.of(0)]), PDFOperator.of('Tz', [PDFNumber.of(100)]),
    ];
    // every glyph keeps its exact offset from the cell's original origin
    for (const m of spec.members) {
      ops.push(
        setFontAndSize(cloneFontName(targetPage, m.fontRef), m.fontSize),
        setTextMatrix(1, 0, 0, 1, x + (m.g.x0 - ltr.whiteoutX), y + (m.g.y - ltr.whiteoutY)),
        setFillingRgbColor(...(hi && hi.has(m.g.id) ? hiRgb : (dgIds && dgIds.has(m.g.id) ? dgRgb : m.fill))),
        showText(PDFHexString.of(hexOf(m.g.bytes))),
      );
    }
    ops.push(endText(), popGraphicsState());
    try { targetPage.pushOperators(...ops); } catch (e) { console.warn('clone failed', e); }
  }

  // Vertical bands (in font-size units, relative to the baseline) where each kind of
  // vowel mark sits. Letters themselves live roughly in 0 … 0.6.
  const NIKUD_BANDS = {
    below:  { y0: -0.28, y1: -0.04 },  // hiriq, kubutz, patach, …
    above:  { y0:  0.55, y1:  0.90 },  // holam
    inside: { y0:  0.18, y1:  0.42 },  // dagesh
  };

  function paintHighlight(targetPage, ltr, x, y, w, fs, cx, geo) {
    if (cx == null) cx = x + w / 2;   // visual centre of the letter
    const { r, g, b } = hexToRgb(ltr.color);
    if (settings.highlightMode === 'nikud' && ltr.markClass) {
      // "Niqqud only": 'Screen' turns black ink into the colour and leaves white paper white,
      // so only ink that sits under a rectangle changes.
      const op = (settings.highlightOpacity || 100) / 100;
      const tint = (bx, by, bw, bh) => {
        try { targetPage.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: rgb(r, g, b), opacity: op, blendMode: 'Screen' }); }
        catch { /* skip */ }
      };
      const shurukOrHolamVav = ltr.colorLetter;     // vav + holam, or vav + dagesh (shuruk): vav AND mark share one colour

      if (geo) {
        // Exact outlines. The vav body is tinted once; the dagesh of a shuruk lies inside it,
        // so it gets no second layer (two Screen layers on top of each other turn magenta).
        if (shurukOrHolamVav) tint(geo.body.x, geo.body.y, geo.body.w, geo.body.h);
        if (!(shurukOrHolamVav && ltr.markClass === 'inside')) {
          const pad = fs * 0.04;
          for (const bx of geo.boxes) tint(bx.x - pad, bx.y - pad, bx.w + pad * 2, bx.h + pad * 2);
        }
        highlightCount++;
        return;
      }

      // No glyph geometry (clone mode / fallback): band estimate
      if (shurukOrHolamVav) tint(cx - Math.max(w, 3) / 2, y - 0.02 * fs, Math.max(w, 3), 0.62 * fs);
      if (!(shurukOrHolamVav && ltr.markClass === 'inside')) {
        const band = NIKUD_BANDS[ltr.markClass];
        const bw   = Math.max(w + fs * 0.16, fs * 0.45);
        tint(cx - bw / 2, y + band.y0 * fs, bw, (band.y1 - band.y0) * fs);
      }
      highlightCount++;
      return;
    }
    const opts = { x, y: y - fs * 0.21, width: w, height: fs * 1.25, color: rgb(r, g, b), opacity };   // calibrated geometry: -0.21 fs below baseline, 1.25 fs tall
    try { targetPage.drawRectangle({ ...opts, blendMode: 'Multiply' }); highlightCount++; }
    catch { try { targetPage.drawRectangle(opts); highlightCount++; } catch { /* skip */ } }
  }

  // ── Mark placement helpers (fontkit) ───────────────────────────────────────
  // Outline box of one glyph at a given size, relative to its own origin (null if unavailable).
  function glyphBox(ch, size) {
    try {
      const fk = dyslexiaFont && dyslexiaFont.embedder && dyslexiaFont.embedder.font;
      if (!fk) return null;
      const bb = fk.glyphForCodePoint(ch.codePointAt(0)).bbox;
      if (!bb || ![bb.minX, bb.maxX, bb.minY, bb.maxY].every(isFinite) || bb.maxX <= bb.minX) return null;
      const k = size / fk.unitsPerEm;
      return { x0: bb.minX * k, x1: bb.maxX * k, y0: bb.minY * k, y1: bb.maxY * k };
    } catch { return null; }
  }
  function glyphCenter(ch, size) {
    const b = glyphBox(ch, size);
    return b ? (b.x0 + b.x1) / 2 : null;
  }

  // Mark placement.
  // Combining marks (holam / kubutz / dagesh / hiriq …) often have empty or degenerate
  // glyph bboxes in the font, so we anchor them to the *base letter* box instead of
  // trusting the mark's own outline. Fontkit layout is still tried first; if it gives
  // a sane result we keep it, otherwise we fall back to explicit anchors.
  const markLogged = new Set();

  function placeMarks(bc, marks, size, ligDagesh) {
    try {
      const fk = dyslexiaFont && dyslexiaFont.embedder && dyslexiaFont.embedder.font;
      if (!fk || typeof fk.layout !== 'function') return null;
      const k    = size / fk.unitsPerEm;
      const base = glyphBox(bc, size);
      if (!base) return null;
      const baseCenter = (base.x0 + base.x1) / 2;
      const baseW = base.x1 - base.x0;
      const baseH = base.y1 - base.y0;

      const out = [];
      for (const m of marks) {
        // yud / zayin + dagesh: the font fuses letter+dagesh into ONE ligature glyph (ccmp), which
        // drawLetter already draws as the base. The dagesh is baked in, so it gets no mark of its own.
        if (ligDagesh && m.cp === 0x05BC) continue;
        // gb may be null / zero-size for combining marks – that is OK
        let gb = glyphBox(m.char, size);
        if (!gb || !(gb.x1 > gb.x0) || !(gb.y1 > gb.y0)) {
          // Synthetic tiny box so downstream box math still works
          gb = { x0: -0.05 * size, x1: 0.05 * size, y0: -0.05 * size, y1: 0.05 * size };
        }
        const markW = gb.x1 - gb.x0;
        const markH = gb.y1 - gb.y0;
        const markMidX = (gb.x0 + gb.x1) / 2;
        const markMidY = (gb.y0 + gb.y1) / 2;

        let dx = 0, dy = 0, usedLayout = false;

        // 1) The font's OWN per-letter, per-niqqud anchors (GPOS mark-to-base), read via fontkit.
        //    The Dyslex-Kriyah font positions every vowel / dagesh / holam individually for each
        //    letter (e.g. hiriq sits toward the leg of a dalet, holam sits on the top-left corner,
        //    vowels in final kaf tuck inside the letter), so we trust it and never re-centre.
        //    NOTE: Hebrew is RTL, so fontkit returns the run REVERSED (mark first, base second).
        //    We therefore find base and mark by code point, and compute the mark's origin relative
        //    to the base's origin from the running pen position — order-independent.
        try {
          // Canonical order puts hiriq BEFORE dagesh, which stops the ccmp ligature from matching.
          // With a ligature base we lay out letter + dagesh + mark so the anchor is taken from the
          // ligature glyph, exactly as it will be drawn.
          const run = fk.layout(ligDagesh ? bc + '\u05BC' + m.char : bc + m.char);
          if (run && run.glyphs && run.positions && run.glyphs.length >= 2) {
            let pen = 0, bx = null, by = 0, mx = null, my = 0;
            run.glyphs.forEach((g, gi) => {
              const p = run.positions[gi];
              const isMark = (g.codePoints || []).includes(m.cp);
              if (isMark && mx === null)       { mx = pen + (p.xOffset || 0); my = p.yOffset || 0; }
              else if (!isMark && bx === null) { bx = pen + (p.xOffset || 0); by = p.yOffset || 0; }
              pen += p.xAdvance || 0;
            });
            if (mx !== null && bx !== null) {
              const lx = (mx - bx) * k, ly = (my - by) * k;
              // Vowels below the letter (05B0–05B8, 05BB): an exact 0,0 means this base has no anchor
              // (final nun / pe / tsadi) → use the fallback below. Holam, dagesh and the shin / sin dots
              // can legitimately be 0, so they are always accepted.
              const isUnder = (m.cp >= 0x05B0 && m.cp <= 0x05B8) || m.cp === 0x05BB;
              const unattached = isUnder && lx === 0 && ly === 0;
              if (!unattached && Math.abs(lx) < size * 1.5 && Math.abs(ly) < size * 1.5) {
                dx = lx;
                dy = ly;
                usedLayout = true;
              }
            }
          }
        } catch (_) { /* fall through */ }

        // 2) Explicit anchors from the base letter box (reliable for holam / kubutz / dagesh)
        if (!usedLayout) {
          // Horizontal: centre mark on base (holam on vav sits on the stem – still centre of the thin letter)
          dx = baseCenter - markMidX;

          if (m.cp === 0x05B9 || m.cp === 0x05BA) {
            // Holam – above the letter, slightly above the top of the base ink
            dy = (base.y1 + 0.12 * size) - markMidY;
          } else if (m.cp === 0x05BC) {
            // Dagesh – inside the letter body, a bit above geometric centre
            dy = (base.y0 + baseH * 0.45) - markMidY;
          } else if (m.cp === 0x05BB) {
            // Kubutz – below, same band as other under-marks
            dy = (base.y0 - 0.14 * size) - markMidY;
          } else {
            // Other under-marks (hiriq, patach, kamatz, segol, tsere, shva…)
            dy = (base.y0 - 0.14 * size) - markMidY;
          }
        }

        if (DEBUG && !markLogged.has(m.cp)) {
          markLogged.add(m.cp);
          console.info('[Otiyot] mark U+' + m.cp.toString(16).toUpperCase().padStart(4, '0'),
            { usedLayout, dx: +(dx / size).toFixed(3), dy: +(dy / size).toFixed(3) });
        }

        out.push({
          char: m.char, dx, dy,
          box: { x0: gb.x0 + dx, x1: gb.x1 + dx, y0: gb.y0 + dy, y1: gb.y1 + dy }
        });
      }
      return { baseCenter, base, marks: out };
    } catch (e) { console.warn('placeMarks failed', e); return null; }
  }

  function drawLetter(targetPage, ltr, x, y, fontSizeForDraw, cellWidth) {
    const w  = Math.max(cellWidth || (fontSizeForDraw * 0.65), 3);
    const bc = baseChar(ltr.char);

    if (dyslexiaFont && !ltr.isOther) {
      fontAttempted++;
      if (ltr._mode !== 'font') fontUnsupported++;
    }

    let cx = x + w / 2, geo = null, directColor = false;
    if (ltr._mode === 'font') {
      const drawSize = fontSizeForDraw * uniformScale;
      // yud / zayin + dagesh → draw the font's fused ligature glyph (dagesh baked in, stays black).
      const ligDagesh = (bc === '\u05D9' || bc === '\u05D6') && (ltr.marks || []).some(mk => mk.cp === 0x05BC);
      const baseText  = ligDagesh ? bc + '\u05BC' : bc;
      const naturalW = (() => { try { return dyslexiaFont.widthOfTextAtSize(baseText, drawSize); } catch { return w; } })();
      const xOffset  = (w - naturalW) / 2;
      const baseX    = x + xOffset;

      const validMarks = (ltr.marks && ltr.marks.length) ? ltr.marks.filter(mk => fontSupportsChar(mk.char)) : [];
      const placed = validMarks.length ? placeMarks(bc, validMarks, drawSize, ligDagesh) : null;

      if (placed) {
        // Base letter alone, then every mark on its own, centred over the letter.
        // (pdf-lib ignores the font's GPOS mark positioning, so bc + marks in one string
        // leaves the marks sitting at the pen position, not over the middle of the letter.)
        cx  = baseX + placed.baseCenter;
        geo = {
          body:  { x: baseX + placed.base.x0, y: y + placed.base.y0, w: placed.base.x1 - placed.base.x0, h: placed.base.y1 - placed.base.y0 },
          boxes: placed.marks.map(m => ({ x: baseX + m.box.x0, y: y + m.box.y0, w: m.box.x1 - m.box.x0, h: m.box.y1 - m.box.y0 })),
        };
        // "Niqqud only": we draw the glyphs ourselves, so colour the marks directly instead of
        // laying a tinted rectangle over them (a rectangle also tints any neighbouring letter ink,
        // which on thin letters like vav/yod showed up as a coloured block across the letter).
        // Vav + holam / shuruk: the vav itself takes the colour too. Opacity is mixed toward white.
        directColor = !!(settings.highlightMode === 'nikud' && ltr.markClass && ltr.color);
        let markRgb = rgb(0, 0, 0), baseRgb = rgb(0, 0, 0);
        if (directColor) {
          const { r, g, b } = hexToRgb(ltr.color);
          const op  = (settings.highlightOpacity || 100) / 100;
          const mix = v => v * op + (1 - op);
          markRgb = rgb(mix(r), mix(g), mix(b));
          if (ltr.colorLetter) baseRgb = markRgb;
        }
        // Dagesh colour: it owns the main colour when there is no vowel; otherwise it uses the dagesh colour.
        const nikudMode = settings.highlightMode === 'nikud';
        const mixRgb = hex => {
          const { r, g, b } = hexToRgb(hex), op = (settings.highlightOpacity || 100) / 100, mx = v => v * op + (1 - op);
          return rgb(mx(r), mx(g), mx(b));
        };
        const dagRgb = !nikudMode ? null
                     : (ltr.colorCp === 0x05BC && directColor) ? markRgb
                     : (ltr.dageshColor ? mixRgb(ltr.dageshColor) : null);
        const dagExtra = !!dagRgb && !(directColor && ltr.colorCp === 0x05BC);   // not already counted via directColor
        try { targetPage.drawText(baseText, { x: baseX, y, size: drawSize, font: dyslexiaFont, color: baseRgb }); } catch { /* skip */ }
        if (ligDagesh && dagRgb) {
          // the ligature's dagesh is baked in (black): paint a coloured one exactly over it
          const fkf = dyslexiaFont.embedder && dyslexiaFont.embedder.font, o = LIG_DAGESH_OVERLAY[bc];
          if (fkf && o) {
            const kk = drawSize / fkf.unitsPerEm;
            try { targetPage.drawText('\u05BC', { x: baseX + o.dx * kk, y: y + o.dy * kk, size: drawSize, font: dyslexiaFont, color: dagRgb }); } catch { /* skip */ }
            if (dagExtra) highlightCount++;
          }
        }
        for (const m of placed.marks) {
          // Dagesh → dagesh colour. Vowel → main colour (only the mark that owns it). The shin / sin dot is
          // NOT a niqqud and is never coloured.
          const mcp = m.char.codePointAt(0);
          let mc = rgb(0, 0, 0);
          if (mcp === 0x05BC) { if (dagRgb) { mc = dagRgb; if (dagExtra) highlightCount++; } }
          else if (directColor && mcp !== 0x05C1 && mcp !== 0x05C2 && (ltr.colorCp == null || mcp === ltr.colorCp)) mc = markRgb;
          try { targetPage.drawText(m.char, { x: baseX + m.dx, y: y + m.dy, size: drawSize, font: dyslexiaFont, color: mc }); }
          catch { /* skip */ }
        }
        if (directColor) highlightCount++;
      } else {
        const text = bc + validMarks.map(mk => mk.char).join('');
        try {
          targetPage.drawText(text, { x: baseX, y, size: drawSize, font: dyslexiaFont, color: rgb(0, 0, 0) });
        } catch {
          try { targetPage.drawText(bc, { x: baseX, y, size: drawSize, font: dyslexiaFont, color: rgb(0,0,0) }); }
          catch { /* skip */ }
        }
        const gc = glyphCenter(bc, drawSize);
        if (gc !== null) cx = baseX + gc;
      }
    } else if (ltr._mode === 'clone') {
      drawClone(targetPage, ltr, x, y);
    }

    if (ltr.color && !directColor && !ltr._streamColored) paintHighlight(targetPage, ltr, x, y, w, fontSizeForDraw, cx, geo);
  }

  // (No white-out pass any more: originals were removed from the content stream above.)

  // PHASE 2: Layout & redraw pass
  const lettersByPage = new Map();
  for (const l of renderLetters) {
    if (!lettersByPage.has(l.page)) lettersByPage.set(l.page, []);
    lettersByPage.get(l.page).push(l);
  }
  for (let pi = 0; pi < pages.length; pi++) {
    await tick();
    const originalPage = pages[pi];

    const pageLetters = lettersByPage.get(pi) || [];
    for (const ltr of pageLetters) {
      drawLetter(originalPage, ltr, ltr.x, ltr.y, ltr.fontSize, ltr.origW);
    }

    const words = pageWordStreams[pi];
    if (spacing > 0 && words && words.length) {
      const { width: pageW, height: pageH } = originalPage.getSize();

      const naturalWidthCache = new Map();
      function naturalLetterWidth(ltr) {
        if (ltr._mode !== 'font') return ltr.origW;
        const cacheKey = ltr.char + '@' + ltr.fontSize;
        if (naturalWidthCache.has(cacheKey)) return naturalWidthCache.get(cacheKey);
        let w = ltr.origW;
        try { w = dyslexiaFont.widthOfTextAtSize(baseChar(ltr.char), ltr.fontSize); } catch { /* keep fallback */ }
        naturalWidthCache.set(cacheKey, w);
        return w;
      }

      const plan    = planReflow(words, pageH, spacing, naturalLetterWidth);
      const targets = [originalPage];
      const targetFor = n => {
        while (targets.length <= n) {
          // look the index up each time: earlier pages' overflow may have shifted it
          const idx = existingDoc.getPages().indexOf(targets[targets.length - 1]);
          targets.push(existingDoc.insertPage(idx + 1, [pageW, pageH]));
        }
        return targets[n];
      };
      for (const p of plan) drawLetter(targetFor(p.pg), p.ltr, p.x, p.y, p.ltr.fontSize, naturalLetterWidth(p.ltr));
    }

    setProgress(65 + Math.round(((pi + 1) / pages.length) * 25), 'Drawing…', 4);
  }

  const fontApplied = !!dyslexiaFont;

  if (settings.fontEnabled && !fontApplied) {
    showError(fontWarning || 'Dyslexia font could not be applied to this PDF.');
  } else if (fontApplied && fontAttempted > 0 && fontUnsupported / fontAttempted > 0.5) {
    showError(
      `Dyslexia font loaded, but couldn't render ${fontUnsupported} of ${fontAttempted} letters — ` +
      `those were left in the original font. The .otf file may not have full Hebrew glyph coverage.`
    );
  }

  setProgress(92, 'Generating file…', 5);

  const pdfBytes = await existingDoc.save();
  const blob     = new Blob([pdfBytes], { type: 'application/pdf' });
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(blob);

  setProgress(100, 'Done!', 5);
  steps.forEach(s => s.classList.add('done'));
  resultCard.classList.add('visible');

  const finalPageCount = existingDoc.getPageCount();
  const feats = [];
  if (settings.colorNekudot) feats.push(`${highlightCount} niqqud ${settings.highlightMode === 'nikud' ? 'colored' : 'highlighted'}`);
  if (settings.fontEnabled && fontApplied) feats.push('dyslexia font applied');
  if (settings.letterSpacing > 0) feats.push(`+${settings.letterSpacing}px spacing, reflowed`);
  const pageNote = finalPageCount > numPages ? ` (expanded from ${numPages} to ${finalPageCount} pages)` : '';
  resultSub.textContent = `${finalPageCount} page${finalPageCount > 1 ? 's' : ''}${pageNote} · ${feats.join(' · ') || 'no features active'} · Ready to print`;

  downloadBtn.classList.add('visible');
  processBtn.disabled = false;

  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = (selectedFile?.name || 'document').replace(/\.pdf$/i, '') + '_otiyot.pdf';
  a.click();
}
