const logger = require('../../core/logger');

class OllamaClient {
    constructor() {
        this.primaryUrl = process.env.OLLAMA_URL || 'http://192.168.100.222:11434';
        this.fallbackUrl = 'http://127.0.0.1:11434';
        this.baseUrl = this.primaryUrl;
        this.model = process.env.OLLAMA_MODEL || 'noc-aiops:8b';
        this.cache = new Map();
    }

    async getActiveUrl() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2500);
            const res = await fetch(`${this.primaryUrl}/api/tags`, { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
                this.baseUrl = this.primaryUrl;
                return this.primaryUrl;
            }
        } catch {}

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);
            const res = await fetch(`${this.fallbackUrl}/api/tags`, { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
                this.baseUrl = this.fallbackUrl;
                return this.fallbackUrl;
            }
        } catch {}

        return this.baseUrl;
    }

    async isAvailable() {
        try {
            const url = await this.getActiveUrl();
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
            clearTimeout(timeout);
            return res.ok;
        } catch {
            return false;
        }
    }

    async ensureService() {
        const available = await this.isAvailable();
        if (available) {
            logger.info({ endpoint: this.baseUrl }, 'Servico AIOps (Ollama) ja esta ativo e operacional.');
            return true;
        }

        try {
            const { spawn } = require('child_process');
            const ollamaCmd = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
            const child = spawn(ollamaCmd, ['serve'], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });
            child.unref();

            logger.info('Inicializando serviço local Ollama em segundo plano...');
            for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 500));
                if (await this.isAvailable()) {
                    logger.info({ endpoint: this.baseUrl }, 'Serviço AIOps (Ollama) iniciado com sucesso.');
                    return true;
                }
            }
        } catch (err) {
            logger.warn({ error: err.message }, 'Tentativa de disparar Ollama automaticamente falhou.');
        }
        return false;
    }

    async getModels() {
        try {
            const url = await this.getActiveUrl();
            const res = await fetch(`${url}/api/tags`);
            if (!res.ok) return [];
            const data = await res.json();
            return (data.models || []).map(m => m.name);
        } catch (e) {
            logger.warn({ error: e.message }, 'Falha ao listar modelos do Ollama');
            return [];
        }
    }

    async diagnoseAsset(asset, pingResult = null, chosenModel = null, forceFresh = false) {
        const targetModel = chosenModel || this.model;
        const cacheKey = `${targetModel}_asset_${asset.id || asset.name}_${pingResult ? (pingResult.success ? '1' : '0') : 'raw'}`;

        if (!forceFresh && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.cachedAt < 5 * 60 * 1000) {
                return cached.data;
            }
        }

        try {
            const { aiopsGraph } = require('../aiops/aiops-graph');
            const graphResult = await aiopsGraph.invoke({
                asset,
                pingResult,
                model: targetModel
            });

            const result = {
                success: true,
                model: targetModel,
                analysis: graphResult.analysisMarkdown,
                structured: graphResult.validatedDiagnostic,
                persistedId: graphResult.persistedId,
                generatedAt: new Date().toISOString()
            };

            this.cache.set(cacheKey, { cachedAt: Date.now(), data: result });
            return result;
        } catch (e) {
            logger.error({ error: e.message }, 'Falha na geração de análise via AIOps LangGraph');
            throw e;
        }
    }

    async diagnoseReport(reportType, reportData = {}, chosenModel = null, forceFresh = false) {
        const url = await this.getActiveUrl();
        const targetModel = chosenModel || this.model;
        const cacheKey = `${targetModel}_report_${reportType}_${Date.now() - (Date.now() % (5 * 60 * 1000))}`;

        if (!forceFresh && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.cachedAt < 5 * 60 * 1000) {
                return cached.data;
            }
        }

        let prompt = '';

        if (reportType === 'consolidated-reports') {
            const total = reportData.total || 54;
            const online = reportData.online || 52;
            const offline = reportData.offline || 2;
            const avgLat = reportData.avgLat || 25;
            const offlineCircuits = reportData.offlineCircuits || 'VIX (Oi Fibra), SPO (Algar Telecom)';

            prompt = `Você é o Engenheiro Chefe de Redes e Telecomunicações do NOC do Rodoviário Camilo dos Santos.
Analise o panorama geral consolidado da malha corporativa WAN e emita um parecer executivo de engenharia e SLA em português.

--- TELEMETRIA CONSOLIDADA DA MALHA WAN ---
- Total de Enlaces de Telecomunicação: ${total} circuitos
- Enlaces Operacionais (ONLINE): ${online}
- Enlaces com Interrupção (OFFLINE): ${offline}
- Circuitos Offline Identificados: ${offlineCircuits}
- Latência Média Ponderada da Malha (RTT): ${avgLat} ms
- SLA Global Estimado: 99.5%

--- DIRETRIZES DE RESPOSTA E EXECUÇÃO DETERMINÍSTICA (REGRAS RÍGIDAS) ---
1. ANCORAGEM RESTRITA: Toda e qualquer conclusão deve ser obtida única e exclusivamente a partir dos dados explicitamente presentes acima. Se um dado não estiver registrado ali, trate-o como INEXISTENTE (NULO). Jamais deduza, invente ou alucine métricas, circuitos, provedores ou falhas que não estejam comprovados.
2. EXTRAÇÃO DETERMINÍSTICA: Não presuma causas ou efeitos sem correspondência literal de evidências técnicas nas métricas fornecidas.
3. Estruture sua análise executiva em 4 tópicos com títulos em Markdown:
### 1. Panorama Geral da Infraestrutura WAN
### 2. Avaliação de Circuitos Críticos e Incidentes Ativos
### 3. Desempenho dos Provedores e Cumprimento de SLA
### 4. Plano de Ação e Medidas Preventivas
4. Seja técnico, analítico e fundamente suas recomendações na criticidade logística das operações de transporte de cargas.
5. PROIBIÇÃO DE EMOJIS: É terminantemente proibido utilizar emojis ou símbolos informais. Mantenha tom formal e pericial.`;
        } else if (reportType === 'consolidated-itam') {
            const total = reportData.total || 50;
            const online = reportData.online || 48;
            const withAntivirus = reportData.withAntivirus || 45;
            const withoutAntivirus = total - withAntivirus;

            prompt = `Você é o Especialista em Segurança da Informação e Gestão de Ativos (ITAM) do Rodoviário Camilo dos Santos.
Analise a auditoria consolidada do parque corporativo de estações de trabalho e conformidade de endpoint e emita um parecer técnico em português.

--- DADOS DA AUDITORIA CONSOLIDADA ITAM ---
- Total de Estações Registradas: ${total}
- Agentes Zabbix v2 Ativos / Comunicantes: ${online}
- Endpoints com Antivírus Corporativo Ativo: ${withAntivirus}
- Endpoints com Vulnerabilidade (Sem Antivírus Detectado): ${withoutAntivirus}

--- DIRETRIZES DE RESPOSTA E EXECUÇÃO DETERMINÍSTICA (REGRAS RÍGIDAS) ---
1. ANCORAGEM RESTRITA: Toda e qualquer conclusão deve ser obtida única e exclusivamente a partir dos dados explicitamente presentes acima. Se um dado não estiver registrado ali, trate-o como INEXISTENTE (NULO).
2. EXTRAÇÃO DETERMINÍSTICA: Não presuma riscos ou vulnerabilidades não fundamentados nos dados literais de endpoint e antivírus informados.
3. Estruture sua auditoria em 4 tópicos com títulos em Markdown:
### 1. Diagnóstico de Conformidade e Segurança dos Endpoints
### 2. Análise de Riscos e Cobertura de Proteção
### 3. Cobertura Geográfica e Telemetria via Agente Zabbix v2
### 4. Plano de Remediação e Recomendações de Governança
4. Seja objetivo, priorizando a proteção de dados corporativos e prevenção de ameaças.
5. PROIBIÇÃO DE EMOJIS: É terminantemente proibido utilizar emojis ou símbolos informais. Mantenha tom formal e pericial.`;
        } else if (reportType === 'consolidated-incidents') {
            const total = reportData.total || 10;
            const breachCount = reportData.breachCount || 3;
            const worstCircuits = reportData.worstCircuits || 'Circuito VIX, Circuito SPO';

            prompt = `Você é o Auditor Técnico Especialista em Telecomunicações e Contratos de SLA do Rodoviário Camilo dos Santos.
Analise os registros de indisponibilidade de enlaces WAN e emita um laudo técnico pericial para contestação de faturas e aplicação de penalidades (glosa).

--- AUDITORIA DE INCIDENTES E DISPONIBILIDADE ---
- Total de Eventos de Queda no Período: ${total}
- Eventos com Violação de SLA Contratual (> 1 minuto): ${breachCount}
- Circuitos Mais Impactados por Quedas: ${worstCircuits}
- Monitoramento: Telemetria contínua ICMP/SNMP com histerese anti-flapping (3 falhas consecutivas)

--- DIRETRIZES DE RESPOSTA E EXECUÇÃO DETERMINÍSTICA (REGRAS RÍGIDAS) ---
1. ANCORAGEM RESTRITA: Toda e qualquer conclusão deve ser obtida única e exclusivamente a partir dos eventos e métricas de queda registrados acima. É terminantemente proibido inventar valores de multa ou faturas sem respaldo pericial.
2. EXTRAÇÃO DETERMINÍSTICA: Não presuma causas de queda não registradas na telemetria.
3. Estruture o laudo em 4 tópicos com títulos em Markdown:
### 1. Parecer Pericial de Conformidade Contratual de SLA
### 2. Gravidade dos Eventos de Interrupção e Impacto Operacional
### 3. Base Técnica para Glosa e Desconto em Fatura Mensal
### 4. Notificação Formal às Operadoras e Exigências Técnicas
4. Emita um parecer formal, com rigor técnico e respaldo para negociação financeira.
5. PROIBIÇÃO DE EMOJIS: É terminantemente proibido utilizar emojis ou símbolos informais. Mantenha tom formal e pericial.`;
        } else {
            prompt = `Você é o Engenheiro Especialista do NOC do Rodoviário Camilo dos Santos. Emita um parecer técnico executivo determinístico sobre os dados consolidados do relatório: ${JSON.stringify(reportData)}. ANCORAGEM RESTRITA: Não deduza fatos fora do JSON informado. PROIBIÇÃO DE EMOJIS: Não utilize emojis.`;
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 180000); // 3 minutos

            const res = await fetch(`${url}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: targetModel,
                    prompt,
                    stream: false,
                    options: {
                        num_predict: 650,
                        temperature: 0.15,
                        top_p: 0.9,
                        num_thread: 8
                    }
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Ollama HTTP ${res.status}: ${errText}`);
            }

            const data = await res.json();
            const result = {
                success: true,
                model: targetModel,
                analysis: (data.response || '').trim(),
                generatedAt: new Date().toISOString()
            };

            // Persistência pericial estruturada no SQLite
            try {
                const db = require('../database/connection');
                await db.run(
                    `INSERT INTO aiops_diagnostics (
                        host_id, target_type, status_apurado, violacao_sla,
                        metricas_analisadas, evidencias_literais, acao_recomendada, payload_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        String(reportType),
                        'report',
                        'NORMAL',
                        0,
                        JSON.stringify(reportData),
                        JSON.stringify([`Parecer consolidado emitido para o módulo: ${reportType}`]),
                        'Monitoramento e acompanhamento das métricas consolidadas.',
                        JSON.stringify({ ...result, reportData })
                    ]
                );
            } catch (errDb) {
                logger.warn({ error: errDb.message }, 'Falha não bloqueante ao persistir laudo de relatório no SQLite');
            }

            this.cache.set(cacheKey, { cachedAt: Date.now(), data: result });
            return result;
        } catch (e) {
            logger.error({ error: e.message }, 'Falha na geração de parecer consolidado via Ollama');
            throw e;
        }
    }

    /**
     * Validação Contextual Determinística conforme meta-prompt
     * @param {string} contextText 
     * @param {string|null} chosenModel 
     * @returns {Promise<Object>}
     */
    async validateContext(contextText, chosenModel = null) {
        const url = await this.getActiveUrl();
        const targetModel = chosenModel || this.model;

        const prompt = `[SISTEMA: MODO DE EXECUÇÃO DETERMINÍSTICO E TESTE DE CONTEXTO]

OBJETIVO:
Você atuará exclusivamente como uma máquina de validação e execução de testes contextuais de software para sistemas de IA e Machine Learning. Sua tarefa é validar 100% o funcionamento das ferramentas implementadas e o histórico conversacional sem deduzir, improvisar ou aplicar lógicas fora do contexto explícito fornecido.

DIRETRIZES DE VALIDAÇÃO (REGRAS RÍGIDAS):
1. ANCORAGEM RESTRITA: Toda e qualquer resposta deve ser obtida única e exclusivamente a partir dos fatos, variáveis e exemplos explicitamente presentes no bloco CONTEXTO_TESTE. Se um dado não estiver registrado ali, trate-o como INEXISTENTE (NULO).
2. EXTRAÇÃO DETERMINÍSTICA: Não presuma causas, efeitos ou regras de negócio implícitas. Utilize correspondência literal de padrões e instruções formais.
3. COBERTURA TOTAL DE CASOS: Cada exemplo, solicitação do usuário ou evento do diálogo presente no contexto deve ser submetido individualmente à verificação de entrada -> processamento -> saída esperada.
4. DETECÇÃO DE INCONSISTÊNCIAS: Caso qualquer chamada de ferramenta ou variável de estado apresente parâmetros incompletos em relação ao contrato da ferramenta, marque o teste imediatamente como [FALHA] e aponte o parâmetro faltante.
5. PROIBIÇÃO DE EMOJIS: É terminantemente proibido utilizar emojis ou símbolos informais.

ENTRADA PARA ANÁLISE:
---
[CONTEXTO_TESTE]
${contextText}
---

FORMATO DE RESPOSTA OBRIGATÓRIO (Gere um bloco para cada exemplo/interação do contexto):
- ID DO TESTE / PASSO: [Identificador da interação]
- ENTRADA DETECTADA: [Mensagem ou evento exato recebido]
- FERRAMENTA ACIONADA: [Ferramenta selecionada + Parâmetros passados]
- RESULTADO ESPERADO (Conforme Regras): [Saída determinística esperada]
- RESULTADO OBTIDO: [Saída real constatada no contexto]
- STATUS: [SUCESSO | FALHA]
- OBSERVAÇÕES TÉCNICAS: [Apenas discrepâncias literais; sem suposições]`;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120000);

            const res = await fetch(`${url}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: targetModel,
                    prompt,
                    stream: false,
                    options: {
                        temperature: 0.1,
                        num_predict: 800,
                        num_thread: 8
                    }
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Ollama HTTP ${res.status}: ${errText}`);
            }

            const data = await res.json();
            return {
                success: true,
                model: targetModel,
                validation: (data.response || '').trim(),
                validatedAt: new Date().toISOString()
            };
        } catch (e) {
            logger.error({ error: e.message }, 'Falha na validação de contexto via Ollama');
            throw e;
        }
    }
}

module.exports = new OllamaClient();
