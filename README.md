# Pataí 🐾

**cuidado de focinho a rabinho**

Sistema fullstack de banho e tosa desenvolvido em **MVC**, com **Vue 3**, **Node.js + Express** e **MongoDB**, alinhado ao banco utilizado na disciplina.

## Executar

Requisitos: Node.js 24 ou superior e um servidor MongoDB em execução. O MongoDB Compass é a ferramenta visual para consultar esse servidor.

```sh
npm install
npm run dev
```

Acesse **http://localhost:3000**. Durante o desenvolvimento, `npm run dev` reinicia o backend quando os arquivos mudam. Atualize a página para carregar alterações da interface.

Para executar sem observação de arquivos, use `npm start`; nesse modo, reinicie o processo após modificar o backend. Se já houver um servidor na porta 3000, encerre-o antes de iniciar outro para evitar usar uma versão antiga.

O arquivo `.env` usa a configuração local:

```dotenv
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=patai
SEED_DEMO=true
TZ=America/Sao_Paulo
```

Em outro computador, crie `.env` a partir de `.env.example`. O projeto cria as coleções, validadores e índices automaticamente na primeira execução. A ausência do MongoDB é informada no terminal.

## Ver o banco no Compass

1. Abra **MongoDB Compass**.
2. Clique em **Add new connection** / **Nova conexão**.
3. Use a URI `mongodb://127.0.0.1:27017` e clique em **Connect**.
4. Atualize a lista de bancos e abra **patai**.

Você encontrará `usuarios`, `animais`, `servicos`, `horarios` e `agendamentos`. Os atendimentos concluídos ficam no campo **`atendimento` dentro do documento do agendamento**.

Exemplos para o filtro de documentos no Compass:

```js
// Coleção usuarios: clientes
{ tipo: "cliente" }

// Coleção agendamentos: solicitações pendentes
{ status: "pendente" }

// Coleção agendamentos: atendimentos concluídos
{ status: "concluido", atendimento: { $exists: true } }

// Coleção animais: pets de um tutor (substitua pelo _id de um usuário)
{ usuario_id: ObjectId("000000000000000000000001") }
```

No Compass, o campo `_id` é um `ObjectId`. A API apresenta esse identificador como `id`, em formato de string, para a interface Vue. Campos como `usuario_id`, `animal_id` e `servico_id` também são referências `ObjectId` no banco.

## Contas de demonstração

Use os botões na tela de entrada ou estas credenciais fictícias:

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Cliente | `cliente@patai.com.br` | `Patai@123` |
| Administrador | `admin@patai.com.br` | `Patai@123` |

`SEED_DEMO=false` impede a criação de novas contas fictícias e oculta os atalhos; registros existentes são preservados. Para um ambiente vazio sem demonstração, configure `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` para criar o primeiro administrador. O cadastro público sempre cria clientes.

## Estrutura MVC

As pastas originais foram mantidas:

```text
assets/
  css/style.css              Identidade visual e layout
  css/readability.css        Escala de leitura e espaço para os textos maiores
  fonts/                     Montserrat, Poppins e licenças
  images/                    Marca, ícones e fotos ilustrativas
config/
  database.js                Conexão com MongoDB e coordenação de operações
  schema.js                  Validadores JSON Schema e índices MongoDB
  seed.js                    Catálogo, funcionamento e dados fictícios iniciais
  schema.sql                 Referência legada; não utilizada pelo aplicativo
controllers/
  authController.js          Login, cadastro e perfil
  petshopController.js       Regras e validações de negócio
middlewares/
  auth.js                    Sessões, perfis de acesso e validação de origem
  photoUpload.js             Recebimento e limite dos arquivos de foto
models/
  usuarioModel.js            Consultas da coleção usuarios
  animalModel.js             Consultas da coleção animais
  servicoModel.js            Consultas da coleção servicos
  agendamentoModel.js        Agendamentos, relacionamentos e reservas
  horarioModel.js            Disponibilidade semanal
  atendimentoModel.js        Conclusão e registro do atendimento
routes/
  api.js                     Endpoints e controle de acesso
utils/
  mongo.js                   ObjectId, serialização e intervalos reservados
  photoStorage.js            Validação, otimização e armazenamento das fotos
  migrate-sqlite.js          Transferência opcional dos dados da versão anterior
  check.js                   Verificação de JavaScript, template e assets
view/
  index.html                 Telas da aplicação
  app.js                     Estado e interações Vue
  icons.js                   Componente dos ícones SVG
tests/
  api.test.js                Testes de integração com MongoDB real
server.js                    Inicialização da aplicação
```

Fluxo: **View → rota → middleware → Controller → Model → MongoDB**. Os Models usam o driver oficial `mongodb`, com `find`, `insertOne`, `updateOne` e agregações com `$lookup`. O retorno JSON atualiza as telas Vue.

## Organização dos documentos

| Coleção | Conteúdo | Relacionamento |
| --- | --- | --- |
| `usuarios` | Nome, e-mail, senha protegida, telefone e perfil | Um tutor pode ter vários animais |
| `animais` | Nome, espécie, raça, porte, idade e observações | `usuario_id` referencia um usuário |
| `servicos` | Nome, descrição, preço, duração e disponibilidade | Um serviço pode aparecer em vários agendamentos |
| `horarios` | Dia da semana, abertura, fechamento e disponibilidade | Regras para calcular as vagas de cada data |
| `agendamentos` | Animal, serviço, data, horário, valor, duração e status | Referências para o pet e o serviço; atendimento incorporado |

Exemplo simplificado de agendamento concluído:

```js
{
  _id: ObjectId("000000000000000000000010"),
  animal_id: ObjectId("000000000000000000000020"),
  servico_id: ObjectId("000000000000000000000030"),
  data: "2026-11-09",
  horario: "09:00",
  duracao: 60,
  valor: 65,
  status: "concluido",
  observacoes: "Pet sensível a ruídos.",
  criado_em: "2026-11-08T12:00:00.000Z",
  atendimento: {
    observacoes: "Banho realizado com tranquilidade.",
    concluido_em: "2026-11-09T13:10:00.000Z"
  }
}
```

O atendimento é incorporado porque pertence a um único agendamento. A conclusão grava o status e suas observações em **uma única atualização atômica**, inclusive em um MongoDB local standalone. Assim, o projeto não exige configurar replica set para funcionar na aula. O Model de atendimento continua separado, preservando a organização MVC.

Os validadores de coleção rejeitam formatos inválidos. Índices únicos protegem o e-mail e o dia da semana. Relacionamentos e autorização do tutor são validados na aplicação.

### Evitar reservas sobrepostas

Um agendamento ativo inclui o array `reservas`, com uma chave para cada intervalo de 15 minutos ocupado pelo serviço. Um banho de 60 minutos iniciado às 09h ocupa quatro intervalos.

O índice único multikey `reservas_sem_sobreposicao` impede que outro documento reserve qualquer um desses intervalos. A proteção funciona inclusive com duas conexões concorrentes ao banco. Cancelamento ou recusa remove o array e libera a vaga atomicamente.

Uma fila no processo Node coordena alterações nos horários de funcionamento com novos pedidos. A configuração atual usa **um processo Node**, inclusive porque as sessões de acesso ficam em memória. A fila não é apresentada como uma transação de múltiplos documentos: o MongoDB local não oferece esse recurso sem replica set.

## Funcionalidades

| Cliente | Administrador |
| --- | --- |
| Criar conta, entrar e sair | Entrar e sair |
| Visualizar resumo dos seus cuidados | Consultar resumo do estabelecimento |
| Cadastrar e editar seus animais | Consultar clientes e animais |
| Consultar serviços ativos | Cadastrar, editar e inativar serviços |
| Solicitar data e horário disponíveis | Consultar agenda e filtrar registros |
| Acompanhar seus agendamentos | Aprovar ou recusar solicitações |
| Cancelar antes do horário marcado | Gerenciar horários da semana |
| Ver atendimentos e observações | Concluir e registrar atendimentos |
| Atualizar nome e telefone | Atualizar nome e telefone |

Também há busca, calendário, avisos derivados da agenda e foto opcional dos animais. A recuperação de senha é opcional no escopo e não foi implementada. Não há envio de e-mails ou mensagens nem pagamento online.

### Foto do animal

No cadastro e na edição, use **Escolher foto** ou **Trocar foto**. A imagem aparece na prévia antes de salvar. Também é possível removê-la; o cadastro continua funcionando sem uma foto pessoal.

- Formatos aceitos: **JPG, PNG e WebP**, com até **5 MB** e **25 megapixels**.
- O servidor verifica o conteúdo real do arquivo e gera uma versão WebP com até 1200 pixels por lado, sem os metadados originais.
- Os arquivos ficam em `data/uploads/animais/`; o campo `foto` do documento no MongoDB guarda o nome do arquivo.
- A imagem é utilizada nos cards, na visão geral, nos agendamentos e na consulta administrativa.
- A rota `/api/animais/fotos/:filename` exige uma sessão do próprio tutor ou do administrador. Fotos não são publicadas na pasta de assets.
- Editar nome, idade ou outras informações preserva a foto. Trocar ou remover a foto limpa o arquivo anterior após salvar.

Ao transferir o projeto para outro computador, leve o banco MongoDB e a pasta `data/uploads/animais/` para preservar as fotos. A pasta de uploads é ignorada pelo Git.

Regras principais:

- Um animal por vez; horários de início a cada 30 minutos.
- O serviço completo precisa caber no período de funcionamento.
- Pedidos pendentes reservam o período. Cancelamentos e recusas liberam a vaga.
- Agendamentos de hoje até os próximos 180 dias, no horário de São Paulo.
- Clientes acessam apenas seus animais e agendamentos.
- Somente a administração confirma, recusa e conclui atendimentos.
- A conclusão exige um agendamento confirmado cujo horário já chegou.
- Valor e duração ficam registrados no agendamento para preservar o histórico.
- Inativação de serviços preserva os registros anteriores.
- Novos horários de funcionamento não podem invalidar reservas futuras existentes.

## Fontes e responsividade

Os textos principais usam **16 px**, com controles e informações auxiliares de pelo menos **14 px**. Os títulos usam Montserrat e os textos usam Poppins. A escala continua legível no celular, reorganizando os cards, menus, formulários e tabelas em vez de diminuir a fonte.

A entrada e a visão geral usam fundos verdes suaves, navegação ativa em verde escuro e maior contraste nos painéis. O cartão lateral “Carinho na agenda. Alegria na rotina.” aparece somente na área do cliente.

## Transferir a versão anterior

Os dados do SQLite foram transferidos para o banco MongoDB local `patai`. O arquivo `data/patai.sqlite` foi preservado como cópia da versão anterior.

Em outra instalação que ainda use essa versão, execute antes de iniciar o aplicativo:

```sh
npm run db:migrate
```

O script lê o SQLite em modo somente leitura e mantém senhas protegidas, pets, serviços, horários, agendamentos e atendimentos. Cria referências `ObjectId` e guarda `legado_id` para rastrear os identificadores antigos. Exige um banco de destino vazio ou já iniciado pela mesma transferência e não sobrescreve documentos existentes ao ser executado novamente.

O aplicativo passou a ler e escrever apenas no MongoDB. Alterações feitas depois da transferência não são sincronizadas com o arquivo SQLite antigo.

## Verificação

Com o MongoDB em execução:

```sh
npm run check
npm test
```

Os **24 testes** usam um banco MongoDB temporário com nome aleatório `patai_test_...` e uma pasta de fotos isolada. Ao terminar, removem apenas os dados criados para o teste; o banco `patai` e as fotos reais permanecem intactos.

São verificados autenticação, controle de acesso, isolamento dos tutores, cadastros, validação de documentos, conflitos de horários, duas conexões concorrentes, histórico de valores, disponibilidade, cancelamento, recusa, conclusão atômica e logout. Os testes de fotos cobrem envio, conversão, dimensões, persistência, leitura autorizada, troca, remoção, tipos inválidos, limite de tamanho e limpeza dos arquivos.

## Segurança e configuração

Senhas são protegidas com `scrypt` e salt aleatório. A sessão usa cookie `HttpOnly`, `SameSite=Strict`, expiração de 12 horas e invalidação no logout. Senhas não são devolvidas ao navegador. As sessões terminam quando o processo Node reinicia.

O servidor de desenvolvimento escuta em `127.0.0.1`. Em uma implantação de produção, use HTTPS, credenciais MongoDB próprias, `NODE_ENV=production` e banco sem contas demo.

## Identidade e referências

- **Pataí — cuidado de focinho a rabinho.**
- Paleta: `#1B4332`, `#F6B94A`, `#F7F5EB`, `#A7B9A9` e `#333333`.
- Fontes locais Montserrat e Poppins sob SIL Open Font License; licenças em `assets/fonts/`.
- Marca e ícones SVG desenhados para o projeto.
- Fotos ilustrativas do [Unsplash](https://unsplash.com/license): [golden](https://images.unsplash.com/photo-1552053831-71594a27632d), [gato](https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba), [cachorro](https://images.unsplash.com/photo-1543466835-00a7907e9de1).
- Documentação: [Vue](https://vuejs.org/guide/quick-start.html), [Express](https://expressjs.com/en/5x/api/), [driver MongoDB](https://www.mongodb.com/docs/drivers/node/current/), [Compass](https://www.mongodb.com/docs/compass/) e [atomicidade no MongoDB](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/).
