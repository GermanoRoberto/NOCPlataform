# Manual do Zabbix NOC: Guia de Configuração e Auditoria de Infraestrutura

Este manual foi criado especialmente para o **NOC Platform**, servindo como um guia prático do zero sobre como utilizar, configurar e otimizar o monitoramento dos seus ativos.

Além de explicar a teoria e prática do Zabbix, efetuamos uma **auditoria em tempo real** nos hosts atualmente cadastrados na sua API do Zabbix para identificar gargalos e oportunidades imediatas de melhoria.

---

## 🔍 Parte 1: Auditoria em Tempo Real da Infraestrutura (Zabbix)

Após realizar uma varredura profunda diretamente na API do seu Zabbix, identificamos exatamente a estrutura atual dos seus ativos. Abaixo está o raio-x do seu ambiente de monitoramento:

### 1. Diagnóstico dos Gateways & Links WAN
* **Hosts Identificados:** 
  * `GATEWAY - BHZ - Century` (IP: `187.1.181.180`)
  * `GATEWAY - RIO - AMERICANET - VERO` (IP: `187.108.47.145`)
  * `GATEWAY - SPO - AMERICANET VERO` (IP: `189.8.89.9`)
  * `FBR - GIGALINK` (IP: `189.84.241.2`)
  * `JDF - AMERICAN TOWER` (IP: `186.248.190.34`)
  * Outros gateways BHZ, RIO, SPO.
* **O Diagnóstico:** Todos estes hosts estão associados **exclusivamente à template `ICMP Ping`** e possuem apenas **3 itens cadastrados**. 
* **O que isso significa?** A template `ICMP Ping` apenas faz testes de rede básicos (Ping, Perda de pacotes e Latência). **Ela não possui capacidade para monitorar tráfego de interface, upload ou download**. É por isso que no painel estes campos aparecem como `Offline` ou `N/D`.

### 2. Diagnóstico dos Servidores Sankhya (Produção e Teste)
* **Hosts Identificados:** 
  * `SANKHYA - PRODUCAO` (IP/DNS: `noc.nuvemdatacom.com.br`)
  * `SANKHYA - TESTE` (IP/DNS: `noc.nuvemdatacom.com.br`)
* **O Diagnóstico:** Ambos possuem **`Nenhuma template associada`** e apenas **1 item ativo** cada um.
* **O que isso significa?** Estes servidores cruciais não estão sendo monitorados! Não há coleta de CPU, Memória, integridade de disco ou conexões ativas. Eles apenas possuem um item manual rudimentar.

### 3. Diagnóstico das Impressoras
* **Hosts Identificados:** Diversas impressoras em filiais (BHZ, SPO, RIO, VGA, VIX, FBR, CPQ, PPY, PTR).
* **O Diagnóstico:** Estão muito bem configuradas! Elas estão associadas a templates SNMP de fabricantes específicos como **`SAMSUNG - M4080`**, **`SAMSUNG - M4070`**, **`SAMSUNG - M5370`** e **`Printer Toner CMYK SNMP`**. Possuem entre 16 e 28 itens ativos monitorando suprimentos de toner, coletores de resíduos e contadores de páginas físicos.

---

## 🛠️ Parte 2: O que podemos fazer para Melhorar? (Recomendações Práticas)

Com base na auditoria acima, aqui estão as ações recomendadas que você pode fazer hoje no Zabbix para habilitar todas as métricas do painel do NOC:

### Ação 1: Habilitar Medição de Tráfego nos Gateways / Roteadores
Para os gateways de filiais (ex: `GATEWAY - SPO - AMERICANET VERO`), em vez de usar apenas a template `ICMP Ping`, adicione também a template de monitoramento SNMP de interfaces de rede.
* **Template recomendada:** `Network Generic Device by SNMP` (para switches/roteadores genéricos) ou `Draytek SNMPv2` (específico para seus roteadores DrayTek). Ambos já existem no seu Zabbix!
* **Resultado:** O Zabbix começará a ler o tráfego em Mbps das portas físicas (WAN) do seu roteador/switch, ativando imediatamente os gráficos de tráfego, download e upload no painel do NOC.

### Ação 2: Monitorar a Saúde dos Servidores Sankhya
Visto que os servidores do ERP Sankhya estão em nuvem, você deve monitorá-los de verdade para prever lentidões ou travamentos no banco de dados.
* **Templates recomendadas:** `Linux by Zabbix agent` ou `Windows by Zabbix agent` (dependendo do Sistema Operacional).
* **Resultado:** O painel do NOC exibirá o score de saúde do Sankhya em tempo real e o SRE conseguirá prever e alertar se a CPU do servidor de produção passar de 90%.

---

## 📚 Parte 3: Manual do Zabbix do Zero (Guia Rápido)

O Zabbix é um sistema baseado em 5 conceitos fundamentais. Entendendo estes 5 termos, você domina qualquer monitoramento:

```
┌────────────────────────────────────────────────────────┐
│                      CONCEITOS                         │
├─────────────┬──────────────────────────────────────────┤
│ HOST        │ O dispositivo físico ou virtual (IP).    │
├─────────────┼──────────────────────────────────────────┤
│ ITEM        │ A métrica bruta que é coletada (ex: CPU) │
├─────────────┼──────────────────────────────────────────┤
│ TRIGGER     │ A regra de alerta (ex: CPU > 90%).       │
├─────────────┼──────────────────────────────────────────┤
│ TEMPLATE    │ Grupo de Itens + Triggers para reuso.    │
├─────────────┼──────────────────────────────────────────┤
│ INTERFACE   │ O meio de coleta (Agent, SNMP, ICMP).    │
└─────────────┴──────────────────────────────────────────┘
```

### 📋 Guia Passo a Passo: Configurando um Novo Dispositivo SNMP

Aqui está o roteiro de cliques para você cadastrar uma nova impressora ou roteador no Zabbix de forma profissional:

#### 1. Criar o Host
1. Acesse o Zabbix no navegador.
2. Vá no menu lateral esquerdo: **Configuration (Configuração)** ➔ **Hosts**.
3. No canto superior direito, clique em **Create host (Criar host)**.
4. Preencha os campos essenciais:
   - **Host name:** Nome de identificação interna (ex: `BHZ - Roteador Vivo`).
   - **Templates:** Selecione o modelo adequado (ex: `Generic by SNMP`).
   - **Groups:** Escolha um grupo organizador (ex: `Templates/Network` ou crie `NOC Links`).

#### 2. Configurar a Interface de Rede
1. No mesmo formulário do Host, procure pelo campo **Interfaces**.
2. Clique em **Add (Adicionar)** e selecione **SNMP**.
3. Preencha o IP do dispositivo (ex: `189.43.232.210`).
4. Mantenha a porta padrão do SNMP: **`161`**.
5. No campo **SNMP version**, selecione **SNMPv2**.
6. No campo **SNMP community**, digite a credencial de segurança (geralmente a padrão é **`public`** ou digite a macro `{$SNMP_COMMUNITY}`).

#### 3. Salvar
1. Clique no botão azul **Add (Adicionar)** no final da página.

---

### 🛡️ Boas Práticas Operacionais de NOC

* **Uso de Macros:** Nunca insira credenciais, tokens ou senhas diretamente nos itens do host. Utilize a aba **Macros** no Zabbix e defina variáveis como `{$SNMP_COMMUNITY}` ou `{$ZABBIX_TOKEN}`. Isso facilita a alteração em massa caso a segurança da empresa mude.
* **Intervalos de Coleta (Update Interval):** Para métricas vitais como ping e tráfego WAN, configure o intervalo de atualização para **`30s`** ou **`60s`**. Para suprimentos de impressora (como toner), configure intervalos maiores de **`1h`** ou **`2h`** para não sobrecarregar a rede sem necessidade.
* **Nomes Padronizados:** Mantenha a nomenclatura uniforme. Se usar `BHZ - Roteador`, use `RIO - Roteador` e `SPO - Roteador`. O painel do NOC usa correspondência de nomes para ocultar ou criar aliases dinamicamente!
