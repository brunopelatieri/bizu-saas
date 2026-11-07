# Política de segurança

## Como reportar uma vulnerabilidade

Não abra issue pública. Use o canal privado do GitHub: aba **Security** do repositório, botão
**Report a vulnerability** (relatório privado de vulnerabilidade). O canal precisa estar
habilitado em *Settings > Code security > Private vulnerability reporting*; se o botão não
aparecer, abra uma issue pública **sem detalhes técnicos** pedindo um contato privado.

Inclua o que for possível: rota ou tela afetada, passos para reproduzir, impacto e versão ou commit.
Não acesse dados de terceiros nem faça testes que degradem o serviço de alguém.

## Prazos

| Etapa | Prazo |
|---|---|
| Confirmação de recebimento e avaliação inicial | até 5 dias úteis |
| Correção de severidade alta ou crítica | meta de 30 dias, com mitigação antes quando houver |
| Correção de severidade média ou baixa | na próxima versão menor |
| Aviso público e crédito a quem reportou, se a pessoa quiser | depois da correção, com tempo para atualizar |

Pedimos divulgação coordenada: não publique detalhes antes da correção ou do prazo acima.

## Versões cobertas

O projeto é um ponto de partida: só a versão mais recente (a branch `main` e a última tag
`vX.Y.Z`) recebe correções. Quem derivou um produto dele deve acompanhar os avisos, ler a seção
"Migração" do [CHANGELOG](CHANGELOG.md) e aplicar as correções no próprio código
(veja `docs/context/atualizar-template.md`).

| Versão | Suportada |
|---|---|
| `main` e a última `0.x` | sim |
| Versões `0.x` anteriores | não: atualize para a última |

Enquanto o projeto estiver em `0.x`, uma correção de segurança pode exigir mudança incompatível,
sempre descrita no CHANGELOG.

## O que está no escopo

Falhas no código deste repositório: autenticação e sessão (equipe e portal), isolamento entre
tenants (RLS), permissões, webhooks e cobrança, personificação, criptografia de credenciais,
CSRF/CSP/rate limit, exportação e exclusão de dados (LGPD) e o compose de produção.

Fora do escopo: vulnerabilidade em dependência sem caminho de exploração aqui (acompanhe pelo
Dependabot), ataque que exige acesso físico ou root ao servidor, e engenharia social.

## Quem derivou um produto deste template

- O canal acima é do template. Troque-o pelo do seu produto antes de publicar.
- Gere segredos novos (`BETTER_AUTH_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `AUDIT_SALT`); os de exemplo
  são recusados em produção.
- Ative o 2FA da conta de proprietário da plataforma: sem ele, `/admin` responde 403 em produção.
- O modelo de ameaças e os controles estão em `docs/specs/saas-foundation/spec-seguranca.md` e
  `docs/context/tech/26-seguranca.md`.
