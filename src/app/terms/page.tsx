import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "The rules for using SnagUrl, including copyright and authorized downloading.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="November 20, 2026">
      <section>
        <h2>Using SnagUrl</h2>
        <p>
          SnagUrl helps you check and download media files from publicly accessible links. By using it
          you agree to these terms.
        </p>
      </section>
      <section>
        <h2>Authorized downloading and copyright</h2>
        <p>
          You’re responsible for having the right to download and use each file. Download content you
          own, content licensed for reuse, or content the owner has allowed you to save. SnagUrl doesn’t
          grant any rights to the files it handles, and downloading a file doesn’t make it free to copy,
          share or republish.
        </p>
        <p>
          SnagUrl doesn’t offer downloads from platforms whose terms prohibit them. For some platforms it
          only shows a preview and links to the original.
        </p>
      </section>
      <section>
        <h2>What you can’t do</h2>
        <ul>
          <li>Bypass logins, paywalls, DRM or any other access control.</li>
          <li>Use SnagUrl to reach private networks, internal services or other people’s systems.</li>
          <li>Send automated or excessive traffic, or try to get around rate limits or size limits.</li>
          <li>Download or distribute content you don’t have the right to copy.</li>
        </ul>
      </section>
      <section>
        <h2>Third-party content and providers</h2>
        <p>
          Files and previews come from hosts and platforms SnagUrl doesn’t control. SnagUrl isn’t
          responsible for their content, accuracy or availability, and a download can fail if the host
          changes or removes the file.
        </p>
      </section>
      <section>
        <h2>Availability and limits</h2>
        <p>
          SnagUrl is provided as is, without warranties. Supported sources, file types, size limits and
          rate limits can change. SnagUrl may refuse or stop requests that look abusive.
        </p>
      </section>
      <section>
        <h2>Copyright complaints</h2>
        <p>
          SnagUrl doesn’t host or store files. If you believe a link is being used to infringe your
          rights, contact the address below and include the link and a description of your rights.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>These terms may be updated. The date at the top shows the latest version.</p>
      </section>
    </LegalPage>
  );
}
