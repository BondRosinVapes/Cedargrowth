'use client';

import { Eyebrow } from '@/components/atoms/Eyebrow';
import { ButtonLink } from '@/components/atoms/ButtonLink';
import { HeroVideo } from '@/components/home/HeroVideo';
import { Rise } from '@/components/motion/Rise';
import { LineReveal } from '@/components/motion/LineReveal';
import { home } from '@/content/home';
import { ANNOUNCEMENT } from '@/lib/site';

// Below 768px the video frame is 28rem so the phone is not all picture.
// From the md breakpoint up it is the locked 82vh frame. The headline stays
// three lines, and the certificate line is a band on the bottom edge.
export function HomeHero() {
  return (
    <section className="relative flex min-h-[28rem] flex-col justify-end overflow-hidden bg-ink md:min-h-[82vh]">
      <div className="absolute inset-0 h-full w-full">
        <HeroVideo
          src={home.hero.videoSrc}
          className="h-full w-full object-cover"
        />
      </div>
      <div
        className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/45 to-transparent"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex w-full max-w-content flex-col justify-end px-page-margin-mobile pb-8 pt-4 md:px-page-margin md:pt-5 xl:pt-6">
        <div className="flex max-w-editorial flex-col gap-3 md:gap-4">
          <Rise delay={0.2}>
            <Eyebrow tone="inverse" className="max-md:text-[13px]">{home.hero.eyebrow}</Eyebrow>
          </Rise>
          <h1 className="font-display text-[clamp(34px,calc((100vw-2.5rem)*0.11),44px)] leading-[1.08] md:text-[48px] md:leading-[1.08] xl:text-display-xl xl:leading-[1.05] text-inverse [text-shadow:0_1px_18px_rgb(28_27_25_/_0.5)]">
            {home.hero.headlineLines.map((line, index) => (
              <LineReveal key={line} text={line} delay={0.32 + index * 0.08} className="whitespace-nowrap" />
            ))}
          </h1>
          <Rise delay={0.64}>
            <p className="text-body-l-m leading-snug text-inverse/90 md:text-body-m xl:text-body-l xl:leading-normal [text-shadow:0_1px_14px_rgb(28_27_25_/_0.55)]">
              {home.hero.body}
            </p>
          </Rise>
          <Rise delay={0.8}>
            <div>
              <ButtonLink
                href="/method"
                variant="outline"
                tone="inverse"
                className="!border-inverse !text-bone bg-ink/25 backdrop-blur-sm hover:!bg-inverse hover:!text-primary"
              >
                {home.hero.cta}
              </ButtonLink>
            </div>
          </Rise>
        </div>
      </div>
      <p className="relative border-t border-hairline-inverse bg-ink px-page-margin-mobile py-2 text-center text-caption-m text-inverse/70 md:px-page-margin md:text-caption">
        {ANNOUNCEMENT}
      </p>
    </section>
  );
}
