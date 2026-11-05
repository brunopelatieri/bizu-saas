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
npm run typecheck
npm run build
```

Para smoke test local de producao:

```powershell
$env:NODE_ENV="production"
$env:PORT="3000"
node build/server/index.js
```

---

