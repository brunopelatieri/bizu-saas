export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  tag: string;
  readTime: string;
  date: string;
  /** ISO date para ordenação e <time>. */
  publishedAt: string;
  /** URL absoluta/relativa da imagem de capa para Open Graph. */
  cover?: string;
};

/**
 * Conteúdo do blog mantido em memória por enquanto (decisão da migração).
 * Quando o blog for para o banco, basta trocar as funções abaixo por queries
 * Drizzle dentro dos loaders — a assinatura pública (getAllPosts / getPostBySlug)
 * permanece a mesma.
 */
const posts: Post[] = [
  {
    slug: "reduzir-mensagens-de-status",
    title: "Como reduzir 80% das mensagens de status dos seus clientes",
    excerpt:
      "Comunicação proativa não é um diferencial — é uma necessidade. Veja como um portal centralizado muda a dinâmica dos seus projetos.",
    tag: "Produtividade",
    readTime: "5 min",
    date: "12 Jun 2026",
    publishedAt: "2026-06-12",
    cover: "/bizu_bru_ia_blog1.webp",
    content:
      "A pergunta mais repetida de qualquer freelancer é: \"qual o status do meu projeto?\". " +
      "Quando você centraliza o progresso em um portal, o cliente encontra a resposta sozinho — " +
      "e você recupera horas da sua semana. Neste artigo mostramos como estruturar atualizações " +
      "curtas e frequentes que constroem confiança ao longo do projeto.",
  },
  {
    slug: "precificacao-para-freelancers-2026",
    title: "Precificação para freelancers: o guia definitivo de 2026",
    excerpt:
      "Saber cobrar pelo valor real do seu trabalho começa por entender sua proposta de valor. Veja como estruturar seus planos.",
    tag: "Negócios",
    readTime: "8 min",
    date: "3 Jun 2026",
    publishedAt: "2026-06-03",
    cover: "/bizu_bru_ia_blog2.webp",
    content:
      "Precificar por hora penaliza quem é eficiente. Precificar por valor exige clareza sobre o " +
      "resultado que você entrega. Aqui detalhamos um modelo de pacotes em três níveis que " +
      "aumenta seu ticket médio sem afastar clientes sensíveis a preço.",
  },
  {
    slug: "stack-ideal-portais-de-clientes",
    title: "Stack ideal para portais de clientes em 2026",
    excerpt:
      "React, shadcn/ui, Hono e Drizzle — como essa combinação entrega uma experiência premium sem complexidade desnecessária.",
    tag: "Ferramentas",
    readTime: "6 min",
    date: "28 Mai 2026",
    publishedAt: "2026-05-28",
    cover: "/bizu_bru_ia_blog3.webp",
    content:
      "Uma boa stack é aquela que some do seu caminho. React Router em Framework Mode entrega SSR " +
      "para SEO, Hono cuida da API e Drizzle tipa o banco de ponta a ponta. " +
      "Mostramos como cada peça se encaixa em um portal de clientes real.",
  },
];

export function getAllPosts(): Post[] {
  return [...posts].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
}

export function getPostBySlug(slug: string): Post | undefined {
  return posts.find((post) => post.slug === slug);
}
