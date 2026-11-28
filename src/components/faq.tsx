import { formatBytes } from "@/lib/media/format";
import { limits } from "@/lib/security/config";

export interface FaqItem {
  question: string;
  answer: string;
}

export function getFaqItems(): FaqItem[] {
  return [
    {
      question: "Which links work?",
      answer:
        "Direct links to media files: MP4, WebM, QuickTime, MP3, M4A, AAC, Ogg, WAV, FLAC, JPEG, PNG, GIF, WebP and AVIF.",
    },
    {
      question: "Can I download from YouTube, TikTok or X?",
      answer:
        "No. SnagUrl shows a preview for these links, such as the title and thumbnail, but doesn’t offer a download. YouTube’s developer policies prohibit downloading its videos without written approval, and the public embed services of TikTok and X provide previews only.",
    },
    {
      question: "What about Instagram, Facebook and Pinterest?",
      answer:
        "They aren’t available. Meta’s public embed service returns only embed code, with no thumbnail or media file. Pinterest provides pin data through an API that needs an approved app and the account owner’s sign-in. Neither offers a permitted way to fetch the media from a link alone.",
    },
    {
      question: "Can I download private or protected content?",
      answer:
        "No. SnagUrl doesn’t bypass logins, DRM or access controls. It only reads files that anyone can request on the public internet.",
    },
    {
      question: "Are my files or links stored?",
      answer:
        "Direct downloads stream to your browser and aren’t saved on our servers. When conversion is available, the converter fetches your file, keeps the result for about 30 minutes and then deletes it. Your recent downloads stay in your own browser, and you can clear them at any time.",
    },
    {
      question: "Is there a size limit?",
      answer: `Yes. Files larger than ${formatBytes(limits.maxFileBytes)} are declined.`,
    },
  ];
}

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="mx-auto w-full max-w-[920px] px-5 pt-20 sm:px-8"
    >
      <h2 id="faq-heading" className="font-display text-2xl font-semibold tracking-tight">
        FAQ
      </h2>
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <details key={item.question} className="group rounded-2xl border border-line bg-raised">
            <summary className="flex cursor-pointer items-center justify-between gap-6 px-5 py-4 text-left font-medium">
              {item.question}
              <span
                aria-hidden="true"
                className="relative size-3 shrink-0 text-muted before:absolute before:left-0 before:top-1/2 before:h-px before:w-full before:bg-current after:absolute after:left-1/2 after:top-0 after:h-full after:w-px after:bg-current after:transition-transform group-open:after:scale-y-0"
              />
            </summary>
            <p className="max-w-[62ch] px-5 pb-5 leading-relaxed text-muted">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
