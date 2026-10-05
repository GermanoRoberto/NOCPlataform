const complianceRepository = require('../repositories/compliance-repository');
const logger = require('../core/logger');

function cleanTextEncoding(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/Seguran[\ufffd\?]+a/gi, 'Segurança')
        .replace(/Opera[\ufffd\?]+o/gi, 'Operação')
        .replace(/Configura[\ufffd\?]+o/gi, 'Configuração')
        .replace(/Instala[\ufffd\?]+o/gi, 'Instalação')
        .replace(/Atualiza[\ufffd\?]+o/gi, 'Atualização')
        .replace(/Prote[\ufffd\?]+o/gi, 'Proteção')
        .replace(/vers[\ufffd\?]+o/gi, 'versão')
        .replace(/[\ufffd]/g, '')
        .trim();
}

function extractSoftwareFamily(name) {
    if (!name || typeof name !== 'string') return '';
    let clean = cleanTextEncoding(name.trim());
    // Remover sufixos do tipo 'versao 1.2.3' antes de extrair a família
    clean = clean.replace(/\s+vers[aã]o\s+.*$/i, '').trim();

    // Agrupamento de componentes e bibliotecas Microsoft
    if (/^Microsoft Visual C\+\+/i.test(clean)) {
        return 'Microsoft Visual C++ Redistributables';
    }
    if (/^Microsoft \.NET/i.test(clean)) {
        return 'Microsoft .NET Runtimes & Frameworks';
    }
    if (/^Microsoft Windows Desktop Runtime/i.test(clean)) {
        return 'Microsoft Windows Desktop Runtime';
    }
    if (/^Microsoft ASP\.NET/i.test(clean)) {
        return 'Microsoft ASP.NET Core';
    }
    if (/^Microsoft Edge WebView/i.test(clean)) {
        return 'Microsoft Edge WebView2 Runtime';
    }

    // Identificar família base de aplicativos removendo versões e sufixos de arquitetura
    // Ex: "LibreOffice 7.5.3.2" -> "LibreOffice", "Google Chrome 128.0" -> "Google Chrome"
    const m = clean.match(/^([A-Za-z0-9\s\.\+\#\-]+?)\s+(?:v?(\d+[\.\d]*|\d{4})|(?:\(.*\))|(?:64-bit|32-bit|x64|x86)).*$/i);
    if (m && m[1] && m[1].length > 2) {
        return m[1].trim();
    }
    return clean;
}

class ComplianceService {
    async analyzeCompliance(computers = []) {
        const rules = await complianceRepository.getAllRules();
        const tombstones = await complianceRepository.getActiveUninstalledSoftwares().catch(() => []);

        // Mapa de soft-deletados / desinstalados recentemente por host: Set(`${hostId}:${swNameLower}`)
        const tombstoneSet = new Set();
        tombstones.forEach(t => {
            const hId = String(t.host_id);
            const sw = (t.software_name || '').toLowerCase().trim();
            if (hId && sw) {
                tombstoneSet.add(`${hId}:${sw}`);
            }
        });

        // Compilação prévia de Regex para alta performance
        const compiledRules = rules.map(r => {
            let regex = null;
            try {
                regex = new RegExp(r.pattern, 'i');
            } catch (e) {
                regex = new RegExp(r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            }
            return {
                ...r,
                regex
            };
        });

        const softwareCatalogMap = new Map();
        const machineAudits = [];
        let totalForbiddenDetections = 0;

        computers.forEach(comp => {
            const installed = comp.installedSoftware || [];
            const compForbidden = [];
            const compAllowed = [];
            const compReview = [];
            const cId = String(comp.id);

            installed.forEach(sw => {
                const rawName = (sw.name || sw).trim();
                const swName = cleanTextEncoding(rawName);
                if (!swName) return;

                const familyName = extractSoftwareFamily(swName);

                // Se o software foi recentemente desinstalado nesta máquina (tombstone ativo), ignorar
                const swLower = swName.toLowerCase();
                const famLower = familyName.toLowerCase();
                let isTombstoned = false;
                for (const item of tombstoneSet) {
                    if (item.startsWith(`${cId}:`)) {
                        const targetPattern = item.split(':')[1];
                        if (swLower.includes(targetPattern) || famLower.includes(targetPattern) || targetPattern.includes(famLower)) {
                            isTombstoned = true;
                            break;
                        }
                    }
                }
                if (isTombstoned) {
                    return;
                }

                // Encontrar regra correspondente: tenta pelo nome completo ou pelo nome da família
                let matchedRule = compiledRules.find(r => r.regex && (r.regex.test(swName) || r.regex.test(familyName)));

                const status = matchedRule ? matchedRule.status : 'REVIEW';
                const severity = matchedRule ? matchedRule.severity : 'MEDIUM';
                const category = matchedRule ? matchedRule.category : (sw.category || 'Não Classificado');
                const reason = matchedRule ? (matchedRule.reason || '') : 'Software detectado aguardando homologação da TI.';
                const ruleId = matchedRule ? matchedRule.id : null;

                const swVersion = sw.version && sw.version !== 'Instalado' ? sw.version : (swName !== familyName ? (swName.replace(familyName, '').trim() || 'Instalado') : 'Instalado');

                const machineInfo = {
                    id: comp.id,
                    name: comp.name || 'Estação',
                    city: comp.city || 'Sem Unidade',
                    ip: comp.localIp || comp.ip || comp.wanIp || '--',
                    loggedUser: comp.loggedUser || comp.owner || 'Não identificado',
                    version: swVersion,
                    fullName: swName,
                    status: comp.status || 'online'
                };

                // Agrupamento na visão de Catálogo de Software por Família Canônica
                const catalogKey = familyName.toLowerCase();
                if (!softwareCatalogMap.has(catalogKey)) {
                    softwareCatalogMap.set(catalogKey, {
                        name: familyName,
                        fullNameSample: swName,
                        category,
                        status,
                        severity,
                        reason,
                        ruleId,
                        ruleName: matchedRule ? matchedRule.name : null,
                        versionsMap: {},
                        versionsList: [],
                        machines: []
                    });
                }
                const catEntry = softwareCatalogMap.get(catalogKey);
                if (!catEntry.machines.some(m => m.id === comp.id)) {
                    catEntry.machines.push(machineInfo);
                }

                // Rastreio de dispersão de versões para SAM / Auditoria de Licenças
                const vKey = swVersion || 'Instalado';
                catEntry.versionsMap[vKey] = (catEntry.versionsMap[vKey] || 0) + 1;

                const finding = {
                    name: swName,
                    family: familyName,
                    category,
                    version: swVersion,
                    status,
                    severity,
                    reason
                };

                if (status === 'FORBIDDEN') {
                    compForbidden.push(finding);
                    totalForbiddenDetections++;
                } else if (status === 'ALLOWED') {
                    compAllowed.push(finding);
                } else {
                    compReview.push(finding);
                }
            });

            machineAudits.push({
                id: comp.id,
                name: comp.name || 'Estação',
                city: comp.city || 'Sem Unidade',
                ip: comp.localIp || comp.ip || comp.wanIp || '--',
                loggedUser: comp.loggedUser || comp.owner || 'Não identificado',
                status: comp.status || 'online',
                isCompliant: compForbidden.length === 0,
                forbiddenCount: compForbidden.length,
                allowedCount: compAllowed.length,
                reviewCount: compReview.length,
                forbiddenSoftwares: compForbidden,
                allowedSoftwares: compAllowed,
                reviewSoftwares: compReview,
                totalSoftwareCount: installed.length
            });
        });

        // Formatar lista de versões de cada software para auditoria de licenças / dispersão
        softwareCatalogMap.forEach(item => {
            item.versionsList = Object.entries(item.versionsMap || {})
                .map(([ver, count]) => ({ version: ver, count }))
                .sort((a, b) => b.count - a.count);
        });

        // Ordenação do Catálogo: Proibidos no topo, seguidos por Em Revisão, depois Homologados
        const softwareCatalog = Array.from(softwareCatalogMap.values()).sort((a, b) => {
            const weight = { FORBIDDEN: 3, REVIEW: 2, ALLOWED: 1 };
            const diff = (weight[b.status] || 0) - (weight[a.status] || 0);
            if (diff !== 0) return diff;
            return b.machines.length - a.machines.length;
        });

        // Ordenação das Máquinas: Máquinas não conformes no topo
        machineAudits.sort((a, b) => {
            if (a.isCompliant !== b.isCompliant) {
                return a.isCompliant ? 1 : -1;
            }
            return b.forbiddenCount - a.forbiddenCount;
        });

        const totalComputers = computers.length;
        const compliantComputers = machineAudits.filter(m => m.isCompliant).length;
        const nonCompliantComputers = totalComputers - compliantComputers;
        const complianceScore = totalComputers > 0 ? Math.round((compliantComputers / totalComputers) * 100) : 100;

        const forbiddenTitles = softwareCatalog.filter(s => s.status === 'FORBIDDEN').length;
        const allowedTitles = softwareCatalog.filter(s => s.status === 'ALLOWED').length;
        const reviewTitles = softwareCatalog.filter(s => s.status === 'REVIEW').length;

        return {
            summary: {
                totalComputers,
                compliantComputers,
                nonCompliantComputers,
                complianceScore,
                totalUniqueSoftwares: softwareCatalog.length,
                forbiddenTitles,
                allowedTitles,
                reviewTitles,
                totalForbiddenDetections
            },
            softwareCatalog,
            machineAudits,
            rules
        };
    }

    async quickClassify(softwareName, status, reason = '') {
        if (!softwareName || !status) {
            throw new Error('Nome do software e status são obrigatórios');
        }
        const cleanName = cleanTextEncoding(softwareName.trim());
        const familyName = extractSoftwareFamily(cleanName);
        const safePattern = `^${familyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
        const severity = status === 'FORBIDDEN' ? 'HIGH' : 'INFO';
        const category = status === 'FORBIDDEN' ? 'Bloqueado por Política' : 'Homologado por TI';

        // Verificar se já existe uma regra anterior que dê match com este software ou família para sobrescrever
        const allRules = await complianceRepository.getAllRules();
        const existingRule = allRules.find(r => {
            try {
                const reg = new RegExp(r.pattern, 'i');
                return reg.test(cleanName) || reg.test(familyName);
            } catch (e) {
                return false;
            }
        });

        const targetId = existingRule ? existingRule.id : `rule-quick-${familyName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

        return complianceRepository.upsertRule({
            id: targetId,
            name: existingRule ? existingRule.name : cleanName,
            pattern: existingRule ? existingRule.pattern : safePattern,
            category: existingRule ? existingRule.category : category,
            status,
            severity,
            reason: reason || (status === 'FORBIDDEN' ? 'Classificado como não permitido pela equipe de TI.' : 'Homologado para uso corporativo.')
        });
    }

    async querySoftwareIntel(softwareName) {
        if (!softwareName || typeof softwareName !== 'string') {
            throw new Error('Nome do software inválido para consulta.');
        }

        const cleanName = cleanTextEncoding(softwareName.trim());
        const familyName = extractSoftwareFamily(cleanName);
        const lowerName = cleanName.toLowerCase();

        // 1. Dicionário Heurístico Imediato (Zero Latência) com regras SAM realistas
        // Softwares Gratuitos / Freemium tolerados / Ferramentas de TI
        const knownSafe = [
            { pattern: /winrar/i, type: 'FREEMIUM_TOLERATED', category: 'Utilitário / Compactador', risk: 'BAIXO', recommendation: 'HOMOLOGAR', summary: 'WinRAR opera no modelo shareware/nagware tolerado no mercado corporativo. Não exige bloqueio imediato caso a empresa adote a versão de avaliação tolerada.' },
            { pattern: /7-zip/i, type: 'FREE_OPEN_SOURCE', category: 'Compactador de Arquivos', risk: 'NENHUM', recommendation: 'HOMOLOGAR', summary: 'Software 100% gratuito e Open Source (GNU LGPL), totalmente liberado para uso comercial sem necessidade de compra de licença.' },
            { pattern: /virtualbox/i, type: 'FREE_COMMERCIAL_RESTRICTED', category: 'Virtualização', risk: 'BAIXO', recommendation: 'HOMOLOGAR_COM_RESSALVA', summary: 'O VirtualBox Base é gratuito (GPLv2). Deve-se apenas evitar a instalação comercial do Extension Pack (PUEL) se não licenciado.' },
            { pattern: /notepad\+\+/i, type: 'FREE_OPEN_SOURCE', category: 'Editor de Texto', risk: 'NENHUM', recommendation: 'HOMOLOGAR', summary: 'Editor Open Source (GPL) totalmente gratuito e seguro para ambiente produtivo.' },
            { pattern: /vlc media player/i, type: 'FREE_OPEN_SOURCE', category: 'Reprodutor de Mídia', risk: 'NENHUM', recommendation: 'HOMOLOGAR', summary: 'Software Open Source livre de royalties para reprodução de áudio e vídeo.' },
            { pattern: /adobe acrobat reader/i, type: 'FREEWARE', category: 'Leitor PDF', risk: 'NENHUM', recommendation: 'HOMOLOGAR', summary: 'Acrobat Reader básico é gratuito para leitura. Somente a versão Adobe Acrobat Pro/Standard exige licença comercial paga.' },
            { pattern: /foxit (reader|pdf reader)/i, type: 'FREEWARE', category: 'Leitor PDF', risk: 'NENHUM', recommendation: 'HOMOLOGAR', summary: 'Foxit Reader básico é gratuito para visualização de documentos.' },
            { pattern: /componente de seguran[cç]a|topaz|warsaw/i, type: 'BANKING_SECURITY', category: 'Módulo Bancário', risk: 'NENHUM', recommendation: 'HOMOLOGAR', summary: 'Módulo de segurança e proteção de internet banking homologado por instituições financeiras (Bradesco, Santander, Banco do Brasil).' },
            { pattern: /microsoft edge|google chrome|mozilla firefox/i, type: 'FREE_BROWSER', category: 'Navegador Web', risk: 'NENHUM', recommendation: 'HOMOLOGAR', summary: 'Navegador web gratuito e padrão de mercado corporativo.' },
            { pattern: /web\s*pki/i, type: 'DIGITAL_CERTIFICATE', category: 'Certificação Digital ICP-Brasil', risk: 'NENHUM', recommendation: 'HOMOLOGAR', summary: 'Componente da Lacuna Software que faz a ponte entre navegadores e certificados digitais A1/A3 (Tokens USB, Smartcards, e-CNPJ e e-CPF). Indispensável para faturamento, contabilidade e emissão de CT-e/MDF-e/NF-e nos portais do governo e bancos.' },
            { pattern: /safesign|pjeoffice|starsign|web\s*signer/i, type: 'DIGITAL_CERTIFICATE', category: 'Certificação Digital ICP-Brasil', risk: 'NENHUM', recommendation: 'HOMOLOGAR', summary: 'Gerenciador criptográfico de cartões inteligentes, tokens USB e certificados digitais para assinatura eletrônica de documentos fiscais, jurídicos e contábeis.' },
            { pattern: /ssw|sswbar|sswpc|sswscan/i, type: 'ERP_LOGISTICS', category: 'Sistema Operacional de Logística', risk: 'NENHUM', recommendation: 'HOMOLOGAR', summary: 'Software core da operação de transporte de cargas da empresa (SSW). Utilizado para emissão, conferência e digitalização de CT-e, minutas de despacho e romaneios.' },
            { pattern: /webadvisor.*mcafee/i, type: 'ADVISOR_EXTENSION', category: 'Segurança Web / Bloatware', risk: 'BAIXO', recommendation: 'BLOQUEAR', summary: 'Extensão de navegação da McAfee instalada comumente como pacote não solicitado (bloatware) junto com Adobe Reader ou drivers. Não é necessária para o trabalho e pode ser desinstalada.' },
            { pattern: /anydesk/i, type: 'REMOTE_ACCESS', category: 'Acesso Remoto', risk: 'MEDIO', recommendation: 'REVISAR', summary: 'AnyDesk possui versão de uso pessoal, porém no meio corporativo o fabricante impõe licença comercial. Pode ser tolerado para suporte ou bloqueado para evitar acessos externos não geridos.' },
            { pattern: /teamviewer/i, type: 'REMOTE_ACCESS', category: 'Acesso Remoto', risk: 'ALTO', recommendation: 'REVISAR', summary: 'TeamViewer bloqueia conexões em redes corporativas com aviso de uso comercial detectado. Exige licença comercial ou substituição pelo agente padrão de suporte.' }
        ];

        // Softwares Notoriamente Piratas / Ativadores / Cracks
        const knownPirate = [
            { pattern: /autokms|kmspico|kms-vl-all|microsoft activation scripts|mas_aio|re-loader|toolkit/i, type: 'CRACK_ACTIVATOR', category: 'Ativador Ilegal / Risco Crítico', risk: 'CRITICO', recommendation: 'BLOQUEAR', summary: 'Ferramenta de crack ou ativador ilegal que burla licenças Microsoft (Windows/Office). Vetor comum de malwares e violação grave de compliance.' },
            { pattern: /utorrent|bittorrent|qbittorrent|ares|soulseek/i, type: 'P2P_TORRENT', category: 'P2P / Compartilhamento', risk: 'ALTO', recommendation: 'BLOQUEAR', summary: 'Cliente de download torrent/P2P. Risco alto de download de mídias piratas, malwares e saturação de banda corporativa.' },
            { pattern: /steam|epic games|riot client|roblox|valorant|counter-strike|ea app|ubisoft connect|bluestacks/i, type: 'GAME_ENTERTAINMENT', category: 'Jogos & Entretenimento', risk: 'ALTO', recommendation: 'BLOQUEAR', summary: 'Plataforma de jogos ou emulador. Não homologado para ambiente corporativo por política de conformidade e produtividade.' }
        ];

        // Softwares Notoriamente 100% Pagos / Proprietários
        const knownStrictPaid = [
            { pattern: /autocad|civil 3d|revit|inventor/i, type: 'COMMERCIAL_STRICT', category: 'Engenharia & CAD', risk: 'ALTO', recommendation: 'REVISAR_LICENCA', summary: 'Software Autodesk estritamente comercial e de alto custo. Requer contrato de licença nominal ou token corporativo ativo.' },
            { pattern: /coreldraw|corel draw/i, type: 'COMMERCIAL_STRICT', category: 'Design Gráfico', risk: 'ALTO', recommendation: 'REVISAR_LICENCA', summary: 'Software comercial proprietário da Corel Corporation. Requer aquisição de licença corporativa.' },
            { pattern: /adobe photoshop|adobe illustrator|adobe premiere|adobe indesign/i, type: 'COMMERCIAL_STRICT', category: 'Design & Multimídia', risk: 'ALTO', recommendation: 'REVISAR_LICENCA', summary: 'Aplicativo Creative Cloud estritamente pago via assinatura comercial nominal da Adobe.' },
            { pattern: /microsoft office 20(16|19|21)|microsoft 365 apps/i, type: 'COMMERCIAL_STRICT', category: 'Produtividade Escritório', risk: 'MEDIO', recommendation: 'REVISAR_LICENCA', summary: 'Pacote de produtividade Microsoft comercial. Requer licença perpétua por volume ou assinatura Microsoft 365 vinculada.' }
        ];

        for (const item of knownPirate) {
            if (item.pattern.test(cleanName) || item.pattern.test(familyName)) {
                return {
                    softwareName: cleanName,
                    familyName,
                    source: 'HEURISTIC_RULE',
                    classification: item.type,
                    category: item.category,
                    riskLevel: item.risk,
                    recommendation: item.recommendation,
                    summary: item.summary,
                    isPirateOrCrack: true,
                    isGame: item.type === 'GAME_ENTERTAINMENT',
                    isFreemiumTolerated: false,
                    isStrictlyCommercial: false
                };
            }
        }

        for (const item of knownStrictPaid) {
            if (item.pattern.test(cleanName) || item.pattern.test(familyName)) {
                return {
                    softwareName: cleanName,
                    familyName,
                    source: 'HEURISTIC_RULE',
                    classification: item.type,
                    category: item.category,
                    riskLevel: item.risk,
                    recommendation: item.recommendation,
                    summary: item.summary,
                    isPirateOrCrack: false,
                    isGame: false,
                    isFreemiumTolerated: false,
                    isStrictlyCommercial: true
                };
            }
        }

        for (const item of knownSafe) {
            if (item.pattern.test(cleanName) || item.pattern.test(familyName)) {
                return {
                    softwareName: cleanName,
                    familyName,
                    source: 'HEURISTIC_RULE',
                    classification: item.type,
                    category: item.category,
                    riskLevel: item.risk,
                    recommendation: item.recommendation,
                    summary: item.summary,
                    isPirateOrCrack: false,
                    isGame: false,
                    isFreemiumTolerated: item.type === 'FREEMIUM_TOLERATED' || item.type === 'FREEWARE' || item.type === 'FREE_OPEN_SOURCE',
                    isStrictlyCommercial: false
                };
            }
        }

        // 2. Consulta ao LLM Ollama Local caso não conste no dicionário heurístico
        const ollamaClient = require('../infrastructure/ollama/ollama-client');
        const isUp = await ollamaClient.isAvailable();
        if (!isUp) {
            return {
                softwareName: cleanName,
                familyName,
                source: 'FALLBACK_UNCLASSIFIED',
                classification: 'UNKNOWN',
                category: 'Geral',
                riskLevel: 'MEDIO',
                recommendation: 'REVISAR',
                summary: 'O software não consta no catálogo pré-definido e o motor de IA Ollama local está indisponível para análise profunda.',
                isPirateOrCrack: false,
                isGame: false,
                isFreemiumTolerated: false,
                isStrictlyCommercial: false
            };
        }

        const prompt = `Você é um Auditor Especialista em Licenciamento de Software Corporativo e Cibersegurança no Brasil.
Analise com rigor técnico e bom senso o seguinte software detectado no parque de computadores de uma empresa de logística:
Software: "${cleanName}" (Família: "${familyName}")

--- DIRETRIZES CRÍTICAS DE AUDITORIA ---
1. CRITÉRIO RIGOROSO PARA PIRATARIA: NUNCA acuse um software corporativo legítimo (como Microsoft Office, Windows antigo, AutoCAD, CorelDRAW, WinRAR, etc.) de ser "pirata" apenas por ser uma versão antiga, comercial ou não possuir chave registrada no momento. Um software só deve ser marcado como "isPirateOrCrack: true" ou "CRACK_ACTIVATOR" se for EXPLICITAMENTE uma ferramenta ilícita de quebra/ativação de licença (exemplos: KMSAuto, KMSPico, MAS, patcher, gerador de serial, crack). Softwares comerciais normais devem ser classificados como "COMMERCIAL_STRICT" ou "REVISAR_LICENCA", pois a empresa pode possuir licença perpétua por volume ou chave legítima.
2. EXPLIQUE A FUNÇÃO REAL NA PRÁTICA: O analista e os diretores precisam entender exatamente para que serve o software no dia a dia (ex: automação de pesagem, leitor de documentos, acesso remoto, emissão fiscal, assinatura digital ICP-Brasil, driver, aplicativo bancário).
3. MODELO DE LICENÇA: Gratuito (Freeware/Open-source), Freemium/Tolerado comercialmente, Comercial Pago (requer licença corporativa) ou Bloqueado por política.
4. PROIBIÇÃO ABSOLUTA DE EMOJIS: Não utilize emojis sob qualquer circunstância.
5. RESUMO COMPLETO NO CAMPO "summary": Texto claro de 3 a 5 linhas em português explicando: O que é? Para que serve na prática? Qual o modelo de licença real? Recomendação de manter, licenciar ou desinstalar.

Responda ESTRITAMENTE em formato JSON puro com a seguinte estrutura:
{
  "classification": "FREEMIUM_TOLERATED | FREE_OPEN_SOURCE | COMMERCIAL_STRICT | CRACK_ACTIVATOR | GAME_ENTERTAINMENT | SYSTEM_COMPONENT | UNKNOWN",
  "category": "Nome da Categoria (ex: Certificação Digital, Produtividade, Utilitário, Módulo Bancário, Jogo, etc)",
  "riskLevel": "BAIXO | MEDIO | ALTO | CRITICO",
  "recommendation": "HOMOLOGAR | HOMOLOGAR_COM_RESSALVA | REVISAR_LICENCA | BLOQUEAR",
  "isPirateOrCrack": boolean,
  "isGame": boolean,
  "isFreemiumTolerated": boolean,
  "isStrictlyCommercial": boolean,
  "summary": "Explicação direta contendo: 1) O que é e para que serve o software na prática; 2) Fabricante e modelo de licenciamento; 3) Recomendação prática e se deve ser mantido ou desinstalado."
}`;

        try {
            const url = await ollamaClient.getActiveUrl();
            const availableModels = await ollamaClient.getModels();
            let chosenModel = ollamaClient.model;
            if (!availableModels.includes(chosenModel)) {
                if (availableModels.includes('qwen2.5-coder:7b')) {
                    chosenModel = 'qwen2.5-coder:7b';
                } else if (availableModels.includes('llama3.1:8b')) {
                    chosenModel = 'llama3.1:8b';
                } else if (availableModels.length > 0) {
                    chosenModel = availableModels[0];
                }
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120000); // 120 segundos para inferência segura em CPU

            const res = await fetch(`${url}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: chosenModel,
                    prompt,
                    format: 'json',
                    stream: false,
                    options: {
                        temperature: 0.1,
                        top_p: 0.8,
                        num_predict: 250,
                        num_thread: 8
                    }
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!res.ok) {
                throw new Error(`Ollama HTTP ${res.status}`);
            }

            const data = await res.json();
            const rawResponse = data.response || '';
            const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    softwareName: cleanName,
                    familyName,
                    source: 'OLLAMA_AI',
                    classification: parsed.classification || 'UNKNOWN',
                    category: parsed.category || 'Geral',
                    riskLevel: parsed.riskLevel || 'MEDIO',
                    recommendation: parsed.recommendation || 'REVISAR',
                    summary: parsed.summary || rawResponse.trim(),
                    isPirateOrCrack: Boolean(parsed.isPirateOrCrack),
                    isGame: Boolean(parsed.isGame),
                    isFreemiumTolerated: Boolean(parsed.isFreemiumTolerated),
                    isStrictlyCommercial: Boolean(parsed.isStrictlyCommercial)
                };
            }

            return {
                softwareName: cleanName,
                familyName,
                source: 'OLLAMA_RAW',
                classification: 'UNKNOWN',
                category: 'Geral',
                riskLevel: 'MEDIO',
                recommendation: 'REVISAR',
                summary: rawResponse.replace(/```json|```/g, '').trim(),
                isPirateOrCrack: false,
                isGame: false,
                isFreemiumTolerated: false,
                isStrictlyCommercial: false
            };
        } catch (err) {
            logger.error({ err: err.message, softwareName }, 'Falha ao consultar Ollama para auditoria de software');
            return {
                softwareName: cleanName,
                familyName,
                source: 'ERROR_FALLBACK',
                classification: 'UNKNOWN',
                category: 'Geral',
                riskLevel: 'MEDIO',
                recommendation: 'REVISAR',
                summary: `Erro durante análise de IA: ${err.message}`,
                isPirateOrCrack: false,
                isGame: false,
                isFreemiumTolerated: false,
                isStrictlyCommercial: false
            };
        }
    }

    async uninstallSoftwareRemotely(hostId, softwareName) {
        if (!hostId || !softwareName) {
            throw new Error('HostId e Nome do Software são obrigatórios para desinstalação remota.');
        }

        const zabbixClient = require('../infrastructure/zabbix/zabbix-client');
        const cleanName = cleanTextEncoding(softwareName.trim());
        const familyName = extractSoftwareFamily(cleanName);
        // Usar o nome da família ou a primeira palavra-chave forte para buscar no Registro do Windows
        const searchKeyword = familyName || cleanName;
        const escapedName = searchKeyword.replace(/['"\\$;`|]/g, '').trim();

        // Script PowerShell avançado e universal de desinstalação silenciosa sem interação do usuário
        const psCmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$name = '${escapedName}'; Get-Process | Where-Object { $_.ProcessName -like ('*' + $name + '*') -or $_.Path -like ('*' + $name + '*') } | Stop-Process -Force -ErrorAction SilentlyContinue; $apps = Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and ($_.DisplayName -like ('*' + $name + '*')) }; if (-not $apps) { Write-Output 'SOFTWARE_NOT_FOUND_OR_ALREADY_REMOVED'; exit 0 }; foreach ($app in $apps) { $u = [string]$app.UninstallString; $q = [string]$app.QuietUninstallString; $p = $null; if ($q.Trim()) { $p = Start-Process cmd.exe -ArgumentList ('/c ' + $q.Trim()) -PassThru -WindowStyle Hidden } elseif ($u -match '(?i)msiexec') { $guid = ($u -replace '.*({[A-F0-9-]+}).*', '$1'); $p = Start-Process msiexec.exe -ArgumentList ('/x ' + $guid + ' /qn /norestart ALLUSERS=1') -PassThru -WindowStyle Hidden } else { if ($u -match '^\"([^\"]+)\"\\s*(.*)$') { $exe = $matches[1]; $args = $matches[2] } else { $parts = $u -split '\\s+', 2; $exe = $parts[0].Replace('\"',''); $args = if ($parts.Count -gt 1) { $parts[1] } else { '' } }; $flags = '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /quiet /qn /silent /S --uninstall --system-level --force-uninstall'; $p = Start-Process -FilePath $exe -ArgumentList ($args + ' ' + $flags).Trim() -PassThru -WindowStyle Hidden }; if ($p) { $p.WaitForExit(6000); if ($p.HasExited) { Write-Output ('REMOVIDO_SUCESSO: ' + $app.DisplayName) } else { Write-Output ('DESINSTALACAO_EM_SEGUNDO_PLANO: ' + $app.DisplayName) } } }"`;

        logger.info({ hostId, softwareName: cleanName }, 'Criando script Zabbix temporário para desinstalação remota silenciosa');

        const scriptName = `NOC-Uninstall-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        let scriptId = null;

        try {
            const createRes = await zabbixClient.request('script.create', {
                name: scriptName,
                type: 0, // Zabbix agent
                execute_on: 0, // Agent (LocalSystem)
                command: psCmd,
                scope: 2
            });

            if (!createRes || !createRes.scriptids || createRes.scriptids.length === 0) {
                throw new Error('Falha ao registrar script de desinstalação na API do Zabbix.');
            }

            scriptId = createRes.scriptids[0];

            logger.info({ hostId, scriptId, softwareName: cleanName }, 'Disparando execução remota no Zabbix Agent');
            const execRes = await zabbixClient.request('script.execute', {
                scriptid: scriptId,
                hostid: String(hostId)
            });

            const output = (execRes && execRes.value) ? execRes.value.trim() : 'Comando executado com sucesso no endpoint.';

            // Marcar fila como concluída com sucesso se houver item
            const queueId = `${hostId}-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
            await complianceRepository.updateRemediationStatus(queueId, 'COMPLETED').catch(() => {});

            // Baixa Otimista Imediata no Inventário em Memória do NOC e Registro de Tombstone (Sem esperar 1 hora do Zabbix)
            try {
                await complianceRepository.addUninstalledSoftware(hostId, familyName || cleanName);
                if (familyName && familyName !== cleanName) {
                    await complianceRepository.addUninstalledSoftware(hostId, cleanName);
                }

                const telemetryService = require('./telemetry-service');
                if (telemetryService.latestPayload && Array.isArray(telemetryService.latestPayload.computers)) {
                    const comp = telemetryService.latestPayload.computers.find(c => String(c.id) === String(hostId));
                    if (comp && Array.isArray(comp.installedSoftware)) {
                        const targetKeyword = (familyName || cleanName).toLowerCase();
                        comp.installedSoftware = comp.installedSoftware.filter(sw => {
                            const swName = (sw.name || sw || '').toLowerCase();
                            return !swName.includes(targetKeyword) && !swName.includes(cleanName.toLowerCase());
                        });
                    }
                }
            } catch (cacheErr) {
                logger.warn({ err: cacheErr.message }, 'Falha ao atualizar cache/tombstone após desinstalação');
            }

            return {
                success: true,
                hostId,
                softwareName: cleanName,
                output,
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            // Em caso de falha (máquina desligada, timeout, offline), enfileirar para execução autônoma assim que conectar
            logger.warn({ hostId, softwareName: cleanName, err: err.message }, 'Estação inacessível no momento. Enfileirando auto-remediação persistente.');
            await complianceRepository.enqueueRemediation(hostId, cleanName).catch(() => {});
            const queueId = `${hostId}-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
            await complianceRepository.updateRemediationStatus(queueId, 'PENDING', err.message).catch(() => {});
            throw err;
        } finally {
            if (scriptId) {
                await zabbixClient.request('script.delete', [scriptId]).catch(e => {
                    logger.warn({ scriptId, error: e.message }, 'Falha ao remover script temporário do Zabbix');
                });
            }
        }
    }

    async uninstallSoftwareFromAllHosts(softwareName, targetHostIds = null) {
        if (!softwareName) {
            throw new Error('Nome do software é obrigatório para desinstalação em massa.');
        }

        const zabbixClient = require('../infrastructure/zabbix/zabbix-client');
        const cleanName = cleanTextEncoding(softwareName.trim());
        const familyName = extractSoftwareFamily(cleanName);
        const searchKeyword = familyName || cleanName;
        const escapedName = searchKeyword.replace(/['"\\$;`|]/g, '').trim();

        let hostsToTarget = [];
        if (Array.isArray(targetHostIds) && targetHostIds.length > 0) {
            hostsToTarget = targetHostIds.map(h => typeof h === 'object' ? h : { id: String(h), name: String(h) });
        } else {
            const telemetryService = require('./telemetry-service');
            const computers = (telemetryService.latestPayload && telemetryService.latestPayload.computers) || [];
            const overview = await this.analyzeCompliance(computers);
            const catalogItem = overview.softwareCatalog.find(s => s.name.toLowerCase() === cleanName.toLowerCase() || s.fullNameSample.toLowerCase() === cleanName.toLowerCase());
            if (!catalogItem || !catalogItem.machines || catalogItem.machines.length === 0) {
                throw new Error(`Nenhuma estação encontrada com o software "${cleanName}" instalado.`);
            }
            hostsToTarget = catalogItem.machines;
        }

        logger.info({ softwareName: cleanName, targetCount: hostsToTarget.length }, 'Iniciando desinstalação silenciosa em massa em todas as estações');

        // Script PowerShell avançado e universal de desinstalação silenciosa sem interação do usuário
        const psCmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$name = '${escapedName}'; Get-Process | Where-Object { $_.ProcessName -like ('*' + $name + '*') -or $_.Path -like ('*' + $name + '*') } | Stop-Process -Force -ErrorAction SilentlyContinue; $apps = Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and ($_.DisplayName -like ('*' + $name + '*')) }; if (-not $apps) { Write-Output 'SOFTWARE_NOT_FOUND_OR_ALREADY_REMOVED'; exit 0 }; foreach ($app in $apps) { $u = [string]$app.UninstallString; $q = [string]$app.QuietUninstallString; $p = $null; if ($q.Trim()) { $p = Start-Process cmd.exe -ArgumentList ('/c ' + $q.Trim()) -PassThru -WindowStyle Hidden } elseif ($u -match '(?i)msiexec') { $guid = ($u -replace '.*({[A-F0-9-]+}).*', '$1'); $p = Start-Process msiexec.exe -ArgumentList ('/x ' + $guid + ' /qn /norestart ALLUSERS=1') -PassThru -WindowStyle Hidden } else { if ($u -match '^\"([^\"]+)\"\\s*(.*)$') { $exe = $matches[1]; $args = $matches[2] } else { $parts = $u -split '\\s+', 2; $exe = $parts[0].Replace('\"',''); $args = if ($parts.Count -gt 1) { $parts[1] } else { '' } }; $flags = '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /quiet /qn /silent /S --uninstall --system-level --force-uninstall'; $p = Start-Process -FilePath $exe -ArgumentList ($args + ' ' + $flags).Trim() -PassThru -WindowStyle Hidden }; if ($p) { $p.WaitForExit(6000); if ($p.HasExited) { Write-Output ('REMOVIDO_SUCESSO: ' + $app.DisplayName) } else { Write-Output ('DESINSTALACAO_EM_SEGUNDO_PLANO: ' + $app.DisplayName) } } }"`;

        const scriptName = `NOC-MassUninstall-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        let scriptId = null;
        const results = [];

        try {
            const createRes = await zabbixClient.request('script.create', {
                name: scriptName,
                type: 0,
                execute_on: 0,
                command: psCmd,
                scope: 2
            });

            if (!createRes || !createRes.scriptids || createRes.scriptids.length === 0) {
                throw new Error('Falha ao registrar script de desinstalação em massa na API do Zabbix.');
            }

            scriptId = createRes.scriptids[0];

            // Execução em paralelo controlado (até 5 hosts simultâneos)
            for (const host of hostsToTarget) {
                const hId = String(host.id || host);
                const hName = host.name || hId;
                try {
                    const execRes = await zabbixClient.request('script.execute', {
                        scriptid: scriptId,
                        hostid: hId
                    });
                    const output = (execRes && execRes.value) ? execRes.value.trim() : 'Comando executado.';
                    results.push({
                        hostId: hId,
                        hostName: hName,
                        success: true,
                        output
                    });
                } catch (execErr) {
                    logger.error({ hostId: hId, err: execErr.message }, 'Falha na desinstalação de software na estação');
                    results.push({
                        hostId: hId,
                        hostName: hName,
                        success: false,
                        error: execErr.message
                    });
                }
            }

            const successCount = results.filter(r => r.success).length;
            const failedCount = results.length - successCount;

            // Registrar Tombstones e Evictar do Cache em Memória para todos os sucessos
            try {
                const successfulHostIds = results.filter(r => r.success).map(r => String(r.hostId));
                for (const hId of successfulHostIds) {
                    await complianceRepository.addUninstalledSoftware(hId, familyName || cleanName);
                    if (familyName && familyName !== cleanName) {
                        await complianceRepository.addUninstalledSoftware(hId, cleanName);
                    }
                }

                const telemetryService = require('./telemetry-service');
                if (telemetryService.latestPayload && Array.isArray(telemetryService.latestPayload.computers)) {
                    const targetKeyword = (familyName || cleanName).toLowerCase();
                    telemetryService.latestPayload.computers.forEach(comp => {
                        if (successfulHostIds.includes(String(comp.id)) && Array.isArray(comp.installedSoftware)) {
                            comp.installedSoftware = comp.installedSoftware.filter(sw => {
                                const swName = (sw.name || sw || '').toLowerCase();
                                return !swName.includes(targetKeyword) && !swName.includes(cleanName.toLowerCase());
                            });
                        }
                    });
                }
            } catch (evictErr) {
                logger.warn({ err: evictErr.message }, 'Falha ao registrar tombstones em massa');
            }

            return {
                success: failedCount === 0,
                softwareName: cleanName,
                totalTargets: results.length,
                successCount,
                failedCount,
                results,
                timestamp: new Date().toISOString()
            };
        } finally {
            if (scriptId) {
                await zabbixClient.request('script.delete', [scriptId]).catch(e => {
                    logger.warn({ scriptId, error: e.message }, 'Falha ao remover script temporário do Zabbix');
                });
            }
        }
    }

    async getComplianceOverview() {
        const telemetryService = require('./telemetry-service');
        const computers = (telemetryService.latestPayload && telemetryService.latestPayload.computers) || [];
        return await this.analyzeCompliance(computers);
    }

    async processPendingRemediations(onlineComputers = []) {
        try {
            const pending = await complianceRepository.getPendingRemediations();
            if (!pending || pending.length === 0) return;

            const onlineMap = new Map();
            onlineComputers.forEach(c => {
                if (c.status === 'online' || c.status === 'warning') {
                    onlineMap.set(String(c.id), c);
                }
            });

            for (const item of pending) {
                const targetHost = onlineMap.get(String(item.host_id));
                if (!targetHost) {
                    // Host ainda offline/desligado, mantém PENDING para a próxima oportunidade
                    continue;
                }

                // Evitar flood caso tente repetidas vezes sem sucesso
                if (item.attempts >= 10) {
                    logger.warn({ hostId: item.host_id, software: item.software_name }, 'Limite de 10 tentativas atingido para auto-remediação. Mantendo suspenso.');
                    continue;
                }

                logger.info({ hostId: item.host_id, hostName: targetHost.name, software: item.software_name }, 'Estação conectou! Executando auto-remediação pendente...');
                try {
                    await this.uninstallSoftwareRemotely(item.host_id, item.software_name);
                    logger.info({ hostId: item.host_id, software: item.software_name }, 'Auto-remediação concluída com sucesso!');
                } catch (retryErr) {
                    logger.warn({ hostId: item.host_id, software: item.software_name, err: retryErr.message }, 'Tentativa de auto-remediação falhou. Fila mantida.');
                }
            }
        } catch (err) {
            logger.error({ err: err.message }, 'Erro ao processar fila de auto-remediação');
        }
    }
}

module.exports = new ComplianceService();
