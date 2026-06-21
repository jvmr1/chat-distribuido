# Diagramas da Arquitetura

Os diagramas abaixo usam Mermaid e podem ser visualizados em editores que
suportam Markdown com Mermaid, como GitHub, GitLab, Obsidian ou extensoes do
VS Code.

Para exportar imagens com nomes de arquivo previsiveis, use:

```powershell
.\docs\export-diagrams.ps1
```

O script gera arquivos em `docs/generated-diagrams`, seguindo a ordem e o nome
das secoes deste documento.

## Visao Geral

```mermaid
---
title: Visao Geral
---
flowchart LR
  subgraph Navegadores
    Ana[Ana no navegador]
    Bruno[Bruno no navegador]
  end

  subgraph Frontend
    Vite[Vite HTTPS\nlocalhost:5173]
    Gateway[Gateway local HTTPS/WSS\nlocalhost:3000]
  end

  subgraph ClusterBackend[Cluster de Backends]
    Setup[db-setup\nmigracao + seed]
    B1[backend-1\nHTTPS/WSS :3001]
    B2[backend-2\nHTTPS/WSS :3001]
  end

  ZK[(Apache ZooKeeper\nlocalhost:2181)]
  DB[(PostgreSQL\nusuarios, sessoes,\nconversas e mensagens)]

  Ana --> Vite
  Bruno --> Vite
  Vite --> Gateway
  Gateway --> B1
  Gateway --> B2

  Setup --> DB
  B1 <--> DB
  B2 <--> DB

  B1 <--> ZK
  B2 <--> ZK

  B1 -. eventos internos .-> B2
  B2 -. eventos internos .-> B1
```

## Arvore de Znodes

```mermaid
---
title: Arvore de Znodes
---
flowchart TD
  Root[/chat/]

  Root --> Nodes[/chat/nodes/]
  Nodes --> N1[backend-1\nEPHEMERAL\nurl=https://backend-1:3001]
  Nodes --> N2[backend-2\nEPHEMERAL\nurl=https://backend-2:3001]

  Root --> Presence[/chat/presence/]
  Presence --> AnaUser[/chat/presence/anaUserId/]
  Presence --> BrunoUser[/chat/presence/brunoUserId/]

  AnaUser --> AnaOnB1[backend-1\nEPHEMERAL\nAna conectada no backend-1]
  BrunoUser --> BrunoOnB2[backend-2\nEPHEMERAL\nBruno conectado no backend-2]

  Root --> Internal[/chat/internal/]

  classDef ephemeral fill:#eaf7f3,stroke:#2d9b73,color:#1c2836;
  class N1,N2,AnaOnB1,BrunoOnB2 ephemeral;
```

## Login e Sessao

```mermaid
---
title: Login e Sessao
---
sequenceDiagram
  participant U as Usuario
  participant FE as Frontend HTTPS
  participant GW as Gateway HTTPS
  participant BE as Backend
  participant DB as PostgreSQL

  U->>FE: informa usuario e senha
  FE->>GW: POST /auth/login
  GW->>BE: encaminha requisicao
  BE->>DB: busca usuario e hash da senha
  DB-->>BE: dados do usuario
  BE->>BE: bcrypt.compare(senha, hash)
  BE->>DB: cria sessao com hash do token
  BE-->>FE: Set-Cookie HTTP-only Secure
  FE-->>U: usuario autenticado
```

## Registro de Backend e Eleicao de Lider

```mermaid
---
title: Registro de Backend e Eleicao de Lider
---
sequenceDiagram
  participant B1 as Backend A
  participant B2 as Backend B
  participant ZK as ZooKeeper

  B1->>ZK: create /chat/nodes/backend-1 EPHEMERAL
  ZK-->>B1: /chat/nodes/backend-1
  B2->>ZK: create /chat/nodes/backend-2 EPHEMERAL
  ZK-->>B2: /chat/nodes/backend-2

  B1->>ZK: watch /chat/nodes
  B2->>ZK: watch /chat/nodes

  Note over B1,B2: Menor znode ordenado e o lider
  ZK-->>B1: lider = backend-1
  ZK-->>B2: lider = backend-1
```

## Presenca Online e Offline

```mermaid
---
title: Presenca Online e Offline
---
sequenceDiagram
  participant Ana as Ana
  participant B1 as Backend A
  participant ZK as ZooKeeper
  participant DB as PostgreSQL
  participant Outros as Outros usuarios

  Ana->>B1: abre WebSocket /ws
  B1->>DB: valida cookie de sessao
  B1->>ZK: create /chat/presence/anaId/backend-1 EPHEMERAL
  B1-->>Outros: presence.changed online=true

  Ana--xB1: fecha navegador ou logout
  B1->>ZK: remove /chat/presence/anaId/backend-1
  B1->>DB: atualiza users.last_seen_at
  B1-->>Outros: presence.changed online=false
```

## Envio de Mensagem Entre Backends Diferentes

```mermaid
---
title: Envio de Mensagem Entre Backends Diferentes
---
sequenceDiagram
  participant Ana as Ana
  participant B1 as Backend A
  participant DB as PostgreSQL
  participant ZK as ZooKeeper
  participant B2 as Backend B
  participant Bruno as Bruno

  Ana->>B1: POST /conversations/{id}/messages
  B1->>DB: INSERT messages
  B1->>DB: marca conversa como lida para Ana
  B1->>ZK: consulta /chat/presence/brunoId
  ZK-->>B1: Bruno esta no Backend B
  B1->>B2: POST /internal/events
  B2-->>Bruno: WebSocket message.created
  B1-->>Ana: resposta HTTP 201
```

## Entrega Offline

```mermaid
---
title: Entrega Offline
---
sequenceDiagram
  participant Ana as Ana
  participant B1 as Backend A
  participant DB as PostgreSQL
  participant ZK as ZooKeeper
  participant Bruno as Bruno

  Ana->>B1: envia mensagem para Bruno
  B1->>DB: grava mensagem
  B1->>ZK: consulta /chat/presence/brunoId
  ZK-->>B1: nenhum znode de presenca
  Note over B1,DB: Nao ha entrega em tempo real, mas a mensagem fica persistida

  Bruno->>B1: login depois
  Bruno->>B1: GET /conversations/{id}/messages
  B1->>DB: busca historico persistido
  B1-->>Bruno: entrega mensagens acumuladas
```

## Failover de Backend

```mermaid
---
title: Failover de Backend
---
sequenceDiagram
  participant FE as Frontend
  participant GW as Gateway
  participant B1 as Backend A
  participant B2 as Backend B
  participant ZK as ZooKeeper

  FE->>GW: requisicoes HTTP/WSS
  GW->>B1: encaminha para backend saudavel
  B1->>ZK: znode efemero /chat/nodes/backend-1

  B1--xGW: Backend A cai
  ZK-->>ZK: remove znode efemero de B1
  GW->>GW: health check detecta falha
  GW->>B2: proximas requisicoes vao para Backend B
  B2->>ZK: observa /chat/nodes e recalcula lider
  FE-->>GW: usuario continua usando a mesma URL
```

## Visao de Dados por Usuario

```mermaid
---
title: Visao de Dados por Usuario
---
flowchart TD
  C[Conversa direta Ana-Bruno]
  M[(messages\nhistorico global)]
  CM_A[conversation_members Ana\ncleared_at / hidden_at]
  CM_B[conversation_members Bruno\ncleared_at / hidden_at]

  C --> M
  C --> CM_A
  C --> CM_B

  CM_A --> ViewA[Ana ve mensagens\nposteriores ao cleared_at dela]
  CM_B --> ViewB[Bruno ve mensagens\nposteriores ao cleared_at dele]

  CM_A --> HideA[hidden_at de Ana\nremove conversa da lista dela]
  CM_B --> HideB[hidden_at de Bruno\nremove conversa da lista dele]

  M --> Persist[Mensagens continuam no banco\ne nao sao apagadas para o outro usuario]
```

## Seguranca

```mermaid
---
title: Seguranca
---
flowchart LR
  Browser[Navegador]
  FE[Frontend HTTPS]
  GW[Gateway HTTPS/WSS]
  BE[Backend HTTPS/WSS]
  ZK[ZooKeeper com digest auth + ACL]
  DB[(PostgreSQL)]

  Browser -->|HTTPS| FE
  FE -->|HTTPS/WSS + cookie Secure HTTP-only| GW
  GW -->|HTTPS/WSS interno| BE
  BE -->|usuario/senha, bcrypt, sessao hash| DB
  BE -->|digest auth| ZK
  ZK -->|CREATOR_ALL_ACL em /chat| BE
```
