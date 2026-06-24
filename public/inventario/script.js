// NOC Standalone Inventory Panel JS Logic - Focused on Endpoint Assets and Security Compliance
// Glassmorphic design and zero loading gap using LocalStorage caching.

let computersData = [];
let CUSTOM_UNITS = [];
let allBrazilianCities = [];
let selectedComputerId = null;

// Search and pagination state
let inventorySearch = "";
let filterStatus = "all";
let filterSecurity = "all";
let inventoryCurrentPage = 1;
const inventoryMachinesPerPage = 15;
let inventoryTotalPages = 1;

// DOM Elements
const grid = document.getElementById('inventory-grid');
const searchInput = document.getElementById('inventory-search-input');
const statusSelect = document.getElementById('filter-status');
const securitySelect = document.getElementById('filter-security');
const clockEl = document.getElementById('clock');
const sourceIndicator = document.getElementById('source-indicator');
const sourceStatus = document.getElementById('source-status');

// Drawer Elements
const drawerOverlay = document.getElementById('drawer-overlay');
const drawerContainer = document.getElementById('drawer-container');
const drawerCloseBtn = document.getElementById('drawer-close-btn');
const drawerHostName = document.getElementById('drawer-host-name');
const drawerStatusBadge = document.getElementById('drawer-status-badge');
const drawerStatusText = document.getElementById('drawer-status-text');
const drawerMetricGrid = document.getElementById('drawer-metric-grid');
const drawerCityInput = document.getElementById('drawer-city-input');
const drawerRegionSelect = document.getElementById('drawer-region-select');
const drawerQuickPills = document.getElementById('drawer-quick-pills');
const btnSaveLocation = document.getElementById('btn-save-drawer-location');
const suggestionsBox = document.getElementById('cities-autocomplete-suggestions');

// Initialize
window.addEventListener('DOMContentLoaded', init);

function init() {
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
            inventoryCurrentPage = 1;
            renderAll();
        });
    }

    if (statusSelect) {
        statusSelect.addEventListener('change', (e) => {
            filterStatus = e.target.value;
            inventoryCurrentPage = 1;
            renderAll();
        });
    }

    if (securitySelect) {
        securitySelect.addEventListener('change', (e) => {
            filterSecurity = e.target.value;
            inventoryCurrentPage = 1;
            renderAll();
        });
    }

    // Pagination Click delegation
    document.addEventListener('click', (event) => {
        const prevBtn = event.target.closest('#btn-inventory-prev');
        if (prevBtn && !prevBtn.disabled) {
            inventoryCurrentPage = Math.max(1, inventoryCurrentPage - 1);
            renderAll();
            return;
        }

        const nextBtn = event.target.closest('#btn-inventory-next');
        if (nextBtn && !nextBtn.disabled) {
            inventoryCurrentPage = Math.min(inventoryTotalPages, inventoryCurrentPage + 1);
            renderAll();
            return;
        }

        // Click row action
        const rowAction = event.target.closest('[data-open-type="computer"]');
        if (rowAction) {
            event.preventDefault();
            const id = rowAction.getAttribute('data-open-id');
            openDrawer(id);
            return;
        }
    });

    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);
    if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);
    if (btnSaveLocation) btnSaveLocation.addEventListener('click', saveLocation);

    // 3. Autocomplete Setup for Drawer City Input
    setupCityAutocomplete();

    // 4. Fetch initial live data
    fetchStatus();
    fetchCities();

    // 5. Setup refresh loops
    setInterval(updateClock, 1000);
    updateClock();

    setInterval(fetchStatus, 15000);
}

function updateClock() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString('pt-BR') + '  /  ' + now.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short', year: 'numeric'});
}

async function fetchStatus() {
    if (sourceIndicator) {
        sourceIndicator.className = "source-dot ok";
        if (sourceStatus) sourceStatus.innerText = "Atualizando...";
    }
    
    try {
        const response = await fetch('/api/status', { cache: 'no-store' });
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
        const res = await fetch('/municipios.json', { cache: 'no-store' });
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

function filterAndSortComputers() {
    return [...computersData].filter(c => {
        // Search Term
        const haystack = normalizeText(`${c.name} ${c.ip} ${(c.groups || []).join(' ')} ${c.os || ''} ${c.hardware || ''} ${c.serialNumber || ''} ${c.city || ''} ${c.loggedUser || ''} ${c.antivirus || ''}`);
        const matchesSearch = !inventorySearch || haystack.includes(normalizeText(inventorySearch));
        
        // Status Filter
        const matchesStatus = filterStatus === 'all' || c.status === filterStatus;

        // Security Filter
        let matchesSecurity = true;
        if (filterSecurity === 'unprotected') {
            matchesSecurity = !c.antivirus || c.antivirus === 'Nenhum';
        } else if (filterSecurity === 'reboot') {
            matchesSecurity = c.rebootPending === 1;
        } else if (filterSecurity === 'updates') {
            matchesSecurity = c.pendingUpdates > 0;
        }

        return matchesSearch && matchesStatus && matchesSecurity;
    }).sort((a, b) => 
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
    );
}

function renderAll() {
    const filtered = filterAndSortComputers();
    
    // 1. Render Top KPIs
    renderKPIs(filtered);

    // 2. Render Unit Cards
    renderUnitCards(filtered);
}

function renderKPIs(filtered) {
    const totalEl = document.getElementById('kpi-total-machines');
    const activeEl = document.getElementById('kpi-active-machines');
    const rebootEl = document.getElementById('kpi-reboot-pending');
    const updatesEl = document.getElementById('kpi-updates-pending');
    const avEl = document.getElementById('kpi-no-antivirus');

    if (totalEl) totalEl.innerText = computersData.length;
    if (activeEl) activeEl.innerText = computersData.filter(c => c.status === 'online').length;
    if (rebootEl) rebootEl.innerText = computersData.filter(c => c.rebootPending === 1).length;
    if (updatesEl) updatesEl.innerText = computersData.filter(c => c.pendingUpdates > 0).length;
    if (avEl) {
        avEl.innerText = computersData.filter(c => !c.antivirus || c.antivirus === 'Nenhum').length;
    }
}

function renderUnitCards(filtered) {
    if (!grid) return;

    if (!filtered.length) {
        grid.innerHTML = '<div class="empty-state">Nenhuma máquina corresponde aos filtros atuais.</div>';
        return;
    }

    // Agrupar por unidade (c.city ou 'Não Definidas')
    const groups = {};
    filtered.forEach(c => {
        const unit = c.city || 'Não Definidas';
        if (!groups[unit]) {
            groups[unit] = [];
        }
        groups[unit].push(c);
    });

    // Ordenar as unidades (Não Definidas no final)
    const sortedUnits = Object.keys(groups).sort((a, b) => {
        if (a === 'Não Definidas') return 1;
        if (b === 'Não Definidas') return -1;
        return a.localeCompare(b, 'pt-BR');
    });

    let cardsHtml = `<div class="unit-cards-grid">`;
    cardsHtml += sortedUnits.map(unit => {
        const comps = groups[unit];
        const onlineCount = comps.filter(c => c.status === 'online').length;
        const totalCount = comps.length;

        // Tentar obter a UF da unidade a partir do CUSTOM_UNITS
        const foundUnit = CUSTOM_UNITS.find(u => u.name.toUpperCase() === unit.toUpperCase());
        const stateText = foundUnit && foundUnit.state ? ` (${foundUnit.state.toUpperCase()})` : '';

        const titleText = `📍 ${unit}${stateText}`;
        const kpiText = `${onlineCount}/${totalCount} Online`;
        const kpiClass = onlineCount < totalCount ? 'unit-card-kpi warning' : 'unit-card-kpi';

        const itemsHtml = comps.map(c => {
            const statusClass = c.status === 'online' ? 'online' : 'offline';

            // Montar micro badges de segurança e conformidade
            let badges = [];
            if (c.antivirus && c.antivirus !== 'Nenhum') {
                badges.push(`<span class="micro-badge secure" title="Antivírus: ${escapeHtml(c.antivirus)}">🛡️ ${escapeHtml(c.antivirus)}</span>`);
            } else if (c.os && c.os.toLowerCase().includes('windows')) {
                badges.push(`<span class="micro-badge danger" title="Sem antivírus ativo">⚠️ Sem Defesa</span>`);
            }
            if (c.rebootPending === 1) {
                badges.push(`<span class="micro-badge warning" title="Reinicialização Requerida">🔄 Reiniciar</span>`);
            }
            if (c.pendingUpdates > 0) {
                const updatesClass = c.pendingUpdates > 15 ? 'danger' : 'info';
                badges.push(`<span class="micro-badge ${updatesClass}">📦 ${c.pendingUpdates} Upd</span>`);
            }

            const badgesMarkup = badges.length > 0
                ? `<div class="computer-item-badges">${badges.join('')}</div>`
                : '';

            const userDesc = c.loggedUser && c.loggedUser !== 'Nenhum' ? escapeHtml(c.loggedUser) : 'Ninguém logado';

            return `
                <div class="computer-item" data-open-type="computer" data-open-id="${escapeHtml(c.id)}">
                    <div class="computer-item-left">
                        <span class="computer-item-status-dot ${statusClass}" title="Agente: ${c.status === 'online' ? 'Online' : 'Offline'}"></span>
                        <div class="computer-item-identity">
                            <span class="computer-item-name">${escapeHtml(c.name)}</span>
                            <span class="computer-item-desc">${escapeHtml(c.ip)} | ${userDesc}</span>
                        </div>
                    </div>
                    <div class="computer-item-right">
                        ${badgesMarkup}
                        <button class="computer-item-action" title="Ver Detalhes">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('\n');

        return `
            <div class="unit-card">
                <div class="unit-card-header">
                    <div class="unit-card-title">${escapeHtml(titleText)}</div>
                    <div class="${kpiClass}">${kpiText}</div>
                </div>
                <div class="unit-card-body">
                    ${itemsHtml}
                </div>
            </div>
        `;
    }).join('\n');

    cardsHtml += `</div>`;
    grid.innerHTML = cardsHtml;
}


// DETAILS DRAWER LOGIC
// ========================================================================

function openDrawer(id) {
    const item = computersData.find(c => c.id === id);
    if (!item) return;

    selectedComputerId = id;
    
    // Title & status badge
    if (drawerHostName) drawerHostName.innerText = item.name;
    if (drawerStatusText) drawerStatusText.innerText = item.status === 'online' ? 'Online' : 'Offline';
    if (drawerStatusBadge) drawerStatusBadge.className = `state-badge ${item.status}`;

    // Populate structured details
    const setEl = (elementId, val) => {
        const el = document.getElementById(elementId);
        if (el) el.innerText = val || 'N/D';
    };

    const cpuText = item.hardware ? item.hardware.replace(/\s+/g, ' ').trim() : 'N/D';
    const moboText = `${item.vendor || ''} ${item.model || ''}`.replace(/\s+/g, ' ').trim() || 'N/D';
    const userDesc = (item.loggedUser && item.loggedUser !== 'Nenhum') ? item.loggedUser : 'Ninguém logado';
    const osText = item.hwArch ? `${item.os || 'Windows'} (${item.hwArch})` : (item.os || 'N/D');

    setEl('detail-ip', item.ip);
    setEl('detail-user', userDesc);
    setEl('detail-mac', item.macAddress);
    setEl('detail-serial', item.serialNumber);
    setEl('detail-os', osText);
    setEl('detail-cpu', cpuText);
    setEl('detail-ram', item.ram);
    setEl('detail-disk', item.disk);
    setEl('detail-motherboard', moboText);
    setEl('detail-antivirus', item.antivirus || 'Nenhum');
    setEl('detail-updates', item.pendingUpdates !== undefined ? `${item.pendingUpdates} patches` : 'Sem dados');
    setEl('detail-reboot', item.rebootPending === 1 ? '🔄 Reinício Pendente' : '✅ Em dia');
    setEl('detail-connection', item.status === 'online' ? '🟢 Conectado' : '🔴 Desconectado');

    // Populate Location Inputs
    if (drawerCityInput) drawerCityInput.value = item.city || '';
    if (drawerRegionSelect) drawerRegionSelect.value = item.customRegion || 'none';

    // Populate Quick pills
    renderDrawerQuickPills();

    // Show Drawer
    if (drawerOverlay) drawerOverlay.classList.add('active');
    if (drawerContainer) drawerContainer.classList.add('active');
}

function closeDrawer() {
    selectedComputerId = null;
    if (drawerOverlay) drawerOverlay.classList.remove('active');
    if (drawerContainer) drawerContainer.classList.remove('active');
    if (suggestionsBox) suggestionsBox.style.display = 'none';
}

function renderDrawerQuickPills() {
    if (!drawerQuickPills) return;
    const validUnits = CUSTOM_UNITS.filter(u => u.name && u.region);
    
    if (validUnits.length === 0) {
        drawerQuickPills.style.display = 'none';
        return;
    }

    drawerQuickPills.style.display = 'flex';
    drawerQuickPills.innerHTML = `
        <span style="color: var(--muted); font-size: 11px; align-self: center; margin-right: 4px;">Sugestões:</span>
        ${validUnits.map(unit => `
            <span class="quick-unit-pill" data-unit="${escapeHtml(unit.name)}" data-region="${escapeHtml(unit.region)}">${escapeHtml(unit.name)}</span>
        `).join('')}
    `;

    // Click handler for pills
    drawerQuickPills.querySelectorAll('.quick-unit-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            if (drawerCityInput) drawerCityInput.value = e.target.getAttribute('data-unit');
            if (drawerRegionSelect) drawerRegionSelect.value = e.target.getAttribute('data-region');
        });
    });
}

async function saveLocation() {
    const item = computersData.find(c => c.id === selectedComputerId);
    if (!item) return;

    let cityVal = (drawerCityInput?.value || '').trim().toUpperCase();
    let regionVal = drawerRegionSelect?.value || 'none';

    if (btnSaveLocation) btnSaveLocation.disabled = true;

    try {
        const codeLower = cityVal.toLowerCase();
        const existsCustom = CUSTOM_UNITS.some(u => u.name.toLowerCase() === codeLower);
        const existsCity = allBrazilianCities.some(c => normalizeText(c.nome).toLowerCase() === codeLower);

        // Se a unidade digitada não existir nos cadastros, perguntar ao usuário
        if (cityVal && !existsCustom && !existsCity) {
            const targetCityName = prompt(`A unidade "${cityVal}" não está cadastrada.\nPara cadastrá-la no NOC, digite o nome do município onde fica (Ex: Juiz de Fora, Campinas, Muriaé):`);
            if (targetCityName === null) {
                if (btnSaveLocation) btnSaveLocation.disabled = false;
                return; // cancelou
            }
            if (!targetCityName.trim()) {
                alert("Operação cancelada. O município não pode ser vazio.");
                if (btnSaveLocation) btnSaveLocation.disabled = false;
                return;
            }

            const normalizedTarget = normalizeText(targetCityName).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
            const foundCity = allBrazilianCities.find(cItem => {
                const itemNormalized = normalizeText(cItem.nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                return itemNormalized === normalizedTarget;
            });

            if (!foundCity) {
                alert(`A cidade "${targetCityName}" não foi localizada na base de dados de municípios.`);
                if (btnSaveLocation) btnSaveLocation.disabled = false;
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

            // Adicionar localmente e sincronizar com configurações globais
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
            if (drawerCityInput) drawerCityInput.value = newUnit.name;
            if (drawerRegionSelect) drawerRegionSelect.value = newUnit.region;
        }

        // Buscar coordenadas da cidade ativa
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
        closeDrawer();
        fetchStatus();
    } catch (e) {
        console.error(e);
        alert('Erro ao salvar localização: ' + e.message);
    } finally {
        if (btnSaveLocation) btnSaveLocation.disabled = false;
    }
}

// ========================================================================
// CITY AUTOCOMPLETE & UTILITY HELPERS
// ========================================================================

function setupCityAutocomplete() {
    if (!drawerCityInput || !suggestionsBox) return;

    drawerCityInput.addEventListener('input', () => {
        const query = drawerCityInput.value.trim().toLowerCase();
        suggestionsBox.innerHTML = '';

        if (!query) {
            suggestionsBox.style.display = 'none';
            return;
        }

        const normalizedQuery = normalizeText(query);
        const filteredCities = allBrazilianCities.filter(c => 
            normalizeText(c.nome).toLowerCase().includes(normalizedQuery)
        ).slice(0, 5);

        if (filteredCities.length === 0) {
            suggestionsBox.style.display = 'none';
            return;
        }

        suggestionsBox.style.display = 'block';
        filteredCities.forEach(city => {
            const div = document.createElement('div');
            div.className = 'autocomplete-suggestion-item';
            div.innerText = `${city.nome} - ${city.uf}`;
            div.addEventListener('click', () => {
                drawerCityInput.value = city.nome.toUpperCase();
                suggestionsBox.style.display = 'none';
                
                // Autoselect region if possible
                const region = detectRegion(city.codigo_uf, city.nome);
                if (drawerRegionSelect) drawerRegionSelect.value = region;
            });
            suggestionsBox.appendChild(div);
        });
    });

    document.addEventListener('click', (e) => {
        if (e.target !== drawerCityInput) {
            suggestionsBox.style.display = 'none';
        }
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
