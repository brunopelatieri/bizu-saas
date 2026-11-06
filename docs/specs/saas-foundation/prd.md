# PRD: SaaS Foundation

- **Status:** rascunho
- **Data:** 2026-11-05
- **Responsável:** Bruno Pelatieri Goulart
- **SPEC:** `docs/specs/saas-foundation/spec.md`

> O PRD responde **o quê** e **por quê**. Tabelas, endpoints e componentes ficam na SPEC.

## Problema

Quem quer lançar um SaaS no Brasil começa do zero a cada projeto: autenticação,
verificação de e-mail, multi-tenant, papéis, trial, cobrança com Pix e boleto,
webhooks, auditoria e LGPD. Cada uma dessas peças tem armadilhas de segurança
conhecidas, e a maioria dos starters públicos é feita para Stripe e cartão, sem os
provedores brasileiros, ou prende o projeto a um fornecedor de auth ou de banco.

O `bizu-saas` hoje é o oposto do que o nome promete: é um starter para projetos que
**não são SaaS**, sem provedor de autenticação, sem tenant e sem cobrança. O
`CLAUDE.md`, o README, a landing e o `docs/context/` afirmam explicitamente que
multi-tenant e cobrança recorrente estão fora do escopo. Este PRD substitui esse
posicionamento.

## Objetivo e métrica de sucesso

- **Objetivo:** qualquer pessoa clona o repositório público, segue o README e em menos
  de 30 minutos tem um SaaS multi-tenant rodando localmente, com os quatro níveis de
  login funcionando, trial configurável, cobrança por módulo e áreas do proprietário,
  do owner e do cliente prontas para receber o domínio do produto.
- **Métricas:**
  - Do `git clone` ao primeiro login como proprietário, seguindo só o README: ≤ 30 min,
    sem passo não documentado (medido por um teste de onboarding com pessoa externa).
  - `npm run db:seed` produz um ambiente de demonstração com os quatro níveis e um
    tenant em trial, e o fluxo de verificação de e-mail funciona no Mailpit local.
  - Suíte automatizada prova isolamento entre tenants, matriz de permissões e
    verificação de e-mail; CI verde em `main`.
  - Adicionar um provedor de pagamento novo não altera nenhum arquivo do núcleo de
    billing (só a pasta do módulo e o registro).
  - Zero segredos no repositório; `npm audit --omit=dev` sem alertas altos ou críticos.

## Usuários

Quatro níveis de login, com nomes definidos aqui e usados em todo o projeto:

| Nível | Nome no projeto | Quem é | O que precisa conseguir fazer |
|---|---|---|---|
| 1 | **Proprietário da plataforma** (`platform_owner`, `platform_support`) | Quem opera o SaaS | Ver e administrar todos os tenants, planos, trial, assinaturas, webhooks, jobs, usuários e auditoria; personificar com consentimento e rastro |
| 2 | **Owner da conta** (`owner` do tenant) | Cliente do SaaS, dono de um tenant | Criar a conta, verificar o e-mail, concluir o onboarding, convidar equipe, definir papéis, assinar um plano, pagar com Pix, boleto ou cartão, trocar de plano, cancelar e exportar dados |
| 3 | **Colaborador** (`admin`, `member` e papéis personalizados) | Equipe do owner | Entrar por convite, trabalhar dentro do tenant com as permissões do papel, ativar 2FA |
| 4 | **Cliente/lead** (`customer`) | Cliente ou lead do owner | Entrar no portal do tenant com login próprio, ver seus dados, atualizar cadastro e, em fase futura, faturas e pagamentos ao owner |

### Personas

- **Proprietário — Marina, fundadora.** Opera o SaaS sozinha. Precisa configurar trial
  e planos sem mexer em código, ver quem está em trial, quem está inadimplente e
  entrar na conta de um cliente para dar suporte sem pedir senha.
- **Owner — Carlos, dono de uma clínica.** Cria a conta pelo site, precisa confirmar o
  e-mail, cadastrar a clínica, convidar a recepcionista e pagar por Pix. Não entende
  de tecnologia; cada erro precisa ter próxima ação clara.
- **Colaboradora — Ana, recepcionista.** Recebe convite por e-mail, cria a senha, só
  vê o que o papel permite. Troca de clínica se trabalhar em duas.
- **Cliente/lead — Júlia, paciente.** Recebe um link do portal da clínica, entra sem
  senha na primeira vez, vê seus dados. Pode ser cliente de outra clínica que usa o
  mesmo SaaS, com o mesmo e-mail, sem que uma veja a outra.

## Escopo

**Dentro:**

- Autenticação própria sobre Postgres e Drizzle, com e-mail e senha, verificação de
  e-mail por link em todos os níveis, recuperação de senha, 2FA, sessões em banco.
- Multi-tenant com organização ativa na sessão, isolamento por `tenant_id` na
  aplicação e Row Level Security no Postgres.
- RBAC com papéis de plataforma, papéis de tenant (`owner`, `admin`, `member`) e papéis
  personalizados por tenant, com catálogo de permissões aplicado no servidor e
  refletido na interface.
- Portal do cliente/lead com identidade separada da equipe, login por link mágico e
  senha opcional, vinculado a um ou mais tenants.
- Planos, preços, limites e funcionalidades por plano; trial configurável pelo
  proprietário, inclusive gratuito e sem fim.
- Núcleo de cobrança com interface de módulo; módulos Stripe e Asaas na primeira
  entrega; Mercado Pago, Pagar.me e PagBank como módulos seguintes sobre a mesma
  interface.
- Webhooks de pagamento com verificação de autenticidade, idempotência,
  reprocessamento e reconciliação.
- E-mails transacionais com provedor substituível, Mailpit no desenvolvimento e
  registro de falhas e bounces.
- Jobs em segundo plano sobre o próprio Postgres.
- Áreas prontas: `/admin` (proprietário), `/app` (owner e equipe), `/portal` (cliente).
- Onboarding do tenant, convite de colaboradores, personificação com consentimento,
  log de auditoria, LGPD básica (consentimento, exportação, exclusão).
- Segurança: modelo de ameaças, CSRF, CSP, rate limit compartilhado, segredos e
  criptografia de credenciais por tenant.
- Migrations, seed, tutorial completo no README, CI com Postgres, LICENSE,
  CONTRIBUTING, SECURITY, changelog e versionamento.

**Fora:**

- Fluxo (b): owner cobrando seus clientes com split ou contas conectadas. Entra como
  módulo futuro sobre a mesma interface; o modelo de dados já reserva o lugar.
- Login social (Google, Microsoft). Fase futura, com regra definida na SPEC sobre
  quando confiar na verificação do provedor.
- Subdomínio e domínio próprio por tenant. Módulo futuro de white label; a primeira
  entrega usa um domínio só e a organização ativa na sessão.
- API pública com chaves, webhooks de saída e notificações push.
- Internacionalização além de pt-BR, múltiplas moedas, emissão de nota fiscal.
- Supabase ou qualquer provedor de auth hospedado. Removidos e não voltam.
- Cobrança por uso medido (metered) e marketplaces de apps.

## Requisitos funcionais

Prioridade: **Must** entra na primeira entrega; **Should** entra até a última fase do
plano; **Could** é módulo opcional ou fase futura.

### Autenticação e verificação de e-mail

| ID | Requisito | Prioridade |
|---|---|---|
| RF-01 | Cadastro com nome, e-mail e senha para proprietário (via seed/CLI), owner e colaborador; cadastro de cliente/lead pelo portal quando o tenant permitir | Must |
| RF-02 | Todo cadastro, nos quatro níveis, exige verificação do e-mail por link enviado ao endereço informado antes de qualquer acesso | Must |
| RF-03 | O link de verificação abre uma página com botão de confirmação; o token só é consumido após a confirmação, para resistir a scanners de e-mail | Must |
| RF-04 | Token de verificação expira em tempo configurável (padrão 1 h), é de uso único e o reenvio invalida o anterior | Must |
| RF-05 | Reenvio de verificação com rate limit e resposta idêntica exista ou não o e-mail | Must |
| RF-06 | Conta não verificada não entra: login responde o mesmo erro genérico e oferece reenvio | Must |
| RF-07 | Troca de e-mail exige confirmação no endereço atual e verificação no novo; o endereço antigo recebe aviso | Must |
| RF-08 | Recuperação de senha por link, uso único, com resposta uniforme e revogação das outras sessões ao redefinir | Must |
| RF-09 | 2FA por TOTP com códigos de backup para níveis 1, 2 e 3; obrigatório para proprietário em produção | Should |
| RF-10 | Convite de colaborador por e-mail com expiração; aceitar exige conta verificada com o mesmo e-mail | Must |
| RF-11 | Cliente/lead entra por link mágico de uso único, que também verifica o e-mail; pode definir senha depois | Must |
| RF-12 | Sessões em banco, listáveis e revogáveis pelo usuário; logout em todos os dispositivos | Must |
| RF-13 | Login social com verificação herdada só de provedores que afirmam e-mail verificado | Could |

### Multi-tenant e RBAC

| ID | Requisito | Prioridade |
|---|---|---|
| RF-20 | Owner cria o tenant no onboarding após verificar o e-mail; vira `owner` dele | Must |
| RF-21 | Um usuário de equipe pode pertencer a vários tenants e trocar o tenant ativo | Must |
| RF-22 | Nenhuma rota, query ou job acessa dados de outro tenant; a falha é fechada | Must |
| RF-23 | Papéis `owner`, `admin`, `member` com permissões padrão e papéis personalizados criados pelo owner a partir do catálogo | Must |
| RF-24 | Permissões validadas no servidor em toda rota privada; a interface esconde o que o usuário não pode fazer | Must |
| RF-25 | Owner pode transferir a propriedade e remover membros; o último owner não pode sair | Must |
| RF-26 | Cliente/lead só vê dados do tenant em que está vinculado; o mesmo e-mail pode ser cliente de vários tenants | Must |

### Proprietário da plataforma

| ID | Requisito | Prioridade |
|---|---|---|
| RF-30 | Área `/admin` lista tenants, usuários, assinaturas, eventos de webhook e jobs, com filtros | Must |
| RF-31 | Proprietário cria e edita planos, preços, limites e funcionalidades sem alterar código | Must |
| RF-32 | Proprietário define o plano e a duração do trial inicial, inclusive gratuito sem fim | Must |
| RF-33 | Personificação de um usuário de tenant só com consentimento do owner ou política explícita, limitada a 1 h, com banner visível e auditoria | Should |
| RF-34 | Proprietário suspende e reativa tenants e usuários | Must |

### Assinaturas e pagamentos

| ID | Requisito | Prioridade |
|---|---|---|
| RF-40 | Tenant novo entra no trial configurado; ao fim, sem pagamento, entra em carência e depois em modo somente leitura | Must |
| RF-41 | Owner escolhe plano e paga por Pix, boleto ou cartão conforme o provedor ativo | Must |
| RF-42 | Upgrade imediato; downgrade e cancelamento no fim do período; reativação a qualquer momento | Must |
| RF-43 | Inadimplência com carência configurável, avisos por e-mail e bloqueio progressivo | Must |
| RF-44 | Webhooks verificados, idempotentes, com reprocessamento manual e reconciliação diária | Must |
| RF-45 | Módulos de pagamento adicionáveis e removíveis sem alterar o núcleo; Stripe e Asaas na primeira entrega | Must |
| RF-46 | Mercado Pago, Pagar.me e PagBank como módulos sobre a mesma interface | Should |
| RF-47 | Limites por plano aplicados no servidor (membros, clientes, armazenamento) e feature flags por plano com override por tenant | Should |
| RF-48 | Fluxo (b): owner cobra clientes com credenciais próprias criptografadas e split | Could |

### Operação, dados e conformidade

| ID | Requisito | Prioridade |
|---|---|---|
| RF-50 | E-mails transacionais com provedor substituível; Mailpit no dev; bounces registrados e endereços suprimidos | Must |
| RF-51 | Jobs em segundo plano no Postgres para e-mail, webhooks, cobrança e limpeza, sem serviço extra | Must |
| RF-52 | Log de auditoria de ações sensíveis por tenant e plataforma, sem dados pessoais em texto livre | Must |
| RF-53 | LGPD: registro de consentimento, exportação dos dados do usuário e exclusão com carência | Should |
| RF-54 | Armazenamento de arquivos por tenant com provedor substituível | Could |
| RF-55 | Notificações dentro do produto | Could |
| RF-56 | White label por tenant (logo e cores) e domínio próprio | Could |
| RF-57 | Seed cria proprietário, tenant de demonstração com equipe, clientes e plano em trial, com e-mails verificados e documentados | Must |
| RF-58 | README leva do clone ao sistema rodando, com Postgres e Mailpit em Docker, migrations e seed | Must |
| RF-59 | Repositório público com LICENSE, CONTRIBUTING, SECURITY, CHANGELOG, CI com Postgres e guia para receber atualizações do template | Must |

## Requisitos não funcionais

- **Segurança:** toda fronteira (auth, tenant, permissão, plano) é aplicada no servidor
  e tem teste; cookies `HttpOnly`, `Secure` e `SameSite=Lax`; CSRF por verificação de
  origem; CSP com nonce; rate limit em Postgres para valer com mais de uma instância;
  segredos só por variáveis de ambiente; credenciais de provedores por tenant
  criptografadas em repouso.
- **Privacidade:** dados pessoais fora de logs e de mensagens de erro; auditoria guarda
  ids, não conteúdo.
- **Portabilidade:** roda em qualquer VPS com Docker e um Postgres; nenhuma dependência
  de serviço proprietário obrigatória. Provedores de e-mail, pagamento e arquivos são
  módulos.
- **Simplicidade:** cada módulo opcional fica em uma pasta própria e some ao apagar a
  pasta e uma linha de registro.
- **Desempenho:** páginas públicas continuam com SSR e SEO; áreas autenticadas são
  client-side com TanStack Query; webhooks respondem em menos de 1 s e processam em
  job.
- **Acessibilidade e responsividade:** as três áreas funcionam em mobile, com os
  componentes shadcn/ui já adotados.
- **Idioma:** interface e e-mails em pt-BR; moeda BRL; datas em UTC no banco e
  `America/Sao_Paulo` na exibição.

## Jornadas

**Proprietário.** Roda `npm run db:seed` ou `create-admin`, entra em `/login` com o
e-mail do seed, é levado a `/admin`. Em `/admin/planos` cria o plano gratuito, define
o trial padrão como 14 dias no plano Pro. Em `/admin/tenants` vê o tenant de
demonstração em trial. Em `/admin/tenants/:id` pede personificação; o owner aprova em
`/app/configuracoes/suporte`; o proprietário entra com banner e sai em até 1 h.

**Owner.** Clica em "Começar grátis" na landing, preenche nome, e-mail e senha, vê a
tela "Confirme seu e-mail". Abre o e-mail no celular, clica no link, confirma na
página, é logado no celular. No desktop clica em "Já verifiquei, entrar", faz login,
cai em `/app/onboarding`, cadastra o nome da empresa e o CNPJ, entra em `/app` com o
trial ativo e o banner "14 dias restantes". Convida a equipe em `/app/equipe`. No fim
do trial vai a `/app/assinatura`, escolhe Pro mensal e paga por Pix.

**Colaborador.** Recebe o convite, abre `/convite/:id`, cria a conta com o e-mail do
convite, verifica o e-mail, o convite é aceito automaticamente e cai em `/app` com o
papel definido. Em `/app/configuracoes/seguranca` ativa 2FA.

**Cliente/lead.** O owner cadastra o cliente em `/app/clientes` e envia acesso. O
cliente recebe "Acesse o portal de Clínica X", clica, cai logado em `/portal`, vê
seus dados e opcionalmente define uma senha. Se já for cliente de outro tenant, ao
entrar por `/portal/login` escolhe a conta.

## Critérios de aceite

- [ ] Dado um clone limpo, quando sigo o README até `npm run dev`, então consigo entrar
      como proprietário, owner, colaborador e cliente do seed sem passo extra.
- [ ] Dado um cadastro novo, quando tento entrar antes de verificar, então recebo
      recusa genérica com opção de reenvio e nenhum dado do tenant é carregado.
- [ ] Dado um link de verificação, quando um scanner faz GET na página, então o token
      continua válido; quando eu confirmo na página, então o e-mail fica verificado e
      o mesmo link não funciona mais.
- [ ] Dado um reenvio de verificação, quando uso o link anterior, então ele é recusado.
- [ ] Dado dois tenants com dados, quando um usuário do tenant A chama qualquer
      endpoint com ids do tenant B, então recebe 404 ou lista vazia; o teste de RLS
      prova o mesmo direto no banco.
- [ ] Dado um `member` sem a permissão `customers:delete`, quando chama o endpoint de
      exclusão, então recebe 403 e o botão não aparece na interface.
- [ ] Dado um tenant em trial com fim configurado, quando o prazo termina sem
      pagamento, então entra em carência, recebe e-mail e, após a carência, fica
      somente leitura.
- [ ] Dado um webhook do Stripe ou do Asaas reenviado, quando chega pela segunda vez,
      então não altera o estado novamente e fica registrado como duplicado.
- [ ] Dado um webhook com assinatura ou token inválido, quando chega, então é
      recusado com 400 e registrado.
- [ ] Dado o proprietário personificando, quando tenta alterar cobrança ou excluir o
      tenant, então é bloqueado e a tentativa fica na auditoria.
- [ ] Dado um cliente do tenant A, quando tenta acessar `/portal` com dados do tenant
      B, então não vê nada do B.
- [ ] Dado o desenvolvimento local, quando qualquer e-mail é enviado, então aparece
      no Mailpit e nada sai para a internet.
- [ ] Dado o módulo Asaas apagado da pasta e do registro, quando rodo lint, typecheck,
      testes e build, então tudo passa.

## Riscos e dependências

- **Better Auth é jovem.** Versão 1.7.x com API ainda em movimento entre minors. Risco
  de breaking change em plugins de organização e admin. Mitigação: fixar versão
  exata, cobrir os fluxos com testes próprios e isolar a biblioteca em
  `src/lib/auth/`.
- **Token de verificação nativo.** O Better Auth gera um JWT assinado e não armazena
  o token, logo não é de uso único por si. A SPEC adiciona uma camada própria para
  uso único e invalidação. Se a camada falhar, o risco é um link antigo continuar
  válido até expirar (1 h).
- **Pix recorrente no Stripe.** Indisponível para empresas domiciliadas no Brasil
  segundo a documentação atual. Assinatura por Pix no Brasil fica com Asaas ou
  outros módulos; Stripe cobre cartão e boleto.
- **Pagar.me sem assinatura de webhook documentada.** O módulo precisa confirmar por
  consulta à API antes de aplicar qualquer evento.
- **RLS e Drizzle.** A geração de policies pelo `drizzle-kit` e o `FORCE ROW LEVEL
  SECURITY` exigem migration customizada; se der problema, a camada de aplicação
  continua valendo e o RLS entra por SQL manual.
- **Duas instâncias de auth.** Clientes separados dobram a configuração de auth. A
  SPEC usa a mesma biblioteca com tabelas e cookies distintos para não duplicar
  código.
- **Sandboxes.** Testar os cinco provedores exige cinco contas de sandbox; a
  primeira entrega cobre Stripe e Asaas.
- **Versões.** O projeto está em React Router 7.18; o React Router 8 já existe. A
  migração fica fora deste PRD para não misturar riscos.

## Premissas

- Domínio único por instalação; subdomínio e domínio próprio são módulo futuro.
- Clientes/leads têm identidade separada da equipe, com login próprio em `/portal`,
  e um mesmo e-mail pode ser cliente de vários tenants.
- O proprietário mora no mesmo app, em `/admin`, e não em um app separado.
- A área autenticada atual `/dashboard` é renomeada para `/app`.
- Moeda BRL, idioma pt-BR, sem nota fiscal.
- Trial padrão de 14 dias no plano mais completo, editável pelo proprietário.
- Carência de inadimplência padrão de 7 dias, editável.
- Clientes/leads não pagam o owner na primeira entrega.

## Perguntas em aberto

- Nome final dos papéis de plataforma (`platform_owner` e `platform_support`) e se
  haverá um terceiro só leitura. Decide: Bruno.
- Se o cadastro de cliente/lead por auto-serviço no portal fica ligado por padrão ou
  desligado até o owner ativar. Premissa: desligado.
- Ordem dos módulos seguintes: Mercado Pago, Pagar.me ou PagBank primeiro. Premissa:
  Mercado Pago.
- Se o proprietário deve poder editar os templates de e-mail pela interface ou só
  por código. Premissa: só por código nesta entrega.
