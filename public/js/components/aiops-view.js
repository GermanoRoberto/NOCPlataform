class AiopsView {
    render(state) {
        const container = document.getElementById('containerAiOpsRecommendations');
        if (!container) return;

        const esc = window.Sanitizer.escape;
        const aiops = state.aiops || {};
        const predictiveAlerts = aiops.predictiveAlerts || [];
        const rootCauses = aiops.rootCauseCorrelations || [];
        const operatorScorecard = aiops.operatorScorecard || [];
        const poloSummary = aiops.poloSummary || [];
        const recommendations = state.recommendations || [];
        const links = state.links || [];

        // Métricas de topo do AIOps
        const totalLinks = links.length || 1;
        const offlineLinks = links.filter(l => l.status === 'offline').length;
        const degradedLinks = links.filter(l => l.status === 'warning' || (l.latency && l.latency > 100)).length;
        const globalRiskIndex = Math.max(0, 100 - (offlineLinks * 8) - (degradedLinks * 2.5)).toFixed(1);

        container.innerHTML = `
            <!-- 1. CARDS DE KPIS DA INTELIGÊNCIA PREDITIVA -->
            <div class="invgate-kpi-grid" style="margin-bottom:20px;">
                <div class="invgate-kpi-tile">
                    <span class="kpi-label">ÍNDICE DE SAÚDE PREDITIVA</span>
                    <div class="kpi-val" style="color:${globalRiskIndex >= 90 ? 'var(--brand-emerald)' : 'var(--brand-amber)'};">${globalRiskIndex}%</div>
                    <div class="kpi-sub">${offlineLinks === 0 ? 'Operação sem riscos sistêmicos' : `${offlineLinks} circuito(s) indisponível(is)`}</div>
                </div>

                <div class="invgate-kpi-tile">
                    <span class="kpi-label">ALERTAS DE RISCO IMINENTE</span>
                    <div class="kpi-val" style="color:${predictiveAlerts.length > 0 ? 'var(--brand-crimson)' : 'var(--brand-emerald)'};">${predictiveAlerts.length} <span style="font-size:13px; font-weight:500; color:var(--text-muted);">predições</span></div>
                    <div class="kpi-sub">${predictiveAlerts.length > 0 ? 'Probabilidade de queda em < 60m' : 'Zero risco de queda iminente'}</div>
                </div>

                <div class="invgate-kpi-tile">
                    <span class="kpi-label">DIAGNÓSTICOS DE CAUSA RAIZ (RCA)</span>
                    <div class="kpi-val" style="color:${rootCauses.length > 0 ? 'var(--brand-amber)' : 'var(--cs-cyan)'};">${rootCauses.length} <span style="font-size:13px; font-weight:500; color:var(--text-muted);">correlações</span></div>
                    <div class="kpi-sub">${rootCauses.length > 0 ? 'Impacto topológico detectado' : 'Topologia de malha nominal'}</div>
                </div>

                <div class="invgate-kpi-tile">
                    <span class="kpi-label">OPERADORAS EM ALERTA DE SLA</span>
                    <div class="kpi-val" style="color:${operatorScorecard.some(o => o.slaPct < 99) ? 'var(--brand-crimson)' : 'var(--brand-emerald)'};">${operatorScorecard.filter(o => o.slaPct < 99).length} <span style="font-size:13px; font-weight:500; color:var(--text-muted);">de ${operatorScorecard.length}</span></div>
                    <div class="kpi-sub">Conformidade contratual SLA 99.5%</div>
                </div>
            </div>

            <!-- 2. QUADRO DE ANÁLISE PREDITIVA -->
            <div class="aiops-section-card" style="background:rgba(3,13,29,0.6); border:1px solid var(--glass-border); border-radius:12px; padding:20px; margin-bottom:20px;">
                <div class="aiops-card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <div>
                        <strong style="font-size:15px; color:var(--text-primary); display:block;">Análise Preditiva de Degradação (Machine Learning Heuristics)</strong>
                        <span style="font-size:12px; color:var(--text-muted);">Detecção precoce de saturação de rota, jitter e descarte antes da queda do circuito.</span>
                    </div>
                    <button class="btn-ui" style="font-size:11px; display:inline-flex; align-items:center; gap:6px; flex-shrink:0;" onclick="window.aiopsView.recalculate()">
                        <svg style="width:13px; height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        Reavaliar Telemetria
                    </button>
                </div>

                ${predictiveAlerts.length > 0 ? `
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        ${predictiveAlerts.map(p => `
                            <div class="aiops-predictive-item" style="background:rgba(255,0,85,0.08); border:1px solid rgba(255,0,85,0.3); border-radius:8px; padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                                <div style="flex:1; min-width:0;">
                                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                                        <span class="badge badge-error">${esc(p.probability)}</span>
                                        <strong style="font-size:14px; color:var(--text-primary); word-break:break-word;">${esc(p.name)}</strong>
                                        <span style="font-size:12px; color:var(--cs-cyan); word-break:break-word;">(${esc(p.city)} · ${esc(p.isp)})</span>
                                    </div>
                                    <div style="font-size:12px; color:var(--text-secondary); margin-bottom:6px; display:flex; flex-wrap:wrap; gap:4px;">
                                        <strong>Fatores de Risco:</strong> ${p.reasons.map(r => `<span style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; font-size:11px;">${esc(r)}</span>`).join('')}
                                    </div>
                                    <div style="font-size:11px; color:var(--text-muted); line-height:1.4;">
                                        <strong>Janela Estimada:</strong> ${esc(p.timeframe)} · <strong>Recomendação:</strong> ${esc(p.recommendedAction)}
                                    </div>
                                </div>
                                <div class="aiops-item-actions" style="display:flex; gap:8px; flex-shrink:0;">
                                    <button class="btn-ui" onclick="window.aiopsView.testRoute('${esc(p.ip)}')">Testar Rota MTR</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div style="background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.2); border-radius:8px; padding:20px; text-align:center;">
                        <span style="font-size:24px; display:block; margin-bottom:6px;"></span>
                        <strong style="color:var(--brand-emerald); font-size:14px;">Nenhum Risco de Degradação Preditiva Detectado</strong>
                        <p style="font-size:12px; color:var(--text-muted); margin-top:4px; max-width:600px; margin-left:auto; margin-right:auto;">
                            A matriz de ${totalLinks} circuitos WAN está operando sem desvios estatísticos de jitter ou saturação de buffer nos roteadores DrayTek Vigor.
                        </p>
                    </div>
                `}
            </div>

            <!-- 3. CORRELAÇÃO DE CAUSA RAIZ (RCA) -->
            <div class="aiops-section-card" style="background:rgba(3,13,29,0.6); border:1px solid var(--glass-border); border-radius:12px; padding:20px; margin-bottom:20px;">
                <strong style="font-size:15px; color:var(--text-primary); display:block; margin-bottom:6px;">Correlação Topológica de Falhas (Root Cause Analysis - RCA)</strong>
                <span style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:16px;">Agrupamento de sintomas e dependências para prevenir falsos positivos e acelerar o MTTR.</span>

                ${rootCauses.length > 0 ? `
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        ${rootCauses.map(rc => `
                            <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.3); border-radius:8px; padding:16px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
                                    <strong style="color:var(--brand-amber); font-size:14px;"> Filial ${esc(rc.location)} — ${esc(rc.primaryFault)}</strong>
                                    <span class="badge" style="background:rgba(245,158,11,0.2); color:var(--brand-amber);">${esc(rc.confidence)}</span>
                                </div>
                                <div style="font-size:12px; color:var(--text-secondary); margin-bottom:6px; word-break:break-word;">
                                    <strong>Dispositivos Impactados (${rc.impactCount}):</strong> ${esc(rc.affectedAssets.join(', '))}
                                </div>
                                <div style="font-size:11px; color:var(--text-muted); line-height:1.4;">
                                    <strong>Ação Recomendada:</strong> ${esc(rc.recommendedAction)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div style="padding:16px; background:rgba(3,13,29,0.4); border-radius:8px; border:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <svg style="width:18px; height:18px; color:var(--brand-emerald); flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            <div>
                                <strong style="color:var(--text-primary); font-size:13px;">Malha Topológica Íntegra</strong>
                                <div style="font-size:11px; color:var(--text-muted);">Nenhuma correlação em cascata identificada entre gateways WAN, switches e ativos de borda.</div>
                            </div>
                        </div>
                        <span class="badge badge-ok">RCA 100% Conforme</span>
                    </div>
                `}
            </div>

            <!-- 4. RESUMO DE INTELIGÊNCIA POR POLO -->
            <div class="aiops-section-card" style="background:rgba(3,13,29,0.6); border:1px solid var(--glass-border); border-radius:12px; padding:20px; margin-bottom:20px;">
                <strong style="font-size:15px; color:var(--text-primary); display:block; margin-bottom:6px;">Saúde Operacional Inteligente por Polo / Filial</strong>
                <span style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:16px;">Monitoramento consolidado de conectividade, estações de trabalho e impressão por região.</span>

                <div class="aiops-polo-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:14px;">
                    ${poloSummary.map(polo => `
                        <div style="background:rgba(3,13,29,0.5); border:1px solid var(--glass-border); border-radius:8px; padding:14px; border-left:4px solid ${polo.status === 'CRÍTICO' ? 'var(--brand-crimson)' : (polo.status === 'ATENÇÃO' ? 'var(--brand-amber)' : 'var(--brand-emerald)')};">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <strong style="color:var(--text-primary); font-size:13px;">${esc(polo.name)}</strong>
                                <span class="badge ${polo.status === 'CRÍTICO' ? 'badge-error' : (polo.status === 'ATENÇÃO' ? 'badge-warning' : 'badge-ok')}" style="font-size:10px;">${polo.status}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-bottom:3px;">
                                <span>Circuitos WAN:</span> <strong style="color:var(--text-primary);">${polo.linksCount}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-bottom:3px;">
                                <span>Estações ITAM:</span> <strong style="color:var(--text-primary);">${polo.computersCount}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-bottom:3px;">
                                <span>Impressoras:</span> <strong style="color:var(--text-primary);">${polo.printersCount}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:6px; padding-top:6px; border-top:1px solid var(--glass-border);">
                                <span>Latência Média:</span> <strong style="color:var(--cs-cyan);">${polo.avgLatency} ms</strong>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- 5. SCORECARD DE INTELIGÊNCIA DAS OPERADORAS DE TELECOM -->
            <div class="aiops-section-card" style="background:rgba(3,13,29,0.6); border:1px solid var(--glass-border); border-radius:12px; padding:20px; margin-bottom:20px;">
                <div style="margin-bottom:14px;">
                    <strong style="font-size:15px; color:var(--text-primary); display:block;">Telecom ISP Intelligence Scorecard (SLA por Provedor)</strong>
                    <span style="font-size:12px; color:var(--text-muted);">Ranking comparativo de estabilidade, latência agregada e cumprimento contratual.</span>
                </div>

                <div class="table-card" style="box-shadow:none; border:none; background:transparent;">
                    <table class="data-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th>Provedor / Operadora</th>
                                <th style="text-align:center;">Total de Circuitos</th>
                                <th style="text-align:center;">Operando (Online)</th>
                                <th style="text-align:center;">Quedas (Offline)</th>
                                <th style="text-align:center;">SLA Efetivo</th>
                                <th style="text-align:center;">Latência Média</th>
                                <th style="text-align:center;">Classificação de Risco</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${operatorScorecard.map(op => `
                                <tr>
                                    <td>
                                        <strong style="color:var(--text-primary); font-size:13px;">${esc(op.operator)}</strong>
                                        ${op.circuits && op.circuits.length > 0 ? `
                                            <div style="font-size:11px; color:var(--text-muted); margin-top:4px; display:flex; flex-wrap:wrap; gap:6px;">
                                                ${op.circuits.map(c => `<span style="background:rgba(56,189,248,0.08); color:var(--cs-cyan); padding:2px 6px; border-radius:4px; border:1px solid rgba(56,189,248,0.2); font-family:var(--font-mono); font-size:10px;">${esc(c.name || c)}</span>`).join('')}
                                            </div>
                                        ` : ''}
                                    </td>
                                    <td class="tabular-nums" style="text-align:center;">${op.totalLinks}</td>
                                    <td class="tabular-nums" style="text-align:center; color:var(--brand-emerald);">${op.online}</td>
                                    <td class="tabular-nums" style="text-align:center; color:${op.offline > 0 ? 'var(--brand-crimson)' : 'inherit'};">${op.offline}</td>
                                    <td class="tabular-nums" style="text-align:center; font-weight:700; color:${op.slaPct >= 99.5 ? 'var(--brand-emerald)' : (op.slaPct >= 98 ? 'var(--brand-amber)' : 'var(--brand-crimson)')};">${op.slaPct}%</td>
                                    <td class="tabular-nums" style="text-align:center; color:var(--cs-cyan);">${op.avgLatencyMs} ms</td>
                                    <td style="text-align:center;">
                                        <span class="badge ${op.healthStatus === 'CRITICAL' ? 'badge-error' : (op.healthStatus === 'WARNING' ? 'badge-warning' : 'badge-ok')}">
                                            ${op.healthStatus === 'CRITICAL' ? 'ALTO RISCO' : (op.healthStatus === 'WARNING' ? 'ATENÇÃO' : 'EXCELENTE')}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 6. SMART RECOMMENDATIONS ACIONÁVEIS -->
            <div class="aiops-section-card" style="background:rgba(3,13,29,0.6); border:1px solid var(--glass-border); border-radius:12px; padding:20px;">
                <strong style="font-size:15px; color:var(--text-primary); display:block; margin-bottom:6px;">Recomendações Operacionais Acionáveis (Smart Engine)</strong>
                <span style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:16px;">Ações sugeridas automaticamente para otimização de governança, hardware e conectividade.</span>

                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${recommendations.map(r => `
                        <div class="aiops-recommendation-item" style="background:rgba(3,13,29,0.5); border:1px solid var(--glass-border); border-radius:8px; padding:14px 18px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                            <div style="flex:1; min-width:0;">
                                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
                                    <span class="badge ${r.severity === 'CRITICAL' ? 'badge-error' : (r.severity === 'WARNING' ? 'badge-warning' : 'badge-ok')}">${esc(r.severity)}</span>
                                    <span style="font-size:11px; color:var(--cs-cyan); font-weight:700;">[${esc(r.category)}]</span>
                                    <strong style="color:var(--text-primary); font-size:13px; word-break:break-word;">${esc(r.title)}</strong>
                                </div>
                                <div style="font-size:12px; color:var(--text-muted); line-height:1.4;">${esc(r.description)}</div>
                            </div>
                            <div class="aiops-item-actions" style="flex-shrink:0;">
                                <button class="btn-ui" style="font-size:11px; background:rgba(56,189,248,0.1); border-color:var(--cs-cyan); color:var(--cs-cyan);" onclick="window.aiopsView.handleAction('${esc(r.category)}')">
                                    ${esc(r.actionText || 'Verificar')}
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    recalculate() {
        fetch('/api/status')
            .then(r => r.json())
            .then(d => {
                window.appStore.setTelemetry(d);
                this.render(window.appStore.getState());
            });
    }

    testRoute(ip) {
        if (!ip) return;
        fetch('/api/test-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip })
        })
        .then(r => r.json())
        .then(d => {
            alert(`[DIAGNÓSTICO ICMP EM TEMPO REAL]\nAlvo: ${d.target}\nStatus: ${d.success ? 'CONECTIVIDADE CONFIRMADA' : 'FALHA DE ROTA'}\n\n${d.output}`);
        })
        .catch(e => alert(`Erro ao executar teste de rota: ${e.message}`));
    }

    handleAction(category) {
        if (category === 'WAN' && window.switchView) window.switchView('wan');
        else if (category === 'PRINTER' && window.switchView) window.switchView('printers');
        else if (category === 'ITAM' && window.switchView) window.switchView('itam');
        else if (category === 'INFRASTRUCTURE' && window.switchView) window.switchView('network-assets');
        else if (category === 'GOVERNANCE' && window.switchView) window.switchView('topology');
    }
}
window.aiopsView = new AiopsView();
