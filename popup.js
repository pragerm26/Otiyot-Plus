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
        <span class="nikud-swatch" style="background: ${color}"></span>
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
    });
  }

 function saveAll() {
    const toSave = {
      colorNekudot:     colorToggle ? colorToggle.checked : true,
      fontEnabled:      fontToggle ? fontToggle.checked : true,
      focusMode:        focusToggle ? focusToggle.checked : false,
      letterSpacing:    spaceRange ? parseInt(spaceRange.value, 10) : 0,
      highlightMode:    highlightMode,
      highlightOpacity: opacityRange ? parseInt(opacityRange.value, 10) : 100,
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
    ...nikudDefaults
  }, (res) => {
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
  const openPdfBtn   = document.getElementById('openPdfBtn');
  const openGdocsBtn = document.getElementById('openGdocsBtn');

  if (openPdfBtn) openPdfBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pdf-processor.html') });
  });

  if (openGdocsBtn) openGdocsBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url || '';
      if (url.includes('docs.google.com/document')) {
        // Already on a Google Doc — just close the popup, the floating button is there
        window.close();
      } else {
        // Open Google Docs
        chrome.tabs.create({ url: 'https://docs.google.com' });
      }
    });
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
