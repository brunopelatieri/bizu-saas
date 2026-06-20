import { AboutSection } from "@/components/landing/about-section";
import { AudienceSection } from "@/components/landing/audience-section";
import { BlogSection } from "@/components/landing/blog-section";
import { CtaSection } from "@/components/landing/cta-section";
import { FaqSection } from "@/components/landing/faq-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { StackSection } from "@/components/landing/stack-section";

export function HomePage() {
  return (
    <>
      <HeroSection />
      <AboutSection />
      <FeaturesSection />
      <HowItWorksSection />
      <StackSection />
      <AudienceSection />
      <BlogSection />
      <FaqSection />
      <CtaSection />
    </>
  );
}
