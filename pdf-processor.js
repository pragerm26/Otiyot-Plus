// pdf-processor.js — Otiyot+ PDF colorizer v1.2.0
// ES module — loaded via <script type="module"> in pdf-processor.html

import * as pdfjsLib from './lib/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.mjs');

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

    // Group into lines
    const lineMap = new Map();
    for (const c of allChars) {
      const lineKey = Math.round(c.y / 2) * 2;
      if (!lineMap.has(lineKey)) lineMap.set(lineKey, []);
      lineMap.get(lineKey).push(c);
    }

    for (const [, lineChars] of lineMap) {
      const letters    = lineChars.filter(c => c.isHebrew);
      const nikudChars = lineChars.filter(c => c.isNikud && ALL_NIKUD.has(c.char));

      if (letters.length === 0) continue;

      const letterNikudMap = new Map();
      for (const nk of nikudChars) {
        const nkX = (nk.x0 + nk.x1) / 2 || nk.x0;
        let bestIdx = -1, bestDist = Infinity;
        for (let li = 0; li < letters.length; li++) {
          const ltr    = letters[li];
          const ltrCenter = (ltr.x0 + ltr.x1) / 2;
          const dist   = Math.abs(nkX - ltrCenter);
          const inBounds = nkX >= ltr.x0 - 3 && nkX <= ltr.x1 + 3;
          if (dist < bestDist || inBounds) { bestDist = dist; bestIdx = li; }
        }
        if (bestIdx >= 0 && bestDist < 15) {
          if (!letterNikudMap.has(bestIdx)) letterNikudMap.set(bestIdx, []);
          letterNikudMap.get(bestIdx).push(nk);
        }
      }

      let prevNikud = null;
      const letterObjects = letters.map((l, i) => ({ ...l, isSpace: false, index: i }));

      const spacing    = settings.letterSpacing || 0;
      let xOffset      = 0; // cumulative letter-spacing offset

      for (let li = 0; li < letterObjects.length; li++) {
        const letter  = letterObjects[li];
        const nkList  = letterNikudMap.get(li) || [];
        const vowels  = nkList.filter(nk => nk.cp >= 0x05B0 && nk.cp <= 0x05C7);

        let primaryNikud = null;
        for (const nk of vowels) {
          if (ALL_NIKUD.has(nk.char)) { primaryNikud = nk.char; break; }
        }

        const color = getColor(primaryNikud, li, letterObjects, prevNikud, settings);
        if (primaryNikud) prevNikud = primaryNikud;

        // Apply letter spacing: shift each letter right by cumulative offset
        const adjustedX0 = letter.x0 + xOffset;
        const adjustedX1 = letter.x1 + xOffset;
        if (spacing > 0 && li > 0) xOffset += spacing;

        if (color) {
          const { r, g, b } = hexToRgb(color);
          const h = letter.fontSize * 1.2;
          const y = letter.y - letter.fontSize * 0.25;
          const w = Math.max(adjustedX1 - adjustedX0, 4);
          highlights.push({ page: pi, x: adjustedX0, y, w, h, r, g, b });
        }

        // Collect letter positions for dyslexia font overlay
        if (settings.fontEnabled) {
          fontLetters.push({
            page:     pi,
            x:        adjustedX0,
            y:        letter.y,
            fontSize: letter.fontSize,
            char:     letter.char,
          });
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
  if (settings.fontEnabled && fontLetters.length > 0) {
    try {
      const fontUrl   = chrome.runtime.getURL('fonts/dyslexia-hebrew-extended.otf');
      const fontBytes = await fetch(fontUrl).then(r => r.arrayBuffer());
      const dyslexiaFont = await existingDoc.embedFont(fontBytes);

      for (let pi = 0; pi < pages.length; pi++) {
        const page        = pages[pi];
        const { height }  = page.getSize();
        const pageLetters = fontLetters.filter(l => l.page === pi);

        for (const ltr of pageLetters) {
          try {
            // Cover original glyph with a white rectangle, then draw with dyslexia font
            const w = Math.max(ltr.fontSize * 0.7, 4);
            const h = ltr.fontSize * 1.3;
            const y = ltr.y - ltr.fontSize * 0.25;
            page.drawRectangle({ x: ltr.x, y, width: w, height: h, color: rgb(1, 1, 1), opacity: 1 });
            page.drawText(ltr.char, {
              x:    ltr.x,
              y:    ltr.y,
              size: ltr.fontSize,
              font: dyslexiaFont,
              color: rgb(0, 0, 0),
            });
          } catch { /* skip individual glyph failures */ }
        }
      }
    } catch (fontErr) {
      console.warn('Dyslexia font overlay failed:', fontErr);
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
  if (settings.fontEnabled)  feats.push('dyslexia font applied');
  if (settings.letterSpacing > 0) feats.push(`+${settings.letterSpacing}px spacing`);
  resultSub.textContent = `${numPages} page${numPages > 1 ? 's' : ''} · ${feats.join(' · ') || 'no features active'} · Ready to print`;

  downloadBtn.classList.add('visible');
  processBtn.disabled = false;

  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = (selectedFile?.name || 'document').replace(/\.pdf$/i, '') + '_otiyot.pdf';
  a.click();
}
