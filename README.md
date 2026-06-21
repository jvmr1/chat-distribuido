# Chat Distribuido

Sistema de chat web distribuido com Apache ZooKeeper para descoberta de nos,
presenca de usuarios, monitoramento de disponibilidade e coordenacao de lideranca.
As mensagens e sessoes ficam persistidas no PostgreSQL.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + TypeScript + Express
- Tempo real: WebSocket
- Banco: PostgreSQL
- Coordenacao distribuida: Apache ZooKeeper
- Gateway local de desenvolvimento: `infra/dev-load-balancer.js`

## Estrutura

- `backend/`: API, autenticacao, sessoes, WebSocket e integracao com ZooKeeper.
- `frontend/`: interface web do chat.
- `infra/`: ZooKeeper local, Docker Compose, scripts e gateway de desenvolvimento.
- `docs/`: explicacoes de arquitetura e organizacao do projeto.

Veja tambem [docs/project-structure.md](docs/project-structure.md).
Os requisitos atuais estao em [docs/requirements.md](docs/requirements.md).
Os diagramas da arquitetura estao em [docs/diagrams.md](docs/diagrams.md).

## Como rodar (Passo a Passo)

Siga os passos abaixo na ordem indicada para configurar e rodar o projeto no **Linux** ou no **Windows**.

---

### Passo 1: Inicializar a Infraestrutura (PostgreSQL e ZooKeeper)

Escolha **uma** das duas opções abaixo para rodar o banco de dados e o coordenador:

#### Opção A: Usando Docker (Recomendado / Mais Simples)
Se você possui o Docker instalado, basta rodar o comando abaixo na pasta raiz do projeto:
*   **Linux / macOS / Windows (Terminal)**:
    ```bash
    docker compose -f infra/docker-compose.yml up -d
    ```
*(Isso inicia o PostgreSQL pré-configurado com o usuário `chat`/banco `chatdb` e o ZooKeeper na porta `2181` de forma automática)*

#### Opção B: Instalação Manual (Sem Docker)
Caso prefira rodar os serviços instalados nativamente na sua máquina:

##### 1. Configurar o PostgreSQL
Acesse a linha de comando do PostgreSQL (`psql`):
*   **Linux**:
    ```bash
    sudo -u postgres psql
    ```
*   **Windows**:
    ```powershell
    psql -U postgres
    ```

Dentro do prompt do `psql`, crie o banco de dados. Escolha uma das alternativas de credenciais:
*   **Alternativa 1: Criar o usuário `chat` (Recomendado - Zero Config)**:
    Crie o usuário `chat` com senha `chat` e o banco `chatdb`:
    ```sql
    CREATE USER chat WITH PASSWORD 'chat';
    CREATE DATABASE chatdb OWNER chat;
    ```
    *(Nota: Se usar esta alternativa, você não precisará criar nem configurar nenhum arquivo `.env` no backend)*
*   **Alternativa 2: Usar o usuário padrão `postgres`**:
    Crie apenas o banco de dados:
    ```sql
    CREATE DATABASE chatdb;
    ```
    E depois crie o arquivo `.env` na pasta `backend` copiando o arquivo de exemplo:
    *   **Linux / macOS**: `cp backend/.env.example backend/.env`
    *   **Windows**: `copy backend\.env.example backend\.env`
    
    Abra o arquivo `backend/.env` criado e altere a variável `DATABASE_URL` colocando a sua senha do usuário `postgres` (ex: `DATABASE_URL=postgres://postgres:sua_senha_aqui@localhost:5432/chatdb`).

##### 2. Iniciar o ZooKeeper

O binário do ZooKeeper foi removido do repositório para deixar o download do projeto leve. 

1. Baixe o release binário do ZooKeeper (ex: `apache-zookeeper-3.9.5-bin.tar.gz` ou similar) em: [https://zookeeper.apache.org/releases.html](https://zookeeper.apache.org/releases.html)
   *(Atenção: certifique-se de baixar a versão com `-bin` no nome, pois ela já vem compilada)*.
2. Extraia o conteúdo do arquivo baixado.
3. Se você extrair o conteúdo diretamente dentro da pasta `infra/` com o nome de pasta `apache-zookeeper-3.9.5-bin` (de forma que exista o caminho `infra/apache-zookeeper-3.9.5-bin/bin/zkServer`), você poderá continuar usando os scripts de auxílio em um terminal separado a partir da pasta raiz:
   *   **Linux / macOS**:
       ```bash
       chmod +x ./infra/apache-zookeeper-3.9.5-bin/bin/*.sh
       ./infra/apache-zookeeper-3.9.5-bin/bin/zkServer.sh start-foreground
       ```
   *   **Windows**:
       ```powershell
       .\infra\start-zookeeper.ps1
       ```
4. Caso extraia em qualquer outra pasta de sua preferência:
   * Entre na pasta extraída e faça uma cópia do arquivo de configuração de exemplo `conf/zoo_sample.cfg` salvando-o como `conf/zoo.cfg`.
   * Inicie o servidor a partir da pasta onde o extraiu:
     * **Linux / macOS**:
       ```bash
       chmod +x bin/*.sh
       ./bin/zkServer.sh start-foreground
       ```
     * **Windows**:
       ```cmd
       bin\zkServer.cmd
       ```

---

### Passo 2: Preparar e Iniciar o Backend

Abra um novo terminal e navegue até a pasta `backend` para instalar as dependências, criar as tabelas, popular o banco e iniciar o servidor:

*   **Linux / macOS / Windows**:
    ```bash
    cd backend
    npm install
    npm run db:migrate
    npm run db:seed
    npm run dev
    ```

*(O backend escolherá automaticamente uma porta livre a partir da `3001` e se registrará no ZooKeeper. Mantenha este terminal rodando!)*

---

### Passo 3: Preparar e Iniciar o Frontend

Abra outro terminal e navegue até a pasta `frontend` para instalar as dependências e rodar o cliente web:

*   **Linux / macOS / Windows**:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

*(O frontend subirá o gateway em `http://localhost:3000`, que encaminha as requisições HTTP e conexões WebSocket para os backends ativos no momento)*

## Usuarios iniciais

- `ana` / `123456`
- `bruno` / `123456`
- `carla` / `123456`

## Funcionalidades

- Login, cadastro, validacao de credenciais, sessao persistida e logout.
- Conversas diretas, grupos, participantes e administrador do grupo.
- Historico persistido de mensagens e entrega offline.
- Mensagens em tempo real entre usuarios conectados em diferentes backends.
- Indicacao de online/offline baseada em presenca efemera no ZooKeeper.
- Contagem de mensagens nao lidas.
- Indicador visual do status do ZooKeeper.
- Descoberta de nos, eleicao de lider e remocao automatica de nos falhos.
