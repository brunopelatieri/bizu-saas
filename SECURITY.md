# Política de segurança

## Como reportar uma vulnerabilidade

Não abra issue pública. Use o canal privado do GitHub: aba **Security** do repositório, botão
**Report a vulnerability**.

Inclua o que for possível: rota ou tela afetada, passos para reproduzir, impacto e versão ou commit.
Não acesse dados de terceiros nem faça testes que degradem o serviço de alguém.

Respondemos em até 5 dias úteis, com a avaliação inicial e o próximo passo. Depois da correção,
publicamos o aviso e damos o crédito a quem reportou, se a pessoa quiser.

## Versões cobertas

O projeto é um ponto de partida: só a branch `main` recebe correções. Quem derivou um produto dele
deve acompanhar os avisos e aplicar as correções no próprio código.

## Quem derivou um produto deste template

- O canal acima é do template. Troque-o pelo do seu produto antes de publicar.
- Gere segredos novos (`BETTER_AUTH_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `AUDIT_SALT`); os de exemplo
  são recusados em produção.
- O modelo de ameaças e os controles estão em `docs/specs/saas-foundation/spec-seguranca.md` e
  `docs/context/tech/26-seguranca.md`.
