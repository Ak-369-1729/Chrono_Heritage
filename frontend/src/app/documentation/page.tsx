import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { HorizonDemo, MonteCarloDemo, ResidualDemo } from "@/components/docs/Demos";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Methodology and documentation" };

const TOC = [
  ["glossary", "Definitions"],
  ["conventions", "Coordinates and orientation conventions"],
  ["astronomy", "Astronomy calculations"],
  ["chronology", "Historical date uncertainty"],
  ["horizon", "Horizon correction"],
  ["residuals", "Circular angular residuals"],
  ["monte-carlo", "Monte Carlo propagation"],
  ["null-models", "Null-model selection"],
  ["multiple-comparisons", "Multiple-comparison corrections"],
  ["reproducibility", "Reproducibility"],
  ["benchmarks", "Benchmark methodology"],
  ["tiers", "Product tiers and evidence gates"],
  ["assumptions", "Default assumptions"],
  ["limitations", "Scientific limitations"],
  ["references", "References"],
] as const;

const GLOSSARY: [string, string][] = [
  ["Azimuth", "Horizontal direction in degrees, clockwise from true north (0° north, 90° east)."],
  ["Axis mode", "Whether a measured line faces one way (directed) or is an undirected line compared modulo 180° (bidirectional)."],
  ["North reference", "The north a bearing was measured against: true, astronomical, magnetic or grid. Unspecified blocks analysis."],
  ["Residual", "The signed angle between the measured axis and the predicted direction of an astronomical event."],
  ["Candidate alignment", "A residual small enough to be consistent with a stated hypothesis under stated assumptions. Not evidence of intent."],
  ["First gleam (upper limb)", "The moment the top edge of the Sun's disc clears the horizon; the platform's default event definition."],
  ["Refraction", "The bending of light by the atmosphere, which lifts objects near the horizon by about half a degree."],
  ["ΔT", "The difference between uniform time (TT) and Earth-rotation time (UT1); uncertain for ancient dates."],
  ["Provenance completeness", "Share of documented fields that have a source. Measures documentation, not correctness."],
  ["Convention compatibility", "Whether two records were measured and dated in ways that allow comparison."],
  ["Null model", "The baseline distribution of orientations used to judge how unusual a cross-site pattern is."],
  ["Evidence gate", "A formal checkpoint that passes only on recorded evidence, evaluated on the server."],
  ["Illustrative record", "A fictional demonstration record. Labelled everywhere; never counted as evidence."],
  ["Blocked benchmark", "A test that could not be run because a reference or input was unavailable. Never shown as passed."],
];

const REFERENCES = [
  "Astropy Collaboration (2022). The Astropy Project: sustaining and growing a community-oriented open-source project and the latest major release (v5.0) of the core package. The Astrophysical Journal, 935, 167.",
  "Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate: a practical and powerful approach to multiple testing. Journal of the Royal Statistical Society B, 57(1), 289–300.",
  "Bennett, G. G. (1982). The calculation of astronomical refraction in marine navigation. Journal of Navigation, 35(2), 255–259.",
  "Fisher, N. I. (1993). Statistical Analysis of Circular Data. Cambridge University Press.",
  "Holm, S. (1979). A simple sequentially rejective multiple test procedure. Scandinavian Journal of Statistics, 6(2), 65–70.",
  "Laskar, J. (1986). Secular terms of classical planetary theories using the results of general relativity. Astronomy and Astrophysics, 157, 59–70.",
  "Meeus, J. (1998). Astronomical Algorithms (2nd ed.). Willmann-Bell.",
  "Morrison, L. V., & Stephenson, F. R. (2004). Historical values of the Earth's clock error ΔT and the calculation of eclipses. Journal for the History of Astronomy, 35(3), 327–336.",
  "Phipson, B., & Smyth, G. K. (2010). Permutation p-values should never be zero. Statistical Applications in Genetics and Molecular Biology, 9(1), Article 39.",
  "Rhodes, B. (2019). Skyfield: High precision research-grade positions for planets and Earth satellites generator. Astrophysics Source Code Library, ascl:1907.024.",
  "Standish, E. M. (1998). JPL Planetary and Lunar Ephemerides, DE405/LE405. JPL Interoffice Memorandum 312.F-98-048.",
  "Westfall, P. H., & Young, S. S. (1993). Resampling-Based Multiple Testing. Wiley.",
];

function TocList() {
  return (
    <ol className="mt-2 space-y-1 text-sm lg:mt-0">
      {TOC.map(([id, t], i) => (
        <li key={id}><a href={`#${id}`} className="grid grid-cols-[1.8rem_1fr] py-1 text-ivory-dim hover:text-brass-bright"><span className="num text-mist">{i + 1}</span>{t}</a></li>
      ))}
    </ol>
  );
}

function S({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="rule-t scroll-mt-20 pt-8">
      <h2 id={`${id}-h`} className="heading text-[1.9rem]">{title}</h2>
      <div className="prose-serif mt-4 max-w-[68ch] space-y-4 text-[1.04rem] text-ivory/90 [&_code]:font-sans [&_code]:text-[0.92em] [&_code]:text-brass-bright [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-ivory">
        {children}
      </div>
    </section>
  );
}

const Eq = ({ children }: { children: ReactNode }) => (
  <p className="num my-4 overflow-x-auto border-l-2 border-brass/60 bg-indigo/60 px-4 py-3 font-sans text-[0.98rem] text-ivory">{children}</p>
);

export default function DocsPage() {
  return (
    <main className="chamber">
      <PageHeader title="Methodology"
        lede="How ChronoHeritage turns a measured axis and a sourced date range into a result that someone else can check, and the limits on what that result can mean." />
      <div className="grid gap-12 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <details className="niche p-3 lg:hidden">
            <summary className="cursor-pointer text-sm text-ivory">Contents</summary>
            <TocList />
          </details>
          <div className="hidden lg:block"><TocList /></div>
        </nav>
        <article className="min-w-0 space-y-14">
          <S id="glossary" title="Definitions">
            <dl className="grid gap-x-8 gap-y-3 font-sans text-[0.95rem] sm:grid-cols-2">
              {GLOSSARY.map(([t, d]) => (
                <div key={t} className="border-b border-rule pb-2">
                  <dt className="font-medium text-ivory">{t}</dt>
                  <dd className="mt-0.5 text-ivory-dim">{d}</dd>
                </div>
              ))}
            </dl>
          </S>

          <S id="conventions" title="Coordinates and orientation conventions">
            <p>Azimuths are degrees measured clockwise from <strong>true (geodetic) north</strong> at the site, in the topocentric horizon frame. Coordinates are WGS84 latitude and longitude with an explicit CRS for every record.</p>
            <p>A bearing is meaningless without its <strong>north reference</strong>. True and astronomically determined north are used directly. A magnetic bearing is converted only with a documented declination for the survey date and place (<code>true = magnetic + declination</code>, east positive); a grid bearing only with its projected CRS, from which the meridian convergence is computed (<code>true = grid + γ</code>). An unspecified north reference blocks analysis instead of being guessed.</p>
            <p>The <strong>axis mode</strong> is stored with each measurement. A directed axis faces one way, such as a doorway looking out. A bidirectional axis is an undirected line, such as a stone row, and is compared modulo 180°. The mode is never inferred from the type of site.</p>
            <p>Raw values are immutable. Unit conversions and north-reference corrections are recorded as explicit transformation steps, and analyses show raw, transformed and used values side by side.</p>
            <p>Years use astronomical numbering: year 0 is 1 BCE and −2499 is 2500 BCE. Calendar dates state whether they are Julian or proleptic Gregorian.</p>
          </S>

          <S id="astronomy" title="Astronomy calculations">
            <p>The production engine is <strong>Skyfield</strong> driven by JPL&apos;s <strong>DE406</strong> long-span ephemeris, which covers −3000 to +3000. DE406 is distributed as Chebyshev coefficients; ChronoHeritage evaluates them directly and hands Skyfield the resulting vectors, so all reductions (light time, aberration, gravitational deflection, IAU 2006/2000A precession–nutation, Earth rotation through ΔT, topocentric parallax) are Skyfield&apos;s own. The adapter agrees with Skyfield&apos;s SPK reader on DE421 to about a kilometre.</p>
            <p>Solstices and equinoxes are the instants when the Sun&apos;s apparent ecliptic longitude reaches 90°, 270°, 0° or 180°. The rise or set nearest that instant is found by root-finding on the airless altitude of the Sun against the event altitude:</p>
            <Eq>h<sub>event</sub> = h<sub>horizon</sub> − R(h<sub>horizon</sub>) ∓ s</Eq>
            <p>where <code>R</code> is refraction for an object seen at the horizon altitude (Bennett 1982, scaled for pressure and temperature) and <code>s</code> is the solar semidiameter, subtracted for first gleam, omitted for the centre and added for a full disc. Refraction near the horizon is genuinely uncertain, so every analysis reports a sensitivity row for no refraction and for cold and hot atmospheres.</p>
            <p>Unsupported targets, including lunar standstills, heliacal risings and cross-quarter days, are listed but disabled until they have a benchmarked definition.</p>
          </S>

          <S id="chronology" title="Historical date uncertainty">
            <p>A chronology is a sourced interval with a basis (radiocarbon, epigraphic, stylistic) and a sampling model. <strong>Uniform</strong> sampling is used when only bounds are known; <strong>normal</strong> sampling, truncated to the documented range, only when the source reports a central value and an error. A range is never collapsed silently to its midpoint.</p>
            <p>Because the Sun&apos;s solstitial declination equals the obliquity of the ecliptic, which changes by about 0.47″ a year, predictions are computed on a grid of whole years across the range and interpolated for sampling. The interpolation error is measured on every run.</p>
            <p>A date is <strong>never inferred</strong> from the alignment under test and then reused as evidence for that alignment. Dates come only from the chronology record.</p>
          </S>

          <S id="horizon" title="Horizon correction">
            <p>The visible horizon decides where the Sun first appears. A horizon record is either <strong>measured</strong> in the field, <strong>derived from a DEM</strong> with its resolution stated, or an explicit declaration that <strong>no profile exists</strong>. Profiles are interpolated periodically in azimuth; if the event falls in a gap the analysis says so. Without a profile the flat 0° horizon is used and reported as an assumption.</p>
            <HorizonDemo />
            <p>When a profile states an altitude uncertainty, its effect is propagated through a linearised sensitivity dA/dh measured on the actual configuration.</p>
          </S>

          <S id="residuals" title="Circular angular residuals">
            <p>For a directed axis with azimuth <code>a</code> and a prediction <code>b</code>:</p>
            <Eq>Δ = ((a − b + 180) mod 360) − 180, in [−180°, 180°)</Eq>
            <p>For an undirected axis the comparison is modulo 180°, giving a residual in [−90°, 90°), and the analysis records which end of the line was compared.</p>
            <ResidualDemo />
          </S>

          <S id="monte-carlo" title="Monte Carlo propagation">
            <p>Each single-site analysis samples the documented orientation uncertainty, the chronology model and, where stated, the horizon altitude uncertainty, and computes the residual for every draw. Results are medians with 68% and 95% central intervals, and the share of draws within stated residual windows.</p>
            <p>That share is <strong>descriptive</strong>. It is not the probability that the builders intended the alignment and it is not a p-value. A single site with a single pre-specified target has no null model, so single-site analyses never report p-values.</p>
            <p>If a source gives no orientation uncertainty, that component is not propagated and the analysis shows a separate sweep over assumed values, labelled as assumptions.</p>
            <MonteCarloDemo />
          </S>

          <S id="null-models" title="Null-model selection">
            <p>Cross-site inference asks how unusual an observed statistic would be if orientations were unrelated to the target. The answer depends entirely on the baseline, so the null model is a scientific decision recorded with its justification and approved by a domain reviewer.</p>
            <ul>
              <li><strong>Empirical reference</strong>: orientations resampled from a declared reference population of the same tradition, smoothed with a von Mises kernel, stratified by site type or region.</li>
              <li><strong>Sector-uniform</strong>: uniform only within the sector a documented architectural convention permits, per stratum.</li>
              <li><strong>Uniform circular</strong>: available only with a written justification and always flagged. It is never the default, because real buildings rarely face every direction equally.</li>
            </ul>
            <p>p-values use the finite-simulation estimator (k + 1)/(N + 1), with the seed and number of simulations recorded, and are always reported with an effect size and an interval for the observed statistic.</p>
          </S>

          <S id="multiple-comparisons" title="Multiple-comparison corrections">
            <p>Trying several targets, date windows or subsets inflates the chance of a striking match. The whole search space is recorded, not just the best result, and a family of tests is corrected with Holm–Bonferroni, Benjamini–Hochberg, or a single-step max-statistic procedure built on shared null simulations so that dependence between tests is preserved. A family of more than one test without a correction is refused.</p>
          </S>

          <S id="reproducibility" title="Reproducibility">
            <p>Each analysis stores an immutable snapshot of every input (site, raw and transformed orientation, chronology, horizon samples, full source citations, provenance score), the parameters, the software versions and the random seed, and a SHA-256 hash of all of it. Editing a site never changes an existing analysis. A rerun creates a new analysis that points to its parent and reports whether the inputs changed; with the same inputs and seed the output is identical.</p>
            <p>Reports carry the same information in PDF, CSV and JSON, each with a checksum.</p>
          </S>

          <S id="benchmarks" title="Benchmark methodology">
            <p>The engine is never its own reference. A frozen, hashed suite of fixed cases, independent of the site registry, compares it with:</p>
            <ul>
              <li><strong>JPL Horizons</strong> for modern positions: airless apparent topocentric azimuth and elevation at TT instants, tolerance 0.10°.</li>
              <li><strong>Two independent historical paths</strong>: Astropy/ERFA with its analytic ephemeris (independent ephemeris, shared IAU precession model) and the Laskar (1986) obliquity with closed-form spherical astronomy (independent ephemeris and precession). Both must agree within 0.25°.</li>
              <li>Synthetic horizons, bearing wraparound, seeded reproducibility and refusal of missing inputs; and an independent recalculation of a published case.</li>
            </ul>
            <p>Tolerances are frozen before any comparison. A reference that cannot be reached makes a case <strong>blocked</strong>, never passed, and failed cases cannot be relabelled without a new suite version. See the <Link className="inline" href="/benchmarks">current results</Link>.</p>
          </S>

          <S id="tiers" title="Product tiers and evidence gates">
            <p><strong>Tier 1, the published-case-study prototype</strong>, needs at least three fully provenance-qualified sites and offers single-site residual analysis with uncertainty. <strong>Tier 2, the cross-site statistical platform</strong>, needs 15–20 qualified and reviewed sites, a dataset compatibility of at least 0.85 with no unresolved critical mismatch, a passed benchmark gate and an approved null model. The move between tiers is a formal gate checked on the server, not a gradually unlocked feature. Machine learning is omitted from this version. See the <Link className="inline" href="/gates">evidence gates</Link>.</p>
          </S>

          <S id="assumptions" title="Default assumptions">
            <p>Every default below is shown in the inputs of each calculation and can be changed. None is applied silently.</p>
            <ul>
              <li><strong>Horizon:</strong> a flat 0° apparent horizon when a site has no profile, reported as an assumption.</li>
              <li><strong>Atmosphere:</strong> Bennett (1982) refraction at 1010 hPa and 10 °C, with sensitivity rows for no refraction and for cold and hot air.</li>
              <li><strong>Event:</strong> first gleam of the upper limb for rising, last gleam for setting.</li>
              <li><strong>Equinox:</strong> the astronomical instant (apparent ecliptic longitude 0° or 180°).</li>
              <li><strong>Calendar:</strong> stated dates are Julian unless the record says proleptic Gregorian.</li>
            </ul>
          </S>

          <S id="limitations" title="Scientific limitations">
            <ul>
              <li>A small residual identifies a candidate alignment consistent with a hypothesis under stated assumptions. It is never proof that anyone intended it.</li>
              <li>Provenance completeness measures documentation, not whether the documented values are right.</li>
              <li>Refraction near the horizon varies with weather; extreme inversions exceed the sensitivity range shown.</li>
              <li>DE406 limits calculations to −3000 to +3000. Older chronologies are refused rather than truncated.</li>
              <li>Equinox definitions differ (astronomical instant, equilux, midpoint between solstices) by up to about two days; analyses use the astronomical instant and say so.</li>
              <li>Human review certifies the data-quality process, not historical intent. Authors remain responsible for interpretation.</li>
            </ul>
          </S>

          <S id="references" title="References">
            <p>Works the methods above rely on. Software versions used by each calculation are recorded with its results.</p>
            <ol className="space-y-2 font-sans text-[0.92rem] text-ivory-dim">
              {REFERENCES.map((r) => <li key={r} className="!list-decimal">{r}</li>)}
            </ol>
          </S>
        </article>
      </div>
    </main>
  );
}
