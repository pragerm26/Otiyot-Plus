// pdf-stream-engine.js — Otiyot+ content-stream engine
//
// Replaces pdf.js + white-out + raster "clone" in the PDF processor:
//   • extract : exact glyph positions straight from the page content stream
//               (real font widths, real text matrices — no equal-split estimates)
//   • rewrite : DELETE glyphs from the stream (advance-preserving) and/or RECOLOR them
//   • cloneSpec: what's needed to re-emit original glyphs at a new spot as real text
//
// Needs only pdf-lib's low-level API (pass window.PDFLib). No pdf.js, no canvas.

// ───────────────────────────── char classes ───────────────────────────────
const isHebLetter = cp => (cp >= 0x05D0 && cp <= 0x05EA) || (cp >= 0xFB1D && cp <= 0xFB4E && cp !== 0xFB1E);
// combining marks only (cantillation + points). NOT maqaf 05BE / paseq 05C0 / sof-pasuq 05C3 / nun-hafukha 05C6
const isMarkCp = cp => (cp >= 0x0591 && cp <= 0x05BD) || cp === 0x05BF || cp === 0x05C1 || cp === 0x05C2 ||
                       cp === 0x05C4 || cp === 0x05C5 || cp === 0x05C7 || cp === 0xFB1E;
// Approximate canonical combining class — used only to vote on stream direction
const hebCCC = cp =>
  cp >= 0x05B0 && cp <= 0x05B9 ? 10 + (cp - 0x05B0) : cp === 0x05BA ? 19 : cp === 0x05BB ? 20 :
  cp === 0x05BC ? 21 : cp === 0x05BD ? 22 : cp === 0x05BF ? 23 : cp === 0x05C1 ? 24 : cp === 0x05C2 ? 25 :
  cp === 0x05C7 ? 18 : ((cp >= 0x0591 && cp <= 0x05AF) || cp === 0x05C4 || cp === 0x05C5) ? 220 : 0;
// Presentation forms → base letter + points. NFKC (not NFD) so compatibility forms such as
// U+FB20 "alternative ayin" (which Arial's ToUnicode map uses for ayin) become a real U+05E2.
const nfdPresentation = s => s.replace(/[\uFB1D-\uFB4F]/g, c => c.normalize('NFKC'));

// ───────────────────────────── tokenizer ──────────────────────────────────
const isWs = c => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const isDelim = c => c === 0x28 || c === 0x29 || c === 0x3C || c === 0x3E || c === 0x5B ||
                     c === 0x5D || c === 0x7B || c === 0x7D || c === 0x2F || c === 0x25;
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/** Parse a content stream into ops: {op, args[], s, e} with byte offsets. */
function parseContent(buf) {
  const n = buf.length;
  let pos = 0;
  function skipWs() {
    while (pos < n) {
      const c = buf[pos];
      if (isWs(c)) pos++;
      else if (c === 0x25) { while (pos < n && buf[pos] !== 10 && buf[pos] !== 13) pos++; }
      else break;
    }
  }
  function readObj() {
    skipWs();
    if (pos >= n) return null;
    const s = pos, c = buf[pos];
    if (c === 0x28) {
      pos++;
      let depth = 1;
      const bytes = [];
      while (pos < n && depth > 0) {
        const b = buf[pos++];
        if (b === 0x5C) {
          const d = buf[pos++];
          if (d === 0x6E) bytes.push(10);
          else if (d === 0x72) bytes.push(13);
          else if (d === 0x74) bytes.push(9);
          else if (d === 0x62) bytes.push(8);
          else if (d === 0x66) bytes.push(12);
          else if (d === 13) { if (buf[pos] === 10) pos++; }
          else if (d === 10) { /* line continuation */ }
          else if (d >= 0x30 && d <= 0x37) {
            let v = d - 0x30;
            for (let k = 0; k < 2 && buf[pos] >= 0x30 && buf[pos] <= 0x37; k++) v = v * 8 + buf[pos++] - 0x30;
            bytes.push(v & 255);
          } else bytes.push(d);
        } else if (b === 0x28) { depth++; bytes.push(b); }
        else if (b === 0x29) { depth--; if (depth > 0) bytes.push(b); }
        else bytes.push(b);
      }
      return { t: 'str', v: Uint8Array.from(bytes), s, e: pos };
    }
    if (c === 0x3C) {
      if (buf[pos + 1] === 0x3C) {
        pos += 2;
        const items = [];
        for (;;) {
          skipWs();
          if (pos >= n) break;
          if (buf[pos] === 0x3E && buf[pos + 1] === 0x3E) { pos += 2; break; }
          const k = readObj();
          if (!k) break;
          items.push(k);
        }
        return { t: 'dict', v: items, s, e: pos };
      }
      pos++;
      let hex = '';
      while (pos < n && buf[pos] !== 0x3E) { const ch = buf[pos++]; if (!isWs(ch)) hex += String.fromCharCode(ch); }
      pos++;
      if (hex.length % 2) hex += '0';
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16) || 0;
      return { t: 'str', v: bytes, s, e: pos };
    }
    if (c === 0x5B) {
      pos++;
      const items = [];
      for (;;) {
        skipWs();
        if (pos >= n) break;
        if (buf[pos] === 0x5D) { pos++; break; }
        const k = readObj();
        if (!k) break;
        items.push(k);
      }
      return { t: 'arr', v: items, s, e: pos };
    }
    if (c === 0x2F) {
      pos++;
      let name = '';
      while (pos < n && !isWs(buf[pos]) && !isDelim(buf[pos])) {
        if (buf[pos] === 0x23 && pos + 2 < n) { name += String.fromCharCode(parseInt(String.fromCharCode(buf[pos + 1], buf[pos + 2]), 16)); pos += 3; }
        else name += String.fromCharCode(buf[pos++]);
      }
      return { t: 'name', v: name, s, e: pos };
    }
    if (c === 0x29 || c === 0x3E || c === 0x5D || c === 0x7B || c === 0x7D) {
      pos++;
      return { t: 'kw', v: String.fromCharCode(c), s, e: pos };
    }
    while (pos < n && !isWs(buf[pos]) && !isDelim(buf[pos])) pos++;
    let word = '';
    for (let i = s; i < pos; i++) word += String.fromCharCode(buf[i]);
    if (NUM_RE.test(word)) return { t: 'num', v: parseFloat(word), s, e: pos };
    return { t: 'kw', v: word, s, e: pos };
  }

  const ops = [];
  let operands = [];
  for (;;) {
    const tk = readObj();
    if (!tk) break;
    if (tk.t !== 'kw') { operands.push(tk); continue; }
    const op = { op: tk.v, args: operands, s: operands.length ? operands[0].s : tk.s, e: tk.e };
    if (tk.v === 'BI') {                                   // inline image: skip the payload verbatim
      for (;;) { const k = readObj(); if (!k || (k.t === 'kw' && k.v === 'ID')) break; }
      const ds = isWs(buf[pos]) ? pos + 1 : pos;
      let found = -1;
      for (let i = ds; i < n - 1; i++) {
        if (buf[i] === 0x45 && buf[i + 1] === 0x49 && (i === ds || isWs(buf[i - 1])) && (i + 2 >= n || isWs(buf[i + 2]))) { found = i; break; }
      }
      pos = found < 0 ? n : found + 2;
      op.e = pos;
    }
    ops.push(op);
    operands = [];
  }
  return ops;
}

// ───────────────────────────── ToUnicode CMap ─────────────────────────────
const hexToStr16 = hex => {
  let s = '';
  for (let i = 0; i + 3 < hex.length + 1; i += 4) s += String.fromCharCode(parseInt(hex.substr(i, 4).padEnd(4, '0'), 16));
  return s;
};
function parseToUnicode(text) {
  const map = new Map();
  let minLen = Infinity, maxLen = 0;
  for (const m of text.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) {
    for (const h of m[1].matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const len = h[1].length / 2;
      minLen = Math.min(minLen, len); maxLen = Math.max(maxLen, len);
    }
  }
  for (const m of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) map.set(parseInt(p[1], 16), hexToStr16(p[2]));
  }
  for (const m of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[^\]]*\]|<[0-9A-Fa-f]*>)/g)) {
      const lo = parseInt(p[1], 16), hi = parseInt(p[2], 16);
      if (p[3][0] === '[') {
        const dsts = [...p[3].matchAll(/<([0-9A-Fa-f]*)>/g)].map(x => hexToStr16(x[1]));
        for (let c = lo; c <= hi && c - lo < dsts.length; c++) map.set(c, dsts[c - lo]);
      } else {
        const base = hexToStr16(p[3].slice(1, -1));
        for (let c = lo; c <= hi && c - lo < 0x10000; c++) {
          map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - lo)));
        }
      }
    }
  }
  return { map, minLen: minLen === Infinity ? 0 : minLen, maxLen };
}

// ───────────────────────────── small helpers ──────────────────────────────
const matMul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
const fmt = v => { const s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/\.?0+$/, ''); return s === '-0' || s === '' ? '0' : s; };
const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const latin1 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; };
const srcText = (buf, s, e) => latin1(buf.subarray(s, e)).trim();
const hexToRgb01 = hex => { const h = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
// content.js paints rgba(colour, opacity); on white paper that equals blending toward white.
const blendOp = (hex, opacity = 100) => {
  const a = Math.min(1, Math.max(0.1, opacity / 100));
  const [r, g, b] = hexToRgb01(hex).map(v => v * a + (1 - a));
  return `${fmt(r)} ${fmt(g)} ${fmt(b)} rg\n`;
};
const newGS = () => ({
  ctm: [1, 0, 0, 1, 0, 0], font: null, fontName: null, fontSize: 0,
  Tc: 0, Tw: 0, Th: 1, TL: 0, Ts: 0, fill: ['0 g'], fillCS: null, fillRgb: [0, 0, 0],
});
const cloneGS = g => ({ ...g, ctm: g.ctm.slice(), fill: g.fill.slice(), fillRgb: g.fillRgb.slice() });

// ═════════════════════════════ ENGINE ═════════════════════════════════════
export function createStreamEngine(PDFLib, doc) {
  const { PDFName, PDFDict, PDFRef, PDFArray, PDFRawStream, decodePDFRawStream } = PDFLib;
  const ctx = doc.context;
  const pages = doc.getPages();

  const stats = { glyphs: 0, hebrewGlyphs: 0, unreadableRuns: 0, unreadableFonts: new Set(), streamOrder: 'logical',
                  formsProcessed: 0, deleted: 0, recolored: 0, orphanMarks: 0 };
  const fontCache = new Map();
  const visitedForms = new Set();
  const jobs = [];                 // {kind:'page'|'form', pageIndex, buf, pieces, page|ref|stream, refs}
  const allPieces = [];
  let nextId = 1;

  // ── fonts: ToUnicode + widths ────────────────────────────────────────────
  function loadFont(res, name) {
    const fonts = res && res.lookupMaybe(PDFName.of('Font'), PDFDict);
    const fd = fonts && fonts.lookupMaybe(PDFName.of(name), PDFDict);
    if (!fd) return null;
    if (fontCache.has(fd)) return fontCache.get(fd);
    let info = null;
    try {
      const tu = fd.lookup(PDFName.of('ToUnicode'));
      const subtype = fd.lookup(PDFName.of('Subtype'))?.decodeText?.();
      const isType0 = subtype === 'Type0';
      if (tu instanceof PDFRawStream) {
        const parsed = parseToUnicode(latin1(decodePDFRawStream(tu).decode()));
        const variable = parsed.minLen && parsed.minLen !== parsed.maxLen;
        const enc = fd.lookup(PDFName.of('Encoding'));
        const nonIdentity = isType0 && enc && enc.decodeText && !/^Identity/.test(enc.decodeText());
        if (!variable && !nonIdentity) {
          const codeLen = parsed.maxLen || (isType0 ? 2 : 1);
          let widthOf = () => 500;
          if (isType0) {
            const desc = fd.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)?.lookup(0, PDFDict);
            const dw = desc?.lookup(PDFName.of('DW'))?.asNumber?.() ?? 1000;
            const wmap = new Map();
            const W = desc?.lookup(PDFName.of('W'));
            if (W instanceof PDFArray) {
              for (let i = 0; i < W.size();) {
                const c1 = W.lookup(i).asNumber(), nx = W.lookup(i + 1);
                if (nx instanceof PDFArray) { for (let k = 0; k < nx.size(); k++) wmap.set(c1 + k, nx.lookup(k).asNumber()); i += 2; }
                else { const c2 = nx.asNumber(), w = W.lookup(i + 2).asNumber(); for (let c = c1; c <= c2 && c - c1 < 70000; c++) wmap.set(c, w); i += 3; }
              }
            }
            widthOf = code => wmap.has(code) ? wmap.get(code) : dw;
          } else {
            const first = fd.lookup(PDFName.of('FirstChar'))?.asNumber?.() ?? 0;
            const Ws = fd.lookup(PDFName.of('Widths'));
            const miss = fd.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)?.lookup(PDFName.of('MissingWidth'))?.asNumber?.() ?? 0;
            if (Ws instanceof PDFArray) {
              const arr = []; for (let i = 0; i < Ws.size(); i++) arr.push(Ws.lookup(i).asNumber());
              widthOf = code => (code >= first && code - first < arr.length) ? arr[code - first] : miss;
            }
          }
          const raw = fonts.get(PDFName.of(name));
          info = { map: parsed.map, codeLen, widthOf, ref: raw instanceof PDFRef ? raw : ctx.register(fd), name };
        }
      }
    } catch (e) { info = null; }
    if (!info) stats.unreadableFonts.add(name);
    fontCache.set(fd, info);
    return info;
  }

  // ── plan one content stream: text-state machine → glyph records ─────────
  function planStream(buf, res, initGS, job) {
    const ops = parseContent(buf);
    let gs = initGS ? cloneGS(initGS) : newGS();
    const stack = [];
    let tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0];
    const num = a => a.every(x => x.t === 'num') ? a.map(x => x.v) : null;
    const td = (tx, ty) => { tlm = matMul([1, 0, 0, 1, tx, ty], tlm); tm = tlm.slice(); };

    for (const o of ops) {
      const a = o.args;
      switch (o.op) {
        case 'q': stack.push(cloneGS(gs)); break;
        case 'Q': if (stack.length) gs = stack.pop(); break;
        case 'cm': { const v = a.length === 6 && num(a); if (v) gs.ctm = matMul(v, gs.ctm); break; }
        case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = [1, 0, 0, 1, 0, 0]; break;
        case 'Td': { const v = a.length === 2 && num(a); if (v) td(v[0], v[1]); break; }
        case 'TD': { const v = a.length === 2 && num(a); if (v) { gs.TL = -v[1]; td(v[0], v[1]); } break; }
        case 'T*': td(0, -gs.TL); break;
        case 'Tm': { const v = a.length === 6 && num(a); if (v) { tm = v.slice(); tlm = v.slice(); } break; }
        case 'TL': if (a[0]?.t === 'num') gs.TL = a[0].v; break;
        case 'Tc': if (a[0]?.t === 'num') gs.Tc = a[0].v; break;
        case 'Tw': if (a[0]?.t === 'num') gs.Tw = a[0].v; break;
        case 'Tz': if (a[0]?.t === 'num') gs.Th = a[0].v / 100; break;
        case 'Ts': if (a[0]?.t === 'num') gs.Ts = a[0].v; break;
        case 'Tf': if (a.length === 2 && a[0].t === 'name') { gs.font = loadFont(res, a[0].v); gs.fontName = a[0].v; gs.fontSize = a[1].v; } break;
        case 'g': { gs.fill = [srcText(buf, o.s, o.e)]; gs.fillCS = null; const v = num(a); if (v) gs.fillRgb = [v[0], v[0], v[0]]; break; }
        case 'rg': { gs.fill = [srcText(buf, o.s, o.e)]; gs.fillCS = null; const v = num(a); if (v) gs.fillRgb = v.slice(0, 3); break; }
        case 'k': { gs.fill = [srcText(buf, o.s, o.e)]; gs.fillCS = null; const v = num(a); if (v) gs.fillRgb = [(1 - v[0]) * (1 - v[3]), (1 - v[1]) * (1 - v[3]), (1 - v[2]) * (1 - v[3])]; break; }
        case 'cs': gs.fillCS = srcText(buf, o.s, o.e); gs.fill = [gs.fillCS]; break;
        case 'sc': case 'scn': gs.fill = (gs.fillCS ? [gs.fillCS] : []).concat(srcText(buf, o.s, o.e)); break;
        case 'Do': {
          if (a.length === 1 && a[0].t === 'name') {
            const xd = res && res.lookupMaybe(PDFName.of('XObject'), PDFDict);
            const ref = xd && xd.get(PDFName.of(a[0].v));
            if (ref instanceof PDFRef && !visitedForms.has(ref.tag)) {
              const xs = ctx.lookup(ref);
              if (xs instanceof PDFRawStream && xs.dict.lookup(PDFName.of('Subtype'))?.decodeText?.() === 'Form') {
                visitedForms.add(ref.tag);
                const mArr = xs.dict.lookupMaybe(PDFName.of('Matrix'), PDFArray);
                const fm = mArr ? [0, 1, 2, 3, 4, 5].map(i => mArr.lookup(i).asNumber()) : [1, 0, 0, 1, 0, 0];
                const fres = xs.dict.lookupMaybe(PDFName.of('Resources'), PDFDict) || res;
                const sub = cloneGS(gs); sub.ctm = matMul(fm, gs.ctm);
                const fbuf = decodePDFRawStream(xs).decode();
                const fjob = { kind: 'form', pageIndex: job.pageIndex, ref, stream: xs, buf: fbuf, pieces: [] };
                planStream(fbuf, fres, sub, fjob);
                if (fjob.pieces.length) { jobs.push(fjob); stats.formsProcessed++; }
              }
            }
          }
          break;
        }
        case 'Tj': case 'TJ': case "'": case '"': {
          if (o.op === "'" || o.op === '"') {
            if (o.op === '"' && a.length === 3 && a[0].t === 'num' && a[1].t === 'num') { gs.Tw = a[0].v; gs.Tc = a[1].v; }
            td(0, -gs.TL);
          }
          const last = a[a.length - 1];
          const font = gs.font;
          const Tfs = gs.fontSize || 1;
          const items = o.op === 'TJ' ? (last && last.t === 'arr' ? last.v : null) : (last && last.t === 'str' ? [last] : null);
          if (!items) break;
          if (!font) { stats.unreadableRuns++; // still advance nothing: we can't know widths
            break; }
          const glyphs = [], events = [];
          for (const it of items) {
            if (it.t === 'num') {
              events.push({ k: 'n', v: it.v });
              tm = matMul([1, 0, 0, 1, -it.v / 1000 * Tfs * gs.Th, 0], tm);
              continue;
            }
            if (it.t !== 'str') continue;
            for (let i = 0; i < it.v.length; i += font.codeLen) {
              const bytes = it.v.subarray(i, Math.min(i + font.codeLen, it.v.length));
              let code = 0; for (const b of bytes) code = code * 256 + b;
              const w0 = font.widthOf(code);
              const isSpace1 = font.codeLen === 1 && code === 32;
              const tx = (w0 / 1000 * Tfs + gs.Tc + (isSpace1 ? gs.Tw : 0)) * gs.Th;
              const m = matMul(tm, gs.ctm);
              const x0 = m[4] + gs.Ts * m[2], y0 = m[5] + gs.Ts * m[3];
              const x1 = x0 + tx * m[0];
              const g = {
                id: nextId++, bytes, code,
                uni: nfdPresentation(font.map.get(code) || ''),
                x0: Math.min(x0, x1), x1: Math.max(x0, x1), y: y0,
                fontSize: Tfs * Math.hypot(m[2], m[3]),
                wTJ: w0 + (gs.Tc + (isSpace1 ? gs.Tw : 0)) * 1000 / Tfs,
              };
              g.cps = [...g.uni].map(c => c.codePointAt(0));
              if (!g.cps.length) g.kind = 'other';
              else if (isHebLetter(g.cps[0])) { g.kind = 'letter'; g.inline = g.cps.slice(1).filter(isMarkCp); }
              else if (g.cps.every(isMarkCp)) g.kind = 'mark';
              else if (g.uni === ' ' || g.uni === '\u00A0') g.kind = 'space';
              else g.kind = 'other';
              events.push({ k: 'g', i: glyphs.length });
              glyphs.push(g);
              tm = matMul([1, 0, 0, 1, tx, 0], tm);
              stats.glyphs++;
              if (g.kind === 'letter' || g.kind === 'mark') stats.hebrewGlyphs++;
            }
          }
          if (!glyphs.length) break;
          const piece = { job, o, buf, glyphs, events, fill: gs.fill.slice(), fillRgb: gs.fillRgb.slice(),
                          fontRef: font.ref, fontName: gs.fontName, Tfs, opName: o.op };
          glyphs.forEach((g, gi) => { g.piece = piece; g.gi = gi; });
          job.pieces.push(piece);
          allPieces.push(piece);
          break;
        }
        default: break;
      }
    }
  }

  // ── stream direction: do marks PRECEDE or FOLLOW their base letter? ──────
  // Detected over the whole page's glyph sequence (not per Tj): Skia/Google Docs writes one
  // glyph per Tj. A "word" is a run of letters/marks that stays on one baseline without a jump.
  function marksPrecedeBase(gl) {
    let starts = 0, ends = 0, asc = 0, desc = 0;
    const joined = (a, b) => Math.abs(a.y - b.y) <= 0.4 * a.fontSize && Math.abs(b.x0 - a.x1) <= 1.5 * a.fontSize;
    let i = 0;
    while (i < gl.length) {
      if (gl[i].kind !== 'letter' && gl[i].kind !== 'mark') { i++; continue; }
      let j = i;
      while (j + 1 < gl.length && (gl[j + 1].kind === 'letter' || gl[j + 1].kind === 'mark') && joined(gl[j], gl[j + 1])) j++;
      if (gl[i].kind === 'mark') starts++;           // word opens with a bare mark  → marks precede
      if (gl[j].kind === 'mark') ends++;             // word closes with a bare mark → marks follow
      for (let k = i; k < j; k++) {                  // adjacent marks: ascending combining class = logical
        if (gl[k].kind === 'mark' && gl[k + 1].kind === 'mark') {
          const x = hebCCC(gl[k].cps[0]), y = hebCCC(gl[k + 1].cps[0]);
          if (x < y) asc++; else if (x > y) desc++;
        }
      }
      i = j + 1;
    }
    return { precede: (starts + desc) > (ends + asc), evidence: { starts, ends, asc, desc } };
  }

  // ── extract ──────────────────────────────────────────────────────────────
  const concat = list => {
    const out = new Uint8Array(list.reduce((s, b) => s + b.length + 1, 0)); let p = 0;
    for (const b of list) { out.set(b, p); p += b.length; out[p++] = 10; }
    return out;
  };

  function extract(onProgress = () => {}) {
    for (let pi = 0; pi < pages.length; pi++) {
      const page = pages[pi];
      const raw = page.node.get(PDFName.of('Contents'));
      const resolved = raw instanceof PDFRef ? ctx.lookup(raw) : raw;
      const refs = [], bufs = [];
      const take = r => {
        const s = r instanceof PDFRef ? ctx.lookup(r) : r;
        if (s instanceof PDFRawStream) { bufs.push(decodePDFRawStream(s).decode()); if (r instanceof PDFRef) refs.push(r); }
      };
      if (resolved instanceof PDFArray) { for (let i = 0; i < resolved.size(); i++) take(resolved.get(i)); if (raw instanceof PDFRef) refs.push(raw); }
      else take(raw);
      if (!bufs.length) continue;
      const buf = concat(bufs);
      const job = { kind: 'page', pageIndex: pi, page, refs, buf, pieces: [] };
      planStream(buf, page.node.Resources(), null, job);
      jobs.push(job);
      onProgress(Math.round(((pi + 1) / pages.length) * 100), pi + 1);
    }
    // Build legacy-shaped char records per page.
    // A mark belongs to the letter whose horizontal span contains it (works for producers that
    // emit one glyph per Tj and interleave marks, e.g. Skia / Google Docs). Stream adjacency is
    // used only to break ties when a mark sits exactly on the boundary of two letters.
    const perPage = pages.map(() => []);
    const glyphsByPage = pages.map(() => []);
    for (const p of allPieces) glyphsByPage[p.job.pageIndex].push(...p.glyphs);   // already in stream order

    for (let pi = 0; pi < pages.length; pi++) {
      const gl = glyphsByPage[pi], out = perPage[pi];
      const letters = gl.filter(g => g.kind === 'letter'), marks = gl.filter(g => g.kind === 'mark');
      const bucket = new Map();                                      // rounded baseline → letters
      for (const l of letters) { const k = Math.round(l.y); (bucket.get(k) || bucket.set(k, []).get(k)).push(l); }
      const centre = l => (l.x0 + l.x1) / 2;
      const EDGE = 0.75, MARGIN = 0.25;
      // distance from a mark to a letter's centre, in half-widths (1.0 = exactly on its edge)
      const nd = (m, l) => Math.abs(m.x0 - centre(l)) / Math.max((l.x1 - l.x0) / 2, 0.5);
      const candidates = m => {
        const tol = 0.55 * m.fontSize, c = [];
        for (let k = Math.floor(m.y - tol); k <= Math.ceil(m.y + tol); k++) {
          for (const l of (bucket.get(k) || [])) {
            if (Math.abs(l.y - m.y) <= tol && m.x0 >= l.x0 - EDGE && m.x0 <= l.x1 + EDGE) c.push(l);
          }
        }
        return c.sort((x, y) => nd(m, x) - nd(m, y));
      };
      // Adjacency first: the nearest base letter in the stream on the side the producer puts
      // marks (before or after the base) — accepted only if it is geometrically plausible.
      const order = marksPrecedeBase(gl);
      const precede = order.precede;
      stats.streamOrder = precede ? 'marks-before-letter' : 'marks-after-letter';
      const idxOf = new Map(gl.map((g, i) => [g, i]));
      const adjacent = m => {
        const step = precede ? 1 : -1;
        for (let i = idxOf.get(m) + step; i >= 0 && i < gl.length; i += step) {
          const g = gl[i];
          if (g.kind === 'mark') continue;
          if (g.kind !== 'letter') return null;
          return (Math.abs(g.y - m.y) <= 0.55 * m.fontSize &&
                  Math.abs(m.x0 - centre(g)) <= 0.9 * Math.max(g.x1 - g.x0, 0.5 * m.fontSize)) ? g : null;
        }
        return null;
      };
      const owner = new Map(), ties = [];
      for (const m of marks) {
        const adj = adjacent(m);
        if (adj) { owner.set(m, adj); continue; }
        // geometric fallback: the letter whose span contains the mark, ranked by centre distance
        const c = candidates(m);
        if (c.length) { owner.set(m, c[0]); continue; }
        const tol = 0.55 * m.fontSize; let best = null, bd = 0.6 * m.fontSize;
        for (let k = Math.floor(m.y - tol); k <= Math.ceil(m.y + tol); k++) {
          for (const l of (bucket.get(k) || [])) {
            const d = Math.abs(m.x0 - centre(l));
            if (Math.abs(l.y - m.y) <= tol && d < bd) { bd = d; best = l; }
          }
        }
        if (best) owner.set(m, best);
      }
      const attached = new Map();
      for (const m of marks) { const l = owner.get(m); if (l) (attached.get(l) || attached.set(l, []).get(l)).push(m); }
      stats.orphanMarks += marks.length - [...attached.values()].reduce((n, a) => n + a.length, 0);

      for (const base of letters) {
        const mk = (attached.get(base) || []).sort((a, b) => a.id - b.id);
        const members = [base, ...mk];
        const cx = (base.x0 + base.x1) / 2;
        out.push({
          char: String.fromCodePoint(base.cps[0]), cp: base.cps[0],
          x0: base.x0, x1: base.x1, y: base.y, fontSize: base.fontSize,
          isHebrew: true, isMark: false, src: members, srcBase: base,
        });
        const markCps = [...base.inline];
        for (const m of mk) markCps.push(...m.cps);
        // marks are placed at the base centre so legacy x-overlap association can't pick a neighbour
        for (const cp of markCps) {
          out.push({ char: String.fromCodePoint(cp), cp, x0: cx, x1: cx, y: base.y, fontSize: base.fontSize,
                     isHebrew: false, isMark: true, src: [] });
        }
      }
      for (const g of gl) {
        if (g.kind === 'other' && g.uni) {
          out.push({ char: g.uni, cp: g.cps[0], x0: g.x0, x1: g.x1, y: g.y, fontSize: g.fontSize,
                     isHebrew: false, isMark: false, src: [g] });
        }
      }
    }
    return perPage;
  }

  // ── which glyphs can be painted directly (niqqud-only colouring) ────────
  /** Glyph records to paint in the cell's colour, or null when the niqqud is fused into the letter glyph. */
  function recolorTargets(cell) {
    const src = cell.src || [];
    const base = cell.srcBase || src.find(g => g.kind === 'letter');
    const sepMarks = src.filter(g => g.kind === 'mark' && g.cps.some(cp => cp >= 0x05B0 && cp <= 0x05C7 && cp !== 0x05BE));
    if (cell.colorLetter) return base ? [base, ...sepMarks] : sepMarks;      // vav+holam / shuruk: whole glyph(s)
    const fused = base && base.inline.some(cp => cp >= 0x05B0 && cp <= 0x05BC);
    if (fused) return null;
    return sepMarks.length ? sepMarks : null;
  }

  // ── rewrite page / form streams ─────────────────────────────────────────
  /**
   * edits.remove  : Set of glyph ids to delete (advance preserved, so neighbours don't move)
   * edits.recolor : Map glyphId → '#rrggbb'
   * edits.opacity : 10..100 (blend toward white, like content.js's rgba on paper)
   */
  function rewrite(edits) {
    const remove = edits.remove || new Set(), recolor = edits.recolor || new Map();
    const enc = new TextEncoder();
    const dropRefs = new Set(), keepRefs = new Set();

    const renderPiece = p => {
      let touched = false;
      for (const g of p.glyphs) if (remove.has(g.id) || recolor.has(g.id)) { touched = true; break; }
      if (!touched) return null;
      const baseFill = p.fill.join('\n') + '\n';
      let out = '\n';
      if (p.opName === "'") out += 'T*\n';
      if (p.opName === '"') out += `${fmt(p.o.args[0].v)} Tw ${fmt(p.o.args[1].v)} Tc T*\n`;
      let chunk = [], hex = '', cur = null;
      const flushStr = () => { if (hex) { chunk.push('<' + hex + '>'); hex = ''; } };
      const pushNum = v => {
        flushStr();
        if (typeof chunk[chunk.length - 1] === 'number') chunk[chunk.length - 1] += v; else chunk.push(v);
      };
      const flushChunk = () => {
        flushStr();
        if (chunk.length) { out += '[' + chunk.map(c => typeof c === 'number' ? fmt(c) : c).join(' ') + '] TJ\n'; chunk = []; }
      };
      for (const ev of p.events) {
        if (ev.k === 'n') { pushNum(ev.v); continue; }
        const g = p.glyphs[ev.i];
        if (remove.has(g.id)) { pushNum(-g.wTJ); stats.deleted++; continue; }
        const c = recolor.get(g.id) || null;
        if (c !== cur) { flushChunk(); out += c ? blendOp(c, edits.opacity ?? 100) : baseFill; cur = c; }
        if (c) stats.recolored++;
        hex += toHex(g.bytes);
      }
      flushChunk();
      if (cur !== null) out += baseFill;
      return out;
    };

    for (const job of jobs) {
      const parts = [];
      let cursor = 0, changed = false;
      for (const p of job.pieces) {
        const txt = renderPiece(p);
        if (txt === null) continue;
        changed = true;
        parts.push(job.buf.subarray(cursor, p.o.s), enc.encode(txt));
        cursor = p.o.e;
      }
      if (!changed) { if (job.kind === 'page') job.refs.forEach(r => keepRefs.add(r)); continue; }
      parts.push(job.buf.subarray(cursor));
      const bytes = new Uint8Array(parts.reduce((s, b) => s + b.length, 0)); let q = 0;
      for (const b of parts) { bytes.set(b, q); q += b.length; }
      if (job.kind === 'page') {
        job.page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(bytes)));
        job.refs.forEach(r => dropRefs.add(r));
      } else {
        const lit = {};
        for (const [k, v] of job.stream.dict.entries()) {
          const nm = k.decodeText();
          if (nm === 'Length' || nm === 'Filter' || nm === 'DecodeParms') continue;
          lit[nm] = v;
        }
        ctx.assign(job.ref, ctx.flateStream(bytes, lit));
      }
    }
    for (const r of dropRefs) if (!keepRefs.has(r)) ctx.delete(r);
  }

  // ── vector clone: re-emit a cell's ORIGINAL glyphs somewhere else ───────
  /**
   * Each member glyph is positioned individually (its own origin), so this works whether the
   * producer wrote the cluster as one run or as separate runs per glyph.
   * Returns { members: [{ g, fontRef, fontSize, fill:[r,g,b] }] }.
   */
  function cloneSpec(cell) {
    const src = (cell.src || []).filter(Boolean);
    if (!src.length) return null;
    return { members: src.map(g => ({ g, fontRef: g.piece.fontRef, fontSize: g.fontSize, fill: g.piece.fillRgb })) };
  }

  return { extract, recolorTargets, rewrite, cloneSpec, stats, pages: () => pages, _pieces: () => allPieces };
}
