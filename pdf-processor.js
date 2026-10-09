// pdf-processor.js — Otiyot+ PDF colorizer v1.8.2
// ES module — loaded via <script type="module"> in pdf-processor.html

import * as pdfjsLib from './lib/pdf.min.mjs';

const _wu = chrome.runtime.getURL('lib/pdf.worker.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([`import '${_wu}';`], {type:'application/javascript'}));

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
function classifyShva(isWordInitial, isWordFinal, prevDominantNikud, hasDagesh) {
  if (isWordInitial) return 'SHVA_NA';
  if (isWordFinal)   return 'SHVA_NACH';                       // word-final shva is silent
  if (prevDominantNikud === SHVA_CHAR) return 'SHVA_NA';       // 2nd of two shvas mid-word
  if (prevDominantNikud && '\u05B4\u05B5\u05B8\u05B9\u05BB'.includes(prevDominantNikud)) return 'SHVA_NA';
  if (hasDagesh) return 'SHVA_NA';
  return 'SHVA_NACH';
}
function settingKeyFor(colourKey) {
  return colourKey.length === 1
    ? 'nikud_' + colourKey.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
    : 'nikud_' + colourKey.toLowerCase().replace(/ /g, '_');
}
async function canvasToPngBytes(canvas) {
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Uint8Array(canvas.toBuffer('image/png'));   // node-canvas style (tests)
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
  highlightMode: 'block',
  highlightOpacity: 100,
  nikud_shva_na: true, nikud_shva_nach: true,
  nikud_05B4: true, nikud_05B5: true, nikud_05B6: true,
  nikud_05B7: true, nikud_05B8: true, nikud_05B9: true,
  nikud_05BB: true, nikud_05BC: true,
  nikudColors: {},
};

let settings = { ...DEFAULTS };

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
  setModeButtons(settings.highlightMode);
  pdfOpacityRange.value       = settings.highlightOpacity;
  pdfOpacityVal.textContent   = settings.highlightOpacity + '%';
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
modeBlock.addEventListener('click', () => { setModeButtons('block'); readUIToSettings(); });
modeNikud.addEventListener('click', () => { setModeButtons('nikud'); readUIToSettings(); });

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
  if (!file || file.type !== 'application/pdf') { showError('Please select a valid PDF file.'); return; }
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
  const pdfDoc   = await pdfjsLib.getDocument({ data: originalBytes.slice() }).promise;
  const numPages = pdfDoc.numPages;

  setProgress(20, 'Extracting character positions…', 1);

  const pageData = [];
  for (let p = 1; p <= numPages; p++) {
    const page    = await pdfDoc.getPage(p);
    const content = await page.getTextContent({ includeMarkedContent: false });
    pageData.push({ items: content.items });
    setProgress(20 + Math.round((p / numPages) * 20), `Extracting page ${p}…`, 1);
  }

  setProgress(45, 'Classifying niqqud…', 2);

  const spacing = settings.letterSpacing > 0 ? settings.letterSpacing : 0;   // works with or without the font

  const renderLetters = [];
  const pageWordStreams = [];

  for (let pi = 0; pi < pageData.length; pi++) {
    const { items } = pageData[pi];
    const wordStream = [];
    pageWordStreams.push(wordStream);

    const allChars = [];
    for (const item of items) {
      if (!item.str) continue;
      const [a, , , d, tx] = item.transform;
      const ty       = item.transform[5];
      const fontSize = Math.abs(d) || Math.abs(a) || 12;
      const chars    = [...item.str.replace(/[\uFB1D-\uFB4E]/g, c => c.normalize('NFD'))];
      if (chars.length === 0) continue;

      const letterWidths = chars.map(ch => {
        const c = ch.codePointAt(0);
        if (c === 0x05BE) return 1;
        return isZeroWidthMark(c) ? 0 : 1;
      });
      const totalUnits   = letterWidths.reduce((s, w) => s + w, 0) || 1;
      const unitWidth    = item.width / totalUnits;
      const isRTL        = item.dir === 'rtl';

      let cursor = 0;
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const cp = ch.codePointAt(0);
        const w  = letterWidths[i] * unitWidth;
        let x0, x1;
        if (isRTL) { x0 = tx + item.width - cursor - w; x1 = tx + item.width - cursor; }
        else       { x0 = tx + cursor; x1 = tx + cursor + w; }
        allChars.push({ char: ch, cp, x0, x1, y: ty, fontSize, isHebrew: isHebrewLetter(cp), isMark: isZeroWidthMark(cp) });
        cursor += w;
      }
    }

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
      const vavColorOf = new Map();   // vav + holam / shuruk: the letter itself takes the niqqud colour
      let prevDominantNikud = null;
      letters.forEach((ltr, i) => {
        const nkList = letterNikudMap.get(ltr) || [];
        // Mirrors content.js: a real vowel always wins over dagesh; vav + dagesh
        // with no vowel is shuruk (Kubutz colour); other letter + dagesh = Dagesh.
        const realVowel = nkList.find(nk => nk.cp >= 0x05B0 && nk.cp <= 0x05BB && nk.cp !== 0x05BA);
        const hasDagesh = nkList.some(nk => nk.cp === 0x05BC);
        let rawNikud = realVowel ? realVowel.char : null;
        if (rawNikud === null && hasDagesh) rawNikud = (ltr.char === '\u05D5') ? '\u05BB' : '\u05BC';

        // Where the mark physically sits (for "niqqud only" mode)
        let markClass = null;
        if (realVowel) markClass = (realVowel.cp === 0x05B9) ? 'above' : 'below';
        else if (hasDagesh) markClass = 'inside';
        classOf.set(ltr, markClass);

        // Mirrors content.js isColoredVav(): holam on vav, or shuruk (vav + dagesh, no vowel).
        // Vav with dagesh AND a vowel is a dagesh chazak, so the letter stays uncoloured.
        vavColorOf.set(ltr, ltr.char === '\u05D5' &&
          (rawNikud === '\u05B9' || (!realVowel && hasDagesh)));

        let colourKey = null;
        if (rawNikud === SHVA_CHAR)      colourKey = classifyShva(wordInitial[i], wordFinal[i], prevDominantNikud, hasDagesh);
        else if (HATAF_MAP[rawNikud])    colourKey = HATAF_MAP[rawNikud];
        else if (rawNikud)               colourKey = rawNikud;

        prevDominantNikud = rawNikud;

        let color = null;
        if (settings.colorNekudot && colourKey) {
          const sk = settingKeyFor(colourKey);
          if (settings[sk] !== false) color = colorFor(sk) || NIKUD_COLORS[colourKey] || null;
        }
        colorOf.set(ltr, color);
      });

      const mkCell = (ltr, extra) => ({
        page: pi, srcPage: pi, x: ltr.x0, y: ltr.y, fontSize: ltr.fontSize,
        char: ltr.char, origW: ltr.x1 - ltr.x0, color: colorOf.get(ltr) || null,
        markClass: classOf.get(ltr) || null,
        colorLetter: vavColorOf.get(ltr) || false,
        whiteoutX: ltr.x0, whiteoutY: ltr.y, whiteoutFontSize: ltr.fontSize,
        whiteoutW: ltr.x1 - ltr.x0,
        gapAbove, gapBelow,
        marks: letterNikudMap.get(ltr) || [], ...extra,
      });

      if (spacing === 0) {
        for (const ltr of letters) renderLetters.push(mkCell(ltr));
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

  const { PDFDocument, rgb } = PDFLib;
  const existingDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const opacity = ((settings.highlightOpacity || 55) / 100) * 0.90;

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

  let uniformScale = 1;
  if (dyslexiaFont && spacing === 0) {
    // Compare TOTAL widths. The old code shrank everything to fit the single widest
    // glyph (origW is an equal-split estimate, so wide letters always look "too wide"),
    // which made the whole document's letters small.
    let sumOrig = 0, sumNat = 0;
    for (const ltr of renderLetters) {
      if (!ltr.origW || ltr.origW <= 0) continue;
      const bc = baseChar(ltr.char);
      if (!fontSupportsChar(bc)) continue;
      try {
        sumNat  += dyslexiaFont.widthOfTextAtSize(bc, ltr.fontSize);
        sumOrig += ltr.origW;
      } catch { /* ignore */ }
    }
    if (sumOrig > 0 && sumNat > 0) uniformScale = Math.max(0.85, Math.min(1, sumOrig / sumNat));
  }

  setProgress(65, 'Drawing…', 4);

  let highlightCount = 0;
  let fontAttempted = 0;
  let fontUnsupported = 0;

  const pages = existingDoc.getPages();
  const PAGE_MARGIN = 40;
  const { pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = PDFLib;

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
    return spacing > 0 ? 'clone' : null;
  }
  const allCells = [...renderLetters, ...pageWordStreams.flat(2)];
  let needClone = false;
  for (const c of allCells) { c._mode = chooseMode(c); if (c._mode === 'clone') needClone = true; }

  // One transparent high-resolution render of each source page (taken BEFORE anything is
  // erased). Stamping cell-sized slices of a single image is cheap for every PDF viewer;
  // stamping the original page content once per letter would take minutes to open.
  let rasters = null;
  if (needClone) {
    rasters = [];
    for (let pi = 0; pi < pages.length; pi++) {
      setProgress(60 + Math.round((pi / pages.length) * 4), `Preserving original lettering, page ${pi + 1}…`, 3);
      const jsPage = await pdfDoc.getPage(pi + 1);
      const base   = jsPage.getViewport({ scale: 1 });
      const sc     = Math.min(5, Math.sqrt(14e6 / (base.width * base.height)));   // ≈360 dpi, capped
      const vp     = jsPage.getViewport({ scale: sc });
      const canvas = document.createElement('canvas');
      canvas.width  = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      await jsPage.render({ canvasContext: canvas.getContext('2d'), viewport: vp, background: 'rgba(0,0,0,0)' }).promise;
      const bytes = await canvasToPngBytes(canvas);
      const img   = await existingDoc.embedPng(bytes);
      const mb    = pages[pi].getMediaBox();
      rasters.push({ img, w: base.width, h: base.height, x: mb.x, y: mb.y });
    }
  }

  // How far above / below the baseline a cell may erase or stamp. Clamped by the distance
  // to the neighbouring lines so tight line spacing no longer bites into other lines.
  function cellBands(ltr) {
    const fs   = ltr.whiteoutFontSize;
    const up   = Math.max(0.95 * fs, Math.min(1.15 * fs, ltr.gapAbove - 0.30 * fs));
    const down = Math.max(0.30 * fs, Math.min(0.45 * fs, ltr.gapBelow - 1.00 * fs));
    return { up, down };
  }

  function drawWhiteout(originalPage, ltr, cellWidth, wide) {
    if (!ltr._mode) return;          // nothing will replace this glyph — leave it untouched
    const padX = ltr.whiteoutFontSize * 0.08;
    const woW  = (wide ? Math.max((ltr.whiteoutW || cellWidth) * 1.3, 3) : Math.max(ltr.whiteoutW || cellWidth, 3)) + (padX * 2);
    const bands = cellBands(ltr);
    const woh  = bands.up + bands.down;
    const woy  = ltr.whiteoutY - bands.down;
    const wox  = (wide ? ltr.whiteoutX - ltr.whiteoutFontSize * 0.15 : ltr.whiteoutX) - padX;

    try { originalPage.drawRectangle({ x: wox, y: woy, width: woW, height: woh, color: rgb(1,1,1), opacity: 1 }); }
    catch { /* skip */ }
  }

  // Stamp the original glyph (clipped to its own cell) at a new position.
  function drawClone(targetPage, ltr, x, y) {
    const fs  = ltr.whiteoutFontSize;
    const pad = fs * 0.06;
    const dx  = x - ltr.whiteoutX;
    const dy  = y - ltr.whiteoutY;
    const rs  = rasters[ltr.srcPage];
    try {
      targetPage.pushOperators(
        pushGraphicsState(),
        rectangle(ltr.whiteoutX - pad + dx, ltr.whiteoutY - cellBands(ltr).down + dy, ltr.whiteoutW + pad * 2, cellBands(ltr).up + cellBands(ltr).down),
        clip(), endPath(),
      );
      targetPage.drawImage(rs.img, { x: rs.x + dx, y: rs.y + dy, width: rs.w, height: rs.h });
      targetPage.pushOperators(popGraphicsState());
    } catch (e) { console.warn('clone failed', e); }
  }

  // Vertical bands (in font-size units, relative to the baseline) where each kind of
  // vowel mark sits. Letters themselves live roughly in 0 … 0.6.
  const NIKUD_BANDS = {
    below:  { y0: -0.27, y1: -0.01 },
    above:  { y0:  0.60, y1:  0.98 },
    inside: { y0:  0.10, y1:  0.42 },
  };

  function paintHighlight(targetPage, ltr, x, y, w, fs) {
    const { r, g, b } = hexToRgb(ltr.color);
    if (settings.highlightMode === 'nikud' && ltr.markClass) {
      // "Niqqud only": tint just the band where the mark is drawn. 'Screen' turns black
      // ink into the colour and leaves white paper white, so the letter stays black.
      const band = NIKUD_BANDS[ltr.markClass];
      const bw   = Math.max(w + fs * 0.16, fs * 0.45);
      const bx   = x + w / 2 - bw / 2;
      const opts = { x: bx, y: y + band.y0 * fs, width: bw, height: (band.y1 - band.y0) * fs,
                     color: rgb(r, g, b), opacity: (settings.highlightOpacity || 100) / 100 };
      try { targetPage.drawRectangle({ ...opts, blendMode: 'Screen' }); highlightCount++; }
      catch { /* skip */ }
      // Vav with holam / shuruk: tint the vav body too (same Screen blend, so only ink changes)
      if (ltr.colorLetter) {
        try {
          targetPage.drawRectangle({ x, y: y - 0.02 * fs, width: Math.max(w, 3), height: 0.66 * fs,
                                     color: rgb(r, g, b), opacity: (settings.highlightOpacity || 100) / 100,
                                     blendMode: 'Screen' });
        } catch { /* skip */ }
      }
      return;
    }
    const opts = { x, y: y - fs * 0.12, width: w, height: fs * 1.10, color: rgb(r, g, b), opacity };
    try { targetPage.drawRectangle({ ...opts, blendMode: 'Multiply' }); highlightCount++; }
    catch { try { targetPage.drawRectangle(opts); highlightCount++; } catch { /* skip */ } }
  }

  function drawLetter(targetPage, ltr, x, y, fontSizeForDraw, cellWidth) {
    const w  = Math.max(cellWidth || (fontSizeForDraw * 0.65), 3);
    const bc = baseChar(ltr.char);

    if (dyslexiaFont && !ltr.isOther) {
      fontAttempted++;
      if (ltr._mode !== 'font') fontUnsupported++;
    }

    if (ltr._mode === 'font') {
      const drawSize = fontSizeForDraw * uniformScale;
      const naturalW = (() => { try { return dyslexiaFont.widthOfTextAtSize(bc, drawSize); } catch { return w; } })();
      const xOffset  = (w - naturalW) / 2;

      // Combine base character and diacritics into a single grapheme cluster for OpenType mark positioning
      const validMarks = (ltr.marks && ltr.marks.length)
        ? ltr.marks.filter(mk => fontSupportsChar(mk.char)).map(mk => mk.char).join('')
        : '';
      try {
        targetPage.drawText(bc + validMarks, { x: x + xOffset, y, size: drawSize, font: dyslexiaFont, color: rgb(0, 0, 0) });
      } catch {
        try { targetPage.drawText(bc, { x: x + xOffset, y, size: drawSize, font: dyslexiaFont, color: rgb(0,0,0) }); }
        catch { /* skip */ }
      }
    } else if (ltr._mode === 'clone') {
      drawClone(targetPage, ltr, x, y);
    }

    if (ltr.color) paintHighlight(targetPage, ltr, x, y, w, fontSizeForDraw);
  }

  // PHASE 1: Whiteout pass
  for (let pi = 0; pi < pages.length; pi++) {
    for (const ltr of renderLetters.filter(l => l.page === pi)) {
      drawWhiteout(pages[pi], ltr, ltr.origW, false);
    }
    const words = pageWordStreams[pi];
    if (words) for (const word of words) for (const ltr of word) {
      drawWhiteout(pages[pi], ltr, ltr.whiteoutW, true);
    }
  }

  // PHASE 2: Layout & redraw pass
  for (let pi = 0; pi < pages.length; pi++) {
    const originalPage = pages[pi];

    const pageLetters = renderLetters.filter(l => l.page === pi);
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
