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
      if (settings[meta.key] !== false) ACTIVE_VOWEL_HIGHLIGHTS[key] = meta.color;
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
    try { fontUrl = chrome.runtime.getURL('fonts/dyslexia-hebrew-extended.otf'); } catch (e) { return; }

    const fontFace = `@font-face { font-family: 'DyslexiaHebrew'; src: url('${fontUrl}') format('opentype'); unicode-range: U+05D0-05EA, U+05B0-05BD, U+05BF, U+05C1-05C2, U+05C4-05C5, U+05C7, U+FB1D-FB4E; }`;

    const nikudOnlyRule = settings.colorNekudot && settings.highlightMode === 'nikud' ? `
      .otiyot-letter-block[data-nikud] { color: transparent !important; position: relative; }
      .otiyot-letter-block[data-nikud]::before { content: attr(data-letter); position: absolute; left: 0; top: 0; color: var(--otiyot-text-color, inherit); pointer-events: none; white-space: pre; }
      .otiyot-letter-block[data-nikud]::after  { content: attr(data-nikud);  position: absolute; left: 0; top: 0; color: var(--otiyot-nikud-color); pointer-events: none; white-space: pre; }
    ` : '';

    if (settings.colorNekudot && settings.highlightMode === 'nikud') {
      const bodyColor = window.getComputedStyle(document.body).color || '#000000';
      document.documentElement.style.setProperty('--otiyot-text-color', bodyColor);
    }

    styleEl.textContent = fontFace + `
      .otiyot-letter-block {
        display: inline; line-height: inherit;
        ${settings.fontEnabled ? "font-family: 'DyslexiaHebrew', sans-serif !important;" : ""}
        ${settings.letterSpacing > 0 ? `letter-spacing: ${settings.letterSpacing.toFixed(1)}px !important;` : ""}
      }
      ${nikudOnlyRule}
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

  function processTextNodes(root) {
    const active = settings.colorNekudot || settings.fontEnabled || settings.letterSpacing > 0;
    if (!active) return;

    // Quick bail: if this subtree has no Hebrew at all, skip it entirely
    if (root.textContent && !/[\u05D0-\u05EA]/.test(root.textContent)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const targets = [];
    let node;
    while ((node = walker.nextNode())) {
      const el = node.parentElement;
      if (!el) continue;
      if (el.classList.contains('otiyot-letter-block')) continue;
      if (isInsideInteractive(el)) continue;
      targets.push(node);
    }

    targets.forEach(textNode => {
      const text = textNode.nodeValue;
      if (!/[\u05D0-\u05EA]/.test(text)) return;
      // Safety: skip if parent is no longer in the document
      if (!textNode.parentNode || !document.contains(textNode.parentNode)) return;

      const fragment = document.createDocumentFragment();
      let i = 0, prevDominantNikud = null, prevWasShva = false;

      while (i < text.length) {
        const char = text[i], charCode = char.charCodeAt(0);
        if (isHebrewLetter(charCode)) {
          let diacritics = '', rawNikud = null, j = i + 1;
          while (j < text.length) {
            const nc = text.charCodeAt(j);
            if (ALL_NIKUD_SET.has(text[j]) || isCantillation(nc) || isLetterModifier(nc)) {
              if (ALL_NIKUD_SET.has(text[j]) && rawNikud === null) rawNikud = text[j];
              diacritics += text[j]; j++;
            } else break;
          }

          let colourKey = null;
          if (rawNikud === SHVA_CHAR) {
            colourKey = classifyShva(text, i, diacritics, prevDominantNikud);
          } else if (rawNikud) {
            colourKey = rawNikud;
          }

          prevWasShva = (rawNikud === SHVA_CHAR);
          prevDominantNikud = rawNikud;

          const span = document.createElement('span');
          span.className = 'otiyot-letter-block';
          const color = colourKey ? ACTIVE_VOWEL_HIGHLIGHTS[colourKey] : null;
          if (settings.colorNekudot && color) {
            const rgba = hexToRgba(color, settings.highlightOpacity);
            if (settings.highlightMode === 'nikud') {
              span.setAttribute('data-letter', char);
              span.setAttribute('data-nikud', diacritics);
              span.style.setProperty('--otiyot-nikud-color', rgba);
            } else {
              span.style.backgroundColor = rgba;
            }
          }
          span.textContent = char + diacritics;
          fragment.appendChild(span);
          if (settings.letterSpacing > 0) fragment.appendChild(document.createTextNode('\u200B'));
          i = j;
        } else {
          // For spaces between Hebrew words, inject extra visual gap when letter spacing is on
          if (settings.letterSpacing > 0 && (charCode === 0x20 || charCode === 0xA0)) {
            const spaceSpan = document.createElement('span');
            spaceSpan.className = 'otiyot-letter-block';
            // Word gap = base space + scaled extra gap so words stay clearly separated
            spaceSpan.style.display = 'inline-block';
            spaceSpan.style.width = `${0.35 + settings.letterSpacing * 0.55}em`;
            spaceSpan.textContent = '\u00A0';
            fragment.appendChild(spaceSpan);
          } else {
            fragment.appendChild(document.createTextNode(char));
          }
          i++;
        }
      }
      if (textNode.parentNode) textNode.parentNode.replaceChild(fragment, textNode);
    });
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

  function stripOtiyotSpans() {
    document.querySelectorAll('.otiyot-letter-block').forEach(span => {
      const parent = span.parentNode;
      if (parent) parent.replaceChild(document.createTextNode(span.textContent), span);
    });
    document.normalize();
  }

  let _applyTimer = null;
  function scheduleApply() {
    clearTimeout(_applyTimer);
    _applyTimer = setTimeout(applyAll, 80);
  }

  function applyAll() {
    rebuildActiveNikud();
    applyVisualSettings();
    observer.disconnect();
    stripOtiyotSpans();
    processTextNodes(document.body);
    initFocusMode();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  let _observerTimer = null;
  const observer = new MutationObserver((mutations) => {
    const added = [];
    mutations.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType === Node.ELEMENT_NODE && !n.classList?.contains('otiyot-letter-block'))
        added.push(n);
    }));
    if (added.length === 0) return;
    clearTimeout(_observerTimer);
    _observerTimer = setTimeout(() => {
      observer.disconnect();
      added.forEach(el => processTextNodes(el));
      observer.observe(document.body, { childList: true, subtree: true });
    }, 150);
  });

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'OTIYOT_SETTINGS') {
        Object.assign(settings, msg.settings);
        scheduleApply();
      }
      if (msg.type === 'OTIYOT_SITE_TOGGLE') {
        if (msg.disabled) {
          // Tear everything down immediately
          observer.disconnect();
          stripOtiyotSpans();
          teardownFocusMode();
          const styleEl = document.getElementById('otiyot-plus-style');
          if (styleEl) styleEl.remove();
        } else {
          // Re-enable
          applyAll();
        }
      }
    });

    const nikudDefaults = {};
    Object.values(ALL_NIKUD).forEach(({ key }) => { nikudDefaults[key] = true; });

    chrome.storage.sync.get({ ...settings, ...nikudDefaults, disabledSites: [] }, (res) => {
      // If this site is disabled, do nothing
      if (res.disabledSites && res.disabledSites.includes(CURRENT_HOST)) return;
      Object.assign(settings, res);
      applyAll();
    });
  } catch (e) { /* extension context invalidated */ }

})();
