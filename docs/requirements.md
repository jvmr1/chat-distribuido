# Requisitos Atuais do Sistema

Esta lista reflete o estado atual do projeto depois das ultimas alteracoes de
distribuicao, usabilidade, presenca e mensagens nao lidas. A ordem vai dos
requisitos mais estruturais para os detalhes de interface.

## Requisitos Estruturais e Distribuidos

### RE01 - Arquitetura distribuida com multiplos backends

O sistema deve permitir que mais de uma instancia do backend seja executada ao
mesmo tempo, com escolha automatica de porta livre a partir da porta base.

### RE02 - Coordenacao distribuida com Apache ZooKeeper

O sistema deve usar o Apache ZooKeeper para registrar instancias vivas do
backend, detectar falhas por znodes efemeros e manter informacoes de coordenacao
distribuida.

### RE03 - Descoberta automatica de nos

Cada backend ativo deve se registrar em `/chat/nodes`, permitindo que os demais
nos descubram quais instancias estao disponiveis.

### RE04 - Eleicao de lider

Os backends devem observar `/chat/nodes` e considerar lider o menor znode ativo
em ordem lexicografica. No Docker Compose, os znodes sao fixos, como
`backend-1` e `backend-2`; no modo nativo sem `NODE_ID`, podem ser
sequenciais. Quando o lider cair, outro no deve assumir automaticamente.

### RE05 - Roteamento interno entre backends

Quando um evento em tempo real precisar chegar a um usuario conectado em outro
backend, o sistema deve encaminhar o evento por rota interna entre os nos.

### RE05.1 - Endereco interno correto do no

Cada backend deve anunciar no ZooKeeper uma URL interna acessivel pelos demais
containers ou processos do cluster. Em Docker, esse endereco deve usar o nome
do servico, como `backend-1` ou `backend-2`, em vez de `localhost`.

### RE06 - Gateway local de desenvolvimento

O frontend deve usar uma URL estavel em desenvolvimento. Um gateway local deve
encaminhar requisicoes HTTP e WebSocket para backends ativos e saudaveis.

### RE07 - Continuidade com falha de backend

Se um backend cair e outro permanecer ativo, a interface deve continuar
funcionando sem exigir troca manual de URL pelo usuario.

### RE08 - Persistencia em PostgreSQL

Usuarios, sessoes, conversas, membros de grupos, mensagens e marcacoes de
leitura devem ser armazenados em PostgreSQL.

### RE08.1 - Preparacao unica do banco no Compose

No Docker Compose, migracoes e seed devem ser executados por um container
dedicado antes da inicializacao dos backends, evitando trabalho duplicado e
condicoes de corrida entre instancias.

### RE09 - Mensagens offline

Mensagens enviadas para usuarios desconectados devem permanecer no banco e ser
exibidas quando o usuario voltar a acessar o sistema.

### RE10 - TLS para backend, gateway, frontend e WebSocket

O sistema deve permitir execucao local com TLS, usando HTTPS para backend,
gateway e frontend, alem de WSS para WebSocket.

### RE11 - Cookies seguros em ambiente TLS

Quando TLS estiver habilitado, os cookies de sessao devem poder ser marcados
como `secure`, impedindo envio por conexoes nao criptografadas.

### RE12 - Certificado local confiavel

O ambiente de desenvolvimento deve aceitar certificados locais em PEM,
preferencialmente gerados por `mkcert`, contendo SAN para `localhost`,
`127.0.0.1` e `::1`.

### RE13 - Geracao automatica de certificado local

Quando os arquivos de certificado local nao existirem, o comando de
desenvolvimento deve tentar gera-los automaticamente em `infra/certs`.

### RE14 - CORS compativel com HTTP e HTTPS locais

O backend deve aceitar as origens locais configuradas para o frontend, incluindo
`https://localhost:5173` e `http://localhost:5173`, retornando a origem correta
na resposta CORS.

### RE14.1 - CORS no gateway de desenvolvimento

O gateway local deve responder requisicoes preflight `OPTIONS` e incluir
cabecalhos CORS tambem em respostas de erro, evitando que falhas temporarias de
backend sejam mascaradas pelo navegador como bloqueio de CORS.

### RE15 - ACL no ZooKeeper

O sistema deve permitir configurar autenticacao digest e ACL no ZooKeeper para
restringir acesso aos znodes de coordenacao do chat.

### RE16 - ACL do ZooKeeper habilitada por padrao no desenvolvimento

O comando de desenvolvimento do backend deve habilitar ACL local do ZooKeeper
por padrao, com possibilidade de desativacao por variavel de ambiente.

### RE17 - Reconexao e status correto do ZooKeeper

O backend deve tratar eventos de conexao, desconexao temporaria, expiracao de
sessao e falha de autenticacao do ZooKeeper, mantendo o indicador de status
coerente com o estado real do cliente.

### RE17.1 - Persistencia local do estado do ZooKeeper no Compose

O Docker Compose deve persistir os diretorios de dados e logs do ZooKeeper para
evitar que reinicios do container voltem com um `zxid` anterior ao observado
por clientes ainda ativos.

### RE17.2 - Logs operacionais do ZooKeeper

No Docker Compose, o ZooKeeper deve usar nivel de log `ERROR` por padrao para
evitar mensagens informativas ou avisos de reconexao que nao afetam o
funcionamento do chat.

### RE18 - Documentacao por diagramas

O projeto deve manter diagramas da arquitetura distribuida, incluindo usuarios,
gateway, backends, PostgreSQL, znodes do ZooKeeper, presenca, envio de mensagem
e failover. Os diagramas devem ter titulo renderizavel na imagem exportada e
um procedimento para gerar arquivos de imagem com nomes previsiveis.

## Requisitos de Autenticacao e Sessao

### RA01 - Login

O sistema deve permitir login com usuario e senha.

### RA02 - Validacao de credenciais

O sistema deve rejeitar usuario ou senha invalidos e impedir acesso ao chat.

### RA03 - Cadastro de usuario

O sistema deve permitir cadastro de novo usuario informando nome de usuario,
nome de exibicao, senha e confirmacao de senha.

### RA03.1 - Regra minima de senha

No cadastro, a senha deve ter pelo menos 6 caracteres. Quando a senha for
menor que isso, o sistema deve informar essa regra explicitamente.

### RA04 - Nome de usuario unico

O sistema deve impedir cadastro quando o nome de usuario ja existir.

### RA04.1 - Erro especifico para usuario existente

Ao tentar cadastrar um nome de usuario ja existente, o sistema deve informar
claramente que o usuario ja existe, em vez de exibir erro generico.

### RA04.2 - Erros especificos de validacao de cadastro

Falhas de validacao no cadastro, como nome de exibicao curto, usuario fora do
formato permitido ou senha curta, devem exibir mensagens especificas para o
usuario.

### RA05 - Visualizacao de senha

Campos de senha no login e no cadastro devem possuir opcao de mostrar/ocultar a
senha.

### RA06 - Sessao autenticada persistente

Apos login ou cadastro bem-sucedido, o sistema deve criar uma sessao
autenticada persistida em cookie HTTP-only.

### RA07 - Persistencia da sessao apos atualizar pagina

A sessao deve permanecer ativa depois de atualizar a pagina, sendo encerrada
apenas por logout ou expiracao/revogacao da sessao.

### RA08 - Logout distribuido

Ao realizar logout, o usuario deve ter sua sessao revogada, seus WebSockets
fechados e sua presenca removida em todos os backends do cluster.

### RA09 - Usuarios iniciais de demonstracao

O seed inicial do banco deve criar apenas os usuarios `alice` e `bob`, ambos
com senha `123456`, para demonstracao do chat.

## Requisitos de Presenca

### RP01 - Presenca online/offline

O sistema deve informar se cada usuario esta online ou offline.

### RP02 - Presenca distribuida via ZooKeeper

Quando um usuario conecta via WebSocket, o backend deve registrar sua presenca
em `/chat/presence/{userId}/{nodeId}` com znode efemero.

### RP03 - Remocao automatica de presenca

Quando o usuario sair, fechar a conexao ou quando o backend cair, sua presenca
deve ser removida automaticamente ou por acao coordenada entre os backends.

### RP04 - Retentativa de registro de presenca

Se o WebSocket conectar antes do backend concluir o registro no ZooKeeper, o
sistema deve tentar registrar a presenca novamente enquanto o usuario estiver
conectado.

### RP05 - Ultimo visto

Quando um usuario fica offline, o sistema deve registrar em banco o horario de
ultimo visto.

### RP06 - Indicador de presenca na listagem de conversas

Em conversas diretas, a barra lateral deve indicar se o outro usuario esta
online. Caso esteja offline, deve mostrar o ultimo horario em que esteve online,
quando essa informacao existir.

### RP07 - Indicador de presenca em modais de usuarios

As listas de usuarios em nova conversa, criacao de grupo, adicao de membros e
visualizacao de membros devem indicar online/offline.

## Requisitos de Conversas e Grupos

### RC01 - Listagem de conversas

O sistema deve exibir na barra lateral as conversas diretas e grupos dos quais
o usuario participa.

### RC02 - Ocultar conversas vazias no historico

Conversas sem mensagens nao devem aparecer na listagem historica da barra
lateral.

### RC03 - Ordenacao por atualizacao

Quando uma conversa recebe nova mensagem, ela deve subir na ordem da barra
lateral.

### RC04 - Nome correto em conversa direta

Conversas diretas devem exibir o nome do outro usuario na barra lateral e no
topo do chat.

### RC05 - Inicio de conversa direta

O sistema deve permitir iniciar conversa direta com outro usuario por meio de
modal de nova conversa.

### RC06 - Busca de usuarios para nova conversa

O modal de nova conversa deve permitir buscar usuarios.

### RC07 - Criacao de grupos

O sistema deve permitir criar grupos de conversa por botao separado da nova
conversa direta.

### RC08 - Busca de usuarios para grupo

O modal de criacao de grupo deve permitir buscar usuarios para selecionar
participantes.

### RC09 - Visualizacao de membros do grupo

Em conversas de grupo, deve ser possivel visualizar os participantes.

### RC10 - Administrador do grupo

A pessoa que cria o grupo deve ser administradora.

### RC11 - Permissoes de administrador

O administrador do grupo deve poder adicionar participantes, remover
participantes e apagar o grupo.

### RC11.1 - Promocao de administrador

O administrador do grupo deve poder conceder permissao de administrador a outro
participante do grupo.

### RC11.1.1 - Remocao de permissao de administrador

O administrador do grupo deve poder remover a permissao de administrador de
outro administrador, mantendo esse usuario como membro comum.

### RC11.1.2 - Remocao de outro administrador do grupo

O administrador do grupo deve poder remover outro administrador do grupo.

### RC11.2 - Indicadores separados de papel e presenca

Na lista de membros do grupo, o papel do participante, como admin ou membro,
deve ser exibido separadamente do estado de presenca, como online ou offline.

### RC12 - Permissoes de membro comum

Usuarios comuns de um grupo devem poder enviar mensagens, mas nao gerenciar
participantes nem apagar o grupo.

### RC13 - Limpeza individual de historico

O sistema deve permitir que um usuario limpe o historico visivel de uma
conversa apenas para si, sem remover as mensagens para os demais participantes.

### RC14 - Conversa limpa permanece na lista

Ao limpar o historico individualmente, a conversa deve permanecer na barra
lateral do usuario, mas sem mensagens visiveis anteriores ao momento da
limpeza.

### RC15 - Remocao individual da lista de conversas

O sistema deve permitir que um usuario remova uma conversa da sua propria barra
lateral, tambem limpando o historico visivel apenas para ele.

### RC16 - Remocao individual nao afeta outros participantes

Quando um usuario remover uma conversa da propria lista, os demais
participantes devem continuar vendo a conversa e o historico normalmente.

### RC17 - Retorno de conversa removida por nova mensagem

Se uma conversa removida da lista receber nova mensagem, ela deve voltar a
aparecer para os participantes ativos que a haviam removido, mostrando apenas
as mensagens novas para cada usuario.

## Requisitos de Mensagens

### RM01 - Visualizacao de historico

O sistema deve permitir visualizar o historico de mensagens da conversa ou
grupo selecionado.

### RM02 - Persistencia de mensagens

Mensagens devem permanecer disponiveis apos atualizacao da pagina, logout ou
novo login.

### RM03 - Envio de mensagem direta

O sistema deve permitir envio de mensagens em conversas diretas.

### RM04 - Envio de mensagem em grupo

O sistema deve permitir envio de mensagens para grupos dos quais o usuario
participa.

### RM05 - Recebimento em tempo proximo ao real

Mensagens recebidas devem aparecer em tempo proximo ao real para usuarios
conectados.

### RM06 - Evitar duplicacao visual de mensagem

Ao enviar uma mensagem, ela nao deve aparecer duplicada no historico local.

### RM07 - Limpar campo apos envio

Depois do envio bem-sucedido, o campo de digitacao da mensagem deve ser limpo.

### RM08 - Nome correto do remetente

Mensagens recem-enviadas devem exibir imediatamente o nome correto do remetente,
sem depender de atualizar a pagina.

### RM09 - Mensagens nao lidas

A barra lateral deve mostrar contagem de mensagens nao lidas em conversas ainda
nao abertas pelo usuario.

### RM10 - Destaque visual de nao lidas

Conversas com mensagens nao lidas devem ter destaque visual na barra lateral.

### RM11 - Marcar conversa como lida

Ao abrir uma conversa, o sistema deve marcar suas mensagens como lidas para o
usuario atual.

### RM12 - Horario em cada mensagem

Cada mensagem exibida no historico deve mostrar hora e minuto de envio de forma
discreta na propria bolha da mensagem.

### RM13 - Separador diario no historico

O historico deve exibir um separador discreto quando as mensagens mudarem de
dia ao longo do scroll.

## Requisitos de Interface e Usabilidade

### RU01 - Interface web

O sistema deve disponibilizar interface acessivel por navegador web.

### RU02 - Area de mensagem fixa

Quando a conversa tiver muitas mensagens, a caixa de digitacao deve permanecer
fixa no rodape do painel do chat.

### RU03 - Scroll restrito ao historico

O scroll de mensagens deve ocorrer apenas dentro da area de historico da
conversa, sem empurrar a caixa de digitacao para fora da tela.

### RU04 - Abrir conversa no fim do historico

Ao clicar em uma conversa, o historico deve abrir posicionado nas mensagens mais
recentes.

### RU05 - Scroll automatico em nova mensagem enviada

Ao enviar uma mensagem, o historico deve rolar automaticamente para o fim.

### RU06 - Scroll automatico em nova mensagem recebida

Se a conversa ja estiver aberta e chegar uma nova mensagem, o historico deve
rolar automaticamente para o fim para que a mensagem fique visivel.

### RU06.1 - Foco automatico no campo de mensagem

Ao selecionar uma conversa na barra lateral, o campo de digitacao deve receber
foco automaticamente para permitir digitar sem um clique adicional.

### RU07 - Separacao entre nova conversa e novo grupo

A interface deve ter um botao para nova conversa direta e outro botao separado
para novo grupo.

### RU08 - Indicador de status do ZooKeeper

A interface deve exibir indicador visual informando se o backend esta conectado
e registrado no ZooKeeper.

### RU09 - Indicador de ACL do ZooKeeper

Quando a ACL do ZooKeeper estiver habilitada, a interface deve indicar isso no
status do ZooKeeper.

### RU10 - Reconnection automatica do WebSocket

Se o WebSocket cair, o frontend deve tentar reconectar automaticamente,
avancando para outro endpoint quando aplicavel.

### RU11 - Comando unico do frontend em desenvolvimento

O comando `npm run dev` do frontend deve iniciar tanto o Vite em HTTPS quanto o
gateway local de desenvolvimento em HTTPS.

### RU12 - Comando unico do backend em desenvolvimento

O comando `npm run dev` do backend deve iniciar uma instancia HTTPS em porta
livre, sem exigir que o usuario escolha manualmente portas para multiplos nos.

### RU12.1 - Compatibilidade Windows e Linux nos comandos

Os comandos principais de desenvolvimento devem funcionar em Windows e Linux,
evitando dependencias exclusivas de shell quando houver alternativa em Node.js.

### RU12.1.1 - Execucao padronizada por Docker Compose

O projeto deve oferecer Docker Compose como caminho principal de execucao,
permitindo que uma pessoa rode todo o sistema com `docker compose up --build`
apos clonar o repositorio, independentemente do sistema operacional.

### RU12.1.2 - HTTPS padrao no Docker Compose

O Docker Compose principal deve subir frontend, gateway e backends com HTTPS e
WSS habilitados por padrao, compartilhando os certificados locais de
`infra/certs` entre os containers.

### RU12.1.3 - Backend compilado no Docker

As imagens Docker do backend devem compilar o TypeScript durante o build e
executar `dist/server.js` no container, reservando watchers como `tsx watch`
para o modo nativo de desenvolvimento.

### RU12.1.4 - Assets de banco no build compilado

O build compilado do backend deve copiar arquivos auxiliares necessarios em
runtime, como `schema.sql`, para `dist`, garantindo que migracoes funcionem
fora do modo `tsx`.

### RU12.2 - Inicializacao flexivel do ZooKeeper local

O script de inicializacao do ZooKeeper no Windows deve localizar uma distribuicao
local por `ZOOKEEPER_HOME`, pasta `infra/apache-zookeeper-*-bin` ou `PATH`, e
deve oferecer fallback por Docker Compose quando a distribuicao local nao
estiver disponivel.

### RU13 - Confirmacao para acoes destrutivas

Acoes como limpar historico, remover conversa da lista e apagar grupo devem
exibir um modal de confirmacao com opcoes de confirmar ou cancelar.

### RU14 - Ocultar compositor sem conversa selecionada

Quando nenhuma conversa estiver selecionada, a interface nao deve exibir a
caixa de texto de envio de mensagem, evitando que o usuario tente enviar sem
destino.

### RU15 - Alternancia entre tema claro e escuro

O sistema deve permitir alternar entre tema claro e tema escuro, mantendo a
preferencia escolhida apos atualizar a pagina. O controle de tema deve ficar
compacto ao lado do botao de logout, sem ocupar espaco vertical extra.
