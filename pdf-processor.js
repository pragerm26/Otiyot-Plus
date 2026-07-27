// pdf-processor.js — Otiyot+ PDF colorizer v1.2.0
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
  { char: 'ִ', key: 'nikud_05b4', label: 'Hiriq',   color: '#ff9900' },
  { char: 'ֵ', key: 'nikud_05b5', label: 'Tsere',   color: '#cccc00' },
  { char: 'ֶ', key: 'nikud_05b6', label: 'Segol',   color: '#00cc00' },
  { char: 'ַ', key: 'nikud_05b7', label: 'Patach',  color: '#6aa84f' },
  { char: 'ָ', key: 'nikud_05b8', label: 'Kamatz',  color: '#6fa8dc' },
  { char: 'ֹ', key: 'nikud_05b9', label: 'Holam',   color: '#0000ff' },
  { char: 'ֻ', key: 'nikud_05bb', label: 'Kubutz',  color: '#9900ff' },
  { char: 'ּ', key: 'nikud_05bc', label: 'Dagesh',  color: '#ff00ff' },
];

const NIKUD_COLORS = {
  'SHVA_NA': '#cc0000', 'SHVA_NACH': '#ff88aa',
  'ִ': '#ff9900', 'ֵ': '#cccc00',
  'ֶ': '#00cc00', 'ַ': '#6aa84f',
  'ָ': '#6fa8dc', 'ֹ': '#0000ff',
  'ֻ': '#9900ff', 'ּ': '#ff00ff',
};
const HATAF_MAP = { 'ֱ': 'ֶ', 'ֲ': 'ַ', 'ֳ': 'ָ' };
const ALL_NIKUD = new Set([
  ...Object.keys(NIKUD_COLORS).filter(k => k.length === 1),
  SHVA_CHAR, ...Object.keys(HATAF_MAP),
]);

function isHebrewLetter(cp) {
  return (cp >= 0x05D0 && cp <= 0x05EA) || (cp >= 0xFB1D && cp <= 0xFB4E);
}
function isNikudOrCantillation(cp) {
  return (cp >= 0x0591 && cp <= 0x05C7);
}

function classifyShva(letterIndex, letters, prevNikud) {
  if (letterIndex === 0) return 'SHVA_NA';
  const prevLetter = letters[letterIndex - 1];
  if (!prevLetter || prevLetter.isSpace) return 'SHVA_NA';
  if (prevNikud && 'ִֵָֹֻ'.includes(prevNikud)) return 'SHVA_NA';
  if (letterIndex === letters.length - 1) return 'SHVA_NACH';
  if (letters[letterIndex + 1]?.isSpace) return 'SHVA_NACH';
  return 'SHVA_NACH';
}

function getColor(nikud, letterIndex, letters, prevNikud, settings) {
  if (!settings.colorNekudot) return null;
  let key = null;
  if (nikud === SHVA_CHAR)   key = classifyShva(letterIndex, letters, prevNikud);
  else if (HATAF_MAP[nikud]) key = HATAF_MAP[nikud];
  else if (nikud)            key = nikud;
  if (!key) return null;
  const sk = key.length === 1
    ? 'nikud_' + key.codePointAt(0).toString(16).padStart(4, '0')
    : 'nikud_' + key.toLowerCase().replace(/ /g, '_');
  if (settings[sk] === false) return null;
  return NIKUD_COLORS[key] || null;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16)/255, g: parseInt(h.slice(2,4),16)/255, b: parseInt(h.slice(4,6),16)/255 };
}

// ---------------------------------------------------------------------------
// DEFAULT SETTINGS
// ---------------------------------------------------------------------------
const DEFAULTS = {
  colorNekudot: true,
  fontEnabled: false,
  letterSpacing: 0,
  highlightOpacity: 55,
  nikud_shva_na: true, nikud_shva_nach: true,
  nikud_05b4: true, nikud_05b5: true, nikud_05b6: true,
  nikud_05b7: true, nikud_05b8: true, nikud_05b9: true,
  nikud_05bb: true, nikud_05bc: true,
};

// Current settings (populated on load, editable via UI)
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
// BUILD PER-VOWEL ROWS
// ---------------------------------------------------------------------------
NIKUD_LIST.forEach(({ char, key, label, color }) => {
  const row = document.createElement('div');
  row.className = 'nikud-row';
  row.innerHTML = `
    <span class="nikud-swatch" style="background:${color}"></span>
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
});

// ---------------------------------------------------------------------------
// LOAD SETTINGS FROM STORAGE
// ---------------------------------------------------------------------------
chrome.storage.sync.get(DEFAULTS, res => {
  settings = { ...DEFAULTS, ...res };
  applySettingsToUI();
});

function applySettingsToUI() {
  pdfColorToggle.checked      = settings.colorNekudot;
  pdfFontToggle.checked       = settings.fontEnabled;
  pdfSpacingRange.value       = settings.letterSpacing;
  pdfSpacingVal.textContent   = settings.letterSpacing + ' px';
  pdfOpacityRange.value       = settings.highlightOpacity;
  pdfOpacityVal.textContent   = settings.highlightOpacity + '%';
  NIKUD_LIST.forEach(({ key }) => {
    if (nikudCheckboxes[key]) nikudCheckboxes[key].checked = settings[key] !== false;
  });
}

function readUIToSettings() {
  settings.colorNekudot    = pdfColorToggle.checked;
  settings.fontEnabled     = pdfFontToggle.checked;
  settings.letterSpacing   = parseInt(pdfSpacingRange.value, 10);
  settings.highlightOpacity= parseInt(pdfOpacityRange.value, 10);
  NIKUD_LIST.forEach(({ key }) => {
    if (nikudCheckboxes[key]) settings[key] = nikudCheckboxes[key].checked;
  });
}

// ---------------------------------------------------------------------------
// LIVE UI EVENTS
// ---------------------------------------------------------------------------
pdfColorToggle.addEventListener('change', readUIToSettings);
pdfFontToggle.addEventListener('change', readUIToSettings);

pdfSpacingRange.addEventListener('input', () => {
  pdfSpacingVal.textContent = pdfSpacingRange.value + ' px';
  readUIToSettings();
});

pdfOpacityRange.addEventListener('input', () => {
  pdfOpacityVal.textContent = pdfOpacityRange.value + '%';
  readUIToSettings();
});

expandBtn.addEventListener('click', () => {
  const open = nikudPanel.classList.toggle('open');
  expandChevron.textContent = open ? '▲' : '▼';
});

bulkOn.addEventListener('click', () => {
  Object.values(nikudCheckboxes).forEach(cb => cb.checked = true);
  readUIToSettings();
});
bulkOff.addEventListener('click', () => {
  Object.values(nikudCheckboxes).forEach(cb => cb.checked = false);
  readUIToSettings();
});

// Save settings back to the extension
saveSettingsBtn.addEventListener('click', () => {
  readUIToSettings();
  chrome.storage.sync.set(settings, () => {
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
    const vp      = page.getViewport({ scale: 1 });
    const content = await page.getTextContent({ includeMarkedContent: false });
    pageData.push({ items: content.items, pageHeight: vp.height, pageWidth: vp.width });
    setProgress(20 + Math.round((p / numPages) * 20), `Extracting page ${p}…`, 1);
  }

  setProgress(45, 'Classifying niqqud…', 2);

  const highlights  = []; // { page, x, y, w, h, r, g, b }
  const fontLetters = []; // { page, x, y, fontSize, char } — for dyslexia font overlay

  for (let pi = 0; pi < pageData.length; pi++) {
    const { items, pageHeight } = pageData[pi];

    const allChars = [];
    for (const item of items) {
      if (!item.str) continue;
      const [a, , , d, tx] = item.transform;
      const ty             = item.transform[5];
      const fontSize       = Math.abs(d) || Math.abs(a) || 12;
      const chars          = [...item.str];
      if (chars.length === 0) continue;

      const letterWidths = chars.map(ch => isNikudOrCantillation(ch.codePointAt(0)) ? 0 : 1);
      const totalUnits   = letterWidths.reduce((a, b) => a + b, 0) || 1;
      const unitWidth    = item.width / totalUnits;
      const isRTL        = item.dir === 'rtl';

      let cursorFromLeft = 0;
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const cp = ch.codePointAt(0);
        const w  = letterWidths[i] * unitWidth;
        const isNikud  = isNikudOrCantillation(cp);
        const isHebrew = isHebrewLetter(cp);
        let x0, x1;
        if (isRTL) {
          x0 = tx + item.width - cursorFromLeft - w;
          x1 = tx + item.width - cursorFromLeft;
        } else {
          x0 = tx + cursorFromLeft;
          x1 = tx + cursorFromLeft + w;
        }
        allChars.push({ char: ch, cp, x0, x1, y: ty, fontSize, isHebrew, isNikud });
        cursorFromLeft += w;
      }
    }

    // 4pt bucket — keeps cantillation marks (1-2pt off baseline) in same line bucket.
    // Adjacent lines are always ≥14pt apart so no risk of merging real lines.
    const lineMap = new Map();
    for (const c of allChars) {
      const lineKey = Math.floor(c.y / 4) * 4;
      if (!lineMap.has(lineKey)) lineMap.set(lineKey, []);
      lineMap.get(lineKey).push(c);
    }

    // Measure actual gaps between lines for word-wrap line height
    const lineKeys = Array.from(lineMap.keys()).sort((a, b) => b - a);
    const lineGapMap = new Map();
    for (let i = 0; i < lineKeys.length - 1; i++) {
      lineGapMap.set(lineKeys[i], lineKeys[i] - lineKeys[i + 1]);
    }
    if (lineKeys.length > 1) {
      lineGapMap.set(lineKeys[lineKeys.length - 1],
        lineGapMap.get(lineKeys[lineKeys.length - 2]));
    }

    for (const [lineKey, lineChars] of lineMap) {
      const letters    = lineChars.filter(c => c.isHebrew);
      const nikudChars = lineChars.filter(c => c.isNikud && ALL_NIKUD.has(c.char));

      if (letters.length === 0) continue;

      // Associate niqqud with letters using x-overlap (same approach as content.js).
      // Niqqud x0 always falls inside its letter's x0..x1 range in the PDF stream.
      const letterNikudMap = new Map();
      for (const nk of nikudChars) {
        const cp = nk.cp;
        if (cp === 0x05BD || cp === 0x05BE) continue; // skip meteg/maqaf
        const nkX = nk.x0;
        let bestIdx = -1, bestDist = Infinity;
        for (let li = 0; li < letters.length; li++) {
          const ltr = letters[li];
          if (nkX >= ltr.x0 - 1 && nkX <= ltr.x1 + 1) {
            const dist = Math.abs(nkX - (ltr.x0 + ltr.x1) / 2);
            if (dist < bestDist) { bestDist = dist; bestIdx = li; }
          }
        }
        if (bestIdx < 0) { // fallback: closest within 8px
          for (let li = 0; li < letters.length; li++) {
            const dist = Math.abs(nk.x0 - (letters[li].x0 + letters[li].x1) / 2);
            if (dist < bestDist && dist < 8) { bestDist = dist; bestIdx = li; }
          }
        }
        if (bestIdx >= 0) {
          if (!letterNikudMap.has(bestIdx)) letterNikudMap.set(bestIdx, []);
          letterNikudMap.get(bestIdx).push(nk);
        }
      }

      let prevNikud = null;
      const letterObjects = letters.map((l, i) => ({ ...l, index: i }));

      // Spacing only works when font overlay is on (we redraw at new positions).
      const spacing = (settings.fontEnabled && settings.letterSpacing > 0)
        ? settings.letterSpacing : 0;

      // Helper: resolve primary vowel color for a letter
      function resolveColor(li) {
        const nkList = letterNikudMap.get(li) || [];
        const vowels = nkList.filter(nk => nk.cp >= 0x05B0 && nk.cp <= 0x05BC);
        let primaryNikud = null;
        for (const nk of vowels) {
          const testKey = nk.char === SHVA_CHAR ? null
                        : HATAF_MAP[nk.char] ? HATAF_MAP[nk.char] : nk.char;
          if (testKey && NIKUD_COLORS[testKey]) { primaryNikud = nk.char; break; }
          if (nk.char === SHVA_CHAR) { primaryNikud = nk.char; break; }
        }
        const color = getColor(primaryNikud, li, letterObjects, prevNikud, settings);
        if (primaryNikud) prevNikud = primaryNikud;
        return color;
      }

      if (spacing === 0) {
        // ── No spacing: highlights at original positions ─────────────────────
        for (let li = 0; li < letterObjects.length; li++) {
          const letter = letterObjects[li];
          const color  = resolveColor(li);
          if (color) {
            const { r, g, b } = hexToRgb(color);
            highlights.push({ page: pi,
              x: letter.x0, y: letter.y - letter.fontSize * 0.15,
              w: Math.max(letter.x1 - letter.x0, 4), h: letter.fontSize * 1.05,
              r, g, b });
          }
          if (settings.fontEnabled) {
            fontLetters.push({ page: pi, x: letter.x0, y: letter.y,
              fontSize: letter.fontSize, char: letter.char,
              origW: letter.x1 - letter.x0 });
          }
        }

      } else {
        // ── Spacing ON: word-aware RTL wrap (mirrors content.js word grouping) ─
        // Sort visually right→left for RTL
        const sorted = [...letterObjects].sort((a, b) => b.x1 - a.x1);

        // Group into words by detecting inter-word gaps (same idea as content.js
        // detecting non-Hebrew chars between words)
        const wordThresh = letters[0].fontSize * 0.6;
        const words = [];
        let cur = [];
        for (let i = 0; i < sorted.length; i++) {
          if (i === 0) { cur.push(sorted[i]); continue; }
          if (sorted[i-1].x0 - sorted[i].x1 > wordThresh) { words.push(cur); cur = [sorted[i]]; }
          else cur.push(sorted[i]);
        }
        if (cur.length) words.push(cur);

        const lineX0 = Math.min(...letters.map(l => l.x0));
        const lineX1 = Math.max(...letters.map(l => l.x1));
        const lineY  = letters[0].y;
        const lineH  = letters[0].fontSize;
        const measuredGap = lineGapMap.get(lineKey) || lineH * 1.5;
        const lineGap = Math.min(measuredGap * 0.85, lineH * 1.4);
        const wordGap = lineH * 0.35;

        let cursorX = lineX1, curLine = 0, firstWord = true;

        for (const word of words) {
          // Width of this word WITH spacing applied between its letters
          const wordW = word.reduce((s, l) => s + (l.x1 - l.x0), 0)
                      + spacing * Math.max(word.length - 1, 0);

          // Keep whole word on one line — if it doesn't fit, wrap the WHOLE word
          if (!firstWord && cursorX - wordW < lineX0) {
            curLine++;
            cursorX = lineX1;
            firstWord = true;
          }

          // Place letters right→left within the word
          let lc = cursorX;
          for (const letter of word) {
            const origW = letter.x1 - letter.x0;
            const lx0   = lc - origW;
            const ly    = lineY - curLine * lineGap;
            const color = resolveColor(letter.index);
            if (color) {
              const { r, g, b } = hexToRgb(color);
              highlights.push({ page: pi,
                x: lx0, y: ly - lineH * 0.15,
                w: Math.max(origW, 4), h: lineH * 1.05,
                r, g, b });
            }
            if (settings.fontEnabled) {
              fontLetters.push({ page: pi, x: lx0, y: ly,
                fontSize: lineH, char: letter.char, origW });
            }
            lc -= origW + spacing;
          }
          cursorX = lc - wordGap;
          firstWord = false;
        }
      }
    }
  }

  setProgress(65, 'Rebuilding PDF with colors…', 3);

  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const existingDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const pages       = existingDoc.getPages();
  const opacity     = ((settings.highlightOpacity || 55) / 100) * 0.90;

  // Draw niqqud color highlights
  for (let pi = 0; pi < pages.length; pi++) {
    const page           = pages[pi];
    const pageHighlights = highlights.filter(h => h.page === pi);
    for (const hl of pageHighlights) {
      try {
        page.drawRectangle({
          x: hl.x, y: hl.y, width: hl.w, height: hl.h,
          color: rgb(hl.r, hl.g, hl.b),
          opacity,
          blendMode: 'Multiply',
        });
      } catch {
        try {
          page.drawRectangle({ x: hl.x, y: hl.y, width: hl.w, height: hl.h, color: rgb(hl.r, hl.g, hl.b), opacity });
        } catch { /* skip */ }
      }
    }
    setProgress(65 + Math.round(((pi + 1) / pages.length) * 15), 'Adding highlights…', 3);
  }

  // Apply dyslexia font overlay
  setProgress(82, 'Applying dyslexia font…', 4);
  let fontApplied = false;
  let fontWarning = null;
  if (settings.fontEnabled && fontLetters.length > 0) {
    // pdf-lib only supports the 14 standard PDF fonts out of the box.
    // For any custom OTF/TTF we must register a fontkit instance first,
    // otherwise embedFont() throws and the feature silently fails.
    if (!window.fontkit) {
      fontWarning = 'Dyslexia font skipped: fontkit library not loaded. ' +
                    'Place lib/fontkit.umd.min.js in the extension folder and reload.';
      console.warn(fontWarning);
    } else try {
      existingDoc.registerFontkit(window.fontkit);
      const fontUrl   = chrome.runtime.getURL('dyslexia-hebrew-extended.otf');
      const fontBytes = await fetch(fontUrl).then(r => r.arrayBuffer());
      const dyslexiaFont = await existingDoc.embedFont(fontBytes, { subset: true });

      for (let pi = 0; pi < pages.length; pi++) {
        const page        = pages[pi];
        const pageLetters = fontLetters.filter(l => l.page === pi);

        // FB precomposed → base letter for drawText
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

        // Only process letters the font can render
        const renderable = pageLetters.filter(ltr => {
          try { return dyslexiaFont.widthOfTextAtSize(baseChar(ltr.char), ltr.fontSize) > 0; }
          catch { return false; }
        });

        // Pass 1: white out originals using actual letter width
        for (const ltr of renderable) {
          const w = Math.max(ltr.origW || (ltr.fontSize * 0.65), 3);
          const h = ltr.fontSize * 1.4;
          const y = ltr.y - ltr.fontSize * 0.3;
          try { page.drawRectangle({ x: ltr.x, y, width: w, height: h, color: rgb(1,1,1), opacity:1 }); }
          catch {}
        }

        // Pass 2: draw new glyphs
        for (const ltr of renderable) {
          try {
            page.drawText(baseChar(ltr.char), {
              x: ltr.x, y: ltr.y, size: ltr.fontSize,
              font: dyslexiaFont, color: rgb(0,0,0),
            });
          } catch {}
        }
        setProgress(82 + Math.round(((pi+1)/pages.length)*8), 'Drawing font…', 4);
      }
      fontApplied = true;
    } catch (fontErr) {
      fontWarning = 'Dyslexia font failed to embed: ' + (fontErr.message || String(fontErr));
      console.warn(fontWarning);
    }
  }

  setProgress(92, 'Generating file…', 5);

  const pdfBytes = await existingDoc.save();
  const blob     = new Blob([pdfBytes], { type: 'application/pdf' });
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(blob);

  setProgress(100, 'Done!', 5);
  steps.forEach(s => s.classList.add('done'));
  resultCard.classList.add('visible');

  const feats = [];
  if (settings.colorNekudot) feats.push(`${highlights.length} niqqud highlighted`);
  if (settings.fontEnabled && fontApplied)  feats.push('dyslexia font applied');
  if (settings.letterSpacing > 0) feats.push(`+${settings.letterSpacing}px spacing`);
  resultSub.textContent = `${numPages} page${numPages > 1 ? 's' : ''} · ${feats.join(' · ') || 'no features active'} · Ready to print`;

  // If the user asked for the dyslexia font but we couldn't apply it,
  // tell them — don't let the toggle silently no-op.
  if (settings.fontEnabled && !fontApplied) {
    showError(fontWarning || 'Dyslexia font could not be applied to this PDF.');
  }

  downloadBtn.classList.add('visible');
  processBtn.disabled = false;

  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = (selectedFile?.name || 'document').replace(/\.pdf$/i, '') + '_otiyot.pdf';
  a.click();
}
