import type { ReactNode, SVGProps } from "react";
import { Globe, Mail, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export type SocialPlatform =
  | "youtube"
  | "tiktok"
  | "github"
  | "repo"
  | "repo-vercel"
  | "gitlab"
  | "docker"
  | "linkedin"
  | "x"
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "email"
  | "location"
  | "site";

type BrandIconProps = SVGProps<SVGSVGElement>;

function BrandIcon({
  className,
  children,
  viewBox = "0 0 24 24",
  ...props
}: BrandIconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconYoutube(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M21.582 6.186a2.506 2.506 0 0 0-1.768-1.768C18.254 4 12 4 12 4s-6.254 0-7.814.418a2.505 2.505 0 0 0-1.768 1.768C2 7.746 2 12 2 12s0 4.254.418 5.814a2.505 2.505 0 0 0 1.768 1.768C5.746 20 12 20 12 20s6.254 0 7.814-.418a2.506 2.506 0 0 0 1.768-1.768C22 16.254 22 12 22 12s0-4.254-.418-5.814zM10 15V9l5.2 3-5.2 3z" />
    </BrandIcon>
  );
}

export function IconTiktok(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </BrandIcon>
  );
}

export function IconGithub(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.021C22 6.484 17.522 2 12 2z" />
    </BrandIcon>
  );
}

export function IconGitlab(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="m21.94 13.11-1.05-3.23a.52.52 0 0 0-.2-.27L12 2 3.31 9.61a.52.52 0 0 0-.2.27l-1.05 3.23a.74.74 0 0 0 .27.84l8.47 6.16 8.47-6.16a.74.74 0 0 0 .27-.84M12 18.5l-6.18-4.49 1.01-3.11L12 14.3l5.17-3.4 1.01 3.11z" />
    </BrandIcon>
  );
}

export function IconDocker(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M13.5 11h2.25V8.75H13.5zm-2.25 0h2.25V8.75h-2.25zm-2.25 0H11V8.75H8.75zm-2.25 0H8.75V8.75H6.5zm13.5 1.5a5.23 5.23 0 0 1-1.65 2.18 5.5 5.5 0 0 1-3.9 1.57H6.5A6.5 6.5 0 0 1 .25 9.25v-.5h1.5a4.75 4.75 0 0 0 4.5-3.5H7.5a3.25 3.25 0 0 1 3.1 2.25h2.15A2.75 2.75 0 0 0 15.5 4.5h1.75v2.25h1.5a4 4 0 0 1 3.85 3h1.65v3.75z" />
    </BrandIcon>
  );
}

export function IconLinkedin(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </BrandIcon>
  );
}

export function IconX(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </BrandIcon>
  );
}

export function IconInstagram(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </BrandIcon>
  );
}

export function IconFacebook(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </BrandIcon>
  );
}

export function IconWhatsapp(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </BrandIcon>
  );
}

type SocialIconProps = {
  platform: SocialPlatform;
  className?: string;
};

export function SocialIcon({ platform, className }: SocialIconProps) {
  switch (platform) {
    case "youtube":
      return <IconYoutube className={className} />;
    case "tiktok":
      return <IconTiktok className={className} />;
    case "github":
    case "repo":
    case "repo-vercel":
      return <IconGithub className={className} />;
    case "gitlab":
      return <IconGitlab className={className} />;
    case "docker":
      return <IconDocker className={className} />;
    case "linkedin":
      return <IconLinkedin className={className} />;
    case "x":
      return <IconX className={className} />;
    case "instagram":
      return <IconInstagram className={className} />;
    case "facebook":
      return <IconFacebook className={className} />;
    case "whatsapp":
      return <IconWhatsapp className={className} />;
    case "email":
      return <Mail className={cn("size-4 shrink-0", className)} aria-hidden="true" />;
    case "location":
      return <MapPin className={cn("size-4 shrink-0", className)} aria-hidden="true" />;
    case "site":
      return <Globe className={cn("size-4 shrink-0", className)} aria-hidden="true" />;
    default:
      return <Globe className={cn("size-4 shrink-0", className)} aria-hidden="true" />;
  }
}

export function resolveSocialPlatform(label: string, href: string): SocialPlatform {
  const normalizedLabel = label.toLowerCase();
  const normalizedHref = href.toLowerCase();

  if (normalizedHref.startsWith("mailto:")) return "email";
  if (normalizedLabel.includes("whatsapp") || normalizedHref.includes("wa.me")) {
    return "whatsapp";
  }
  if (normalizedLabel.includes("youtube") || normalizedHref.includes("youtube.com")) {
    return "youtube";
  }
  if (normalizedLabel.includes("tiktok") || normalizedHref.includes("tiktok.com")) {
    return "tiktok";
  }
  if (normalizedLabel.includes("linkedin") || normalizedHref.includes("linkedin.com")) {
    return "linkedin";
  }
  if (
    normalizedLabel === "x" ||
    normalizedHref.includes("x.com") ||
    normalizedHref.includes("twitter.com")
  ) {
    return "x";
  }
  if (normalizedLabel.includes("instagram") || normalizedHref.includes("instagram.com")) {
    return "instagram";
  }
  if (normalizedLabel.includes("facebook") || normalizedHref.includes("facebook.com")) {
    return "facebook";
  }
  if (normalizedLabel.includes("gitlab") || normalizedHref.includes("gitlab.com")) {
    return "gitlab";
  }
  if (normalizedLabel.includes("docker") || normalizedHref.includes("hub.docker.com")) {
    return "docker";
  }
  if (normalizedLabel.includes("e-mail") || normalizedLabel.includes("email")) {
    return "email";
  }
  if (normalizedLabel.includes("local") || normalizedLabel.includes("map")) {
    return "location";
  }
  if (normalizedLabel.includes("repo vercel") || normalizedHref.includes("bizu-saas-vercel")) {
    return "repo-vercel";
  }
  if (normalizedLabel.includes("repositório") || normalizedHref.includes("bizu-saas")) {
    return "repo";
  }
  if (normalizedLabel.includes("github") || normalizedHref.includes("github.com")) {
    return "github";
  }
  if (normalizedLabel.includes("site") || normalizedHref.includes("brunogoulart")) {
    return "site";
  }

  return "site";
}
