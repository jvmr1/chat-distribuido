# Testes de Distribuicao

Este roteiro demonstra os pontos centrais de sistemas distribuidos usados no
projeto: descoberta de nos, failover, presenca por znodes efemeros,
persistencia, entrega offline e coordenacao por ZooKeeper.

## 1. Subir o sistema

Na raiz do projeto:

```bash
docker compose up --build
```

Acesse:

```text
https://localhost:5173
```

Usuarios iniciais:

- `ana` / `123456`
- `bruno` / `123456`
- `carla` / `123456`

Se o navegador reclamar do certificado local, aceite a excecao de seguranca
para desenvolvimento local ou gere um certificado confiavel com `mkcert`.

## 2. Verificar os containers

Em outro terminal:

```bash
docker compose ps
```

Devem aparecer, pelo menos:

- `postgres`
- `zookeeper`
- `backend-1`
- `backend-2`
- `frontend`

O container `db-setup` deve aparecer como finalizado com sucesso, pois ele roda
migracoes e seed uma unica vez antes dos backends.

## 3. Verificar descoberta de nos no ZooKeeper

```bash
docker compose exec zookeeper zookeeper-shell localhost:2181
```

Dentro do shell:

```text
addauth digest chat:dev-secret
ls /chat/nodes
```

Resultado esperado:

```text
[backend-1, backend-2]
```

Esses znodes sao efemeros: se um backend cair, o znode correspondente deve
sumir automaticamente depois que a sessao do ZooKeeper for encerrada.

## 4. Verificar presenca distribuida

1. Abra dois navegadores, ou um navegador normal e uma janela anonima.
2. Entre como `ana` em um.
3. Entre como `bruno` no outro.
4. Rode:

```bash
docker compose exec zookeeper zookeeper-shell localhost:2181
```

Dentro do shell:

```text
addauth digest chat:dev-secret
ls /chat/presence
```

Devem aparecer ids de usuarios. Para inspecionar um usuario especifico, use:

```text
ls /chat/presence/<id-do-usuario>
```

O filho dentro de `/chat/presence/<id>` indica em qual backend aquele usuario
esta conectado.

## 5. Testar entrega em tempo real

1. Com `ana` e `bruno` logados, inicie uma conversa direta.
2. Envie uma mensagem de Ana para Bruno.
3. Verifique se Bruno recebe sem atualizar a pagina.

Esse teste valida:

- persistencia da mensagem no PostgreSQL;
- consulta de presenca no ZooKeeper;
- entrega via WebSocket;
- roteamento interno entre backends quando os usuarios estiverem em nos
  diferentes.

## 6. Testar failover de backend

Com o chat aberto e funcionando:

```bash
docker compose stop backend-1
```

Observe os znodes:

```bash
docker compose exec zookeeper zookeeper-shell localhost:2181
```

Dentro do shell:

```text
addauth digest chat:dev-secret
ls /chat/nodes
```

Resultado esperado:

```text
[backend-2]
```

Continue usando a interface em `https://localhost:5173`. O gateway deve
encaminhar novas requisicoes para `backend-2` sem troca manual de URL.

Suba o backend novamente:

```bash
docker compose start backend-1
```

Confira:

```text
ls /chat/nodes
```

Resultado esperado:

```text
[backend-1, backend-2]
```

## 7. Testar persistencia apos queda de backend

1. Envie mensagens com os dois backends ativos.
2. Pare `backend-1`.
3. Continue enviando mensagens.
4. Suba `backend-1` novamente.
5. Atualize a pagina.

Resultado esperado: o historico continua disponivel, porque mensagens e
conversas estao no PostgreSQL, nao na memoria local dos backends.

## 8. Testar entrega offline

1. Entre como `ana`.
2. Garanta que `bruno` esta deslogado ou com a janela fechada.
3. Ana envia uma mensagem para Bruno.
4. Entre como Bruno.

Resultado esperado: Bruno visualiza a mensagem enviada enquanto estava offline.

## 9. Testar ultimo visto e presenca

1. Entre como Ana e Bruno.
2. Verifique que cada um aparece online para o outro.
3. Feche a janela de Bruno ou faca logout.
4. Observe na lista de conversas de Ana.

Resultado esperado: Bruno deixa de aparecer online e passa a mostrar ultimo
visto quando essa informacao existir.

## 10. Testar ACL do ZooKeeper

O Compose sobe os backends com:

```env
ZOOKEEPER_AUTH=chat:dev-secret
ZOOKEEPER_ACL_ENABLED=true
```

Para verificar os znodes com cliente autenticado:

```bash
docker compose exec zookeeper zookeeper-shell localhost:2181
```

Dentro do shell:

```text
addauth digest chat:dev-secret
ls /chat/nodes
ls /chat/presence
```

## 11. Logs uteis

Logs do gateway/frontend:

```bash
docker compose logs -f frontend
```

Logs dos backends:

```bash
docker compose logs -f backend-1 backend-2
```

Logs do ZooKeeper:

```bash
docker compose logs -f zookeeper
```

Logs da preparacao do banco:

```bash
docker compose logs db-setup
```

## 12. Limpar ambiente

Parar containers sem apagar dados:

```bash
docker compose down
```

Parar containers e apagar o volume do PostgreSQL:

```bash
docker compose down -v
```
