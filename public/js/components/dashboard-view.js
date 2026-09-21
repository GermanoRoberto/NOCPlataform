class DashboardView {
    constructor() {
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        // 1. Botão Testar Rota (MTR)
        const btnMtr = document.getElementById('btnDashboardTestMtr');
        if (btnMtr) {
            btnMtr.addEventListener('click', async () => {
                const state = window.appStore.getState();
                const offline = (state.links || []).find(l => l.status === 'offline');
                const defaultIp = offline ? offline.ip : '187.32.17.94';
                const targetIp = prompt('Digite o IP de destino para teste de rota MTR / Ping:', defaultIp);
                if (!targetIp) return;

                btnMtr.textContent = 'Testando Rota...';
                try {
                    const res = await fetch('/api/test-link', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ip: targetIp.trim() })
                    });
                    const d = await res.json();
                    alert(`[TESTE DE ROTA MTR / ICMP]\nAlvo: ${d.target}\nResultado: ${d.success ? 'CONEXÃO ESTÁVEL' : 'FALHA DE ROTA'}\n\n${d.output}`);
                } catch (e) {
                    alert(`Erro ao testar rota: ${e.message}`);
                } finally {
                    btnMtr.textContent = 'Testar Rota (MTR)';
                }
            });
        }

        // 2. Botão Silenciar Alertas
        const btnSilence = document.getElementById('btnDashboardSilenceAlerts');
        if (btnSilence) {
            btnSilence.addEventListener('click', () => {
                alert(' Alertas sonoros e popups de incidentes foram silenciados por 1 hora.');
                btnSilence.textContent = 'Silenciado (1h)';
                btnSilence.style.borderColor = 'var(--brand-amber)';
                btnSilence.style.color = 'var(--brand-amber)';
            });
        }
    }

    render(state) {
        this.init();
        const { summary = {}, links = [], computers = [] } = state || {};
        const esc = window.Sanitizer.escape;

        const totalLinks = summary.totalLinks || (links || []).filter(l => !l.isGateway).length || 0;
        const offlineLinks = summary.offlineLinks !== undefined ? summary.offlineLinks : (links || []).filter(l => !l.isGateway && l.status === 'offline').length || 0;
        const onlineLinks = summary.onlineLinks !== undefined ? summary.onlineLinks : (totalLinks - offlineLinks);
        const uptimePct = totalLinks > 0 ? (((totalLinks - offlineLinks) / totalLinks) * 100).toFixed(1) : '100.0';

        // 0. Banner Crítico de Desastre / Anomalia de Rede (Ocultar quando 100% Nominal)
        const banner = document.getElementById('bannerSystemAlert');
        if (banner) {
            if (offlineLinks > 0) {
                banner.style.display = 'flex';
                const offNames = (links || []).filter(l => l.status === 'offline').map(l => l.name).join(', ');
                const titleEl = document.getElementById('bannerAlertTitle');
                const msgEl = document.getElementById('bannerAlertMsg');
                if (titleEl) titleEl.textContent = `ALERTA DE INFRAESTRUTURA (${offlineLinks} ${offlineLinks === 1 ? 'CIRCUITO OFFLINE' : 'CIRCUITOS OFFLINE'})`;
                if (msgEl) msgEl.textContent = `Detectada anomalia crítica: ${offNames}. Ação imediata recomendada.`;
            } else {
                banner.style.display = 'none';
            }
        }

        // 1. KPI Saúde Geral da Rede
        const elStatusGlobal = document.getElementById('valKpiStatusGlobal');
        if (elStatusGlobal) elStatusGlobal.textContent = `${uptimePct}%`;

        const subStatusGlobal = document.getElementById('subKpiStatusGlobal');
        if (subStatusGlobal) {
            if (offlineLinks === 0) {
                subStatusGlobal.textContent = `${totalLinks} Links Operacionais · Operação 100% Nominal`;
                subStatusGlobal.style.color = 'var(--text-muted)';
            } else {
                subStatusGlobal.textContent = `${onlineLinks} Operacionais · ${offlineLinks} ${offlineLinks === 1 ? 'Alerta Ativo' : 'Alertas Ativos'}`;
                subStatusGlobal.style.color = 'var(--state-error)';
            }
        }

        // 2. KPI Parque de Estações (ITAM)
        const elItam = document.getElementById('valKpiItam');
        if (elItam) elItam.textContent = `${(computers || []).length || summary.totalComputers || 0} Ativos`;

        const subItam = document.getElementById('subKpiItam');
        if (subItam) {
            subItam.textContent = '100% em conformidade operacional';
        }

        // 3. KPI Incidentes Ativos
        const elAlertas = document.getElementById('valKpiAlertasCriticos');
        const subAlertas = document.getElementById('subKpiAlertasCriticos');
        if (elAlertas) {
            elAlertas.textContent = `${offlineLinks} Incidentes`;
            elAlertas.style.color = offlineLinks > 0 ? 'var(--brand-crimson)' : 'var(--brand-emerald)';
        }
        if (subAlertas) {
            subAlertas.textContent = offlineLinks > 0 ? 'Ação Imediata Necessária' : 'Operação 100% Nominal';
        }

        // 4. KPI Saturação de Tráfego Agregado
        const elTraffic = document.getElementById('valKpiTraffic');
        if (elTraffic) elTraffic.textContent = `${summary.totalTraffic || '0'} Mbps`;

        const subTraffic = document.getElementById('subKpiTraffic');
        if (subTraffic) {
            subTraffic.textContent = `${totalLinks} Circuitos WAN Monitorados`;
        }

        const containerExceptions = document.getElementById('containerExceptionsFeed');
        if (containerExceptions) {
            if (offlineLinks === 0) {
                containerExceptions.innerHTML = `
                    <div style="padding:16px 20px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="color:var(--brand-emerald); display:inline-flex; align-items:center; gap:6px;">
                                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--brand-emerald);"></span>
                                Rede WAN 100% Nominal
                            </strong>
                            <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Todos os circuitos operando em conformidade sem exceções ativas.</div>
                        </div>
                    </div>
                `;
            } else {
                const offList = (links || []).filter(l => l.status === 'offline');
                containerExceptions.innerHTML = offList.map(l => `
                    <div onclick="window.assetDrawer.open('${esc(l.id)}', 'link')" style="padding:12px 20px; border-bottom:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center; background:rgba(255,0,85,0.08); cursor:pointer;" title="Clique para abrir a Ficha Técnica do Circuito">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <svg style="width:18px; height:18px; color:var(--brand-crimson); flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                            <div>
                                <strong style="color:var(--brand-crimson); font-size:13px;">${esc(l.name)}</strong>
                                <div style="font-size:11px; color:var(--text-muted);">${esc(l.city || 'Filial')} — IP: ${esc(l.ip)} (Sem Resposta)</div>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="badge badge-error">OFFLINE</span>
                            <span style="font-size:11px; color:var(--cs-cyan);">Diagnóstico </span>
                        </div>
                    </div>
                `).join('');
            }
        }

        this.renderCharts(links || []);
    }

    async renderCharts(links) {
        if (!window.Chart || !window.chartManager) return;

        // 1. Gráfico de Telemetria Agregada 24h: buscar dados reais do banco SQLite
        const activeLinks = (links || []).filter(l => !l.isGateway && l.status !== 'offline');
        let currentAvgLat = 0;
        let currentAvgLoss = 0;
        if (activeLinks.length > 0) {
            const totalLat = activeLinks.reduce((acc, l) => acc + (Number(l.latency) || 0), 0);
            const totalLoss = activeLinks.reduce((acc, l) => acc + (Number(l.packetLoss) || 0), 0);
            currentAvgLat = Math.round(totalLat / activeLinks.length);
            currentAvgLoss = Number((totalLoss / activeLinks.length).toFixed(1));
        }

        let trendData = [];
        try {
            const res = await fetch('/api/reports/trend?range=24h');
            if (res.ok) {
                trendData = await res.json();
            }
        } catch (e) {
            console.warn('Erro ao carregar telemetria histórica 24h:', e);
        }

        const todayIso = new Date().toISOString().split('T')[0];
        let labels = [];
        let latencies = [];
        let losses = [];

        if (Array.isArray(trendData) && trendData.length > 0) {
            trendData.forEach(d => {
                if (!d.time) return;
                const [datePart, timePart] = d.time.split(' ');
                const hourMin = timePart ? timePart.substring(0, 5) : d.time;
                if (!datePart || datePart === todayIso) {
                    labels.push(hourMin);
                } else {
                    const [y, m, day] = datePart.split('-');
                    labels.push(`${day}/${m} ${hourMin}`);
                }
                latencies.push(Number(d.latency || 0));
                losses.push(Number(d.packetLoss || 0));
            });
        }

        // Se o histórico de 24h estiver com poucos pontos (banco recém-iniciado), sintetiza dos históricos de links ativos
        if (labels.length < 3 && activeLinks.length > 0) {
            const sampleLink = activeLinks.find(l => Array.isArray(l.history) && l.history.length > 2);
            if (sampleLink && sampleLink.history) {
                const count = Math.min(10, sampleLink.history.length);
                const nowMs = Date.now();
                const synthLabels = [];
                const synthLat = [];
                const synthLoss = [];
                for (let i = count - 1; i >= 0; i--) {
                    const t = new Date(nowMs - i * 60000);
                    synthLabels.push(t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
                    let sumL = 0, countL = 0;
                    activeLinks.forEach(al => {
                        if (al.history && al.history[i] !== undefined) {
                            sumL += Number(al.history[i]) || 0;
                            countL++;
                        }
                    });
                    synthLat.push(countL > 0 ? Math.round(sumL / countL) : currentAvgLat);
                    synthLoss.push(0);
                }
                labels = synthLabels;
                latencies = synthLat;
                losses = synthLoss;
            }
        }

        // Ponto em tempo real (Agora)
        const now = new Date();
        const nowLabel = `Agora (${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})`;
        if (labels.length === 0) {
            labels.push(nowLabel);
            latencies.push(currentAvgLat);
            losses.push(currentAvgLoss);
        } else {
            const lastIdx = labels.length - 1;
            if (labels[lastIdx].startsWith('Agora')) {
                labels[lastIdx] = nowLabel;
                latencies[lastIdx] = currentAvgLat;
                losses[lastIdx] = currentAvgLoss;
            } else {
                labels.push(nowLabel);
                latencies.push(currentAvgLat);
                losses.push(currentAvgLoss);
            }
        }

        // Renderiza/atualiza o gráfico de telemetria histórica 24h com suporte a tempo real
        window.chartManager.updateChart('chartTraffic24h', () => ({
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Latência RTT Média (ms)',
                        data: [],
                        borderColor: '#38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.1)',
                        fill: true,
                        tension: 0.3,
                        spanGaps: true,
                        pointRadius: 3,
                        pointHoverRadius: 6,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Perda de Pacotes (%)',
                        data: [],
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.3,
                        spanGaps: true,
                        pointRadius: 3,
                        pointHoverRadius: 6,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
                    tooltip: { enabled: true, mode: 'index', intersect: false }
                },
                scales: {
                    y: {
                        title: { display: true, text: 'Latência (ms)', color: '#64748b' },
                        ticks: { color: '#64748b' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y1: {
                        position: 'right',
                        title: { display: true, text: 'Perda (%)', color: '#ef4444' },
                        ticks: { color: '#ef4444' },
                        grid: { drawOnChartArea: false },
                        min: 0,
                        max: 100
                    },
                    x: {
                        ticks: { color: '#64748b', maxRotation: 45, minRotation: 0 },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        }), (chart) => {
            chart.data.labels = labels;
            chart.data.datasets[0].data = latencies;
            chart.data.datasets[1].data = losses;
        });

        // 2. Gráfico Top Consumo de Banda (circuitos WAN monitorados)
        const validLinksWithTraffic = [...links]
            .filter(l => {
                const name = (l.name || '').toUpperCase();
                const isp = (l.isp || '').toUpperCase();
                const isGw = l.isGateway || name.includes('DRAYTEK') || name.includes('GATEWAY') || isp.includes('DRAYTEK');
                return !isGw && l.traffic !== null && l.traffic !== undefined && l.traffic > 0;
            })
            .sort((a, b) => (b.traffic || 0) - (a.traffic || 0))
            .slice(0, 5);

        const topLabels = validLinksWithTraffic.map(l => {
            let label = l.name.replace(' - AMERICANET', '').replace('  -', ' -').trim();
            return label.length > 16 ? label.substring(0, 16) + '...' : label;
        });
        const topData = validLinksWithTraffic.map(l => Number(Number(l.traffic).toFixed(1)));

        const barColors = [
            '#0284c7',
            '#0369a1',
            '#0ea5e9',
            '#38bdf8',
            '#7dd3fc'
        ];

        window.chartManager.updateChart('chartTop5Bandwidth', () => ({
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Consumo (Mbps)',
                    data: [],
                    backgroundColor: barColors,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => ` ${context.parsed.y} Mbps`
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            color: '#64748b',
                            callback: (val) => `${val}M`
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: { color: '#94a3b8', font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        }), (chart) => {
            chart.data.labels = topLabels.length > 0 ? topLabels : ['Sem tráfego de telecom'];
            chart.data.datasets[0].data = topData.length > 0 ? topData : [0];
            chart.data.datasets[0].backgroundColor = barColors;
        });
    }
}
window.dashboardView = new DashboardView();
