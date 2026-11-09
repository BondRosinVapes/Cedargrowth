'use client';

import { useLayoutEffect, useRef } from 'react';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { ButtonLink } from '@/components/atoms/ButtonLink';
import { HeroVideo } from '@/components/home/HeroVideo';
import { Rise } from '@/components/motion/Rise';
import { LineReveal } from '@/components/motion/LineReveal';
import { home } from '@/content/home';
import { ANNOUNCEMENT } from '@/lib/site';

// The hero fills whatever viewport remains under the live header. The
// headline is the three stored lines, each kept on its own line.
// Type steps down only far enough for those lines to fit a narrow width.
export function HomeHero() {
  const sectionRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const fit = () => {
      const section = sectionRef.current;
      const header = document.querySelector('header');
      if (!section || !header) return;
      const chrome = header.getBoundingClientRect().bottom;
      section.style.minHeight = `${Math.max(0, Math.round(window.innerHeight - chrome))}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <section ref={sectionRef} className="relative flex flex-col justify-end overflow-hidden bg-ink">
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
            <Eyebrow tone="inverse">{home.hero.eyebrow}</Eyebrow>
          </Rise>
          <h1 className="font-display text-[26px] leading-[1.1] min-[390px]:text-[30px] md:text-[48px] md:leading-[1.08] xl:text-display-xl xl:leading-[1.05] text-inverse [text-shadow:0_1px_18px_rgb(28_27_25_/_0.5)]">
            {home.hero.headlineLines.map((line, index) => (
              <LineReveal key={line} text={line} delay={0.32 + index * 0.08} className="whitespace-nowrap" />
            ))}
          </h1>
          <Rise delay={0.64}>
            <p className="text-body-m-m leading-snug text-inverse/90 md:text-body-m xl:text-body-l xl:leading-normal [text-shadow:0_1px_14px_rgb(28_27_25_/_0.55)]">
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
