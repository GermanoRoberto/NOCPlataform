const iconv = require('iconv-lite');

/**
 * DIRETRIZ ARQUITETURAL DE CODIFICACAO DO CONSOLE WINDOWS (CP850 / UTF-8)
 *
 * Contexto Arquitetural:
 * O console do Windows em portugues utiliza a tabela de caracteres OEM Code Page 850 (CP850)
 * para comandos nativos do sistema operacional (como ipconfig, ping e tracert).
 * Quando o Node.js capturava os bytes da saida e decodificava como latin1 ou utf8 direto,
 * os caracteres acentuados do padrao CP850 (como ç e ã) eram interpretados de forma corrompida
 * (mojibake), gerando o caractere Æ (ex: ConfiguraÆo, LiberaÆo).
 *
 * Regra Obrigatoria e Travada:
 * Toda captura de stdout/stderr de processos de sistema no Windows DEVE ser acumulada
 * como Buffer bruto e decodificada estritamente com 'cp850' no Windows e 'utf8' em ambientes POSIX.
 */

const WINDOWS_CONSOLE_ENCODING = 'cp850';
const POSIX_CONSOLE_ENCODING = 'utf8';

/**
 * Decodifica buffers ou arrays de chunks capturados de processos nativos do sistema operacional.
 * Garante a integridade de acentuacoes da lingua portuguesa no Windows (CP850) e Linux (UTF-8).
 *
 * @param {Buffer|Array<Buffer>} input - Buffer único ou Array de chunks do stdout/stderr
 * @param {string} [platform] - Plataforma operacional (default: process.platform)
 * @returns {string} Texto decodificado com acentuacao preservada
 */
function decodeConsoleBuffer(input, platform = process.platform) {
    if (!input) return '';

    let buf;
    if (Array.isArray(input)) {
        buf = Buffer.concat(input);
    } else if (Buffer.isBuffer(input)) {
        buf = input;
    } else if (typeof input === 'string') {
        return input;
    } else {
        return String(input);
    }

    const isWin = platform === 'win32';
    const encoding = isWin ? WINDOWS_CONSOLE_ENCODING : POSIX_CONSOLE_ENCODING;

    try {
        if (isWin) {
            return iconv.decode(buf, encoding);
        }
        return buf.toString('utf8');
    } catch (e) {
        // Fallback defensivo caso ocorra erro inesperado no parser
        return buf.toString('utf8');
    }
}

module.exports = {
    WINDOWS_CONSOLE_ENCODING,
    POSIX_CONSOLE_ENCODING,
    decodeConsoleBuffer
};
