import Link from "next/link";
import { Mark } from "./motifs";

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-rule bg-obsidian" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div aria-hidden className="jali h-4 w-full opacity-[0.18]" />
      <div className="mx-auto grid max-w-[1400px] gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]" style={{ paddingLeft: "var(--gutter)", paddingRight: "var(--gutter-r)" }}>
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <Mark size={28} />
            <span className="inscription text-base">CHRONOHERITAGE</span>
          </div>
          <p className="prose-serif mt-4 text-[0.98rem] text-ivory-dim">
            A research instrument for testing whether historical architecture relates to the observable sky, with every
            measurement, source and uncertainty kept in view.
          </p>
          <p className="mt-3 text-xs text-mist">
            A close angular match identifies a candidate alignment. It is never presented as proof of intent.
          </p>
        </div>
        <FooterCol title="Research" links={[["Heritage Atlas", "/atlas"], ["Sky Explorer", "/sky"], ["Analyses", "/analysis"], ["Reports", "/reports"]]} />
        <FooterCol title="Evidence" links={[["Dataset feasibility", "/feasibility"], ["Benchmarks", "/benchmarks"], ["Workflow comparison", "/compare"], ["Evidence gates", "/gates"]]} />
        <FooterCol title="Method and account" links={[["Documentation", "/documentation"], ["Limitations", "/documentation#limitations"], ["API reference", "/api/docs"], ["Create an account", "/register"], ["Account and preferences", "/account"]]} />
      </div>
      <div className="border-t border-rule">
        <p className="mx-auto max-w-[1400px] py-4 text-2xs text-mist" style={{ paddingLeft: "var(--gutter)", paddingRight: "var(--gutter-r)" }}>
          ChronoHeritage V3.0. Ephemeris: JPL DE406. The fortress-observatory on the landing page is an original procedural
          model inspired by Rajasthani architecture in general; it depicts no real monument. Demonstration site records
          are fictional and labelled as such.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-sm text-sandstone">{title}</p>
      <ul className="mt-3 space-y-1 text-sm">
        {links.map(([label, href]) => (
          <li key={href}>
            {href.startsWith("/api") ? (
              <a className="inline-block py-1 text-ivory/85 hover:text-brass-bright" href={href}>{label}</a>
            ) : (
              <Link className="inline-block py-1 text-ivory/85 hover:text-brass-bright" href={href}>{label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
