# Organizacao do Projeto

Este documento resume o papel de cada pasta depois da limpeza do projeto.

## `backend/`

Backend Node.js responsavel por autenticacao, persistencia, WebSocket e
coordenacao distribuida.

- `src/server.ts`: inicia o servidor HTTP, escolhe porta livre e registra o no no ZooKeeper.
- `src/app.ts`: monta rotas HTTP, health check, status do sistema e canal interno entre backends.
- `src/config.ts`: centraliza variaveis de ambiente e argumentos de linha de comando.
- `src/auth/`: criacao, validacao e revogacao de sessoes.
- `src/db/`: conexao PostgreSQL, schema, migracao e seed.
- `src/routes/`: rotas de autenticacao, usuarios e conversas.
- `src/realtime/`: WebSocket e distribuicao de eventos entre backends.
- `src/zookeeper/`: registro de nos, lideranca, descoberta e presenca de usuarios.
- `Dockerfile`: imagem do backend para Docker Compose; compila TypeScript e roda `dist/server.js`.
- `docker-entrypoint.cjs`: espera PostgreSQL/ZooKeeper, gera certificado local quando necessario, executa `db-setup` ou inicia o backend.
- `scripts/copy-db-assets.cjs`: copia `schema.sql` para `dist` durante o build compilado.

## `frontend/`

Interface React acessada pelo navegador.

- `src/main.tsx`: tela de login/cadastro, sidebar, chat, grupos e eventos em tempo real.
- `src/api.ts`: cliente HTTP com fallback para outra URL quando um backend falha.
- `src/styles.css`: estilos da interface.
- `dev.cjs`: sobe o Vite e o gateway local com um unico comando.
- `Dockerfile`: imagem do frontend/gateway para Docker Compose.

## `infra/`

Arquivos de infraestrutura para desenvolvimento e demonstracao distribuida.

- `apache-zookeeper-3.9.5-bin/`: distribuicao local opcional do ZooKeeper usada no Windows quando se opta por execucao nativa; nao e versionada no Git.
- `start-zookeeper.ps1`: script para iniciar o ZooKeeper local.
- `dev-load-balancer.js`: gateway HTTP/WebSocket que encaminha para backends ativos.
- `docker-compose.yml`: compose legado para subir apenas dependencias por Docker; o modo principal usa `docker-compose.yml` da raiz.
- `README.md`: comandos e testes de disponibilidade.

## `docs/`

- `architecture.md`: visao da arquitetura atual.
- `requirements.md`: requisitos atuais do sistema.
- `diagrams.md`: diagramas Mermaid da arquitetura.
- `distribution-tests.md`: passo a passo para testar distribuicao, failover, presenca e persistencia.
- `project-structure.md`: este arquivo.

## Arquivos removidos

- `backend/dist/` e `frontend/dist/`: builds gerados automaticamente.
- `chat python/`: prototipo antigo usado apenas como referencia; a versao atual esta no backend TypeScript.
