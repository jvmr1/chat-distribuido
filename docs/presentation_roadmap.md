# Roteiro de Apresentação: Chat Distribuído (Foco em Segurança)

Este guia serve como um roteiro passo a passo para a sua apresentação de amanhã. Ele está estruturado para alternar entre conceitos de arquitetura, referências aos diagramas e demonstrações práticas da interface, sempre destacando os mecanismos de segurança implementados.

---

## ⏱️ Resumo de Tempo Estimado (Sugestão de 15 Minutos)
1. **Introdução e Contextualização** (2 min)
2. **Arquitetura Geral e Distribuição** (4 min)
3. **Mergulho em Segurança** (4 min)
4. **Demonstração Prática da Interface** (5 min)

---

## 1. Introdução e Contextualização (2 minutos)
*   **O que é o projeto:** Um chat distribuído escalável, resiliente a falhas de nós e projetado com foco em segurança desde a base de desenvolvimento.
*   **Principais Tecnologias:**
    *   **Frontend:** React, TypeScript, Vite.
    *   **Backend:** Node.js, Express, WebSockets.
    *   **Persistência:** PostgreSQL (dados de negócio, usuários, sessões e histórico).
    *   **Coordenação:** Apache ZooKeeper (descoberta de serviços, presença e liderança).
    *   **Segurança:** TLS de ponta a ponta, Bcrypt, Cookies com atributos de segurança avançados e ACLs no ZooKeeper.

---

## 2. Arquitetura Geral e Distribuição (4 minutos)
*Apresente os conceitos usando os diagramas existentes em `docs/diagrams.md`:*

*   **Visão Geral (Diagrama: *Visao Geral*):**
    *   Explique o papel do **Gateway/Load Balancer** (porta `3000`) como ponto de entrada estável e seguro, que encaminha de forma transparente as requisições HTTP e WSS para os backends ativos.
    *   Mostre como os backends consultam o ZooKeeper para descobrir onde os usuários estão conectados antes de rotear eventos.
*   **Topologia de Znodes (Diagrama: *Arvore de Znodes*):**
    *   Explique o uso de **znodes efêmeros sequenciais** para registro de nós (`/chat/nodes/backend-XXX`).
    *   Explique os **znodes efêmeros de presença** (`/chat/presence/{userId}/{nodeId}`). Mostre que, se um servidor de backend cair ou o cliente desconectar, o ZooKeeper exclui o znode automaticamente, propagando o status offline para o resto do cluster.
*   **Eleição de Líder e Failover (Diagramas: *Registro de Backend...* e *Failover de Backend*):**
    *   Mostre que o menor znode sequencial assume a liderança do cluster para coordenar tarefas em segundo plano (como cleanup de sessões inativas no banco). Se o líder cai, o próximo nó na fila assume imediatamente.

---

## 3. Mergulho em Segurança - O Foco Central (4 minutos)
*Explique as camadas de defesa implementadas na aplicação:*

```
[Navegador] --- (HTTPS/WSS) ---> [Gateway/Load Balancer] --- (HTTPS/WSS) ---> [Backends]
                                                                                  |
                                 +------------------------------------------------+
                                 | (Bcrypt / SHA-256)             (Digest Auth + ACL)
                                 v                                v
                          [PostgreSQL]                      [ZooKeeper]
```

### A. Segurança na Transmissão (HTTPS & WSS)
*   **Criptografia em Trânsito:** Toda a comunicação entre o cliente, gateway e backends utiliza **TLS** (HTTPS para requisições REST e WSS para WebSockets).
*   **Geração Automatizada:** Os servidores geram certificados autoassinados em tempo de desenvolvimento nativamente (usando OpenSSL no Linux/macOS ou PowerShell no Windows), mitigando falhas silenciosas de inicialização segura.

### B. Proteção contra XSS e Roubo de Sessão (Cookies Seguros)
*   **Atributo HttpOnly:** O cookie de sessão (`sid`) possui a flag `HttpOnly` ativa, impedindo que scripts maliciosos injetados no navegador (XSS) consigam ler o token de sessão.
*   **Atributo Secure:** O cookie trafega exclusivamente sob conexões HTTPS/WSS.
*   **Atributo SameSite=Strict:** Mitiga ataques de CSRF (Cross-Site Request Forgery), impedindo que o cookie seja enviado em requisições vindas de outros domínios.

### C. Proteção de Dados Sensíveis (PostgreSQL)
*   **Bcrypt para Senhas:** As senhas dos usuários nunca são armazenadas em texto claro. É utilizado o algoritmo Bcrypt (com fator de custo adequado) para hashing de senhas.
*   **Hash de Sessões (SHA-256):** O token da sessão enviado ao cookie do usuário não é armazenado diretamente no banco. O banco armazena apenas o hash SHA-256 do token. Mesmo que ocorra um vazamento da base de dados, um atacante não conseguirá utilizar os registros do banco para falsificar sessões ativas.

### D. Segurança na Coordenação Distribuída (ZooKeeper Digest & ACL)
*   **Digest Authentication:** Os nós de backend conectam ao ZooKeeper utilizando autenticação com usuário e senha no formato `digest` (ex: `chat:senha_do_chat`).
*   **Access Control Lists (ACL):** Todos os znodes estruturais da aplicação criados em `/chat` recebem restrições de ACL específicas (`CREATOR_ALL_ACL`).
    *   *O que isso impede:* Impede que clientes não autorizados (outros processos ou atacantes que se conectem à porta pública do ZooKeeper) consigam ler, modificar, interceptar dados de presença ou registrar nós de backend falsos na árvore do chat.

---

## 4. Demonstração Prática (5 minutos)
*Execute a demonstração seguindo estes passos visuais:*

### Preparação do Ambiente:
1. Garanta que o PostgreSQL e o ZooKeeper estejam rodando.
2. Inicie dois backends (abra dois terminais na raiz e rode `npm run dev:backend` em cada um).
3. Inicie o frontend (`npm run dev:frontend` na raiz).

### Roteiro da Demo:
1.  **Acesso Seguro e Criação de Conta:**
    *   Abra o navegador em `https://localhost:5173`. Mostre o cadeado de HTTPS seguro no navegador.
    *   Cadastre um novo usuário (ex: `roberto`).
2.  **Inspeção de Segurança no Navegador (F12):**
    *   Abra o Console de Desenvolvedor (F12) e navegue até a aba **Application -> Cookies**.
    *   Mostre o cookie `sid` e aponte que as colunas **HttpOnly** e **Secure** estão marcadas com "True". Comente com a banca: *"Isso impede o roubo de sessão via Javascript"*
3.  **Presença Distribuída em Tempo Real (Duas Abas):**
    *   Abra uma aba anônima (ou outro navegador) em `https://localhost:5173` e faça login com `ana`.
    *   Coloque as duas janelas lado a lado.
    *   Mostre o indicador verde de **Online** atualizando instantaneamente.
    *   Mostre no terminal do backend a mensagem de criação do znode efêmero de presença.
4.  **Status do ZooKeeper e ACL na Interface:**
    *   Destaque o cabeçalho/painel da interface do chat onde exibe:
        *   **Status do ZooKeeper:** Conectado.
        *   **ACL ZooKeeper:** Ativa/Protegida (mostrando que a aplicação está usando autenticação digest para manter o coordenador seguro).
5.  **Simulação de Failover (Resiliência):**
    *   Com os usuários Ana e Roberto trocando mensagens, vá ao terminal do primeiro backend (porta `3001`) e derrube-o com `Ctrl+C`.
    *   **Observe a mágica:** A interface não cai, o gateway redireciona o tráfego de forma transparente para o segundo backend (porta `3002`) e o indicador de presença reflete a mudança automaticamente.
    *   Mostre no terminal do segundo backend a mensagem: *"This backend assumed cluster leadership"* (novo líder eleito automaticamente após a queda do primeiro).
