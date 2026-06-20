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

## Como rodar

1. Inicie o PostgreSQL.
2. Inicie o ZooKeeper:

```powershell
.\infra\start-zookeeper.ps1
```

3. Prepare o backend:

```powershell
cd backend
npm install
npm run db:migrate
npm run db:seed
```

4. Suba quantos backends quiser, cada um em um terminal:

```powershell
npm run dev
```

O backend escolhe automaticamente uma porta livre a partir de `3001` e registra
o no no ZooKeeper.

5. Suba o frontend:

```powershell
cd frontend
npm install
npm run dev
```

O comando do frontend tambem inicia o gateway em `http://localhost:3000`, que
encaminha HTTP e WebSocket para os backends ativos.

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
