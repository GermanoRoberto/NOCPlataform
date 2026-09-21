const { StateGraph, START, END, Annotation } = require('@langchain/langgraph');
const { AiopsDiagnosticSchema } = require('./aiops-schemas');
const predictiveService = require('../../services/predictive-analytics-service');
const db = require('../database/connection');
const logger = require('../../core/logger');

const AiopsState = Annotation.Root({
    asset: Annotation(),
    pingResult: Annotation(),
    model: Annotation(),
    extractedMetrics: Annotation(),
    trend: Annotation(),
    llmPrompt: Annotation(),
    rawLlmResponse: Annotation(),
    validatedDiagnostic: Annotation(),
    analysisMarkdown: Annotation(),
    persistedId: Annotation()
});

/**
 * Nó 1: Extração Determinística de Métricas e Telemetria
 */
async function extractTelemetryNode(state) {
    const asset = state.asset || {};
    const pingResult = state.pingResult || null;

    const isComputer = Boolean(asset.deviceType === 'Desktop' || asset.deviceType === 'Notebook' || asset.hardware || asset.type === 'computer');
    const isLink = Boolean(asset.isp || asset.bandwidth !== undefined);
    const isPrinter = Boolean(asset.blackCounter !== undefined || asset.tonerLevel !== undefined);

    const lat = asset.latency !== null && asset.latency !== undefined ? Number(asset.latency) : null;
    const loss = asset.packetLoss !== null && asset.packetLoss !== undefined ? Number(asset.packetLoss) : (asset.loss !== null && asset.loss !== undefined ? Number(asset.loss) : null);
    const jit = asset.jitter !== null && asset.jitter !== undefined ? Number(asset.jitter) : null;

    return {
        extractedMetrics: {
            isComputer,
            isLink,
            isPrinter,
            latencia_ms: lat,
            perda_pacotes_pct: loss,
            jitter_ms: jit,
            cpu_pct: asset.cpuUtil !== null && asset.cpuUtil !== undefined ? Number(asset.cpuUtil) : null,
            ram_pct: asset.ramUtil !== null && asset.ramUtil !== undefined ? Number(asset.ramUtil) : null,
            toner_pct: asset.tonerLevel !== null && asset.tonerLevel !== undefined ? Number(asset.tonerLevel) : null,
            pingSuccess: pingResult ? Boolean(pingResult.success) : null
        }
    };
}

/**
 * Nó 2: Análise Preditiva de Tendência (ml-regression)
 */
async function computeTrendNode(state) {
    const { asset, extractedMetrics } = state;
    let trend = null;

    try {
        if (extractedMetrics.isLink && asset.id) {
            trend = await predictiveService.forecastBandwidth(asset.id, asset.bandwidth);
        } else if (extractedMetrics.isPrinter && asset.id) {
            trend = await predictiveService.forecastToner(asset.id);
        }
    } catch (e) {
        logger.warn({ error: e.message, assetId: asset.id }, 'Falha não bloqueante na análise de tendência preditiva');
    }

    return { trend };
}

/**
 * Nó 3: Construção de Prompt e Inferência Determinística via Ollama
 */
async function buildPromptAndInferNode(state) {
    const { asset, pingResult, extractedMetrics, trend, model } = state;
    const ollamaClient = require('../ollama/ollama-client');

    const hostId = String(asset.id || asset.name || 'UNKNOWN_HOST');
    const assetTypeStr = extractedMetrics.isComputer ? 'Estação Windows (ITAM)' : (extractedMetrics.isLink ? 'Circuito WAN' : (extractedMetrics.isPrinter ? 'Impressora' : 'Ativo'));

    let prompt = `### SYSTEM DIRECTIVE (STRICT ANCHORING ENGINE)

OBJETIVO:
Você atua exclusivamente como a Máquina de Validação e Laudo Técnico Determinístico AIOps do NOC do Rodoviário Camilo dos Santos. Sua tarefa é analisar as métricas de telemetria sem deduzir, improvisar ou aplicar lógicas fora do contexto explícito fornecido.

DIRETRIZES DE EXECUÇÃO (REGRAS RÍGIDAS):
1. ANCORAGEM RESTRITA: Toda e qualquer conclusão deve ser obtida única e exclusivamente a partir dos fatos, métricas e variáveis explicitamente presentes no bloco DADOS_TELEMETRIA. Se um dado não estiver registrado ali, trate-o como INEXISTENTE (NULO). Jamais deduza, invente ou alucine métricas, portas, IPs ou falhas que não estejam comprovados nos dados.
2. EXTRAÇÃO DETERMINÍSTICA: Não presuma causas, efeitos ou regras de negócio implícitas. Utilize correspondência literal de evidências técnicas nas métricas fornecidas.
3. PRESERVAÇÃO REGRA V8: Para estações Windows que não respondem a ICMP Ping mas estão com Zabbix Agent v2 ativo, a causa técnica é bloqueio padrão de firewall/NAT, não indisponibilidade do host.
4. SAÍDA FORMATADA EM JSON ESTRITO: A resposta deve ser EXCLUSIVAMENTE um objeto JSON válido, sem texto introdutório, sem explicações em prosa antes ou depois, e sem blocos Markdown (sem marcadores de código).
5. PROIBIÇÃO DE EMOJIS: É terminantemente proibido utilizar emojis ou símbolos informais.

--- DADOS_TELEMETRIA ---
- host_id: "${hostId}"
- tipo: "${assetTypeStr}"
- nome: "${asset.name || 'N/D'}"
- ip: "${asset.ip || 'N/D'}"
- status_zabbix: "${(asset.status || 'online').toUpperCase()}"
- latencia_ms: ${extractedMetrics.latencia_ms !== null ? extractedMetrics.latencia_ms : 'null'}
- perda_pacotes_pct: ${extractedMetrics.perda_pacotes_pct !== null ? extractedMetrics.perda_pacotes_pct : 'null'}
- jitter_ms: ${extractedMetrics.jitter_ms !== null ? extractedMetrics.jitter_ms : 'null'}
- ping_externo: ${pingResult ? (pingResult.success ? 'CONEXAO_SUCESSO' : 'TIMEOUT_BLOQUEIO_ROTA') : 'NAO_EXECUTADO'}
${trend ? `- tendencia_ml: ${JSON.stringify(trend)}` : ''}

CONTRATO JSON OBRIGATÓRIO:
{
  "host_id": "${hostId}",
  "status_apurado": "NORMAL | ALERTA | CRITICO",
  "metricas_analisadas": {
    "latencia_ms": number ou null,
    "perda_pacotes_pct": number ou null,
    "jitter_ms": number ou null
  },
  "violacao_sla": boolean,
  "evidencias_literais": ["string"],
  "acao_recomendada": "string"
}`;

    let rawLlmResponse = '';
    try {
        const url = await ollamaClient.getActiveUrl();
        const targetModel = model || ollamaClient.model;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000); // 2 minutos

        const res = await fetch(`${url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: targetModel,
                prompt,
                format: 'json',
                stream: false,
                options: {
                    temperature: 0.1,
                    num_predict: 500,
                    num_thread: 8
                }
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
            const json = await res.json();
            rawLlmResponse = (json.response || '').trim();
        }
    } catch (e) {
        logger.warn({ error: e.message }, 'Falha na requisição HTTP direta ao Ollama no nó LangGraph');
    }

    return {
        llmPrompt: prompt,
        rawLlmResponse
    };
}

/**
 * Nó 4: Validação Determinística de Schema (Zod) e Construção do Laudo
 */
async function validateAndEnforceNode(state) {
    const { asset, pingResult, extractedMetrics, rawLlmResponse, trend } = state;
    const hostId = String(asset.id || asset.name || 'UNKNOWN_HOST');

    let validatedDiagnostic = null;

    // Tentativa de parse e validação Zod da resposta do LLM
    if (rawLlmResponse) {
        try {
            const cleanJsonStr = rawLlmResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJsonStr);
            const zodResult = AiopsDiagnosticSchema.safeParse(parsed);
            if (zodResult.success) {
                validatedDiagnostic = zodResult.data;
            } else {
                logger.warn({ errors: zodResult.error.errors }, 'Schema Zod violado pelo LLM. Aplicando fallback determinístico.');
            }
        } catch (e) {
            logger.warn({ error: e.message }, 'Falha de JSON parse na resposta do LLM. Aplicando fallback determinístico.');
        }
    }

    // Fallback determinístico rígido caso o LLM não responda ou viole o contrato
    if (!validatedDiagnostic) {
        const hasHighLoss = extractedMetrics.perda_pacotes_pct !== null && extractedMetrics.perda_pacotes_pct > 2;
        const hasHighLatency = extractedMetrics.latencia_ms !== null && extractedMetrics.latencia_ms > 100;
        const isOffline = (asset.status || '').toLowerCase() === 'offline';

        const statusApurado = isOffline || hasHighLoss ? 'CRITICO' : (hasHighLatency ? 'ALERTA' : 'NORMAL');
        const violacaoSla = isOffline || (extractedMetrics.perda_pacotes_pct !== null && extractedMetrics.perda_pacotes_pct > 5);

        const evidencias = [];
        if (asset.status) evidencias.push(`Status registrado no Zabbix: ${asset.status.toUpperCase()}`);
        if (extractedMetrics.latencia_ms !== null) evidencias.push(`Latência média registrada: ${extractedMetrics.latencia_ms} ms`);
        if (extractedMetrics.perda_pacotes_pct !== null) evidencias.push(`Perda de pacotes: ${extractedMetrics.perda_pacotes_pct}%`);
        if (extractedMetrics.jitter_ms !== null) evidencias.push(`Jitter medido: ${extractedMetrics.jitter_ms} ms`);
        if (pingResult) {
            evidencias.push(pingResult.success ? 'ICMP Ping executado com sucesso.' : 'Falha no ICMP Ping (bloqueio de firewall ou timeout de rota).');
        }
        if (trend && trend.message) {
            evidencias.push(`Projeção ML: ${trend.message}`);
        }

        let acao = 'Manter monitoramento contínuo em regime operacional normal.';
        if (isOffline) {
            acao = 'Acionar suporte técnico imediato da operadora/filial para verificação de enlace físico e energia.';
        } else if (hasHighLoss) {
            acao = 'Abrir chamado técnico com operadora de telecom para mitigação de perda de pacotes e análise de rota.';
        } else if (extractedMetrics.isComputer && pingResult && !pingResult.success) {
            acao = 'Estação operacional via Zabbix Agent v2. Sem necessidade de ação corretiva para bloqueio de ICMP local.';
        }

        validatedDiagnostic = {
            host_id: hostId,
            status_apurado: statusApurado,
            metricas_analisadas: {
                latencia_ms: extractedMetrics.latencia_ms,
                perda_pacotes_pct: extractedMetrics.perda_pacotes_pct,
                jitter_ms: extractedMetrics.jitter_ms
            },
            violacao_sla: violacaoSla,
            evidencias_literais: evidencias,
            acao_recomendada: acao
        };
    }

    // Geração do Laudo Pericial em Markdown sem emojis
    const statusColor = validatedDiagnostic.status_apurado === 'CRITICO' ? 'CRÍTICO' : (validatedDiagnostic.status_apurado === 'ALERTA' ? 'ALERTA' : 'NORMAL');
    const slaText = validatedDiagnostic.violacao_sla ? 'SIM (VIOLAÇÃO REGISTRADA)' : 'NÃO (CONFORME)';

    const analysisMarkdown = `### 1. Diagnóstico Técnico e Telemetria
- Host / Ativo: ${asset.name || validatedDiagnostic.host_id} (IP: ${asset.ip || 'N/D'})
- Status Apurado: ${statusColor}
- Violação de SLA: ${slaText}
- Latência RTT: ${validatedDiagnostic.metricas_analisadas.latencia_ms !== null ? validatedDiagnostic.metricas_analisadas.latencia_ms + ' ms' : 'N/D'}
- Perda de Pacotes: ${validatedDiagnostic.metricas_analisadas.perda_pacotes_pct !== null ? validatedDiagnostic.metricas_analisadas.perda_pacotes_pct + '%' : '0%'}
- Jitter: ${validatedDiagnostic.metricas_analisadas.jitter_ms !== null ? validatedDiagnostic.metricas_analisadas.jitter_ms + ' ms' : 'N/D'}

### 2. Análise de Causa Raiz (RCA) e Evidências Literais
${validatedDiagnostic.evidencias_literais.map(e => `- ${e}`).join('\n')}

### 3. Avaliação de Impacto Operacional e SLAs
${validatedDiagnostic.violacao_sla
    ? 'Degradação severa ou indisponibilidade identificada com impacto nas operações logísticas de transporte de cargas. Aplicável notificação formal e glosa em fatura.'
    : 'Operação íntegra e estável dentro dos parâmetros contratuais de disponibilidade e tempo de resposta.'}

### 4. Recomendações Técnicas e Plano de Ação
- ${validatedDiagnostic.acao_recomendada}`;

    return {
        validatedDiagnostic,
        analysisMarkdown
    };
}

/**
 * Nó 5: Persistência Estruturada no SQLite
 */
async function persistDiagnosticNode(state) {
    const { asset, validatedDiagnostic, analysisMarkdown } = state;
    let persistedId = null;

    try {
        const targetType = asset.deviceType || (asset.isp ? 'link' : (asset.blackCounter !== undefined ? 'printer' : 'computer'));
        const sql = `
            INSERT INTO aiops_diagnostics (
                host_id, target_type, status_apurado, violacao_sla,
                metricas_analisadas, evidencias_literais, acao_recomendada, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const res = await db.run(sql, [
            validatedDiagnostic.host_id,
            targetType,
            validatedDiagnostic.status_apurado,
            validatedDiagnostic.violacao_sla ? 1 : 0,
            JSON.stringify(validatedDiagnostic.metricas_analisadas),
            JSON.stringify(validatedDiagnostic.evidencias_literais),
            validatedDiagnostic.acao_recomendada,
            JSON.stringify({
                ...validatedDiagnostic,
                analysis: analysisMarkdown
            })
        ]);
        persistedId = res.lastID;
    } catch (e) {
        logger.error({ error: e.message }, 'Falha ao persistir diagnóstico AIOps no SQLite');
    }

    return { persistedId };
}

// Compilação do grafo LangGraph
const workflow = new StateGraph(AiopsState)
    .addNode('extractTelemetry', extractTelemetryNode)
    .addNode('computeTrend', computeTrendNode)
    .addNode('buildPromptAndInfer', buildPromptAndInferNode)
    .addNode('validateAndEnforce', validateAndEnforceNode)
    .addNode('persistDiagnostic', persistDiagnosticNode)
    .addEdge(START, 'extractTelemetry')
    .addEdge('extractTelemetry', 'computeTrend')
    .addEdge('computeTrend', 'buildPromptAndInfer')
    .addEdge('buildPromptAndInfer', 'validateAndEnforce')
    .addEdge('validateAndEnforce', 'persistDiagnostic')
    .addEdge('persistDiagnostic', END);

const aiopsGraph = workflow.compile();

module.exports = {
    aiopsGraph
};
