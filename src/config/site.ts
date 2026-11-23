export const site = {
  name: "SnagUrl",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://snagurl.example",
  tagline: "Paste a link, get the file",
  description:
    "SnagUrl checks a media link, shows you what is behind it and downloads the file when the host allows it. No accounts and no stored files.",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
} as const;
