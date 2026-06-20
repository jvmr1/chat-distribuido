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

## `frontend/`

Interface React acessada pelo navegador.

- `src/main.tsx`: tela de login/cadastro, sidebar, chat, grupos e eventos em tempo real.
- `src/api.ts`: cliente HTTP com fallback para outra URL quando um backend falha.
- `src/styles.css`: estilos da interface.
- `dev.cjs`: sobe o Vite e o gateway local com um unico comando.

## `infra/`

Arquivos de infraestrutura para desenvolvimento e demonstracao distribuida.

- `apache-zookeeper-3.9.5-bin/`: distribuicao local do ZooKeeper usada no Windows.
- `start-zookeeper.ps1`: script para iniciar o ZooKeeper local.
- `dev-load-balancer.js`: gateway HTTP/WebSocket que encaminha para backends ativos.
- `docker-compose.yml`: opcao para subir dependencias por Docker.
- `README.md`: comandos e testes de disponibilidade.

## `docs/`

Documentacao de arquitetura, requisitos e organizacao.

## Arquivos removidos

- `backend/dist/` e `frontend/dist/`: builds gerados automaticamente.
- `chat python/`: prototipo antigo usado apenas como referencia; a versao atual esta no backend TypeScript.
