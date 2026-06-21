# Chat Distribuido

Sistema de chat web distribuido com Apache ZooKeeper para descoberta de nos,
presenca de usuarios, monitoramento de disponibilidade e coordenacao de
lideranca. As mensagens e sessoes ficam persistidas no PostgreSQL.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + TypeScript + Express
- Tempo real: WebSocket
- Banco: PostgreSQL
- Coordenacao distribuida: Apache ZooKeeper
- Orquestracao local: Docker Compose

## Como Rodar

O caminho recomendado e igual em Windows, Linux e macOS.

### 1. Instale os requisitos

- Docker Desktop, no Windows/macOS, ou Docker Engine + Docker Compose no Linux.
- Git.

### 2. Clone o projeto

```bash
git clone <url-do-repositorio>
cd chat-distribuido
```

### 3. Suba o sistema

```bash
docker compose up --build
```

Nota para Linux: caso receba erro de permissao no `docker.sock`, execute com
`sudo docker compose up --build`.

Nota sobre portas em uso: se o comando falhar dizendo que a porta `5432` ou
`2181` ja esta em uso, pare os servicos locais de PostgreSQL ou ZooKeeper antes
de subir o Compose.

Esse comando sobe:

- PostgreSQL em `localhost:5432`
- ZooKeeper em `localhost:2181`
- Preparacao unica do banco no container `db-setup`
- Backend 1 no container `backend-1`
- Backend 2 no container `backend-2`
- Gateway em `https://localhost:3000`
- Frontend em `https://localhost:5173`

O container `db-setup` executa automaticamente:

- migracao do banco;
- seed dos usuarios iniciais.

O Compose tambem mantém volumes para PostgreSQL e ZooKeeper. Isso evita perda
de dados do banco e reduz problemas de reconexao do ZooKeeper apos reinicios.

Cada backend executa automaticamente:

- registro dos nos no ZooKeeper;
- configuracao HTTPS/WSS usando os certificados em `infra/certs`.

### 4. Acesse

Abra no navegador:

```text
https://localhost:5173
```

Se o navegador avisar que o certificado local nao e confiavel, gere um
certificado confiavel com `mkcert` antes de subir os containers, ou aceite a
excecao de seguranca apenas para desenvolvimento local.

Usuarios iniciais:

- `alice` / `123456`
- `bob` / `123456`

## Comandos Uteis

Parar os containers:

```bash
docker compose down
```

Parar e apagar os dados do PostgreSQL:

```bash
docker compose down -v
```

Ver logs de um servico:

```bash
docker compose logs -f backend-1
docker compose logs -f zookeeper
```

Recriar depois de alterar codigo:

```bash
docker compose up --build
```

## Testes de Distribuicao

O passo a passo completo fica em
[docs/distribution-tests.md](docs/distribution-tests.md).

Teste rapido: com o sistema rodando, derrube um backend:

```bash
docker compose stop backend-1
```

Continue usando o chat no navegador. O gateway deve encaminhar as chamadas para
`backend-2`.

Suba o backend novamente:

```bash
docker compose start backend-1
```

Para ver os nos registrados no ZooKeeper, abra o shell:

```bash
docker compose exec zookeeper zookeeper-shell localhost:2181
```

Dentro dele, autentique e consulte:

```text
addauth digest chat:dev-secret
ls /chat/nodes
ls /chat/presence
```

Outros testes documentados incluem entrega offline, persistencia apos queda de
backend, presenca online/offline, ultimo visto e ACL do ZooKeeper.

## Execucao Nativa Opcional

O modo nativo ainda existe para desenvolvimento fino, mas nao e o caminho
principal. Veja [infra/README.md](infra/README.md).

## Estrutura

- `backend/`: API, autenticacao, sessoes, WebSocket e integracao com ZooKeeper.
- `frontend/`: interface web do chat.
- `infra/`: scripts auxiliares, gateway local e Compose legado de infraestrutura.
- `docs/`: requisitos, diagramas e explicacoes de arquitetura.

Veja tambem:

- [docs/project-structure.md](docs/project-structure.md)
- [docs/requirements.md](docs/requirements.md)
- [docs/diagrams.md](docs/diagrams.md)
- [docs/distribution-tests.md](docs/distribution-tests.md)

## Funcionalidades

- Login, cadastro, validacao de credenciais, sessao persistida e logout.
- Conversas diretas, grupos, participantes e administrador do grupo.
- Historico persistido de mensagens e entrega offline.
- Mensagens em tempo real entre usuarios conectados em diferentes backends.
- Indicacao de online/offline baseada em presenca efemera no ZooKeeper.
- Limpeza/remocao individual de conversas sem afetar outros usuarios.
- Contagem de mensagens nao lidas.
- Tema claro/escuro.
- Indicador visual do status do ZooKeeper.
- Descoberta de nos, eleicao de lider e remocao automatica de nos falhos.
