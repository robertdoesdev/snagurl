import { AdSlot } from "@/components/ad-slot";
import { Faq, getFaqItems } from "@/components/faq";
import { HowItWorks } from "@/components/how-it-works";
import { Resolver } from "@/components/resolver";
import { SourceLedger } from "@/components/source-ledger";
import { site } from "@/config/site";

export default function HomePage() {
  const faqItems = getFaqItems();

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: site.name,
      url: site.url,
      description: site.description,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ];

  return (
    <main>
      <section
        aria-labelledby="hero-heading"
        className="mx-auto w-full max-w-[920px] px-5 pb-4 pt-14 sm:px-8 sm:pt-20"
      >
        <h1
          id="hero-heading"
          className="text-balance text-center font-display text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.03em]"
        >
          Paste a link, get the file
        </h1>
        <p className="mx-auto mt-4 max-w-[52ch] text-balance text-center text-base text-muted sm:text-lg">
          Check a media link and download it when the host allows it.
        </p>
        <div className="mt-10">
          <Resolver />
        </div>
      </section>

      <SourceLedger />
      <HowItWorks />
      <AdSlot placement="secondary" />
      <Faq items={faqItems} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </main>
  );
}
