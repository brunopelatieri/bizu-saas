export const siteConfig = {
  name: "Bizu SaaS",
  description:
    "Boilerplate full-stack para criar SaaS, portais e sistemas web rápido, com metodologia de AI Software Engineering.",
  locale: "pt-BR",
  url: "https://bizu.bru.ia.br",
  author: {
    name: "Bruno Pelatieri Goulart",
    role: "Enterprise Automation Architect • AI • DevOps • n8n Specialist",
    email: "brunopelatieri@gmail.com",
    phone: "+55 (19) 99249-6598",
  },
  links: {
    demo: "https://bizu.bru.ia.br",
    repo: "https://github.com/brunopelatieri/bizu-saas",
    github: "https://github.com/brunopelatieri",
    site: "https://brunogoulart.com.br",
    linkedin: "https://www.linkedin.com/in/bruno-pelatieri-goulart/",
    youtube: "https://www.youtube.com/@devgalactico",
    x: "https://x.com/brunopelatieri",
    instagram: "https://www.instagram.com/brunopelatieri/",
    tiktok: "https://www.tiktok.com/@brunopelatieri",
    whatsapp: "https://wa.me/5519992496598",
  },
} as const;

export const navItems = [
  { href: "/", label: "Início" },
  { href: "/sobre", label: "Sobre" },
  { href: "/projetos", label: "Projetos" },
  { href: "/blog", label: "Blog" },
  { href: "/contato", label: "Contato" },
] as const;

export type NavItem = (typeof navItems)[number];

export const socialLinks = [
  { label: "GitHub", href: siteConfig.links.github },
  { label: "Repositório", href: siteConfig.links.repo },
  { label: "LinkedIn", href: siteConfig.links.linkedin },
  { label: "Site", href: siteConfig.links.site },
  { label: "YouTube", href: siteConfig.links.youtube },
  { label: "X", href: siteConfig.links.x },
  { label: "Instagram", href: siteConfig.links.instagram },
  { label: "TikTok", href: siteConfig.links.tiktok },
  { label: "WhatsApp", href: siteConfig.links.whatsapp },
] as const;
