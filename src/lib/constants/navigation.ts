export const siteConfig = {
  name: "Bizu Starter",
  description:
    "Ponto de partida para sites, portais e sistemas pequenos e médios, com login, dashboard, Supabase Auth e Drizzle.",
  locale: "pt-BR",
  url: "https://bizu.bru.ia.br",
  logo: "/bizu_bru_ia.png",
  favicon: "/favicon.ico",
  screenshot: "/bizu_bru_ia_screenshot.webp",
  author: {
    name: "Bruno Pelatieri Goulart",
    role: "Enterprise Automation Architect • AI • DevOps • n8n Specialist",
    email: "brunopelatieri@gmail.com",
    phone: "+55 (19) 99249-6598",
    photo: "/bruno_pelatieri_goulart_bizu_bru_ia.webp",
  },
  links: {
    demo: "https://bizu.bru.ia.br",
    repo: "https://github.com/brunopelatieri/bizu-starter",
    repoVercel: "https://github.com/brunopelatieri/bizu-saas-vercel",
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

export type SocialPlatform =
  | "github"
  | "repo"
  | "repo-vercel"
  | "linkedin"
  | "site"
  | "youtube"
  | "x"
  | "instagram"
  | "tiktok"
  | "whatsapp"
  | "email";

export type SocialLinkItem = {
  label: string;
  href: string;
  platform: SocialPlatform;
};

export const socialLinks: readonly SocialLinkItem[] = [
  { label: "GitHub", href: siteConfig.links.github, platform: "github" },
  { label: "Repositório", href: siteConfig.links.repo, platform: "repo" },
  { label: "Repo Vercel", href: siteConfig.links.repoVercel, platform: "repo-vercel" },
  { label: "LinkedIn", href: siteConfig.links.linkedin, platform: "linkedin" },
  { label: "Site", href: siteConfig.links.site, platform: "site" },
  { label: "YouTube", href: siteConfig.links.youtube, platform: "youtube" },
  { label: "X", href: siteConfig.links.x, platform: "x" },
  { label: "Instagram", href: siteConfig.links.instagram, platform: "instagram" },
  { label: "TikTok", href: siteConfig.links.tiktok, platform: "tiktok" },
  { label: "WhatsApp", href: siteConfig.links.whatsapp, platform: "whatsapp" },
];

export const contactChannels: readonly SocialLinkItem[] = [
  { label: "WhatsApp", href: siteConfig.links.whatsapp, platform: "whatsapp" },
  { label: "E-mail", href: `mailto:${siteConfig.author.email}`, platform: "email" },
  { label: "Site", href: siteConfig.links.site, platform: "site" },
  { label: "LinkedIn", href: siteConfig.links.linkedin, platform: "linkedin" },
  { label: "GitHub", href: siteConfig.links.github, platform: "github" },
  { label: "Repositório", href: siteConfig.links.repo, platform: "repo" },
  { label: "Repo Vercel", href: siteConfig.links.repoVercel, platform: "repo-vercel" },
  { label: "YouTube", href: siteConfig.links.youtube, platform: "youtube" },
  { label: "X", href: siteConfig.links.x, platform: "x" },
  { label: "Instagram", href: siteConfig.links.instagram, platform: "instagram" },
  { label: "TikTok", href: siteConfig.links.tiktok, platform: "tiktok" },
];

export const contactChannelValues: Record<string, string> = {
  WhatsApp: siteConfig.author.phone,
  "E-mail": siteConfig.author.email,
  Site: "brunogoulart.com.br",
  LinkedIn: "in/bruno-pelatieri-goulart",
  GitHub: "@brunopelatieri",
  Repositório: "brunopelatieri/bizu-starter",
  "Repo Vercel": "brunopelatieri/bizu-saas-vercel",
  YouTube: "@devgalactico",
  X: "@brunopelatieri",
  Instagram: "@brunopelatieri",
  TikTok: "@brunopelatieri",
};
