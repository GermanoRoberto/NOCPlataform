const REFRESH_MAX = 12;

let printersData = [];
let linksData = [];
let incidentsData = [];
let recommendationsData = [];
let recentExchangesList = [];
let summaryData = {};
let metaData = {};

let previousTonerLevels = {};
let previousWasteLevels = {};
let alertedExchangeIds = new Set();
let alertedExchangeIdsBootstrapped = false;
let selectedItemId = null;
let selectedType = null;
let searchFilter = '';
let statusFilter = 'all';
let dashboardSearch = '';
let dashboardRegion = 'all';
let dashboardStatus = 'all';
let linksSearch = '';
let linksRegion = 'all';
let linksStatus = 'all';
let printersSearch = '';
let printersRegion = 'all';
let printersStatus = 'all';
let sreSearch = '';
let inventorySearch = '';
let inventoryCurrentPage = 1;
const inventoryMachinesPerPage = 15;
let inventoryTotalPages = 1;
let computersData = [];
let CUSTOM_UNITS = [];
let sreSeverity = 'all';
let sreType = 'all';
let sreMutedAssets = JSON.parse(localStorage.getItem('sre-muted-assets') || '[]');
let soundEnabled = true;
let refreshCountdown = REFRESH_MAX;
let refreshIntervalTimer = null;
let currentDiagnosticReport = null;
let currentDiagnosticSummary = null;
let cortexChatHistory = [];
let previousLinkStatuses = new Map();
let voiceAlertsInitialized = false;
let spotlightActiveIndex = -1;
let spotlightFilteredItems = [];

let chartDemand = null;
let chartTopLinks = null;
let chartPrints = null;
let chartDemandMini = null;
let chartResourcesMini = null;
let demandHistoryLabels = [];
let demandHistoryLatency = [];
let demandHistoryTraffic = [];
let resourcesHistoryCpu = [];

const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

function renderIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatNumber(value, decimals = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '--';
    return parsed.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatPercent(value, decimals = 1) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '--';
    return `${formatNumber(parsed, decimals)}%`;
}

function formatDateTime(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function normalizeText(value) {
    return String(value ?? '').toLowerCase();
}

let allBrazilianCities = [];
const MG_SUL_CITIES = ['varginha', 'pouso alegre', 'pocos de caldas', 'extrema', 'itajuba', 'lavras', 'alfenas', 'tres coracoes', 'passos', 'maxxtelecom', 'turbonet'];
const MG_BH_CITIES = ['belo horizonte', 'contagem', 'betim', 'sabara', 'ribeirao das neves', 'santa luzia', 'vespasiano', 'ibitirite', 'nova lima'];

function detectRegion(codigoUf, cityName) {
    const uf = Number(codigoUf);
    
    if (uf === 33) return 'rj'; // Rio de Janeiro
    if (uf === 35) return 'sp'; // São Paulo
    if (uf === 32) return 'es'; // Espírito Santo
    if (uf === 31) return 'mg'; // Minas Gerais
    
    return 'none';
}

function getRegionFromCity(cityName) {
    const c = normalizeText(cityName).trim().toLowerCase();
    if (!c) return 'none';

    // 1. Tenta buscar nas unidades customizadas primeiro (ex: CPQ, JDF, MTZ)
    const customMatch = CUSTOM_UNITS.find(unit => 
        unit.name.toLowerCase() === c || 
        normalizeText(unit.city) === c
    );
    if (customMatch) {
        return customMatch.region;
    }

    // 2. Tenta buscar na base de dados de cidades (removendo acentos para robustez)
    const normalizedInput = cityName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const match = allBrazilianCities.find(item => {
        const itemCityNormalized = normalizeText(item.nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return itemCityNormalized === normalizedInput || itemCityNormalized.includes(normalizedInput) || normalizedInput.includes(itemCityNormalized);
    });

    if (match) {
        return detectRegion(match.codigo_uf, match.nome);
    }

    // 3. Fallback heurístico para siglas/termos avulsos
    if (c.includes('friburgo') || c.includes('petropolis') || c.includes('rio') || c.includes('rj') || c.includes('alta rede') || c.includes('mundivox')) {
        return 'rj';
    }
    if (
        c.includes('mata') || c.includes('manhuacu') || c.includes('leopoldina') || c.includes('muriae') || c.includes('uba') || 
        c.includes('cataguases') || c.includes('carangola') || c.includes('vrb') || c.includes('ponte nova') || c.includes('vicosa') || 
        c.includes('juiz de fora') || c.includes('jdf') || c.includes('matriz') || c.includes('mtz') || c.includes('gigalink') ||
        c.includes('belo') || c.includes('horizonte') || c.includes('contagem') || c.includes('betim') || c.includes('bhz') || c.includes('central') ||
        c.includes('varginha') || c.includes('vga') || c.includes('pouso') || c.includes('ppy') || c.includes('sul') || c.includes('pocos') || 
        c.includes('itajuba') || c.includes('lavras') || c.includes('alfenas') || c.includes('passos') || c.includes('coracoes') || 
        c.includes('maxxtelecom') || c.includes('turbonet') || c.includes('uberlandia') || c.includes('udi') || c.includes('mg')
    ) {
        return 'mg';
    }
    if (c.includes('sao') || c.includes('paulo') || c.includes('spo') || c.includes('campinas') || c.includes('cpq') || c.includes('algar') || c.includes('sitel') || c.includes('avato') || c.includes('oscar') || c.includes('santos')) {
        return 'sp';
    }
    if (c.includes('vitoria') || c.includes('vix') || c.includes('espirito') || c.includes('santo') || c.includes('es') || c.includes('serra') || c.includes('velha') || c.includes('cariacica') || c.includes('dinamica') || c.includes('nwt')) {
        return 'es';
    }
    return 'none';
}

function getRegionAndCoordsFromCity(cityName) {
    const c = normalizeText(cityName).trim().toLowerCase();
    if (!c) return { region: 'none', lat: null, lng: null };

    // 1. Tenta verificar se é uma unidade customizada
    const customMatch = CUSTOM_UNITS.find(unit => 
        unit.name.toLowerCase() === c || 
        normalizeText(unit.city) === c
    );

    let lookupName = cityName;
    if (customMatch) {
        lookupName = customMatch.city;
    }

    const normalizedInput = normalizeText(lookupName).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const match = allBrazilianCities.find(item => {
        const itemCityNormalized = normalizeText(item.nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return itemCityNormalized === normalizedInput;
    });

    if (match) {
        const region = customMatch ? customMatch.region : detectRegion(match.codigo_uf, match.nome);
        return {
            region,
            lat: match.latitude,
            lng: match.longitude
        };
    }

    return {
        region: getRegionFromCity(cityName),
        lat: null,
        lng: null
    };
}

function getLinkRegion(link) {
    if (link.customRegion && link.customRegion !== 'none') {
        return link.customRegion;
    }
    const n = normalizeText(link.name);
    if (
        n.includes('mtz') || n.includes('jdf') || n.includes('gigalink') || n.includes('fbr') || n.includes('sankhya') || n.includes('pluri') ||
        n.includes('bhz') || n.includes('century') ||
        n.includes('vga') || n.includes('ppy') || n.includes('maxxtelecom') || n.includes('turbonet') ||
        n.includes('udi') || n.includes('uberlandia')
    ) {
        return 'mg';
    }
    if (n.includes('spo') || n.includes('cpq') || n.includes('algar') || n.includes('sitel') || n.includes('avato')) {
        return 'sp';
    }
    if (n.includes('rio') || n.includes('ptr') || n.includes('americanet') || n.includes('mundivox') || n.includes('vero') || n.includes('friburgo') || n.includes('alta rede')) {
        return 'rj';
    }
    if (n.includes('vix') || n.includes('dinamica') || n.includes('nwt')) {
        return 'es';
    }
    return 'other';
}

function generateSparkline(history, statusClass) {
    if (!Array.isArray(history) || history.length === 0) {
        return `<svg class="sparkline empty" viewBox="0 0 50 16" width="50" height="16">
            <line x1="0" y1="8" x2="50" y2="8" stroke="rgba(116, 137, 160, 0.2)" stroke-width="1.5" stroke-dasharray="2 2" />
        </svg>`;
    }
    
    const padding = 1;
    const w = 50;
    const h = 16;
    
    let maxVal = Math.max(...history);
    let minVal = Math.min(...history);
    if (maxVal === minVal) {
        maxVal += 10;
        minVal = Math.max(0, minVal - 10);
    }
    
    const points = [];
    const len = history.length;
    for (let i = 0; i < len; i++) {
        const val = history[i];
        const x = len > 1 ? (i / (len - 1)) * (w - 2 * padding) + padding : w / 2;
        const y = h - padding - ((val - minVal) / (maxVal - minVal)) * (h - 2 * padding);
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    
    let strokeColor = 'var(--green)';
    if (statusClass === 'critical' || statusClass === 'offline' || statusClass === 'danger') {
        strokeColor = 'var(--red)';
    } else if (statusClass === 'high' || statusClass === 'warning' || statusClass === 'warn' || statusClass === 'medium') {
        strokeColor = 'var(--amber)';
    }
    
    const pathData = `M ${points.join(' L ')}`;
    const areaPathData = `${pathData} L ${points[points.length - 1].split(',')[0]},${h} L ${points[0].split(',')[0]},${h} Z`;
    
    const gradId = `spark-grad-${Math.random().toString(36).substring(2, 6)}`;
    
    return `<svg class="sparkline" viewBox="0 0 50 16" width="50" height="16" style="vertical-align: middle;">
        <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.25" />
                <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0" />
            </linearGradient>
        </defs>
        <path d="${areaPathData}" fill="url(#${gradId})" />
        <path d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`;
}

function statusLabel(status) {
    return {
        online: 'Online',
        warning: 'Atenção',
        offline: 'Fora'
    }[status] || 'Desconhecido';
}

function formatDurationJs(ms) {
    if (!ms || isNaN(ms) || ms < 0) return '0s';
    const totalSecs = Math.floor(ms / 1000);
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
}

function linkValidationLabel(link) {
    const c = link?.connectivity;
    if (!c) return 'Monitorando';
    if (link.status === 'offline') {
        if (c.downStartedAt) {
            const ms = Date.now() - new Date(c.downStartedAt).getTime();
            return `Queda confirmada (${formatDurationJs(ms)})`;
        }
        return 'Queda confirmada';
    }
    if (c.downCandidate) {
        return `Validando queda ${c.downStreak}/${c.downConfirmations}`;
    }
    if (c.upCandidate && c.upStreak > 0) {
        return `Estável ${c.upStreak}/${c.upConfirmations}`;
    }
    return 'Monitorando';
}

function severityLabel(severity) {
    return {
        critical: 'Crítico',
        high: 'Alto',
        medium: 'Médio',
        low: 'Baixo',
        nominal: 'Nominal'
    }[severity] || 'Nominal';
}

function severityClass(severity) {
    if (severity === 'critical') return 'critical';
    if (severity === 'high') return 'high';
    if (severity === 'medium') return 'medium';
    if (severity === 'low') return 'low';
    return 'nominal';
}

function priorityClass(priority) {
    return normalizeText(priority).replace('p', 'p') || 'info';
}

function progressClass(value, dangerAt, warnAt) {
    const parsed = Number(value) || 0;
    if (parsed >= dangerAt) return 'danger';
    if (parsed >= warnAt) return 'warn';
    return '';
}

function progressMarkup(value, dangerAt = 90, warnAt = 75) {
    const parsed = Math.max(0, Math.min(100, Number(value) || 0));
    return `<div class="progress"><span class="${progressClass(parsed, dangerAt, warnAt)}" style="width:${parsed}%"></span></div>`;
}

function routerAccessButton(link, className = 'text-btn') {
    const access = link?.routerAccess || {};
    if (access.enabled && access.url) {
        return `<a class="${className} router-link" href="${escapeHtml(access.url)}" target="_blank" rel="noopener noreferrer" title="Abrir acesso externo do roteador">Acesso roteador</a>`;
    }
    return `<span class="router-access-pending" title="Acesso externo ainda não configurado">Acesso pendente</span>`;
}

function deviceBySelection() {
    if (!selectedItemId || !selectedType) return null;
    let collection;
    if (selectedType === 'printer') collection = printersData;
    else if (selectedType === 'link') collection = linksData;
    else if (selectedType === 'computer') collection = computersData;
    return (collection || []).find(item => String(item.id) === String(selectedItemId)) || null;
}

function getFilteredDevices(devices) {
    return devices.filter(device => {
        const haystack = normalizeText(`${device.name} ${device.ip} ${device.serialNumber || ''}`);
        const matchesSearch = !searchFilter || haystack.includes(normalizeText(searchFilter));
        const matchesStatus = statusFilter === 'all' || device.status === statusFilter;
        return matchesSearch && matchesStatus;
    });
}

function setText(selector, value) {
    const el = qs(selector);
    if (el) el.textContent = value;
}

function setWidth(selector, value) {
    const el = qs(selector);
    if (!el) return;
    const parsed = Math.max(0, Math.min(100, Number(value) || 0));
    el.style.width = `${parsed}%`;
}

function setupModuleHeaders() {
    const modules = {
        'tab-links': {
            kicker: 'Network Entity Explorer',
            metrics: [
                ['Escopo', 'module-links-total', '--'],
                ['Online', 'module-links-online', '--'],
                ['Alerta', 'module-links-warning', '--'],
                ['Drilldown', null, 'Drawer']
            ]
        },
        'tab-inventory': {
            kicker: 'Asset Inventory Explorer',
            metrics: [
                ['Ativos', 'module-inventory-total', '--'],
                ['Unidades', 'module-inventory-units', '--'],
                ['Agente', 'module-inventory-agent', 'Zabbix'],
                ['Acao', null, 'Detalhar']
            ]
        },
        'tab-printers': {
            kicker: 'Print Operations',
            metrics: [
                ['Online', 'module-printers-online', '--'],
                ['Atencao', 'module-printers-warning', '--'],
                ['Toner medio', 'module-printers-toner', '--'],
                ['Acao', null, 'Suprimentos']
            ]
        },
        'tab-sre': {
            kicker: 'SRE / AIOps Workbench',
            metrics: [
                ['Sinais', 'module-sre-total', '--'],
                ['Links', 'module-sre-links', '--'],
                ['Impressoras', 'module-sre-printers', '--'],
                ['Cortex', null, 'Chat']
            ]
        },
        'tab-reports': {
            kicker: 'Service Level Reports',
            metrics: [
                ['Uptime', 'module-reports-uptime', '--'],
                ['Latencia', 'module-reports-latency', '--'],
                ['Periodo', null, '24h / 7d / 30d'],
                ['Saida', null, 'PDF / Texto']
            ]
        },
        'tab-infra': {
            kicker: 'Infrastructure Health',
            metrics: [
                ['Conformidade', 'module-infra-compliance', '--'],
                ['Servidores', 'module-infra-servers', '--'],
                ['Zabbix', null, 'Auditoria'],
                ['Acao', null, 'Simular']
            ]
        },
        'tab-history': {
            kicker: 'Incident Timeline',
            metrics: [
                ['Quedas', 'module-history-total', '--'],
                ['Ativos', 'module-history-active', '--'],
                ['Media', 'module-history-avg', '--'],
                ['Exportacao', null, 'CSV']
            ]
        },
        'tab-settings': {
            kicker: 'Operations Control Plane',
            metrics: [
                ['Thresholds', null, '7'],
                ['Zabbix', null, 'API'],
                ['Telegram', null, 'Bot'],
                ['Acesso', null, 'Router']
            ]
        }
    };

    Object.entries(modules).forEach(([tabId, config]) => {
        const heading = qs(`#${tabId} > .section-heading`);
        if (!heading || heading.dataset.moduleReady === 'true') return;

        heading.classList.add('module-hero');

        const kicker = document.createElement('span');
        kicker.className = 'module-kicker';
        kicker.textContent = config.kicker;
        heading.prepend(kicker);

        const metrics = document.createElement('div');
        metrics.className = 'module-metrics';
        metrics.innerHTML = config.metrics.map(([label, id, value]) => {
            const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
            return `<div><span>${escapeHtml(label)}</span><strong${idAttr}>${escapeHtml(value)}</strong></div>`;
        }).join('');
        heading.appendChild(metrics);

        heading.dataset.moduleReady = 'true';
    });
}

function playExchangeChime() {
    if (!soundEnabled) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.14, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

        [659.25, 987.77, 1318.51].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            osc.type = idx === 1 ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + (idx * 0.08));
            osc.connect(gain);
            osc.start(ctx.currentTime + (idx * 0.08));
            osc.stop(ctx.currentTime + 0.5);
        });

        gain.connect(ctx.destination);
    } catch (e) {
        console.error('Audio alert failed:', e);
    }
}

async function fetchStatus(silent = false) {
    try {
        const response = await fetch('/api/status', { cache: 'no-store' });
        if (!response.ok) throw new Error('Falha ao comunicar com a API de status');
        const data = await response.json();

        printersData = data.printers || [];
        linksData = (data.links || []).filter(link => String(link.name || '').toUpperCase() !== 'PE0AWYRM');
        computersData = data.computers || [];
        try {
            localStorage.setItem('noc-inventory-cache', JSON.stringify(computersData));
        } catch (e) {
            console.error('Failed to cache inventory data:', e);
        }
        incidentsData = data.incidents || [];
        recommendationsData = data.recommendations || [];
        recentExchangesList = data.exchanges || [];
        summaryData = data.summary || {};
        metaData = data.meta || {};
        window.aiopsDataPayload = data.aiops || {};

        if (metaData.customUnits && Array.isArray(metaData.customUnits)) {
            CUSTOM_UNITS = metaData.customUnits;
            renderQuickPills();
        }

        updateMetricsBanner(summaryData);
        updateFreshness(metaData);
        renderIncidentsTable();
        renderCockpitIncidents();
        renderRecommendations();
        renderDashboardLinks();
        renderLinksGrid();
        renderPrintersGrid();
        renderInventoryGrid();
        renderSreOverviewTab();
        renderExchangesLogs();
        renderCockpitTopLinks();
        renderCockpitComputers();
        checkForTonerChanges(printersData, recentExchangesList);
        updateChartsData(summaryData);
        checkVoiceAlerts(linksData);


        if (selectedItemId) updateDrawerContent();
        renderIcons();
        loadTelegramStatus();
    } catch (e) {
        if (!silent) console.error(e);
        setSourceState('danger', 'Falha de coleta', e.message);
    }
}

function setSourceState(state, label, detail) {
    const dot = qs('#source-dot');
    if (dot) dot.className = `source-dot ${state}`;
    setText('#source-label', label);
    setText('#source-detail', detail);
}

function updateFreshness(meta) {
    const source = meta.source === 'zabbix' ? 'Zabbix' : 'Simulação local';
    const mode = meta.mode === 'simulation-forced' ? 'Simulação forçada' : source;
    const state = meta.source === 'zabbix' ? 'ok' : 'warn';
    const duration = Number.isFinite(Number(meta.collectionDurationMs)) ? `${meta.collectionDurationMs} ms` : '--';

    const isSim = meta.source === 'simulation' || meta.source === 'simulation-forced' || meta.mode === 'simulation-forced';
    const banner = qs('#contingency-banner');
    if (banner) {
        banner.hidden = !isSim;
    }

    setSourceState(state, source, meta.zabbixConfigured ? `Tempo real · ${duration}` : 'Sem credenciais ativas');
    setText('#last-sync', formatDateTime(meta.generatedAt));
    setText('#collection-mode', `${mode} · ${duration}`);
    setText('#threshold-summary', `Toner ${meta.thresholds?.toner ?? 15}% / Latência ${meta.thresholds?.latency ?? 120}ms`);
    setText('#settings-runtime-state', mode);
    setText('#settings-runtime-detail', meta.zabbixConfigured ? `Coleta em tempo real concluída em ${duration}.` : 'Usando simulação por falta de configuração.');
}

function getLatencyScore(avgLatency, threshold = 120) {
    const L = Number(avgLatency) || 0;
    if (L <= 20) return 100;
    if (L >= threshold) return 10;
    return 100 - ((L - 20) / (threshold - 20)) * 90;
}

function getLossScore(avgPacketLoss) {
    const loss = Number(avgPacketLoss) || 0;
    if (loss <= 0) return 100;
    if (loss >= 5) return 10;
    return 100 - (loss / 5) * 90;
}

function getCapacityScore(usedPct) {
    const u = Number(usedPct) || 0;
    if (u <= 50) return 100;
    if (u >= 100) return 10;
    return 100 - ((u - 50) / 50) * 90;
}

function getCpuScore(avgCpu) {
    if (avgCpu === undefined || avgCpu === null) return 100;
    const cpu = Number(avgCpu);
    if (cpu <= 30) return 100;
    if (cpu >= 90) return 10;
    return 100 - ((cpu - 30) / 60) * 90;
}

function updateMetricsBanner(summary) {
    const operationalState = {
        stable: 'Operação estável',
        degraded: 'Operação degradada',
        critical: 'Incidente crítico ativo'
    }[summary.operationalState] || 'Aguardando dados';

    const healthScore = Number(summary.healthScore ?? 0);
    const scoreRing = qs('#ops-score-ring');
    if (scoreRing) scoreRing.style.setProperty('--score', Math.max(0, Math.min(100, healthScore)));

    setText('#ops-state-title', operationalState);
    setText(
        '#ops-state-detail',
        summary.operationalState === 'critical'
            ? 'Há P1 ativo confirmado. Priorize recuperação e comunicação operacional.'
            : summary.operationalState === 'degraded'
                ? 'Ambiente disponível, com riscos e degradações em acompanhamento.'
                : 'Ambiente nominal, links e ativos sem incidente crítico.'
    );
    setText('#ops-score-value', summary.healthScore ?? '--');
    setText('#ops-board-timestamp', metaData.generatedAt ? formatDateTime(metaData.generatedAt) : '--');
    setText('#ops-availability', formatPercent(summary.availabilityScore ?? 0, 1));
    setText('#ops-links', `${summary.onlineLinks || 0}/${summary.totalLinks || 0}`);
    setText('#ops-printers', `${summary.onlinePrinters || 0}/${summary.totalPrinters || 0}`);
    setText('#ops-validation', '100/0');
    setText('#ops-p1', String(summary.criticalIncidents || 0));
    setText('#ops-p2', String(summary.highIncidents || 0));
    setText('#ops-p3', String(summary.mediumIncidents || 0));
    setText('#ops-printer-warning', String((summary.warningPrinters || 0) + (summary.offlinePrinters || 0)));
    setText('#ops-toner-average', `${summary.avgToner || 0}%`);

    const allLinks = Array.isArray(linksData) ? linksData : [];
    const allPrinters = Array.isArray(printersData) ? printersData : [];
    const allComputers = Array.isArray(computersData) ? computersData : [];
    const linksWarning = (summary.warningLinks || 0) + (summary.offlineLinks || 0);
    const printerWarning = (summary.warningPrinters || 0) + (summary.offlinePrinters || 0);
    const actionableSreDevices = [
        ...allLinks.map(item => ({ ...item, type: 'link' })),
        ...allPrinters.map(item => ({ ...item, type: 'printer' }))
    ]
        .filter(device => !normalizeText(device.name).includes('draytek'))
        .filter(hasActionableSreSignal);
    const inventoryUnits = new Set(
        allComputers
            .map(item => item.unit || item.location || item.city || item.group)
            .filter(Boolean)
    ).size;
    const onlineComputers = allComputers.filter(item => {
        const status = normalizeText(item.status || item.agentStatus || item.availability);
        return ['online', 'available', 'up', 'ativo'].includes(status);
    }).length;
    const platformAssetTotal = (summary.totalLinks || allLinks.length || 0) +
        (summary.totalPrinters || allPrinters.length || 0) +
        allComputers.length;
    const infraState = summary.operationalState === 'critical'
        ? 'Critico'
        : summary.operationalState === 'degraded'
            ? 'Atencao'
            : 'OK';

    setText('#platform-links', `${summary.onlineLinks || 0}/${summary.totalLinks || allLinks.length || 0}`);
    setText('#platform-printers', `${summary.onlinePrinters || 0}/${summary.totalPrinters || allPrinters.length || 0}`);
    setText('#platform-sre', String(actionableSreDevices.length));
    setText('#platform-sla', formatPercent(summary.availabilityScore ?? 0, 1));
    setText('#flow-detect', `${platformAssetTotal} ativos em coleta`);
    setText('#flow-correlate', `${summary.totalLinks || allLinks.length || 0} links / ${summary.totalPrinters || allPrinters.length || 0} impressoras`);
    setText('#flow-prioritize', `P1 ${summary.criticalIncidents || 0} / P2 ${summary.highIncidents || 0} / P3 ${summary.mediumIncidents || 0}`);

    setText('#module-links-total', String(summary.totalLinks || allLinks.length || 0));
    setText('#module-links-online', `${summary.onlineLinks || 0}/${summary.totalLinks || allLinks.length || 0}`);
    setText('#module-links-warning', String(linksWarning));
    setText('#module-inventory-total', String(allComputers.length || platformAssetTotal || 0));
    setText('#module-inventory-units', inventoryUnits ? String(inventoryUnits) : '--');
    setText('#module-inventory-agent', onlineComputers ? `${onlineComputers} OK` : 'Zabbix');
    setText('#module-printers-online', `${summary.onlinePrinters || 0}/${summary.totalPrinters || allPrinters.length || 0}`);
    setText('#module-printers-warning', String(printerWarning));
    setText('#module-printers-toner', `${summary.avgToner || 0}%`);
    setText('#module-sre-total', String(actionableSreDevices.length));
    setText('#module-sre-links', String(actionableSreDevices.filter(device => device.type === 'link').length));
    setText('#module-sre-printers', String(actionableSreDevices.filter(device => device.type === 'printer').length));
    setText('#module-reports-uptime', formatPercent(summary.availabilityScore ?? 0, 1));
    setText('#module-reports-latency', `${summary.avgLatency || 0} ms`);
    setText('#module-infra-compliance', infraState);
    setText('#module-infra-servers', String(summary.totalDevices || platformAssetTotal || 0));
    setText('#module-history-total', String(summary.activeIncidents || 0));
    setText('#module-history-active', String(summary.activeIncidents || 0));
    setText('#module-history-avg', `${summary.avgLatency || 0} ms`);

    const thresholdLatency = (metaData && metaData.thresholds && metaData.thresholds.latency) ? Number(metaData.thresholds.latency) : 120;
    
    const S1 = getLatencyScore(summary.avgLatency, thresholdLatency);
    const S2 = getLossScore(summary.avgPacketLoss);
    const S3 = summary.avgStability !== undefined && summary.avgStability !== null ? Number(summary.avgStability) : 100;
    const S4 = getCapacityScore(summary.networkCapacityUsed);
    const S5 = getCpuScore(summary.avgCpu);
    const S6 = summary.availabilityScore !== undefined && summary.availabilityScore !== null ? Number(summary.availabilityScore) : 100;

    const setMetricTextAndColor = (selector, valueText, score) => {
        const el = qs(selector);
        if (!el) return;
        el.textContent = valueText;
        el.classList.remove('text-success', 'text-warning', 'text-danger');
        if (score >= 90) {
            el.classList.add('text-success');
        } else if (score >= 70) {
            el.classList.add('text-warning');
        } else {
            el.classList.add('text-danger');
        }
    };

    setMetricTextAndColor('#score-latency', `${summary.avgLatency || 0} ms`, S1);
    setMetricTextAndColor('#score-loss', formatPercent(summary.avgPacketLoss || 0, 1), S2);
    setMetricTextAndColor('#score-stability', `${summary.avgStability ?? 100}%`, S3);
    setMetricTextAndColor('#score-capacity', formatPercent(summary.networkCapacityUsed || 0, 1), S4);
    setMetricTextAndColor('#score-cpu', summary.avgCpu !== undefined && summary.avgCpu !== null ? `${summary.avgCpu}%` : 'N/A', S5);
    setMetricTextAndColor('#score-availability', formatPercent(summary.availabilityScore ?? 0, 1), S6);

    setText('#cockpit-incident-total', `${summary.activeIncidents || 0} ativos`);
    setWidth('#bar-availability', summary.availabilityScore ?? 0);
    setWidth('#bar-links-online', summary.totalLinks ? ((summary.onlineLinks || 0) / summary.totalLinks) * 100 : 0);
    setWidth('#bar-printers', summary.totalPrinters ? ((summary.onlinePrinters || 0) / summary.totalPrinters) * 100 : 0);

    // Update dynamic radar shape clip path
    const radarShape = qs('.radar-shape');
    if (radarShape) {
        // Calculate coordinates (0 to 100 scale from center 50%, 50%)
        const X1 = 50;
        const Y1 = 50 - S1 * 0.5;
        
        const X2 = 50 + S2 * 0.43;
        const Y2 = 50 - S2 * 0.25;
        
        const X3 = 50 + S3 * 0.43;
        const Y3 = 50 + S3 * 0.25;
        
        const X4 = 50;
        const Y4 = 50 + S4 * 0.5;
        
        const X5 = 50 - S5 * 0.43;
        const Y5 = 50 + S5 * 0.25;
        
        const X6 = 50 - S6 * 0.43;
        const Y6 = 50 - S6 * 0.25;
        
        radarShape.style.clipPath = `polygon(
            ${X1.toFixed(1)}% ${Y1.toFixed(1)}%, 
            ${X2.toFixed(1)}% ${Y2.toFixed(1)}%, 
            ${X3.toFixed(1)}% ${Y3.toFixed(1)}%, 
            ${X4.toFixed(1)}% ${Y4.toFixed(1)}%, 
            ${X5.toFixed(1)}% ${Y5.toFixed(1)}%, 
            ${X6.toFixed(1)}% ${Y6.toFixed(1)}%
        )`;
    }

    setText('#stat-health-score', `${summary.healthScore ?? '--'}`);
    setText('#stat-operational-state', operationalState);
    setText('#stat-availability', formatPercent(summary.availabilityScore ?? 0, 1));
    setText('#stat-total-devices', `${summary.totalDevices || 0} links monitorados`);
    setText('#stat-active-incidents', String(summary.activeIncidents || 0));
    setText('#stat-priority-split', `P1 ${summary.criticalIncidents || 0} / P2 ${summary.highIncidents || 0} / P3 ${summary.mediumIncidents || 0} / P4 ${summary.lowIncidents || 0}`);
    setText('#stat-links-online', `${summary.onlineLinks || 0}/${summary.totalLinks || 0}`);
    setText('#stat-links-latency', `${summary.avgLatency || 0} ms média`);
    setText('#stat-network-capacity', formatPercent(summary.networkCapacityUsed || 0, 1));
    setText('#stat-links-traffic', `${formatNumber(summary.totalTraffic || 0, 1)} Mbps em uso`);
    setText('#stat-printers-online', `${summary.onlinePrinters || 0}/${summary.totalPrinters || 0}`);
    setText('#stat-printers-toner', `${summary.avgToner || 0}% toner médio`);
}

function renderIncidentsTable() {
    const tbody = qs('#itsm-incidents-tbody');
    const badge = qs('#incident-count-badge');
    if (!tbody) return;

    if (badge) {
        badge.textContent = `${incidentsData.length} ativos`;
        badge.className = incidentsData.length ? 'count-pill health-pill high' : 'count-pill health-pill nominal';
    }

    if (!incidentsData.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">Nenhum incidente ativo no ciclo atual.</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = incidentsData.map(incident => `
        <tr>
            <td>
                <span class="priority-pill ${priorityClass(incident.priority)}">${escapeHtml(incident.priority)}</span>
            </td>
            <td>
                <span class="asset-name">${escapeHtml(incident.name)}</span>
                <span class="asset-meta">${escapeHtml(incident.ip)} · ${escapeHtml(incident.type === 'link' ? 'Link' : 'Impressora')}</span>
            </td>
            <td>
                <strong>${escapeHtml(incident.title)}</strong>
                <span class="signal-meta">${escapeHtml(incident.detail)}</span>
            </td>
            <td>${escapeHtml(incident.impact)}</td>
            <td>
                <button class="text-btn" data-open-type="${escapeHtml(incident.type)}" data-open-id="${escapeHtml(incident.assetId)}">Abrir</button>
            </td>
        </tr>
    `).join('');
}

function renderCockpitIncidents() {
    const list = qs('#cockpit-incident-list');
    if (!list) return;

    const incidents = incidentsData.slice(0, 4);
    if (!incidents.length) {
        list.innerHTML = '<div class="mini-empty">Sem incidente de rede ativo.</div>';
        return;
    }

    list.innerHTML = incidents.map(incident => `
        <button class="incident-mini ${priorityClass(incident.priority)}" data-open-type="${escapeHtml(incident.type)}" data-open-id="${escapeHtml(incident.assetId)}">
            <span>${escapeHtml(incident.priority)}</span>
            <strong>${escapeHtml(incident.name)}</strong>
            <small>${escapeHtml(incident.detail)}</small>
        </button>
    `).join('');
}

function renderCockpitTopLinks() {
    const list = qs('#cockpit-top-links');
    if (!list) return;

    const topLinks = [...linksData]
        .filter(link => link.status !== 'offline' && link.traffic !== null)
        .sort((a, b) => Number(b.traffic || 0) - Number(a.traffic || 0))
        .slice(0, 5);

    if (!topLinks.length) {
        list.innerHTML = '<div class="mini-empty">Aguardando tráfego WAN.</div>';
        return;
    }

    const maxTraffic = Math.max(...topLinks.map(link => Number(link.traffic || 0)), 1);
    list.innerHTML = topLinks.map(link => {
        const traffic = Number(link.traffic || 0);
        const width = Math.max(2, Math.min(100, (traffic / maxTraffic) * 100));
        return `
            <button class="top-link-row" data-open-type="link" data-open-id="${escapeHtml(link.id)}">
                <span>${escapeHtml(link.name)}</span>
                <strong>${formatNumber(traffic, 1)} Mbps</strong>
                <i><b style="width:${width}%"></b></i>
            </button>
        `;
    }).join('');
}

function renderRecommendations() {
    const container = qs('#recommendations-list');
    if (!container) return;

    if (!recommendationsData.length) {
        container.innerHTML = '<div class="empty-state">Sem ações emergenciais no momento.</div>';
        return;
    }

    container.innerHTML = recommendationsData.map(item => `
        <div class="recommendation">
            <span class="priority-pill ${priorityClass(item.priority)}">${escapeHtml(item.priority)}</span>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.action)}</p>
        </div>
    `).join('');
}

function renderDashboardLinks() {
    const grid = qs('#dashboard-links-grid');
    const countBadge = qs('#dashboard-filtered-count');
    if (!grid) return;

    const links = [...linksData].sort((a, b) => 
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
    );

    const normalLinks = links.filter(link => !String(link.name || '').toLowerCase().includes('gateway'));

    const filteredLinks = normalLinks.filter(link => {
        const haystack = normalizeText(`${link.name} ${link.ip} ${link.city || ''}`);
        const matchesSearch = !dashboardSearch || haystack.includes(normalizeText(dashboardSearch));
        
        const region = getLinkRegion(link);
        const matchesRegion = dashboardRegion === 'all' || region === dashboardRegion;
        
        const matchesStatus = dashboardStatus === 'all' || link.status === dashboardStatus;
        
        return matchesSearch && matchesRegion && matchesStatus;
    });

    if (countBadge) {
        countBadge.textContent = `${filteredLinks.length} / ${normalLinks.length} links`;
    }

    if (!filteredLinks.length) {
        grid.innerHTML = '<div class="empty-state">Nenhum link corresponde aos filtros atuais.</div>';
        return;
    }

    grid.innerHTML = filteredLinks.map(link => {
        const used = link.telemetry?.bandwidthUsedPct || 0;
        const cityMarkup = link.city ? `<span class="city-label">📍 ${escapeHtml(link.city)}</span>` : '';
        const severityClassLabel = link.severity || (link.status === 'offline' ? 'critical' : 'nominal');
        
        return `
            <div class="wan-mini" data-open-type="link" data-open-id="${escapeHtml(link.id)}">
                <div class="mini-head">
                    <div class="mini-title">
                        <strong title="${escapeHtml(link.name)}">${escapeHtml(link.name)}</strong>
                        <span>${escapeHtml(link.ip)}</span>
                        ${cityMarkup}
                    </div>
                    <span class="health-pill ${severityClass(link.severity)}">${severityLabel(link.severity)}</span>
                </div>
                <div class="metric-row">
                    <div class="metric latency-metric" style="display: flex; flex-direction: column;">
                        <span>Latência</span>
                        <div class="latency-value-sparkline">
                            <strong>${link.latency ?? '--'} ms</strong>
                            ${generateSparkline(link.latencyHistory, severityClassLabel)}
                        </div>
                    </div>
                    <div class="metric"><span>Perda</span><strong>${formatPercent(link.packetLoss ?? 0, 1)}</strong></div>
                    <div class="metric"><span>Banda</span><strong>${formatPercent(used, 1)}</strong></div>
                    <div class="metric"><span>Validação</span><strong>${escapeHtml(linkValidationLabel(link))}</strong></div>
                </div>
                ${progressMarkup(used)}
            </div>
        `;
    }).join('');
}

function renderLinksGrid() {
    const gridNormal = qs('#links-grid');
    const gridGateway = qs('#gateways-grid');
    const gridSystems = qs('#systems-grid');
    const gridEquipment = qs('#equipment-grid');
    const countBadge = qs('#links-filtered-count');
    if (!gridNormal || !gridGateway) return;

    const totalLinks = linksData.length;

    const filtered = [...linksData].filter(link => {
        const haystack = normalizeText(`${link.name} ${link.ip} ${link.city || ''}`);
        const matchesSearch = !linksSearch || haystack.includes(normalizeText(linksSearch));

        const region = getLinkRegion(link);
        const matchesRegion = linksRegion === 'all' || region === linksRegion;

        const matchesStatus = linksStatus === 'all' || link.status === linksStatus;

        return matchesSearch && matchesRegion && matchesStatus;
    }).sort((a, b) => 
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
    );

    if (countBadge) {
        countBadge.textContent = `${filtered.length} / ${totalLinks} ativos`;
    }

    const isGateway = link => String(link.name || '').toLowerCase().includes('gateway');
    const isEquipment = link => String(link.name || '').toLowerCase().includes('draytek');
    const isSystem = link => String(link.name || '').toLowerCase().includes('sankhya') || String(link.name || '').toLowerCase().includes('pluri');
    const isNormal = link => !isGateway(link) && !isEquipment(link) && !isSystem(link);

    const gatewayLinks = filtered.filter(isGateway);
    const equipmentLinks = filtered.filter(isEquipment);
    const systemLinks = filtered.filter(isSystem);
    const normalLinks = filtered.filter(isNormal);

    if (!filtered.length) {
        const emptyHtml = '<div class="empty-state">Nenhum link corresponde aos filtros atuais.</div>';
        gridNormal.innerHTML = emptyHtml;
        gridGateway.innerHTML = emptyHtml;
        if (gridSystems) gridSystems.innerHTML = emptyHtml;
        if (gridEquipment) gridEquipment.innerHTML = emptyHtml;
        return;
    }

    const renderCardList = (list) => {
        if (!list.length) return '<div class="empty-state">Nenhum ativo corresponde ao filtro atual.</div>';
        return list.map(link => {
            const used = link.telemetry?.bandwidthUsedPct || 0;
            const traffic = link.traffic === null ? '--' : `${formatNumber(link.traffic, 1)} Mbps`;
            const score = Number(link.healthScore ?? 100);
            const scoreStyle = `--score:${Math.max(0, Math.min(100, score))};--used:${Math.max(0, Math.min(100, Number(used) || 0))}`;
            
            const region = getLinkRegion(link);
            const regionLabel = region === 'none' ? '' : `<span class="region-pill ${region}">${region.toUpperCase().replace('MG-', 'MG ')}</span>`;
            const cityMarkup = link.city ? `<span class="city-label">📍 ${escapeHtml(link.city)}</span>` : '';
            const severityClassLabel = link.severity || (link.status === 'offline' ? 'critical' : 'nominal');
            const sparklineSvg = generateSparkline(link.latencyHistory, severityClassLabel);

            let kickerText = 'Link WAN';
            if (isGateway(link)) kickerText = 'Gateway Internet';
            else if (isSystem(link)) kickerText = 'Sistema / ERP';
            else if (isEquipment(link)) kickerText = 'Equipamento de Rede';

            return `
                <article class="asset-card wan-card ${escapeHtml(link.status)}" data-open-type="link" data-open-id="${escapeHtml(link.id)}" style="${scoreStyle}">
                    <div class="wan-card-top">
                        <div class="asset-title">
                            <span class="wan-kicker" style="display: inline-flex; align-items: center; gap: 6px;">
                                ${kickerText}
                                ${regionLabel}
                            </span>
                            <strong title="${escapeHtml(link.name)}">${escapeHtml(link.name)}</strong>
                            <span style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <code>${escapeHtml(link.ip)}</code>
                                ${link.uptime ? `· ${escapeHtml(link.uptime)}` : ''}
                                ${cityMarkup}
                            </span>
                        </div>
                        <div class="wan-score">
                            <strong>${link.healthScore ?? '--'}</strong>
                        </div>
                    </div>
                    <div class="wan-compact-info" style="display: none;">
                        <span class="compact-metric-badge latency">⚡ ${link.latency ?? '--'} ms</span>
                        <span class="compact-metric-badge loss">📉 ${formatPercent(link.packetLoss ?? 0, 1)}</span>
                        <span class="compact-metric-badge traffic">⇅ ${traffic}</span>
                        <span class="compact-metric-badge cpu">💻 CPU ${link.cpuUtil || 0}%</span>
                        <span class="compact-metric-badge score">⭐ Score ${link.healthScore ?? '--'}</span>
                    </div>
                    <div class="wan-status-row">
                        <span class="state-badge ${escapeHtml(link.status)}"><span class="badge-dot"></span>${statusLabel(link.status)}</span>
                        <span class="health-pill ${severityClass(link.severity)}">${severityLabel(link.severity)}</span>
                        <span class="validation-chip">${escapeHtml(linkValidationLabel(link))}</span>
                    </div>
                    <div class="wan-telemetry">
                        <div class="metric" style="display: flex; flex-direction: column; justify-content: space-between;">
                            <span>Latência</span>
                            <div class="latency-value-sparkline" style="display: flex; align-items: center; gap: 8px;">
                                <strong>${link.latency ?? '--'} ms</strong>
                                ${sparklineSvg}
                            </div>
                        </div>
                        <div class="metric"><span>Perda</span><strong>${formatPercent(link.packetLoss ?? 0, 1)}</strong></div>
                        <div class="metric"><span>Jitter</span><strong>${link.jitter ?? '--'} ms</strong></div>
                        <div class="metric"><span>Tráfego</span><strong>${traffic}</strong></div>
                        <div class="metric"><span>Banda</span><strong>${formatPercent(used, 1)}</strong></div>
                        <div class="metric"><span>CPU</span><strong>${link.cpuUtil || 0}%</strong></div>
                    </div>
                    <div class="wan-capacity">
                        <div>
                            <span>Uso da banda</span>
                            <strong>${formatPercent(used, 1)}</strong>
                        </div>
                        <i><b></b></i>
                    </div>
                    <div class="asset-footer wan-footer">
                        <span class="asset-meta">${escapeHtml(link.operationalTitle || 'Operação nominal')}</span>
                        <div class="asset-actions">
                            ${routerAccessButton(link)}
                            <button class="text-btn" data-open-type="link" data-open-id="${escapeHtml(link.id)}">Detalhes</button>
                        </div>
                    </div>
                </article>
            `;
        }).join('');
    };

    gridNormal.innerHTML = renderCardList(normalLinks);
    gridGateway.innerHTML = renderCardList(gatewayLinks);
    if (gridSystems) gridSystems.innerHTML = renderCardList(systemLinks);
    if (gridEquipment) gridEquipment.innerHTML = renderCardList(equipmentLinks);
    updateWanMap(filtered);
}

let wanMap = null;
let wanMarkersGroup = null;

function initWanMap() {
    if (typeof L === 'undefined') return;
    const mapElement = document.getElementById('wan-map');
    if (!mapElement || wanMap) return;

    try {
        // Foca na região do Sudeste do Brasil (Minas Gerais / Rio / São Paulo / ES)
        wanMap = L.map('wan-map', {
            center: [-21.0, -44.5],
            zoom: 6.5,
            zoomControl: true
        });

        // Tiles escuras do CartoDB DarkMatter
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 20
        }).addTo(wanMap);

        wanMarkersGroup = L.featureGroup().addTo(wanMap);
    } catch (e) {
        console.error('Erro ao inicializar o mapa Leaflet:', e);
    }
}

function updateWanMap(filteredLinks) {
    if (typeof L === 'undefined') return;
    if (!wanMap) {
        initWanMap();
    }
    if (!wanMap || !wanMarkersGroup) return;

    try {
        // Limpar marcadores anteriores
        wanMarkersGroup.clearLayers();

        // Agrupar links por coordenadas (lat, lng) para evitar sobreposição
        const cityGroups = {};
        filteredLinks.forEach(link => {
            if (link.lat !== null && link.lng !== null) {
                const key = `${Number(link.lat).toFixed(4)},${Number(link.lng).toFixed(4)}`;
                if (!cityGroups[key]) {
                    cityGroups[key] = {
                        lat: Number(link.lat),
                        lng: Number(link.lng),
                        city: link.city || 'Desconhecido',
                        links: []
                    };
                }
                cityGroups[key].links.push(link);
            }
        });

        const getMarkerColor = (links) => {
            if (links.some(l => l.status === 'offline')) return '#e63946'; // Vermelho (var(--danger))
            if (links.some(l => l.status === 'warning')) return '#f7a600'; // Laranja (var(--warning))
            return '#2ebd59'; // Verde (var(--success))
        };

        const escapeHtml = (str) => {
            return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };

        // Renderizar marcadores
        Object.values(cityGroups).forEach(group => {
            const color = getMarkerColor(group.links);
            const icon = L.divIcon({
                className: 'custom-map-marker',
                html: `<div class="marker-glowing-dot" style="background-color: ${color}; color: ${color}; box-shadow: 0 0 10px ${color}"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            let popupContent = `
                <div class="map-popup-container">
                    <h4>📍 ${escapeHtml(group.city)}</h4>
                    <div class="map-popup-links-list">
            `;

            group.links.forEach(l => {
                const statusClass = l.status;
                const statusLabelText = l.status === 'offline' ? 'Offline' : (l.status === 'warning' ? 'Aviso' : 'Online');
                const lossText = l.packetLoss !== null ? `${l.packetLoss}%` : '--';
                const latencyText = l.latency !== null ? `${l.latency} ms` : '--';
                
                popupContent += `
                    <div class="map-popup-link-item">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
                            <span style="font-weight:600; color:#f3f8ff;">${escapeHtml(l.name)}</span>
                            <span class="state-badge ${statusClass}" style="padding:2px 6px; font-size:10px; border-radius:3px;">${statusLabelText}</span>
                        </div>
                        <div style="font-size:11px; color:#94a3b8; display:flex; gap:10px;">
                            <span>Lat: ${latencyText}</span>
                            <span>Perda: ${lossText}</span>
                            <span>Score: ${l.healthScore ?? '--'}</span>
                        </div>
                    </div>
                `;
            });

            popupContent += `
                    </div>
                </div>
            `;

            const marker = L.marker([group.lat, group.lng], { icon: icon });
            marker.bindPopup(popupContent);
            wanMarkersGroup.addLayer(marker);
        });

        // Auto-fit bounds of the map to show all markers dynamically
        const layers = wanMarkersGroup.getLayers();
        if (layers.length > 0) {
            if (layers.length === 1) {
                // If only one marker is present, center on it with zoom level 10
                wanMap.setView(layers[0].getLatLng(), 10);
            } else {
                wanMap.fitBounds(wanMarkersGroup.getBounds(), { padding: [40, 40] });
            }
        }
    } catch (e) {
        console.error('Erro ao atualizar marcadores no mapa:', e);
    }
}

function renderPrintersGrid() {
    const grid = qs('#printers-grid');
    const countBadge = qs('#printers-filtered-count');
    if (!grid) return;

    const totalPrinters = printersData.length;

    const filtered = [...printersData].filter(printer => {
        const haystack = normalizeText(`${printer.name} ${printer.ip} ${printer.serialNumber || ''} ${printer.city || ''}`);
        const matchesSearch = !printersSearch || haystack.includes(normalizeText(printersSearch));

        const region = printer.customRegion || 'none';
        const matchesRegion = printersRegion === 'all' || region === printersRegion;

        const matchesStatus = printersStatus === 'all' || printer.status === printersStatus;

        return matchesSearch && matchesRegion && matchesStatus;
    }).sort((a, b) => 
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
    );

    if (countBadge) {
        countBadge.textContent = `${filtered.length} / ${totalPrinters} impressoras`;
    }

    if (!filtered.length) {
        grid.innerHTML = '<div class="empty-state">Nenhuma impressora corresponde aos filtros atuais.</div>';
        return;
    }

    grid.innerHTML = filtered.map(printer => {
        const totalPrints = (printer.blackCounter || 0) + (printer.colorCounter || 0);
        const toner = printer.status === 'offline' || printer.tonerLevel === null ? null : Number(printer.tonerLevel);
        const waste = printer.status === 'offline' || printer.wasteTonerFull === null ? null : Number(printer.wasteTonerFull);
        const cardStyle = `--toner:${Math.max(0, Math.min(100, toner ?? 0))};--waste:${Math.max(0, Math.min(100, waste ?? 0))}`;
        
        const region = printer.customRegion || 'none';
        const regionLabel = region === 'none' ? '' : `<span class="region-pill ${region}">${region.toUpperCase().replace('MG-', 'MG ')}</span>`;
        const cityMarkup = printer.city ? `<span class="city-label">📍 ${escapeHtml(printer.city)}</span>` : '';

        return `
            <article class="asset-card printer-card ${escapeHtml(printer.status)}" data-open-type="printer" data-open-id="${escapeHtml(printer.id)}" style="${cardStyle}">
                <div class="printer-card-top">
                    <div class="asset-title">
                        <span class="printer-kicker" style="display: inline-flex; align-items: center; gap: 6px;">
                            Suprimento monitorado
                            ${regionLabel}
                        </span>
                        <strong title="${escapeHtml(printer.name)}">${escapeHtml(printer.name)}</strong>
                        <span style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <code>${escapeHtml(printer.ip)}</code>
                            <span>· S/N ${escapeHtml(printer.serialNumber || 'N/D')}</span>
                            ${cityMarkup}
                    </div>
                </div>
                <div class="printer-compact-info" style="display: none;">
                    <span class="compact-metric-badge toner">💧 Toner: ${toner === null ? 'N/D' : `${toner}%`}</span>
                    <span class="compact-metric-badge waste">🗑️ Descarte: ${waste === null ? 'N/D' : `${waste}%`}</span>
                    <span class="compact-metric-badge prints">🖨️ ${totalPrints.toLocaleString('pt-BR')} págs</span>
                </div>
                <div class="printer-status-row">
                    <span class="state-badge ${escapeHtml(printer.status)}"><span class="badge-dot"></span>${statusLabel(printer.status)}</span>
                    <span class="health-pill ${severityClass(printer.severity)}">${severityLabel(printer.severity)}</span>
                    <span class="supply-chip">${printer.status === 'offline' ? 'Sem telemetria' : printer.tonerLevel === null ? 'Falha SNMP' : toner <= 15 ? 'Troca prioritária' : waste >= 90 ? 'Coletor crítico' : 'Acompanhando'}</span>
                </div>
                <div class="supply-bars">
                    <div>
                        <span>Toner</span>
                        <strong>${toner === null ? 'N/D' : `${toner}%`}</strong>
                        <i class="toner"><b></b></i>
                    </div>
                    <div>
                        <span>Coletor</span>
                        <strong>${waste === null ? 'N/D' : `${waste}%`}</strong>
                        <i class="waste"><b></b></i>
                    </div>
                </div>
                <div class="printer-telemetry">
                    <div class="metric"><span>Total Geral</span><strong>${formatNumber(totalPrints)}</strong></div>
                    <div class="metric"><span>Mono (P&B)</span><strong>${formatNumber(printer.blackCounter || 0)}</strong></div>
                    <div class="metric"><span>Colorida</span><strong>${printer.colorCounter === null ? 'N/A' : formatNumber(printer.colorCounter || 0)}</strong></div>
                </div>
                <div class="asset-footer printer-footer">
                    <span class="asset-meta">${escapeHtml(printer.operationalTitle || 'Operação nominal')}</span>
                    <div class="asset-actions">
                        <button class="text-btn" data-open-type="printer" data-open-id="${escapeHtml(printer.id)}">Detalhes</button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function hasActionableSreSignal(device) {
    if (!device) return false;
    // Ignorar se o ativo foi silenciado pelo usuário
    if (sreMutedAssets.includes(device.id)) return false;
    // Roteadores Draytek são equipamentos e não links, não geram incidentes ou sinais de SRE
    if (String(device.name || '').toLowerCase().includes('draytek')) return false;
    if (device.type === 'printer') {
        if (Number(device.healthScore ?? 100) >= 100) return false;
        const hasToner = device.tonerLevel !== null && device.tonerLevel !== undefined && device.tonerLevel !== '';
        const hasWaste = device.wasteTonerFull !== null && device.wasteTonerFull !== undefined && device.wasteTonerFull !== '';
        const toner = Number(device.tonerLevel);
        const waste = Number(device.wasteTonerFull);
        const cpu = Number(device.cpuUtil || 0);

        return (hasToner && Number.isFinite(toner) && toner <= 10) ||
            (hasWaste && Number.isFinite(waste) && waste >= 85) ||
            cpu >= Number(metaData.thresholds?.cpu || 90);
    }

    if (device.severity && !['nominal', 'low'].includes(device.severity)) return true;
    if (Number(device.healthScore ?? 100) < 100) return true;

    if (device.type === 'link') {
        const used = Number(device.telemetry?.bandwidthUsedPct || 0);
        return Number(device.packetLoss || 0) > 0 ||
            used >= 75 ||
            Number(device.latency || 0) > Number(metaData.thresholds?.latency || 120) ||
            device.status !== 'online';
    }

    return false;
}

function renderAIOpsWorkbench(aiopsData) {
    const container = qs('#sre-aiops-container');
    const content = qs('#sre-aiops-content');
    if (!container || !content) return;

    if (!aiopsData || (!aiopsData.predictiveAlerts?.length && !aiopsData.rootCauseCorrelations?.length)) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    let html = '';

    // Render Root Cause Correlations
    (aiopsData.rootCauseCorrelations || []).forEach(rc => {
        html += `
            <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 11px; font-weight: 800; color: #f87171; text-transform: uppercase;"><i data-lucide="git-commit" style="width: 12px; height: 12px;"></i> Causa Raiz Correlacionada</span>
                    <span style="font-size: 10px; color: #fca5a5; background: rgba(239, 68, 68, 0.2); padding: 2px 6px; border-radius: 4px;">FILIAL ${escapeHtml(rc.city)}</span>
                </div>
                <strong style="color: #ffffff; font-size: 13px; display: block; margin-bottom: 4px;">${escapeHtml(rc.summary)}</strong>
                <p style="font-size: 11px; color: #cbd5e1; margin: 0;">Ativos secundários afetados: <code>${rc.secondaryAffected.map(s => s.name).join(', ')}</code></p>
            </div>
        `;
    });

    // Render Predictive Alerts
    (aiopsData.predictiveAlerts || []).forEach(pa => {
        html += `
            <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 11px; font-weight: 800; color: #fbbf24; text-transform: uppercase;"><i data-lucide="alert-triangle" style="width: 12px; height: 12px;"></i> Alerta Preditivo (Série Temporal)</span>
                    <span style="font-size: 10px; color: #fde68a; background: rgba(245, 158, 11, 0.2); padding: 2px 6px; border-radius: 4px;">RISCO ${pa.riskScore}%</span>
                </div>
                <strong style="color: #ffffff; font-size: 13px; display: block; margin-bottom: 4px;">${escapeHtml(pa.name)} · Tendência de Oscilação</strong>
                <p style="font-size: 11px; color: #cbd5e1; margin: 0;">Probabilidade ${pa.probability} nos <strong>${pa.timeframe}</strong>. Razão: ${pa.reasons.join(', ')}.</p>
            </div>
        `;
    });

    content.innerHTML = html;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function renderSreOverviewTab() {
    const list = qs('#sre-active-diagnostics-list');
    if (!list) return;

    const togglePrintersBox = qs('#sre-toggle-printers');
    const hideUserPrinters = togglePrintersBox ? togglePrintersBox.checked : false;

    // Controlar visibilidade e contagem do botão de limpar silenciados
    const clearMutedBtn = qs('#sre-clear-muted');
    if (clearMutedBtn) {
        clearMutedBtn.style.display = sreMutedAssets.length > 0 ? 'inline-block' : 'none';
        clearMutedBtn.textContent = `Limpar Silenciados (${sreMutedAssets.length})`;
    }

    // Filtrar Draytek globalmente na aba SRE, e opcionalmente impressoras administradas por usuários
    const allSreDevices = [
        ...linksData.map(item => ({ ...item, type: 'link' })),
        ...printersData.map(item => ({ ...item, type: 'printer' }))
    ].filter(device => {
        if (String(device.name || '').toLowerCase().includes('draytek')) return false;
        if (hideUserPrinters && device.type === 'printer') return false;
        return true;
    });

    // Compute original counts for KPI cards before filters
    const actionableDevices = allSreDevices.filter(hasActionableSreSignal);
    const totalDevicesInAlert = actionableDevices.length;
    const linksInAlert = actionableDevices.filter(d => d.type === 'link').length;
    const printersInAlert = actionableDevices.filter(d => d.type === 'printer').length;

    // Update SRE tab KPIs
    setText('#sre-kpi-total', totalDevicesInAlert);
    setText('#sre-kpi-links', linksInAlert);
    setText('#sre-kpi-printers', printersInAlert);

    const statusEl = qs('#sre-kpi-status');
    const statusDescEl = qs('#sre-kpi-status-desc');
    if (statusEl) {
        if (actionableDevices.some(d => d.severity === 'critical' || d.severity === 'high')) {
            statusEl.textContent = 'Crítico';
            statusEl.style.color = '#ff6868';
            if (statusDescEl) statusDescEl.textContent = 'Anomalias de alto impacto detectadas';
        } else if (actionableDevices.some(d => d.severity === 'medium')) {
            statusEl.textContent = 'Atenção';
            statusEl.style.color = '#f5bd4f';
            if (statusDescEl) statusDescEl.textContent = 'Acompanhando desvios operacionais';
        } else if (actionableDevices.length > 0) {
            statusEl.textContent = 'Instável';
            statusEl.style.color = '#56b4ff';
            if (statusDescEl) statusDescEl.textContent = 'Alertas pontuais sob mitigação';
        } else {
            statusEl.textContent = 'Nominal';
            statusEl.style.color = '#31d394';
            if (statusDescEl) statusDescEl.textContent = 'Infraestrutura operando normalmente';
        }
    }

    if (window.aiopsDataPayload) {
        renderAIOpsWorkbench(window.aiopsDataPayload);
    }

    // Apply local SRE filters
    const filteredDevices = actionableDevices.filter(device => {
        // Search filter
        const matchesSearch = !sreSearch || 
            (device.name || '').toLowerCase().includes(sreSearch.toLowerCase()) ||
            (device.ip || '').toLowerCase().includes(sreSearch.toLowerCase()) ||
            (device.operationalTitle || '').toLowerCase().includes(sreSearch.toLowerCase()) ||
            (device.cortexDiagnose?.diagnosis || '').toLowerCase().includes(sreSearch.toLowerCase());

        // Severity filter
        let matchesSeverity = false;
        if (sreSeverity === 'all') {
            matchesSeverity = true;
        } else if (sreSeverity === 'critical') {
            matchesSeverity = device.severity === 'critical' || device.severity === 'high';
        } else if (sreSeverity === 'warning') {
            matchesSeverity = device.severity === 'medium';
        } else if (sreSeverity === 'low') {
            matchesSeverity = device.severity === 'low';
        }

        // Type filter
        const matchesType = sreType === 'all' || device.type === sreType;

        return matchesSearch && matchesSeverity && matchesType;
    });

    // Sort filtered devices by severity weight
    const weight = { critical: 4, high: 3, medium: 2, low: 1, nominal: 0 };
    filteredDevices.sort((a, b) => (weight[b.severity] || 0) - (weight[a.severity] || 0));

    // Update filtered count badge
    const countBadge = qs('#sre-filtered-count');
    if (countBadge) {
        countBadge.textContent = `${filteredDevices.length} / ${totalDevicesInAlert} ativos`;
    }

    if (!filteredDevices.length) {
        list.innerHTML = '<div class="empty-state">Nenhum ativo corresponde aos filtros selecionados.</div>';
        return;
    }

    list.innerHTML = filteredDevices.map(device => {
        const diag = device.cortexDiagnose || {};
        const directives = Array.isArray(diag.directives) ? diag.directives : [];
        return `
            <div class="sre-row sre-card ${severityClass(device.severity)}">
                <div class="sre-asset-block">
                    <div class="sre-asset-title">
                        <i data-lucide="${device.type === 'link' ? 'network' : 'printer'}" class="sre-type-icon ${device.type}"></i>
                        <strong>${escapeHtml(device.name)}</strong>
                    </div>
                    <p>${escapeHtml(device.ip)} · CPU ${device.cpuUtil || 0}%</p>
                    <div class="sre-asset-meta">
                        ${device.city ? `<span class="location-tag"><i data-lucide="map-pin"></i> ${escapeHtml(device.city)}</span>` : ``}
                        ${device.customRegion ? `<span class="region-pill ${escapeHtml(device.customRegion.toLowerCase())}">${escapeHtml(device.customRegion.toUpperCase())}</span>` : ``}
                    </div>
                    <span class="risk-badge ${severityClass(device.severity)}">${severityLabel(device.severity)} · score ${device.healthScore ?? '--'}</span>
                </div>
                <div class="sre-diagnosis-block">
                    <div class="sre-diagnosis-title">
                        <span class="pulse-dot ${device.severity === 'critical' || device.severity === 'high' ? 'critical' : device.severity === 'medium' ? 'warning' : ''}"></span>
                        <strong>${escapeHtml(device.operationalTitle || diag.riskVetor || 'Operação nominal')}</strong>
                    </div>
                    <p>${escapeHtml(diag.diagnosis || device.businessImpact || 'Sem diagnóstico disponível.')}</p>
                </div>
                <div class="sre-action-block">
                    <strong>Mitigação</strong>
                    <ul class="sre-runbook-list">
                        ${directives.map(item => `
                            <li>
                                <i data-lucide="check-square" class="sre-check-icon"></i>
                                <span>${escapeHtml(item)}</span>
                            </li>
                        `).join('')}
                    </ul>
                    <button class="text-btn" data-open-type="${escapeHtml(device.type)}" data-open-id="${escapeHtml(device.id)}">Analisar</button>
                    <button class="text-btn" data-sre-mute-id="${escapeHtml(device.id)}" style="color: var(--muted); margin-left: 10px;" title="Silenciar alertas para este ativo">Silenciar</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderExchangesLogs() {
    const feed = qs('#exchanges-logs-feed');
    const count = qs('#audit-log-count');
    if (!feed) return;

    if (count) count.textContent = String(recentExchangesList.length);

    if (!recentExchangesList.length) {
        feed.innerHTML = '<div class="empty-state">Nenhum evento de suprimento no período.</div>';
        return;
    }

    feed.innerHTML = recentExchangesList.map(log => `
        <div class="log-row">
            <div>
                <strong>${escapeHtml(log.message)}</strong>
                <span>${escapeHtml(log.printerName || 'Ativo')} · ${escapeHtml(log.type || 'evento')}</span>
            </div>
            <span>${formatDateTime(log.timestamp)}</span>
        </div>
    `).join('');
}

function checkForTonerChanges(items, exchanges) {
    let triggered = false;

    if (!alertedExchangeIdsBootstrapped) {
        // Primeiro carregamento: apenas memoriza os eventos passados para evitar alertas de histórico
        exchanges.forEach(event => {
            alertedExchangeIds.add(event.id);
        });
        alertedExchangeIdsBootstrapped = true;
    } else {
        // Carregamentos subsequentes: alerta apenas para novos eventos que surgirem
        exchanges.forEach(event => {
            if (!alertedExchangeIds.has(event.id)) {
                alertedExchangeIds.add(event.id);
                triggerExchangeNotification(event.printerName, event.message, event.type === 'toner' ? 'Toner reabastecido' : 'Coletor substituído');
                triggered = true;
            }
        });
    }

    items.forEach(printer => {
        const prevToner = previousTonerLevels[printer.id];
        const prevWaste = previousWasteLevels[printer.id];

        if (prevToner !== undefined && printer.tonerLevel === 100 && prevToner < 25) {
            triggerExchangeNotification(printer.name, `Troca de toner identificada via telemetria em ${printer.name}`, 'Toner reabastecido');
            triggered = true;
        }

        if (prevWaste !== undefined && printer.wasteTonerFull === 0 && prevWaste > 85) {
            triggerExchangeNotification(printer.name, `Coletor de resíduos substituído em ${printer.name}`, 'Coletor substituído');
            triggered = true;
        }

        previousTonerLevels[printer.id] = printer.tonerLevel;
        previousWasteLevels[printer.id] = printer.wasteTonerFull;
    });

    if (triggered) playExchangeChime();
}

function triggerExchangeNotification(printerName, message, type) {
    setText('#exchange-printer', printerName || 'Ativo');
    setText('#exchange-type', type || 'Evento detectado');
    setText('#exchange-message', message || 'Atualização recebida.');
    qs('#exchange-notification-overlay')?.classList.add('active');
}

function initAnalyticalCharts() {
    if (!window.Chart) return;

    Chart.defaults.color = '#9aa7b6';
    Chart.defaults.borderColor = 'rgba(116, 137, 160, 0.20)';
    Chart.defaults.font.family = '"Segoe UI", Inter, system-ui, sans-serif';

    const demandCtx = qs('#chart-demand-evolution');
    const topLinksCtx = qs('#chart-top-links');
    const printsCtx = qs('#chart-prints-volume');
    const demandMiniCtx = qs('#chart-demand-evolution-mini');
    const resourcesMiniCtx = qs('#chart-resources-mini');

    if (demandMiniCtx) {
        chartDemandMini = new Chart(demandMiniCtx, {
            type: 'line',
            data: {
                labels: demandHistoryLabels,
                datasets: [
                    {
                        label: 'Latência (ms)',
                        data: demandHistoryLatency,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.05)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 1.5,
                        pointRadius: 0
                    },
                    {
                        label: 'Tráfego (Mbps)',
                        data: demandHistoryTraffic,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 1.5,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { display: false }
                }
            }
        });
    }

    if (resourcesMiniCtx) {
        chartResourcesMini = new Chart(resourcesMiniCtx, {
            type: 'line',
            data: {
                labels: demandHistoryLabels,
                datasets: [
                    {
                        label: 'CPU (%)',
                        data: resourcesHistoryCpu,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.05)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 1.5,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { display: false }
                }
            }
        });
    }

    if (demandCtx) {
        chartDemand = new Chart(demandCtx, {
            type: 'line',
            data: {
                labels: demandHistoryLabels,
                datasets: [
                    {
                        label: 'Latência média (ms)',
                        data: demandHistoryLatency,
                        borderColor: '#56b4ff',
                        backgroundColor: 'rgba(86, 180, 255, 0.13)',
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2
                    },
                    {
                        label: 'Tráfego total (Mbps)',
                        data: demandHistoryTraffic,
                        borderColor: '#31d394',
                        backgroundColor: 'rgba(49, 211, 148, 0.11)',
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { boxWidth: 10 } } },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true }
                }
            }
        });
    }

    if (topLinksCtx) {
        chartTopLinks = new Chart(topLinksCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Mbps',
                    data: [],
                    backgroundColor: '#56b4ff',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true },
                    y: { grid: { display: false } }
                }
            }
        });
    }

    if (printsCtx) {
        chartPrints = new Chart(printsCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [
                    { label: 'Mono', data: [], backgroundColor: '#9aa7b6', borderRadius: 4 },
                    { label: 'Colorida', data: [], backgroundColor: '#31d394', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { boxWidth: 10 } } },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true }
                }
            }
        });
    }
}

function updateChartsData(summary) {
    const label = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    demandHistoryLabels.push(label);
    demandHistoryLatency.push(Number(summary.avgLatency || 0));
    demandHistoryTraffic.push(Number(summary.totalTraffic || 0));
    resourcesHistoryCpu.push(Number(summary.avgCpu || 0));

    while (demandHistoryLabels.length > 16) {
        demandHistoryLabels.shift();
        demandHistoryLatency.shift();
        demandHistoryTraffic.shift();
        resourcesHistoryCpu.shift();
    }

    if (chartDemand) chartDemand.update();
    if (chartDemandMini) chartDemandMini.update();
    if (chartResourcesMini) chartResourcesMini.update();

    if (chartTopLinks) {
        const topLinks = [...linksData]
            .filter(link => link.status !== 'offline' && link.traffic !== null)
            .sort((a, b) => Number(b.traffic || 0) - Number(a.traffic || 0))
            .slice(0, 6);
        chartTopLinks.data.labels = topLinks.map(link => link.name.split('(')[0].trim());
        chartTopLinks.data.datasets[0].data = topLinks.map(link => Number(link.traffic || 0));
        chartTopLinks.update();
    }

    if (chartPrints) {
        const topPrinters = [...printersData]
            .sort((a, b) => ((b.blackCounter || 0) + (b.colorCounter || 0)) - ((a.blackCounter || 0) + (a.colorCounter || 0)))
            .slice(0, 6);
        chartPrints.data.labels = topPrinters.map(printer => printer.name.split('(')[0].trim());
        chartPrints.data.datasets[0].data = topPrinters.map(printer => Number(printer.blackCounter || 0));
        chartPrints.data.datasets[1].data = topPrinters.map(printer => Number(printer.colorCounter || 0));
        chartPrints.update();
    }
}

function openDrawer(type, id) {
    if (selectedItemId !== id || selectedType !== type) {
        currentDiagnosticReport = null;
        currentDiagnosticSummary = null;
    }
    selectedType = type;
    selectedItemId = id;
    updateDrawerContent();
    qs('#drawer-overlay')?.classList.add('active');
    qs('#drawer-container')?.classList.add('active');
}

function closePrinterDrawer() {
    selectedType = null;
    selectedItemId = null;
    currentDiagnosticReport = null;
    currentDiagnosticSummary = null;
    if (chartDrawerTrendInstance) {
        chartDrawerTrendInstance.destroy();
        chartDrawerTrendInstance = null;
    }
    qs('#drawer-overlay')?.classList.remove('active');
    qs('#drawer-container')?.classList.remove('active');
}

function metricBox(label, value) {
    return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function buildDrawerReport(item = deviceBySelection()) {
    if (!item) return '';

    let typeLabel = 'Computador';
    if (selectedType === 'link') typeLabel = 'Link WAN';
    else if (selectedType === 'printer') typeLabel = 'Impressora';

    const lines = [
        '=== NOC OPERATIONAL REPORT ===',
        `Ativo: ${item.name}`,
        `Tipo: ${typeLabel}`,
        `IP: ${item.ip}`,
        `Status: ${statusLabel(item.status)}`
    ];

    if (selectedType === 'computer') {
        lines.push(`Sistema Operacional: ${item.os || 'Aguardando coleta...'}`);
        lines.push(`CPU: ${item.hardware || 'Aguardando coleta...'}`);
        lines.push(`Serial: ${item.serialNumber || 'Aguardando...'}`);
        lines.push(`MAC: ${item.macAddress || 'N/D'}`);
        lines.push(`Unidade: ${item.city || 'Não definida'}`);
    } else {
        lines.push(`Severidade: ${severityLabel(item.severity)}`);
        lines.push(`Score: ${item.healthScore ?? 'N/A'}`);
        lines.push(`Impacto: ${item.businessImpact || 'N/A'}`);
        lines.push(`Ação recomendada: ${item.recommendedAction || 'N/A'}`);

        if (selectedType === 'printer') {
            lines.push(`Toner: ${item.tonerLevel !== null && item.tonerLevel !== undefined ? `${item.tonerLevel}%` : 'N/D'}`);
            lines.push(`Coletor: ${item.wasteTonerFull !== null && item.wasteTonerFull !== undefined ? `${item.wasteTonerFull}%` : 'N/D'}`);
            lines.push(`Total de impressões: ${item.blackCounter !== null && item.blackCounter !== undefined ? item.blackCounter : 'N/D'}`);
            lines.push(`Páginas coloridas: ${item.colorCounter ?? 'N/D'}`);
            lines.push(`Latência: ${item.latency ?? 'N/D'} ms`);
        } else {
            const downSpeed = item.trafficIn !== null && item.trafficIn !== undefined ? `${formatNumber(item.trafficIn, 1)} Mbps` : 'N/D';
            const upSpeed = item.trafficOut !== null && item.trafficOut !== undefined ? `${formatNumber(item.trafficOut, 1)} Mbps` : 'N/D';
            lines.push(`Latência: ${item.latency ?? 'N/D'} ms`);
            lines.push(`Perda: ${item.packetLoss ?? 0}%`);
            lines.push(`Jitter: ${item.jitter ?? 'N/D'} ms`);
            lines.push(`Tráfego Total: ${item.traffic ?? 'N/D'} Mbps`);
            lines.push(`Download / Upload: ${downSpeed} / ${upSpeed}`);
            lines.push(`Banda Contratada: ${item.bandwidth ?? 'N/D'} Mbps`);
        }
    }

    return lines.join('\n');
}

function updateReportPanel(summary, body) {
    setText('#drawer-report-summary', summary);
    setText('#drawer-report-body', body);
}

function updateDrawerContent() {
    const item = deviceBySelection();
    if (!item) {
        closePrinterDrawer();
        return;
    }

    let typeText = 'Impressora';
    if (selectedType === 'link') typeText = 'Link WAN';
    else if (selectedType === 'computer') typeText = 'Computador Monitorado';
    setText('#drawer-type', typeText);
    let statusText = statusLabel(item.status);
    if (selectedType === 'link' && item.status === 'offline' && item.connectivity?.downStartedAt) {
        const ms = Date.now() - new Date(item.connectivity.downStartedAt).getTime();
        statusText += ` (Fora há ${formatDurationJs(ms)})`;
    }
    setText('#drawer-printer-name', item.name);
    setText('#drawer-status-text', statusText);
    setText('#drawer-health-score', item.healthScore ?? '--');

    const statusBadge = qs('#drawer-status-badge');
    if (statusBadge) statusBadge.className = `state-badge ${item.status}`;

    const printerOnly = qs('#drawer-printer-only');
    if (printerOnly) printerOnly.style.display = selectedType === 'printer' ? 'block' : 'none';

    let routerAction = qs('#drawer-router-access');
    if (selectedType === 'link') {
        const drawerActions = qs('.drawer-actions');
        if (drawerActions && !routerAction) {
            drawerActions.insertAdjacentHTML('afterbegin', '<a class="ghost-btn router-link" id="drawer-router-access" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>Acesso roteador</a>');
            routerAction = qs('#drawer-router-access');
        }
        if (routerAction) {
            const access = item.routerAccess || {};
            routerAction.style.display = access.enabled && access.url ? 'inline-flex' : 'none';
            if (access.enabled && access.url) routerAction.href = access.url;
        }
    } else if (routerAction) {
        routerAction.style.display = 'none';
    }

    const grid = qs('#drawer-metric-grid');
    if (grid && selectedType === 'printer') {
        const totalPrints = (item.blackCounter || 0) + (item.colorCounter || 0);
        grid.innerHTML = [
            metricBox('Endereço IP', item.ip),
            metricBox('Número de série', item.serialNumber || 'N/D'),
            metricBox('Latência', item.latency !== null ? `${item.latency} ms` : 'Offline'),
            metricBox('Toner', item.status === 'offline' || item.tonerLevel === null ? 'N/D' : `${item.tonerLevel}%`),
            metricBox('Coletor', item.status === 'offline' || item.wasteTonerFull === null ? 'N/D' : `${item.wasteTonerFull}%`),
            metricBox('Uptime', item.uptime || 'Inativo')
        ].join('');

        setText('#drawer-count-black', item.blackCounter === null ? 'N/D' : formatNumber(item.blackCounter));
        setText('#drawer-count-color', item.colorCounter === null ? 'N/D' : formatNumber(item.colorCounter));
        setText('#drawer-count-total', item.blackCounter === null ? 'N/D' : formatNumber(totalPrints));

        const colorBtn = qs('#btn-sim-print-color');
        if (colorBtn) colorBtn.disabled = item.colorCounter === null;
    }

    if (grid && selectedType === 'link') {
        const used = item.telemetry?.bandwidthUsedPct || 0;
        const downSpeed = item.trafficIn !== null && item.trafficIn !== undefined ? `${formatNumber(item.trafficIn, 1)} Mbps` : 'N/D';
        const upSpeed = item.trafficOut !== null && item.trafficOut !== undefined ? `${formatNumber(item.trafficOut, 1)} Mbps` : 'N/D';
        grid.innerHTML = [
            metricBox('Gateway IP', item.ip),
            metricBox('Banda contratada', `${item.bandwidth || '--'} Mbps`),
            metricBox('Tráfego Total', item.traffic !== null ? `${formatNumber(item.traffic, 1)} Mbps` : 'Offline'),
            metricBox('Download / Upload', `${downSpeed} / ${upSpeed}`),
            metricBox('Uso da banda', formatPercent(used, 1)),
            metricBox('Latência', item.latency !== null ? `${item.latency} ms` : 'Offline'),
            metricBox('Perda / Jitter', `${formatPercent(item.packetLoss || 0, 1)} / ${item.jitter ?? '--'} ms`),
            metricBox('Validação de queda', linkValidationLabel(item)),
            metricBox('Acesso roteador', item.routerAccess?.enabled ? (item.routerAccess.configured ? 'Configurado' : 'Inferido') : 'Não configurado')
        ].join('');

        renderDrawerTrendChart(item.id);
    } else if (grid && selectedType === 'computer') {
        const rebootText = item.rebootPending === 1 ? '⚠️ Pendente (Reinicialização Requerida)' : '✅ Em dia';
        const updatesText = item.pendingUpdates !== undefined ? `${item.pendingUpdates} pendentes` : 'Aguardando coleta...';
        grid.innerHTML = [
            metricBox('Endereço IP', item.ip),
            metricBox('Sistema Operacional', item.os || 'Aguardando coleta...'),
            metricBox('Processador / Hardware', item.hardware || 'Aguardando coleta...'),
            metricBox('Memória RAM', item.ram || 'N/D'),
            metricBox('Armazenamento / Discos', item.disk || 'N/D'),
            metricBox('Número de Série', item.serialNumber || 'Aguardando...'),
            metricBox('Fabricante / Modelo', `${item.vendor || 'N/D'} - ${item.model || 'N/D'}`),
            metricBox('Arquitetura', item.hwArch || 'N/D'),
            metricBox('Usuário Logado', item.loggedUser || 'Nenhum'),
            metricBox('Antivírus Ativo', item.antivirus || 'Nenhum'),
            metricBox('Status da Reinicialização', rebootText),
            metricBox('Updates Pendentes', updatesText),
            metricBox('Endereço MAC', item.macAddress || 'N/D'),
            metricBox('Uptime', item.uptime || 'N/D'),
            metricBox('Status do Ping', item.status === 'online' ? 'Online' : 'Offline'),
            metricBox('Unidade / Cidade', item.city ? `${item.city} (${item.customRegion ? item.customRegion.toUpperCase() : ''})` : 'Não definida')
        ].join('');
    } else {
        const container = qs('#drawer-network-trend-panel');
        if (container) {
            container.hidden = true;
            if (chartDrawerTrendInstance) {
                chartDrawerTrendInstance.destroy();
                chartDrawerTrendInstance = null;
            }
        }
    }

    const cortex = item.cortexDiagnose || {};
    setText('#drawer-cortex-cpu-val', `${item.cpuUtil || 0}%`);
    setText('#drawer-cortex-pearson-val', cortex.correlation === null || cortex.correlation === undefined ? 'Amostrando' : String(cortex.correlation));
    setText('#drawer-cortex-opinion', cortex.diagnosis || item.businessImpact || 'Sem diagnóstico disponível.');

    const directives = Array.isArray(cortex.directives) ? cortex.directives : [];
    const directiveList = qs('#drawer-cortex-directives');
    if (directiveList) {
        directiveList.innerHTML = directives.map(line => `<li>${escapeHtml(line)}</li>`).join('');
    }

    const riskBadge = qs('#drawer-cortex-risk-badge');
    if (riskBadge) {
        riskBadge.textContent = cortex.riskVetor || severityLabel(item.severity);
        riskBadge.className = `risk-badge ${severityClass(item.severity)}`;
    }

    // Populate Runbook Actions dynamically
    const runbookSelect = qs('#runbook-action-select');
    if (runbookSelect) {
        runbookSelect.innerHTML = '';
        if (selectedType === 'link') {
            runbookSelect.innerHTML = `
                <option value="ping_test">Teste de Ping (ICMP)</option>
                <option value="traceroute">Rastrear Rota (Traceroute)</option>
                <option value="dns_flush">Limpar Cache de DNS</option>
            `;
        } else if (selectedType === 'printer') {
            runbookSelect.innerHTML = `
                <option value="ping_test">Teste de Ping (ICMP)</option>
                <option value="restart_spooler">Reiniciar Spooler de Impressão</option>
            `;
        } else if (selectedType === 'computer') {
            runbookSelect.innerHTML = `
                <option value="ping_test">Teste de Ping (ICMP)</option>
            `;
        }
    }

    if (currentDiagnosticReport) {
        updateReportPanel(currentDiagnosticSummary, currentDiagnosticReport);
        setText('#terminal-body', currentDiagnosticReport);
    } else {
        setText('#terminal-body', `Console pronto para execução.`);
        updateReportPanel(
            `${item.operationalTitle || 'Relatório operacional'} · score ${item.healthScore ?? 'N/A'}`,
            buildDrawerReport(item)
        );
    }

    const locationPanel = qs('#drawer-location-panel');
    if (locationPanel) {
        if (selectedType === 'link' || selectedType === 'printer' || selectedType === 'computer') {
            locationPanel.style.display = 'block';
            const cityInput = qs('#drawer-city-input');
            const regionSelect = qs('#drawer-region-select');
            if (cityInput) cityInput.value = item.city || '';
            if (regionSelect) regionSelect.value = item.customRegion || 'none';
            
            // Exibir/ocultar campo de banda contratada baseado no tipo
            const bandwidthField = qs('#drawer-bandwidth-field');
            const bandwidthInput = qs('#drawer-bandwidth-input');
            if (selectedType === 'link') {
                if (bandwidthField) bandwidthField.style.display = 'block';
                if (bandwidthInput) bandwidthInput.value = item.bandwidth || '';
            } else {
                if (bandwidthField) bandwidthField.style.display = 'none';
                if (bandwidthInput) bandwidthInput.value = '';
            }
        } else {
            locationPanel.style.display = 'none';
        }
    }

    renderIcons();
}

async function runDiagnostics() {
    const item = deviceBySelection();
    const term = qs('#terminal-body');
    const btn = qs('#btn-run-diagnostics');
    if (!item || !term || !btn) return;

    btn.disabled = true;
    const runningText = `Executando diagnóstico externo em ${item.ip}...\n\nTestes: ICMP, DNS, portas TCP e HTTP/HTTPS.`;
    term.textContent = runningText;
    updateReportPanel('Diagnóstico externo em andamento', runningText);

    try {
        const res = await fetch('/api/diagnostics/external', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: item.ip, deviceType: selectedType })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha no diagnóstico externo');

        currentDiagnosticReport = data.report;
        currentDiagnosticSummary = `Diagnóstico externo concluído · ${formatDateTime(data.generatedAt)}`;
        updateDrawerContent();
    } catch (e) {
        const errorText = `${runningText}\n\nFalha ao executar diagnóstico: ${e.message}`;
        currentDiagnosticReport = errorText;
        currentDiagnosticSummary = 'Falha no diagnóstico externo';
        updateDrawerContent();
    } finally {
        btn.disabled = false;
    }
}

function renderNetworkSweep(payload) {
    const summaryBox = qs('#network-sweep-summary');
    const resultsBox = qs('#network-sweep-results');
    if (!summaryBox || !resultsBox) return;

    const summary = payload?.summary || {};
    summaryBox.innerHTML = `
        <div><strong>${summary.ok ?? '--'}</strong><span>OK</span></div>
        <div><strong>${summary.degraded ?? '--'}</strong><span>Degradado</span></div>
        <div><strong>${summary.down ?? '--'}</strong><span>Sem resposta</span></div>
    `;

    const results = Array.isArray(payload?.results) ? payload.results : [];
    const problemLinks = results
        .filter(item => item.state !== 'ok')
        .sort((a, b) => (b.probe?.packetLossPct || 0) - (a.probe?.packetLossPct || 0))
        .slice(0, 6);

    if (!results.length) {
        resultsBox.innerHTML = '<div class="mini-empty">Nenhum link testado.</div>';
        return;
    }

    if (!problemLinks.length) {
        resultsBox.innerHTML = `
            <div class="sweep-ok">
                <strong>${summary.total || 0} links testados</strong>
                <span>Todos responderam ao ICMP. ${summary.durationMs || 0} ms.</span>
            </div>
        `;
        return;
    }

    resultsBox.innerHTML = problemLinks.map(item => `
        <button class="sweep-row ${escapeHtml(item.state)}" data-open-type="link" data-open-id="${escapeHtml(item.id)}">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.ip)} · perda ${formatPercent(item.probe?.packetLossPct ?? 0, 0)} · ${item.probe?.avgMs ?? '--'} ms</span>
        </button>
    `).join('');
}

async function runNetworkSweep() {
    const btn = qs('#btn-network-sweep');
    const resultsBox = qs('#network-sweep-results');
    if (btn) btn.disabled = true;
    if (resultsBox) resultsBox.innerHTML = '<div class="mini-empty">Executando testes ICMP nos links...</div>';

    try {
        const res = await fetch('/api/diagnostics/network-sweep', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Falha na varredura de rede.');
        renderNetworkSweep(payload);
    } catch (e) {
        if (resultsBox) resultsBox.innerHTML = `<div class="mini-empty">Falha na varredura: ${escapeHtml(e.message)}</div>`;
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function runSimulatePrint(type) {
    const item = deviceBySelection();
    if (!item || selectedType !== 'printer') return;

    const response = await fetch('/api/simulate/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, type })
    });

    if (response.ok) {
        await fetchStatus(true);
        setText('#terminal-body', `> print_sim --job ${type} --device ${item.id}\nContadores atualizados com sucesso.`);
    }
}

async function runSimulateRefill() {
    const item = deviceBySelection();
    if (!item || selectedType !== 'printer') return;

    const response = await fetch('/api/simulate/refill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id })
    });

    if (response.ok) {
        await fetchStatus(true);
        setText('#terminal-body', `> supply_refill --device ${item.id}\nTroca de suprimento registrada.`);
    }
}

async function triggerRandomSimulatedRefill() {
    const onlinePrinters = printersData.filter(printer => printer.status !== 'offline');
    if (!onlinePrinters.length) return;

    const lowPrinters = onlinePrinters.filter(printer => Number(printer.tonerLevel) < 50);
    const pool = lowPrinters.length ? lowPrinters : onlinePrinters;
    const target = pool[Math.floor(Math.random() * pool.length)];

    await fetch('/api/simulate/refill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.id })
    });
    await fetchStatus(true);
}

function copyDrawerReport() {
    const item = deviceBySelection();
    if (!item) return;

    const report = buildDrawerReport(item);
    updateReportPanel(`Relatório operacional pronto · score ${item.healthScore ?? 'N/A'}`, report);
    setText('#terminal-body', report);

    navigator.clipboard.writeText(report).then(() => {
        triggerExchangeNotification(item.name, 'Relatório técnico copiado para a área de transferência.', 'Relatório copiado');
    });
}

async function deleteDeviceFromZabbix() {
    const item = deviceBySelection();
    if (!item) return;

    const confirmDelete = confirm(`⚠️ EXCLUSÃO PERMANENTE ⚠️\n\nTem certeza de que deseja excluir permanentemente o dispositivo "${item.name}" (ID: ${selectedItemId}) do NOC e do servidor Zabbix?\n\nEsta ação NÃO pode ser desfeita e removerá o monitoramento deste dispositivo.`);
    if (!confirmDelete) return;

    try {
        const res = await fetch('/api/hosts/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostid: selectedItemId, name: item.name })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            alert(`Dispositivo "${item.name}" excluído com sucesso do Zabbix e do NOC!`);
            closePrinterDrawer();
            fetchStatus(true);
        } else {
            alert(`Falha ao excluir dispositivo: ${data.error || 'Erro desconhecido'}`);
        }
    } catch (e) {
        alert(`Erro de conexão com o servidor: ${e.message}`);
    }
}

async function loadConfigSettings() {
    try {
        const res = await fetch('/api/config', { cache: 'no-store' });
        if (!res.ok) return;
        const config = await res.json();
        if (config.thresholds) {
            qs('#threshold-toner').value = config.thresholds.toner ?? 15;
            qs('#threshold-latency').value = config.thresholds.latency ?? 120;
            qs('#threshold-packet-loss').value = config.thresholds.packetLoss ?? 5;
            qs('#threshold-jitter').value = config.thresholds.jitter ?? 15;
            qs('#threshold-cpu').value = config.thresholds.cpu ?? 90;
            qs('#threshold-ram').value = config.thresholds.ram ?? 90;
            qs('#threshold-disk').value = config.thresholds.disk ?? 90;
        }
        if (config.routerAccessMode) {
            qs('#settings-router-access-mode').value = config.routerAccessMode || 'infer';
        }

        // Preenche Dispositivos Ocultos
        const hiddenEl = qs('#settings-hidden-devices');
        if (hiddenEl && Array.isArray(config.hidden)) {
            hiddenEl.value = config.hidden.join('\n');
        }

        // Preenche Apelidos / Aliases
        const aliasesEl = qs('#settings-aliases');
        if (aliasesEl && config.aliases && typeof config.aliases === 'object') {
            aliasesEl.value = Object.entries(config.aliases)
                .map(([key, val]) => `${key}=${val}`)
                .join('\n');
        }

        // Preenche URLs de Acesso ao Roteador Manual
        const routerAccessEl = qs('#settings-router-access');
        if (routerAccessEl && config.routerAccess && typeof config.routerAccess === 'object') {
            routerAccessEl.value = Object.entries(config.routerAccess)
                .map(([key, val]) => {
                    if (val.enabled === false) {
                        return `${key}=disabled`;
                    }
                    const noteStr = val.note ? `|${val.note}` : '';
                    return `${key}=${val.url || ''}${noteStr}`;
                })
                .join('\n');
        }

        // Preenche Unidades Customizadas
        const customUnitsEl = qs('#settings-custom-units');
        if (customUnitsEl && Array.isArray(config.customUnits)) {
            customUnitsEl.value = config.customUnits
                .map(u => `${u.name}=${u.city}`)
                .join('\n');
        }

        // Preenche campos editáveis de integração
        if (config.zabbixUrl !== undefined) qs('#settings-zabbix-url').value = config.zabbixUrl || '';
        if (config.zabbixToken !== undefined) qs('#settings-zabbix-token').value = config.zabbixToken || '';
        if (config.telegramBotToken !== undefined) qs('#settings-telegram-token').value = config.telegramBotToken || '';
        if (config.telegramChatIds !== undefined) qs('#settings-telegram-chat-id').value = config.telegramChatIds || '';
    } catch (e) {
        console.error('Erro ao carregar configurações', e);
    }
}

async function loadTelegramStatus() {
    try {
        const res = await fetch('/api/integrations/telegram/status', { cache: 'no-store' });
        if (!res.ok) return;
        const status = await res.json();
        const statusLabel = qs('#settings-telegram-status-label');
        if (statusLabel) {
            statusLabel.textContent = status.configured ? 'Configurado' : 'Não configurado';
            statusLabel.style.color = status.configured ? 'var(--green)' : 'var(--amber)';
        }
        setText('#settings-telegram-priority', status.minPriority || '--');
        setText(
            '#settings-telegram-detail',
            status.configured
                ? `Destino pronto para quedas e retornos de links (${status.chatCount || 0} chat${status.chatCount === 1 ? '' : 's'}).`
                : 'Insira o token e chat ID no formulário acima ou configure no arquivo .env.'
        );
        setText(
            '#settings-telegram-last',
            status.lastSentAt
                ? `Último envio: ${new Date(status.lastSentAt).toLocaleString('pt-BR')}`
                : (status.lastError ? `Último erro: ${status.lastError}` : 'Nenhum envio registrado.')
        );
    } catch (e) {
        console.error('Erro ao carregar status Telegram', e);
    }
}



async function testTelegramIntegration() {
    const btn = qs('#btn-test-telegram');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch('/api/integrations/telegram/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(payload.error || 'Falha ao enviar teste Telegram.');
        }

        triggerExchangeNotification('Telegram NOC', 'Mensagem de teste enviada ao canal configurado.', 'Telegram OK');
        await loadTelegramStatus();
    } catch (e) {
        triggerExchangeNotification('Telegram NOC', e.message, 'Erro Telegram');
        await loadTelegramStatus();
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function saveConfigSettings() {
    const tonerVal = parseInt(qs('#threshold-toner').value, 10);
    const latencyVal = parseInt(qs('#threshold-latency').value, 10);
    const packetLossVal = parseInt(qs('#threshold-packet-loss').value, 10);
    const jitterVal = parseInt(qs('#threshold-jitter').value, 10);
    const cpuVal = parseInt(qs('#threshold-cpu').value, 10);
    const ramVal = parseInt(qs('#threshold-ram').value, 10);
    const diskVal = parseInt(qs('#threshold-disk').value, 10);
    const routerAccessModeVal = qs('#settings-router-access-mode').value || 'infer';
    
    const zabbixUrlVal = qs('#settings-zabbix-url').value.trim();
    const zabbixTokenVal = qs('#settings-zabbix-token').value.trim();
    const telegramBotTokenVal = qs('#settings-telegram-token').value.trim();
    const telegramChatIdsVal = qs('#settings-telegram-chat-id').value.trim();
    
    // Parse Hidden Devices textarea
    const hiddenVal = qs('#settings-hidden-devices').value
        .split('\n')
        .map(x => x.trim())
        .filter(Boolean);

    // Parse Aliases textarea
    const aliasesVal = {};
    qs('#settings-aliases').value.split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx !== -1) {
            const key = line.slice(0, idx).trim();
            const val = line.slice(idx + 1).trim();
            if (key && val) {
                aliasesVal[key] = val;
            }
        }
    });

    // Parse Router Access textarea
    const routerAccessVal = {};
    qs('#settings-router-access').value.split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx !== -1) {
            const key = line.slice(0, idx).trim();
            const valPart = line.slice(idx + 1).trim();
            if (key && valPart) {
                if (valPart.toLowerCase() === 'disabled') {
                    routerAccessVal[key] = { enabled: false, url: '', note: 'Desabilitado pelo operador' };
                } else {
                    const parts = valPart.split('|');
                    const url = parts[0].trim();
                    const note = parts[1] ? parts[1].trim() : 'Configurado manualmente';
                    routerAccessVal[key] = { enabled: true, url, note };
                }
            }
        }
    });

    // Parse Custom Units textarea
    const customUnitsVal = [];
    const customUnitsLines = (qs('#settings-custom-units')?.value || '').split('\n');
    const ufMapGlobal = {
        11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
        21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
        31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP',
        41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
    };

    for (const line of customUnitsLines) {
        if (!line.trim()) continue;
        const idx = line.indexOf('=');
        if (idx !== -1) {
            const sigla = line.slice(0, idx).trim().toUpperCase();
            const cityInput = line.slice(idx + 1).trim();
            if (sigla && cityInput) {
                const normalizedTarget = normalizeText(cityInput).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                const foundCity = allBrazilianCities.find(item => {
                    const itemCityNormalized = normalizeText(item.nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                    return itemCityNormalized === normalizedTarget;
                });
                
                if (!foundCity) {
                    alert(`A cidade "${cityInput}" para a unidade "${sigla}" não foi encontrada no banco de dados de municípios. Verifique se digitou o nome correto.`);
                    return;
                }

                const inferredRegion = detectRegion(foundCity.codigo_uf, foundCity.nome);
                customUnitsVal.push({
                    name: sigla,
                    city: foundCity.nome,
                    region: inferredRegion,
                    state: ufMapGlobal[foundCity.codigo_uf] || ''
                });
            }
        }
    }

    let currentSettings = { hidden: [], aliases: {}, locations: {} };

    try {
        const currentResponse = await fetch('/api/config', { cache: 'no-store' });
        if (currentResponse.ok) currentSettings = await currentResponse.json();
    } catch (e) {
        console.error('Erro ao ler configuração atual', e);
    }

    const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...currentSettings,
            routerAccessMode: routerAccessModeVal,
            hidden: hiddenVal,
            aliases: aliasesVal,
            routerAccess: routerAccessVal,
            customUnits: customUnitsVal,
            zabbixUrl: zabbixUrlVal,
            zabbixToken: zabbixTokenVal,
            telegramBotToken: telegramBotTokenVal,
            telegramChatIds: telegramChatIdsVal,
            thresholds: {
                toner: tonerVal,
                latency: latencyVal,
                packetLoss: packetLossVal,
                jitter: jitterVal,
                cpu: cpuVal,
                ram: ramVal,
                disk: diskVal
            }
        })
    });

    if (response.ok) {
        triggerExchangeNotification('Configurações NOC', 'Configurações e thresholds salvos com sucesso.', 'Configuração salva');
        await fetchStatus(true);
    } else {
        triggerExchangeNotification('Configurações NOC', 'Falha ao salvar configurações operacionais.', 'Erro');
    }
}

function setActiveTab(tabId) {
    document.body.setAttribute('data-active-tab', tabId);
    qsa('.nav-item').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === tabId);
    });
    qsa('.tab-pane').forEach(tab => {
        tab.classList.toggle('active', tab.id === tabId);
    });

    const workspace = qs('.workspace');
    if (workspace && typeof workspace.scrollTo === 'function') {
        workspace.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    window.scrollTo(0, 0);

    const filters = qs('#active-status-filters');
    if (filters) filters.hidden = !(tabId === 'tab-links' || tabId === 'tab-printers');

    const labels = {
        'tab-dashboard': 'Comando operacional',
        'tab-links': 'Links WAN',
        'tab-painel': 'Painel Monitor de Links',
        'tab-printers': 'Telemetria de impressoras',
        'tab-inventory': 'Inventário de Máquinas',
        'tab-sre': 'Centro SRE',
        'tab-infra': 'Auditoria & Saúde de Infraestrutura',
        'tab-reports': 'Relatório de Uso WAN',
        'tab-settings': 'Configurações do Sistema',
        'tab-history': 'Histórico de Incidentes'
    };
    setText('#page-current-title', labels[tabId] || 'Operations Command');



    if (tabId === 'tab-reports') {
        initializeReportsTab();
    } else if (tabId === 'tab-infra') {
        initializeInfraTab();
    } else if (tabId === 'tab-history') {
        initializeHistoryTab();
    } else if (tabId === 'tab-links') {
        if (wanMap) {
            setTimeout(() => {
                wanMap.invalidateSize();
                // Re-fit map bounds after invalidating size to ensure correct sizing and centering
                const layers = wanMarkersGroup.getLayers();
                if (layers.length > 0) {
                    if (layers.length === 1) {
                        wanMap.setView(layers[0].getLatLng(), 10);
                    } else {
                        wanMap.fitBounds(wanMarkersGroup.getBounds(), { padding: [40, 40] });
                    }
                }
            }, 100);
        }
    }
}

function startRefreshCountdown() {
    if (refreshIntervalTimer) clearInterval(refreshIntervalTimer);
    refreshCountdown = REFRESH_MAX;
    setText('#refresh-countdown', String(refreshCountdown));

    refreshIntervalTimer = setInterval(() => {
        refreshCountdown -= 1;
        if (refreshCountdown <= 0) {
            refreshCountdown = REFRESH_MAX;
            fetchStatus(true);
        }
        setText('#refresh-countdown', String(refreshCountdown));
    }, 1000);
}

function setupEventListeners() {
    qsa('.color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const color = dot.dataset.color;
            document.body.setAttribute('data-theme-color', color);
            localStorage.setItem('noc-theme-color', color);
            qsa('.color-dot').forEach(d => {
                d.classList.toggle('active', d.dataset.color === color);
            });
        });
    });

    const btnToggleTheme = qs('#btn-toggle-theme');
    if (btnToggleTheme) {
        btnToggleTheme.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-mode');
            const icon = qs('#theme-icon');
            if (isLight) {
                document.body.setAttribute('data-theme', 'light');
                localStorage.setItem('noc-theme', 'light');
                if (icon) {
                    icon.setAttribute('data-lucide', 'moon');
                    renderIcons();
                }
            } else {
                document.body.removeAttribute('data-theme');
                localStorage.setItem('noc-theme', 'dark');
                if (icon) {
                    icon.setAttribute('data-lucide', 'sun');
                    renderIcons();
                }
            }
        });
    }

    qsa('.nav-item').forEach(button => {
        button.addEventListener('click', () => setActiveTab(button.dataset.tab));
    });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.info-btn-iframe');
        if (btn) {
            const targetId = btn.getAttribute('data-iframe-target');
            const url = btn.getAttribute('data-iframe-url');
            const targetContainer = document.getElementById(targetId);
            if (targetContainer) {
                const safeUrl = String(url || '').trim();
                const canEmbed = safeUrl.startsWith('/') || /^https?:\/\//i.test(safeUrl);
                if (!canEmbed) return;

                const iframe = document.createElement('iframe');
                iframe.src = safeUrl;
                iframe.loading = 'lazy';
                iframe.referrerPolicy = 'no-referrer';
                iframe.setAttribute('sandbox', 'allow-forms allow-popups allow-same-origin allow-scripts');

                targetContainer.replaceChildren(iframe);
                targetContainer.style.display = 'block';
                const card = btn.closest('.info-card');
                if (card) card.style.display = 'none';
            }
        }
    });

    // Alternância do Modo Compacto
    const btnLinksCompact = qs('#btn-toggle-links-compact');
    if (btnLinksCompact) {
        const isCompact = localStorage.getItem('noc-links-compact') === 'true';
        qs('#links-grid')?.classList.toggle('compact-mode', isCompact);
        qs('#gateways-grid')?.classList.toggle('compact-mode', isCompact);
        qs('#systems-grid')?.classList.toggle('compact-mode', isCompact);
        qs('#equipment-grid')?.classList.toggle('compact-mode', isCompact);
        btnLinksCompact.classList.toggle('active', isCompact);
        btnLinksCompact.innerHTML = isCompact ? '<i data-lucide="layout-grid"></i>' : '<i data-lucide="list"></i>';
        
        btnLinksCompact.addEventListener('click', () => {
            const active = qs('#links-grid').classList.toggle('compact-mode');
            qs('#gateways-grid')?.classList.toggle('compact-mode', active);
            qs('#systems-grid')?.classList.toggle('compact-mode', active);
            qs('#equipment-grid')?.classList.toggle('compact-mode', active);
            btnLinksCompact.classList.toggle('active', active);
            localStorage.setItem('noc-links-compact', active ? 'true' : 'false');
            btnLinksCompact.innerHTML = active ? '<i data-lucide="layout-grid"></i>' : '<i data-lucide="list"></i>';
            lucide.createIcons();
        });
    }

    const btnPrintersCompact = qs('#btn-toggle-printers-compact');
    if (btnPrintersCompact) {
        const isCompact = localStorage.getItem('noc-printers-compact') === 'true';
        qs('#printers-grid')?.classList.toggle('compact-mode', isCompact);
        btnPrintersCompact.classList.toggle('active', isCompact);
        btnPrintersCompact.innerHTML = isCompact ? '<i data-lucide="layout-grid"></i>' : '<i data-lucide="list"></i>';

        btnPrintersCompact.addEventListener('click', () => {
            const active = qs('#printers-grid').classList.toggle('compact-mode');
            btnPrintersCompact.classList.toggle('active', active);
            localStorage.setItem('noc-printers-compact', active ? 'true' : 'false');
            btnPrintersCompact.innerHTML = active ? '<i data-lucide="layout-grid"></i>' : '<i data-lucide="list"></i>';
            lucide.createIcons();
        });
    }

    document.addEventListener('click', event => {
        if (event.target.closest('a.router-link')) {
            event.stopPropagation();
            return;
        }

        const prevBtn = event.target.closest('#btn-inventory-prev');
        if (prevBtn && !prevBtn.disabled) {
            inventoryCurrentPage = Math.max(1, inventoryCurrentPage - 1);
            renderInventoryGrid();
            return;
        }

        const nextBtn = event.target.closest('#btn-inventory-next');
        if (nextBtn && !nextBtn.disabled) {
            inventoryCurrentPage = Math.min(inventoryTotalPages, inventoryCurrentPage + 1);
            renderInventoryGrid();
            return;
        }

        const openTarget = event.target.closest('[data-open-type][data-open-id]');
        if (openTarget) {
            event.preventDefault();
            openDrawer(openTarget.dataset.openType, openTarget.dataset.openId);
            return;
        }

        const muteTarget = event.target.closest('[data-sre-mute-id]');
        if (muteTarget) {
            event.preventDefault();
            const id = muteTarget.dataset.sreMuteId;
            if (!sreMutedAssets.includes(id)) {
                sreMutedAssets.push(id);
                localStorage.setItem('sre-muted-assets', JSON.stringify(sreMutedAssets));
                renderSreOverviewTab();
            }
            return;
        }

        const jumpTarget = event.target.closest('[data-jump-tab]');
        if (jumpTarget) {
            setActiveTab(jumpTarget.dataset.jumpTab);
        }
    });

    qs('#search-bar')?.addEventListener('input', event => {
        searchFilter = event.target.value;
        renderLinksGrid();
        renderPrintersGrid();
    });

    qs('#dashboard-search-input')?.addEventListener('input', event => {
        dashboardSearch = event.target.value;
        renderDashboardLinks();
    });

    qs('#dashboard-region-select')?.addEventListener('change', event => {
        dashboardRegion = event.target.value;
        renderDashboardLinks();
    });

    qs('#dashboard-status-select')?.addEventListener('change', event => {
        dashboardStatus = event.target.value;
        renderDashboardLinks();
    });

    qs('#links-search-input')?.addEventListener('input', event => {
        linksSearch = event.target.value;
        renderLinksGrid();
    });

    qs('#links-region-select')?.addEventListener('change', event => {
        linksRegion = event.target.value;
        renderLinksGrid();
    });

    qs('#links-status-select')?.addEventListener('change', event => {
        linksStatus = event.target.value;
        renderLinksGrid();
    });

    qs('#printers-search-input')?.addEventListener('input', event => {
        printersSearch = event.target.value;
        renderPrintersGrid();
    });

    qs('#inventory-search-input')?.addEventListener('input', event => {
        inventorySearch = event.target.value;
        inventoryCurrentPage = 1;
        renderInventoryGrid();
    });

    qs('#printers-region-select')?.addEventListener('change', event => {
        printersRegion = event.target.value;
        renderPrintersGrid();
    });

    qs('#printers-status-select')?.addEventListener('change', event => {
        printersStatus = event.target.value;
        renderPrintersGrid();
    });

    qs('#sre-search-input')?.addEventListener('input', event => {
        sreSearch = event.target.value;
        renderSreOverviewTab();
    });

    qs('#sre-severity-select')?.addEventListener('change', event => {
        sreSeverity = event.target.value;
        renderSreOverviewTab();
    });

    qs('#sre-type-select')?.addEventListener('change', event => {
        sreType = event.target.value;
        renderSreOverviewTab();
    });

    qs('#sre-toggle-printers')?.addEventListener('change', event => {
        renderSreOverviewTab();
    });

    qs('#sre-clear-muted')?.addEventListener('click', event => {
        sreMutedAssets = [];
        localStorage.removeItem('sre-muted-assets');
        renderSreOverviewTab();
    });

const cityInput = qs('#drawer-city-input');
const suggestionsBox = qs('#cities-autocomplete-suggestions');

if (cityInput && suggestionsBox) {
    const ufMap = {
        11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
        21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
        31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP',
        41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
    };

    const showSuggestions = (query = '') => {
        const normalizedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

        // 1. Filter Custom Units
        let matchedCustom = [];
        if (normalizedQuery) {
            matchedCustom = CUSTOM_UNITS.filter(unit => 
                unit.name.toLowerCase().includes(normalizedQuery) ||
                unit.city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(normalizedQuery)
            );
        } else {
            // Show all when empty/focused
            matchedCustom = [...CUSTOM_UNITS];
        }

        // 2. Filter Brazilian Cities (only if query is at least 2 chars)
        let matchedCities = [];
        if (normalizedQuery.length >= 2) {
            matchedCities = allBrazilianCities
                .filter(city => {
                    const normalizedCity = city.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                    return normalizedCity.includes(normalizedQuery);
                })
                .sort((a, b) => {
                    const normA = a.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                    const normB = b.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                    
                    const startsA = normA.startsWith(normalizedQuery);
                    const startsB = normB.startsWith(normalizedQuery);
                    if (startsA && !startsB) return -1;
                    if (!startsA && startsB) return 1;

                    return a.nome.localeCompare(b.nome);
                })
                .slice(0, 10);
        }

        // Render combined
        let html = '';
        
        if (matchedCustom.length > 0) {
            html += matchedCustom.map(unit => `
                <div class="autocomplete-suggestion custom-unit-suggestion" data-city-name="${escapeHtml(unit.name)}" data-custom-region="${escapeHtml(unit.region)}" style="background: rgba(78, 167, 255, 0.04); border-left: 3px solid var(--blue); font-weight: 600; padding: 10px 12px; margin-bottom: 2px; border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                    ⭐ <strong>${escapeHtml(unit.name)}</strong> - ${escapeHtml(unit.city)} (${escapeHtml(unit.state)})
                </div>
            `).join('');
        }

        if (matchedCities.length > 0) {
            html += matchedCities.map(city => {
                const uf = ufMap[city.codigo_uf] || '';
                const name = city.nome;
                let highlightedName = name;
                if (normalizedQuery) {
                    const regex = new RegExp(`(${query})`, 'gi');
                    highlightedName = name.replace(regex, '<strong>$1</strong>');
                }
                return `<div class="autocomplete-suggestion" data-city-name="${escapeHtml(name)}" style="padding: 10px 12px; margin-bottom: 2px; border-radius: 4px; cursor: pointer; transition: all 0.2s;">${highlightedName} - ${uf}</div>`;
            }).join('');
        }

        if (html) {
            suggestionsBox.innerHTML = html;
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
            suggestionsBox.innerHTML = '';
        }
    };

    cityInput.addEventListener('input', event => {
        showSuggestions(event.target.value);
    });

    cityInput.addEventListener('focus', event => {
        showSuggestions(event.target.value);
    });

    suggestionsBox.addEventListener('click', event => {
        const suggestion = event.target.closest('.autocomplete-suggestion');
        if (suggestion) {
            const cityName = suggestion.dataset.cityName;
            cityInput.value = cityName;
            suggestionsBox.style.display = 'none';
            suggestionsBox.innerHTML = '';

            const customRegion = suggestion.dataset.customRegion;
            const select = qs('#drawer-region-select');
            if (select) {
                if (customRegion && customRegion !== 'none') {
                    select.value = customRegion;
                } else {
                    const region = getRegionFromCity(cityName);
                    if (region !== 'none') select.value = region;
                }
            }
        }
    });

    document.addEventListener('click', event => {
        if (!cityInput.contains(event.target) && !suggestionsBox.contains(event.target)) {
            suggestionsBox.style.display = 'none';
        }
    });

    cityInput.addEventListener('change', event => {
        const region = getRegionFromCity(event.target.value);
        const select = qs('#drawer-region-select');
        if (select && region !== 'none') {
            select.value = region;
        }
    });

    const pillsContainer = qs('.quick-unit-pills');
    if (pillsContainer) {
        pillsContainer.addEventListener('click', event => {
            const pill = event.target.closest('.quick-unit-pill');
            if (pill) {
                const unit = pill.dataset.unit;
                const region = pill.dataset.region;
                if (cityInput) {
                    cityInput.value = unit;
                }
                const select = qs('#drawer-region-select');
                if (select && region) {
                    select.value = region;
                }
                if (suggestionsBox) {
                    suggestionsBox.style.display = 'none';
                    suggestionsBox.innerHTML = '';
                }
            }
        });
    }
}

    qs('#btn-save-drawer-location')?.addEventListener('click', saveDeviceLocation);

    qsa('.filter-btn').forEach(button => {
        button.addEventListener('click', () => {
            qsa('.filter-btn').forEach(item => item.classList.remove('active'));
            button.classList.add('active');
            statusFilter = button.dataset.filter || 'all';
            renderLinksGrid();
            renderPrintersGrid();
        });
    });

    qs('#sound-btn')?.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        const button = qs('#sound-btn');
        button.classList.toggle('active', soundEnabled);
        button.innerHTML = soundEnabled ? '<i data-lucide="volume-2"></i>' : '<i data-lucide="volume-x"></i>';
        renderIcons();
    });

    qs('#simulate-refill-btn')?.addEventListener('click', triggerRandomSimulatedRefill);
    qs('#refresh-trigger')?.addEventListener('click', () => {
        fetchStatus();
        startRefreshCountdown();
    });
    qs('#btn-save-settings')?.addEventListener('click', saveConfigSettings);
    qs('#btn-test-telegram')?.addEventListener('click', testTelegramIntegration);
    qs('#drawer-overlay')?.addEventListener('click', closePrinterDrawer);
    qs('#drawer-close-btn')?.addEventListener('click', closePrinterDrawer);
    qs('#btn-run-diagnostics')?.addEventListener('click', runDiagnostics);
    qs('#btn-network-sweep')?.addEventListener('click', runNetworkSweep);
    qs('#btn-copy-report')?.addEventListener('click', copyDrawerReport);
    qs('#btn-delete-zabbix')?.addEventListener('click', deleteDeviceFromZabbix);
    qs('#btn-sim-print-mono')?.addEventListener('click', () => runSimulatePrint('black'));
    qs('#btn-sim-print-color')?.addEventListener('click', () => runSimulatePrint('color'));
    qs('#btn-sim-refill-toner')?.addEventListener('click', runSimulateRefill);
    qs('#btn-close-notification')?.addEventListener('click', () => {
        qs('#exchange-notification-overlay')?.classList.remove('active');
    });
    qs('#btn-generate-report')?.addEventListener('click', generateHistoricalReport);
    qs('#btn-export-pdf')?.addEventListener('click', exportReportToPDF);
    qs('#btn-refresh-history')?.addEventListener('click', initializeHistoryTab);

    let historySearchTimeout = null;
    qs('#history-search-input')?.addEventListener('input', () => {
        if (historySearchTimeout) clearTimeout(historySearchTimeout);
        historySearchTimeout = setTimeout(initializeHistoryTab, 300);
    });
    qs('#history-status-select')?.addEventListener('change', initializeHistoryTab);
    qs('#history-range-select')?.addEventListener('change', initializeHistoryTab);
    qs('#btn-export-history')?.addEventListener('click', exportHistoryToCSV);
}

let chartHistoryFrequencyInstance = null;
let currentFetchedIncidents = [];

async function initializeHistoryTab() {
    const tbody = qs('#history-events-tbody');
    const tonerTbody = qs('#history-toner-tbody');
    if (!tbody) return;
    
    const searchVal = qs('#history-search-input')?.value || '';
    const statusVal = qs('#history-status-select')?.value || 'all';
    const rangeVal = qs('#history-range-select')?.value || 'all';
    
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 24px; font-size: 13px; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Carregando histórico...</td></tr>`;
    if (tonerTbody) {
        tonerTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 24px; font-size: 13px; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Carregando trocas...</td></tr>`;
    }
    
    try {
        const urlParams = new URLSearchParams({
            search: searchVal,
            status: statusVal,
            range: rangeVal
        });
        
        const tonerUrlParams = new URLSearchParams({
            search: searchVal,
            range: rangeVal
        });
        
        const [res, tonerRes] = await Promise.all([
            fetch(`/api/incidents?${urlParams.toString()}`),
            fetch(`/api/printer-exchanges?${tonerUrlParams.toString()}`)
        ]);
        
        if (!res.ok) throw new Error('Falha ao buscar incidentes');
        const data = await res.json();
        
        let tonerData = [];
        if (tonerRes && tonerRes.ok) {
            tonerData = await tonerRes.json();
        }
        
        const incidents = data.incidents || [];
        currentFetchedIncidents = incidents;
        
        // 1. Atualizar cards de KPI
        const stats = data.stats || {};
        setText('#history-stat-total', String(stats.total ?? 0));
        setText('#history-stat-active', String(stats.active ?? 0));
        setText('#history-stat-avg-duration', stats.avgDurationText || '--');
        setText('#history-stat-worst-link', stats.worstLink || '--');
        
        // 2. Renderizar gráfico de frequência diária
        renderHistoryFrequencyChart(data.chartData || []);
        
        // 3. Preencher tabela de incidentes
        if (incidents.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 24px; font-size: 13px; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Nenhum incidente registrado no histórico com os filtros atuais.</td></tr>`;
        } else {
            tbody.innerHTML = incidents.map(inc => {
                const downDate = formatDateTime(inc.down_at);
                const upDate = inc.up_at ? formatDateTime(inc.up_at) : '<span style="color: #ffaa00; font-weight: 600;">Ativo</span>';
                const duration = inc.duration_text ? inc.duration_text : '--';
                const statusClass = inc.status === 'active' ? 'danger' : 'success';
                const statusLabel = inc.status === 'active' ? 'Fora' : 'Resolvido';
                
                return `
                    <tr class="clickable-row" data-open-type="link" data-open-id="${inc.link_id || ''}" style="cursor: pointer; transition: background 0.15s;" onmouseover="this.style.backgroundColor='rgba(116, 137, 160, 0.08)'" onmouseout="this.style.backgroundColor='transparent'">
                        <td style="font-weight: 600; color: #f3f8ff; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px;">${inc.name}</td>
                        <td style="color: #a7b7c8; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px;">${downDate}</td>
                        <td style="color: #a7b7c8; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px;">${upDate}</td>
                        <td style="font-weight: 500; color: #cbd5e1; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px;">${duration}</td>
                        <td style="padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left;"><span class="badge ${statusClass}">${statusLabel}</span></td>
                    </tr>
                `;
            }).join('');
        }
        
        // 4. Preencher tabela de trocas de suprimentos
        if (tonerTbody) {
            if (tonerData.length === 0) {
                tonerTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 24px; font-size: 13px; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Nenhuma troca registrada no histórico com os filtros atuais.</td></tr>`;
            } else {
                tonerTbody.innerHTML = tonerData.map(exc => {
                    const excDate = formatDateTime(exc.timestamp);
                    const isToner = exc.type === 'toner';
                    const badgeClass = isToner ? 'info' : 'warning';
                    const badgeLabel = isToner ? 'Toner' : 'Coletor';
                    
                    return `
                        <tr class="clickable-row" data-open-type="printer" data-open-id="${exc.printerId || ''}" style="cursor: pointer; transition: background 0.15s;" onmouseover="this.style.backgroundColor='rgba(116, 137, 160, 0.08)'" onmouseout="this.style.backgroundColor='transparent'">
                            <td style="font-weight: 600; color: #f3f8ff; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px;">${exc.printerName}</td>
                            <td style="color: #cbd5e1; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${exc.message}">${exc.message}</td>
                            <td style="color: #a7b7c8; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px;">${excDate}</td>
                            <td style="padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left;"><span class="badge ${badgeClass}">${badgeLabel}</span></td>
                        </tr>
                    `;
                }).join('');
            }
        }
        
        renderIcons();
    } catch (err) {
        console.error('[HISTORY] Erro ao carregar histórico:', err);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--red); padding: 24px; font-size: 13px; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Erro ao carregar dados. Tente novamente.</td></tr>`;
        if (tonerTbody) {
            tonerTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--red); padding: 24px; font-size: 13px; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Erro ao carregar dados.</td></tr>`;
        }
    }
}

function renderHistoryFrequencyChart(chartData) {
    const canvas = qs('#chart-history-frequency');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Ordenar cronologicamente por data
    chartData.sort((a, b) => a.date.localeCompare(b.date));
    
    const labels = chartData.map(d => {
        try {
            const date = new Date(d.date + 'T00:00:00');
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        } catch (e) {
            return d.date;
        }
    });
    const counts = chartData.map(d => d.count);
    
    if (chartHistoryFrequencyInstance) {
        chartHistoryFrequencyInstance.destroy();
        chartHistoryFrequencyInstance = null;
    }
    
    chartHistoryFrequencyInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ocorrências',
                data: counts,
                backgroundColor: 'rgba(239, 83, 80, 0.65)',
                borderColor: '#ef5350',
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0c0f12',
                    titleColor: '#a4b3c1',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(116, 137, 160, 0.3)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8c9ba5', font: { size: 10 } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { 
                        color: '#8c9ba5', 
                        font: { size: 10 },
                        precision: 0
                    }
                }
            }
        }
    });
}

function exportHistoryToCSV() {
    if (!currentFetchedIncidents || currentFetchedIncidents.length === 0) {
        triggerExchangeNotification('Exportar Histórico', 'Nenhum dado disponível para exportação com os filtros atuais.', 'Erro');
        return;
    }
    
    let csvContent = "Ativo;Inicio Queda;Restabelecimento;Tempo Fora;Status\r\n";
    
    currentFetchedIncidents.forEach(inc => {
        const downStr = formatDateTime(inc.down_at);
        const upStr = inc.up_at ? formatDateTime(inc.up_at) : 'Ativo';
        const durationStr = inc.duration_text || '--';
        const statusStr = inc.status === 'active' ? 'Fora' : 'Resolvido';
        
        const row = [
            inc.name.replace(/;/g, ','),
            downStr,
            upStr,
            durationStr,
            statusStr
        ].join(';');
        
        csvContent += row + "\r\n";
    });
    
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `NOC_Historico_Incidentes_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    triggerExchangeNotification('Exportar Histórico', 'Relatório exportado com sucesso no formato CSV.', 'Exportado OK');
}

setInterval(() => {
    setText('#clock', new Date().toLocaleTimeString('pt-BR'));
}, 1000);

async function initCitiesDatalist() {
    try {
        const res = await fetch('municipios.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('Falha ao carregar municipios.json');
        allBrazilianCities = await res.json();
        console.log(`[CITIES] ${allBrazilianCities.length} cidades brasileiras carregadas com sucesso.`);
    } catch (e) {
        console.error('[DATALIST] Erro ao buscar cidades do Brasil:', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const savedThemeColor = localStorage.getItem('noc-theme-color') || 'blue';
    document.body.setAttribute('data-theme-color', savedThemeColor);
    qsa('.color-dot').forEach(dot => {
        dot.classList.toggle('active', dot.dataset.color === savedThemeColor);
    });

    const savedTheme = localStorage.getItem('noc-theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        document.body.setAttribute('data-theme', 'light');
        const icon = qs('#theme-icon');
        if (icon) icon.setAttribute('data-lucide', 'moon');
    }

    initCitiesDatalist();
    setupModuleHeaders();
    renderIcons();
    setupEventListeners();
    setupSpotlight();
    setupVoiceAlertSettings();
    setupSreChatListeners();
    setupRunbookListeners();
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab') || 'tab-dashboard';
    setActiveTab(initialTab);
    initAnalyticalCharts();
    loadConfigSettings();
    loadTelegramStatus();
    fetchStatus();
    startRefreshCountdown();
});

// ========================================================================
// LÓGICA DE HISTÓRICO & RELATÓRIOS WAN (SQLite + Chart.js)
// ========================================================================

let chartDrawerTrendInstance = null;
let chartReportLatencyInstance = null;
let chartReportTrafficInstance = null;

// 1. Renderizar gráfico de tendência individual dentro do drawer lateral (Solicitado pelo usuário)
// 1. Renderizar gráfico de tendência individual dentro do drawer lateral (Solicitado pelo usuário)
async function renderDrawerTrendChart(linkId) {
    const container = qs('#drawer-network-trend-panel');
    if (!container) return;

    if (selectedType !== 'link') {
        container.hidden = true;
        if (chartDrawerTrendInstance) {
            chartDrawerTrendInstance.destroy();
            chartDrawerTrendInstance = null;
        }
        return;
    }

    container.hidden = false;

    const item = deviceBySelection();
    if (item) {
        const headerSpan = qs('#drawer-network-trend-header span');
        if (headerSpan) {
            headerSpan.textContent = `${item.name}: response time`;
        }
    }

    try {
        const response = await fetch(`/api/reports/trend?linkId=${encodeURIComponent(linkId)}&limit=20`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Erro ao buscar dados históricos');
        const trendData = await response.json();

        const ctx = qs('#chart-drawer-trend');
        if (!ctx) return;

        if (chartDrawerTrendInstance) {
            chartDrawerTrendInstance.destroy();
            chartDrawerTrendInstance = null;
        }

        const labels = trendData.map(d => d.time);
        const latencies = trendData.map(d => d.latency);

        const threshold = Number(metaData?.thresholds?.latency || 120);
        const thresholdData = Array(labels.length).fill(threshold);

        chartDrawerTrendInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'response time',
                        data: latencies,
                        borderColor: '#2ebd59', // Zabbix green line
                        backgroundColor: 'rgba(46, 189, 89, 0.82)', // Zabbix semi-solid filled area
                        borderWidth: 1.5,
                        tension: 0, // Straight lines like Zabbix print!
                        fill: true,
                        pointRadius: 0, // No point markers like Zabbix print!
                        yAxisID: 'y'
                    },
                    {
                        label: `Trigger: ICMP: High ICMP ping response time [> ${threshold}ms]`,
                        data: thresholdData,
                        borderColor: '#ffaa00', // Yellow/orange dashed trigger line
                        borderWidth: 1.5,
                        borderDash: [6, 4],
                        fill: false,
                        pointRadius: 0,
                        yAxisID: 'y'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false // Hide Chart.js default legend
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: '#0c0f12',
                        titleColor: '#a4b3c1',
                        bodyColor: '#ffffff',
                        borderColor: 'rgba(116, 137, 160, 0.3)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: { 
                            color: 'rgba(255, 255, 255, 0.06)',
                            drawTicks: true
                        },
                        ticks: { 
                            font: { size: 9, family: 'Consolas, "Courier New", monospace' }, 
                            color: '#7f8a93' 
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        grid: { 
                            color: 'rgba(255, 255, 255, 0.06)',
                            drawTicks: true
                        },
                        ticks: { 
                            font: { size: 9, family: 'Consolas, "Courier New", monospace' }, 
                            color: '#7f8a93',
                            callback: function(value) {
                                return value + ' ms';
                            }
                        }
                    }
                }
            }
        });

        // Render dynamic Zabbix statistics legend below
        const zabbixLegend = qs('#zabbix-drawer-legend');
        if (zabbixLegend) {
            const lastVal = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
            const minVal = latencies.length > 0 ? Math.min(...latencies) : 0;
            const maxVal = latencies.length > 0 ? Math.max(...latencies) : 0;
            const avgVal = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

            zabbixLegend.innerHTML = `
                <div class="zabbix-legend-row">
                    <span class="zabbix-legend-square">■</span>
                    <span class="zabbix-legend-name">response time [todos]</span>
                    <span class="zabbix-legend-stats">
                        último: <strong>${lastVal}ms</strong> &nbsp;&nbsp;
                        mín: <strong>${minVal}ms</strong> &nbsp;&nbsp;
                        méd: <strong>${avgVal}ms</strong> &nbsp;&nbsp;
                        máx: <strong>${maxVal}ms</strong>
                    </span>
                </div>
                <div class="zabbix-legend-row">
                    <span class="zabbix-legend-triangle">▲</span>
                    <span class="zabbix-legend-name" style="color: #ffaa00;">Trigger: ICMP: High ICMP ping response time</span>
                    <span class="zabbix-legend-threshold">[> ${threshold}ms]</span>
                </div>
            `;
        }

        renderIcons();
    } catch (e) {
        console.error('Falha ao renderizar gráfico de tendência no drawer:', e);
    }
}

// 2. Inicializar a aba de relatórios gerais carregando os dispositivos cadastrados no banco
async function initializeReportsTab() {
    const select = qs('#report-device-select');
    if (!select) return;

    try {
        const response = await fetch('/api/reports/devices', { cache: 'no-store' });
        if (!response.ok) throw new Error('Erro ao obter dispositivos do Zabbix');
        const devices = await response.json();

        const prevVal = select.value;
        
        select.innerHTML = '<option value="all">Consolidado Geral WAN (Todos os Links)</option>' +
            devices.map(d => `<option value="${escapeHtml(d.link_id)}">${escapeHtml(d.name)}</option>`).join('');
            
        if (prevVal && (prevVal === 'all' || devices.some(d => String(d.link_id) === prevVal))) {
            select.value = prevVal;
        } else {
            select.value = 'all';
        }

        // Pré-carrega o relatório geral imediatamente
        generateHistoricalReport();
    } catch (e) {
        console.error('Falha ao carregar dispositivos para relatório:', e);
    }
}

// 3. Consultar a API do SQLite local e gerar gráficos e KPIs analíticos na tela
async function generateHistoricalReport() {
    const linkId = qs('#report-device-select')?.value;
    const range = qs('#report-range-select')?.value || '24h';
    const container = qs('#report-results-container');

    if (!linkId) {
        triggerExchangeNotification('Relatório WAN', 'Por favor, selecione uma conexão WAN válida antes de gerar o relatório.', 'Selecione um link');
        return;
    }

    try {
        // Fetch Summary KPIs
        const resSummary = await fetch(`/api/reports/summary?linkId=${encodeURIComponent(linkId)}&range=${range}`, { cache: 'no-store' });
        if (!resSummary.ok) throw new Error('Erro ao obter resumo do relatório');
        const summary = await resSummary.json();

        // Atualizar KPIs Consolidados
        setText('#report-kpi-uptime', `${summary.uptime.toFixed(2)}%`);
        setText('#report-kpi-latency', `${summary.avgLatency} ms`);
        setText('#report-kpi-loss', `${summary.maxLoss}%`);
        setText('#report-kpi-traffic', `${summary.peakTraffic} Mbps`);

        // Fetch Série Temporal
        const resTrend = await fetch(`/api/reports/trend?linkId=${encodeURIComponent(linkId)}&range=${range}`, { cache: 'no-store' });
        if (!resTrend.ok) throw new Error('Erro ao obter série temporal do relatório');
        const trend = await resTrend.json();

        if (container) container.hidden = false;

        // Preencher Ficha Técnica e Metadados do Link
        const linkMeta = linksData.find(l => String(l.id) === String(linkId));
        const metadataGrid = qs('#report-metadata-grid');
        if (metadataGrid) {
            if (linkId === 'all') {
                const totalLinks = linksData.length;
                const onlineLinks = linksData.filter(l => l.status === 'online').length;
                const alertLinks = linksData.filter(l => l.status === 'warning').length;
                const offlineLinks = linksData.filter(l => l.status === 'offline').length;
                
                metadataGrid.innerHTML = [
                    metricBox('Total de Conexões WAN', `${totalLinks} ativas`),
                    metricBox('Estado da Frota', `Online: ${onlineLinks} · Alerta: ${alertLinks} · Fora: ${offlineLinks}`),
                    metricBox('Target SLA Corporativo', '99.50% uptime'),
                    metricBox('Monitor Local NOC', metaData.localInternetStatus || 'UP'),
                    metricBox('Integração Telegram', metaData.zabbixConfigured ? 'Configurado' : 'Simulação')
                ].join('');
            } else if (linkMeta) {
                const limitLatency = metaData?.thresholds?.latency || 120;
                metadataGrid.innerHTML = [
                    metricBox('Gateway IP', linkMeta.ip || 'N/D'),
                    metricBox('Banda Contratada', `${linkMeta.bandwidth || '--'} Mbps`),
                    metricBox('Limite de Latência (SLA)', `${limitLatency} ms`),
                    metricBox('Status Atual', linkMeta.status === 'online' ? 'Online (Disponível)' : 'Offline (Inoperante)'),
                    metricBox('Jitter Médio Coletado', `${linkMeta.jitter ?? '--'} ms`),
                    metricBox('Acesso Remoto', linkMeta.routerAccess?.enabled ? 'Configurado' : 'Não configurado')
                ].join('');
            } else {
                metadataGrid.innerHTML = '<p style="font-size: 12px; color: #8c9ba5; padding: 10px;">Metadados indisponíveis em cache local.</p>';
            }
        }

        // Preencher Consolidação Operacional (SLA) em texto limpo
        const reportText = qs('#report-operational-text');
        if (reportText) {
            const name = linkId === 'all' ? 'Consolidado Geral WAN (Todos os Links)' : (linkMeta ? linkMeta.name : 'Conexão WAN');
            const ip = linkId === 'all' ? 'Multi-Gateway' : (linkMeta ? linkMeta.ip : 'N/D');
            const slaStatus = summary.uptime >= 99.5 ? 'CONFORME (Excelente)' : (summary.uptime >= 98.0 ? 'ATENÇÃO (Instabilidades leves)' : 'CRÍTICO (Violação de SLA)');
            
            let action = 'Manter monitoramento de telemetria ativo.';
            if (linkId === 'all') {
                if (summary.uptime < 99.5) {
                    action = 'Revisar infraestrutura das filiais com baixa disponibilidade e acionar provedores locais.';
                }
            } else {
                if (summary.uptime < 99.5) {
                    action = 'Acionar operadora para verificação de circuito/sinal físico.';
                } else if (summary.maxLoss > 20) {
                    action = 'Acompanhar flutuações e perda de pacotes no switch local.';
                }
            }

            const docText = `=== RELATÓRIO DE COMPORTAMENTO E SLA DE REDE ===
Data da Geração: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}
Período Analisado: ${range === '24h' ? 'Últimas 24 Horas' : (range === '7d' ? 'Últimos 7 Dias' : 'Últimos 30 Dias')}
Ativo Monitorado: ${name}
Endereço IP: ${ip}

--- MÉTRICAS CONSOLIDADAS ---
Uptime Operacional: ${summary.uptime.toFixed(2)}%
Média de Latência: ${summary.avgLatency} ms
Perda Máxima de Pacotes: ${summary.maxLoss}%
Pico de Tráfego de Banda: ${summary.peakTraffic} Mbps

--- AVALIAÇÃO DE DESEMPENHO ---
Status de Qualidade: ${slaStatus}
Diretriz de NOC: ${action}
==============================================`;

            reportText.textContent = docText;

            // Setup Copy Button listener
            const copyBtn = qs('#btn-copy-report-text');
            if (copyBtn) {
                const newCopyBtn = copyBtn.cloneNode(true);
                copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
                newCopyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(docText);
                    triggerExchangeNotification('Copiado!', 'Relatório de SLA copiado para a área de transferência.', 'Copiado');
                });
            }
        }

        // Preencher o histórico de quedas no período
        const reportIncidentsTbody = qs('#report-incidents-tbody');
        const reportIncidentsCount = qs('#report-incidents-count');
        const incidents = summary.incidents || [];
        
        if (reportIncidentsCount) {
            reportIncidentsCount.textContent = `${incidents.length} ${incidents.length === 1 ? 'ocorrência' : 'ocorrências'}`;
            reportIncidentsCount.className = incidents.length ? 'count-pill health-pill high' : 'count-pill health-pill nominal';
        }
        
        const theadTr = qs('#report-incidents-thead-tr');
        if (theadTr) {
            if (linkId === 'all') {
                theadTr.innerHTML = `
                    <th style="width: 25%; position: sticky; top: 0; z-index: 1; background: #10161e; color: #b6c4d3; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; padding: 10px 8px; font-size: 11px; font-weight: 600; text-align: left; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Ativo</th>
                    <th style="width: 25%; position: sticky; top: 0; z-index: 1; background: #10161e; color: #b6c4d3; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; padding: 10px 8px; font-size: 11px; font-weight: 600; text-align: left; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Início (Queda)</th>
                    <th style="width: 25%; position: sticky; top: 0; z-index: 1; background: #10161e; color: #b6c4d3; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; padding: 10px 8px; font-size: 11px; font-weight: 600; text-align: left; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Volta (Retorno)</th>
                    <th style="width: 15%; position: sticky; top: 0; z-index: 1; background: #10161e; color: #b6c4d3; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; padding: 10px 8px; font-size: 11px; font-weight: 600; text-align: left; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Duração</th>
                    <th style="width: 10%; position: sticky; top: 0; z-index: 1; background: #10161e; color: #b6c4d3; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; padding: 10px 8px; font-size: 11px; font-weight: 600; text-align: left; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Status</th>
                `;
            } else {
                theadTr.innerHTML = `
                    <th style="width: 30%; position: sticky; top: 0; z-index: 1; background: #10161e; color: #b6c4d3; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; padding: 10px 8px; font-size: 12px; font-weight: 600; text-align: left; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Início (Queda)</th>
                    <th style="width: 30%; position: sticky; top: 0; z-index: 1; background: #10161e; color: #b6c4d3; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; padding: 10px 8px; font-size: 12px; font-weight: 600; text-align: left; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Restabelecimento (Volta)</th>
                    <th style="width: 25%; position: sticky; top: 0; z-index: 1; background: #10161e; color: #b6c4d3; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; padding: 10px 8px; font-size: 12px; font-weight: 600; text-align: left; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Duração da Queda</th>
                    <th style="width: 15%; position: sticky; top: 0; z-index: 1; background: #10161e; color: #b6c4d3; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; padding: 10px 8px; font-size: 12px; font-weight: 600; text-align: left; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Status</th>
                `;
            }
        }
        
        if (reportIncidentsTbody) {
            if (incidents.length === 0) {
                reportIncidentsTbody.innerHTML = `
                    <tr>
                        <td colspan="${linkId === 'all' ? 5 : 4}" style="text-align: center; color: var(--muted); padding: 24px; font-size: 13px; border-bottom: 1px solid rgba(116, 137, 160, 0.14);">Nenhuma queda registrada no período para esta filial.</td>
                    </tr>
                `;
            } else {
                reportIncidentsTbody.innerHTML = incidents.map(inc => {
                    const downDate = formatDateTime(inc.down_at);
                    const upDate = inc.up_at ? formatDateTime(inc.up_at) : '<span style="color: #ffaa00; font-weight: 600;">Ativo</span>';
                    const duration = inc.duration_text ? inc.duration_text : '--';
                    const statusClass = inc.status === 'active' ? 'danger' : 'success';
                    const statusLabel = inc.status === 'active' ? 'Fora' : 'Resolvido';
                    
                    if (linkId === 'all') {
                        return `
                            <tr>
                                <td style="font-weight: 600; color: #f3f8ff; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(inc.name)}</td>
                                <td style="color: #a7b7c8; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px;">${downDate}</td>
                                <td style="color: #a7b7c8; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px;">${upDate}</td>
                                <td style="font-weight: 500; color: #cbd5e1; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px;">${duration}</td>
                                <td style="padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left;"><span class="badge ${statusClass}" style="padding: 2px 6px; font-size: 10px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">${statusLabel}</span></td>
                            </tr>
                        `;
                    } else {
                        return `
                            <tr>
                                <td style="color: #a7b7c8; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px;">${downDate}</td>
                                <td style="color: #a7b7c8; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px;">${upDate}</td>
                                <td style="font-weight: 500; color: #cbd5e1; padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left; font-size: 13px;">${duration}</td>
                                <td style="padding: 12px 8px; border-bottom: 1px solid rgba(116, 137, 160, 0.14); text-align: left;"><span class="badge ${statusClass}" style="padding: 2px 6px; font-size: 10px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">${statusLabel}</span></td>
                            </tr>
                        `;
                    }
                }).join('');
            }
        }

        const labels = trend.map(d => d.time);
        const latencies = trend.map(d => d.latency);
        const losses = trend.map(d => d.packetLoss);
        const traffics = trend.map(d => d.traffic);
        const bandPct = trend.map(d => d.bandwidthUsed);

        // Gráfico 1: Latency & Loss
        const ctxLatency = qs('#chart-report-latency');
        if (ctxLatency) {
            if (chartReportLatencyInstance) {
                chartReportLatencyInstance.destroy();
                chartReportLatencyInstance = null;
            }
            chartReportLatencyInstance = new Chart(ctxLatency, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Latência média (ms)',
                            data: latencies,
                            borderColor: '#56b4ff',
                            backgroundColor: 'rgba(86, 180, 255, 0.08)',
                            borderWidth: 2,
                            tension: 0.3,
                            fill: false,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Perda de pacotes (%)',
                            data: losses,
                            borderColor: '#ef5350',
                            backgroundColor: 'rgba(239, 83, 80, 0.08)',
                            borderWidth: 2,
                            tension: 0.3,
                            fill: false,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: '#9aa7b6' }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: { display: true, text: 'Latência (ms)', color: '#9aa7b6' },
                            ticks: { color: '#9aa7b6' }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            min: 0,
                            max: 100,
                            title: { display: true, text: 'Perda de pacotes (%)', color: '#9aa7b6' },
                            grid: { drawOnChartArea: false },
                            ticks: { color: '#9aa7b6' }
                        }
                    }
                }
            });
        }

        // Gráfico 2: Traffic & Bandwidth Used
        const ctxTraffic = qs('#chart-report-traffic');
        const trafficBox = qs('#box-report-traffic');
        const trafficPlaceholder = qs('#placeholder-report-traffic');

        // Check if traffic values are entirely empty/zero (indicating SNMP not configured)
        const isTrafficEmpty = traffics.every(v => v === 0 || v === null);

        if (isTrafficEmpty) {
            if (trafficBox) trafficBox.style.display = 'none';
            if (trafficPlaceholder) {
                trafficPlaceholder.style.display = 'flex';
                renderIcons();
            }
            if (chartReportTrafficInstance) {
                chartReportTrafficInstance.destroy();
                chartReportTrafficInstance = null;
            }
        } else {
            if (trafficPlaceholder) trafficPlaceholder.style.display = 'none';
            if (trafficBox) trafficBox.style.display = 'block';

            if (ctxTraffic) {
                if (chartReportTrafficInstance) {
                    chartReportTrafficInstance.destroy();
                    chartReportTrafficInstance = null;
                }
                chartReportTrafficInstance = new Chart(ctxTraffic, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: linkId === 'all' ? 'Tráfego Total Consolidado (Mbps)' : 'Tráfego total (Mbps)',
                                data: traffics,
                                borderColor: '#31d394',
                                backgroundColor: 'rgba(49, 211, 148, 0.1)',
                                borderWidth: 2,
                                tension: 0.3,
                                fill: true,
                                yAxisID: 'y'
                            },
                            {
                                label: 'Uso de banda (%)',
                                data: bandPct,
                                borderColor: '#ffa726',
                                backgroundColor: 'rgba(255, 167, 38, 0.05)',
                                borderWidth: 2,
                                tension: 0.3,
                                fill: false,
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { color: '#9aa7b6' }
                            },
                            y: {
                                type: 'linear',
                                display: true,
                                position: 'left',
                                title: { display: true, text: 'Tráfego (Mbps)', color: '#9aa7b6' },
                                ticks: { color: '#9aa7b6' }
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                min: 0,
                                max: 100,
                                title: { display: true, text: 'Uso de banda (%)', color: '#9aa7b6' },
                                grid: { drawOnChartArea: false },
                                ticks: { color: '#9aa7b6' }
                            }
                        }
                    }
                });
            }
        }
    } catch (e) {
        console.error('Falha ao gerar relatório analítico:', e);
        triggerExchangeNotification('Erro de Relatório', 'Falha ao buscar dados históricos do banco SQLite local.', 'Erro');
    }
}

function exportReportToPDF() {
    window.print();
}

function prepareChartsForPrint(isPrint) {
    const textColor = isPrint ? '#1e293b' : '#9aa7b6';
    const gridColor = isPrint ? 'rgba(0, 0, 0, 0.15)' : 'rgba(116, 137, 160, 0.20)';
    
    [chartReportLatencyInstance, chartReportTrafficInstance].forEach(chart => {
        if (!chart) return;
        
        // Update scales
        if (chart.options.scales) {
            Object.keys(chart.options.scales).forEach(scaleKey => {
                const scale = chart.options.scales[scaleKey];
                if (scale.ticks) {
                    scale.ticks.color = textColor;
                }
                if (scale.title) {
                    scale.title.color = textColor;
                }
                if (scale.grid) {
                    scale.grid.color = gridColor;
                }
            });
        }
        
        // Update legend
        if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
            chart.options.plugins.legend.labels.color = textColor;
        }
        
        chart.update('none'); // silent update
    });
}

window.addEventListener('beforeprint', () => {
    prepareChartsForPrint(true);
});

window.addEventListener('afterprint', () => {
    prepareChartsForPrint(false);
});

// ========================================================================
// ABA DE INFRAESTRUTURA: AUDITORIA ZABBIX & SAÚDE ERP (SANKHYA)
// ========================================================================
let infraInitialized = false;
let infraSimulating = false;
let infraSimulationInterval = null;

// Lógica de simulação de carga oscilante para servidores Sankhya
const simulatedInfraData = {
    'SANKHYA - PRODUÇÃO': { cpu: 45, ram: 72, disk: 62, db: 'up', web: 'up', agent: 'up', status: 'online' },
    'SANKHYA - TESTE': { cpu: 12, ram: 54, disk: 48, db: 'up', web: 'up', agent: 'up', status: 'online' }
};

function initializeInfraTab() {
    if (infraInitialized) {
        renderInfraDashboard();
        return;
    }

    // Configurar Switch de Simulação
    const toggleSim = qs('#infra-simulation-toggle');
    if (toggleSim) {
        toggleSim.checked = infraSimulating;
        toggleSim.addEventListener('change', (e) => {
            infraSimulating = e.target.checked;
            if (infraSimulating) {
                startInfraSimulationLoop();
            } else {
                stopInfraSimulationLoop();
            }
            renderInfraDashboard();
        });
    }

    // Configurar Fechamento do Modal de Agent
    const btnCloseModal = qs('#btn-close-agent-modal');
    const btnCloseModalOk = qs('#btn-close-agent-modal-ok');
    const modalOverlay = qs('#agent-modal-overlay');

    if (btnCloseModal && modalOverlay) {
        btnCloseModal.addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });
    }
    if (btnCloseModalOk && modalOverlay) {
        btnCloseModalOk.addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });
    }

    infraInitialized = true;
    renderInfraDashboard();
}

function startInfraSimulationLoop() {
    if (infraSimulationInterval) clearInterval(infraSimulationInterval);
    infraSimulationInterval = setInterval(() => {
        if (!infraSimulating) return;

        // Flutuação realista de hardware
        // Produção flutua entre 35% e 85% de CPU
        simulatedInfraData['SANKHYA - PRODUÇÃO'].cpu = Math.round(35 + Math.random() * 50);
        simulatedInfraData['SANKHYA - PRODUÇÃO'].ram = Math.round(70 + Math.random() * 5);
        
        // Teste flutua entre 5% e 25% de CPU
        simulatedInfraData['SANKHYA - TESTE'].cpu = Math.round(5 + Math.random() * 20);
        simulatedInfraData['SANKHYA - TESTE'].ram = Math.round(52 + Math.random() * 3);

        // Re-renderizar se a aba ativa for Infra
        const activeTab = qs('.nav-item.active');
        if (activeTab && activeTab.dataset.tab === 'tab-infra') {
            renderInfraDashboard();
        }
    }, 3000);
}

function stopInfraSimulationLoop() {
    if (infraSimulationInterval) {
        clearInterval(infraSimulationInterval);
        infraSimulationInterval = null;
    }
}

// Renderiza a Aba de Infraestrutura
function renderInfraDashboard() {
    renderComplianceAuditor();
    renderInfraServers();
}

// 1. Renderiza o Auditor de Conformidade Zabbix
function renderComplianceAuditor() {
    const rulesList = qs('#infra-compliance-rules-list');
    if (!rulesList) return;

    let rules = [];
    let passedCount = 0;
    let totalScore = 100;

    // Regra 1: Links WAN ativos sem tráfego SNMP (Apenas ICMP Ping)
    const linksWithPingOnly = linksData.filter(l => 
        !String(l.name).toLowerCase().includes('sankhya') && 
        (l.traffic === null || l.trafficIn === null)
    );

    if (infraSimulating) {
        // Na simulação, tudo passa
        rules.push({
            status: 'ok',
            title: 'Tráfego WAN & Gateways SNMP',
            desc: 'Todos os 40 links e gateways possuem coletas de tráfego de interface ativas via SNMP.'
        });
        passedCount++;
    } else if (linksWithPingOnly.length > 0) {
        // No modo real, aponta roteadores com falha de SNMP
        totalScore -= Math.min(30, linksWithPingOnly.length * 15);
        rules.push({
            status: 'fail',
            title: 'WAN sem Medição SNMP',
            desc: `${linksWithPingOnly.length} gateways/roteadores operam apenas com ICMP Ping (sem tráfego). Adicione o template SNMP de interface (ex: GATEWAY Century, SPO Americanet).`
        });
    } else {
        rules.push({
            status: 'ok',
            title: 'Tráfego WAN & Gateways SNMP',
            desc: 'Todos os links e gateways possuem monitoramento de banda SNMP ativo.'
        });
        passedCount++;
    }

    // Regra 2: Servidores Sankhya sem agente ativo
    const sankhyaHosts = linksData.filter(l => String(l.name).toLowerCase().includes('sankhya'));
    const unmonitoredSankhya = sankhyaHosts.filter(s => s.latency === null || s.uptime === null);

    if (infraSimulating) {
        rules.push({
            status: 'ok',
            title: 'Servidores SANKHYA Monitorados',
            desc: 'Servidores de Produção e Teste ativos sob Zabbix Agent 2 nominal (UP).'
        });
        passedCount++;
    } else if (sankhyaHosts.length === 0 || unmonitoredSankhya.length > 0) {
        totalScore -= 50; // 25% para cada Sankhya
        rules.push({
            status: 'fail',
            title: 'Sankhya sem Zabbix Agent',
            desc: 'Servidores do ERP constam sem métricas ativas de hardware. Instale o Zabbix Agent 2.'
        });
    } else {
        rules.push({
            status: 'ok',
            title: 'Servidores SANKHYA Monitorados',
            desc: 'Os servidores de ERP estão sendo monitorados com sucesso via Zabbix Agent 2.'
        });
        passedCount++;
    }

    // Regra 3: Impressoras com falhas SNMP (Sem Serial)
    const printersWithNoSerial = printersData.filter(p => p.serialNumber === 'N/D' || !p.serialNumber);

    if (infraSimulating) {
        rules.push({
            status: 'ok',
            title: 'Frota de Impressoras SNMP',
            desc: 'Todas as impressoras retornando números de série e medidores com sucesso.'
        });
        passedCount++;
    } else if (printersWithNoSerial.length > 0) {
        totalScore -= Math.min(20, printersWithNoSerial.length * 5);
        rules.push({
            status: 'warn',
            title: 'Impressoras sem Serial',
            desc: `${printersWithNoSerial.length} impressoras com leitura de Serial Number N/D. Verifique permissões da Community SNMP.`
        });
    } else {
        rules.push({
            status: 'ok',
            title: 'Frota de Impressoras SNMP',
            desc: 'Toda a frota de impressoras cadastradas possui telemetria de suprimentos nominal.'
        });
        passedCount++;
    }

    // Regra 4: Alinhamento de Frequência de Coleta (Tempo Real)
    rules.push({
        status: 'warn',
        title: 'Frequência de Coleta Real-Time',
        desc: 'Para curvas fluídas no dashboard, garanta que pings ICMP estejam a 15s/30s nos templates Zabbix.'
    });
    passedCount++;

    // Garantir que o score fica entre 0 e 100
    totalScore = Math.max(0, Math.min(100, totalScore));

    // Renderizar HTML das Regras
    rulesList.innerHTML = rules.map(rule => {
        const iconMap = { ok: 'check-circle', warn: 'help-circle', fail: 'x-circle' };
        return `
            <div class="compliance-rule-card ${rule.status}">
                <i data-lucide="${iconMap[rule.status]}"></i>
                <div>
                    <strong>${escapeHtml(rule.title)}</strong>
                    <p>${escapeHtml(rule.desc)}</p>
                </div>
            </div>
        `;
    }).join('');

    // Atualizar Score e Animação Circular
    setText('#infra-compliance-value', `${totalScore}%`);
    const stroke = qs('#infra-compliance-stroke');
    if (stroke) {
        stroke.setAttribute('stroke-dasharray', `${totalScore} 100`);
        stroke.setAttribute('stroke', totalScore >= 90 ? 'var(--green)' : (totalScore >= 70 ? 'var(--amber)' : 'var(--red)'));
    }

    lucide.createIcons({ attrs: { class: 'lucide-icon' } });
}

// 2. Renderiza os Servidores Sankhya
function renderInfraServers() {
    const grid = qs('#infra-servers-grid');
    if (!grid) return;

    const serversList = ['SANKHYA - PRODUÇÃO', 'SANKHYA - TESTE'];

    grid.innerHTML = serversList.map(serverName => {
        const isProd = serverName.includes('PRODUÇÃO');
        const dbType = isProd ? 'ORACLE DB' : 'POSTGRESQL';
        
        let stats = { cpu: 0, ram: 0, disk: 0, db: 'down', web: 'down', agent: 'down', status: 'offline' };
        let monitored = false;

        if (infraSimulating) {
            stats = simulatedInfraData[serverName];
            monitored = true;
        } else {
            // Tenta achar na linksData real
            const hostReal = linksData.find(l => 
                String(l.name).toLowerCase().includes('sankhya') && 
                (isProd ? String(l.name).toLowerCase().includes('producao') : String(l.name).toLowerCase().includes('teste'))
            );

            if (hostReal && hostReal.latency !== null && hostReal.uptime !== null) {
                // Monitoramento Real Ativo!
                stats = {
                    cpu: hostReal.cpuUtil || 12,
                    ram: hostReal.ramUtil || 64,
                    disk: hostReal.diskUsed || 55,
                    db: 'up',
                    web: 'up',
                    agent: 'up',
                    status: 'online'
                };
                monitored = true;
            }
        }

        if (monitored) {
            // Renderiza com dial gauges de CPU/RAM/Disco
            return `
                <div class="server-status-card ${infraSimulating ? 'simulating' : ''}">
                    <div class="server-head">
                        <div class="server-title">
                            <strong>${escapeHtml(serverName)}</strong>
                            <span>IP: camilo.nuvemdatacom.com.br · Uptime: ${infraSimulating ? (isProd ? '124d' : '45d') : 'Ativo'}</span>
                        </div>
                        <span class="state-badge online"><span class="badge-dot"></span>Monitorado</span>
                    </div>
                    <div class="server-body-infra">
                        <div class="server-dial">
                            <span>CPU</span>
                            <strong>${stats.cpu}%</strong>
                        </div>
                        <div class="server-dial">
                            <span>Memória</span>
                            <strong>${stats.ram}%</strong>
                        </div>
                        <div class="server-dial">
                            <span>Disco (SSD)</span>
                            <strong>${stats.disk}% livre</strong>
                        </div>
                    </div>
                    <div class="server-services-row">
                        <span class="service-indicator up"><i data-lucide="check" style="width: 10px; height: 10px; margin-right: 4px;"></i>Zabbix Agent 2</span>
                        <span class="service-indicator up"><i data-lucide="check" style="width: 10px; height: 10px; margin-right: 4px;"></i>${dbType}</span>
                        <span class="service-indicator up"><i data-lucide="check" style="width: 10px; height: 10px; margin-right: 4px;"></i>Sankhya Web</span>
                    </div>
                </div>
            `;
        } else {
            // Exibe o painel de alerta de servidor não monitorado
            return `
                <div class="server-status-card unmonitored">
                    <div class="server-head" style="border-bottom: none; margin-bottom: 0; padding-bottom: 0;">
                        <div class="server-title">
                            <strong>${escapeHtml(serverName)}</strong>
                            <span style="color: var(--red);">Zabbix Agent Inativo</span>
                        </div>
                        <span class="state-badge offline" style="background: rgba(255, 104, 104, 0.08); border-color: rgba(255, 104, 104, 0.28); color: #ffd8d8;">
                            <span class="badge-dot" style="background: var(--red);"></span>Não Monitorado
                        </span>
                    </div>
                    <div class="server-warn-cover" style="margin-top: 14px;">
                        <i data-lucide="alert-triangle" style="width: 28px; height: 28px; color: var(--amber);"></i>
                        <p>Nenhuma métrica de hardware recebida. Instale o agente e associe os templates corretos no Zabbix Server para acender este card.</p>
                        <button class="primary-btn tiny-btn" onclick="openAgentInstallModal()" style="margin-top: 6px;">
                            <i data-lucide="terminal" style="width: 12px; height: 12px; margin-right: 4px;"></i>Instalar Agente
                        </button>
                    </div>
                </div>
            `;
        }
    }).join('');

    lucide.createIcons({ attrs: { class: 'lucide-icon' } });
}

// Abre o modal de instrução do Zabbix Agent
function openAgentInstallModal() {
    const modal = qs('#agent-modal-overlay');
    if (modal) {
        modal.style.display = 'flex';
        lucide.createIcons({ attrs: { class: 'lucide-icon' } });
    }
}

async function saveDeviceLocation() {
    const item = deviceBySelection();
    if (!item) return;

    let cityVal = qs('#drawer-city-input')?.value.trim() || '';
    if (!cityVal) return;

    let regionVal = qs('#drawer-region-select')?.value || 'none';
    const bandwidthInput = qs('#drawer-bandwidth-input');
    const bandwidthVal = bandwidthInput ? parseInt(bandwidthInput.value, 10) : null;
    const btn = qs('#btn-save-drawer-location');
    if (btn) btn.disabled = true;

    try {
        const codeLower = cityVal.toLowerCase();
        const existsCustom = CUSTOM_UNITS.some(u => u.name.toLowerCase() === codeLower);
        const existsCity = allBrazilianCities.some(c => normalizeText(c.nome).toLowerCase() === codeLower);

        if (!existsCustom && !existsCity) {
            // Unidade não cadastrada
            const targetCityName = prompt(`A unidade "${cityVal}" não está cadastrada.\nPara cadastrá-la no NOC, digite o nome do município/cidade onde ela fica (Ex: Juiz de Fora, Campinas, Betim):`);
            if (targetCityName === null) {
                if (btn) btn.disabled = false;
                return; // cancelou
            }
            if (!targetCityName.trim()) {
                alert("Operação cancelada. A cidade/município não pode ser vazia.");
                if (btn) btn.disabled = false;
                return;
            }

            const normalizedTarget = normalizeText(targetCityName).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
            const foundCity = allBrazilianCities.find(item => {
                const itemCityNormalized = normalizeText(item.nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                return itemCityNormalized === normalizedTarget;
            });

            if (!foundCity) {
                alert(`A cidade "${targetCityName}" não foi localizada na base nacional de municípios.\nPor favor, verifique a grafia e tente novamente.`);
                if (btn) btn.disabled = false;
                return;
            }

            const ufMapGlobal = {
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
                state: ufMapGlobal[foundCity.codigo_uf] || ''
            };

            // Adiciona localmente e salva no servidor
            CUSTOM_UNITS.push(newUnit);
            renderQuickPills();
            
            const currentResponse = await fetch('/api/config', { cache: 'no-store' });
            if (!currentResponse.ok) throw new Error('Erro ao ler configuração atual do servidor');
            const currentSettings = await currentResponse.json();

            currentSettings.customUnits = [...CUSTOM_UNITS];
            
            const configSaveResponse = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentSettings)
            });
            if (!configSaveResponse.ok) throw new Error('Falha ao salvar a nova unidade no servidor.');

            // Ajusta o input e a região selecionada para os valores inferidos
            cityVal = newUnit.name;
            if (qs('#drawer-city-input')) qs('#drawer-city-input').value = newUnit.name;
            regionVal = newUnit.region;
            if (qs('#drawer-region-select')) qs('#drawer-region-select').value = newUnit.region;
            
            triggerExchangeNotification(newUnit.name, `Nova unidade cadastrada com sucesso em ${newUnit.city} (${newUnit.state}).`, 'Unidade cadastrada');
        }

        // Obtém latitude e longitude da cidade selecionada (agora que ela existe nos cadastros)
        const info = getRegionAndCoordsFromCity(cityVal);

        const currentResponse = await fetch('/api/config', { cache: 'no-store' });
        if (!currentResponse.ok) throw new Error('Erro ao ler configuração atual do servidor');
        const currentSettings = await currentResponse.json();

        if (!currentSettings.locations) currentSettings.locations = {};
        currentSettings.locations[item.id] = {
            city: cityVal,
            region: regionVal,
            lat: info.lat,
            lng: info.lng,
            bandwidth: Number.isInteger(bandwidthVal) && bandwidthVal > 0 ? bandwidthVal : null
        };

        const saveResponse = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSettings)
        });

        if (!saveResponse.ok) throw new Error('Falha ao gravar configurações no servidor');

        triggerExchangeNotification(item.name, 'Localização e coordenadas geográficas salvas com sucesso.', 'Localização salva');
        
        await fetchStatus(true);
    } catch (e) {
        console.error(e);
        triggerExchangeNotification('Erro de Localização', e.message, 'Erro');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ========================================================================
// ADVANCED SRE INTERACTION (Spotlight, Voice Alerts, SSE Runbooks, Chat)
// ========================================================================

function setupSpotlight() {
    const overlay = qs('#spotlight-overlay');
    const input = qs('#spotlight-input');
    const results = qs('#spotlight-results');
    
    if (!overlay || !input || !results) return;
    
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            openSpotlight();
        }
        if (e.key === 'Escape') {
            closeSpotlight();
        }
    });
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeSpotlight();
        }
    });
    
    input.addEventListener('input', filterSpotlightItems);
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateSpotlight(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateSpotlight(-1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            triggerSpotlightSelection();
        }
    });
}

function openSpotlight() {
    const overlay = qs('#spotlight-overlay');
    const input = qs('#spotlight-input');
    if (!overlay || !input) return;
    
    overlay.style.display = 'flex';
    input.value = '';
    input.focus();
    spotlightActiveIndex = -1;
    filterSpotlightItems();
}

function closeSpotlight() {
    const overlay = qs('#spotlight-overlay');
    if (overlay) overlay.style.display = 'none';
}

function filterSpotlightItems() {
    const input = qs('#spotlight-input');
    const container = qs('#spotlight-results');
    if (!input || !container) return;
    
    const query = input.value.toLowerCase().trim();
    container.innerHTML = '';
    spotlightFilteredItems = [];
    
    const tabs = [
        { name: 'Dashboard / Comando', type: 'tab', id: 'tab-dashboard', icon: 'layout-dashboard' },
        { name: 'Links WAN', type: 'tab', id: 'tab-links', icon: 'network' },
        { name: 'Impressoras', type: 'tab', id: 'tab-printers', icon: 'printer' },
        { name: 'Centro SRE', type: 'tab', id: 'tab-sre', icon: 'brain-circuit' },
        { name: 'Infraestrutura / Servidores', type: 'tab', id: 'tab-infra', icon: 'server' },
        { name: 'Relatórios operacionais', type: 'tab', id: 'tab-reports', icon: 'bar-chart-3' },
        { name: 'Histórico de incidentes', type: 'tab', id: 'tab-history', icon: 'history' },
        { name: 'Configurações do painel', type: 'tab', id: 'tab-settings', icon: 'sliders-horizontal' }
    ];
    
    const links = (linksData || []).map(l => ({
        name: l.name,
        type: 'link',
        id: l.id,
        ip: l.ip,
        status: l.status,
        icon: 'network'
    }));
    
    const printers = (printersData || []).map(p => ({
        name: p.name,
        type: 'printer',
        id: p.id,
        ip: p.ip,
        status: p.status,
        icon: 'printer'
    }));
    
    const allSearchable = [...tabs, ...links, ...printers];
    
    if (query === '') {
        spotlightFilteredItems = allSearchable.filter(item => 
            item.type === 'tab' || item.status === 'offline' || item.status === 'warning'
        ).slice(0, 10);
    } else {
        spotlightFilteredItems = allSearchable.filter(item => 
            item.name.toLowerCase().includes(query) || 
            (item.ip && item.ip.toLowerCase().includes(query)) ||
            item.type.toLowerCase().includes(query)
        ).slice(0, 15);
    }
    
    if (spotlightFilteredItems.length === 0) {
        container.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--muted); font-size: 13px;">Nenhum resultado encontrado para "${escapeHtml(query)}"</div>`;
        return;
    }
    
    spotlightFilteredItems.forEach((item, idx) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `spotlight-item ${idx === 0 ? 'active' : ''}`;
        itemDiv.dataset.index = idx;
        
        itemDiv.style.display = 'flex';
        itemDiv.style.alignItems = 'center';
        itemDiv.style.gap = '12px';
        itemDiv.style.padding = '10px 18px';
        itemDiv.style.cursor = 'pointer';
        itemDiv.style.transition = 'background 0.15s ease';
        itemDiv.style.borderRadius = '6px';
        itemDiv.style.margin = '2px 8px';
        
        if (idx === 0) {
            itemDiv.style.background = 'rgba(255, 255, 255, 0.08)';
            spotlightActiveIndex = 0;
        }
        
        let typeBadge = '';
        if (item.type === 'tab') {
            typeBadge = `<span style="font-size: 9px; text-transform: uppercase; background: rgba(86,180,255,0.15); color: #56b4ff; padding: 2px 6px; border-radius: 4px;">Aba</span>`;
        } else if (item.type === 'link') {
            const color = item.status === 'offline' ? '#ff6868' : (item.status === 'warning' ? '#f5bd4f' : '#31d394');
            typeBadge = `<span style="font-size: 9px; text-transform: uppercase; background: rgba(116, 137, 160, 0.12); color: ${color}; padding: 2px 6px; border-radius: 4px;">Link WAN</span>`;
        } else if (item.type === 'printer') {
            const color = item.status === 'offline' ? '#ff6868' : '#31d394';
            typeBadge = `<span style="font-size: 9px; text-transform: uppercase; background: rgba(116, 137, 160, 0.12); color: ${color}; padding: 2px 6px; border-radius: 4px;">Impressora</span>`;
        }
        
        const ipLabel = item.ip ? `<span style="font-size: 11px; color: var(--muted); font-family: monospace;">(${item.ip})</span>` : '';
        
        itemDiv.innerHTML = `
            <i data-lucide="${item.icon}" style="width: 15px; height: 15px; color: var(--muted);"></i>
            <span style="flex: 1; font-size: 13px; color: #cbd5e1;">${escapeHtml(item.name)} ${ipLabel}</span>
            ${typeBadge}
        `;
        
        itemDiv.addEventListener('mouseenter', () => setSpotlightActive(idx));
        itemDiv.addEventListener('click', () => selectSpotlightItem(item));
        
        container.appendChild(itemDiv);
    });
    
    renderIcons();
}

function setSpotlightActive(index) {
    const items = document.querySelectorAll('.spotlight-item');
    items.forEach(el => {
        el.style.background = 'transparent';
        el.classList.remove('active');
    });
    
    const activeEl = items[index];
    if (activeEl) {
        activeEl.style.background = 'rgba(255, 255, 255, 0.08)';
        activeEl.classList.add('active');
        spotlightActiveIndex = index;
    }
}

function navigateSpotlight(direction) {
    if (spotlightFilteredItems.length === 0) return;
    
    let nextIndex = spotlightActiveIndex + direction;
    if (nextIndex < 0) nextIndex = spotlightFilteredItems.length - 1;
    if (nextIndex >= spotlightFilteredItems.length) nextIndex = 0;
    
    setSpotlightActive(nextIndex);
    
    const activeEl = document.querySelector('.spotlight-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function triggerSpotlightSelection() {
    if (spotlightActiveIndex >= 0 && spotlightActiveIndex < spotlightFilteredItems.length) {
        selectSpotlightItem(spotlightFilteredItems[spotlightActiveIndex]);
    }
}

function selectSpotlightItem(item) {
    closeSpotlight();
    if (item.type === 'tab') {
        setActiveTab(item.id);
    } else {
        openDrawer(item.type, item.id);
    }
}

function setupVoiceAlertSettings() {
    const chk = qs('#settings-voice-alerts');
    const vol = qs('#settings-voice-volume');
    
    if (chk) {
        chk.checked = localStorage.getItem('noc-voice-alerts') === 'true';
        chk.addEventListener('change', () => {
            localStorage.setItem('noc-voice-alerts', chk.checked ? 'true' : 'false');
        });
    }
    
    if (vol) {
        const saved = localStorage.getItem('noc-voice-volume');
        if (saved !== null) vol.value = saved;
        vol.addEventListener('input', () => {
            localStorage.setItem('noc-voice-volume', vol.value);
        });
    }
}

function checkVoiceAlerts(newLinks) {
    const active = qs('#settings-voice-alerts')?.checked;
    
    newLinks.forEach(link => {
        const prev = previousLinkStatuses.get(link.id);
        if (voiceAlertsInitialized && active && prev !== undefined && prev !== link.status) {
            let text = '';
            const cleanName = (link.name || '').replace(/LINK-|VPN-|PRODUÇÃO|\(.*?\)/gi, '').trim();
            if (prev === 'online' && link.status === 'offline') {
                text = `Atenção. Queda de link confirmada para ${cleanName}.`;
            } else if (prev === 'offline' && link.status === 'online') {
                text = `Aviso. Conectividade restabelecida para ${cleanName}.`;
            }
            if (text) speakNotification(text);
        }
        previousLinkStatuses.set(link.id, link.status);
    });
    
    if (!voiceAlertsInitialized && newLinks.length > 0) {
        voiceAlertsInitialized = true;
    }
}

function speakNotification(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR';
        const vol = qs('#settings-voice-volume');
        if (vol) u.volume = parseFloat(vol.value);
        window.speechSynthesis.speak(u);
    }
}

function setupSreChatListeners() {
    const input = qs('#cortex-chat-input');
    const btn = qs('#btn-send-cortex-chat');
    
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendCortexChatMessage();
            }
        });
    }
    
    if (btn) {
        btn.addEventListener('click', sendCortexChatMessage);
    }
}

async function sendCortexChatMessage() {
    const input = qs('#cortex-chat-input');
    const container = qs('#cortex-chat-messages');
    const btn = qs('#btn-send-cortex-chat');
    
    if (!input || !container || !btn) return;
    
    const message = input.value.trim();
    if (!message) return;
    
    appendCortexChatMessage('user', message);
    input.value = '';
    
    input.disabled = true;
    btn.disabled = true;
    const loaderId = appendCortexChatTyping();
    
    try {
        const res = await fetch('/api/cortex/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                history: cortexChatHistory
            })
        });
        
        const data = await res.json();
        removeCortexChatTyping(loaderId);
        
        if (!res.ok) throw new Error(data.error || 'Erro na API');
        
        appendCortexChatMessage('assistant', data.reply);
        
        cortexChatHistory.push({ role: 'user', content: message });
        cortexChatHistory.push({ role: 'assistant', content: data.reply });
        if (cortexChatHistory.length > 20) {
            cortexChatHistory = cortexChatHistory.slice(-20);
        }
    } catch (e) {
        removeCortexChatTyping(loaderId);
        appendCortexChatMessage('assistant', `⚠️ <b>Erro no SRE Cortex:</b> ${e.message}`);
    } finally {
        input.disabled = false;
        btn.disabled = false;
        input.focus();
        container.scrollTop = container.scrollHeight;
    }
}

function appendCortexChatMessage(role, content) {
    const container = qs('#cortex-chat-messages');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = `chat-message ${role}`;
    
    if (role === 'user') {
        div.style.alignSelf = 'flex-end';
        div.style.background = 'rgba(86, 180, 255, 0.12)';
        div.style.border = '1px solid rgba(86, 180, 255, 0.25)';
        div.style.color = '#f3f8ff';
    } else {
        div.style.alignSelf = 'flex-start';
        div.style.background = 'rgba(255, 255, 255, 0.03)';
        div.style.border = '1px solid rgba(116, 137, 160, 0.12)';
        div.style.color = '#cbd5e1';
    }
    
    div.style.padding = '10px 12px';
    div.style.borderRadius = 'var(--radius)';
    div.style.fontSize = '13px';
    div.style.lineHeight = '1.5';
    div.style.maxWidth = '88%';
    div.style.wordBreak = 'break-word';
    div.innerHTML = content;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function appendCortexChatTyping() {
    const container = qs('#cortex-chat-messages');
    if (!container) return '';
    
    const id = 'loader-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'chat-message assistant typing';
    div.style.alignSelf = 'flex-start';
    div.style.background = 'rgba(255, 255, 255, 0.03)';
    div.style.border = '1px solid rgba(116, 137, 160, 0.12)';
    div.style.padding = '10px 12px';
    div.style.borderRadius = 'var(--radius)';
    div.style.color = 'var(--muted)';
    div.style.fontSize = '12px';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '6px';
    
    div.innerHTML = `<span class="typing-dot" style="width: 6px; height: 6px; background: var(--muted); border-radius: 50%; display: inline-block; animation: typing-bounce 1s infinite alternate;"></span>
                     <span class="typing-dot" style="width: 6px; height: 6px; background: var(--muted); border-radius: 50%; display: inline-block; animation: typing-bounce 1s infinite alternate; animation-delay: 0.2s;"></span>
                     <span class="typing-dot" style="width: 6px; height: 6px; background: var(--muted); border-radius: 50%; display: inline-block; animation: typing-bounce 1s infinite alternate; animation-delay: 0.4s;"></span>
                     SRE Cortex está pensando...`;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeCortexChatTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function setupRunbookListeners() {
    const btn = qs('#btn-execute-runbook');
    if (btn) {
        btn.addEventListener('click', executeRunbook);
    }
}

async function executeRunbook() {
    const item = deviceBySelection();
    const select = qs('#runbook-action-select');
    const term = qs('#terminal-body');
    const btn = qs('#btn-execute-runbook');
    const badge = qs('#runbook-status-badge');
    
    if (!item || !select || !term || !btn) return;
    
    const runbookId = select.value;
    btn.disabled = true;
    if (badge) {
        badge.textContent = 'Executando...';
        badge.style.color = '#f5bd4f';
    }
    
    term.textContent = '';
    
    try {
        const response = await fetch('/api/runbooks/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: item.id, runbookId })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Erro ao iniciar runbook');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            
            for (const line of lines) {
                if (line.trim().startsWith('data: ')) {
                    try {
                        const payloadStr = line.replace(/^data:\s*/, '');
                        const log = JSON.parse(payloadStr);
                        
                        let prefix = '';
                        if (log.type === 'system') prefix = '⚙️ ';
                        else if (log.type === 'success') prefix = '✔️ ';
                        else if (log.type === 'error') prefix = '❌ ';
                        else if (log.type === 'info') prefix = 'ℹ️ ';
                        
                        term.textContent += `${prefix}${log.text}\n`;
                        term.scrollTop = term.scrollHeight;
                    } catch (e) {}
                }
            }
        }
        
        if (badge) {
            badge.textContent = 'Concluído';
            badge.style.color = '#31d394';
        }
    } catch (e) {
        term.textContent += `❌ Erro na execução: ${e.message}\n`;
        if (badge) {
            badge.textContent = 'Falha';
            badge.style.color = '#ff6868';
        }
    } finally {
        btn.disabled = false;
        renderIcons();
    }
}

function renderInventoryGrid() {
    const grid = qs('#inventory-grid');
    if (!grid) return;

    const filtered = [...computersData].filter(c => {
        const haystack = normalizeText(`${c.name} ${c.ip} ${(c.groups || []).join(' ')} ${c.os || ''} ${c.hardware || ''} ${c.serialNumber || ''} ${c.city || ''} ${c.loggedUser || ''} ${c.antivirus || ''}`);
        const matchesSearch = !inventorySearch || haystack.includes(normalizeText(inventorySearch));
        return matchesSearch;
    }).sort((a, b) => 
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
    );

    if (!filtered.length) {
        grid.innerHTML = '<div class="empty-state">Nenhuma máquina corresponde aos filtros atuais.</div>';
        return;
    }

    // Calcular paginação
    inventoryTotalPages = Math.ceil(filtered.length / inventoryMachinesPerPage) || 1;
    if (inventoryCurrentPage > inventoryTotalPages) {
        inventoryCurrentPage = inventoryTotalPages;
    }
    
    const startIdx = (inventoryCurrentPage - 1) * inventoryMachinesPerPage;
    const endIdx = inventoryCurrentPage * inventoryMachinesPerPage;
    const pagedItems = filtered.slice(startIdx, endIdx);

    let tableHtml = `
        <div class="inventory-table-container">
            <table class="inventory-table">
                <thead>
                    <tr>
                        <th style="width: 60px; text-align: center;">Status</th>
                        <th>Equipamento / Usuário</th>
                        <th>Unidade / Filial</th>
                        <th>Hardware (CPU / RAM)</th>
                        <th>Sistema Operacional</th>
                        <th>Segurança & Updates</th>
                        <th style="width: 100px; text-align: center;">Ações</th>
                    </tr>
                </thead>
                <tbody>
    `;

    tableHtml += pagedItems.map(c => {
        const statusClass = c.status === 'online' ? 'online' : 'offline';
        
        let osIcon = '🖥️';
        if (c.os) {
            const osLower = c.os.toLowerCase();
            if (osLower.includes('windows')) osIcon = '🪟';
            else if (osLower.includes('linux') || osLower.includes('ubuntu') || osLower.includes('debian')) osIcon = '🐧';
        }

        // Unidade (Location Badge - PLATFORM STYLE)
        let locationMarkup = '';
        if (c.city) {
            const regionText = c.customRegion ? ` (${c.customRegion.toUpperCase()})` : '';
            locationMarkup = `
                <span class="location-badge-platform" data-open-type="computer" data-open-id="${escapeHtml(c.id)}">
                    📍 ${escapeHtml(c.city)}${regionText}
                </span>
            `;
        } else {
            locationMarkup = `
                <span style="color: var(--muted); font-style: italic; cursor: pointer; font-size: 11px;" data-open-type="computer" data-open-id="${escapeHtml(c.id)}">
                    Definir unidade... ✏️
                </span>
            `;
        }

        // Hostname + User info (PLATFORM STYLE)
        const userMarkup = c.loggedUser && c.loggedUser !== 'Nenhum'
            ? `<div style="color: var(--muted); font-size: 11px; margin-top: 2px; display: flex; align-items: center; gap: 4px;">
                 <span>👤</span> <span style="color: #9aa7b6;">${escapeHtml(c.loggedUser)}</span>
               </div>`
            : `<div style="color: var(--muted); font-size: 11px; margin-top: 2px;">
                 <span style="font-style: italic; opacity: 0.5;">Ninguém logado</span>
               </div>`;

        const nameMarkup = `
            <div class="host-identity-box">
                <div class="host-avatar-box">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-monitor"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
                </div>
                <div style="display: flex; flex-direction: column;">
                    <strong style="color: #ffffff; cursor: pointer; font-size: 13.5px; font-weight: 600;" data-open-type="computer" data-open-id="${escapeHtml(c.id)}">${escapeHtml(c.name)}</strong>
                    ${userMarkup}
                    <code style="font-size: 9.5px; color: var(--muted); margin-top: 2px; border: none; background: transparent; padding: 0; opacity: 0.7;">IP: ${escapeHtml(c.ip)}</code>
                </div>
            </div>
        `;

        // Hardware cell (CPU + RAM - PLATFORM STYLE)
        const cpuText = c.hardware ? c.hardware.replace(/\s+/g, ' ').trim() : 'Aguardando...';
        const ramText = c.ram || 'N/D';
        const hardwareMarkup = `
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #f3f8ff;">
                <span title="${escapeHtml(cpuText)}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cpu" style="opacity: 0.6;"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 15h3"/><path d="M1 9h3"/><path d="M1 15h3"/></svg>
                    ${escapeHtml(cpuText.split(' @ ')[0])}
                </span>
                <span style="color: var(--muted); font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database" style="opacity: 0.6;"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
                    RAM: ${escapeHtml(ramText)} | 💽 HD: ${escapeHtml(c.disk || 'N/D')}
                </span>
            </div>
        `;

        // System cell (OS + Arch + Serial - PLATFORM STYLE)
        const archText = c.hwArch ? ` (${escapeHtml(c.hwArch)})` : '';
        const serialText = c.serialNumber || 'N/D';
        const osMarkup = `
            <div style="display: flex; flex-direction: column; gap: 3px;">
                <div class="os-badge-cell" title="${escapeHtml(c.os || '')}" style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 13px;">${osIcon}</span>
                    <span style="font-weight: 500; font-size: 12px; color: #f3f8ff;">${escapeHtml((c.os || 'Aguardando...').split(' Build ')[0])}${archText}</span>
                </div>
                <code style="font-size: 9.5px; color: var(--muted); font-family: monospace; border: none; background: transparent; padding: 0; opacity: 0.7;">S/N: ${escapeHtml(serialText)}</code>
            </div>
        `;

        // Security / Patches cell (Antivirus + Updates + Reboot - PLATFORM STYLE)
        let badgesList = [];
        
        // Antivirus badge
        if (c.antivirus && c.antivirus !== 'Nenhum') {
            badgesList.push(`
                <span class="compliance-badge secure" title="Antivírus Ativo">
                    🛡️ ${escapeHtml(c.antivirus)}
                </span>
            `);
        } else if (c.os && c.os.toLowerCase().includes('windows')) {
            badgesList.push(`
                <span class="compliance-badge danger" title="Sem proteção antivírus detectada">
                    ⚠️ Sem Defesa
                </span>
            `);
        }

        // Reboot pending badge
        if (c.rebootPending === 1) {
            badgesList.push(`
                <span class="compliance-badge warning" title="Reinicialização Requerida">
                    🔄 Reiniciar
                </span>
            `);
        }

        // Pending updates count badge
        if (c.pendingUpdates > 0) {
            const updatesClass = c.pendingUpdates > 15 ? 'danger' : 'info';
            badgesList.push(`
                <span class="compliance-badge ${updatesClass}" title="${c.pendingUpdates} atualizações pendentes">
                    📦 ${c.pendingUpdates} updates
                </span>
            `);
        }

        if (badgesList.length === 0) {
            badgesList.push('<span style="color: var(--muted); font-style: italic; font-size: 11px;">Carregando conformidade...</span>');
        }

        const securityMarkup = `
            <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                ${badgesList.join('')}
            </div>
        `;

        return `
            <tr class="${statusClass}">
                <td style="text-align: center; vertical-align: middle;">
                    <span class="agent-status-dot ${statusClass}" title="Zabbix Agent: ${c.status === 'online' ? 'Online' : 'Offline'}" style="margin: 0;"></span>
                </td>
                <td style="vertical-align: middle;">
                    ${nameMarkup}
                </td>
                <td style="vertical-align: middle;">
                    ${locationMarkup}
                </td>
                <td style="vertical-align: middle;">
                    ${hardwareMarkup}
                </td>
                <td style="vertical-align: middle;">
                    ${osMarkup}
                </td>
                <td style="vertical-align: middle;">
                    ${securityMarkup}
                </td>
                <td style="text-align: center; vertical-align: middle;">
                    <button class="inventory-row-action" data-open-type="computer" data-open-id="${escapeHtml(c.id)}">Detalhes</button>
                </td>
            </tr>
        `;
    }).join('\n');

    // Montar controles de paginação (PLATFORM STYLE)
    let paginationHtml = '';
    if (filtered.length > inventoryMachinesPerPage) {
        const startItem = startIdx + 1;
        const endItem = Math.min(filtered.length, endIdx);
        const prevDisabled = inventoryCurrentPage === 1 ? 'disabled' : '';
        const nextDisabled = inventoryCurrentPage >= inventoryTotalPages ? 'disabled' : '';
        
        paginationHtml = `
            <div class="inventory-pagination">
                <div class="inventory-pagination-info">
                    Mostrando ${startItem}-${endItem} de ${filtered.length}
                </div>
                <div class="inventory-pagination-controls">
                    <button class="inventory-pagination-btn" id="btn-inventory-prev" ${prevDisabled}>
                        Anterior
                    </button>
                    <div class="inventory-pagination-current">
                        ${inventoryCurrentPage}
                    </div>
                    <button class="inventory-pagination-btn" id="btn-inventory-next" ${nextDisabled}>
                        Próximo
                    </button>
                </div>
            </div>
        `;
    }

    tableHtml += `
                </tbody>
            </table>
            ${paginationHtml}
        </div>
    `;

    grid.innerHTML = tableHtml;

    // Renderizar estatísticas por unidade na barra lateral
    const counts = {};
    computersData.forEach(c => {
        const unit = c.city || 'Não Definidas';
        counts[unit] = (counts[unit] || 0) + 1;
    });

    const sortedUnits = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const unitsList = qs('#inventory-units-list');
    if (unitsList) {
        if (sortedUnits.length === 0) {
            unitsList.innerHTML = '<span style="color: var(--muted); font-style: italic; font-size: 12px;">Nenhuma unidade mapeada.</span>';
        } else {
            const totalComps = computersData.length;
            unitsList.innerHTML = sortedUnits.map(([unit, count]) => {
                const pct = totalComps > 0 ? (count / totalComps * 100).toFixed(0) : 0;
                let badgeStyle = 'background: rgba(116, 137, 160, 0.12); color: #9aa7b6;';
                if (unit !== 'Não Definidas') {
                    badgeStyle = 'background: rgba(86, 180, 255, 0.08); color: #94d4ff; border: 1px solid rgba(86, 180, 255, 0.18);';
                }
                return `
                    <div class="unit-stat-row" style="display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                            <span style="padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; ${badgeStyle}">
                                ${escapeHtml(unit)}
                            </span>
                            <span style="font-weight: 600; color: #ffffff;">
                                ${count} ${count === 1 ? 'maq.' : 'maqs.'} <span style="color: var(--muted); font-size: 10px; font-weight: normal;">(${pct}%)</span>
                            </span>
                        </div>
                        <div class="progress-bar-bg" style="width: 100%; height: 4px; background: rgba(116, 137, 160, 0.08); border-radius: 2px; overflow: hidden;">
                            <div class="progress-bar-fill" style="width: ${pct}%; height: 100%; background: var(--blue); border-radius: 2px; transition: width 0.6s ease;"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

function renderCockpitComputers() {
    const totalEl = qs('#ops-mach-total');
    const listEl = qs('#dashboard-mach-units');
    if (!listEl) return;

    if (totalEl) {
        totalEl.textContent = computersData.length + ' ' + (computersData.length === 1 ? 'monitorada' : 'monitoradas');
    }

    const counts = {};
    computersData.forEach(c => {
        const unit = c.city || 'Não Definidas';
        counts[unit] = (counts[unit] || 0) + 1;
    });

    const sortedUnits = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const totalComps = computersData.length;

    if (sortedUnits.length === 0) {
        listEl.innerHTML = '<span style="color: var(--muted); font-style: italic; font-size: 11px;">Nenhuma máquina monitorada.</span>';
    } else {
        listEl.innerHTML = sortedUnits.map(([unit, count]) => {
            const pct = totalComps > 0 ? (count / totalComps * 100).toFixed(0) : 0;
            let badgeStyle = 'background: rgba(116, 137, 160, 0.12); color: #9aa7b6;';
            if (unit !== 'Não Definidas') {
                badgeStyle = 'background: rgba(86, 180, 255, 0.08); color: #94d4ff; border: 1px solid rgba(86, 180, 255, 0.18);';
            }
            return `
                <div class="unit-stat-row" style="display: flex; flex-direction: column; gap: 5px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                        <span style="padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; ${badgeStyle}">
                            ${escapeHtml(unit)}
                        </span>
                        <span style="font-weight: 600; color: #ffffff;">
                            ${count} ${count === 1 ? 'maq.' : 'maqs.'} <span style="color: var(--muted); font-size: 10px; font-weight: normal;">(${pct}%)</span>
                        </span>
                    </div>
                    <div class="progress-bar-bg" style="width: 100%; height: 4px; background: rgba(116, 137, 160, 0.08); border-radius: 2px; overflow: hidden;">
                        <div class="progress-bar-fill" style="width: ${pct}%; height: 100%; background: var(--blue); border-radius: 2px; transition: width 0.6s ease;"></div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

function renderQuickPills() {
    const container = qs('.quick-unit-pills');
    if (!container) return;

    // Filtra apenas unidades válidas (com nome e região)
    const validUnits = CUSTOM_UNITS.filter(u => u.name && u.region);
    if (validUnits.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = `
        <span style="color: var(--muted); font-size: 11px; align-self: center; margin-right: 4px;">Sugestões rápidas:</span>
        ${validUnits.map(unit => `
            <span class="quick-unit-pill" data-unit="${escapeHtml(unit.name)}" data-region="${escapeHtml(unit.region)}" style="background: rgba(86, 180, 255, 0.08); border: 1px solid rgba(86, 180, 255, 0.2); color: #94d4ff; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s ease;" onmouseover="this.style.background='rgba(86, 180, 255, 0.18)'" onmouseout="this.style.background='rgba(86, 180, 255, 0.08)'">${escapeHtml(unit.name)}</span>
        `).join('')}
    `;
}














// --- WORLD CUP TEMPORARY MODULE ---
const countryIso2 = {
    "Algeria": "dz",
    "Argentina": "ar",
    "Australia": "au",
    "Austria": "at",
    "Belgium": "be",
    "Bosnia and Herzegovina": "ba",
    "Brazil": "br",
    "Canada": "ca",
    "Cape Verde": "cv",
    "Colombia": "co",
    "Croatia": "hr",
    "CuraÃ§ao": "cw",
    "Curacao": "cw",
    "Czech Republic": "cz",
    "Democratic Republic of the Congo": "cd",
    "Ecuador": "ec",
    "Egypt": "eg",
    "England": "gb",
    "France": "fr",
    "Germany": "de",
    "Ghana": "gh",
    "Haiti": "ht",
    "Iran": "ir",
    "Iraq": "iq",
    "Ivory Coast": "ci",
    "Japan": "jp",
    "Jordan": "jo",
    "Mexico": "mx",
    "Morocco": "ma",
    "Netherlands": "nl",
    "New Zealand": "nz",
    "Norway": "no",
    "Panama": "pa",
    "Paraguay": "py",
    "Portugal": "pt",
    "Qatar": "qa",
    "Saudi Arabia": "sa",
    "Scotland": "gb-sct",
    "Senegal": "sn",
    "South Africa": "za",
    "South Korea": "kr",
    "Spain": "es",
    "Sweden": "se",
    "Switzerland": "ch",
    "Tunisia": "tn",
    "Turkey": "tr",
    "United States": "us",
    "Uruguay": "uy",
    "Uzbekistan": "uz"
};

const countryCodes = {
    "Algeria": "ALG",
    "Argentina": "ARG",
    "Australia": "AUS",
    "Austria": "AUT",
    "Belgium": "BEL",
    "Bosnia and Herzegovina": "BIH",
    "Brazil": "BRA",
    "Canada": "CAN",
    "Cape Verde": "CPV",
    "Colombia": "COL",
    "Croatia": "CRO",
    "CuraÃ§ao": "CUW",
    "Curacao": "CUW",
    "Czech Republic": "CZE",
    "Democratic Republic of the Congo": "COD",
    "Equador": "ECU",
    "Ecuador": "ECU",
    "Egypt": "EGY",
    "England": "ING",
    "France": "FRA",
    "Germany": "GER",
    "Ghana": "GHA",
    "Haiti": "HAI",
    "Iran": "IRN",
    "Iraq": "IRQ",
    "Ivory Coast": "CIV",
    "Japan": "JPN",
    "Jordan": "JOR",
    "Mexico": "MEX",
    "Morocco": "MAR",
    "Netherlands": "NED",
    "New Zealand": "NZL",
    "Norway": "NOR",
    "Panama": "PAN",
    "Paraguay": "PAR",
    "Portugal": "POR",
    "Qatar": "QAT",
    "Saudi Arabia": "KSA",
    "Scotland": "ESC",
    "Senegal": "SEN",
    "South Africa": "RSA",
    "South Korea": "KOR",
    "Spain": "ESP",
    "Sweden": "SWE",
    "Switzerland": "SUI",
    "Tunisia": "TUN",
    "Turkey": "TUR",
    "United States": "USA",
    "Uruguay": "URU",
    "Uzbekistan": "UZB"
};

const translateCountry = {
    "Algeria": "Arg\u00e9lia",
    "Argentina": "Argentina",
    "Australia": "Austr\u00e1lia",
    "Austria": "\u00c1ustria",
    "Belgium": "B\u00e9lgica",
    "Bosnia and Herzegovina": "B\u00f3snia",
    "Brazil": "Brasil",
    "Canada": "Canad\u00e1",
    "Cape Verde": "Cabo Verde",
    "Colombia": "Col\u00f4mbia",
    "Croatia": "Cro\u00e1cia",
    "CuraÃ§ao": "Cura\u00e7\u00e3o",
    "Curacao": "Cura\u00e7\u00e3o",
    "Czech Republic": "Ch\u00e9quia",
    "Democratic Republic of the Congo": "RD Congo",
    "Ecuador": "Equador",
    "Egypt": "Egito",
    "England": "Inglaterra",
    "France": "Fran\u00e7a",
    "Germany": "Alemanha",
    "Ghana": "Gana",
    "Haiti": "Haiti",
    "Iran": "Ir\u00e3",
    "Iraq": "Iraque",
    "Ivory Coast": "Costa do Marfim",
    "Japan": "Jap\u00e3o",
    "Jordan": "Jord\u00e2nia",
    "Mexico": "M\u00e9xico",
    "Morocco": "Marrocos",
    "Netherlands": "Holanda",
    "New Zealand": "Nova Zel\u00e2ndia",
    "Norway": "Noruega",
    "Panama": "Panam\u00e1",
    "Paraguay": "Paraguai",
    "Portugal": "Portugal",
    "Qatar": "Catar",
    "Saudi Arabia": "Ar\u00e1bia Saudita",
    "Scotland": "Esc\u00f3cia",
    "Senegal": "Senegal",
    "South Africa": "\u00c1frica do Sul",
    "South Korea": "Coreia do Sul",
    "Spain": "Espanha",
    "Sweden": "Su\u00e9cia",
    "Switzerland": "Su\u00ed\u00e7a",
    "Tunisia": "Tun\u00edsia",
    "Turkey": "Turquia",
    "United States": "Estados Unidos",
    "Uruguay": "Uruguai",
    "Uzbekistan": "Uzbequist\u00e3o"
};

const stadiumsTimezones = {
    "1": "Central",
    "2": "Central",
    "3": "Central",
    "4": "Central",
    "5": "Central",
    "6": "Central",
    "7": "Eastern",
    "8": "Eastern",
    "9": "Eastern",
    "10": "Eastern",
    "11": "Eastern",
    "12": "Eastern",
    "13": "Western",
    "14": "Western",
    "15": "Western",
    "16": "Western"
};

function getFlag(teamName) {
    if (!teamName) return "";
    const cleanName = teamName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const code = countryIso2[teamName] || countryIso2[cleanName];
    if (code) {
        return `<img src="https://flagcdn.com/20x15/${code}.png" style="vertical-align: middle; width: 20px; height: 15px; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); display: inline-block; margin: 0 4px;">`;
    }
    return "\u2690";
}

function getCountryCode(teamName) {
    return countryCodes[teamName] || (teamName || '').substring(0, 3).toUpperCase();
}

function getPortugueseName(teamName) {
    return translateCountry[teamName] || teamName;
}

function getTodayDateStr() {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const year = today.getFullYear();
    return `${month}/${day}/${year}`;
}

function parseMatchDate(localDateStr) {
    if (!localDateStr) return null;
    const parts = localDateStr.split(' ');
    if (parts.length < 2) return null;
    const dateParts = parts[0].split('/');
    const timeParts = parts[1].split(':');
    if (dateParts.length < 3 || timeParts.length < 2) return null;
    return new Date(
        parseInt(dateParts[2]),
        parseInt(dateParts[0]) - 1,
        parseInt(dateParts[1]),
        parseInt(timeParts[0]),
        parseInt(timeParts[1])
    );
}

function getBrasiliaDate(localDateStr, stadiumId) {
    const matchDate = parseMatchDate(localDateStr);
    if (!matchDate) return null;
    
    const region = stadiumsTimezones[stadiumId] || "Eastern";
    let offsetHours = 1; 
    if (region === "Central") {
        offsetHours = 2; 
    } else if (region === "Western") {
        offsetHours = 4; 
    }
    
    matchDate.setHours(matchDate.getHours() + offsetHours);
    return matchDate;
}

let worldCupMatches = [];
let prevLiveScores = {};

function playGoalAlertSound() {
    if (typeof soundEnabled !== 'undefined' && !soundEnabled) return;
    try {
        playSynthTone(523.25, 'sine', 0.12, 0.15); // C5
        setTimeout(() => playSynthTone(659.25, 'sine', 0.12, 0.15), 100); // E5
        setTimeout(() => playSynthTone(783.99, 'sine', 0.12, 0.15), 200); // G5
        setTimeout(() => playSynthTone(1046.50, 'sine', 0.15, 0.45), 300); // C6
    } catch (e) {
        console.warn('Goal sound failed', e);
    }
}

function triggerGoalPopUp(homePT, awayPT, homeScore, awayScore, goalTeamPT, scorerName) {
    const overlay = document.getElementById('goal-alert-overlay');
    const teamsEl = document.getElementById('goal-alert-teams');
    const scorerEl = document.getElementById('goal-alert-scorer');
    if (!overlay || !teamsEl || !scorerEl) return;
    
    const emergencyOverlay = document.getElementById('fullscreen-emergency-overlay');
    if (emergencyOverlay && emergencyOverlay.style.display === 'flex') {
        console.log('[WORLD-CUP] Goal pop-up suppressed due to link down emergency');
        return;
    }
    
    const liveMatch = worldCupMatches.find(game => game.time_elapsed === 'live');
    const homeFlag = liveMatch ? getFlag(liveMatch.home_team_name_en) : "";
    const awayFlag = liveMatch ? getFlag(liveMatch.away_team_name_en) : "";
    
    teamsEl.innerHTML = `${homeFlag} ${homePT} ${homeScore} x ${awayScore} ${awayPT} ${awayFlag}`;
    scorerEl.innerHTML = `\u26BD Gol de ${goalTeamPT}! <br><span style="font-size: 16px; opacity: 0.85;">${scorerName}</span>`;
    overlay.style.display = 'flex';
    
    playGoalAlertSound();
    
    if (window.goalAlertTimeout) clearTimeout(window.goalAlertTimeout);
    window.goalAlertTimeout = setTimeout(() => {
        overlay.style.display = 'none';
    }, 12000);
}

async function updateWorldCupWidget() {
    const ticker = document.getElementById('world-cup-ticker');
    const tickerText = document.getElementById('world-cup-ticker-text');
    const scoreboardBar = document.getElementById('copa-scoreboard-bar');
    const scoreboardText = document.getElementById('copa-scoreboard-text');
    
    try {
        const response = await fetch('/api/world-cup');
        if (!response.ok) throw new Error('API HTTP error ' + response.status);
        const data = await response.json();
        if (!data || !Array.isArray(data.games)) {
            throw new Error('Resposta sem array de jogos');
        }
        
        worldCupMatches = data.games;
        
        const todayStr = getTodayDateStr();
        const todayMatches = worldCupMatches.filter(game => {
            if (!game.home_team_name_en || !game.away_team_name_en) return false;
            return (game.local_date && game.local_date.startsWith(todayStr)) || 
                   game.time_elapsed === 'live';
        });
        
        if (todayMatches.length === 0) {
            if (ticker) ticker.style.display = 'none';
            if (scoreboardBar) scoreboardBar.style.display = 'none';
            return;
        }
        
        if (ticker) ticker.style.display = 'flex';
        if (scoreboardBar) scoreboardBar.style.display = 'flex';
        
        // Sort matches chronologically based on BrasÃ­lia Time
        todayMatches.sort((a, b) => {
            const dateA = getBrasiliaDate(a.local_date, a.stadium_id) || new Date(0);
            const dateB = getBrasiliaDate(b.local_date, b.stadium_id) || new Date(0);
            return dateA - dateB;
        });
        
        const liveMatch = todayMatches.find(game => game.time_elapsed === 'live');
        const tickerPill = document.getElementById('world-cup-ticker-trigger');
        
        if (liveMatch) {
            const homePT = getPortugueseName(liveMatch.home_team_name_en);
            const awayPT = getPortugueseName(liveMatch.away_team_name_en);
            const homeCode = getCountryCode(liveMatch.home_team_name_en);
            const awayCode = getCountryCode(liveMatch.away_team_name_en);
            const homeFlag = getFlag(liveMatch.home_team_name_en);
            const awayFlag = getFlag(liveMatch.away_team_name_en);
            
            const scoreText = `${homeFlag} ${homeCode} ${liveMatch.home_score} x ${liveMatch.away_score} ${awayCode} ${awayFlag} (Ao Vivo)`;
            
            if (tickerPill) tickerPill.classList.add('wc-live');
            if (tickerText) tickerText.innerHTML = scoreText;
            
            if (scoreboardBar) scoreboardBar.className = 'copa-scoreboard-bar bar-live';
            if (scoreboardText) scoreboardText.innerHTML = scoreText;
            
            const matchId = liveMatch.id;
            const homeScore = parseInt(liveMatch.home_score) || 0;
            const awayScore = parseInt(liveMatch.away_score) || 0;
            
            if (prevLiveScores[matchId]) {
                const prevHome = prevLiveScores[matchId].home;
                const prevAway = prevLiveScores[matchId].away;
                
                if (homeScore > prevHome || awayScore > prevAway) {
                    let goalTeamPT = "";
                    let scorerName = "Autor desconhecido";
                    
                    if (homeScore > prevHome) {
                        goalTeamPT = homePT;
                        if (liveMatch.home_scorers && liveMatch.home_scorers !== 'null') {
                            const cleaned = liveMatch.home_scorers.replace(/[{}]/g, '');
                            const scorers = cleaned.split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
                            if (scorers.length > 0) scorerName = scorers[scorers.length - 1];
                        }
                    } else {
                        goalTeamPT = awayPT;
                        if (liveMatch.away_scorers && liveMatch.away_scorers !== 'null') {
                            const cleaned = liveMatch.away_scorers.replace(/[{}]/g, '');
                            const scorers = cleaned.split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
                            if (scorers.length > 0) scorerName = scorers[scorers.length - 1];
                        }
                    }
                    
                    triggerGoalPopUp(homePT, awayPT, homeScore, awayScore, goalTeamPT, scorerName);
                }
            }
            prevLiveScores[matchId] = { home: homeScore, away: awayScore };
            
        } else {
            if (tickerPill) tickerPill.classList.remove('wc-live');
            const nextMatch = todayMatches.find(game => game.finished === 'FALSE' || game.time_elapsed === 'notstarted');
            
            if (nextMatch) {
                const homeCode = getCountryCode(nextMatch.home_team_name_en);
                const awayCode = getCountryCode(nextMatch.away_team_name_en);
                const homeFlag = getFlag(nextMatch.home_team_name_en);
                const awayFlag = getFlag(nextMatch.away_team_name_en);
                
                const brDate = getBrasiliaDate(nextMatch.local_date, nextMatch.stadium_id);
                const matchTime = brDate ? String(brDate.getHours()).padStart(2, '0') + ':' + String(brDate.getMinutes()).padStart(2, '0') : '';
                const isPastScheduled = brDate && (new Date() > brDate);
                
                let scheduledText = "";
                if (isPastScheduled) {
                    scheduledText = `EM INSTANTES: ${homeFlag} ${homeCode} vs ${awayCode} ${awayFlag}`;
                } else {
                    scheduledText = `PR\u00d3XIMO: ${homeFlag} ${homeCode} vs ${awayCode} ${awayFlag} (${matchTime})`;
                }
                
                if (tickerText) tickerText.innerHTML = scheduledText;
                if (scoreboardBar) scoreboardBar.className = 'copa-scoreboard-bar bar-scheduled';
                if (scoreboardText) scoreboardText.innerHTML = scheduledText;
            } else {
                const lastMatch = todayMatches[todayMatches.length - 1];
                const homeCode = getCountryCode(lastMatch.home_team_name_en);
                const awayCode = getCountryCode(lastMatch.away_team_name_en);
                const homeFlag = getFlag(lastMatch.home_team_name_en);
                const awayFlag = getFlag(lastMatch.away_team_name_en);
                
                const finishedText = `Fim: ${homeFlag} ${homeCode} ${lastMatch.home_score} x ${lastMatch.away_score} ${awayCode} ${awayFlag}`;
                
                if (tickerText) tickerText.innerHTML = finishedText;
                if (scoreboardBar) scoreboardBar.className = 'copa-scoreboard-bar bar-finished';
                if (scoreboardText) scoreboardText.innerHTML = finishedText;
            }
        }
    } catch (error) {
        console.error('[WORLD-CUP] Failed to update widget:', error);
        const errMsg = 'Copa Erro: ' + error.message;
        if (tickerText) tickerText.innerHTML = errMsg;
        if (scoreboardText) scoreboardText.innerHTML = errMsg;
    }
}

function renderWorldCupModal() {
    const todayStr = getTodayDateStr();
    const todayMatches = worldCupMatches.filter(game => {
        if (!game.home_team_name_en || !game.away_team_name_en) return false;
        return game.local_date.startsWith(todayStr) || game.time_elapsed === 'live';
    });
    
    const container = document.getElementById('world-cup-matches-list');
    if (todayMatches.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:#7489a0;font-size:12px;padding:20px;">Nenhum jogo agendado para hoje.</div>`;
        return;
    }
    
    // Sort matches chronologically based on BrasÃ­lia Time
    todayMatches.sort((a, b) => {
        const dateA = getBrasiliaDate(a.local_date, a.stadium_id) || new Date(0);
        const dateB = getBrasiliaDate(b.local_date, b.stadium_id) || new Date(0);
        return dateA - dateB;
    });
    
    container.innerHTML = todayMatches.map(game => {
        const homeFlag = getFlag(game.home_team_name_en);
        const awayFlag = getFlag(game.away_team_name_en);
        const homePT = getPortugueseName(game.home_team_name_en);
        const awayPT = getPortugueseName(game.away_team_name_en);
        const isLive = game.time_elapsed === 'live';
        const isFinished = game.finished === 'TRUE';
        
        let statusText = 'Agendado';
        let statusClass = '';
        if (isLive) {
            statusText = 'Ao Vivo';
            statusClass = 'status-live';
        } else if (isFinished) {
            statusText = 'Finalizado';
            statusClass = 'status-finished';
        } else {
            const brDate = getBrasiliaDate(game.local_date, game.stadium_id);
            statusText = brDate ? String(brDate.getHours()).padStart(2, '0') + ':' + String(brDate.getMinutes()).padStart(2, '0') : 'Agendado';
        }
        
        let homeScorersList = [];
        let awayScorersList = [];
        try {
            if (game.home_scorers && game.home_scorers !== 'null') {
                const cleaned = game.home_scorers.replace(/[{}]/g, '');
                homeScorersList = cleaned.split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
            }
            if (game.away_scorers && game.away_scorers !== 'null') {
                const cleaned = game.away_scorers.replace(/[{}]/g, '');
                awayScorersList = cleaned.split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
            }
        } catch (e) {
            console.warn('Scorers parse error', e);
        }
        
        return `
            <div class="wc-match-card ${isLive ? 'wc-live' : ''}">
                <div class="wc-match-teams">
                    <div class="wc-team-row">
                        <div class="wc-team-info">
                            <span class="wc-flag">${homeFlag}</span>
                            <span>${homePT}</span>
                        </div>
                        <span class="wc-score">${game.home_score !== null ? game.home_score : '-'}</span>
                    </div>
                    <div class="wc-team-row">
                        <div class="wc-team-info">
                            <span class="wc-flag">${awayFlag}</span>
                            <span>${awayPT}</span>
                        </div>
                        <span class="wc-score">${game.away_score !== null ? game.away_score : '-'}</span>
                    </div>
                </div>
                
                <div class="wc-match-meta">
                    <span>Partida ${game.id} - Dallas / USA</span>
                    <span class="wc-status-badge ${statusClass}">${statusText}</span>
                </div>
                
                ${(homeScorersList.length > 0 || awayScorersList.length > 0) ? `
                    <div class="wc-goals">
                        ${homeScorersList.map(s => `<div>\u26BD ${homeFlag} ${s}</div>`).join('')}
                        ${awayScorersList.map(s => `<div>\u26BD ${awayFlag} ${s}</div>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Auto-Reload on Code Update
const currentVersion = "20260701-worldcup-v6";
async function checkVersion() {
    try {
        const response = await fetch('/api/version');
        if (response.ok) {
            const data = await response.json();
            if (data.version && data.version !== currentVersion) {
                console.log('[VERSION-CHECK] New version detected, reloading page...');
                window.location.reload();
            }
        }
    } catch (e) {
        // Suppress version fetch errors
    }
}

// Inicializar eventos e widgets da Copa
function initWorldCup() {
    const trigger = document.getElementById('world-cup-ticker-trigger');
    const barTrigger = document.getElementById('copa-scoreboard-bar');
    
    const openModal = () => {
        renderWorldCupModal();
        const overlay = document.getElementById('world-cup-modal-overlay');
        if (overlay) overlay.style.display = 'flex';
    };
    
    if (trigger) trigger.addEventListener('click', openModal);
    if (barTrigger) barTrigger.addEventListener('click', openModal);
    
    const closeModalWC = () => {
        const overlay = document.getElementById('world-cup-modal-overlay');
        if (overlay) overlay.style.display = 'none';
    };
    
    const btnClose = document.getElementById('btn-close-world-cup');
    if (btnClose) btnClose.addEventListener('click', closeModalWC);
    
    const btnCloseOk = document.getElementById('btn-close-world-cup-ok');
    if (btnCloseOk) btnCloseOk.addEventListener('click', closeModalWC);
    
    const overlay = document.getElementById('world-cup-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target.id === 'world-cup-modal-overlay') closeModalWC();
        });
    }
    
    const btnCloseGoal = document.getElementById('goal-alert-close-btn');
    if (btnCloseGoal) {
        btnCloseGoal.addEventListener('click', () => {
            const goalOverlay = document.getElementById('goal-alert-overlay');
            if (goalOverlay) goalOverlay.style.display = 'none';
        });
    }
    
    const goalOverlay = document.getElementById('goal-alert-overlay');
    if (goalOverlay) {
        goalOverlay.addEventListener('click', (e) => {
            if (e.target.id === 'goal-alert-overlay') {
                goalOverlay.style.display = 'none';
            }
        });
    }
    
    updateWorldCupWidget();
    setInterval(updateWorldCupWidget, 30000);
    
    setInterval(checkVersion, 30000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWorldCup);
} else {
    initWorldCup();
}
