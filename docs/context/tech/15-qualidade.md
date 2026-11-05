# Qualidade e validação

- **Escopo:** Verificações realizadas e comandos antes de cada entrega.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** não declarado

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L689-718 -->
## 15. Qualidade e Validacao

Verificacoes recentes realizadas:

- `npm run typecheck` passou.
- Smoke test de producao passou anteriormente:
  - `/api/health`
  - `/`
  - `/blog`
  - `/blog/reduzir-mensagens-de-status`
  - `/login`
  - `/dashboard` sem auth, confirmando shell sem dados sensiveis.

Comandos recomendados antes de cada entrega:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

O CI em `.github/workflows/ci.yml` roda os mesmos comandos em push para `main` e em
pull requests. Os testes ficam ao lado do codigo (`src/**/*.test.ts`); hoje cobrem a
autenticacao e as protecoes da API.

Para smoke test local de producao:

```powershell
$env:NODE_ENV="production"
$env:PORT="3000"
node build/server/index.js
```

---

