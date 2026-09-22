const axios = require('axios');
const config = require('../../core/config');
const logger = require('../../core/logger');
const db = require('../database/connection');

function htmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatTelegramTime(date = new Date()) {
    return date.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

class TelegramClient {
    constructor() {
        this.botToken = config.telegram.botToken;
        this.chatIds = config.telegram.chatIds;
        this.baseUrl = this.botToken ? `https://api.telegram.org/bot${this.botToken}` : null;
        // Mapa em memória de mensagens de alerta ativas para exclusão automática na recuperação
        // Chave: assetId (string) -> Valor: Array<{ chatId: string, messageId: number }>
        this.activeDownAlerts = new Map();
        this.initPersistentAlerts().catch(() => {});
    }

    async initPersistentAlerts() {
        try {
            await db.run(`
                CREATE TABLE IF NOT EXISTS telegram_active_alerts (
                    asset_id TEXT NOT NULL,
                    chat_id TEXT NOT NULL,
                    message_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (asset_id, chat_id, message_id)
                )
            `);
            const rows = await db.query(`SELECT asset_id, chat_id, message_id FROM telegram_active_alerts`);
            for (const r of (rows || [])) {
                const assetId = String(r.asset_id);
                if (!this.activeDownAlerts.has(assetId)) {
                    this.activeDownAlerts.set(assetId, []);
                }
                this.activeDownAlerts.get(assetId).push({
                    chatId: String(r.chat_id),
                    messageId: Number(r.message_id)
                });
            }
            if (rows && rows.length > 0) {
                logger.info({ count: rows.length }, 'Alertas ativos de queda carregados do SQLite para o Telegram.');
            }
        } catch (e) {
            logger.warn({ error: e.message }, 'Falha ao sincronizar alertas persistentes do Telegram.');
        }
    }

    async sendMessage(chatId, text, parseMode = 'HTML') {
        if (!this.baseUrl) return null;
        try {
            const resp = await axios.post(`${this.baseUrl}/sendMessage`, {
                chat_id: chatId,
                text,
                parse_mode: parseMode,
                disable_web_page_preview: true
            }, { timeout: 6000 });

            if (resp.data && resp.data.ok && resp.data.result) {
                return { chatId, messageId: resp.data.result.message_id };
            }
            return null;
        } catch (err) {
            logger.warn({ chatId, error: err.message }, 'Falha no envio Telegram');
            return null;
        }
    }

    async deleteMessage(chatId, messageId) {
        if (!this.baseUrl || !chatId || !messageId) return false;
        try {
            const resp = await axios.post(`${this.baseUrl}/deleteMessage`, {
                chat_id: chatId,
                message_id: messageId
            }, { timeout: 5000 });
            return resp.data && resp.data.ok;
        } catch (err) {
            logger.warn({ chatId, messageId, error: err.message }, 'Falha ao excluir mensagem no Telegram');
            return false;
        }
    }

    async broadcast(text, parseMode = 'HTML') {
        if (!this.chatIds || this.chatIds.length === 0) return [];
        const results = await Promise.allSettled(
            this.chatIds.map(chatId => this.sendMessage(chatId, text, parseMode))
        );
        return results
            .filter(r => r.status === 'fulfilled' && r.value)
            .map(r => r.value);
    }

    async notifyIncidentDown(incident) {
        const assetId = String(incident.assetId || incident.id || '');
        const name = htmlEscape(incident.name || 'Desconhecido');
        const ip = htmlEscape(incident.ip || 'N/A');
        const severity = 'CRITICAL (P1)';
        const timeStr = formatTelegramTime(incident.downAt ? new Date(incident.downAt) : new Date());
        const signal = htmlEscape(incident.signal || incident.detail || 'Host inacessível (100% Packet Loss) via ICMP Ping.');
        const impact = htmlEscape(incident.impact || 'Interrupção de conectividade no circuito principal da filial.');
        const action = htmlEscape(incident.action || 'Verificar roteador de borda ou abrir chamado urgente com o provedor.');

        const draytekList = incident.draytekAccess || [];
        let draytekBlock = [];
        if (draytekList.length > 0) {
            draytekBlock = [
                '',
                '━━━━ CONSOLE DRAYTEK (BALANCEAMENTO) ━━━━',
                ...draytekList.slice(0, 2).map(item => 
                    `🔗 <b>Link Ativo (${htmlEscape(item.name)}):</b> <a href="${htmlEscape(item.url)}">${htmlEscape(item.url)}</a>`
                )
            ];
        } else {
            draytekBlock = [
                '',
                '━━━━ CONSOLE DRAYTEK (BALANCEAMENTO) ━━━━',
                '⚠️ <i>Inacessível externamente (Todos os links da filial estão offline).</i>'
            ];
        }

        const forensicBlock = incident.forensicAnalysis ? [
            '',
            '━━━━ DIAGNÓSTICO ATIVO AIOps (NÍVEL 2) ━━━━',
            `🔬 <b>Laudo Forense:</b> ${htmlEscape(incident.forensicAnalysis)}`
        ] : [];

        const msg = [
            '🚨 <b>NOC ALERTA | QUEDA DE LINK</b>',
            `📍 <b>Link / Unidade:</b> <code>${name}</code>`,
            `🌐 <b>IP / Host:</b> <code>${ip}</code>`,
            `⚡ <b>Severidade:</b> 🔴 <code>${severity}</code>`,
            `🕒 <b>Horário da Queda:</b> <code>${timeStr}</code>`,
            '',
            '━━━━━━━ DETALHAMENTO TÉCNICO ━━━━━━━',
            `• <b>Sinal:</b> ${signal}`,
            `• <b>Impacto:</b> ${impact}`,
            `• <b>Ação Recomendada:</b> ${action}`,
            ...forensicBlock,
            ...draytekBlock,
            '',
            '<i>Camilo dos Santos NOC Engine</i>'
        ].join('\n');

        const sentList = await this.broadcast(msg);
        if (assetId && sentList.length > 0) {
            this.activeDownAlerts.set(assetId, sentList);
            try {
                for (const item of sentList) {
                    if (item && item.chatId && item.messageId) {
                        await db.run(
                            `INSERT OR REPLACE INTO telegram_active_alerts (asset_id, chat_id, message_id) VALUES (?, ?, ?)`,
                            [String(assetId), String(item.chatId), Number(item.messageId)]
                        );
                    }
                }
            } catch (e) {
                logger.warn({ assetId, error: e.message }, 'Falha ao persistir alerta ativo no SQLite');
            }
            logger.info({ assetId, count: sentList.length }, 'Alertas de queda enviados e registrados para exclusão futura no Telegram.');
        }
        return sentList;
    }

    async notifyIncidentUp(incident) {
        const assetId = String(incident.assetId || incident.id || '');
        const name = htmlEscape(incident.name || 'Desconhecido');
        const ip = htmlEscape(incident.ip || 'N/A');
        const duration = htmlEscape(incident.durationText || incident.duration_text || 'N/A');
        const timeStr = formatTelegramTime(incident.upAt ? new Date(incident.upAt) : new Date());

        // 1. Excluir a mensagem anterior de queda do chat, mantendo apenas o retorno
        const previousAlerts = (assetId && this.activeDownAlerts.get(assetId)) || [];
        let alertsToDelete = [...previousAlerts];

        // Se a memória foi resetada por reinicialização do servidor, consulta os registros persistidos no SQLite
        if (alertsToDelete.length === 0 && assetId) {
            try {
                const dbRows = await db.query(`SELECT chat_id, message_id FROM telegram_active_alerts WHERE asset_id = ?`, [String(assetId)]);
                alertsToDelete = (dbRows || []).map(r => ({ chatId: String(r.chat_id), messageId: Number(r.message_id) }));
            } catch (e) {
                logger.warn({ assetId, error: e.message }, 'Falha ao consultar alertas no SQLite para exclusão.');
            }
        }

        for (const item of alertsToDelete) {
            if (item && item.chatId && item.messageId) {
                await this.deleteMessage(item.chatId, item.messageId);
                logger.info({ assetId, chatId: item.chatId, messageId: item.messageId }, 'Mensagem de queda anterior excluída com sucesso no Telegram.');
            }
        }

        if (assetId) {
            this.activeDownAlerts.delete(assetId);
            try {
                await db.run(`DELETE FROM telegram_active_alerts WHERE asset_id = ?`, [String(assetId)]);
            } catch (e) {}
        }

        // 2. Enviar a mensagem oficial de normalização limpa
        const msg = [
            '✅ <b>NOC ALERTA | LINK RESTABELECIDO</b>',
            `📍 <b>Link / Unidade:</b> <code>${name}</code>`,
            `🌐 <b>IP / Host:</b> <code>${ip}</code>`,
            `⏱️ <b>Tempo Fora do Ar:</b> <code>${duration}</code>`,
            `🕒 <b>Horário do Retorno:</b> <code>${timeStr}</code>`,
            '',
            '━━━━━━ STATUS OPERACIONAL ━━━━━━',
            '🟢 <b>Estado Nominal:</b> Circuito reestabelecido e operando em 100% de estabilidade.',
            '',
            '<i>Camilo dos Santos NOC Engine</i>'
        ].join('\n');

        return this.broadcast(msg);
    }

    async notifySelfHealing({ assetId, assetName, actionId, failureReason, success, durationMs, output }) {
        const timeStr = formatTelegramTime(new Date());
        const safeName = htmlEscape(assetName || assetId);
        const safeAction = htmlEscape(actionId);
        const safeReason = htmlEscape(failureReason || 'Anomalia detectada por telemetria');
        const safeOutput = htmlEscape((output || '').slice(0, 500));
        const statusText = success ? 'SUCESSO NA AUTO-RECUPERAÇÃO' : 'FALHA NA AUTO-RECUPERAÇÃO';

        const msg = [
            '[NOC AIOPS | AUTO-REMEDIAÇÃO NÍVEL 3]',
            `<b>Ativo:</b> <code>${safeName}</code> (ID: <code>${htmlEscape(assetId)}</code>)`,
            `<b>Ação Executada:</b> <code>${safeAction}</code>`,
            `<b>Causa / Gatilho:</b> <code>${safeReason}</code>`,
            `<b>Status:</b> <b>${statusText}</b>`,
            `<b>Duração:</b> <code>${durationMs}ms</code>`,
            `<b>Horário:</b> <code>${timeStr}</code>`,
            '',
            '<b>Saída do Console:</b>',
            `<pre>${safeOutput}</pre>`,
            '',
            '<i>Governança: Regra V8 Ativa | Cooldown: 30 min | Autonomia Nível 3</i>'
        ].join('\n');

        return this.broadcast(msg);
    }
}

module.exports = new TelegramClient();
