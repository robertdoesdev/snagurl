import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What SnagUrl processes when you check or download a link, what stays in your browser, and how advertising is handled.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="November 28, 2026">
      <section>
        <h2>What SnagUrl collects</h2>
        <p>
          SnagUrl has no accounts and doesn’t ask for your name, email or any profile. When you submit a
          link, the link is sent to SnagUrl’s server so it can check the file. SnagUrl doesn’t keep a
          log of the links you submit in its own database.
        </p>
      </section>
      <section>
        <h2>Temporary processing</h2>
        <p>
          To check a link, SnagUrl’s server requests it from the host. When you download, the file passes
          through the server to your browser. Files are streamed and aren’t written to disk or kept
          after the download ends.
        </p>
        <p>
          To limit abuse, SnagUrl counts requests per IP address for a short window. Depending on how
          it’s deployed, this count lives in server memory or in a shared key-value store (Upstash
          Redis) and expires automatically.
        </p>
      </section>
      <section>
        <h2>Download history on your device</h2>
        <p>
          Your recent downloads (title, source, link, size and date) are saved in your browser’s local
          storage so you can reuse them. They never leave your device. You can remove single entries or
          clear everything from the page at any time, or clear your browser’s site data.
        </p>
      </section>
      <section>
        <h2>Third-party sources</h2>
        <ul>
          <li>
            For YouTube, TikTok and X links, SnagUrl’s server sends the link to that service’s public
            embed (oEmbed) endpoint to read the title, author and thumbnail.
          </li>
          <li>
            Preview thumbnails are loaded by your browser directly from the platform’s image servers, so
            that platform can see your IP address and browser details.
          </li>
          <li>
            For direct links, the host of the file sees a request from SnagUrl’s server, not from your
            device.
          </li>
        </ul>
      </section>
      <section>
        <h2>Advertising and cookies</h2>
        <p>
          SnagUrl is intended to be supported by advertising, but no ad network is active today. SnagUrl
          itself sets no cookies and runs no analytics. If ads are turned on, they may use cookies, an
          advertising partner will be named on this page, and you will be asked for your choice before
          ads that use cookies load. SnagUrl works the same whichever you choose.
        </p>
        <p>
          Your theme choice and your ad choice, if you make one, are stored in your browser’s local
          storage.
        </p>
      </section>
      <section>
        <h2>Conversion</h2>
        <p>
          When conversion is available and you start one, a separate converter fetches the file from
          the link you gave, processes it and holds the result for about 30 minutes so you can download
          it. The converter then deletes the file. Conversion is only offered for direct links to media
          files, never for platform links.
        </p>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>
          Request counters expire within about a minute. Converted files are deleted by the converter
          within about 30 minutes, or sooner if you cancel. Everything else SnagUrl stores lives on your
          device, where you control it. Hosting providers may keep standard request logs under their own
          policies.
        </p>
      </section>
    </LegalPage>
  );
}
