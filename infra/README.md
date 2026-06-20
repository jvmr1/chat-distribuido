# Infraestrutura local

## ZooKeeper no Windows

O projeto inclui uma distribuicao local do ZooKeeper em:

```powershell
infra\apache-zookeeper-3.9.5-bin
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

O ZooKeeper precisa de Java instalado e disponivel no `PATH`.

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

- gateway local em `http://localhost:3000`
- Vite em `http://localhost:5173`

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
