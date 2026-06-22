# Arquitetura do Sistema

## Objetivo

Construir um chat distribuido em que os dados persistentes nao dependam de um
unico no ativo e a interface continue usando uma URL estavel mesmo quando um
backend cai.

## Componentes

- **Frontend Web**: login, cadastro, lista de conversas, chat direto, grupos,
  presenca e recebimento em tempo real.
- **Gateway local**: ponto unico em `https://localhost:3000`, encaminhando HTTP
  e WebSocket para backends saudaveis.
- **Backend API**: autenticacao, usuarios, conversas, grupos, mensagens,
  WebSocket e integracao com ZooKeeper.
- **PostgreSQL**: fonte de verdade para usuarios, sessoes, conversas, grupos,
  mensagens, leituras e ultimo visto.
- **ZooKeeper**: descoberta de servicos, monitoramento de disponibilidade,
  presenca distribuida, ACL e coordenacao de lideranca.
- **db-setup**: container de inicializacao que executa migracoes e seed antes
  dos backends no Docker Compose.

## Responsabilidades do ZooKeeper

- Registrar instancias vivas do backend em `/chat/nodes`.
- Detectar falhas por znodes efemeros.
- Manter a lista de nos ativos para descoberta entre backends.
- Permitir eleicao simples de lider pelo menor znode ordenado.
- Registrar presenca distribuida de usuarios conectados em `/chat/presence`.
- Permitir que um backend descubra em qual outro backend um usuario esta
  conectado.
- Proteger os znodes do chat com digest auth e `CREATOR_ALL_ACL` quando ACL
  estiver habilitada.

## Regra principal

Mensagens, conversas, grupos, sessoes e leituras ficam no PostgreSQL. Os nos da
aplicacao podem cair sem perda de dados porque nao guardam o estado critico
localmente.

## Autorizacao de grupos

As permissoes de grupos sao regras de negocio da aplicacao. Elas ficam no
PostgreSQL, na tabela `conversation_members`, por meio do campo `role`:

- `owner`: administrador do grupo.
- `member`: participante comum.

O backend consulta esse papel antes de adicionar participantes, remover
participantes, promover membros, rebaixar administradores ou apagar grupos.
ACLs do ZooKeeper nao controlam permissoes de grupos; elas protegem apenas os
znodes tecnicos usados para coordenacao distribuida.

## Fluxo distribuido de mensagens

1. O navegador acessa o frontend em `https://localhost:5173`.
2. O frontend usa o gateway em `https://localhost:3000` para HTTP e WebSocket.
3. O gateway encaminha a conexao para um backend saudavel.
4. O backend registra seu proprio no em `/chat/nodes` usando znode efemero. No
   Docker Compose, os znodes usam `backend-1` e `backend-2`; no modo nativo sem
   `NODE_ID`, podem ser sequenciais.
5. Quando um usuario abre WebSocket, o backend registra presenca em
   `/chat/presence/{userId}/{nodeId}`.
6. Ao enviar mensagem, o backend grava no PostgreSQL.
7. O backend consulta o ZooKeeper para descobrir onde os destinatarios estao
   conectados.
8. Se o destinatario estiver no mesmo backend, a entrega e local.
9. Se o destinatario estiver em outro backend, o evento e enviado para
   `/internal/events` daquele no.
10. Se o destinatario estiver offline, a mensagem permanece no PostgreSQL e
    aparece quando ele acessar novamente.

## Eleicao de lider

Os backends observam `/chat/nodes`. O menor znode em ordem lexicografica e
considerado lider. Quando ele cai, o proximo no assume e registra isso no
terminal.

## Execucao padrao

O modo principal de execucao usa Docker Compose:

```bash
docker compose up --build
```

Esse comando sobe PostgreSQL, ZooKeeper, `db-setup`, dois backends e o frontend
com gateway HTTPS/WSS. O passo a passo de testes distribuidos fica em
[distribution-tests.md](distribution-tests.md).
