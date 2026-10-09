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
    colorNekudot:     false,
    fontEnabled:      true,
    letterSpacing:    0,
    focusMode:        true,
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
  function classifyShva(text, letterPos, diacritics, prevDominantNikud) {
    let wordInitial = true;
    for (let k = letterPos - 1; k >= 0; k--) {
      const c = text.charCodeAt(k);
      if (isHebrewLetter(c)) { wordInitial = false; break; }
      if (c === 0x20 || c === 0x05BE || c === 0x2D) break;
    }
    if (wordInitial) return 'SHVA_NA';
    const afterLen = letterPos + 1 + diacritics.length;
    if (afterLen >= text.length) return 'SHVA_NACH';
    if (prevDominantNikud && new Set(['\u05B5','\u05B4','\u05B9','\u05BB','\u05B8']).has(prevDominantNikud)) return 'SHVA_NA';
    if (diacritics.includes('\u05BC')) return 'SHVA_NA';
    return 'SHVA_NACH';
  }

  // Niqqud-only mode: keep letter + marks in the SAME text flow so the font's
  // own mark positioning (GPOS) places them; just colour the mark characters.
  function fillNikudOnly(span, slice, rgba) {
    span.appendChild(document.createTextNode(slice[0]));
    for (const ch of slice.slice(1)) {
      if (ALL_NIKUD_SET.has(ch)) {
        const m = document.createElement('span');
        m.className = 'otiyot-nk';
        m.style.color = rgba;
        m.textContent = ch;
        span.appendChild(m);
      } else {
        span.appendChild(document.createTextNode(ch));
      }
    }
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
      let i = 0, prevDominantNikud = null, prevWasShva = false;

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
            if (rawNikud === null && dageshSeen) {
              rawNikud = (cp === 0x05D5) ? '\u05BB' : '\u05BC';
            }

            let colourKey = null;
            if (rawNikud === SHVA_CHAR) {
              colourKey = classifyShva(text, i, diacritics, prevDominantNikud);
            } else if (rawNikud) {
              colourKey = rawNikud;
            }

            prevWasShva = (rawNikud === SHVA_CHAR);
            prevDominantNikud = rawNikud;
            wordLetters.push({ slice: ch + diacritics, colourKey });
            i = j;
          }

          // Build the word — either plain (no spacing) or wrapped in nowrap (with spacing)
          if (settings.letterSpacing > 0 && wordLetters.length > 1) {
            // Wrap word in inline-block nowrap so it never breaks mid-word
            const wordWrap = document.createElement('span');
            wordWrap.className = 'otiyot-word';
            wordWrap.style.cssText = 'display:inline-block;white-space:nowrap;';
            wordLetters.forEach(({ slice, colourKey }, idx) => {
              const span = document.createElement('span');
              span.className = 'otiyot-letter-block';
              const color = colourKey ? ACTIVE_VOWEL_HIGHLIGHTS[colourKey] : null;
              let filled = false;
              if (settings.colorNekudot && color) {
                const rgba = hexToRgba(color, settings.highlightOpacity);
                span.setAttribute('data-otiyot-hex', color);
                if (settings.highlightMode === 'nikud') {
                  fillNikudOnly(span, slice, rgba);
                  filled = true;
                } else {
                  span.style.backgroundColor = rgba;
                }
              }
              if (!filled) span.textContent = slice;
              wordWrap.appendChild(span);
              if (idx < wordLetters.length - 1) {
                wordWrap.appendChild(document.createTextNode('\u200B'));
              }
            });
            fragment.appendChild(wordWrap);
          } else {
            // No spacing — append spans directly with no wrap container needed
            wordLetters.forEach(({ slice, colourKey }) => {
              const span = document.createElement('span');
              span.className = 'otiyot-letter-block';
              const color = colourKey ? ACTIVE_VOWEL_HIGHLIGHTS[colourKey] : null;
              let filled = false;
              if (settings.colorNekudot && color) {
                const rgba = hexToRgba(color, settings.highlightOpacity);
                span.setAttribute('data-otiyot-hex', color);
                if (settings.highlightMode === 'nikud') {
                  fillNikudOnly(span, slice, rgba);
                  filled = true;
                } else {
                  span.style.backgroundColor = rgba;
                }
              }
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
  function stripOtiyotSpans() {
    const parents = new Set();
    document.querySelectorAll('.otiyot-word').forEach(w => {
      const p = w.parentNode; if (!p) return;
      p.replaceChild(document.createTextNode(w.textContent.replace(/\u200B/g, '')), w);
      parents.add(p);
    });
    document.querySelectorAll('.otiyot-letter-block').forEach(span => {
      const p = span.parentNode; if (!p) return;
      const orig = span.getAttribute('data-otiyot-orig');
      p.replaceChild(document.createTextNode(orig !== null ? orig : span.textContent), span);
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
    document.querySelectorAll('[data-otiyot-hex]').forEach(span => {
      const rgba = hexToRgba(span.getAttribute('data-otiyot-hex'), settings.highlightOpacity);
      if (settings.highlightMode === 'nikud') span.querySelectorAll('.otiyot-nk').forEach(m => { m.style.color = rgba; });
      else span.style.backgroundColor = rgba;
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
