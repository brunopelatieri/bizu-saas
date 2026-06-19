export const siteConfig = {
  name: "My Web Portal",
  description: "Portal pessoal e profissional",
  locale: "pt-BR",
  links: {
    github: "https://github.com/brunopelatieri",
    linkedin: "https://linkedin.com/in/[A-DEFINIR]",
  },
} as const;

export const navItems = [
  { href: "/", label: "Início" },
  { href: "/sobre", label: "Sobre" },
  { href: "/projetos", label: "Projetos" },
  { href: "/contato", label: "Contato" },
] as const;

export type NavItem = (typeof navItems)[number];
