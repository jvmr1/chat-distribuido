# Infraestrutura local

O modo recomendado para rodar o projeto esta no [README principal](../README.md)
e usa `docker compose up --build`. Este arquivo fica como referencia para quem
quiser rodar partes da infraestrutura manualmente.

## ZooKeeper no Windows

O script procura o ZooKeeper nesta ordem:

1. Variavel `ZOOKEEPER_HOME`.
2. Alguma pasta `infra\apache-zookeeper-*-bin` que contenha `bin\zkServer.cmd`.
3. `zkServer.cmd` disponivel no `PATH`.
4. Docker Compose, usando o servico `zookeeper` de `infra\docker-compose.yml`.

A distribuicao completa do ZooKeeper nao e versionada no Git. Se quiser rodar
sem Docker, baixe o Apache ZooKeeper e coloque a pasta em:

```powershell
infra\apache-zookeeper-3.9.5-bin
```

Ou configure:

```powershell
$env:ZOOKEEPER_HOME="C:\apache-zookeeper-3.9.5-bin"
```

Para iniciar:

```powershell
.\infra\start-zookeeper.ps1
```

Mantenha esse terminal aberto enquanto usa o chat.

Se o PowerShell bloquear scripts locais, rode uma vez:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\infra\start-zookeeper.ps1
```

Para rodar com a distribuicao local, o ZooKeeper precisa de Java instalado e
disponivel no `PATH` ou em `JAVA_HOME`. Para rodar via Docker, o Docker precisa
estar instalado e em execucao.

Para testar pelo cliente do ZooKeeper, abra outro terminal:

```powershell
cd infra\apache-zookeeper-3.9.5-bin
.\bin\zkCli.cmd -server localhost:2181
```

Dentro do cliente:

```text
ls /chat/nodes
```

Com o backend rodando, devem aparecer os znodes efemeros sequenciais dos backends, por exemplo:

```text
[backend-0000000000, backend-0000000001]
```

## Ordem recomendada para rodar

Terminal 1:

```powershell
.\infra\start-zookeeper.ps1
```

Terminal 2:

```powershell
cd backend
npm run db:migrate
npm run dev
```

Terminal 3:

```powershell
cd frontend
npm run dev
```

Ao rodar `npm run dev` no backend, ele tenta a porta 3001. Se ela ja estiver ocupada, tenta 3002, 3003, e assim por diante ate 3020.

Ao rodar `npm run dev` no frontend, ele sobe automaticamente:

- gateway local em `https://localhost:3000`
- Vite em `https://localhost:5173`

O navegador fala com o gateway, e o gateway encaminha para qualquer backend vivo entre 3001 e 3020.

## Load balancer local para testar disponibilidade

O load balancer ja sobe automaticamente com `cd frontend; npm run dev`. Se quiser rodar manualmente, use:

Terminal 1:

```powershell
cd backend
npm run dev
```

Terminal 2:

```powershell
cd backend
npm run dev
```

Terminal 3:

```powershell
node .\infra\dev-load-balancer.js --port 3000
```

Terminal 4:

```powershell
cd frontend
npm run dev
```

Agora o navegador fala com `localhost:3000`, e o balanceador encaminha para os backends disponiveis.

## Failover direto no frontend

Tambem da para testar de forma parecida com o prototipo Python: o frontend recebe uma lista de backends e tenta o proximo se o atual cair.

Terminal 1:

```powershell
cd backend
npm run dev -- --port 3001
```

Terminal 2:

```powershell
cd backend
npm run dev -- --port 3002
```

Terminal 3:

```powershell
cd frontend
npm run dev
```

Nesse modo, se o backend 3001 cair, o frontend tenta usar o 3002 nas proximas chamadas e na reconexao do WebSocket.

O modo padrao recomendado usa o gateway local. Se quiser testar o failover direto do frontend, sem gateway, configure uma lista manual:

```powershell
cd frontend
$env:VITE_API_URLS="http://localhost:3001,http://localhost:3002"
npm run dev:vite
```

## Teste de roteamento distribuido entre backends

1. Rode dois backends com `cd backend; npm run dev`.
2. Rode o frontend com `cd frontend; npm run dev`.
3. Abra dois navegadores diferentes ou uma janela normal e uma anonima.
4. Entre com usuarios diferentes.
5. Verifique no ZooKeeper:

```text
ls /chat/nodes
ls /chat/presence
```

6. Envie uma mensagem entre usuarios.

Mesmo que os usuarios estejam conectados em backends diferentes, o backend que recebeu a mensagem consulta `/chat/presence` e encaminha o evento para o no correto por `/internal/events`.

O backend espera o ZooKeeper em:

```env
ZOOKEEPER_HOST=localhost:2181
```

Esse valor ja esta previsto no `backend\.env.example`.

## TLS para HTTP e WebSocket

Por padrao, `npm run dev` ja habilita TLS em desenvolvimento. Se o certificado
local ainda nao existir, ele e gerado automaticamente pelo helper Node
multiplataforma:

```powershell
node .\infra\ensure-dev-cert.cjs
```

No Linux/macOS, o mesmo comando funciona usando `/` no caminho:

```bash
node ./infra/ensure-dev-cert.cjs
```

O helper tenta usar `mkcert`, depois `openssl` com SAN para localhost, e no
Windows ainda possui fallback para o script PowerShell.

Esse comando gera:

```text
infra\certs\localhost-cert.pem
infra\certs\localhost-key.pem
```

Esses arquivos sao ignorados pelo Git porque incluem chave privada local. O
backend passa a subir em HTTPS/WSS e o gateway local tambem usa HTTPS/WSS.

Comportamento padrao:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

Se quiser desligar TLS no desenvolvimento:

```powershell
$env:DEV_TLS_ENABLED="false"
npm run dev
```

Para sobrescrever manualmente certificado e chave, use:

```powershell
cd backend
$env:TLS_ENABLED="true"
$env:TLS_CERT_PATH="..\infra\certs\localhost-cert.pem"
$env:TLS_KEY_PATH="..\infra\certs\localhost-key.pem"
$env:COOKIE_SECURE="true"
npm run dev
```

Quando `TLS_ENABLED=true`, o backend sobe em HTTPS e o WebSocket passa a ser
WSS automaticamente.

O gateway local tambem pode expor HTTPS/WSS com caminhos customizados:

```powershell
cd frontend
$env:GATEWAY_TLS_CERT_PATH="..\infra\certs\localhost-cert.pem"
$env:GATEWAY_TLS_KEY_PATH="..\infra\certs\localhost-key.pem"
$env:VITE_API_URL="https://localhost:3000"
npm run dev
```

Como o modo padrao usa certificado autoassinado, o gateway ja encaminha para
backends HTTPS com verificacao relaxada em desenvolvimento. Para configurar
manualmente:

```powershell
$env:GATEWAY_TARGET_PROTOCOL="https"
$env:GATEWAY_TARGET_REJECT_UNAUTHORIZED="false"
```

Se os backends HTTPS conversarem entre si usando certificado autoassinado,
configure no backend:

```powershell
$env:INTERNAL_TLS_REJECT_UNAUTHORIZED="false"
```

Em producao, prefira certificados validos e mantenha rejeicao de certificados
invalidos habilitada.

## ACL do ZooKeeper

Por padrao, `npm run dev` do backend tambem habilita ACL do ZooKeeper com a
credencial local `chat:dev-secret`. Para proteger os znodes com outra
credencial, configure:

```powershell
cd backend
$env:ZOOKEEPER_AUTH="chat:uma-senha-forte"
$env:ZOOKEEPER_ACL_ENABLED="true"
npm run dev
```

Com essa configuracao, os znodes em `/chat`, `/chat/nodes` e `/chat/presence`
passam a usar `CREATOR_ALL_ACL`. Isso restringe leitura/escrita/remocao aos
clientes autenticados com a mesma credencial.

Se quiser desligar ACL em desenvolvimento:

```powershell
$env:DEV_ZOOKEEPER_ACL_ENABLED="false"
npm run dev
```

Observacao importante: se `/chat` ja foi criado sem ACL em testes anteriores,
reinicie/limpe os znodes antigos ou deixe um backend autenticado aplicar ACL
nos caminhos base. No cliente do ZooKeeper, uma tentativa sem autenticacao deve
falhar apos a ACL estar ativa:

```text
ls /chat/nodes
```

Para testar autenticado no `zkCli.cmd`:

```text
addauth digest chat:uma-senha-forte
ls /chat/nodes
```
