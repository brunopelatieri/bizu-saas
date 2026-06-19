import type { ReactNode } from "react";

type PageHeroProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function PageHero({ eyebrow, title, description, actions }: PageHeroProps) {
  return (
    <section className="border-b border-border bg-gradient-to-b from-card to-background px-6 py-16">
      <div className="mx-auto max-w-5xl">
        {eyebrow ? (
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {description}
        </p>
        {actions ? <div className="mt-8 flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
