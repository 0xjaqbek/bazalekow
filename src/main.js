/**
 * Baza Leków ZRM — Main Application
 * Entry point, view router, and UI logic.
 */
import './style.css';
import { getCameras, startScanner, stopScanner, isScannerRunning } from './scanner.js';
import { parseScan } from './gs1-parser.js';
import * as api from './api.js';
import {
  loadInventory, addDrug, updateDrug, deleteDrug, clearInventory,
  getGroupedInventory, searchInventory, getExpiryStatus, getCrewId, setCrewId
} from './inventory.js';
import { exportInventory, importInventoryFile } from './data-io.js';
import { ZRM_SUBSTANCES, DRUG_FORMS, DRUG_UNITS } from './substances.js';

// ─── State ───
let currentView = 'scanner';
let cameras = [];
let selectedCameraId = null;
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 2000; // prevent duplicate scans

// ─── Toast Notifications ───
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── View Router ───
async function switchView(view) {
  // Stop scanner if leaving scanner view
  if (currentView === 'scanner' && view !== 'scanner') {
    stopScanner().catch(() => {});
  }

  currentView = view;

  // Update nav buttons
  document.querySelectorAll('.bottom-nav__btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Render view
  const main = document.getElementById('main-content');
  switch (view) {
    case 'scanner':
      renderScannerView(main);
      break;
    case 'inventory':
      await renderInventoryView(main);
      break;
    case 'manual':
      renderManualView(main);
      break;
  }
}

// ─── SCANNER VIEW ───
async function renderScannerView(container) {
  container.innerHTML = `
    <div class="scanner-view">
      <div class="scanner-controls">
        <select id="camera-select" class="input">
          <option value="">Ładowanie kamer...</option>
        </select>
        <button class="btn btn--sm btn--outline" id="btn-toggle-scan">Start</button>
      </div>
      <div class="scanner-viewport" id="scanner-viewport">
        <div id="scanner-region"></div>
        <div class="scanner-permission-msg" id="scanner-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <p>Wybierz kamerę i naciśnij <strong>Start</strong> aby rozpocząć skanowanie</p>
          <p style="font-size:var(--font-xs)">Aplikacja wymaga HTTPS i pozwolenia na kamerę</p>
        </div>
      </div>
      <div class="scanner-status">
        <span class="scanner-status__text" id="scanner-status-text">Gotowy</span>
        <div class="scanner-manual-row">
          <input type="text" class="input" id="manual-ean-input" placeholder="Wpisz EAN..." maxlength="14" />
          <button class="btn btn--sm btn--primary" id="btn-manual-ean">Szukaj</button>
        </div>
      </div>
    </div>
  `;

  // Load cameras
  try {
    cameras = await getCameras();
    const select = document.getElementById('camera-select');
    if (cameras.length === 0) {
      select.innerHTML = '<option value="">Brak dostępnych kamer</option>';
    } else {
      select.innerHTML = cameras.map((cam, i) => {
        const label = cam.label || `Kamera ${i + 1}`;
        return `<option value="${cam.id}">${label}</option>`;
      }).join('');

      // Prefer back camera
      const backCam = cameras.find(c =>
        c.label && (c.label.toLowerCase().includes('back') ||
          c.label.toLowerCase().includes('tył') ||
          c.label.toLowerCase().includes('rear') ||
          c.label.toLowerCase().includes('environment'))
      );
      if (backCam) {
        select.value = backCam.id;
      }
      selectedCameraId = select.value;

      select.addEventListener('change', () => {
        selectedCameraId = select.value;
        if (isScannerRunning()) {
          toggleScanner(); // restart with new camera
          setTimeout(() => toggleScanner(), 300);
        }
      });
    }
  } catch (err) {
    console.error('Camera enumeration failed:', err);
    showToast('Nie udało się pobrać listy kamer', 'error');
  }

  // Toggle scan button
  document.getElementById('btn-toggle-scan').addEventListener('click', toggleScanner);

  // Manual EAN search
  document.getElementById('btn-manual-ean').addEventListener('click', () => {
    const ean = document.getElementById('manual-ean-input').value.trim();
    if (ean) {
      handleScanResult(ean);
    }
  });

  document.getElementById('manual-ean-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const ean = e.target.value.trim();
      if (ean) handleScanResult(ean);
    }
  });
}

async function toggleScanner() {
  const btn = document.getElementById('btn-toggle-scan');
  const placeholder = document.getElementById('scanner-placeholder');
  const statusText = document.getElementById('scanner-status-text');

  if (isScannerRunning()) {
    await stopScanner();
    btn.textContent = 'Start';
    if (placeholder) placeholder.style.display = 'flex';
    statusText.textContent = 'Zatrzymany';
  } else {
    if (placeholder) placeholder.style.display = 'none';
    btn.textContent = 'Stop';
    statusText.textContent = 'Skanowanie...';

    try {
      await startScanner(
        'scanner-region',
        selectedCameraId || null,
        onScanSuccess,
        () => {}, // ignore scan failures
        { qrbox: { width: 250, height: 250 } }
      );
    } catch (err) {
      console.error('Scanner start failed:', err);
      showToast('Nie udało się uruchomić kamery: ' + err.message, 'error');
      btn.textContent = 'Start';
      if (placeholder) placeholder.style.display = 'flex';
      statusText.textContent = 'Błąd kamery';
    }
  }
}

function onScanSuccess(decodedText, decodedResult) {
  // Cooldown to prevent rapid duplicate scans
  const now = Date.now();
  if (now - lastScanTime < SCAN_COOLDOWN_MS) return;
  lastScanTime = now;

  // Flash animation
  const viewport = document.getElementById('scanner-viewport');
  if (viewport) {
    const flash = document.createElement('div');
    flash.className = 'scan-flash';
    viewport.appendChild(flash);
    setTimeout(() => flash.remove(), 500);
  }

  const statusText = document.getElementById('scanner-status-text');
  if (statusText) {
    statusText.textContent = `Zeskanowano: ${decodedText.substring(0, 30)}...`;
  }

  handleScanResult(decodedText);
}

async function handleScanResult(rawText) {
  const parsed = parseScan(rawText);
  showScanResultModal(parsed);
}

// ─── SCAN RESULT MODAL ───
function showScanResultModal(parsed) {
  const modal = document.getElementById('scan-result-modal');
  const body = document.getElementById('scan-result-body');
  const title = document.getElementById('scan-result-title');

  title.textContent = parsed.ean ? 'Znaleziono kod' : 'Wynik skanu';

  let html = '<div class="scan-result">';

  // Parsed data section
  html += `
    <div class="scan-parsed">
      <div class="scan-parsed__title">Dane z kodu</div>
      <div class="scan-parsed__grid">
        <div class="scan-parsed__item">
          <span class="scan-parsed__label">EAN</span>
          <span class="scan-parsed__value">${parsed.ean || '—'}</span>
        </div>
        <div class="scan-parsed__item">
          <span class="scan-parsed__label">Data ważności</span>
          <span class="scan-parsed__value">${parsed.expiryFormatted || '—'}</span>
        </div>
        <div class="scan-parsed__item">
          <span class="scan-parsed__label">Seria</span>
          <span class="scan-parsed__value">${parsed.batch || '—'}</span>
        </div>
        <div class="scan-parsed__item">
          <span class="scan-parsed__label">Nr seryjny</span>
          <span class="scan-parsed__value">${parsed.serial || '—'}</span>
        </div>
      </div>
    </div>
  `;

  // API lookup section
  if (parsed.ean) {
    html += `
      <div id="api-lookup-section">
        <div class="loading-row">
          <div class="spinner spinner--sm"></div>
          <span>Szukam w bazie leków...</span>
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="empty-state" style="padding: var(--sp-md);">
        <p class="empty-state__text">Nie rozpoznano kodu EAN. Możesz dodać lek ręcznie.</p>
        <button class="btn btn--primary mt-md" onclick="document.getElementById('scan-result-modal').hidden=true; document.querySelector('[data-view=manual]').click();">
          Dodaj ręcznie
        </button>
      </div>
    `;
  }

  html += '</div>';
  body.innerHTML = html;
  modal.hidden = false;

  // Setup close
  document.getElementById('scan-result-close').onclick = () => {
    modal.hidden = true;
  };
  modal.onclick = (e) => {
    if (e.target === modal) modal.hidden = true;
  };

  // Fire API lookup
  if (parsed.ean) {
    lookupDrugByEan(parsed);
  }
}

async function lookupDrugByEan(parsed) {
  const section = document.getElementById('api-lookup-section');
  if (!section) return;

  if (!api.hasApiKey()) {
    section.innerHTML = `
      <div class="empty-state" style="padding: var(--sp-md);">
        <p class="empty-state__text">Brak klucza API. Ustaw klucz w ustawieniach aby wyszukiwać leki.</p>
        <button class="btn btn--outline mt-md" id="btn-open-settings-from-scan">Otwórz ustawienia</button>
      </div>
    `;
    document.getElementById('btn-open-settings-from-scan').onclick = () => {
      document.getElementById('scan-result-modal').hidden = true;
      openSettings();
    };
    return;
  }

  try {
    const { data: drugs } = await api.searchByEan(parsed.ean);

    if (!drugs || drugs.length === 0) {
      section.innerHTML = `
        <div class="empty-state" style="padding: var(--sp-md);">
          <p class="empty-state__text">Nie znaleziono leku o EAN: ${parsed.ean}</p>
          <button class="btn btn--primary mt-md" id="btn-add-manual-from-scan">Dodaj ręcznie</button>
        </div>
      `;
      document.getElementById('btn-add-manual-from-scan').onclick = () => {
        document.getElementById('scan-result-modal').hidden = true;
        switchView('manual');
        // Pre-fill EAN
        setTimeout(() => {
          const eanInput = document.getElementById('manual-ean');
          if (eanInput) eanInput.value = parsed.ean || '';
          const expiryInput = document.getElementById('manual-expiry');
          if (expiryInput && parsed.expiryFormatted) expiryInput.value = parsed.expiryFormatted;
        }, 100);
      };
      return;
    }

    let html = '<div class="api-results">';
    html += `<p style="font-size:var(--font-sm); color:var(--text-secondary); margin-bottom:var(--sp-sm);">Znaleziono ${drugs.length} wynik(ów):</p>`;

    drugs.forEach((drug, i) => {
      html += `
        <div class="api-result-card" data-index="${i}">
          <div class="api-result-card__name">${escapeHtml(drug.nazwa)}</div>
          <div class="api-result-card__meta">
            ${escapeHtml(drug.substCzynna || '')} · ${escapeHtml(drug.dawka || '')} · ${escapeHtml(drug.postac || '')}
          </div>
          <div class="add-to-inventory-form" id="add-form-${i}" hidden>
            <div class="form-row">
              <div class="form-group" style="margin-bottom:0">
                <label>Ilość</label>
                <input type="number" class="input" id="qty-${i}" value="1" min="1" />
              </div>
              <div class="form-group" style="margin-bottom:0">
                <label>Jednostka</label>
                <select class="input" id="unit-${i}">
                  ${DRUG_UNITS.map(u => `<option value="${u}">${u}</option>`).join('')}
                </select>
              </div>
            </div>
            <button class="btn btn--success btn--block" id="confirm-add-${i}">✓ Dodaj do magazynu</button>
          </div>
        </div>
      `;
    });

    html += '</div>';
    section.innerHTML = html;

    // Click handlers for result cards
    drugs.forEach((drug, i) => {
      const card = section.querySelector(`[data-index="${i}"]`);
      card.addEventListener('click', () => {
        // Toggle form visibility
        const form = document.getElementById(`add-form-${i}`);
        // Close all other forms
        section.querySelectorAll('.add-to-inventory-form').forEach(f => {
          if (f !== form) f.hidden = true;
        });
        section.querySelectorAll('.api-result-card').forEach(c => {
          if (c !== card) c.classList.remove('selected');
        });
        form.hidden = !form.hidden;
        card.classList.toggle('selected');
      });

      // Confirm add
      const confirmBtn = document.getElementById(`confirm-add-${i}`);
      confirmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const qty = parseInt(document.getElementById(`qty-${i}`).value, 10) || 1;
        const unit = document.getElementById(`unit-${i}`).value;

        addDrug({
          substance: drug.substCzynna || '',
          productName: drug.nazwa || '',
          concentration: drug.dawka || '',
          form: drug.postac || '',
          ean: drug.ean || parsed.ean || '',
          expiryDate: parsed.expiryFormatted || '',
          batchNumber: parsed.batch || '',
          quantity: qty,
          unit: unit,
          source: 'api',
          apiDrugId: drug.id,
        });

        showToast(`Dodano: ${drug.nazwa}`, 'success');
        document.getElementById('scan-result-modal').hidden = true;
      });
    });
  } catch (err) {
    section.innerHTML = `
      <div class="empty-state" style="padding: var(--sp-md);">
        <p class="empty-state__text" style="color: var(--color-accent);">Błąd API: ${escapeHtml(err.message)}</p>
        <button class="btn btn--outline mt-md" id="btn-retry-lookup">Ponów</button>
      </div>
    `;
    document.getElementById('btn-retry-lookup').onclick = () => lookupDrugByEan(parsed);
  }
}

// ─── INVENTORY VIEW ───
async function renderInventoryView(container) {
  container.innerHTML = '<div class="loading-row mt-md"><div class="spinner spinner--sm"></div><span>Ładowanie bazy danych...</span></div>';
  
  await loadInventory();
  
  const inventory = searchInventory(''); // Get from cache
  const grouped = getGroupedInventory();
  const substanceCount = Object.keys(grouped).length;

  let html = `
    <div class="inventory-view">
      <div class="inventory-header">
        <div class="inventory-search">
          <svg class="inventory-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="input" id="inventory-search-input" placeholder="Szukaj leku..." />
        </div>
        <div class="inventory-stats">
          <span class="inventory-stats__item">💊 ${inventory.length} lek(ów)</span>
          <span class="inventory-stats__item">📦 ${substanceCount} substancji</span>
        </div>
      </div>
      <div id="inventory-list">
  `;

  if (inventory.length === 0) {
    html += `
      <div class="empty-state">
        <div class="empty-state__icon">📋</div>
        <p class="empty-state__text">Magazyn jest pusty. Zeskanuj kod DataMatrix lub dodaj lek ręcznie.</p>
      </div>
    `;
  } else {
    html += renderGroupedDrugs(grouped);
  }

  html += '</div></div>';
  container.innerHTML = html;

  // Search
  const searchInput = document.getElementById('inventory-search-input');
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const query = searchInput.value.trim();
      const list = document.getElementById('inventory-list');
      if (query.length >= 2) {
        const results = searchInventory(query);
        const tempGrouped = {};
        results.forEach(d => {
          const k = d.substance || 'Nieprzypisane';
          if (!tempGrouped[k]) tempGrouped[k] = [];
          tempGrouped[k].push(d);
        });
        list.innerHTML = results.length > 0
          ? renderGroupedDrugs(tempGrouped)
          : '<div class="empty-state"><p class="empty-state__text">Brak wyników</p></div>';
      } else {
        list.innerHTML = renderGroupedDrugs(getGroupedInventory());
      }
      attachCardListeners();
    }, 300);
  });

  attachCardListeners();
}

function renderGroupedDrugs(grouped) {
  let html = '';
  for (const [substance, drugs] of Object.entries(grouped)) {
    html += `
      <div class="substance-group">
        <div class="substance-group__header">
          <span class="substance-group__name">${escapeHtml(substance)}</span>
          <span class="substance-group__count">${drugs.length}</span>
        </div>
    `;
    for (const drug of drugs) {
      const expiryStatus = getExpiryStatus(drug.expiryDate);
      const cardClass = expiryStatus === 'expired' ? 'drug-card--expired'
        : expiryStatus === 'expiring' ? 'drug-card--expiring' : '';
      const expiryClass = expiryStatus === 'expired' ? 'drug-card__detail-value--expiry-expired'
        : expiryStatus === 'expiring' ? 'drug-card__detail-value--expiry-expiring' : '';
      const sourceClass = drug.source === 'api' ? 'drug-card__source--api' : 'drug-card__source--manual';
      const sourceLabel = drug.source === 'api' ? 'API' : 'Ręcznie';

      html += `
        <div class="drug-card ${cardClass}" data-drug-id="${drug.id}">
          <div class="drug-card__top">
            <span class="drug-card__name">${escapeHtml(drug.productName || drug.substance)}</span>
            <span class="drug-card__source ${sourceClass}">${sourceLabel}</span>
          </div>
          <div class="drug-card__details">
            <div class="drug-card__detail">
              <span class="drug-card__detail-label">Dawka</span>
              <span class="drug-card__detail-value">${escapeHtml(drug.concentration || '—')}</span>
            </div>
            <div class="drug-card__detail">
              <span class="drug-card__detail-label">Ilość</span>
              <span class="drug-card__detail-value">${drug.quantity || '—'} ${escapeHtml(drug.unit || '')}</span>
            </div>
            <div class="drug-card__detail">
              <span class="drug-card__detail-label">Ważność</span>
              <span class="drug-card__detail-value ${expiryClass}">${drug.expiryDate || '—'}${expiryStatus === 'expired' ? ' ⚠️' : expiryStatus === 'expiring' ? ' ⏰' : ''}</span>
            </div>
            <div class="drug-card__detail">
              <span class="drug-card__detail-label">Seria</span>
              <span class="drug-card__detail-value">${escapeHtml(drug.batchNumber || '—')}</span>
            </div>
          </div>
          <div class="drug-card__actions">
            <button class="btn btn--outline btn--sm btn-edit-drug" data-id="${drug.id}">✏️ Edytuj</button>
            <button class="btn btn--danger btn--sm btn-delete-drug" data-id="${drug.id}">🗑 Usuń</button>
          </div>
        </div>
      `;
    }
    html += '</div>';
  }
  return html;
}

function attachCardListeners() {
  // Delete buttons
  document.querySelectorAll('.btn-delete-drug').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('Czy na pewno usunąć ten lek z bazy?')) {
        btn.innerHTML = '<div class="spinner spinner--sm"></div>';
        btn.disabled = true;
        try {
          await deleteDrug(id);
          renderInventoryView(document.getElementById('main-content'));
          showToast('Lek usunięty', 'info');
        } catch(err) {
          showToast('Błąd: ' + err.message, 'error');
          btn.innerHTML = '🗑 Usuń';
          btn.disabled = false;
        }
      }
    });
  });

  // Edit buttons
  document.querySelectorAll('.btn-edit-drug').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      showEditModal(id);
    });
  });
}

// ─── EDIT MODAL (reuses scan-result-modal) ───
function showEditModal(drugId) {
  const inventory = searchInventory(''); // get cached
  const drug = inventory.find(d => d.id === drugId);
  if (!drug) return;

  const modal = document.getElementById('scan-result-modal');
  const body = document.getElementById('scan-result-body');
  const title = document.getElementById('scan-result-title');

  title.textContent = 'Edytuj lek';

  body.innerHTML = `
    <div class="scan-result">
      <div class="form-group">
        <label for="edit-substance">Substancja</label>
        <input type="text" class="input" id="edit-substance" value="${escapeHtml(drug.substance)}" list="edit-substances-list" />
        <datalist id="edit-substances-list">
          ${ZRM_SUBSTANCES.map(s => `<option value="${escapeHtml(s)}">`).join('')}
        </datalist>
      </div>
      <div class="form-group">
        <label for="edit-name">Nazwa produktu</label>
        <input type="text" class="input" id="edit-name" value="${escapeHtml(drug.productName)}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-concentration">Dawka</label>
          <input type="text" class="input" id="edit-concentration" value="${escapeHtml(drug.concentration)}" />
        </div>
        <div class="form-group">
          <label for="edit-form">Postać</label>
          <select class="input" id="edit-form">
            <option value="">— wybierz —</option>
            ${DRUG_FORMS.map(f => `<option value="${f}" ${drug.form === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label for="edit-ean">EAN</label>
        <input type="text" class="input" id="edit-ean" value="${escapeHtml(drug.ean)}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-expiry">Data ważności</label>
          <input type="date" class="input" id="edit-expiry" value="${drug.expiryDate || ''}" />
        </div>
        <div class="form-group">
          <label for="edit-batch">Seria</label>
          <input type="text" class="input" id="edit-batch" value="${escapeHtml(drug.batchNumber)}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-qty">Ilość</label>
          <input type="number" class="input" id="edit-qty" value="${drug.quantity}" min="1" />
        </div>
        <div class="form-group">
          <label for="edit-unit">Jednostka</label>
          <select class="input" id="edit-unit">
            ${DRUG_UNITS.map(u => `<option value="${u}" ${drug.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn btn--success btn--block" id="btn-save-edit">💾 Zapisz zmiany</button>
    </div>
  `;

  modal.hidden = false;

  document.getElementById('scan-result-close').onclick = () => modal.hidden = true;
  modal.onclick = (e) => { if (e.target === modal) modal.hidden = true; };

  document.getElementById('btn-save-edit').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Trwa zapisywanie...';
    
    try {
      await updateDrug(drugId, {
        substance: document.getElementById('edit-substance').value.trim(),
        productName: document.getElementById('edit-name').value.trim(),
        concentration: document.getElementById('edit-concentration').value.trim(),
        form: document.getElementById('edit-form').value,
        ean: document.getElementById('edit-ean').value.trim(),
        expiryDate: document.getElementById('edit-expiry').value,
        batchNumber: document.getElementById('edit-batch').value.trim(),
        quantity: parseInt(document.getElementById('edit-qty').value, 10) || 1,
        unit: document.getElementById('edit-unit').value,
      });
      modal.hidden = true;
      showToast('Lek zaktualizowany', 'success');
      if (currentView === 'inventory') {
        renderInventoryView(document.getElementById('main-content'));
      }
    } catch (err) {
      showToast('Nie udało się zaktualizować leku', 'error');
      btn.disabled = false;
      btn.textContent = '💾 Zapisz zmiany';
    }
  });
}

// ─── MANUAL ENTRY VIEW ───
function renderManualView(container) {
  container.innerHTML = `
    <div class="manual-view">
      <h2>Dodaj lek ręcznie</h2>
      <div class="form-group">
        <label for="manual-substance">Substancja czynna *</label>
        <input type="text" class="input" id="manual-substance" list="substances-list" placeholder="Wpisz lub wybierz..." />
        <datalist id="substances-list">
          ${ZRM_SUBSTANCES.map(s => `<option value="${escapeHtml(s)}">`).join('')}
        </datalist>
      </div>
      <div class="form-group">
        <label for="manual-product-name">Nazwa produktu</label>
        <input type="text" class="input" id="manual-product-name" placeholder="np. Adrenalinum WZF" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="manual-concentration">Dawka / stężenie</label>
          <input type="text" class="input" id="manual-concentration" placeholder="np. 1 mg/ml" />
        </div>
        <div class="form-group">
          <label for="manual-form">Postać</label>
          <select class="input" id="manual-form">
            <option value="">— wybierz —</option>
            ${DRUG_FORMS.map(f => `<option value="${f}">${f}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label for="manual-ean">EAN (opcjonalnie)</label>
        <div class="input-row">
          <input type="text" class="input" id="manual-ean" placeholder="Kod EAN / GTIN" maxlength="14" />
          <button class="btn btn--sm btn--outline" id="btn-search-api" title="Szukaj w API">🔍</button>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="manual-expiry">Data ważności</label>
          <input type="date" class="input" id="manual-expiry" />
        </div>
        <div class="form-group">
          <label for="manual-batch">Seria / LOT</label>
          <input type="text" class="input" id="manual-batch" placeholder="Nr serii" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="manual-qty">Ilość</label>
          <input type="number" class="input" id="manual-qty" value="1" min="1" />
        </div>
        <div class="form-group">
          <label for="manual-unit">Jednostka</label>
          <select class="input" id="manual-unit">
            ${DRUG_UNITS.map(u => `<option value="${u}">${u}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="api-search-results" hidden></div>

      <button class="btn btn--primary btn--block mt-md" id="btn-add-manual">✓ Dodaj do magazynu</button>

      <hr class="divider" />
      <p style="font-size:var(--font-sm); color:var(--text-secondary);">
        Możesz też wyszukać lek w bazie API po substancji lub nazwie:
      </p>
      <div class="form-group mt-sm">
        <div class="input-row">
          <input type="text" class="input" id="api-search-query" placeholder="Substancja lub nazwa leku..." />
          <button class="btn btn--sm btn--primary" id="btn-api-search">Szukaj</button>
        </div>
      </div>
      <div id="api-search-results-2"></div>
    </div>
  `;

  // Add manual drug
  document.getElementById('btn-add-manual').addEventListener('click', async (e) => {
    const substance = document.getElementById('manual-substance').value.trim();
    if (!substance) {
      showToast('Podaj substancję czynną', 'warning');
      return;
    }

    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Trwa dodawanie...';

    try {
      await addDrug({
        substance,
        productName: document.getElementById('manual-product-name').value.trim(),
        concentration: document.getElementById('manual-concentration').value.trim(),
        form: document.getElementById('manual-form').value,
        ean: document.getElementById('manual-ean').value.trim(),
        expiryDate: document.getElementById('manual-expiry').value,
        batchNumber: document.getElementById('manual-batch').value.trim(),
        quantity: parseInt(document.getElementById('manual-qty').value, 10) || 1,
        unit: document.getElementById('manual-unit').value,
        source: 'manual',
      });

      showToast('Lek dodany do bazy', 'success');

      // Reset form
      document.getElementById('manual-substance').value = '';
      document.getElementById('manual-product-name').value = '';
      document.getElementById('manual-concentration').value = '';
      document.getElementById('manual-form').value = '';
      document.getElementById('manual-ean').value = '';
      document.getElementById('manual-expiry').value = '';
      document.getElementById('manual-batch').value = '';
      document.getElementById('manual-qty').value = '1';
    } catch {
      showToast('Wystąpił błąd podczas dodawania do bazy.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '✓ Dodaj do magazynu';
    }
  });

  // Search API by EAN
  document.getElementById('btn-search-api').addEventListener('click', async () => {
    const ean = document.getElementById('manual-ean').value.trim();
    if (!ean || ean.length < 8) {
      showToast('Wprowadź prawidłowy EAN (8-14 cyfr)', 'warning');
      return;
    }
    await searchApiAndFill(ean, 'ean');
  });

  // General API search
  document.getElementById('btn-api-search').addEventListener('click', async () => {
    const query = document.getElementById('api-search-query').value.trim();
    if (!query || query.length < 3) {
      showToast('Wpisz min. 3 znaki', 'warning');
      return;
    }
    await searchApiGeneral(query);
  });
}

async function searchApiAndFill(ean) {
  if (!api.hasApiKey()) {
    showToast('Brak klucza API — ustaw w ustawieniach', 'error');
    return;
  }
  try {
    const { data: drugs } = await api.searchByEan(ean);
    if (drugs && drugs.length > 0) {
      const drug = drugs[0];
      document.getElementById('manual-substance').value = drug.substCzynna || '';
      document.getElementById('manual-product-name').value = drug.nazwa || '';
      document.getElementById('manual-concentration').value = drug.dawka || '';
      showToast(`Znaleziono: ${drug.nazwa}`, 'success');
    } else {
      showToast('Nie znaleziono leku o tym EAN', 'info');
    }
  } catch (err) {
    showToast('Błąd API: ' + err.message, 'error');
  }
}

async function searchApiGeneral(query) {
  if (!api.hasApiKey()) {
    showToast('Brak klucza API — ustaw w ustawieniach', 'error');
    return;
  }

  const container = document.getElementById('api-search-results-2');
  container.innerHTML = '<div class="loading-row"><div class="spinner spinner--sm"></div><span>Szukam...</span></div>';

  try {
    // Try substance first, then name
    let drugs = [];
    try {
      const { data } = await api.searchBySubstance(query);
      drugs = data || [];
    } catch {
      // ignore
    }

    if (drugs.length === 0) {
      try {
        const { data } = await api.searchByName(query);
        drugs = data || [];
      } catch {
        // ignore
      }
    }

    if (drugs.length === 0) {
      container.innerHTML = '<p style="font-size:var(--font-sm); color:var(--text-tertiary); padding:var(--sp-sm) 0;">Brak wyników</p>';
      return;
    }

    const resultsSubset = drugs.slice(0, 15);
    
    let html = `
      <div style="margin-top:var(--sp-sm); margin-bottom:var(--sp-sm); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:var(--font-sm); color:var(--text-secondary);">Znaleziono: ${drugs.length}</span>
        <button class="btn btn--sm btn--success" id="btn-add-all-api-results">
          ➕ Dodaj wszystkie (${resultsSubset.length})
        </button>
      </div>
      <div class="api-results">
    `;

    resultsSubset.forEach((drug, i) => {
      html += `
        <div class="api-result-card" data-fill-index="${i}">
          <div class="api-result-card__name">${escapeHtml(drug.nazwa)}</div>
          <div class="api-result-card__meta">
            ${escapeHtml(drug.substCzynna || '')} · ${escapeHtml(drug.dawka || '')} · ${escapeHtml(drug.postac || '')}
            ${drug.ean ? `· EAN: ${drug.ean}` : ''}
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;

    // "Add all" handler
    document.getElementById('btn-add-all-api-results').addEventListener('click', async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = 'Trwa dodawanie...';
      try {
        await Promise.all(resultsSubset.map(drug => addDrug({
            substance: drug.substCzynna || '',
            productName: drug.nazwa || '',
            concentration: drug.dawka || '',
            form: drug.postac || '',
            ean: drug.ean || '',
            quantity: 1,
            unit: 'szt.',
            source: 'api',
            apiDrugId: drug.id
        })));
        showToast(`Pomyślnie dodano ${resultsSubset.length} produktów do bazy!`, 'success');
        container.innerHTML = ''; // clear results 
        document.querySelector('.manual-view').scrollTo(0, 0);
      } catch (err) {
        showToast('Błąd podczas dodawania masowego', 'error');
        btn.disabled = false;
        btn.textContent = `➕ Dodaj wszystkie (${resultsSubset.length})`;
      }
    });

    // Click to fill form
    container.querySelectorAll('.api-result-card').forEach((card, i) => {
      card.addEventListener('click', () => {
        const drug = drugs[i];
        document.getElementById('manual-substance').value = drug.substCzynna || '';
        document.getElementById('manual-product-name').value = drug.nazwa || '';
        document.getElementById('manual-concentration').value = drug.dawka || '';
        document.getElementById('manual-ean').value = drug.ean || '';
        showToast(`Wypełniono danymi: ${drug.nazwa}`, 'success');
        container.innerHTML = '';
        // scroll to top
        document.querySelector('.manual-view').scrollTo(0, 0);
      });
    });
  } catch (err) {
    container.innerHTML = `<p style="color:var(--color-accent); font-size:var(--font-sm);">Błąd: ${escapeHtml(err.message)}</p>`;
  }
}

// ─── SETTINGS ───
function openSettings() {
  const modal = document.getElementById('settings-modal');
  modal.hidden = false;

  // Fill current values
  document.getElementById('api-key-input').value = api.getApiKey();
  document.getElementById('crew-id-input').value = getCrewId();

  // Toggle key visibility
  document.getElementById('toggle-key-visibility').onclick = () => {
    const inp = document.getElementById('api-key-input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  };

  // Save settings
  document.getElementById('btn-save-settings').onclick = () => {
    const key = document.getElementById('api-key-input').value.trim();
    const crewId = document.getElementById('crew-id-input').value.trim();
    api.setApiKey(key);
    if (crewId) setCrewId(crewId);
    showToast('Ustawienia zapisane', 'success');
    modal.hidden = true;
  };

  // Close
  document.getElementById('settings-close').onclick = () => modal.hidden = true;
  modal.onclick = (e) => { if (e.target === modal) modal.hidden = true; };

  // Check API
  document.getElementById('btn-check-api').onclick = async () => {
    const dot = document.querySelector('.status-dot');
    const text = document.getElementById('api-status-text');
    const usageInfo = document.getElementById('api-usage-info');

    text.textContent = 'Sprawdzam...';
    dot.className = 'status-dot status-dot--unknown';

    const healthy = await api.healthCheck();
    if (!healthy) {
      dot.className = 'status-dot status-dot--error';
      text.textContent = 'API niedostępne';
      return;
    }

    if (api.hasApiKey()) {
      try {
        const { data } = await api.checkUsage();
        dot.className = 'status-dot status-dot--ok';
        text.textContent = 'Połączono ✓';
        usageInfo.hidden = false;
        usageInfo.innerHTML = `
          <p><strong>Plan:</strong> ${data.planCode}</p>
          <p><strong>Zapytania:</strong> ${data.requestsUsed} / ${data.requestLimit}</p>
          <p><strong>Rekordy:</strong> ${data.recordsUsed} / ${data.recordLimit}</p>
          <p><strong>Reset:</strong> ${data.resetAt}</p>
          <p><strong>Ważny do:</strong> ${data.validTo}</p>
        `;
      } catch (err) {
        dot.className = 'status-dot status-dot--error';
        text.textContent = err.message;
      }
    } else {
      dot.className = 'status-dot status-dot--ok';
      text.textContent = 'API dostępne (brak klucza)';
    }
  };

  // Export
  document.getElementById('btn-export').onclick = () => {
    const result = exportInventory();
    showToast(`Eksportowano ${result.drugsCount} leków`, 'success');
  };

  // Import
  document.getElementById('import-file-input').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const result = await importInventoryFile(file, false);
      showToast(`Zaimportowano ${result.count} leków`, 'success');
    } catch (err) {
      showToast('Błąd importu: ' + err.message, 'error');
    }
    e.target.value = '';
  };

  // Clear all
  document.getElementById('btn-clear-all').onclick = async (e) => {
    if (confirm('Czy na pewno usunąć WSZYSTKIE leki z bazy dla tej grupy? Ta operacja jest nieodwracalna.')) {
      const btn = e.target;
      btn.disabled = true;
      try {
        await clearInventory();
        showToast('Baza wyczyszczona', 'info');
        if (currentView === 'inventory') {
          renderInventoryView(document.getElementById('main-content'));
        }
      } catch {
        showToast('Wystąpił błąd podczas czyszczenia', 'error');
      } finally {
        btn.disabled = false;
      }
    }
  };
}

// ─── UTILS ───
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── INITIALIZATION ───
function init() {
  // Nav buttons
  document.querySelectorAll('.bottom-nav__btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Settings button
  document.getElementById('btn-settings').addEventListener('click', openSettings);

  // Check if API key is set; if not, show prompt
  if (!api.hasApiKey()) {
    setTimeout(() => {
      showToast('Ustaw klucz API w ustawieniach ⚙️', 'warning', 5000);
    }, 1000);
  }

  // Start with scanner view
  switchView('scanner');
}

// Boot
document.addEventListener('DOMContentLoaded', init);
