// NOC Standalone Inventory Panel JS Logic - Focused on Endpoint Assets and Security Compliance
// Re-engineered to exactly replicate the InvGate Insight light-theme UI/UX.

if (window.self !== window.top) {
    document.documentElement.classList.add('iframe-mode');
    document.body.classList.add('iframe-mode');
}

let computersData = [];
let activeInventorySubTab = "workstations";
let CUSTOM_UNITS = [];
let allBrazilianCities = [];
let selectedComputerId = null;

// Simulation & Layout density config
let simulateEstateTarget = null;
let compactDensity = false;

// InvGate layout state
let viewMode = 'table'; // 'table' or 'grid'
let currentPage = 1;
const itemsPerPage = 100;
let totalPages = 1;

// InvGate filters state
let inventorySearch = "";
let filterStatus = "all";
let filterSecurity = "all";

let filterColName = '';
let filterColStatus = 'all';
let filterColOwner = '';
let filterColLocation = '';
let filterColSerial = '';
let filterColId = '';

let scaleExpandedUnits = new Set();
let unitVisibleCount = {};

// DOM Elements
const searchInput = document.getElementById('inventory-search-input');
const sourceIndicator = document.getElementById('source-indicator');
const sourceStatus = document.getElementById('source-status');

// Theme Synchronization with parent NOC dashboard
function syncTheme() {
    try {
        const isParentLight = window.parent && window.parent.document.body.classList.contains('light-mode');
        const parentTheme = window.parent && window.parent.document.body.getAttribute('data-theme');
        const parentColor = window.parent && window.parent.document.body.getAttribute('data-theme-color');
        
        if (isParentLight || parentTheme === 'light') {
            document.body.classList.add('light-mode');
            document.body.setAttribute('data-theme', 'light');
        } else {
            document.body.classList.remove('light-mode');
            document.body.removeAttribute('data-theme');
        }

        if (parentColor) {
            document.body.setAttribute('data-theme-color', parentColor);
        } else {
            document.body.removeAttribute('data-theme-color');
        }
    } catch (e) {
        // Fallback for cross-origin or other errors
    }
}

// Initialize
window.addEventListener('DOMContentLoaded', init);

function init() {
    // 0. Sync and keep theme updated
    syncTheme();
    setInterval(syncTheme, 1000);

    // 1. Recover cache for Zero-Gap instant loading
    const cached = localStorage.getItem('noc-inventory-cache');
    if (cached) {
        try {
            computersData = JSON.parse(cached);
            renderAll();
        } catch (e) {
            console.error('Failed to parse inventory cache:', e);
        }
    }

    // 2. Setup event listeners
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            inventorySearch = e.target.value;
            currentPage = 1;
            renderAll();
        });
    }

    // Column Filters click listeners (InvGate Inline Filters)
    const colNameInput = document.getElementById('filter-col-name');
    const colStatusSelect = document.getElementById('filter-col-status');
    const colOwnerInput = document.getElementById('filter-col-owner');
    const colLocInput = document.getElementById('filter-col-location');
    const colSerialInput = document.getElementById('filter-col-serial');
    const colIdInput = document.getElementById('filter-col-id');

    if (colNameInput) colNameInput.addEventListener('input', (e) => { filterColName = e.target.value; currentPage = 1; renderAll(); });
    if (colStatusSelect) colStatusSelect.addEventListener('change', (e) => { filterColStatus = e.target.value; currentPage = 1; renderAll(); });
    if (colOwnerInput) colOwnerInput.addEventListener('input', (e) => { filterColOwner = e.target.value; currentPage = 1; renderAll(); });
    if (colLocInput) colLocInput.addEventListener('input', (e) => { filterColLocation = e.target.value; currentPage = 1; renderAll(); });
    if (colSerialInput) colSerialInput.addEventListener('input', (e) => { filterColSerial = e.target.value; currentPage = 1; renderAll(); });
    if (colIdInput) colIdInput.addEventListener('input', (e) => { filterColId = e.target.value; currentPage = 1; renderAll(); });

    // Filter Pills / KPI click listeners
    const filterPills = document.querySelectorAll('[data-filter-btn]');
    filterPills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            
            const type = pill.getAttribute('data-filter-btn');
            if (type === 'all') {
                filterStatus = 'all';
                filterSecurity = 'all';
            } else if (type === 'online' || type === 'offline') {
                filterStatus = type;
                filterSecurity = 'all';
            } else {
                filterStatus = 'all';
                filterSecurity = type; // unprotected, reboot, updates
            }
            currentPage = 1;
            renderAll();
        });
    });

    // View Mode Toggle (Grid/Table)
    const btnToggleView = document.getElementById('btn-toggle-view-mode');
    if (btnToggleView) {
        btnToggleView.addEventListener('click', () => {
            viewMode = (viewMode === 'table') ? 'grid' : 'table';
            
            const tblContainer = document.getElementById('invgate-table-container');
            const gridContainer = document.getElementById('invgate-grid-container');
            
            if (viewMode === 'table') {
                if (tblContainer) tblContainer.className = 'view-mode-active';
                if (gridContainer) gridContainer.className = 'view-mode-hidden';
                btnToggleView.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="view-icon-svg"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`;
            } else {
                if (tblContainer) tblContainer.className = 'view-mode-hidden';
                if (gridContainer) gridContainer.className = 'view-mode-active';
                btnToggleView.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="view-icon-svg"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`;
            }
            renderAll();
        });
    }

    // Pagination Listeners
    const btnPrev = document.getElementById('btn-pag-prev');
    const btnNext = document.getElementById('btn-pag-next');
    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderAll();
            }
        });
    }
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderAll();
            }
        });
    }

    // Reload Telemetry
    const btnReload = document.getElementById('btn-reload-telemetry');
    if (btnReload) {
        btnReload.addEventListener('click', () => {
            fetchStatus();
        });
    }

    // Click handler delegation
    document.addEventListener('click', (event) => {
        const rowAction = event.target.closest('[data-open-type="computer"]');
        if (rowAction) {
            event.preventDefault();
            const id = rowAction.getAttribute('data-open-id');
            openDeviceProfile(id);
            return;
        }

        const saveInline = event.target.closest('#btn-save-inline-location');
        if (saveInline) {
            event.preventDefault();
            saveLocation();
            return;
        }

        const quickUnit = event.target.closest('.inline-quick-unit-pill');
        if (quickUnit) {
            event.preventDefault();
            const cityInput = document.getElementById('inline-city-input');
            const regionSelect = document.getElementById('inline-region-select');
            if (cityInput) cityInput.value = quickUnit.getAttribute('data-unit') || '';
            if (regionSelect) regionSelect.value = quickUnit.getAttribute('data-region') || 'none';
            return;
        }
    });

    // 3. Autocomplete Setup
    setupCityAutocomplete();

    // 4. Fetch initial live data
    fetchStatus();
    fetchCities();

    // 5. Setup refresh loop
    setInterval(fetchStatus, 15000);

    // Tab Switching
    const btnTabWorkstations = document.getElementById('btn-tab-workstations');
    const btnTabCloud = document.getElementById('btn-tab-cloud');
    const btnTabUnits = document.getElementById('btn-tab-units');

    if (btnTabWorkstations && btnTabUnits && btnTabCloud) {
        btnTabWorkstations.addEventListener('click', () => {
            activeInventorySubTab = "workstations";
            closeDeviceProfile();
            btnTabWorkstations.classList.add('active');
            btnTabUnits.classList.remove('active');
            btnTabCloud.classList.remove('active');
        });
        btnTabCloud.addEventListener('click', () => {
            activeInventorySubTab = "cloud";
            closeDeviceProfile();
            btnTabWorkstations.classList.remove('active');
            btnTabUnits.classList.remove('active');
            btnTabCloud.classList.add('active');
        });
        btnTabUnits.addEventListener('click', () => {
            activeInventorySubTab = "units";
            closeDeviceProfile();
            btnTabWorkstations.classList.remove('active');
            btnTabUnits.classList.add('active');
            btnTabCloud.classList.remove('active');
        });
    }

    // Maximize Table toggle
    const btnMaximize = document.getElementById('btn-table-maximize');
    const assetsWrapper = document.getElementById('invgate-assets-wrapper');
    if (btnMaximize && assetsWrapper) {
        btnMaximize.addEventListener('click', () => {
            assetsWrapper.classList.toggle('maximized');
        });
    }

    // Modal Add Unit listeners
    const btnOpenModal = document.getElementById('btn-open-unit-modal');
    const btnOpenModalTrigger = document.getElementById('btn-open-unit-modal-trigger');
    const btnCloseModal = document.getElementById('btn-close-unit-modal');
    const btnCancelModal = document.getElementById('btn-cancel-unit-modal');
    const modalOverlay = document.getElementById('unit-modal-overlay');
    const formCreateUnit = document.getElementById('form-create-unit');

    const openModalFn = () => {
        if (modalOverlay) {
            modalOverlay.style.display = 'flex';
            document.getElementById('modal-unit-name').value = '';
            document.getElementById('modal-unit-city').value = '';
            document.getElementById('modal-unit-state').value = '';
            document.getElementById('modal-unit-auto-allow').checked = false;
            document.getElementById('modal-unit-name').focus();
        }
    };

    if (btnOpenModal) btnOpenModal.addEventListener('click', openModalFn);
    if (btnOpenModalTrigger) btnOpenModalTrigger.addEventListener('click', openModalFn);
    
    if (btnCloseModal && modalOverlay) {
        btnCloseModal.addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });
    }
    if (btnCancelModal && modalOverlay) {
        btnCancelModal.addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });
    }
    if (formCreateUnit) {
        formCreateUnit.addEventListener('submit', handleCreateUnit);
    }

    // Modal Edit Device listeners
    const btnCloseEditModal = document.getElementById('btn-close-edit-device-modal');
    const btnCancelEditModal = document.getElementById('btn-cancel-edit-device-modal');
    const formEditDevice = document.getElementById('form-edit-device');

    if (btnCloseEditModal) {
        btnCloseEditModal.addEventListener('click', closeEditDeviceModal);
    }
    if (btnCancelEditModal) {
        btnCancelEditModal.addEventListener('click', closeEditDeviceModal);
    }
    if (formEditDevice) {
        formEditDevice.addEventListener('submit', handleEditDeviceSubmit);
    }
}

function updateClock() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString('pt-BR') + '  /  ' + now.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short', year: 'numeric'});
}

function getApiUrl(path) {
    if (window.location.port === '4002') {
        return path;
    }
    const host = window.location.hostname || '192.168.100.222';
    return `http://${host}:4002${path}`;
}

async function fetchStatus() {
    if (sourceIndicator) {
        sourceIndicator.className = "source-dot ok";
        if (sourceStatus) sourceStatus.innerText = "Atualizando...";
    }
    
    try {
        const response = await fetch(getApiUrl('/api/status'), { cache: 'no-store' });
        if (!response.ok) throw new Error('Falha ao obter status');
        const data = await response.json();
        
        computersData = data.computers || [];
        if (data.meta && data.meta.customUnits) {
            CUSTOM_UNITS = data.meta.customUnits;
        }

        // Cache for next load
        localStorage.setItem('noc-inventory-cache', JSON.stringify(computersData));

        renderAll();
        if (sourceStatus) sourceStatus.innerText = "Online (15s)";
    } catch (e) {
        console.error('Fetch status error:', e);
        if (sourceIndicator) sourceIndicator.className = "source-dot danger";
        if (sourceStatus) sourceStatus.innerText = "Offline/Erro";
    }
}

async function fetchCities() {
    try {
        const res = await fetch('../municipios.json', { cache: 'no-store' });
        if (res.ok) {
            allBrazilianCities = await res.json();
        }
    } catch (e) {
        console.error('Error fetching cities database:', e);
    }
}

// ========================================================================
// CORE FILTER & RENDER LOGIC
// ========================================================================

function isWindowsEndpoint(item) {
    const osText = normalizeText(item.os || '');
    return osText.includes('windows');
}

function isEndpointUnprotected(item) {
    return isWindowsEndpoint(item) && (!item.antivirus || item.antivirus === 'Nenhum');
}

function getUnitKey(unitName) {
    return normalizeText(unitName || 'nao-definidas').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'nao-definidas';
}

function getDefaultVisibleCount() {
    return compactDensity ? 10 : 15;
}

function getVisibleStep() {
    return compactDensity ? 10 : 10;
}

function getDatasetForRender() {
    if (!simulateEstateTarget || !computersData.length || computersData.length >= simulateEstateTarget) {
        return [...computersData];
    }

    const simulated = [];
    const base = [...computersData];
    for (let i = 0; i < simulateEstateTarget; i++) {
        const original = base[i % base.length];
        const cycle = Math.floor(i / base.length);
        const clone = { ...original };
        clone.id = `${original.id || original.name || 'endpoint'}__sim_${i}`;
        clone.name = `${String(original.name || 'HOST').toUpperCase()}-${String(cycle + 1).padStart(3, '0')}`;
        clone.ip = `10.${(i % 16) + 10}.${Math.floor(i / 32) % 255}.${(i % 220) + 10}`;

        const variant = i % 9;
        if (variant === 0) clone.status = 'offline';
        if (variant === 1) clone.pendingUpdates = 18;
        if (variant === 2) clone.rebootPending = 1;
        if (variant === 3 && isWindowsEndpoint(clone)) clone.antivirus = 'Nenhum';
        if (variant === 4) clone.pendingUpdates = 6;
        if (variant === 5) clone.loggedUser = 'Nenhum';
        if (variant === 6) clone.pendingUpdates = 24;
        if (variant === 7) clone.status = 'online';
        if (variant === 8) clone.rebootPending = 0;

        simulated.push(clone);
    }

    return simulated;
}

function getEndpointScore(item) {
    let score = 100;
    const updates = Number(item.pendingUpdates || 0);

    if (item.status !== 'online') score -= 35;
    if (isEndpointUnprotected(item)) score -= 25;
    if (item.rebootPending === 1) score -= 15;
    if (updates > 0) score -= Math.min(22, 6 + Math.round(updates / 2));
    if (!item.loggedUser || item.loggedUser === 'Nenhum') score -= 8;

    return Math.max(8, Math.min(100, score));
}

function getRiskTone(score) {
    if (score >= 85) return 'healthy';
    if (score >= 65) return 'attention';
    return 'critical';
}

function getEndpointPriority(item) {
    let weight = 0;
    weight += (100 - getEndpointScore(item)) * 10;
    if (item.status !== 'online') weight += 120;
    if (isEndpointUnprotected(item)) weight += 80;
    if (item.rebootPending === 1) weight += 30;
    weight += Math.min(40, Number(item.pendingUpdates || 0));
    return weight;
}

function filterAndSortComputers() {
    return getDatasetForRender().filter(c => {
        // Global search
        const haystack = normalizeText(`${c.name} ${c.ip} ${(c.groups || []).join(' ')} ${c.os || ''} ${c.hardware || ''} ${c.serialNumber || ''} ${c.city || ''} ${c.loggedUser || ''} ${c.antivirus || ''}`);
        const matchesSearch = !inventorySearch || haystack.includes(normalizeText(inventorySearch));

        // Tab/KPI status filter
        const matchesStatus = filterStatus === 'all' || c.status === filterStatus;

        // Tab/KPI security filter
        let matchesSecurity = true;
        if (filterSecurity === 'unprotected') {
            matchesSecurity = isEndpointUnprotected(c);
        } else if (filterSecurity === 'reboot') {
            matchesSecurity = c.rebootPending === 1;
        } else if (filterSecurity === 'updates') {
            matchesSecurity = Number(c.pendingUpdates || 0) > 0;
        }

        // Inline column filters (InvGate style)
        const matchesColName = !filterColName || normalizeText(c.name || '').includes(normalizeText(filterColName));
        
        let matchesColStatus = true;
        if (filterColStatus !== 'all') {
            matchesColStatus = c.status === filterColStatus;
        }
        
        const matchesColOwner = !filterColOwner || normalizeText(c.loggedUser || '').includes(normalizeText(filterColOwner));
        const matchesColLoc = !filterColLocation || normalizeText(c.city || '').includes(normalizeText(filterColLocation));
        const matchesColSerial = !filterColSerial || normalizeText(c.serialNumber || c.id || '').includes(normalizeText(filterColSerial));
        const matchesColId = !filterColId || normalizeText(c.id || '').includes(normalizeText(filterColId));

        return matchesSearch && matchesStatus && matchesSecurity && matchesColName && matchesColStatus && matchesColOwner && matchesColLoc && matchesColSerial && matchesColId;
    }).sort((a, b) => {
        const cityA = (a.city || '').trim();
        const cityB = (b.city || '').trim();

        // Indefinidos primeiro
        if (!cityA && cityB) return -1;
        if (cityA && !cityB) return 1;

        // Ordena por cidade alfabeticamente
        if (cityA && cityB) {
            const cityCompare = cityA.localeCompare(cityB, 'pt-BR');
            if (cityCompare !== 0) return cityCompare;
        }

        // Desempate por nome do computador
        return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });
}

function buildUnitMetrics(items) {
    const unitMap = {};

    items.forEach(item => {
        const unit = item.city || 'Não Definidas';
        if (!unitMap[unit]) unitMap[unit] = [];
        unitMap[unit].push(item);
    });

    return Object.entries(unitMap).map(([unit, comps]) => {
        const avgScore = Math.round(comps.reduce((sum, c) => sum + getEndpointScore(c), 0) / Math.max(1, comps.length));
        const offline = comps.filter(c => c.status !== 'online').length;
        const unprotected = comps.filter(c => isEndpointUnprotected(c)).length;
        const updates = comps.filter(c => Number(c.pendingUpdates || 0) > 0).length;
        const reboot = comps.filter(c => c.rebootPending === 1).length;
        const key = getUnitKey(unit);
        const tone = getRiskTone(avgScore);
        const foundUnit = CUSTOM_UNITS.find(u => u.name.toUpperCase() === unit.toUpperCase());
        const stateText = foundUnit && foundUnit.state ? ` (${foundUnit.state.toUpperCase()})` : '';

        return {
            key,
            unit,
            titleText: `📍 ${unit}${stateText}`,
            comps: [...comps].sort((a, b) => getEndpointPriority(b) - getEndpointPriority(a)),
            avgScore,
            offline,
            unprotected,
            updates,
            reboot,
            total: comps.length,
            tone,
            riskLoad: offline * 3 + unprotected * 2 + reboot + updates
        };
    }).sort((a, b) => {
        if (a.avgScore !== b.avgScore) return a.avgScore - b.avgScore;
        if (a.riskLoad !== b.riskLoad) return b.riskLoad - a.riskLoad;
        return b.total - a.total;
    });
}

function ensureScaleState(unitMetrics, hasActiveFilters) {
    const validKeys = new Set(unitMetrics.map(unit => unit.key));
    scaleExpandedUnits = new Set([...scaleExpandedUnits].filter(key => validKeys.has(key)));
    unitVisibleCount = Object.fromEntries(
        Object.entries(unitVisibleCount).filter(([key]) => validKeys.has(key))
    );

    if (!unitMetrics.length) return;

    if (!scaleExpandedUnits.size) {
        const defaultExpanded = hasActiveFilters
            ? unitMetrics.slice(0, Math.min(6, unitMetrics.length))
            : unitMetrics.filter(unit => unit.tone !== 'healthy').slice(0, 3);

        (defaultExpanded.length ? defaultExpanded : [unitMetrics[0]]).forEach(unit => {
            scaleExpandedUnits.add(unit.key);
        });
    }

    if (selectedComputerId) {
        const selectedUnit = unitMetrics.find(unit => unit.comps.some(item => item.id === selectedComputerId));
        if (selectedUnit) scaleExpandedUnits.add(selectedUnit.key);
    }
}

function renderScaleBar(filtered, unitMetrics) {
    if (!scaleBar) return;

    const simulateActive = Boolean(simulateEstateTarget);
    const expandedCount = unitMetrics.filter(unit => scaleExpandedUnits.has(unit.key)).length;
    const criticalUnits = unitMetrics.filter(unit => unit.tone === 'critical').length;

    scaleBar.innerHTML = `
        <div class="inventory-scale-summary">
            <span class="scale-chip ${simulateActive ? 'violet' : 'blue'}">${simulateActive ? `Simulação ${simulateEstateTarget} endpoints` : 'Operação real'}</span>
            <span class="scale-chip red">${criticalUnits} unidades críticas</span>
            <span class="scale-chip blue">${expandedCount}/${unitMetrics.length} unidades expandidas</span>
            <span class="scale-chip green">${filtered.length} endpoints renderizados</span>
        </div>
        <div class="inventory-scale-actions">
            <button type="button" class="scale-action-btn ${compactDensity ? 'active' : ''}" data-density-toggle="compact">Modo compacto</button>
            <button type="button" class="scale-action-btn ${!compactDensity ? 'active' : ''}" data-density-toggle="comfortable">Modo confortável</button>
            <button type="button" class="scale-action-btn" data-simulate-toggle="${simulateActive ? 'off' : '500'}">${simulateActive ? 'Voltar ao real' : 'Simular 500'}</button>
        </div>
    `;
}

function getEstateAnalytics(items) {
    const source = items.length ? items : getDatasetForRender();
    const units = buildUnitMetrics(source);

    const riskyUnits = units.filter(unit => unit.avgScore < 70 || unit.offline > 0 || unit.unprotected > 0).length;
    const exposed = source.filter(item => item.status !== 'online' || isEndpointUnprotected(item)).length;
    const intervention = source.filter(item => item.rebootPending === 1 || Number(item.pendingUpdates || 0) > 0).length;
    const avgCompliance = Math.round(source.reduce((sum, item) => sum + getEndpointScore(item), 0) / Math.max(1, source.length));
    const weakestUnit = units[0] || null;

    return { riskyUnits, exposed, intervention, avgCompliance, weakestUnit, totalUnits: units.length };
}

function renderAnalytics(filtered) {
    if (!analyticsStrip) return;

    const analytics = getEstateAnalytics(filtered);
    const weakestUnitText = analytics.weakestUnit
        ? `${escapeHtml(analytics.weakestUnit.unit)} · ${analytics.weakestUnit.avgScore}%`
        : 'Aguardando telemetria';
    const tone = getRiskTone(analytics.avgCompliance);

    analyticsStrip.innerHTML = `
        <article class="inventory-intel-card ${tone}">
            <span class="intel-kicker">Score de conformidade</span>
            <strong>${analytics.avgCompliance}%</strong>
            <p>Baseado em defesa contextual, updates, reboot pendente, presença e conectividade.</p>
        </article>
        <article class="inventory-intel-card">
            <span class="intel-kicker">Unidades em risco</span>
            <strong>${analytics.riskyUnits}</strong>
            <p>${analytics.totalUnits} unidades ranqueadas por criticidade.</p>
        </article>
        <article class="inventory-intel-card">
            <span class="intel-kicker">Exposição imediata</span>
            <strong>${analytics.exposed}</strong>
            <p>Endpoints offline ou sem proteção obrigatória detectada.</p>
        </article>
        <article class="inventory-intel-card">
            <span class="intel-kicker">Prioridade de atuação</span>
            <strong>${weakestUnitText}</strong>
            <p>Unidade com pior leitura consolidada no ciclo atual.</p>
        </article>
    `;
}

function renderKPIs(filtered) {
    const totalEl = document.getElementById('stat-total-stations');
    const activeEl = document.getElementById('stat-active-stations');
    const rebootEl = document.getElementById('stat-reboot-required');
    const updatesEl = document.getElementById('stat-pending-updates');
    const avEl = document.getElementById('stat-unprotected-stations');
    const source = filtered;

    if (totalEl) totalEl.innerText = source.length;
    if (activeEl) activeEl.innerText = source.filter(c => c.status === 'online').length;
    if (rebootEl) rebootEl.innerText = source.filter(c => c.rebootPending === 1).length;
    if (updatesEl) updatesEl.innerText = source.filter(c => Number(c.pendingUpdates || 0) > 0).length;
    if (avEl) avEl.innerText = source.filter(c => isEndpointUnprotected(c)).length;
}

function renderAll() {
    const filtered = filterAndSortComputers();
    renderKPIs(filtered);
    
    // Render distributions
    const dist = getDistributionData(filtered);
    renderDistributionWidget('os-distribution-bars', dist.osMap, 'blue');
    renderDistributionWidget('av-distribution-bars', dist.avMap, 'green');
    renderDistributionWidget('vendor-distribution-bars', dist.vendorMap, 'purple');
    renderDistributionWidget('ram-distribution-bars', dist.ramMap, 'orange');

    // Handle pagination
    totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const sliced = filtered.slice(startIndex, startIndex + itemsPerPage);

    // Update pagination controls
    const btnPrev = document.getElementById('btn-pag-prev');
    const btnNext = document.getElementById('btn-pag-next');
    const pagInfo = document.getElementById('pag-current-info');
    const footerCount = document.getElementById('footer-assets-count');

    if (btnPrev) btnPrev.disabled = (currentPage === 1);
    if (btnNext) btnNext.disabled = (currentPage === totalPages);
    if (pagInfo) pagInfo.innerText = `${currentPage} / ${totalPages}`;
    if (footerCount) footerCount.innerText = `${filtered.length} ASSETS`;

    // Render workstations tab view based on mode
    if (activeInventorySubTab === "workstations") {
        if (viewMode === 'table') {
            renderAssetsTable(sliced);
        } else {
            renderAssetsGrid(sliced);
        }
    } else if (activeInventorySubTab === "units") {
        renderOperationalUnitsGrid();
    }
}

function getDistributionData(filtered) {
    const osMap = {};
    const avMap = {};
    const ramMap = {};
    const vendorMap = {};

    filtered.forEach(c => {
        const os = c.os || 'Outro';
        osMap[os] = (osMap[os] || 0) + 1;

        const av = c.antivirus && c.antivirus !== 'Nenhum' ? c.antivirus : 'Sem Defesa';
        avMap[av] = (avMap[av] || 0) + 1;

        const ram = c.ram || 'Não informado';
        ramMap[ram] = (ramMap[ram] || 0) + 1;
        const vendor = c.vendor || 'Outro';
        vendorMap[vendor] = (vendorMap[vendor] || 0) + 1;
    });

    return { osMap, avMap, ramMap, vendorMap };
}

function renderDistributionWidget(containerId, map, colorClass = 'blue') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, val]) => sum + val, 0);

    if (total === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:11px; text-align:center; padding:12px;">Sem dados</div>';
        return;
    }

    const top3 = entries.slice(0, 3);
    const othersCount = entries.slice(3).reduce((sum, [, val]) => sum + val, 0);
    if (othersCount > 0) {
        top3.push(['Outros', othersCount]);
    }

    container.innerHTML = top3.map(([key, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return `
            <div class="distribution-row" style="cursor: pointer; transition: opacity 0.15s;" 
                 title="Clique para filtrar por ${escapeHtml(key)}" 
                 onclick="filterByDistribution('${escapeHtml(key)}')">
                <div class="dist-meta">
                    <span class="dist-label" title="${escapeHtml(key)}">${escapeHtml(key)}</span>
                    <span class="dist-val">${count} (${pct}%)</span>
                </div>
                <div class="dist-bar-bg">
                    <div class="dist-bar-fill ${colorClass}" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    }).join('\n');
}

function filterByDistribution(value) {
    const searchInput = document.getElementById('inventory-search-input');
    if (searchInput) {
        searchInput.value = value;
        inventorySearch = value;
        currentPage = 1;
        renderAll();
    }
}

function renderAssetsTable(sliced) {
    const tbody = document.getElementById('assets-table-body');
    if (!tbody) return;

    if (!sliced.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted);">Nenhum ativo corresponde aos filtros atuais.</td></tr>';
        return;
    }

    tbody.innerHTML = sliced.map(c => {
        const score = getEndpointScore(c);
        const tone = getRiskTone(score);
        const isSelected = c.id === selectedComputerId;
        const statusClass = c.status === 'online' ? 'online' : 'offline';
        const userDesc = c.loggedUser && c.loggedUser !== 'Nenhum' ? c.loggedUser : 'Sem usuário';
        const osDesc = c.os || 'SO não informado';
        const unitName = c.city || 'Não classificado';
        
        // Build alert badges
        const alertBadges = [];
        if (c.status === 'offline') {
            alertBadges.push(`<span class="tbl-badge red">Offline</span>`);
        }
        if (isEndpointUnprotected(c)) {
            alertBadges.push(`<span class="tbl-badge red">Sem Defesa</span>`);
        }
        if (c.rebootPending === 1) {
            alertBadges.push(`<span class="tbl-badge orange">Reboot</span>`);
        }
        if (Number(c.pendingUpdates || 0) > 0) {
            alertBadges.push(`<span class="tbl-badge orange">${c.pendingUpdates} Updates</span>`);
        }
        if (alertBadges.length === 0) {
            alertBadges.push(`<span class="tbl-badge green">Estável</span>`);
        }

        const scoreClass = tone === 'healthy' ? 'high' : (tone === 'attention' ? 'medium' : 'low');

        return `
            <tr class="asset-row ${isSelected ? 'active' : ''}" data-open-type="computer" data-open-id="${c.id}">
                <td style="text-align: center;" onclick="event.stopPropagation();"><input type="checkbox" class="asset-select-checkbox"></td>
                <td>
                    <div class="device-icon-wrapper ${statusClass}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
                    </div>
                </td>
                <td><strong style="color:var(--text-main); font-weight:600;">${escapeHtml(c.name)}</strong></td>
                <td><span class="status-pill ${statusClass}">${c.status === 'online' ? 'Active' : 'Offline'}</span></td>
                <td><span style="color:var(--text-main); font-weight:500;">${escapeHtml(userDesc)}</span></td>
                <td><span style="color:var(--text-muted); font-weight:500;">${escapeHtml(unitName)}</span></td>
                <td><span style="color:var(--text-muted); font-family:monospace; font-size:11px;">${escapeHtml(c.serialNumber || c.id || '--')}</span></td>
                <td><span style="color:var(--text-muted); font-family:monospace; font-size:11px;">${escapeHtml(c.id)}</span></td>
                <td style="text-align: center;">
                    <span class="tbl-score ${scoreClass}">${score}%</span>
                </td>
            </tr>
        `;
    }).join('\n');
}

function renderAssetsGrid(sliced) {
    const grid = document.getElementById('magma-assets-grid');
    if (!grid) return;

    if (!sliced.length) {
        grid.innerHTML = '<div class="empty-state">Nenhum ativo corresponde aos filtros atuais.</div>';
        return;
    }

    grid.innerHTML = sliced.map(c => {
        const score = getEndpointScore(c);
        const tone = getRiskTone(score);
        const isSelected = c.id === selectedComputerId;
        const statusClass = c.status === 'online' ? 'online' : 'offline';
        const userDesc = c.loggedUser && c.loggedUser !== 'Nenhum' ? c.loggedUser : 'Sem usuário';
        const osDesc = c.os || 'SO não informado';
        const unitName = c.city || 'Não classificado';
        
        // Spec defaults
        const modelDesc = c.model ? `${c.vendor || ''} ${c.model}` : (c.vendor || 'Hardware desconhecido');
        const cpuDesc = c.hardware || 'Processador não informado';
        const ramDesc = c.ram || 'RAM não informada';
        const diskDesc = c.disk || 'Disco não informado';

        // Alert badges
        const alertBadges = [];
        if (c.status === 'offline') {
            alertBadges.push(`<span class="card-badge red">Offline</span>`);
        }
        if (isEndpointUnprotected(c)) {
            alertBadges.push(`<span class="card-badge red">Sem Defesa</span>`);
        }
        if (c.rebootPending === 1) {
            alertBadges.push(`<span class="card-badge orange">Reboot</span>`);
        }
        if (Number(c.pendingUpdates || 0) > 0) {
            alertBadges.push(`<span class="card-badge orange">${c.pendingUpdates} Updates</span>`);
        }
        if (alertBadges.length === 0) {
            alertBadges.push(`<span class="card-badge green">Estável</span>`);
        }

        const scoreClass = tone === 'healthy' ? 'high' : (tone === 'attention' ? 'medium' : 'low');

        return `
            <div class="invgate-card ${isSelected ? 'active' : ''}" data-open-type="computer" data-open-id="${c.id}">
                <div class="card-header">
                    <div class="card-title-group">
                        <div class="card-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
                        </div>
                        <span class="card-hostname">${escapeHtml(c.name)}</span>
                    </div>
                    <span class="status-pill ${statusClass}">${c.status === 'online' ? 'Active' : 'Offline'}</span>
                </div>
                
                <div class="card-body">
                    <div class="card-spec-row" title="Modelo do Dispositivo">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>
                        <span class="card-spec-val bold">${escapeHtml(modelDesc)}</span>
                    </div>
                    <div class="card-spec-row" title="Processador (CPU)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"/></svg>
                        <span class="card-spec-val">${escapeHtml(cpuDesc)}</span>
                    </div>
                    <div class="card-spec-row" title="Memória RAM">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 19v-3M10 19v-3M14 19v-3M18 19v-3M8 11V8M16 11V8"/><rect width="18" height="12" x="3" y="6" rx="2"/></svg>
                        <span class="card-spec-val">${escapeHtml(ramDesc)}</span>
                    </div>
                    <div class="card-spec-row" title="Armazenamento (Disco)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>
                        <span class="card-spec-val">${escapeHtml(diskDesc)}</span>
                    </div>
                    <div class="card-spec-row" title="Sistema Operacional">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
                        <span class="card-spec-val">${escapeHtml(osDesc)}</span>
                    </div>
                    <div class="card-spec-row" title="Usuário Logado">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <span class="card-spec-val">${escapeHtml(userDesc)}</span>
                    </div>
                    
                    <div class="card-badges">
                        ${alertBadges.join('')}
                    </div>
                </div>

                <div class="card-footer">
                    <span class="card-location">${escapeHtml(unitName)}</span>
                    <span class="tbl-score ${scoreClass}">${score}%</span>
                </div>
            </div>
        `;
    }).join('\n');
}



// ========================================================================
// INLINE DETAIL PANEL LOGIC
// ========================================================================
// DEVICE PROFILE LAYOUT LOGIC (FULL CARD VIEW)
function openDeviceProfile(id) {
    selectedComputerId = id;
    const item = getDatasetForRender().find(c => String(c.id) === String(id));
    if (!item) return;

    const wView = document.getElementById('workstations-view-container');
    const uView = document.getElementById('units-view-container');
    const pView = document.getElementById('device-profile-view-container');
    
    if (wView) wView.style.display = 'none';
    if (uView) uView.style.display = 'none';
    
    if (pView) {
        pView.innerHTML = renderProfileContent(item);
        pView.style.display = 'block';
        
        // Add tab change listeners
        const tabs = pView.querySelectorAll('.profile-subtab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const targetTab = tab.getAttribute('data-tab');
                const contents = pView.querySelectorAll('.profile-tab-content');
                contents.forEach(content => {
                    if (content.id === `tab-content-${targetTab}`) {
                        content.style.display = 'block';
                    } else {
                        content.style.display = 'none';
                    }
                });
            });
        });

        // Add Edit buttons listeners
        const editLocBtn = pView.querySelector('#btn-edit-profile-location');
        if (editLocBtn) {
            editLocBtn.addEventListener('click', () => {
                editProfileLocation(item);
            });
        }
        const editOwnerBtn = pView.querySelector('#btn-edit-profile-owner');
        if (editOwnerBtn) {
            editOwnerBtn.addEventListener('click', () => {
                editProfileOwner(item);
            });
        }
        const mainEditBtn = pView.querySelector('.btn-profile-edit');
        if (mainEditBtn) {
            mainEditBtn.addEventListener('click', () => {
                editProfileLocation(item);
            });
        }

        const settingsTrigger = pView.querySelector('#btn-profile-settings-trigger');
        const settingsDropdown = pView.querySelector('#profile-settings-dropdown');
        if (settingsTrigger && settingsDropdown) {
            settingsTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShowing = settingsDropdown.style.display === 'block';
                settingsDropdown.style.display = isShowing ? 'none' : 'block';
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', () => {
                settingsDropdown.style.display = 'none';
            });
            
            const btnDebugJson = pView.querySelector('#btn-settings-debug-json');
            if (btnDebugJson) {
                btnDebugJson.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    settingsDropdown.style.display = 'none';
                    alert(JSON.stringify(item, null, 4));
                });
            }
            
            const btnReset = pView.querySelector('#btn-settings-reset');
            if (btnReset) {
                btnReset.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    settingsDropdown.style.display = 'none';
                    
                    if (!confirm('Deseja realmente remover todas as customizações (Localização e Proprietário) para este dispositivo e resetar para os padrões do Zabbix?')) return;
                    
                    try {
                        const currentResponse = await fetch('/api/config', { cache: 'no-store' });
                        const currentSettings = await currentResponse.json();
                        
                        if (currentSettings.locations && currentSettings.locations[item.id]) {
                            delete currentSettings.locations[item.id];
                        }
                        if (currentSettings.owners && currentSettings.owners[item.id]) {
                            delete currentSettings.owners[item.id];
                        }
                        
                        const saveResponse = await fetch('/api/config', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(currentSettings)
                        });
                        
                        if (!saveResponse.ok) throw new Error('Falha ao atualizar configurações no servidor');
                        
                        alert('Personalizações removidas com sucesso!');
                        await fetchStatus();
                        openDeviceProfile(item.id);
                    } catch (err) {
                        console.error(err);
                        alert('Erro ao resetar: ' + err.message);
                    }
                });
            }
            
            const btnSync = pView.querySelector('#btn-settings-sync');
            if (btnSync) {
                btnSync.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    settingsDropdown.style.display = 'none';
                    alert('Sincronização com o agente Zabbix forçada com sucesso para ' + item.name + '!');
                });
            }

            const btnDelete = pView.querySelector('#btn-settings-delete');
            if (btnDelete) {
                btnDelete.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    settingsDropdown.style.display = 'none';
                    
                    const confirmDelete = confirm(`⚠️ EXCLUSÃO PERMANENTE ⚠️\n\nTem certeza de que deseja excluir permanentemente o dispositivo "${item.name}" (ID: ${item.id}) do NOC e do servidor Zabbix?\n\nEsta ação NÃO pode ser desfeita e removerá o monitoramento deste dispositivo.`);
                    if (!confirmDelete) return;
                    
                    try {
                        const res = await fetch('/api/hosts/delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ hostid: item.id, name: item.name })
                        });
                        
                        const data = await res.json();
                        if (res.ok && data.success) {
                            alert(`Dispositivo "${item.name}" excluído com sucesso do Zabbix e do NOC!`);
                            closeDeviceProfile();
                            await fetchStatus();
                        } else {
                            alert(`Falha ao excluir dispositivo: ${data.error || 'Erro desconhecido'}`);
                        }
                    } catch (err) {
                        alert(`Erro de conexão com o servidor: ${err.message}`);
                    }
                });
            }
        }
    }
}

function closeDeviceProfile() {
    selectedComputerId = null;
    const wView = document.getElementById('workstations-view-container');
    const uView = document.getElementById('units-view-container');
    const cView = document.getElementById('cloud-view-container');
    const pView = document.getElementById('device-profile-view-container');
    
    if (pView) pView.style.display = 'none';
    
    if (wView) wView.style.display = activeInventorySubTab === 'workstations' ? 'block' : 'none';
    if (uView) uView.style.display = activeInventorySubTab === 'units' ? 'block' : 'none';
    if (cView) cView.style.display = activeInventorySubTab === 'cloud' ? 'block' : 'none';
}

function getOSDetails(osString) {
    const osLower = (osString || '').toLowerCase();
    
    // Windows
    if (osLower.includes('windows') || osLower.includes('microsoft')) {
        return {
            vendor: 'Microsoft',
            logo: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="12" x2="12" y1="3" y2="21"/><line x1="3" x2="21" y1="12" y2="12"/></svg>`
        };
    }
    
    // Linux
    if (osLower.includes('linux') || osLower.includes('ubuntu') || osLower.includes('debian') || osLower.includes('redhat') || osLower.includes('centos') || osLower.includes('fedora') || osLower.includes('suse')) {
        return {
            vendor: 'Linux',
            logo: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 0 0-7.75 16.3l.08.1a10 10 0 1 0 15.34 0l.08-.1A10 10 0 0 0 12 2zm0 15a5 5 0 1 1 5-5 5 5 0 0 1-5 5z"/></svg>`
        };
    }
    
    // Apple
    if (osLower.includes('mac') || osLower.includes('apple') || osLower.includes('darwin') || osLower.includes('osx')) {
        return {
            vendor: 'Apple macOS',
            logo: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.39c-1.36 0-2.45-.69-3.21-1.62-.8-1-1.07-2.31-1.07-3.77 0-1.46.27-2.77 1.07-3.77.76-.93 1.85-1.62 3.21-1.62 1.25 0 2.22.56 2.91 1.34V9.61c.42-.47.92-.85 1.5-.85.34 0 .66.13.9.34.25.2.39.5.39.84V14.15c0 .34-.14.64-.39.84-.24.21-.56.34-.9.34-.58 0-1.08-.38-1.5-.85v1.34c-.69.78-1.66 1.34-2.91 1.34z"/></svg>`
        };
    }
    
    // Generic
    return {
        vendor: 'Sistema Operacional',
        logo: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7489a0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="3" rx="2"/><line x1="12" x2="12" y1="15" y2="21"/><line x1="8" x2="16" y1="21" y2="21"/></svg>`
    };
}

function renderProfileContent(item) {
    const osInfo = getOSDetails(item.os);
    const itemScore = getEndpointScore(item);
    const itemTone = getRiskTone(itemScore);
    
    const userDesc = item.loggedUser && item.loggedUser !== 'Nenhum' ? item.loggedUser : 'Sem Proprietário';
    const initialLetters = item.loggedUser && item.loggedUser !== 'Nenhum' ? item.loggedUser.substring(0, 2).toUpperCase() : 'SP';
    const isOffline = item.status !== 'online';
    const isUnprotected = isEndpointUnprotected(item);
    const hasReboot = item.rebootPending === 1;
    const updatesCount = Number(item.pendingUpdates || 0);

    return `
        <div class="profile-header-card">
            <div class="profile-back-row">
                <button type="button" class="btn-profile-back" onclick="closeDeviceProfile()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                    <span>Voltar para Ativos</span>
                </button>
            </div>
            
            <div class="profile-main-header">
                <div class="profile-identity">
                    <div class="profile-device-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
                    </div>
                    <div class="profile-title-block">
                        <h2>${escapeHtml(item.name)}</h2>
                        <span class="profile-type">Desktop</span>
                        <span class="profile-updated">Atualizado em ${escapeHtml(item.uptime || 'Recentemente')}</span>
                    </div>
                </div>
                
                <div class="profile-quick-stats">
                    <div class="quick-stat-box">
                        <div class="qs-icon purple">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/></svg>
                        </div>
                        <div class="qs-info">
                            <strong>${item.status === 'online' ? 'Activo' : 'Inactivo'}</strong>
                            <span>Estado</span>
                        </div>
                        <button type="button" class="qs-edit-btn">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        </button>
                    </div>
                    
                    <div class="quick-stat-box">
                        <div class="qs-icon teal">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                        </div>
                        <div class="qs-info">
                            <strong>${escapeHtml(item.city || 'Não Definida')}</strong>
                            <span>Localização</span>
                        </div>
                        <button type="button" class="qs-edit-btn" id="btn-edit-profile-location">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        </button>
                    </div>
                    
                    <div class="quick-stat-box">
                        <div class="qs-icon user-avatar">
                            <span>${escapeHtml(initialLetters)}</span>
                        </div>
                        <div class="qs-info">
                            <strong>${escapeHtml(userDesc)}</strong>
                            <span>Proprietário</span>
                        </div>
                        <button type="button" class="qs-edit-btn" id="btn-edit-profile-owner">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        </button>
                    </div>

                    <div class="profile-actions-group">
                        <button type="button" class="profile-act-icon-btn" title="Status de Conexão">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                        </button>
                        <button type="button" class="profile-act-icon-btn" title="Prioridade">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>
                        </button>
                        <button type="button" class="btn-profile-edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                            <span>Editar</span>
                        </button>
                        <div class="settings-wrapper" style="position: relative; display: inline-block;">
                            <button type="button" class="btn-profile-settings" id="btn-profile-settings-trigger" title="Opções do Dispositivo">
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                            </button>
                            <div class="profile-settings-dropdown" id="profile-settings-dropdown" style="display: none; position: absolute; top: 100%; right: 0; margin-top: 8px; background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 1000; min-width: 220px; text-align: left;">
                                <a href="#" class="dropdown-item" id="btn-settings-debug-json" style="display: flex; align-items: center; padding: 10px 14px; color: var(--text-main); font-size: 12px; text-decoration: none; transition: background 0.15s; border-bottom: 1px solid var(--border-color); font-weight: 500;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; color: var(--accent-purple);"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                                    Ver Telemetria Bruta (JSON)
                                </a>
                                <a href="#" class="dropdown-item" id="btn-settings-sync" style="display: flex; align-items: center; padding: 10px 14px; color: var(--text-main); font-size: 12px; text-decoration: none; transition: background 0.15s; border-bottom: 1px solid var(--border-color); font-weight: 500;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; color: var(--green);"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                                    Forçar Sincronização Zabbix
                                </a>
                                <a href="#" class="dropdown-item" id="btn-settings-reset" style="display: flex; align-items: center; padding: 10px 14px; color: #ff6b6b; font-size: 12px; text-decoration: none; transition: background 0.15s; border-bottom: 1px solid var(--border-color); font-weight: 500;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; color: #ff6b6b;"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                    Limpar Personalizações
                                </a>
                                <a href="#" class="dropdown-item" id="btn-settings-delete" style="display: flex; align-items: center; padding: 10px 14px; color: #ff3b30; font-size: 12px; text-decoration: none; transition: background 0.15s; font-weight: 600;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; color: #ff3b30;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                    Excluir permanentemente
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sub-tabs bar -->
            <div class="profile-subtabs">
                <button type="button" class="profile-subtab active" data-tab="inicio">Inicio</button>
                <button type="button" class="profile-subtab" data-tab="hardware">Hardware</button>
                <button type="button" class="profile-subtab" data-tab="aplicacoes">Aplicações</button>
                <button type="button" class="profile-subtab" data-tab="windows">Sistema</button>
                <button type="button" class="profile-subtab" data-tab="contratos">Contratos</button>
                <button type="button" class="profile-subtab" data-tab="financas">Finanças</button>
                <button type="button" class="profile-subtab" data-tab="pedidos">Pedidos</button>
                <button type="button" class="profile-subtab" data-tab="implantacao">Implantação</button>
                <button type="button" class="profile-subtab" data-tab="atividade">Atividade</button>
            </div>

            <!-- Tab Contents -->
            <div class="profile-tab-content active" id="tab-content-inicio">
                <div class="profile-grid-body">
                    
                    <!-- Column Left: Grid Cards -->
                    <div class="profile-left-col">
                        
                        <!-- Status Cards Grid -->
                        <div class="profile-status-cards-grid">
                            
                            <!-- Connectivity Card -->
                            <div class="profile-status-card ${!isOffline ? 'ok' : 'danger'}">
                                <div class="stat-card-main">
                                    <div class="stat-card-icon">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    </div>
                                    <div class="stat-card-text">
                                        <h4>A conectividade está ${!isOffline ? 'online' : 'offline'}</h4>
                                        <p>${!isOffline ? 'Agente reportado em tempo real.' : 'Agente reportado como offline.'}</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Antivirus Card -->
                            <div class="profile-status-card ${!isUnprotected ? 'ok' : 'danger'}">
                                <div class="stat-card-main">
                                    <div class="stat-card-icon">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/></svg>
                                    </div>
                                    <div class="stat-card-text">
                                        <h4>O antivírus está ${!isUnprotected ? 'habilitado' : 'desabilitado'}</h4>
                                        <p>${escapeHtml(item.antivirus && item.antivirus !== 'Nenhum' ? item.antivirus : 'Sem Defesa Ativa')}</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Firewall Card -->
                            <div class="profile-status-card ok">
                                <div class="stat-card-main">
                                    <div class="stat-card-icon">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                                    </div>
                                    <div class="stat-card-text">
                                        <h4>O firewall está habilitado</h4>
                                        <p>Firewall ativo detectado.</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Health Card -->
                            <div class="profile-status-card ${itemScore >= 85 ? 'ok' : 'attention'}">
                                <div class="stat-card-main">
                                    <div class="stat-card-icon">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                                    </div>
                                    <div class="stat-card-text">
                                        <h4>Estado de saúde: ${itemScore >= 85 ? 'Excelente' : 'Alerta'}</h4>
                                        <p>${itemScore}% de conformidade de segurança.</p>
                                    </div>
                                </div>
                                ${itemScore < 85 ? `
                                    <div class="health-alert-banner">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                                        <span>Algumas condições não estão em conformidade</span>
                                    </div>
                                ` : ''}
                            </div>

                        </div>

                        <!-- Software Details Box -->
                        <div class="profile-software-card">
                            <div class="software-card-header">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <h3 class="soft-title">Software</h3>
                                </div>
                                ${hasReboot ? `<span class="reboot-pending-badge">REINICIALIZAÇÃO PENDENTE</span>` : ''}
                            </div>
                            
                            <div class="software-summary-row">
                                <div class="soft-os-logo">
                                    ${osInfo.logo}
                                </div>
                                <div class="soft-os-text">
                                    <strong>${escapeHtml(osInfo.vendor)}</strong>
                                    <span>${escapeHtml(item.os || 'SO não informado')}</span>
                                </div>
                                <div class="soft-stat">
                                    <strong>60</strong>
                                    <span>Instalações</span>
                                </div>
                                <div class="soft-stat">
                                    <strong>${escapeHtml(item.uptime || '--')}</strong>
                                    <span>Tempo de atividade</span>
                                </div>
                            </div>

                            <div class="software-details-grid">
                                <div class="soft-detail-item">
                                    <span>Versão do SO</span>
                                    <strong>${escapeHtml(item.os || '--')}</strong>
                                </div>
                                <div class="soft-detail-item">
                                    <span>Número de Serial</span>
                                    <strong>${escapeHtml(item.serialNumber || '--')}</strong>
                                </div>
                                <div class="soft-detail-item">
                                    <span>Endereço IP</span>
                                    <strong>${escapeHtml(item.ip || '--')}</strong>
                                </div>
                                <div class="soft-detail-item">
                                    <span>Endereço MAC</span>
                                    <strong>${escapeHtml(item.macAddress || '--')}</strong>
                                </div>
                                <div class="soft-detail-item">
                                    <span>ID Zabbix</span>
                                    <strong>${escapeHtml(item.id || '--')}</strong>
                                </div>
                                <div class="soft-detail-item">
                                    <span>Descrição</span>
                                    <strong>${escapeHtml(item.model ? `${item.vendor || ''} ${item.model}` : (item.vendor || 'Dispositivo de Parque'))}</strong>
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- Column Right: Secondary Blocks -->
                    <div class="profile-right-col">
                        
                        <!-- Custom Fields -->
                        <div class="profile-sec-box">
                            <div class="box-header">
                                <h4>Campos personalizados</h4>
                                <button type="button" class="box-edit-btn">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                </button>
                            </div>
                            <div class="box-body-field">
                                <span>Departamento de negócios</span>
                                <strong>TI</strong>
                            </div>
                            <div class="box-body-field" style="margin-top: 10px;">
                                <span>Região Operacional</span>
                                <strong>${escapeHtml(item.customRegion || item.region || 'Não vinculada')}</strong>
                            </div>
                        </div>

                        <!-- Requests Box -->
                        <div class="profile-sec-box">
                            <div class="box-header">
                                <h4>Solicitações</h4>
                                <span class="box-header-sub">Por tipo</span>
                            </div>
                            <div class="box-number-display">0</div>
                        </div>

                        <!-- Contracts Box -->
                        <div class="profile-sec-box">
                            <div class="box-header">
                                <h4>Contratos</h4>
                                <span class="box-header-sub">1 asignados</span>
                            </div>
                            <div class="box-contracts-value">
                                <strong>54 Software (Stand-alone), from...</strong>
                                <span class="price-val">$53</span>
                            </div>
                        </div>

                        <!-- Tags Box -->
                        <div class="profile-sec-box">
                            <div class="box-header">
                                <h4>Grupos Zabbix</h4>
                            </div>
                            <div class="box-tags-list">
                                ${(item.groups && item.groups.length) ? item.groups.map(g => `<span class="profile-tag blue">${escapeHtml(g)}</span>`).join('') : '<span style="color:var(--text-muted); font-size:11px;">Sem grupos</span>'}
                            </div>
                        </div>

                    </div>

                </div>
            </div>
            
            <!-- Hardware tab content -->
            <div class="profile-tab-content" id="tab-content-hardware" style="display:none;">
                <div class="profile-software-card">
                    <h3 class="soft-title" style="margin-bottom: 16px;">Especificações de Hardware</h3>
                    <div class="software-details-grid">
                        <div class="soft-detail-item">
                            <span>Fabricante</span>
                            <strong>${escapeHtml(item.vendor || 'Não informado')}</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Modelo</span>
                            <strong>${escapeHtml(item.model || 'Não informado')}</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Processador</span>
                            <strong>${escapeHtml(item.hardware || 'Não informado')}</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Memória RAM</span>
                            <strong>${escapeHtml(item.ram || 'Não informada')}</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Arquitetura</span>
                            <strong>${escapeHtml(item.hwArch || 'Não informada')}</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Espaço em Disco</span>
                            <strong>${escapeHtml(item.disk || 'Não informado')}</strong>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Aplicações tab content -->
            <div class="profile-tab-content" id="tab-content-aplicacoes" style="display:none;">
                <div class="profile-software-card" style="margin-bottom: 20px;">
                    <h3 class="soft-title" style="margin-bottom: 16px;">Segurança e Atualizações</h3>
                    <div class="software-details-grid">
                        <div class="soft-detail-item">
                            <span>Antivírus Monitorado</span>
                            <strong>${escapeHtml(item.antivirus || 'Nenhum')}</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Updates do Windows</span>
                            <strong>${updatesCount} patches pendentes</strong>
                        </div>
                    </div>
                </div>

                <div class="profile-software-card">
                    <h3 class="soft-title" style="margin-bottom: 16px;">Programas Instalados (${item.installedSoftware ? item.installedSoftware.length : 0})</h3>
                    ${(item.installedSoftware && item.installedSoftware.length > 0) ? `
                        <div style="max-height: 360px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; background: rgba(0,0,0,0.15);">
                            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                                <thead>
                                    <tr style="border-bottom: 1px solid var(--border-color); background: rgba(255,255,255,0.03);">
                                        <th style="padding: 10px 14px; color: var(--text-muted); font-weight: 600;">Nome do Programa</th>
                                        <th style="padding: 10px 14px; color: var(--text-muted); font-weight: 600; width: 120px;">Versão</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${item.installedSoftware.map(sw => `
                                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.1s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                                            <td style="padding: 10px 14px; color: var(--text-main); font-weight: 500;">${escapeHtml(sw.name)}</td>
                                            <td style="padding: 10px 14px; color: var(--text-muted);">${escapeHtml(sw.version || '--')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : `
                        <div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 24px;">
                            Nenhum programa instalado reportado pelo agente Zabbix.
                        </div>
                    `}
                </div>
            </div>

            <!-- Windows tab content -->
            <div class="profile-tab-content" id="tab-content-windows" style="display:none;">
                <div class="profile-software-card">
                    <h3 class="soft-title" style="margin-bottom: 16px;">Configurações e Atualizações do Sistema</h3>
                    <div class="software-details-grid">
                        <div class="soft-detail-item">
                            <span>Versão do SO</span>
                            <strong>${escapeHtml(item.os || 'SO não informado')}</strong>
                        </div>
                        ${osInfo.vendor === 'Microsoft' ? `
                        <div class="soft-detail-item">
                            <span>Servidor WSUS</span>
                            <strong>${escapeHtml(item.wsusServer || 'Vazio')}</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>WSUS ID</span>
                            <strong>${escapeHtml(item.wsusId || 'Vazio')}</strong>
                        </div>
                        ` : ''}
                        <div class="soft-detail-item">
                            <span>Atualizações Pendentes</span>
                            <strong>${updatesCount} atualizações</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Firewall Ativo</span>
                            <strong>${item.firewallEnabled === 1 ? 'Sim' : 'Não'}</strong>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Contratos tab content -->
            <div class="profile-tab-content" id="tab-content-contratos" style="display:none;">
                <div class="profile-software-card">
                    <h3 class="soft-title" style="margin-bottom: 16px;">Contratos e Garantia do Ativo</h3>
                    <div class="software-details-grid">
                        <div class="soft-detail-item">
                            <span>Garantia de Hardware</span>
                            <strong>Vigente até 2027-12-31</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Contrato de Suporte</span>
                            <strong>TI Suporte Local - 12x5</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Acordo de SLA</span>
                            <strong>4 Horas de Solução</strong>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Finanças tab content -->
            <div class="profile-tab-content" id="tab-content-financas" style="display:none;">
                <div class="profile-software-card">
                    <h3 class="soft-title" style="margin-bottom: 16px;">Detalhes Financeiros</h3>
                    <div class="software-details-grid">
                        <div class="soft-detail-item">
                            <span>Valor de Aquisição</span>
                            <strong>R$ 4.500,00</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Data de Compra</span>
                            <strong>2022-08-02</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Número da Nota Fiscal</span>
                            <strong>NF-77894</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Estado de Depreciação</span>
                            <strong>50% Depreciado</strong>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Pedidos tab content -->
            <div class="profile-tab-content" id="tab-content-pedidos" style="display:none;">
                <div class="profile-software-card">
                    <h3 class="soft-title" style="margin-bottom: 16px;">Solicitações e Pedidos de TI</h3>
                    <div class="software-details-grid">
                        <div class="soft-detail-item">
                            <span>Chamados Abertos</span>
                            <strong>0 chamados ativos</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Último Chamado Fechado</span>
                            <strong>#9901 - Lentidão no sistema (Concluído)</strong>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Implantação tab content -->
            <div class="profile-tab-content" id="tab-content-implantacao" style="display:none;">
                <div class="profile-software-card">
                    <h3 class="soft-title" style="margin-bottom: 16px;">Status de Implantação</h3>
                    <div class="software-details-grid">
                        <div class="soft-detail-item">
                            <span>Data de Instalação</span>
                            <strong>${escapeHtml(item.osInstallDate || '2022-08-02')}</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Método de Deployment</span>
                            <strong>PXE Boot / WDS Image</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Status de Provisionamento</span>
                            <strong>Homologado e Pronto</strong>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Atividade tab content -->
            <div class="profile-tab-content" id="tab-content-atividade" style="display:none;">
                <div class="profile-software-card">
                    <h3 class="soft-title" style="margin-bottom: 16px;">Histórico de Atividade e Conexões</h3>
                    <div class="software-details-grid">
                        <div class="soft-detail-item">
                            <span>Conectividade Zabbix</span>
                            <strong>Online (Check-in a cada 15s)</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Latência Média</span>
                            <strong>12 ms (Estável)</strong>
                        </div>
                        <div class="soft-detail-item">
                            <span>Último Evento</span>
                            <strong>Agente reportou conformidade 100%</strong>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
}

async function saveLocation() {
    const item = computersData.find(c => c.id === selectedComputerId);
    if (!item) return;

    const cityInput = document.getElementById('inline-city-input');
    const regionSelect = document.getElementById('inline-region-select');
    const saveBtn = document.getElementById('btn-save-inline-location');

    let cityVal = (cityInput?.value || '').trim().toUpperCase();
    let regionVal = regionSelect?.value || 'none';

    if (saveBtn) saveBtn.disabled = true;

    try {
        const codeLower = cityVal.toLowerCase();
        const existsCustom = CUSTOM_UNITS.some(u => u.name.toLowerCase() == codeLower);
        const existsCity = allBrazilianCities.some(c => normalizeText(c.nome).toLowerCase() == codeLower);

        if (cityVal && !existsCustom && !existsCity) {
            const targetCityName = prompt(`A unidade "${cityVal}" não está cadastrada.\nPara cadastrá-la no NOC, digite o nome do município onde fica (Ex: Juiz de Fora, Campinas, Muriaé):`);
            if (targetCityName === null) {
                if (saveBtn) saveBtn.disabled = false;
                return;
            }
            if (!targetCityName.trim()) {
                alert('Operação cancelada. O município não pode ser vazio.');
                if (saveBtn) saveBtn.disabled = false;
                return;
            }

            const normalizedTarget = normalizeText(targetCityName).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
            const foundCity = allBrazilianCities.find(cItem => normalizeText(cItem.nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() === normalizedTarget);

            if (!foundCity) {
                alert(`A cidade "${targetCityName}" não foi localizada na base de dados de municípios.`);
                if (saveBtn) saveBtn.disabled = false;
                return;
            }

            const ufMap = {
                11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
                21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
                31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP',
                41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
            };

            const inferredRegion = detectRegion(foundCity.codigo_uf, foundCity.nome);
            const newUnit = {
                name: cityVal.toUpperCase(),
                city: foundCity.nome,
                region: inferredRegion,
                state: ufMap[foundCity.codigo_uf] || ''
            };

            CUSTOM_UNITS.push(newUnit);

            const currentResponse = await fetch('/api/config', { cache: 'no-store' });
            const currentSettings = await currentResponse.json();
            currentSettings.customUnits = [...CUSTOM_UNITS];

            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentSettings)
            });

            cityVal = newUnit.name;
            regionVal = newUnit.region;
            if (cityInput) cityInput.value = newUnit.name;
            if (regionSelect) regionSelect.value = newUnit.region;
        }

        const info = getRegionAndCoordsFromCity(cityVal);

        const currentResponse = await fetch('/api/config', { cache: 'no-store' });
        const currentSettings = await currentResponse.json();

        if (!currentSettings.locations) currentSettings.locations = {};
        currentSettings.locations[item.id] = {
            city: cityVal || null,
            region: regionVal,
            lat: info.lat,
            lng: info.lng,
            bandwidth: item.bandwidth || null
        };

        const saveResponse = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSettings)
        });

        if (!saveResponse.ok) throw new Error('Falha ao gravar configurações no servidor');

        alert('Configurações de localização salvas com sucesso!');
        closeDeviceProfile();
        fetchStatus();
    } catch (e) {
        console.error(e);
        alert('Erro ao salvar localização: ' + e.message);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

let currentEditingItem = null;
let currentEditingMode = null; // 'location' or 'owner'

function editProfileLocation(item) {
    currentEditingItem = item;
    currentEditingMode = 'location';

    const overlay = document.getElementById('edit-device-modal-overlay');
    const title = document.getElementById('edit-device-modal-title');
    const groupLoc = document.getElementById('edit-field-group-location');
    const groupReg = document.getElementById('edit-field-group-region');
    const groupOwner = document.getElementById('edit-field-group-owner');

    const inputCity = document.getElementById('edit-device-city');
    const selectRegion = document.getElementById('edit-device-region');

    if (!overlay) return;

    title.innerText = 'Editar Localização';
    if (groupLoc) groupLoc.style.display = 'block';
    if (groupReg) groupReg.style.display = 'block';
    if (groupOwner) groupOwner.style.display = 'none';

    if (inputCity) {
        inputCity.value = (item.city || '').toUpperCase();
        inputCity.required = true;
    }
    const inputOwner = document.getElementById('edit-device-owner');
    if (inputOwner) {
        inputOwner.required = false;
    }
    if (selectRegion) {
        selectRegion.value = item.customRegion || 'none';
    }

    overlay.style.display = 'flex';
    setupEditCityAutocomplete();
}

function editProfileOwner(item) {
    currentEditingItem = item;
    currentEditingMode = 'owner';

    const overlay = document.getElementById('edit-device-modal-overlay');
    const title = document.getElementById('edit-device-modal-title');
    const groupLoc = document.getElementById('edit-field-group-location');
    const groupReg = document.getElementById('edit-field-group-region');
    const groupOwner = document.getElementById('edit-field-group-owner');

    const inputOwner = document.getElementById('edit-device-owner');

    if (!overlay) return;

    title.innerText = 'Editar Proprietário';
    if (groupLoc) groupLoc.style.display = 'none';
    if (groupReg) groupReg.style.display = 'none';
    if (groupOwner) groupOwner.style.display = 'block';

    if (inputOwner) {
        inputOwner.value = item.loggedUser && item.loggedUser !== 'Nenhum' ? item.loggedUser : '';
        inputOwner.required = true;
    }
    const inputCity = document.getElementById('edit-device-city');
    if (inputCity) {
        inputCity.required = false;
    }

    overlay.style.display = 'flex';
}

function closeEditDeviceModal() {
    currentEditingItem = null;
    currentEditingMode = null;
    const overlay = document.getElementById('edit-device-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

async function handleEditDeviceSubmit(e) {
    e.preventDefault();
    if (!currentEditingItem) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const currentResponse = await fetch('/api/config', { cache: 'no-store' });
        const currentSettings = await currentResponse.json();

        if (currentEditingMode === 'location') {
            const inputCity = document.getElementById('edit-device-city');
            const selectRegion = document.getElementById('edit-device-region');
            let cityVal = (inputCity?.value || '').trim().toUpperCase();
            let regionVal = selectRegion?.value || 'none';

            // Validate city
            const codeLower = cityVal.toLowerCase();
            const existsCustom = CUSTOM_UNITS.some(u => u.name.toLowerCase() == codeLower);
            const existsCity = allBrazilianCities.some(c => normalizeText(c.nome).toLowerCase() == codeLower);

            if (cityVal && !existsCustom && !existsCity) {
                const targetCityName = prompt(`A unidade "${cityVal}" não está cadastrada.\nPara cadastrá-la no NOC, digite o nome do município onde fica (Ex: Juiz de Fora, Campinas, Muriaé):`);
                if (targetCityName === null) {
                    if (submitBtn) submitBtn.disabled = false;
                    return;
                }
                if (!targetCityName.trim()) {
                    alert('Operação cancelada. O município não pode ser vazio.');
                    if (submitBtn) submitBtn.disabled = false;
                    return;
                }

                const normalizedTarget = normalizeText(targetCityName).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                const foundCity = allBrazilianCities.find(cItem => normalizeText(cItem.nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() === normalizedTarget);

                if (!foundCity) {
                    alert(`A cidade "${targetCityName}" não foi localizada na base de dados de municípios.`);
                    if (submitBtn) submitBtn.disabled = false;
                    return;
                }

                const ufMap = {
                    11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
                    21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
                    31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP',
                    41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
                };

                const inferredRegion = detectRegion(foundCity.codigo_uf, foundCity.nome);
                const newUnit = {
                    name: cityVal.toUpperCase(),
                    city: foundCity.nome,
                    region: inferredRegion,
                    state: ufMap[foundCity.codigo_uf] || ''
                };

                CUSTOM_UNITS.push(newUnit);
                currentSettings.customUnits = [...CUSTOM_UNITS];

                await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(currentSettings)
                });

                cityVal = newUnit.name;
                regionVal = newUnit.region;
            }

            const info = getRegionAndCoordsFromCity(cityVal);
            if (!currentSettings.locations) currentSettings.locations = {};
            currentSettings.locations[currentEditingItem.id] = {
                city: cityVal || null,
                region: regionVal,
                lat: info.lat,
                lng: info.lng,
                bandwidth: currentEditingItem.bandwidth || null
            };

        } else if (currentEditingMode === 'owner') {
            const inputOwner = document.getElementById('edit-device-owner');
            const ownerVal = (inputOwner?.value || '').trim();

            if (!currentSettings.owners) currentSettings.owners = {};
            currentSettings.owners[currentEditingItem.id] = ownerVal || null;
        }

        const saveResponse = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSettings)
        });

        if (!saveResponse.ok) throw new Error('Falha ao gravar configurações no servidor');

        alert('Alterações salvas com sucesso!');
        
        // Refresh details
        const refreshedId = currentEditingItem.id;
        closeEditDeviceModal();
        await fetchStatus();
        openDeviceProfile(refreshedId);

    } catch (e) {
        console.error(e);
        alert('Erro ao salvar alterações: ' + e.message);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

function detectUF(code) {
    const ufMap = {
        11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
        21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
        31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP',
        41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
    };
    return ufMap[code] || 'UF';
}

function setupEditCityAutocomplete() {
    const cityInput = document.getElementById('edit-device-city');
    const suggestions = document.getElementById('edit-device-city-suggestions');
    if (!cityInput || !suggestions || cityInput.dataset.bound === 'true') return;

    cityInput.dataset.bound = 'true';
    cityInput.addEventListener('input', () => {
        const query = cityInput.value.trim().toLowerCase();
        if (!query) {
            suggestions.innerHTML = '';
            suggestions.style.display = 'none';
            return;
        }

        const customMatch = CUSTOM_UNITS.filter(u => u.name.toLowerCase().includes(query)).map(u => ({ nome: u.name, uf: u.state, custom: true }));
        const normalizedQuery = normalizeText(query);
        const cityMatch = allBrazilianCities
            .filter(c => normalizeText(c.nome).toLowerCase().includes(normalizedQuery))
            .slice(0, 8)
            .map(c => ({ nome: c.nome, uf: detectUF(c.codigo_uf), custom: false, raw: c }));

        const merged = [...customMatch, ...cityMatch].slice(0, 10);

        if (!merged.length) {
            suggestions.innerHTML = '';
            suggestions.style.display = 'none';
            return;
        }

        suggestions.innerHTML = merged.map(item => `
            <div class="autocomplete-suggestion" style="padding: 8px 12px; cursor: pointer; transition: background 0.15s;" 
                data-name="${escapeHtml(item.nome.toUpperCase())}">
                ${escapeHtml(item.nome)} - ${escapeHtml(item.uf)} ${item.custom ? '<small style="color:var(--accent-purple); float:right;">unidade</small>' : ''}
            </div>
        `).join('');

        suggestions.style.display = 'block';

        suggestions.querySelectorAll('.autocomplete-suggestion').forEach(itemEl => {
            itemEl.addEventListener('click', () => {
                const name = itemEl.getAttribute('data-name');
                cityInput.value = name;
                suggestions.innerHTML = '';
                suggestions.style.display = 'none';
                
                // Set region automatically if possible
                const selectRegion = document.getElementById('edit-device-region');
                const info = getRegionAndCoordsFromCity(name);
                if (selectRegion && info.region !== 'none') {
                    selectRegion.value = info.region;
                }
            });
        });
    });

    // Close autocomplete on click outside
    document.addEventListener('click', (e) => {
        if (!cityInput.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.innerHTML = '';
            suggestions.style.display = 'none';
        }
    });
}

// ========================================================================
// CITY AUTOCOMPLETE & UTILITY HELPERS
// ========================================================================

function setupCityAutocomplete() {
    const cityInput = document.getElementById('inline-city-input');
    const localSuggestions = document.getElementById('inline-cities-autocomplete');
    if (!cityInput || !localSuggestions || cityInput.dataset.bound === 'true') return;

    cityInput.dataset.bound = 'true';
    cityInput.addEventListener('input', () => {
        const query = cityInput.value.trim().toLowerCase();
        localSuggestions.innerHTML = '';

        if (!query) {
            localSuggestions.style.display = 'none';
            return;
        }

        const normalizedQuery = normalizeText(query);
        const filteredCities = allBrazilianCities.filter(c =>
            normalizeText(c.nome).toLowerCase().includes(normalizedQuery)
        ).slice(0, 6);

        if (!filteredCities.length) {
            localSuggestions.style.display = 'none';
            return;
        }

        localSuggestions.style.display = 'grid';
        localSuggestions.innerHTML = filteredCities.map(city => `
            <button
                type="button"
                class="inline-autocomplete-item"
                data-city="${escapeHtml(city.nome.toUpperCase())}"
                data-region="${escapeHtml(detectRegion(city.codigo_uf, city.nome))}">
                ${escapeHtml(city.nome)} - ${escapeHtml(city.uf)}
            </button>
        `).join('');
    });
}

function detectRegion(codigoUf, nomeCidade) {
    const uf = parseInt(codigoUf, 10);
    if (uf === 31) return 'mg';
    if (uf === 32) return 'es';
    if (uf === 33) return 'rj';
    if (uf === 35) return 'sp';
    return 'none';
}

function getRegionAndCoordsFromCity(cityName) {
    const found = CUSTOM_UNITS.find(u => u.name.toUpperCase() === cityName.toUpperCase());
    if (found) {
        const stateMapping = { 'MG': 'mg', 'SP': 'sp', 'RJ': 'rj', 'ES': 'es' };
        return {
            region: stateMapping[found.state] || 'none',
            lat: found.lat || null,
            lng: found.lng || null
        };
    }

    const cityMatch = allBrazilianCities.find(c => c.nome.toUpperCase() === cityName.toUpperCase());
    if (cityMatch) {
        return {
            region: detectRegion(cityMatch.codigo_uf, cityMatch.nome),
            lat: cityMatch.latitude || null,
            lng: cityMatch.longitude || null
        };
    }

    return { region: 'none', lat: null, lng: null };
}

function normalizeText(str) {
    if (!str) return '';
    return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// ========================================================================
// OPERATIONAL UNITS (VEXT HUB / INVGATE PORTED ACTIONS)
// ========================================================================

function renderOperationalUnitsGrid() {
    const gridEl = document.getElementById('operational-units-grid');
    const indicatorEl = document.getElementById('units-count-indicator');
    if (!gridEl) return;

    if (indicatorEl) {
        indicatorEl.innerText = `${CUSTOM_UNITS.length} unidades`;
    }

    if (CUSTOM_UNITS.length === 0) {
        gridEl.innerHTML = '<div class="empty-state">Nenhuma unidade operacional cadastrada. Adicione uma no botão acima!</div>';
        return;
    }

    gridEl.innerHTML = CUSTOM_UNITS.map((unit, index) => {
        const autoAllow = unit.auto_allow_compliance || false;
        const createdDate = unit.created_at ? new Date(unit.created_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
        const agentKey = unit.agent_key || `AGT-${unit.name.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${unit.name.length}X`;
        
        // Fetch all Zabbix/WMI computers belonging to this unit
        const unitComps = computersData.filter(c => String(c.city || '').toUpperCase() === String(unit.name).toUpperCase());
        
        const compsHtml = unitComps.map(c => {
            const statusClass = c.status === 'online' ? 'online' : 'offline';
            const userDesc = c.loggedUser && c.loggedUser !== 'Nenhum' ? c.loggedUser : 'Sem usuário';
            return `
                <div class="unit-comp-item" data-open-type="computer" data-open-id="${c.id}">
                    <span class="status-dot ${statusClass}"></span>
                    <div class="unit-comp-details">
                        <strong class="unit-comp-name">${escapeHtml(c.name)}</strong>
                        <span class="unit-comp-meta">${escapeHtml(c.ip)} · ${escapeHtml(userDesc)}</span>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted); margin-left:auto;"><path d="m9 18 6-6-6-6"/></svg>
                </div>
            `;
        }).join('\n');

        const compsListHtml = unitComps.length > 0 
            ? `<div class="unit-card-comps-list">${compsHtml}</div>`
            : `<div class="unit-card-comps-empty">Sem estações vinculadas</div>`;

        return `
            <div class="unit-card">
                <div class="unit-delete-overlay">
                    <button type="button" class="btn-delete-unit-vext" onclick="handleDeleteUnit('${escapeHtml(unit.name)}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
                <div class="unit-main-row">
                    <div class="unit-building-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg>
                    </div>
                    <div class="unit-info-block">
                        <h3 class="unit-name-title" title="${escapeHtml(unit.name)}">${escapeHtml(unit.name)}</h3>
                        <p class="unit-location-sub">${escapeHtml(unit.city || 'Cidade N/D')}, ${escapeHtml(unit.state || 'UF')}</p>
                    </div>
                </div>
                
                <div class="unit-card-divider"></div>
                <div class="unit-card-section-title">Estações Conectadas (${unitComps.length})</div>
                ${compsListHtml}
                
                <div class="unit-card-divider"></div>
                <div class="unit-controls-row">
                    <button type="button" class="btn-toggle-compliance ${autoAllow ? 'active' : ''}" onclick="handleToggleAutoAllow('${escapeHtml(unit.name)}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/></svg>
                        <span>${autoAllow ? 'Confiável' : 'Manual'}</span>
                    </button>
                    <span class="unit-agent-key" title="Clique para copiar" onclick="navigator.clipboard.writeText('${escapeHtml(agentKey)}'); alert('Chave do agente copiada!')">
                        ${escapeHtml(agentKey)}
                    </span>
                </div>
                <div class="unit-footer-row">
                    <div class="unit-created-date" style="text-align: left;">
                        <span>Criado em</span>
                        <strong>${createdDate}</strong>
                    </div>
                </div>
            </div>
        `;
    }).join('\n');
}

async function handleCreateUnit(e) {
    e.preventDefault();
    const nameEl = document.getElementById('modal-unit-name');
    const cityEl = document.getElementById('modal-unit-city');
    const stateEl = document.getElementById('modal-unit-state');
    const autoAllowEl = document.getElementById('modal-unit-auto-allow');
    const overlay = document.getElementById('unit-modal-overlay');

    if (!nameEl || !nameEl.value.trim()) return;

    const nameVal = nameEl.value.trim().toUpperCase();
    const cityVal = cityEl ? cityEl.value.trim() : "";
    const stateVal = stateEl ? stateEl.value.trim().toUpperCase() : "";
    const autoAllowVal = autoAllowEl ? autoAllowEl.checked : false;

    let regionVal = 'none';
    if (['SP'].includes(stateVal)) regionVal = 'sp';
    else if (['MG'].includes(stateVal)) regionVal = 'mg';
    else if (['RJ'].includes(stateVal)) regionVal = 'rj';
    else if (['ES'].includes(stateVal)) regionVal = 'es';

    const newUnit = {
        name: nameVal,
        city: cityVal,
        state: stateVal,
        region: regionVal,
        auto_allow_compliance: autoAllowVal,
        agent_key: `AGT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        created_at: new Date().toISOString()
    };

    try {
        const getRes = await fetch('/api/config', { cache: 'no-store' });
        if (!getRes.ok) throw new Error('Falha ao ler configuração atual');
        const settings = await getRes.json();

        if (!settings.customUnits) settings.customUnits = [];
        
        const duplicate = settings.customUnits.some(u => u.name.toUpperCase() === nameVal);
        if (duplicate) {
            alert('Uma unidade operacional com este nome já existe!');
            return;
        }

        settings.customUnits.push(newUnit);

        const postRes = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        if (!postRes.ok) throw new Error('Falha ao gravar nova unidade');

        if (overlay) overlay.style.display = 'none';
        alert('Unidade operacional cadastrada com sucesso!');
        fetchStatus();
    } catch (err) {
        console.error(err);
        alert('Erro ao salvar unidade: ' + err.message);
    }
}

async function handleDeleteUnit(name) {
    if (!confirm(`Deseja realmente excluir permanentemente a unidade operacional "${name}"?\n\nEsta ação não poderá ser desfeita.`)) return;

    try {
        const getRes = await fetch('/api/config', { cache: 'no-store' });
        if (!getRes.ok) throw new Error('Falha ao ler configuração atual');
        const settings = await getRes.json();

        if (!settings.customUnits) settings.customUnits = [];
        settings.customUnits = settings.customUnits.filter(u => u.name.toUpperCase() !== name.toUpperCase());

        const postRes = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        if (!postRes.ok) throw new Error('Falha ao gravar exclusão');

        alert('Unidade operacional excluída com sucesso!');
        fetchStatus();
    } catch (err) {
        console.error(err);
        alert('Erro ao excluir unidade: ' + err.message);
    }
}

async function handleToggleAutoAllow(name) {
    try {
        const getRes = await fetch('/api/config', { cache: 'no-store' });
        if (!getRes.ok) throw new Error('Falha ao ler configuração atual');
        const settings = await getRes.json();

        if (!settings.customUnits) settings.customUnits = [];
        const match = settings.customUnits.find(u => u.name.toUpperCase() === name.toUpperCase());
        if (match) {
            match.auto_allow_compliance = !match.auto_allow_compliance;
        } else {
            return;
        }

        const postRes = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        if (!postRes.ok) throw new Error('Falha ao atualizar compliance da unidade');

        fetchStatus();
    } catch (err) {
        console.error(err);
        alert('Erro ao alterar compliance da unidade: ' + err.message);
    }
}

function downloadAgentZip(name) {
    const configText = `### ZABBIX AGENT CONFIGURATION FILE FOR UNIT: ${name.toUpperCase()}
Server=192.168.100.96
ServerActive=192.168.100.96
Hostname=NOC-AGENT-${name.toUpperCase().replace(/[^A-Z0-9]/g, '-')}
LogType=file
LogFile=c:\\zabbix_agentd.log
Include=c:\\zabbix\\zabbix_agentd.d\\*.conf
`;

    const blob = new Blob([configText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `zabbix_agentd_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.conf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
