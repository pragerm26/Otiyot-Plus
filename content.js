// =============================================================================
// Otiyot+ — Integrated Content Script
// =============================================================================

(function () {

  function isContextValid() {
    try { return !!chrome.runtime?.id; } catch (e) { return false; }
  }
  if (!isContextValid()) return;

  const CURRENT_HOST = location.hostname.toLowerCase();

  // ---------------------------------------------------------------------------
  // 1. NIKUD COLOUR MAP & CONFIG
  // ---------------------------------------------------------------------------
  const SHVA_CHAR = '\u05B0';

  const ALL_NIKUD = {
    'SHVA_NA':   { color: '#cc0000', key: 'nikud_shva_na',   label: 'Shva Na'   },
    'SHVA_NACH': { color: '#ff88aa', key: 'nikud_shva_nach', label: 'Shva Nach' },
    '\u05B4':    { color: '#ff9900', key: 'nikud_05B4',      label: 'Hiriq'     },
    '\u05B5':    { color: '#cccc00', key: 'nikud_05B5',      label: 'Tsere'     },
    '\u05B6':    { color: '#00cc00', key: 'nikud_05B6',      label: 'Segol'     },
    '\u05B7':    { color: '#6aa84f', key: 'nikud_05B7',      label: 'Patach'    },
    '\u05B8':    { color: '#6fa8dc', key: 'nikud_05B8',      label: 'Kamatz'    },
    '\u05B9':    { color: '#0000ff', key: 'nikud_05B9',      label: 'Holam'     },
    '\u05BB':    { color: '#9900ff', key: 'nikud_05BB',      label: 'Kubutz'    },
    '\u05BC':    { color: '#ff00ff', key: 'nikud_05BC',      label: 'Dagesh'    },
  };

  const HATAF_MAP = {
    '\u05B1': '\u05B6',
    '\u05B2': '\u05B7',
    '\u05B3': '\u05B8',
  };

  let ACTIVE_VOWEL_HIGHLIGHTS = {};
  let NIKUD_SET = new Set();
  const ALL_NIKUD_SET = new Set([
    ...Object.keys(ALL_NIKUD).filter(k => k.length === 1),
    SHVA_CHAR,
    ...Object.keys(HATAF_MAP),
  ]);

  // ---------------------------------------------------------------------------
  // 2. SETTINGS STATE
  // ---------------------------------------------------------------------------
  let settings = {
    colorNekudot:     true,
    fontEnabled:      true,
    letterSpacing:    0,
    focusMode:        false,
    highlightMode:    'block',
    highlightOpacity: 100,
    nikudColors:      {},   // user overrides: { nikud_05B4: '#rrggbb', ... }
  };

  // ---------------------------------------------------------------------------
  // 3. HELPERS
  // ---------------------------------------------------------------------------
  function isCantillation(code) { return code >= 0x0591 && code <= 0x05AF; }
  function isHebrewLetter(code) { return code >= 0x05D0 && code <= 0x05EA; }
  function isLetterModifier(code) {
    return code === 0x05C1 || code === 0x05C2 || code === 0x05BF || code === 0x05C4 || code === 0x05C5;
  }

  function hexToRgba(hex, opacity) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${(opacity / 100).toFixed(2)})`;
  }

  function rebuildActiveNikud() {
    ACTIVE_VOWEL_HIGHLIGHTS = {};
    if (!settings.colorNekudot) { NIKUD_SET = new Set(); return; }

    Object.entries(ALL_NIKUD).forEach(([key, meta]) => {
      if (settings[meta.key] !== false) {
        const custom = settings.nikudColors && settings.nikudColors[meta.key];
        ACTIVE_VOWEL_HIGHLIGHTS[key] = (typeof custom === 'string' && /^#[0-9a-f]{6}$/i.test(custom)) ? custom : meta.color;
      }
    });
    Object.entries(HATAF_MAP).forEach(([hataf, base]) => {
      if (ACTIVE_VOWEL_HIGHLIGHTS[base] !== undefined)
        ACTIVE_VOWEL_HIGHLIGHTS[hataf] = ACTIVE_VOWEL_HIGHLIGHTS[base];
    });
    NIKUD_SET = new Set(Object.keys(ACTIVE_VOWEL_HIGHLIGHTS).filter(k => k.length === 1));
    if (settings['nikud_shva_na'] !== false || settings['nikud_shva_nach'] !== false)
      NIKUD_SET.add(SHVA_CHAR);
  }

  // ---------------------------------------------------------------------------
  // 4. VISUALS & CSS
  // ---------------------------------------------------------------------------
  function applyVisualSettings() {
    let styleEl = document.getElementById('otiyot-plus-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'otiyot-plus-style';
      (document.head || document.documentElement).appendChild(styleEl);
    }

    let fontUrl = '';
    try { fontUrl = chrome.runtime.getURL('dyslexia-hebrew-extended.otf'); } catch (e) { return; }

    const fontFace = `@font-face { font-family: 'DyslexiaHebrew'; src: url('${fontUrl}') format('opentype'); unicode-range: U+05D0-05EA, U+05B0-05BD, U+05BF, U+05C1-05C2, U+05C4-05C5, U+05C7, U+FB1D-FB4E; }`;

    styleEl.textContent = fontFace + `
      .otiyot-letter-block {
        display: inline; line-height: inherit;
        ${settings.fontEnabled ? "font-family: 'DyslexiaHebrew', sans-serif !important;" : ""}
        ${settings.letterSpacing > 0 ? `letter-spacing: ${settings.letterSpacing.toFixed(1)}px !important;` : ""}
      }
      .otiyot-word { display: inline-block; white-space: nowrap; }
      .otiyot-wov { display: inline; direction: rtl; unicode-bidi: bidi-override; }
      .otiyot-ob { display: inline-grid; justify-items: start; text-indent: 0; text-align: start; white-space: nowrap; }
      .otiyot-ob > .otiyot-nk, .otiyot-ob > .otiyot-dg, .otiyot-ob > .otiyot-top { grid-area: 1 / 1; }
      .otiyot-letter-block > .otiyot-nk, .otiyot-letter-block > .otiyot-dg, .otiyot-letter-block > .otiyot-top { font-size: inherit !important; line-height: inherit !important; font-weight: inherit !important; font-style: inherit !important; letter-spacing: inherit !important; ${settings.fontEnabled ? "font-family: 'DyslexiaHebrew', sans-serif !important;" : "font-family: inherit !important;"} }
      .otiyot-top, .otiyot-dg { pointer-events: none; -webkit-user-select: none; user-select: none; }
      .otiyot-ob, .otiyot-letter-block > .otiyot-nk, .otiyot-letter-block > .otiyot-dg, .otiyot-letter-block > .otiyot-top { font-synthesis: none !important; text-shadow: none !important; text-align: start !important; text-justify: none !important; text-indent: 0 !important; }
      ${settings.letterSpacing > 0 ? `.otiyot-space { display: inline-block; width: ${(0.35 + settings.letterSpacing * 0.55).toFixed(2)}em; }` : ''}
      #otiyot-focus-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); pointer-events: none; z-index: 2147483647; transition: opacity 0.3s; opacity: 0; will-change: clip-path; }
      #otiyot-focus-overlay.active { opacity: 1; }
      ${settings.focusMode ? `
        .otiyot-letter-block::selection { background: transparent !important; color: inherit !important; }
      ` : ''}
    `;
  }

  // ---------------------------------------------------------------------------
  // 5. SAFE NODE FILTERING
  // ---------------------------------------------------------------------------
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
    'SVG', 'MATH', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME',
    'CODE', 'PRE', 'KBD', 'SAMP',
  ]);

  function isInsideInteractive(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      if (!cur.tagName) { cur = cur.parentElement; continue; }
      if (SKIP_TAGS.has(cur.tagName.toUpperCase())) return true;
      if (cur.isContentEditable) return true;
      const role = cur.getAttribute && cur.getAttribute('role');
      if (role && /^(textbox|spinbutton|combobox|listbox|grid|treegrid|slider)$/i.test(role)) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // 6. PROCESSING LOGIC
  // ---------------------------------------------------------------------------
  // True when the letter at letterPos follows a bare yod (no vowel) that itself follows a hiriq.
  function isAfterHiriqMale(text, letterPos) {
    let k = letterPos - 1;
    while (k >= 0 && !isHebrewLetter(text.charCodeAt(k))) k--;
    if (k < 0 || text.charCodeAt(k) !== 0x05D9) return false;
    const between = text.slice(k + 1, letterPos);
    if (/[\u05B0-\u05BB]/.test(between)) return false;           // yod carries its own vowel
    let m = k - 1;
    while (m >= 0 && !isHebrewLetter(text.charCodeAt(m))) m--;
    if (m < 0) return false;
    const seg = text.slice(m + 1, k);
    return seg.includes('\u05B4') && !/[ \u00A0\u05BE-]/.test(seg);
  }

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

  // Builds the shvaKind() context for the letter at letterPos by looking at the text around it.
  function shvaContext(text, letterPos, diacritics, prev) {
    let wordInitial = true;
    for (let k = letterPos - 1; k >= 0; k--) {
      const c = text.charCodeAt(k);
      if (isHebrewLetter(c)) { wordInitial = false; break; }
      if (c === 0x20 || c === 0x05BE || c === 0x2D) break;
    }
    const after = letterPos + 1 + diacritics.length;
    const nextIsLetter = after < text.length && isHebrewLetter(text.charCodeAt(after));
    let nextSameLetter = false, nextFinalShva = false;
    if (nextIsLetter) {
      nextSameLetter = text[after] === text[letterPos];
      let q = after + 1, nd = '';
      while (q < text.length) {
        const nc = text.charCodeAt(q);
        if (ALL_NIKUD_SET.has(text[q]) || isCantillation(nc) || isLetterModifier(nc)) { nd += text[q]; q++; } else break;
      }
      nextFinalShva = nd.includes(SHVA_CHAR) && !(q < text.length && isHebrewLetter(text.charCodeAt(q)));
    }
    return {
      wordInitial, wordFinal: !nextIsLetter, nextFinalShva, nextSameLetter,
      hasDagesh: diacritics.includes('\u05BC'),
      prevWasShva: prev.wasShva,
      prevLong: prev.isLong || isAfterHiriqMale(text, letterPos),
    };
  }

  // Vav carrying a holam (וֹ) or a shuruk (וּ = vav + dagesh, no vowel) should have the
  // vav itself coloured along with the niqqud. A vav with dagesh AND a vowel is a
  // dagesh chazak, not a shuruk, so it is left alone.
  function isColoredVav(slice, colourKey) {
    if ((slice[0] === '\u05D9' || slice[0] === '\u05D6') && colourKey === '\u05BC') return true;   // yod/zayin + dagesh only
    if (slice[0] !== '\u05D5') return false;
    if (colourKey === '\u05B9') return true;                       // holam
    return colourKey === '\u05BB' && slice.includes('\u05BC') &&   // shuruk (mapped to Kubutz key)
           !/[\u05B0-\u05BB]/.test(slice);
  }

  // Niqqud-only mode. Chrome paints a combining mark in its base letter's colour, so marks
  // cannot be coloured on their own by wrapping them (or by ::highlight ranges). Instead:
  //   .otiyot-ob            inline-block box for the letter
  //     .otiyot-nk          the FULL letter+marks text (one unsplit text node) in the niqqud colour
  //     .otiyot-top         the letter WITHOUT the coloured marks, same font/position, drawn on top
  //                         in the normal text colour -> only the marks keep the niqqud colour.
  // Both layers are shaped by the same font, so mark positions are identical in any font.
  // A vav with holam / shuruk skips the overlay: the whole vav is coloured.
  // Any letter whose two layers do not come out the same size/position (the font or the site's
  // font swaps glyphs for letter+mark, e.g. some hey / yod forms) cannot be overlaid cleanly:
  // drop its top layer so the whole letter simply takes the niqqud colour. No fringe, no guessing.
  const _checks = [];
  function verifyOverlays() {
    const list = _checks.splice(0), bad = [];
    for (const ob of list) {
      if (!ob.isConnected) continue;
      const nk = ob.querySelector(':scope > .otiyot-nk'), top = ob.querySelector(':scope > .otiyot-top');
      const dg = ob.querySelector(':scope > .otiyot-dg');
      if (!nk || !top) continue;
      const a = nk.getBoundingClientRect(), b = top.getBoundingClientRect();
      const off = r => Math.abs(r.width - b.width) > 0.6 || Math.abs(r.left - b.left) > 0.6 || Math.abs(r.top - b.top) > 0.6;
      if (off(a)) bad.push([ob, top, dg]);
      else if (dg && off(dg.getBoundingClientRect())) dg.remove();   // dagesh layer misaligned: dagesh just keeps the vowel colour
    }
    for (const [ob, top, dg] of bad) { top.remove(); if (dg) dg.remove(); ob.classList.remove('otiyot-ob'); }
  }

  // Vowel + dagesh (dagesh chazak, or a vowel under a begadkefat dagesh): the vowel owns the main
  // colour, the dagesh gets its own. A third layer .otiyot-dg (letter + dagesh only, in the dagesh
  // colour) sits between .otiyot-nk and .otiyot-top, so the dagesh is repainted over the vowel colour.
  // dgRgba === null -> no dagesh layer.  rgba === null -> the vowel is NOT coloured (toggle off).
  function fillNikudOverlay(span, slice, rgba, colorLetter, dgRgba) {
    const nk = document.createElement('span');
    nk.className = 'otiyot-nk';
    nk.style.color = rgba || 'inherit';
    nk.textContent = slice;
    span.appendChild(nk);
    if (colorLetter) return;
    let base = slice[0];
    const keepDagesh = slice[0] === '\u05D9' || slice[0] === '\u05D6';          // yod/zayin+dagesh = one composed glyph
    for (const ch of slice.slice(1)) if (!ALL_NIKUD_SET.has(ch) || (keepDagesh && ch === '\u05BC')) base += ch;   // keep shin dot, cantillation...
    span.classList.add('otiyot-ob');
    _checks.push(span);
    if (dgRgba) {
      let dgText = slice[0];
      for (const ch of slice.slice(1)) if (ch === '\u05BC' || ch === '\u05C1' || ch === '\u05C2') dgText += ch;   // letter + dagesh (+ shin/sin dot) only
      const dg = document.createElement('span');
      dg.className = 'otiyot-dg';
      dg.setAttribute('aria-hidden', 'true');
      dg.style.color = dgRgba;
      dg.textContent = dgText;
      span.appendChild(dg);
    }
    const top = document.createElement('span');     // real element: no CSS content/attr() needed
    top.className = 'otiyot-top';
    top.setAttribute('aria-hidden', 'true');
    top.textContent = base;
    span.appendChild(top);
  }

  // Applies the colour(s) for one letter. Returns true when it built the niqqud-only overlay
  // (the caller must NOT set textContent in that case).
  function paintLetter(span, slice, colourKey) {
    if (!settings.colorNekudot) return false;
    const color = colourKey ? ACTIVE_VOWEL_HIGHLIGHTS[colourKey] : null;
    if (settings.highlightMode !== 'nikud') {              // block mode: one background per letter, the vowel wins
      if (!color) return false;
      span.setAttribute('data-otiyot-hex', color);
      span.style.backgroundColor = hexToRgba(color, settings.highlightOpacity);
      return false;
    }
    const colorLetter = !!color && isColoredVav(slice, colourKey);
    const dgHex = (!colorLetter && /[\u05B0-\u05BB]/.test(slice) && slice.includes('\u05BC') &&
                   slice[0] !== '\u05D9' && slice[0] !== '\u05D6')        // yod/zayin: dagesh is baked into the glyph
                  ? ACTIVE_VOWEL_HIGHLIGHTS['\u05BC'] : null;
    if (!color && !dgHex) return false;
    const op = settings.highlightOpacity;
    if (color) span.setAttribute('data-otiyot-hex', color);
    if (dgHex) span.setAttribute('data-otiyot-dg-hex', dgHex);
    fillNikudOverlay(span, slice, color ? hexToRgba(color, op) : null, colorLetter, dgHex ? hexToRgba(dgHex, op) : null);
    return true;
  }

  const HEB_RE = /[\u05D0-\u05EA\uFB1D-\uFB4E]/;
  const ROLE_RE = /^(textbox|spinbutton|combobox|listbox|grid|treegrid|slider)$/i;

  // One pass; whole skipped subtrees (code, inputs, editors, svg...) are rejected at their
  // root instead of walking up the ancestor chain for every single text node.
  function collectTargets(root) {
    const targets = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1) {
          if (SKIP_TAGS.has(n.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
          if (n.classList.contains('otiyot-letter-block') || n.classList.contains('otiyot-word')) return NodeFilter.FILTER_REJECT;
          if (n.hasAttribute('contenteditable') && n.isContentEditable) return NodeFilter.FILTER_REJECT;
          if (n.hasAttribute('role') && ROLE_RE.test(n.getAttribute('role'))) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_SKIP;
        }
        return HEB_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    let node;
    while ((node = walker.nextNode())) targets.push(node);
    return targets;
  }

  // Work in ~10 ms slices so the page stays responsive and the first screenful appears at once.
  // A newer rebuild bumps _gen, which silently cancels any slices still queued.
  let _gen = 0;
  function runBatched(items, fn, gen, done) {
    let idx = 0;
    const step = () => {
      if (gen !== _gen) return;
      observer.disconnect();                       // never observe our own DOM writes
      const t0 = performance.now();
      while (idx < items.length && performance.now() - t0 < 10) {
        try { fn(items[idx]); } catch (e) { /* one bad node must not stop the rest */ }
        idx++;
      }
      verifyOverlays();
      if (!siteDisabled) observeBody();
      if (idx < items.length) setTimeout(step, 0);
      else if (done) done();
    };
    step();
  }

  function processTextNodes(root, done) {
    const active = settings.colorNekudot || settings.fontEnabled || settings.letterSpacing > 0;
    if (!active || siteDisabled) { if (done) done(); return; }
    if (root.nodeType === 1 && isInsideInteractive(root)) { if (done) done(); return; }

    const gen = _gen;
    const targets = collectTargets(root);

    const processOne = (textNode) => {
      const rawText = textNode.nodeValue;
      if (!/[\u05D0-\u05EA\uFB1D-\uFB4E]/.test(rawText)) return;
      // Some sources store shin/sin (and dagesh forms, vav+holam, etc.) as single precomposed
      // presentation-form characters (U+FB2A etc.). Split them into base letter + marks so they
      // are wrapped, colored and given the font like every other letter.
      const text = rawText.replace(/[\uFB1D-\uFB4E]/g, c => c.normalize('NFD'));
      if (!textNode.parentNode || !document.contains(textNode.parentNode)) return;

      const fragment = document.createDocumentFragment();
      let i = 0, prevWasShva = false, prevIsLong = false;

      while (i < text.length) {
        const char = text[i], charCode = char.charCodeAt(0);
        if (isHebrewLetter(charCode)) {
          // Collect the whole Hebrew word first, then wrap it in a nowrap container.
          // This prevents letter-spacing \u200B chars from creating mid-word line breaks.
          const wordStart = i;
          const wordLetters = []; // [{char+diacritics, rawNikud, colourKey}]

          while (i < text.length) {
            const ch = text[i], cp = ch.charCodeAt(0);
            if (!isHebrewLetter(cp)) break;

            let diacritics = '', rawNikud = null, dageshSeen = false, j = i + 1;
            while (j < text.length) {
              const nc = text.charCodeAt(j);
              if (ALL_NIKUD_SET.has(text[j]) || isCantillation(nc) || isLetterModifier(nc)) {
                if (text[j] === '\u05BC') {
                  dageshSeen = true;                 // hold dagesh aside — a real vowel always wins
                } else if (ALL_NIKUD_SET.has(text[j]) && rawNikud === null) {
                  rawNikud = text[j];
                }
                diacritics += text[j]; j++;
              } else break;
            }
            // No vowel present: vav + dagesh is shuruk (→ Kubutz); any other letter + dagesh stays dagesh
            let isShuruk = false;
            if (rawNikud === null && dageshSeen) {
              isShuruk = (cp === 0x05D5);
              rawNikud = isShuruk ? '\u05BB' : '\u05BC';
            }

            let colourKey = null;
            if (rawNikud === SHVA_CHAR) {
              colourKey = shvaKind(shvaContext(text, i, diacritics, { wasShva: prevWasShva, isLong: prevIsLong }));
            } else if (rawNikud) {
              colourKey = rawNikud;
            }

            prevWasShva = (rawNikud === SHVA_CHAR);
            prevIsLong  = LONG_VOWELS.has(rawNikud) || isShuruk;      // shuruk is long; kubutz is not
            wordLetters.push({ slice: ch + diacritics, colourKey });
            i = j;
          }

          // Build the word — either plain (no spacing) or wrapped in nowrap (with spacing)
          // Niqqud-only letters are inline-blocks, so every word gets a nowrap RTL wrapper:
          // no mid-word line breaks, and the letters keep their right-to-left order even on LTR pages.
          const ovMode  = settings.colorNekudot && settings.highlightMode === 'nikud';
          const useWrap = ovMode || (settings.letterSpacing > 0 && wordLetters.length > 1);
          if (useWrap) {
            const wordWrap = document.createElement('span');
            if (ovMode) {
              wordWrap.className = 'otiyot-word otiyot-wov';
              wordWrap.style.cssText = 'white-space:nowrap;';
            } else {
              wordWrap.className = 'otiyot-word';
              wordWrap.style.cssText = 'display:inline-block;white-space:nowrap;';
            }
            wordLetters.forEach(({ slice, colourKey }, idx) => {
              const span = document.createElement('span');
              span.className = 'otiyot-letter-block';
              const filled = paintLetter(span, slice, colourKey);
              if (!filled) span.textContent = slice;
              wordWrap.appendChild(span);
              if (settings.letterSpacing > 0 && idx < wordLetters.length - 1) {
                wordWrap.appendChild(document.createTextNode('\u200B'));
              }
            });
            fragment.appendChild(wordWrap);
          } else {
            // No spacing — append spans directly with no wrap container needed
            wordLetters.forEach(({ slice, colourKey }) => {
              const span = document.createElement('span');
              span.className = 'otiyot-letter-block';
              const filled = paintLetter(span, slice, colourKey);
              if (!filled) span.textContent = slice;
              fragment.appendChild(span);
            });
          }

        } else {
          // For spaces between Hebrew words, inject extra visual gap when letter spacing is on
          if (settings.letterSpacing > 0 && (charCode === 0x20 || charCode === 0xA0)) {
            const spaceSpan = document.createElement('span');
            spaceSpan.className = 'otiyot-letter-block otiyot-space';
            spaceSpan.setAttribute('data-otiyot-orig', char);   // so strip restores the real space
            spaceSpan.textContent = '\u00A0';
            fragment.appendChild(spaceSpan);
          } else {
            fragment.appendChild(document.createTextNode(char));
          }
          i++;
        }
      }
      if (textNode.parentNode) textNode.parentNode.replaceChild(fragment, textNode);
    };

    runBatched(targets, processOne, gen, done);
  }

  // ---------------------------------------------------------------------------
  // 7. READING FOCUS MODE
  // ---------------------------------------------------------------------------
  let _focusHandler = null, _focusMousedown = null, _focusBlur = null;

  function teardownFocusMode() {
    if (_focusHandler) {
      document.removeEventListener('selectionchange', _focusHandler);
      document.removeEventListener('scroll', _focusHandler, { capture: true });
      window.removeEventListener('resize', _focusHandler);
    }
    if (_focusMousedown) document.removeEventListener('mousedown', _focusMousedown);
    if (_focusBlur) window.removeEventListener('blur', _focusBlur);
    const ov = document.getElementById('otiyot-focus-overlay');
    const svg = document.getElementById('otiyot-clip-svg');
    if (ov) ov.remove(); if (svg) svg.remove();
  }

  function initFocusMode() {
    teardownFocusMode();
    if (!settings.focusMode) return;

    const overlay = document.createElement('div');
    overlay.id = 'otiyot-focus-overlay';
    document.body.appendChild(overlay);

    const svgNS = 'http://www.w3.org/2000/svg';
    const clipSvg = document.createElementNS(svgNS, 'svg');
    clipSvg.id = 'otiyot-clip-svg';
    clipSvg.setAttribute('style', 'position:fixed;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483646');
    const clipPathEl = document.createElementNS(svgNS, 'clipPath');
    clipPathEl.id = 'otiyot-focus-clip';
    clipPathEl.setAttribute('clipPathUnits', 'userSpaceOnUse');
    clipSvg.appendChild(clipPathEl);
    document.body.appendChild(clipSvg);

    const updateClip = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.toString().trim().length === 0) return;
      const range = sel.getRangeAt(0);
      const W = window.innerWidth, H = window.innerHeight, PAD = 6;
      const rawRects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0 && r.bottom >= 0 && r.top <= H);
      if (rawRects.length === 0) return;

      const lines = [];
      rawRects.forEach(r => {
        let merged = false;
        for (const line of lines) {
          if (Math.min(r.bottom, line.bottom) + 4 > Math.max(r.top, line.top)) {
            line.left   = Math.min(line.left,   r.left);
            line.right  = Math.max(line.right,  r.right);
            line.top    = Math.min(line.top,     r.top);
            line.bottom = Math.max(line.bottom,  r.bottom);
            merged = true; break;
          }
        }
        if (!merged) lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      });

      let d = `M0,0 L0,${H} L${W},${H} L${W},0 Z `;
      lines.forEach(l => {
        const x1 = Math.max(0, l.left  - PAD), y1 = Math.max(0, l.top    - PAD);
        const x2 = Math.min(W, l.right + PAD), y2 = Math.min(H, l.bottom + PAD);
        d += `M${x1},${y1} L${x2},${y1} L${x2},${y2} L${x1},${y2} Z `;
      });

      while (clipPathEl.firstChild) clipPathEl.removeChild(clipPathEl.firstChild);
      const pathEl = document.createElementNS(svgNS, 'path');
      pathEl.setAttribute('d', d.trim());
      pathEl.setAttribute('fill-rule', 'evenodd');
      clipPathEl.appendChild(pathEl);
      overlay.style.clipPath = 'url(#otiyot-focus-clip)';
      overlay.classList.add('active');
    };

    _focusHandler = updateClip;
    document.addEventListener('selectionchange', updateClip);
    document.addEventListener('scroll', updateClip, { passive: true, capture: true });
    window.addEventListener('resize', updateClip);
    _focusMousedown = () => overlay.classList.remove('active');
    document.addEventListener('mousedown', _focusMousedown);
    _focusBlur = () => overlay.classList.remove('active');
    window.addEventListener('blur', _focusBlur);
  }

  // ---------------------------------------------------------------------------
  // 8. INITIALIZATION
  // ---------------------------------------------------------------------------

  // Removes everything we added and restores the ORIGINAL text exactly:
  // word wrappers (and their zero-width spaces), and spaces we widened.
  // Text of an Otiyot wrapper without the duplicate .otiyot-top overlay letters.
  function cleanText(el) {
    if (!el.querySelector('.otiyot-top, .otiyot-dg')) return el.textContent;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.otiyot-top, .otiyot-dg').forEach(t => t.remove());
    return clone.textContent;
  }

  function stripOtiyotSpans() {
    const parents = new Set();
    document.querySelectorAll('.otiyot-word').forEach(w => {
      const p = w.parentNode; if (!p) return;
      p.replaceChild(document.createTextNode(cleanText(w).replace(/\u200B/g, '')), w);
      parents.add(p);
    });
    document.querySelectorAll('.otiyot-letter-block').forEach(span => {
      const p = span.parentNode; if (!p) return;
      const orig = span.getAttribute('data-otiyot-orig');
      p.replaceChild(document.createTextNode(orig !== null ? orig : cleanText(span)), span);
      parents.add(p);
    });
    parents.forEach(p => { try { p.normalize(); } catch (e) {} });   // only the touched parents
  }

  let siteDisabled = false;
  let builtKey = null, lastFocus = null, _applyTimer = null;

  // Only things that change the DOM structure force a rebuild. Font, letter-spacing amount,
  // focus mode and opacity are CSS / in-place updates and are instant.
  function structKey() {
    const toggles = Object.values(ALL_NIKUD).map(m => settings[m.key] !== false ? 1 : 0).join('');
    const needSpans = settings.colorNekudot || settings.fontEnabled || settings.letterSpacing > 0;
    return [settings.colorNekudot ? 1 : 0, settings.highlightMode, toggles,
            JSON.stringify(settings.nikudColors || {}), settings.letterSpacing > 0 ? 1 : 0, needSpans ? 1 : 0].join('|');
  }

  function restyleOpacity() {
    document.querySelectorAll('[data-otiyot-hex],[data-otiyot-dg-hex]').forEach(span => {
      const hex = span.getAttribute('data-otiyot-hex'), dgHex = span.getAttribute('data-otiyot-dg-hex');
      if (settings.highlightMode === 'nikud') {
        if (hex)   span.querySelectorAll('.otiyot-nk').forEach(m => { m.style.color = hexToRgba(hex, settings.highlightOpacity); });
        if (dgHex) span.querySelectorAll('.otiyot-dg').forEach(m => { m.style.color = hexToRgba(dgHex, settings.highlightOpacity); });
      } else if (hex) span.style.backgroundColor = hexToRgba(hex, settings.highlightOpacity);
    });
  }

  function fullRebuild() {
    _gen++;
    observer.disconnect();
    stripOtiyotSpans();
    processTextNodes(document.body);
  }

  function refresh() {
    if (siteDisabled) return;
    rebuildActiveNikud();
    applyVisualSettings();
    const key = structKey();
    if (key !== builtKey) { builtKey = key; fullRebuild(); }
    else restyleOpacity();
    if (lastFocus !== settings.focusMode) { lastFocus = settings.focusMode; initFocusMode(); }
  }

  function scheduleApply() {
    clearTimeout(_applyTimer);
    _applyTimer = setTimeout(refresh, 16);
  }

  function applyAll() { builtKey = null; lastFocus = null; refresh(); }

  // Ignores no-op updates (the popup sends the same values again after its debounced save).
  function applySettings(upd) {
    let changed = false;
    for (const k in upd) {
      if (JSON.stringify(settings[k]) !== JSON.stringify(upd[k])) { settings[k] = upd[k]; changed = true; }
    }
    if (changed) scheduleApply();
  }

  function setSiteDisabled(flag) {
    if (flag === siteDisabled) return;
    siteDisabled = flag;
    if (flag) {
      _gen++;
      observer.disconnect();
      stripOtiyotSpans();
      teardownFocusMode();
      const styleEl = document.getElementById('otiyot-plus-style');
      if (styleEl) styleEl.remove();
      builtKey = null; lastFocus = null;
    } else {
      applyAll();
    }
  }

  function observeBody() {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  const _pending = new Set();
  let _observerTimer = null;
  const isOurs = n => n.classList && (n.classList.contains('otiyot-letter-block') || n.classList.contains('otiyot-word'));
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData') {            // page rewrote a text node in place (SPAs, live regions)
        const el = m.target.parentElement;
        if (el && !el.closest('.otiyot-letter-block')) _pending.add(el);
        continue;
      }
      m.addedNodes.forEach(n => {
        if (n.nodeType === 1 && !isOurs(n)) _pending.add(n);
        else if (n.nodeType === 3 && n.parentElement && !n.parentElement.closest('.otiyot-letter-block')) _pending.add(n.parentElement);
      });
    }
    if (_pending.size === 0) return;
    clearTimeout(_observerTimer);
    _observerTimer = setTimeout(() => {
      const list = [..._pending]; _pending.clear();
      list.filter(el => el.isConnected).forEach(el => processTextNodes(el));
    }, 100);
  });

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'OTIYOT_SETTINGS')    applySettings(msg.settings);
      if (msg.type === 'OTIYOT_SITE_TOGGLE') setSiteDisabled(!!msg.disabled);
    });

    // Other tabs / iframes pick changes up live — no refresh needed.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const upd = {};
      for (const k in changes) {
        if (k === 'disabledSites') setSiteDisabled((changes[k].newValue || []).includes(CURRENT_HOST));
        else if ('newValue' in changes[k]) upd[k] = changes[k].newValue;
      }
      if (Object.keys(upd).length) applySettings(upd);
    });

    const nikudDefaults = {};
    Object.values(ALL_NIKUD).forEach(({ key }) => { nikudDefaults[key] = true; });

    chrome.storage.sync.get({ ...settings, ...nikudDefaults, disabledSites: [] }, (res) => {
      siteDisabled = !!(res.disabledSites && res.disabledSites.includes(CURRENT_HOST));
      if (siteDisabled) return;
      Object.assign(settings, res);
      applyAll();
    });
  } catch (e) { /* extension context invalidated */ }

})();
