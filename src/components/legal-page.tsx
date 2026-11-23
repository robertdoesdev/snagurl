import type { ReactNode } from "react";
import { site } from "@/config/site";

interface LegalPageProps {
  title: string;
  updated: string;
  children: ReactNode;
}

export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <main className="mx-auto w-full max-w-[920px] px-5 pb-8 pt-16 sm:px-8 sm:pt-24">
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-3 text-sm text-muted">Last updated {updated}</p>
      <p className="mt-6 max-w-[68ch] rounded-xl bg-sunken px-4 py-3 text-sm leading-relaxed text-muted">
        Draft for professional legal review. This text describes how SnagUrl works today, but it has not
        been reviewed by a lawyer and isn’t a substitute for legal advice. It must be reviewed before
        public launch.
      </p>
      <div className="mt-12 max-w-[68ch] space-y-10 leading-relaxed [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_p]:text-muted [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:text-muted">
        {children}
        <section>
          <h2>Contact</h2>
          {site.contactEmail !== "" ? (
            <p>
              Questions or requests about this page: {" "}
              <a className="text-ink underline underline-offset-4" href={`mailto:${site.contactEmail}`}>
                {site.contactEmail}
              </a>
              .
            </p>
          ) : (
            <p>A contact address will be published here before launch.</p>
          )}
        </section>
      </div>
    </main>
  );
}
