import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Placeholder } from '@/components/shell/Placeholder';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { ButtonLink } from '@/components/atoms/ButtonLink';
import { BatchTeaser } from '@/components/home/BatchTeaser';
import { HomeHero } from '@/components/home/HomeHero';
import { TwoInputsBand } from '@/components/home/TwoInputsBand';
import { TeamSection } from '@/components/home/TeamSection';
import { Rise } from '@/components/motion/Rise';
import { LineReveal } from '@/components/motion/LineReveal';
import { RuleDraw } from '@/components/motion/RuleDraw';
import { Counter } from '@/components/motion/Counter';
import { FrameWipe } from '@/components/motion/FrameWipe';
import { LINES, ABSENCES, PIGMENT_MARK } from '@/lib/lines';
import { MOTION } from '@/lib/motion';
import { SITE_URL } from '@/lib/site';
import { home } from '@/content/home';

// Home page metadata (spec Section C item 2). Title is absolute so it does
// not run through the root layout's "%s, CedarGrowth Organics" template.
// The Open Graph image is a documented placeholder path, not a real asset:
// see task-4-report.md for the outstanding-asset note.
export const metadata: Metadata = {
  title: { absolute: home.meta.title },
  description: home.meta.description,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: home.meta.title,
    description: home.meta.description,
    url: SITE_URL,
    siteName: home.meta.title,
    type: 'website',
    images: [
      {
        url: `${SITE_URL}${home.meta.ogImagePath}`,
        width: 1200,
        height: 630,
        alt: home.meta.ogImageAlt,
      },
    ],
  },
};

export default function HomePage() {
  return (
    <>
      <HomeHero />

      {/* Block 2, position statement. SectionHeader wraps `sub` in a <p>, so
          Rise (which renders a div) cannot go through that prop without
          nesting a div inside a p (invalid HTML, hydration mismatch). This
          block is inlined with SectionHeader's own default classes
          (as="h2", align="center", tone="light") so the body copy can be a
          Rise div directly, matching how Task 11+15 already swapped a
          static <p> for a Rise div in the five-absences trailing line. */}
      <section className="bg-parchment py-16 md:py-40">
        <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
          <div className="mx-auto flex flex-col items-center gap-4 text-center">
            <h2 className="font-display text-heading-m-m md:text-heading-m text-primary">
              <LineReveal text={home.position.headline} />
            </h2>
            <Rise
              delay={0.16}
              className="max-w-editorial text-body-m-m md:text-body-l text-secondary"
            >
              {home.position.sub}
              <br />
              {home.position.subDetail}
            </Rise>
          </div>
        </div>
      </section>

      {/* Block 3, the five lines */}
      <section className="bg-bone py-16 md:py-40">
        <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
          <Eyebrow className="mb-10">{home.fiveLines.eyebrow}</Eyebrow>
          <ul className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible">
            {LINES.map((line, i) => (
              <li
                key={line.key}
                className="min-w-[70%] snap-start sm:min-w-[42%] md:min-w-0"
              >
                <Link href={line.href} className="group block">
                  {/* Border moves from Placeholder's own static edge onto
                      FrameWipe's className so the wipe reveals the border
                      instead of doubling it (bordered={false} below drops
                      Placeholder's internal border-hairline). */}
                  <FrameWipe
                    delay={i * 0.08}
                    className="relative aspect-[3/4] overflow-hidden border border-hairline"
                  >
                    {line.image ? (
                      <Image
                        src={line.image}
                        alt={home.placeholders.fiveLines.altFor(line.name)}
                        fill
                        sizes="(min-width: 768px) 20vw, 70vw"
                        className="object-cover transition-transform duration-[600ms] ease-cedar group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      />
                    ) : (
                      <Placeholder
                        family={home.placeholders.fiveLines.family}
                        alt={home.placeholders.fiveLines.altFor(line.name)}
                        className="h-full w-full"
                        label={false}
                        bordered={false}
                      />
                    )}
                  </FrameWipe>
                  <RuleDraw
                    delay={i * 0.08 + 0.24}
                    className={`mt-4 h-[3px] w-10 ${PIGMENT_MARK[line.pigment]}`}
                  />
                  <Rise delay={i * 0.08}>
                    <h3 className="mt-4 font-display text-heading-s-m md:text-heading-s text-primary">
                      {line.name}
                    </h3>
                    <p className="mt-1 text-body-m-m md:text-body-m text-secondary">
                      {line.descriptor}
                    </p>
                  </Rise>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Section A, the two inputs band */}
      <TwoInputsBand />

      {/* Block 4, the five absences centerpiece. The 4 interior verticals
          between the 5 cells draw simultaneously (RuleDraw, 720ms), then the
          five counters count down from their ceiling to 00 staggered 80ms
          apart, each label rises 240ms after its own counter starts, and the
          trailing line rises in 400ms after the last counter settles. */}
      <section className="bg-ink py-16 md:py-24">
        <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
          <div className="relative">
            <ul className="grid grid-cols-1 border-t border-hairline-inverse sm:grid-cols-3 md:grid-cols-5">
              {ABSENCES.map((item, index) => (
                <li
                  key={item.label}
                  className="flex flex-col gap-3 border-b border-hairline-inverse py-8 md:border-b-0 md:pl-6"
                >
                  <Counter
                    mode="countDown"
                    from={item.ceiling}
                    to={0}
                    pad={2}
                    delay={MOTION.duration.slow + index * MOTION.stagger}
                    className="font-mono text-data text-inverse/50"
                  />
                  <Rise
                    delay={
                      MOTION.duration.slow +
                      index * MOTION.stagger +
                      MOTION.duration.fast
                    }
                    className="text-body-l-m md:text-body-l text-inverse"
                  >
                    {item.label}
                  </Rise>
                </li>
              ))}
            </ul>
            {/* Exactly 4 interior verticals for the 5 cells, md+ only
                (matches the ul's own grid-cols-5, no gap, so each rule sits
                flush on a real column boundary and never doubles the old
                static border). */}
            <div
              className="pointer-events-none absolute inset-0 hidden md:grid md:grid-cols-5"
              aria-hidden="true"
            >
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="relative" style={{ gridColumnStart: i + 1 }}>
                  <RuleDraw
                    axis="y"
                    duration={MOTION.duration.slow}
                    className="absolute right-0 top-0 h-full w-px bg-hairline-inverse"
                  />
                </div>
              ))}
            </div>
          </div>
          <Rise
            delay={
              MOTION.duration.slow +
              4 * MOTION.stagger +
              MOTION.duration.settle +
              0.4
            }
            className="mt-8 max-w-editorial text-body-m-m md:text-body-m text-inverse/70"
          >
            {home.absences.trailing}
          </Rise>
        </div>
      </section>

      {/* Block 5, the DNA test */}
      <section className="bg-parchment py-16 md:py-40">
        <div className="mx-auto grid max-w-content grid-cols-1 items-center gap-10 px-page-margin-mobile md:grid-cols-2 md:gap-16 md:px-page-margin">
          {home.placeholders.dna.image ? (
            <div className="relative mx-auto aspect-[7/8] w-full max-w-[22rem] overflow-hidden">
              <Image
                src={home.placeholders.dna.image}
                alt={home.placeholders.dna.alt}
                fill
                sizes="(min-width: 768px) 22rem, 100vw"
                className="object-cover"
              />
            </div>
          ) : (
            <Placeholder
              family={home.placeholders.dna.family}
              alt={home.placeholders.dna.alt}
              className="aspect-[4/3]"
            />
          )}
          <div className="flex flex-col items-start gap-6">
            <Eyebrow>{home.dna.eyebrow}</Eyebrow>
            <h2 className="font-display text-heading-m-m md:text-heading-m text-primary">
              {home.dna.headline}
            </h2>
            <p className="max-w-editorial text-body-m-m md:text-body-l text-secondary">
              {home.dna.body}
            </p>
            <ButtonLink href="/dna" variant="ghost">
              {home.dna.cta}
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Block 6, transparency band */}
      <section className="bg-ink py-16 md:py-24">
        <div className="mx-auto grid max-w-content grid-cols-1 gap-8 px-page-margin-mobile md:grid-cols-2 md:items-end md:px-page-margin">
          <div className="flex flex-col gap-4">
            <Eyebrow tone="inverse">{home.transparency.eyebrow}</Eyebrow>
            <p className="max-w-editorial text-body-l-m md:text-body-l text-inverse">
              {home.transparency.body}
            </p>
          </div>
          <BatchTeaser />
        </div>
      </section>

      {/* Section B, the team section */}
      <TeamSection />

      {/* Block 7, research teaser */}
      <section className="bg-parchment py-16 md:py-40">
        <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
          <div className="flex flex-col gap-6">
            <Eyebrow>{home.research.eyebrow}</Eyebrow>
            <h2 className="font-display text-heading-m-m md:text-heading-m text-primary">
              {home.research.headline}
            </h2>
            {/* Single empty-state row (no published research entries exist
                in content yet, so there is no repeating list of dated
                items and no date field to run through Resolve). The
                border-t moves off the div and onto its own RuleDraw so the
                hairline draws instead of appearing static. */}
            <div className="pb-8">
              <RuleDraw delay={0} className="h-px w-full bg-hairline" />
              <Rise delay={0} className="pt-8">
                <p className="text-body-m-m md:text-body-m text-tertiary">
                  {home.research.emptyNote}
                </p>
              </Rise>
            </div>
            <ButtonLink href="/research" variant="ghost">
              {home.research.cta}
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Block 8, find */}
      <section className="relative overflow-hidden bg-bone">
        <div className="mx-auto grid max-w-content grid-cols-1 items-center gap-10 px-page-margin-mobile py-16 md:grid-cols-2 md:gap-16 md:px-page-margin md:py-40">
          <div className="order-2 flex flex-col items-start gap-6 md:order-1">
            <Eyebrow>{home.find.eyebrow}</Eyebrow>
            <Rise delay={0}>
              <h2 className="font-display text-heading-m-m md:text-heading-m text-primary">
                {home.find.headline}
              </h2>
            </Rise>
            <Rise delay={0.16}>
              <ButtonLink href="/find" variant="outline">
                {home.find.cta}
              </ButtonLink>
            </Rise>
          </div>
          {/* Same border approach as the five-lines cards: border moves onto
              FrameWipe's className, Placeholder's internal border dropped via
              bordered={false} so the wipe reveals it once instead of
              doubling it. */}
          <FrameWipe className="order-1 aspect-[4/3] border border-hairline md:order-2">
            <Placeholder
              family={home.placeholders.find.family}
              alt={home.placeholders.find.alt}
              className="h-full w-full"
              bordered={false}
            />
          </FrameWipe>
        </div>
      </section>
    </>
  );
}
