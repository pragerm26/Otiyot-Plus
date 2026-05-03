// pdf-processor.js — Otiyot+ PDF colorizer
// ES module — loaded via <script type="module"> in pdf-processor.html

import * as pdfjsLib from './pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');

// ---------------------------------------------------------------------------
// NIQQUD CONFIG
// ---------------------------------------------------------------------------
const SHVA_CHAR = '\u05B0';
const NIKUD_COLORS = {
  'SHVA_NA':   '#cc0000', 'SHVA_NACH': '#ff88aa',
  '\u05B4':    '#ff9900', '\u05B5':    '#cccc00',
  '\u05B6':    '#00cc00', '\u05B7':    '#6aa84f',
  '\u05B8':    '#6fa8dc', '\u05B9':    '#0000ff',
  '\u05BB':    '#9900ff', '\u05BC':    '#ff00ff',
};
const HATAF_MAP = { '\u05B1': '\u05B6', '\u05B2': '\u05B7', '\u05B3': '\u05B8' };
const ALL_NIKUD = new Set([
  ...Object.keys(NIKUD_COLORS).filter(k => k.length === 1),
  SHVA_CHAR, ...Object.keys(HATAF_MAP),
]);

function isHebrewLetter(cp) {
  return (cp >= 0x05D0 && cp <= 0x05EA) ||
         (cp >= 0xFB1D && cp <= 0xFB4E); // also precomposed forms like וֹ בּ etc
}
function isNikudOrCantillation(cp) {
  return (cp >= 0x0591 && cp <= 0x05C7); // cantillation + niqqud + other marks
}

function classifyShva(letterIndex, letters, prevNikud) {
  // Word-initial shva is Na
  if (letterIndex === 0) return 'SHVA_NA';
  const prevLetter = letters[letterIndex - 1];
  if (!prevLetter || prevLetter.isSpace) return 'SHVA_NA';
  // After long vowel = Na
  if (prevNikud && '\u05B5\u05B4\u05B9\u05BB\u05B8'.includes(prevNikud)) return 'SHVA_NA';
  // Last letter in word = Nach
  if (letterIndex === letters.length - 1) return 'SHVA_NACH';
  if (letters[letterIndex + 1]?.isSpace) return 'SHVA_NACH';
  return 'SHVA_NACH'; // default
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
// UI
// ---------------------------------------------------------------------------
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
const steps       = [1,2,3,4,5].map(i => document.getElementById('step'+i));

let selectedFile = null;
let downloadUrl  = null;
let settings     = {
  colorNekudot:true, highlightOpacity:100,
  nikud_shva_na:true, nikud_shva_nach:true,
  nikud_05b4:true, nikud_05b5:true, nikud_05b6:true,
  nikud_05b7:true, nikud_05b8:true, nikud_05b9:true,
  nikud_05bb:true, nikud_05bc:true,
};

chrome.storage.sync.get(settings, res => {
  settings = res;
  const pc = document.getElementById('pillColor');
  const pf = document.getElementById('pillFont');
  const ps = document.getElementById('pillSpacing');
  if (pc) pc.classList.toggle('off', !settings.colorNekudot);
  if (pf) pf.classList.toggle('off', !settings.fontEnabled);
  if (ps) {
    if (settings.letterSpacing > 0) { ps.textContent = `↔ Spacing +${settings.letterSpacing}px`; ps.classList.remove('off'); }
    else ps.classList.add('off');
  }
});

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
fileClear.addEventListener('click', () => { selectedFile=null; fileInput.value=''; fileInfo.classList.remove('visible'); processBtn.disabled=true; });
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });

function setProgress(pct, text, stepIndex) {
  progressFill.style.width = pct+'%';
  progressPct.textContent = pct+'%';
  progressText.textContent = text;
  steps.forEach((s,i) => { s.classList.remove('active','done'); if(i<stepIndex) s.classList.add('done'); if(i===stepIndex) s.classList.add('active'); });
}
function showError(msg) { errorMsg.textContent=msg; errorMsg.classList.add('visible'); }
function hideError()    { errorMsg.classList.remove('visible'); }

processBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  processBtn.disabled = true;
  downloadBtn.classList.remove('visible');
  resultCard.classList.remove('visible');
  progressWrap.classList.add('visible');
  hideError();
  try { await processPdf(selectedFile); }
  catch(err) {
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
  a.download = (selectedFile?.name||'document').replace(/\.pdf$/i,'') + '_otiyot.pdf';
  a.click();
});

// ---------------------------------------------------------------------------
// MAIN PIPELINE
// ---------------------------------------------------------------------------
async function processPdf(file) {
  const PDFLib = window.PDFLib;
  if (!PDFLib) throw new Error('pdf-lib not loaded — make sure pdf-lib.min.js is in the extension folder');

  setProgress(5, 'Reading PDF…', 0);
  const originalBytes = new Uint8Array(await file.arrayBuffer());

  setProgress(15, 'Loading pages…', 0);
  const pdfDoc   = await pdfjsLib.getDocument({ data: originalBytes.slice() }).promise;
  const numPages = pdfDoc.numPages;

  setProgress(20, 'Extracting character positions…', 1);

  // pdf.js getTextContent gives items (runs of same-font text).
  // We need per-character positions. We get them via getOperatorList
  // and font metrics — but that's complex. Instead we use a canvas-based
  // approach: render each character individually to measure it.
  //
  // Actually: pdf.js 3.x supports individual character positions via
  // the `chars` array in text content items when we use `getTextContent`
  // with the right options. Let's check both approaches.

  const pageData = [];
  for (let p = 1; p <= numPages; p++) {
    const page    = await pdfDoc.getPage(p);
    const vp      = page.getViewport({ scale: 1 });
    const content = await page.getTextContent({ includeMarkedContent: false });
    pageData.push({ items: content.items, pageHeight: vp.height, pageWidth: vp.width });
    setProgress(20 + Math.round((p/numPages)*20), `Extracting page ${p}…`, 1);
  }

  setProgress(45, 'Classifying niqqud…', 2);

  const highlights = [];

  for (let pi = 0; pi < pageData.length; pi++) {
    const { items, pageHeight } = pageData[pi];

    // Build a flat character list with positions for this page.
    // Each item has: str, transform=[a,b,c,d,tx,ty], width, dir
    // transform[4]=tx (x of start), transform[5]=ty (y baseline, bottom-left origin)
    // transform[0]=horizontal scale (approximately font size for unrotated text)

    // We collect all chars across all items, tagged with their x position.
    // Then for each Hebrew letter, we find any niqqud at a nearby x position.

    const allChars = []; // {char, cp, x0, x1, y, fontSize, isHebrew, isNikud}

    for (const item of items) {
      if (!item.str) continue;
      const [a, b, c, d, tx, ty] = item.transform;
      const fontSize = Math.abs(d) || Math.abs(a) || 12;

      // Distribute characters across the run width using proportional spacing.
      // For RTL (Hebrew), x advances in the negative direction visually,
      // but pdf.js gives us tx as the LEFT edge of the bounding box.
      const chars = [...item.str];
      const totalChars = chars.length;
      if (totalChars === 0) continue;

      // For each char, we estimate its width as a fraction of item.width.
      // But niqqud chars are zero-width, so we give them 0 width.
      const letterWidths = chars.map(ch => {
        const cp = ch.codePointAt(0);
        if (isNikudOrCantillation(cp)) return 0;
        return 1; // placeholder unit
      });
      const totalUnits = letterWidths.reduce((a,b) => a+b, 0) || 1;
      const unitWidth  = item.width / totalUnits;

      // RTL: first char in string is rightmost visually.
      // tx is LEFT edge of the run. Rightmost char starts at tx + item.width - charWidth.
      // LTR: first char is leftmost, starts at tx.
      const isRTL = item.dir === 'rtl';

      let cursorFromLeft = 0;
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const cp = ch.codePointAt(0);
        const w  = letterWidths[i] * unitWidth;
        const isNikud  = isNikudOrCantillation(cp);
        const isHebrew = isHebrewLetter(cp);

        let x0, x1;
        if (isRTL) {
          // In RTL, chars go right→left. char i is at position (totalWidth - cursor - w) from left.
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

    // Now: for each Hebrew letter, find the dominant niqqud character.
    // Strategy: group characters by line (similar ty), then within each line
    // find niqqud that spatially overlaps or is adjacent to a Hebrew letter.

    // Sort all chars by x position within each line
    // Group into lines by ty proximity
    const lineMap = new Map();
    for (const c of allChars) {
      const lineKey = Math.round(c.y / 2) * 2; // bucket by 2-pt intervals
      if (!lineMap.has(lineKey)) lineMap.set(lineKey, []);
      lineMap.get(lineKey).push(c);
    }

    for (const [, lineChars] of lineMap) {
      // Separate letters and niqqud
      const letters = lineChars.filter(c => c.isHebrew);
      const nikudChars = lineChars.filter(c => c.isNikud && ALL_NIKUD.has(c.char));

      if (letters.length === 0 || nikudChars.length === 0) continue;

      // For each letter, find the niqqud whose x center is closest to the letter's x center
      // (niqqud chars have x0 == x1 == their position, so use x0 directly)
      const letterNikudMap = new Map(); // letterIndex → [nikud chars]
      for (const nk of nikudChars) {
        const nkX = (nk.x0 + nk.x1) / 2 || nk.x0;
        // Find closest letter
        let bestIdx = -1, bestDist = Infinity;
        for (let li = 0; li < letters.length; li++) {
          const ltr = letters[li];
          const ltrCenter = (ltr.x0 + ltr.x1) / 2;
          const dist = Math.abs(nkX - ltrCenter);
          // Also accept if nkX is within letter x0..x1 bounds (expanded slightly)
          const inBounds = nkX >= ltr.x0 - 3 && nkX <= ltr.x1 + 3;
          if (dist < bestDist || inBounds) {
            bestDist = dist;
            bestIdx  = li;
          }
        }
        if (bestIdx >= 0 && bestDist < 15) {
          if (!letterNikudMap.has(bestIdx)) letterNikudMap.set(bestIdx, []);
          letterNikudMap.get(bestIdx).push(nk);
        }
      }

      // Now build highlights for letters that have niqqud
      let prevNikud = null;
      const letterObjects = letters.map((l, i) => ({ ...l, isSpace: false, index: i }));

      for (let li = 0; li < letterObjects.length; li++) {
        const letter = letterObjects[li];
        const nkList = letterNikudMap.get(li) || [];

        // Pick primary vowel (exclude cantillation marks 0591-05AF, keep 05B0-05C7)
        const vowels = nkList.filter(nk => {
          const cp = nk.cp;
          return (cp >= 0x05B0 && cp <= 0x05C7);
        });

        let primaryNikud = null;
        for (const nk of vowels) {
          if (ALL_NIKUD.has(nk.char)) { primaryNikud = nk.char; break; }
        }

        const color = getColor(primaryNikud, li, letterObjects, prevNikud, settings);
        if (primaryNikud) prevNikud = primaryNikud;

        if (color) {
          const { r, g, b } = hexToRgb(color);
          // letter.y = ty from pdf.js transform = baseline y in bottom-left coords
          // pdf-lib drawRectangle y = bottom-left corner of the box
          // We want the box to sit from just below baseline up through ascenders
          const h = letter.fontSize * 1.2;
          const y = letter.y - letter.fontSize * 0.25; // box bottom: slightly below baseline
          const w = Math.max(letter.x1 - letter.x0, 4);
          const x = letter.x0;

          highlights.push({ page: pi, x, y, w, h, r, g, b });
        }
      }
    }
  }

  setProgress(65, 'Rebuilding PDF with colors…', 3);

  const { PDFDocument, rgb } = PDFLib;
  const existingDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const pages       = existingDoc.getPages();
  const opacity     = ((settings.highlightOpacity || 100) / 100) * 0.55;

  for (let pi = 0; pi < pages.length; pi++) {
    const page           = pages[pi];
    const { height }     = page.getSize();
    const pageHighlights = highlights.filter(h => h.page === pi);

    for (const hl of pageHighlights) {
      try {
        page.drawRectangle({
          x:          hl.x,
          y:          hl.y,
          width:      hl.w,
          height:     hl.h,
          color:      rgb(hl.r, hl.g, hl.b),
          opacity:    opacity,
          blendMode:  'Multiply', // renders behind-like: dark text shows through color
        });
      } catch(e) {
        // Fallback without blendMode if not supported
        try {
          page.drawRectangle({ x: hl.x, y: hl.y, width: hl.w, height: hl.h, color: rgb(hl.r, hl.g, hl.b), opacity });
        } catch(e2) { /* skip */ }
      }
    }
    setProgress(65 + Math.round(((pi+1)/pages.length)*25), 'Adding highlights…', 3);
  }

  setProgress(92, 'Generating file…', 4);

  const pdfBytes = await existingDoc.save();
  const blob     = new Blob([pdfBytes], { type: 'application/pdf' });
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(blob);

  setProgress(100, 'Done!', 4);
  steps.forEach(s => s.classList.add('done'));
  resultCard.classList.add('visible');
  resultSub.textContent = `${numPages} page${numPages>1?'s':''} · ${highlights.length} niqqud highlighted · Ready to print`;
  downloadBtn.classList.add('visible');
  processBtn.disabled = false;

  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = (selectedFile?.name||'document').replace(/\.pdf$/i,'') + '_otiyot.pdf';
  a.click();
}
