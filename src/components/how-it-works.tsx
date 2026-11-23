const steps = [
  {
    title: "Paste a link",
    body: "Use a direct link to a video, audio or image file from anywhere in the internet.",
  },
  {
    title: "We check it",
    body: "SnagUrl confirms the file is public, supported and within the size limit. We wont download any closed off media.",
  },
  {
    title: "Download",
    body: "Pick a format and save the file. Nothing is stored on our servers.",
  },
] as const;

export function HowItWorks() {
  return (
    <section
      id="how"
      aria-labelledby="how-heading"
      className="mx-auto w-full max-w-[920px] px-5 pt-20 sm:px-8"
    >
      <h2 id="how-heading" className="font-display text-2xl font-semibold tracking-tight">
        How it works
      </h2>
      <ol className="mt-6 grid gap-6 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="space-y-2">
            <span
              aria-hidden="true"
              className="grid size-7 place-items-center rounded-full bg-raised text-sm font-medium text-muted ring-1 ring-line"
            >
              {index + 1}
            </span>
            <h3 className="font-display text-lg font-semibold">{step.title}</h3>
            <p className="text-[15px] leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
