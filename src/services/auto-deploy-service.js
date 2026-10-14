const { exec, spawn } = require('child_process');
const net = require('net');
const telemetryService = require('./telemetry-service');
const logger = require('../core/logger');
const zabbixClient = require('../infrastructure/zabbix/zabbix-client');

function isPortOpen(ip, port, timeoutMs = 600) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('error', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, ip);
    });
}

class AutoDeployService {
    constructor() {
        this.activeJobs = new Map();
        this.pendingTasks = new Map();
        this.passwords = ["cs1984ibm", "cs1984dell", "cs1984ibmtc", "cs1984ibmtp", "cs1984hp", "cs1984multilaser"];
        this.users = ["Administrador", "suporte", "admin"];
    }

    claimPendingTask(hostname) {
        if (!hostname) return { hasTask: false };
        const cleanHost = String(hostname).toUpperCase().trim();

        const comps = telemetryService.latestPayload?.computers || [];
        const found = comps.find(c => String(c.name || '').toUpperCase().trim() === cleanHost);
        const hostBranch = found && found.city ? String(found.city).toUpperCase().trim() : null;

        if (!hostBranch) return { hasTask: false };

        const pending = this.pendingTasks.get(hostBranch);
        if (pending && pending.expiresAt > Date.now()) {
            this.pendingTasks.delete(hostBranch);

            const timeNow = () => new Date().toLocaleTimeString();
            this.appendLog(hostBranch, `[${timeNow()}] [+] Estação ${cleanHost} conectou via Express Pulse e assumiu como ponte!\n`);
            this.appendLog(hostBranch, `[${timeNow()}] [*] Iniciando varredura e deploy localmente na filial ${hostBranch}...\n\n`);

            const job = this.activeJobs.get(hostBranch);
            if (job) job.bridgeMachine = cleanHost;

            return { hasTask: true, branch: hostBranch };
        }

        return { hasTask: false };
    }

    runExec(cmdStr, timeoutMs = 4000) {
        return new Promise((resolve, reject) => {
            exec(cmdStr, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
                if (err) return reject(new Error(stderr || stdout || err.message));
                resolve(stdout ? stdout.trim() : '');
            });
        });
    }

    async getBranchCandidates() {
        if (!telemetryService.latestPayload) {
            await telemetryService.collectTelemetry();
        }

        const payload = telemetryService.latestPayload || {};
        const computers = payload.computers || [];

        const branches = new Map();
        computers.forEach(comp => {
            const branch = (comp.city || 'GERAL').toUpperCase().trim();
            if (!branches.has(branch)) {
                branches.set(branch, []);
            }
            branches.get(branch).push(comp);
        });

        const result = [];

        for (const [branchCode, comps] of branches.entries()) {
            const onlineComps = comps.filter(c => c.status === 'online' && c.agentStatus === 'online');

            const sortedCandidates = [...onlineComps].sort((a, b) => {
                const clockA = parseInt(a.lastClock || 0);
                const clockB = parseInt(b.lastClock || 0);
                if (clockB !== clockA) return clockB - clockA;
                const cpuA = parseFloat(a.cpuUtil || 50);
                const cpuB = parseFloat(b.cpuUtil || 50);
                return cpuA - cpuB;
            });

            const bridgehead = sortedCandidates.length > 0 ? sortedCandidates[0] : null;

            result.push({
                branchCode,
                totalComputers: comps.length,
                onlineComputers: onlineComps.length,
                offlineComputers: comps.length - onlineComps.length,
                bridgeheadCandidate: bridgehead ? {
                    id: bridgehead.id,
                    name: bridgehead.name,
                    ip: bridgehead.ip || bridgehead.localIp,
                    cpuUtil: bridgehead.cpuUtil,
                    ramUtil: bridgehead.ramUtil,
                    uptime: bridgehead.uptime
                } : null,
                candidatesCount: sortedCandidates.length,
                lastJob: this.activeJobs.get(branchCode) ? {
                    status: this.activeJobs.get(branchCode).status,
                    triggeredAt: this.activeJobs.get(branchCode).triggeredAt,
                    bridgeMachine: this.activeJobs.get(branchCode).bridgeMachine
                } : null
            });
        }

        return result.sort((a, b) => b.onlineComputers - a.onlineComputers);
    }

    appendLog(branchCode, text) {
        const job = this.activeJobs.get(branchCode);
        if (!job) return;

        job.logs += text;
        for (const res of job.listeners) {
            try {
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
            } catch (_) {}
        }
    }

    finishJob(branchCode, code, details = '') {
        const cleanBranch = String(branchCode || '').toUpperCase().trim();
        this.pendingTasks.delete(cleanBranch);
        const job = this.activeJobs.get(cleanBranch);
        if (!job) return;

        if (job.safetyTimer) {
            clearTimeout(job.safetyTimer);
            job.safetyTimer = null;
        }
        if (job.monitorInterval) {
            clearInterval(job.monitorInterval);
            job.monitorInterval = null;
        }

        job.status = code === 0 ? 'CONCLUIDO' : 'ERRO';
        job.endTime = new Date().toISOString();
        if (details) this.appendLog(branchCode, `\n[${new Date().toLocaleTimeString()}] ${details}\n`);

        for (const res of job.listeners) {
            try {
                res.write(`data: ${JSON.stringify({ done: true, code, status: job.status })}\n\n`);
                res.end();
            } catch (_) {}
        }
        job.listeners.clear();
    }

    subscribeLogs(branchCode, req, res) {
        const cleanBranch = String(branchCode || '').toUpperCase().trim();
        if (req.socket) {
            req.socket.setTimeout(0);
            req.socket.setNoDelay(true);
            req.socket.setKeepAlive(true, 5000);
        }
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        let job = this.activeJobs.get(cleanBranch);
        if (!job) {
            let attempts = 0;
            const timer = setInterval(() => {
                attempts++;
                job = this.activeJobs.get(cleanBranch);
                if (job || attempts >= 5) {
                    clearInterval(timer);
                    if (!job) {
                        res.write(`data: ${JSON.stringify({ text: `[${new Date().toLocaleTimeString()}] Nenhum processo recente para a filial ${cleanBranch}.\n`, done: true, code: 0 })}\n\n`);
                        res.end();
                        return;
                    }
                    this._attachSseClient(job, res, req);
                }
            }, 250);
            return;
        }

        this._attachSseClient(job, res, req);
    }

    _attachSseClient(job, res, req) {
        if (job.logs) {
            res.write(`data: ${JSON.stringify({ text: job.logs })}\n\n`);
        }

        if (job.status !== 'EM_EXECUCAO') {
            res.write(`data: ${JSON.stringify({ done: true, code: job.status === 'CONCLUIDO' ? 0 : 1 })}\n\n`);
            res.end();
            return;
        }

        job.listeners.add(res);
        req.on('close', () => {
            job.listeners.delete(res);
        });
    }

    async triggerBranchDeploy(branchCode) {
        const cleanBranch = String(branchCode || '').toUpperCase().trim();
        if (!cleanBranch) throw new Error('Código da filial é obrigatório.');

        if (!telemetryService.latestPayload) {
            await telemetryService.collectTelemetry();
        }
        const comps = (telemetryService.latestPayload?.computers || []).filter(c => (c.city || 'GERAL').toUpperCase().trim() === cleanBranch);
        const onlineComps = comps.filter(c => c.status === 'online' && c.agentStatus === 'online');

        const sortedCandidates = [...onlineComps].sort((a, b) => {
            const clockA = parseInt(a.lastClock || 0);
            const clockB = parseInt(b.lastClock || 0);
            if (clockB !== clockA) return clockB - clockA;
            const cpuA = parseFloat(a.cpuUtil || 50);
            const cpuB = parseFloat(b.cpuUtil || 50);
            return cpuA - cpuB;
        });

        const existingJob = this.activeJobs.get(cleanBranch);
        const jobAgeMs = existingJob && existingJob.triggeredAt ? (Date.now() - new Date(existingJob.triggeredAt).getTime()) : 0;
        if (existingJob && existingJob.status === 'EM_EXECUCAO' && jobAgeMs < 5 * 60 * 1000) {
            return {
                success: true,
                alreadyRunning: true,
                job: {
                    branchCode: cleanBranch,
                    status: 'EM_EXECUCAO',
                    candidatesAvailable: sortedCandidates.length
                }
            };
        }

        const job = {
            branchCode: cleanBranch,
            status: 'EM_EXECUCAO',
            triggeredAt: new Date().toISOString(),
            bridgeMachine: 'Avaliando...',
            logs: '',
            listeners: new Set(),
            childProcess: null
        };
        this.activeJobs.set(cleanBranch, job);
        this.pendingTasks.set(cleanBranch, { branch: cleanBranch, expiresAt: Date.now() + 10 * 60 * 1000 });

        // Disparar loop em background
        this.executeDeploymentLoop(cleanBranch, sortedCandidates).catch(err => {
            this.finishJob(cleanBranch, 1, `[ERRO] ${err.message}`);
        });

        return {
            success: true,
            job: {
                branchCode: cleanBranch,
                status: 'EM_EXECUCAO',
                candidatesAvailable: sortedCandidates.length
            }
        };
    }

    async executeDeploymentLoop(cleanBranch, sortedCandidates) {
        const timeNow = () => new Date().toLocaleTimeString();
        this.appendLog(cleanBranch, `=======================================================\n`);
        this.appendLog(cleanBranch, `   NOC ENTERPRISE — AUTO-DEPLOY & VARREDURA: ${cleanBranch}\n`);
        this.appendLog(cleanBranch, `=======================================================\n`);

        let bridgeElected = null;

        // Se for MTZ, o Servidor Central NOC já está fisicamente na Matriz: executa diretamente local
        if (cleanBranch === 'MTZ') {
            this.appendLog(cleanBranch, `[${timeNow()}] [*] Servidor Central NOC opera fisicamente na Matriz (MTZ). Executando varredura local direta...\n\n`);
        } else {
            // 1. Filtrar candidatos apenas pertencentes às sub-redes corporativas dominantes da filial (exclui Home Office e VPNs avulsas)
            const subnetCounts = {};
            sortedCandidates.forEach(c => {
                const ip = c.localIp || c.ip;
                if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
                    const prefix = ip.split('.').slice(0, 3).join('.');
                    subnetCounts[prefix] = (subnetCounts[prefix] || 0) + 1;
                }
            });

            const legitimateCandidates = sortedCandidates.filter(c => {
                const ip = c.localIp || c.ip;
                if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
                const prefix = ip.split('.').slice(0, 3).join('.');
                return (subnetCounts[prefix] || 0) >= 2 || sortedCandidates.length <= 2;
            });

            const candidatesToProbe = legitimateCandidates.slice(0, 3);
            this.appendLog(cleanBranch, `[${timeNow()}] [INÍCIO] Analisando ${legitimateCandidates.length} estações corporativas na filial...\n`);

            for (let i = 0; i < candidatesToProbe.length; i++) {
                const cand = candidatesToProbe[i];
                const candHostId = cand.id || cand.hostid;
                const candIp = (cand.localIp && !cand.localIp.startsWith('127.')) 
                    ? cand.localIp 
                    : (cand.ip && !cand.ip.startsWith('127.') ? cand.ip : null);

                this.appendLog(cleanBranch, `[${timeNow()}] [*] Conectando à estação ${cand.name} (${candIp || '--'})...\n`);

                if (candHostId) {
                    const sName = `NOC-AutoDeploy-${cleanBranch}-${Date.now()}`;
                    const srvAddr = (candIp && (candIp.startsWith('192.168.100.') || candIp.startsWith('192.168.101.'))) ? '192.168.100.222:4002' : 'rcsfti.ddns.net:4002';
                    const launchCmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$dst = \\"$env:TEMP\\deploy-zabbix.ps1\\"; (New-Object Net.WebClient).DownloadFile('http://${srvAddr}/deploy-zabbix.ps1', $dst); Start-Process powershell.exe -ArgumentList \\"-ExecutionPolicy Bypass -File \`\"$dst\`\" -Sigla ${cleanBranch} -Silent\\" -WindowStyle Hidden; Write-Output DISPARADO_COM_SUCESSO"`;

                    let scriptId = null;
                    try {
                        // 1. Tentar disparo passivo direto (se porta 10050 estiver acessível)
                        const createRes = await zabbixClient.request('script.create', {
                            name: sName,
                            type: 0,
                            execute_on: 0,
                            command: launchCmd,
                            scope: 2
                        });

                        if (createRes && createRes.scriptids && createRes.scriptids.length > 0) {
                            scriptId = createRes.scriptids[0];
                            const execPromise = zabbixClient.request('script.execute', {
                                scriptid: scriptId,
                                hostid: String(candHostId)
                            });
                            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_PASSIVO_10050')), 2500));
                            const execRes = await Promise.race([execPromise, timeoutPromise]);

                            if (execRes && (execRes.response === 'success' || (execRes.value && execRes.value.includes('DISPARADO')))) {
                                bridgeElected = { cand, method: 'ZABBIX_PASSIVO' };
                                const job = this.activeJobs.get(cleanBranch);
                                if (job) job.bridgeMachine = cand.name;

                                this.appendLog(cleanBranch, `[${timeNow()}] [+] Estação ${cand.name} conectada como ponte na filial ${cleanBranch}.\n`);
                                this.appendLog(cleanBranch, `[${timeNow()}] [*] Iniciando varredura da rede e deploy...\n\n`);
                                break;
                            }
                        }
                    } catch (_) {
                        // 2. Se a escuta passiva na porta 10050 falhou (típico de estações atrás de NAT), dispara via Zabbix Active Check (Zero-Touch)
                        try {
                            const psCmd = `$dst = Join-Path $env:TEMP 'deploy-zabbix.ps1'; (New-Object Net.WebClient).DownloadFile('http://${srvAddr}/deploy-zabbix.ps1', $dst); & $dst -Sigla ${cleanBranch} -Silent; Write-Output DISPARADO_OK`;
                            const escapedCmd = psCmd.replace(/"/g, '\\"');
                            const itemKey = `system.run["powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \\"${escapedCmd}\\"",nowait]`;

                            const activeRes = await zabbixClient.request('item.create', {
                                name: `NOC-AutoDeploy-${cleanBranch}-${Date.now()}`,
                                key_: itemKey,
                                hostid: String(candHostId),
                                type: 7, // Zabbix agent (active)
                                value_type: 4,
                                delay: '5s'
                            });

                            if (activeRes && activeRes.itemids && activeRes.itemids.length > 0) {
                                const activeItemId = activeRes.itemids[0];
                                if (!bridgeElected) bridgeElected = { cand, method: 'ZABBIX_ACTIVE' };
                                const job = this.activeJobs.get(cleanBranch);
                                if (job) {
                                    if (job.bridgeMachine === 'Avaliando...') job.bridgeMachine = cand.name;
                                    if (!job.activeItemIds) job.activeItemIds = [];
                                    job.activeItemIds.push(activeItemId);
                                }

                                this.appendLog(cleanBranch, `[${timeNow()}] [+] Estação ${cand.name} armada como ponte local (Active Agent Zero-Touch).\n`);

                                // Mantém por 180s para garantir que o ciclo de RefreshActiveChecks do agente capture a tarefa
                                setTimeout(() => {
                                    zabbixClient.request('item.delete', [activeItemId]).catch(() => {});
                                }, 180000);
                                break;
                            }
                        } catch (activeErr) {
                            this.appendLog(cleanBranch, `[${timeNow()}] [-] Estação ${cand.name} indisponível (${activeErr.message}). Tentando próxima...\n`);
                        }
                    } finally {
                        if (scriptId) {
                            zabbixClient.request('script.delete', [scriptId]).catch(() => {});
                        }
                    }
                }
            }

            if (bridgeElected) {
                this.appendLog(cleanBranch, `[${timeNow()}] [*] Executando varredura e deploy localmente na filial ${cleanBranch}...\n\n`);
            }
        }

        // 2. Se nenhuma estação na filial respondeu, executa pelo Servidor Central
        if (!bridgeElected) {
            this.appendLog(cleanBranch, `[${timeNow()}] [*] Executando varredura via Servidor Central...\n\n`);

            const child = spawn('powershell.exe', [
                '-NoProfile',
                '-ExecutionPolicy', 'Bypass',
                '-File', 'C:\\NOC\\public\\deploy-zabbix.ps1',
                '-Sigla', cleanBranch,
                '-Silent'
            ], {
                windowsHide: true
            });

            const job = this.activeJobs.get(cleanBranch);
            if (job) job.childProcess = child;

            child.stdout.on('data', chunk => {
                this.appendLog(cleanBranch, chunk.toString());
            });

            child.stderr.on('data', chunk => {
                this.appendLog(cleanBranch, chunk.toString());
            });

            child.on('close', code => {
                this.finishJob(cleanBranch, code, code === 0 ? 'Varredura e deploy finalizados com sucesso!' : 'Processo encerrado.');
            });
        } else {
            // Varredura remota por ponte: SEM limite artificial de tempo.
            // Monitoramento de Liveness / Failover: se a máquina ponte for desligada ou ficar offline,
            // o sistema elege automaticamente outra máquina online na filial para continuar o trabalho.
            const job = this.activeJobs.get(cleanBranch);
            if (job) {
                job.lastActivityTime = Date.now();
                job.electedBridge = bridgeElected ? bridgeElected.cand : null;

                if (job.monitorInterval) clearInterval(job.monitorInterval);
                job.monitorInterval = setInterval(async () => {
                    const currentJob = this.activeJobs.get(cleanBranch);
                    if (!currentJob || currentJob.status !== 'EM_EXECUCAO') {
                        clearInterval(job.monitorInterval);
                        return;
                    }

                    // Se a ponte parar de enviar logs por mais de 3 minutos, verifica se ela caiu/desligou
                    const silenceMs = Date.now() - (currentJob.lastActivityTime || Date.now());
                    if (silenceMs > 3 * 60 * 1000) {
                        const bName = currentJob.bridgeMachine || (currentJob.electedBridge ? currentJob.electedBridge.name : null);
                        const comps = telemetryService.latestPayload?.computers || [];
                        const bStatus = comps.find(c => String(c.name || '').toUpperCase() === String(bName || '').toUpperCase());
                        
                        const isOffline = !bStatus || bStatus.status === 'offline' || bStatus.agentStatus === 'offline';
                        if (isOffline) {
                            this.appendLog(cleanBranch, `\n[${timeNow()}] [FAILOVER] Estação ponte ${bName} foi desligada ou desconectou!\n`);
                            this.appendLog(cleanBranch, `[${timeNow()}] [*] Buscando nova estação online na filial ${cleanBranch} para continuar...\n`);

                            // Remove a máquina que caiu e busca o próximo candidato online
                            const remainingCandidates = sortedCandidates.filter(c => String(c.name || '').toUpperCase() !== String(bName || '').toUpperCase());
                            clearInterval(job.monitorInterval);

                            if (remainingCandidates.length > 0) {
                                currentJob.lastActivityTime = Date.now();
                                this.executeDeploymentLoop(cleanBranch, remainingCandidates).catch(err => {
                                    this.finishJob(cleanBranch, 1, `[ERRO FAILOVER] ${err.message}`);
                                });
                            } else {
                                this.appendLog(cleanBranch, `[${timeNow()}] [-] Nenhuma outra estação online disponível em ${cleanBranch}. Tentando via Servidor Central...\n`);
                                this.executeDeploymentLoop(cleanBranch, []).catch(err => {
                                    this.finishJob(cleanBranch, 1, `[ERRO] ${err.message}`);
                                });
                            }
                        }
                    }
                }, 30000);
            }
        }
    }

    async registerBranchDevice({ ip, ips, hostname, city }) {
        const { toBranchCode } = require('../domain/rules/branch-resolver');
        const cleanBranch = toBranchCode(city) || (city ? String(city).trim().toUpperCase() : null);
        if (!cleanBranch) return { success: false, error: 'Cidade/Filial inválida' };

        const deviceService = require('./device-service');
        const telemetryService = require('./telemetry-service');
        const zabbixClient = require('../infrastructure/zabbix/zabbix-client');

        const allIps = [ip].concat(Array.isArray(ips) ? ips : []).filter(Boolean);

        // 1. Tentar localizar o host no Zabbix e atualizar imediatamente
        try {
            let matchedHost = null;
            if (hostname) {
                const byName = await zabbixClient.request('host.get', {
                    filter: { name: hostname },
                    selectInterfaces: ['ip']
                });
                if (byName && byName.length > 0) matchedHost = byName[0];
            }

            if (!matchedHost && allIps.length > 0) {
                const allHosts = await zabbixClient.request('host.get', {
                    output: ['hostid', 'name'],
                    selectInterfaces: ['ip']
                });
                matchedHost = allHosts.find(h => 
                    h.interfaces && h.interfaces.some(i => allIps.includes(i.ip))
                );
            }

            if (matchedHost) {
                await deviceService.updateHostInventory(matchedHost.hostid, { location: cleanBranch });
                logger.info({ host: matchedHost.name, branch: cleanBranch }, 'Filial vinculada diretamente ao host no Zabbix');
                return { success: true, host: matchedHost.name, branch: cleanBranch };
            }
        } catch (err) {
            logger.warn({ err: err.message }, 'Falha ao buscar host no Zabbix para vinculação de filial');
        }

        // 2. Se o host ainda não reportou ao Zabbix, registrar como pendente
        telemetryService.registerPendingBranchAssignment(allIps, cleanBranch, hostname);
        return { success: true, pending: true, branch: cleanBranch };
    }

    receiveLog(branchCode, text, done = false, code = 0) {
        const cleanBranch = String(branchCode || '').toUpperCase().trim();
        if (!cleanBranch) return;

        const job = this.activeJobs.get(cleanBranch);
        if (job) {
            job.lastActivityTime = Date.now();
            if (job.activeItemId) {
                zabbixClient.request('item.delete', [job.activeItemId]).catch(() => {});
                job.activeItemId = null;
            }
            if (job.activeItemIds && job.activeItemIds.length > 0) {
                zabbixClient.request('item.delete', job.activeItemIds).catch(() => {});
                job.activeItemIds = [];
            }
        }

        if (text) {
            this.appendLog(cleanBranch, text);
        }
        if (done) {
            this.finishJob(cleanBranch, code);
        }
    }
}

module.exports = new AutoDeployService();
