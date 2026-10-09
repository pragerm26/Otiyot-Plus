document.addEventListener('DOMContentLoaded', () => {

  const NIKUD_LIST = [
    { char: '\u05B0', key: 'nikud_shva_na',   label: 'Shva Na',   color: '#cc0000' }, // deep red — voiced
    { char: '\u05B0', key: 'nikud_shva_nach',  label: 'Shva Nach', color: '#ff88aa' }, // pink — silent
    { char: '\u05B4', key: 'nikud_05B4', label: 'Hiriq',  color: '#ff9900' },
    { char: '\u05B5', key: 'nikud_05B5', label: 'Tsere',  color: '#cccc00' },
    { char: '\u05B6', key: 'nikud_05B6', label: 'Segol',  color: '#00cc00' },
    { char: '\u05B7', key: 'nikud_05B7', label: 'Patach', color: '#6aa84f' },
    { char: '\u05B8', key: 'nikud_05B8', label: 'Kamatz', color: '#6fa8dc' },
    { char: '\u05B9', key: 'nikud_05B9', label: 'Holam',  color: '#0000ff' },
    { char: '\u05BB', key: 'nikud_05BB', label: 'Kubutz', color: '#9900ff' },
    { char: '\u05BC', key: 'nikud_05BC', label: 'Dagesh', color: '#ff00ff' },
  ];

  // ---------------------------------------------------------------------------
  // CUSTOM COLOURS  (stored as { nikud_05B4: '#rrggbb', ... } — only overrides)
  // ---------------------------------------------------------------------------
  const DEFAULT_COLORS = {};
  NIKUD_LIST.forEach(({ key, color }) => { DEFAULT_COLORS[key] = color; });
  let customColors = {};

  const colorOf = key => customColors[key] || DEFAULT_COLORS[key];

  function hexToRgba(hex, opacity) {
    const h = hex.replace('#', '');
    return `rgba(${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)}, ${(opacity/100).toFixed(2)})`;
  }

  const colorToggle  = document.getElementById('colorToggle');
  const fontToggle   = document.getElementById('fontToggle');
  const focusToggle  = document.getElementById('focusToggle');
  const spaceRange   = document.getElementById('spaceRange');
  const spaceVal     = document.getElementById('spaceVal');
  const nikudPanel   = document.getElementById('nikudPanel');
  const toggleAllOn  = document.getElementById('toggleAllOn');
  const toggleAllOff = document.getElementById('toggleAllOff');
  const modeBlock    = document.getElementById('modeBlock');
  const modeNikud    = document.getElementById('modeNikud');
  const opacityRange = document.getElementById('opacityRange');
  const opacityVal   = document.getElementById('opacityVal');
  const nikudHeader  = document.getElementById('nikudHeader');
  const nikudChevron = document.getElementById('nikudChevron');

  let highlightMode = 'block';

  function setHighlightMode(mode) {
    highlightMode = mode;
    if (modeBlock) modeBlock.classList.toggle('active', mode === 'block');
    if (modeNikud) modeNikud.classList.toggle('active', mode === 'nikud');
  }

  const nikudCheckboxes = {};
  if (nikudPanel) {
    NIKUD_LIST.forEach(({ char, key, label, color }) => {
      const row = document.createElement('div');
      row.className = 'nikud-row';
      row.innerHTML = `
        <button type="button" class="nikud-swatch" data-key="${key}" title="Change colour" style="background: ${colorOf(key)}"></button>
        <span class="nikud-char">\u05D1${char}</span>
        <span class="nikud-label">${label}</span>
        <label class="switch">
          <input type="checkbox" id="${key}">
          <span class="track"></span>
        </label>`;
      nikudPanel.appendChild(row);
      const input = row.querySelector('input');
      if (input) {
        nikudCheckboxes[key] = input;
        input.addEventListener('change', saveAll);
      }
      const swatch = row.querySelector('.nikud-swatch');
      if (swatch) swatch.addEventListener('click', e => { e.preventDefault(); openPicker(key); });
    });
  }

  // Refresh every place a vowel's colour is shown (row swatch + strip dot)
  function refreshColorUI(key) {
    const c = colorOf(key);
    const sw  = nikudPanel && nikudPanel.querySelector(`.nikud-swatch[data-key="${key}"]`);
    const dot = document.querySelector(`.nikud-dot[data-key="${key}"]`);
    if (sw)  sw.style.background  = c;
    if (dot) dot.style.background = c;
  }

  // ---------------------------------------------------------------------------
  // COLOUR PICKER POPUP
  // ---------------------------------------------------------------------------
  const PRESETS = [
    '#e53935','#ff7043','#ffb300','#fdd835','#c0ca33','#43a047',
    '#00acc1','#29b6f6','#1e88e5','#3949ab','#8e24aa','#d81b60',
    '#ffcdd2','#ffe0b2','#fff59d','#c8e6c9','#b3e5fc','#e1bee7',
  ];

  const overlay = document.createElement('div');
  overlay.className = 'cp-overlay';
  overlay.innerHTML = `
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
  document.body.appendChild(overlay);

  const cpPreview  = overlay.querySelector('.cp-preview');
  const cpTitle    = overlay.querySelector('.cp-title');
  const cpGrid     = overlay.querySelector('.cp-grid');
  const cpHex      = overlay.querySelector('#cpHex');
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
    const c = colorOf(pickerKey);
    const opacity = opacityRange ? parseInt(opacityRange.value, 10) : 100;
    cpPreview.style.background = hexToRgba(c, opacity);
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
    saveAll();
  }

  function openPicker(key) {
    pickerKey = key;
    const item = NIKUD_LIST.find(n => n.key === key);
    cpTitle.textContent = item.label;
    cpPreview.textContent = '\u05D1' + item.char;
    cpHex.value = '';
    overlay.classList.add('open');
    syncPicker();
  }

  function closePicker() {
    overlay.classList.remove('open');
    pickerKey = null;
  }

  cpHex.addEventListener('input', () => {
    let v = cpHex.value.trim().replace(/[^0-9a-fA-F#]/g, '');
    if (v && v[0] !== '#') v = '#' + v;
    cpHex.value = v.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).split('').map(ch => ch + ch).join('');
    if (/^#[0-9a-f]{6}$/i.test(v)) setPickerColor(v);
    else cpHex.classList.toggle('invalid', v.length > 1);
  });
  cpHex.addEventListener('blur', syncPicker);

  overlay.querySelector('#cpReset').addEventListener('click', () => {
    if (!pickerKey) return;
    delete customColors[pickerKey];
    refreshColorUI(pickerKey);
    cpHex.blur();
    syncPicker();
    saveAll();
  });
  overlay.querySelector('#cpResetAll').addEventListener('click', () => {
    customColors = {};
    NIKUD_LIST.forEach(({ key }) => refreshColorUI(key));
    cpHex.blur();
    syncPicker();
    saveAll();
  });
  overlay.querySelector('#cpDone').addEventListener('click', closePicker);
  overlay.querySelector('.cp-close').addEventListener('click', closePicker);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) closePicker(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pickerKey) closePicker(); });

 function saveAll() {
    const toSave = {
      colorNekudot:     colorToggle ? colorToggle.checked : true,
      fontEnabled:      fontToggle ? fontToggle.checked : true,
      focusMode:        focusToggle ? focusToggle.checked : false,
      letterSpacing:    spaceRange ? parseInt(spaceRange.value, 10) : 0,
      highlightMode:    highlightMode,
      highlightOpacity: opacityRange ? parseInt(opacityRange.value, 10) : 100,
      nikudColors:      customColors,
    };
    
    // Crucial: Only save nikud keys if the checkboxes actually exist in the popup
    NIKUD_LIST.forEach(({ key }) => {
      if (nikudCheckboxes[key]) {
        toSave[key] = nikudCheckboxes[key].checked;
      }
    });

    chrome.storage.sync.set(toSave, () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'OTIYOT_SETTINGS', settings: toSave }).catch(() => {});
        }
      });
    });
  }

  const nikudDefaults = {};
  NIKUD_LIST.forEach(({ key }) => { nikudDefaults[key] = true; });

  chrome.storage.sync.get({
    colorNekudot: true, fontEnabled: true, focusMode: false,
    letterSpacing: 0, highlightMode: 'block', highlightOpacity: 100,
    nikudColors: {},
    ...nikudDefaults
  }, (res) => {
    customColors = (res.nikudColors && typeof res.nikudColors === 'object') ? { ...res.nikudColors } : {};
    if (colorToggle) colorToggle.checked = res.colorNekudot;
    if (fontToggle)  fontToggle.checked  = res.fontEnabled;
    if (focusToggle) focusToggle.checked = res.focusMode;
    if (spaceRange) {
      spaceRange.value = res.letterSpacing;
      if (spaceVal) spaceVal.textContent = res.letterSpacing + 'px';
    }
    if (opacityRange) {
      opacityRange.value = res.highlightOpacity;
      if (opacityVal) opacityVal.textContent = res.highlightOpacity + '%';
    }
    NIKUD_LIST.forEach(({ key }) => {
      if (nikudCheckboxes[key]) nikudCheckboxes[key].checked = res[key] !== false;
      refreshColorUI(key);
    });
    setHighlightMode(res.highlightMode || 'block');
  });

  if (modeBlock) modeBlock.addEventListener('click', (e) => { e.preventDefault(); setHighlightMode('block'); saveAll(); });
  if (modeNikud) modeNikud.addEventListener('click', (e) => { e.preventDefault(); setHighlightMode('nikud'); saveAll(); });
  if (colorToggle) colorToggle.addEventListener('change', saveAll);
  if (fontToggle)  fontToggle.addEventListener('change', saveAll);
  if (focusToggle) focusToggle.addEventListener('change', saveAll);
  
  if (opacityRange) opacityRange.addEventListener('input', () => {
    if (opacityVal) opacityVal.textContent = opacityRange.value + '%';
    syncPicker();
    saveAll();
  });

  if (spaceRange) spaceRange.addEventListener('input', () => {
    if (spaceVal) spaceVal.textContent = spaceRange.value + 'px';
    saveAll();
  });

  if (toggleAllOn) toggleAllOn.addEventListener('click', () => {
    Object.values(nikudCheckboxes).forEach(cb => cb.checked = true);
    saveAll();
  });

  if (toggleAllOff) toggleAllOff.addEventListener('click', () => {
    Object.values(nikudCheckboxes).forEach(cb => cb.checked = false);
    saveAll();
  });

  if (nikudHeader) nikudHeader.addEventListener('click', () => {
    const isVisible = nikudPanel && nikudPanel.style.display === 'block';
    if (nikudPanel) nikudPanel.style.display = isVisible ? 'none' : 'block';
    if (nikudChevron) nikudChevron.textContent = isVisible ? '▼' : '▲';
  });

  // ---------------------------------------------------------------------------
  // TEACHER TOOLS BUTTONS
  // ---------------------------------------------------------------------------
  const openPdfBtn = document.getElementById('openPdfBtn');

  if (openPdfBtn) openPdfBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pdf-processor.html') });
  });

  // ---------------------------------------------------------------------------
  // SITE DISABLE BUTTON
  // ---------------------------------------------------------------------------
  const siteToggleBtn = document.getElementById('siteToggleBtn');
  const siteHostEl    = document.getElementById('siteHost');

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url;
    if (!url || !url.startsWith('http')) {
      if (siteHostEl) siteHostEl.textContent = 'Not available here';
      if (siteToggleBtn) siteToggleBtn.disabled = true;
      return;
    }
    const hostname = new URL(url).hostname.toLowerCase();
    if (siteHostEl) siteHostEl.textContent = hostname;

    chrome.storage.sync.get({ disabledSites: [] }, ({ disabledSites }) => {
      updateSiteBtn(disabledSites.includes(hostname));

      if (siteToggleBtn) siteToggleBtn.addEventListener('click', () => {
        chrome.storage.sync.get({ disabledSites: [] }, ({ disabledSites }) => {
          const nowDisabled = disabledSites.includes(hostname);
          const updated = nowDisabled
            ? disabledSites.filter(h => h !== hostname)
            : [...disabledSites, hostname];
          chrome.storage.sync.set({ disabledSites: updated }, () => {
            updateSiteBtn(!nowDisabled);
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                  type: 'OTIYOT_SITE_TOGGLE',
                  disabled: !nowDisabled
                }).catch(() => {});
              }
            });
          });
        });
      });
    });
  });

  function updateSiteBtn(isDisabled) {
    if (!siteToggleBtn) return;
    siteToggleBtn.textContent = isDisabled ? 'Enable here' : 'Disable here';
    siteToggleBtn.classList.toggle('disabled', isDisabled);
  }

});
