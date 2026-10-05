-- Migração 003: Módulo de Compliance de Software (Shadow IT & Whitelist / Blacklist)
CREATE TABLE IF NOT EXISTS software_compliance_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pattern TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('ALLOWED', 'FORBIDDEN', 'REVIEW')),
    severity TEXT NOT NULL DEFAULT 'HIGH' CHECK(severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'INFO')),
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Regras padrão pré-configuradas (Baseline Corporativo Camilo dos Santos)
-- 1. PROIBIDOS / BLACKLIST
INSERT OR IGNORE INTO software_compliance_rules (id, name, pattern, category, status, severity, reason) VALUES
('rule-p2p-torrent', 'Clientes Torrent & P2P', 'torrent|utorrent|bittorrent|qbittorrent|deluge|vuze', 'P2P / Compartilhamento', 'FORBIDDEN', 'CRITICAL', 'Gargalo severo de banda e risco iminente de infecção por malware.'),
('rule-remote-anydesk', 'AnyDesk Remote Client', 'anydesk', 'Acesso Remoto Não Homologado', 'FORBIDDEN', 'CRITICAL', 'Vetor de invasão, shadow IT e vazamento de dados sem auditoria corporativa.'),
('rule-remote-teamviewer', 'TeamViewer Pessoal', 'teamviewer.*personal|teamviewer.*free', 'Acesso Remoto Não Homologado', 'FORBIDDEN', 'HIGH', 'Uso não homologado de ferramenta de suporte remoto.'),
('rule-games-platforms', 'Plataformas de Jogos', 'steam|epic\s*games|origin|riot\s*games|blizzard|battlenet|ubisoft', 'Jogos & Entretenimento', 'FORBIDDEN', 'HIGH', 'Desvio de finalidade corporativa e consumo desnecessário de disco/banda.'),
('rule-remote-hamachi', 'LogMeIn Hamachi & Radmin', 'hamachi|radmin', 'VPN / Rede Paralela', 'FORBIDDEN', 'CRITICAL', 'Criação de túneis não monitorados burlantes da segurança de borda.'),
('rule-browsers-unauth', 'Navegadores Não Homologados (Tor/Brave)', 'tor\s*browser|brave', 'Navegador Não Homologado', 'FORBIDDEN', 'HIGH', 'Risco de bypass de proxy e falta de políticas de segurança centralizadas.'),
('rule-system-modifiers', 'Otimizadores Agressivos & CCleaner', 'ccleaner|advanced\s*systemcare|iobit', 'Modificadores de Sistema', 'FORBIDDEN', 'MEDIUM', 'Corrupção de registro do Windows e integridade do endpoint.'),
('rule-mining-crypto', 'Mineradores de Criptomoeda', 'nicehash|xmrig|miner|ethminer', 'Malware & Mineração', 'FORBIDDEN', 'CRITICAL', 'Uso indevido de hardware corporativo e potencial malware.');

-- 2. HOMOLOGADOS / WHITELIST
INSERT OR IGNORE INTO software_compliance_rules (id, name, pattern, category, status, severity, reason) VALUES
('rule-sec-bitdefender', 'Bitdefender Endpoint Security', 'bitdefender|epredline|epintegration|epsecurity|epprotected', 'Segurança & Antivírus', 'ALLOWED', 'INFO', 'Antivírus corporativo oficial homologado.'),
('rule-sec-defender', 'Microsoft Defender Antivirus & Firewall', 'windefend|mpssvc|defender', 'Segurança & Antivírus', 'ALLOWED', 'INFO', 'Proteção nativa Windows 11.'),
('rule-mon-zabbix', 'Zabbix Agent 2', 'zabbix.*agent', 'Monitoramento & Telemetria', 'ALLOWED', 'INFO', 'Agente de monitoramento e telemetria oficial do NOC.'),
('rule-prod-office365', 'Microsoft 365 / Office Enterprise', 'microsoft\s*(office|365)|word|excel|powerpoint|outlook|clicktorun', 'Produtividade & Escritório', 'ALLOWED', 'INFO', 'Suíte de escritório padrão corporativo.'),
('rule-nav-chrome', 'Google Chrome Enterprise', 'google.*chrome|chrome', 'Navegador Web', 'ALLOWED', 'INFO', 'Navegador web padrão homologado.'),
('rule-nav-edge', 'Microsoft Edge Enterprise', 'msedge|microsoft.*edge', 'Navegador Web', 'ALLOWED', 'INFO', 'Navegador web nativo homologado.'),
('rule-prod-acrobat', 'Adobe Acrobat Reader DC', 'adobearm|acrobat.*reader|adobe.*reader', 'Produtividade', 'ALLOWED', 'INFO', 'Leitor de documentos PDF homologado.'),
('rule-erp-sankhya', 'ERP Sankhya', 'sankhya', 'ERP & Gestão', 'ALLOWED', 'INFO', 'Sistema de gestão empresarial core.'),
('rule-sup-milvus', 'Milvus Helpdesk Agent', 'milvus', 'Suporte & TI', 'ALLOWED', 'INFO', 'Plataforma oficial de chamados e suporte remoto.'),
('rule-sup-khelpdesk', 'KHelpDesk Corporate Agent', 'khelpdesk', 'Suporte & TI', 'ALLOWED', 'INFO', 'Agente de atendimento corporativo.'),
('rule-sup-rustdesk', 'RustDesk Corporate Client', 'rustdesk', 'Acesso Remoto Homologado', 'ALLOWED', 'INFO', 'Cliente de suporte remoto interno corporativo.'),
('rule-hw-dell', 'Dell SupportAssist & Management Tools', 'dell.*supportassist|delltechhub|dell.*digital|dellclientmanagement', 'Utilitários Dell', 'ALLOWED', 'INFO', 'Utilitários oficiais de firmware e hardware Dell.'),
('rule-util-7zip', '7-Zip / Compactadores Homologados', '7-zip|winrar', 'Utilitários de Sistema', 'ALLOWED', 'INFO', 'Compactador de arquivos seguro.'),
('rule-native-microsoft-windows', 'Componentes Nativos Microsoft & Windows', 'microsoft|windows|msedge|\.net\b|visual c\+\+|onedrive|teams|powershell|directx|clicktorun|sql\s*server|vs_coreeditorfonts', 'Sistema Operacional & Microsoft', 'ALLOWED', 'INFO', 'Componentes, runtimes e ferramentas oficiais Microsoft / Windows homologadas nativamente.'),
('rule-oem-drivers', 'Drivers & Utilitários de Fabricante (Dell, Lenovo, Intel, Realtek, AMD, NVIDIA, Atmel)', 'dell|lenovo|intel|realtek|amd\b|nvidia|synaptics|conexant|waves\s*maxxaudio|vulkan|expressconnect|supportassist|smart\s*connect|atmel', 'Drivers & Fabricante', 'ALLOWED', 'INFO', 'Drivers e utilitários de hardware homologados de fábrica.'),
('rule-printers-corporate', 'Drivers de Impressoras & Scanners Homologados', 'samsung.*(print|scan|driver|easy|m337x|scx)|epson.*(scan|print|updater|event|capture|ds-|manual)|brother|zebra|kyocera|document\s*capture|status\s*monitor|isis\s*driver|impressora\s*samsung|diagn.*impressora', 'Impressão & Periféricos', 'ALLOWED', 'INFO', 'Drivers oficiais do parque de impressoras e digitalizadores homologados.'),
('rule-corp-transport-ssw', 'Sistemas Operacionais & Logística (SSW, CT-e, Camilo, Etiquetas)', 'ssw|sswbar|sswscan|suporte\s*ti\s*camilo|trucks\s*control|new\s*enterprise|activebarcode|httptousbbridge|collector', 'Sistemas Corporativos Core', 'ALLOWED', 'INFO', 'Softwares operacionais e emissão de transporte/CT-e da empresa.'),
('rule-sec-banking-certs', 'Segurança Bancária & Certificados Digitais', 'warsaw|gas\s*tecnologia|bradesco|websigner|safesign|pjeoffice|starsign|web\s*signer', 'Segurança & Certificação', 'ALLOWED', 'INFO', 'Módulos de segurança bancária e assinatura digital homologados.'),
('rule-productivity-standard', 'Produtividade, PDF & Utilitários Homologados', 'adobe|foxit|thunderbird|vlc|dopdf|brazip|java|openssl|filezilla', 'Produtividade & Utilitários', 'ALLOWED', 'INFO', 'Aplicações de escritório e produtividade corporativa homologadas.'),
('rule-it-dev-tools', 'Ferramentas Técnicas de TI & Infraestrutura', 'sql\s*server\s*management|dax\s*studio|data\s*gateway|node\.js|python|git\b|github|postgresql|sqlite|advanced\s*ip\s*scanner|ubiquiti|iperius|go\s*programming|npcap|xampp|ghostscript|wkhtmltox', 'Ferramentas de TI', 'ALLOWED', 'INFO', 'Ferramentas autorizadas para suporte técnico e administração de TI.');
