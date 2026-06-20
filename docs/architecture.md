# Arquitetura inicial

## Objetivo
Construir um chat distribuido em que os dados persistentes nao dependam de um unico nó ativo.

## Componentes
- **Frontend Web**: login, lista de conversas, chat direto, grupos e recebimento em tempo real.
- **Backend API**: autenticao, usuarios, conversas, grupos e mensagens.
- **WebSocket Gateway**: entrega de eventos em tempo real para clientes conectados.
- **PostgreSQL**: fonte de verdade para usuarios, sessoes, conversas, grupos e mensagens.
- **ZooKeeper**: descoberta de servicos, monitoramento de disponibilidade e coordenacao distribuida.

## Responsabilidades do ZooKeeper
- Registrar instancias vivas do backend.
- Detectar falhas por znode ephemeral.
- Ajudar em eleicao de lider e coordenacao de tarefas.
- Manter informacoes de coordencao, nao de negocio.
- Registrar presenca distribuida de usuarios conectados.
- Permitir que um backend descubra em qual outro backend um usuario esta conectado.
- Servir como base para roteamento interno de eventos entre nos.

## Regra principal
Mensagens, conversas e grupos ficam no banco. Nos da aplicacao podem cair sem perda de dados porque nao guardam o estado critico localmente.

## Fluxo distribuido de mensagens

1. O frontend conecta em um backend via HTTP/WebSocket.
2. O backend registra seu proprio no em `/chat/nodes` usando znode efemero sequencial.
3. Quando um usuario abre WebSocket, o backend registra a presenca em `/chat/presence/{userId}/{nodeId}`.
4. Ao enviar mensagem, o backend grava no PostgreSQL.
5. O backend consulta o ZooKeeper para descobrir onde os destinatarios estao conectados.
6. Se o destinatario estiver no mesmo backend, a entrega e local.
7. Se o destinatario estiver em outro backend, o evento e enviado para `/internal/events` daquele no.
8. Se o destinatario estiver offline, a mensagem permanece no PostgreSQL e aparece quando ele acessar novamente.

## Eleicao de lider

Os backends observam `/chat/nodes`. O menor znode sequencial e considerado lider. Quando ele cai, o proximo no assume e registra isso no terminal.
