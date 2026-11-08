import type { Metadata } from 'next';
import { Fragment } from 'react';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { Unknown } from '@/components/atoms/Unknown';
import { ButtonLink } from '@/components/atoms/ButtonLink';
import { Placeholder } from '@/components/shell/Placeholder';
import { Rise } from '@/components/motion/Rise';
import { FrameWipe } from '@/components/motion/FrameWipe';
import { manufacturing, type ManufacturingService } from '@/content/manufacturing';
import { WholesaleInsights } from '@/components/crm/WholesaleInsights';

// CG Prompt 10: contract manufacturing, white label, post-production, and bulk
// solventless supply, on CedarGrowth's own New York licence. Copy lives in
// content/manufacturing.ts so the compliance-critical wording is reviewable in
// one place. No client name appears here; every commercial value that was not
// supplied renders UNKNOWN; nothing implies extraction capability, licence
// transfer, or interstate movement.

const m = manufacturing;

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: m.meta.title,
  description: m.meta.description,
};

// The three production services render as one group; launch support closes the
// page after the boundary block, so the boundary sits immediately after the
// post-production service, where distillate is first named.
const PRODUCTION_SERVICES = m.services.filter((s) => s.key !== 'launch-support');
const LAUNCH_SERVICE = m.services.find((s) => s.key === 'launch-support');

function ServiceSpecs({
  service,
  tone,
}: {
  service: ManufacturingService;
  tone: 'light' | 'inverse';
}) {
  if (service.specs.length === 0) return null;
  const label = tone === 'inverse' ? 'text-inverse/70' : 'text-tertiary';
  const value = tone === 'inverse' ? 'text-inverse' : 'text-secondary';
  return (
    <dl className="mt-2 flex flex-col gap-3">
      {service.specs.map((spec) => (
        <div
          key={spec.label}
          className="flex flex-wrap items-baseline gap-x-6 gap-y-1"
        >
          <dt
            className={`min-w-[7rem] font-mono text-specimen uppercase tracking-specimen ${label}`}
          >
            {spec.label}
          </dt>
          <dd>
            {'value' in spec ? (
              <span className={`font-mono text-data uppercase tracking-specimen ${value}`}>
                {spec.value}
              </span>
            ) : (
              <Unknown caption={spec.unknownCaption} tone={tone} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function ManufacturingPage() {
  return (
    <>
      {/* Hero, split layout */}
      <section className="bg-parchment py-16 md:py-32">
        <div className="mx-auto grid max-w-content grid-cols-1 items-center gap-10 px-page-margin-mobile md:grid-cols-2 md:gap-16 md:px-page-margin">
          <Rise className="flex max-w-editorial flex-col gap-6">
            <Eyebrow>{m.hero.eyebrow}</Eyebrow>
            <h1 className="font-display text-display-l-m md:text-display-xl text-primary">
              {m.hero.headline}
            </h1>
            <p className="text-body-m-m md:text-body-l text-secondary">{m.hero.body}</p>
            {/* Hero specimen line (CG Prompt 10A). Three facts, no qualifier. On
                one line the period convention separates them; at 390 they stack
                one fact per line without any type-size reduction. The hairline
                sits above with 24px clear (border-t + pt-6). */}
            <p
              style={{ letterSpacing: '0.04em' }}
              className="flex flex-col gap-y-1 border-t border-hairline pt-6 font-mono text-caption-m md:text-caption uppercase text-tertiary md:flex-row md:flex-wrap md:items-baseline md:gap-x-2"
            >
              {/* 0.04em set inline: text-caption bakes in 0.01em letter-spacing
                  that would otherwise win the cascade over tracking-specimen. */}
              {m.hero.specimen.map((fact, i) => (
                <Fragment key={fact}>
                  <span className="md:whitespace-nowrap">{fact}</span>
                  {i < m.hero.specimen.length - 1 ? (
                    <span aria-hidden="true" className="hidden md:inline">
                      .
                    </span>
                  ) : null}
                </Fragment>
              ))}
            </p>
            <div>
              <ButtonLink href="#request" variant="outline">
                {m.hero.cta}
              </ButtonLink>
            </div>
          </Rise>
          <FrameWipe>
            <Placeholder
              family="process documentary"
              alt={m.hero.placeholderAlt}
              className="aspect-[4/5]"
            />
          </FrameWipe>
        </div>
      </section>

      {/* Interstate block, first because it is every out-of-state brand's first question */}
      <section className="bg-bone py-16 md:py-24">
        <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
          <Rise className="flex max-w-editorial flex-col gap-6">
            <Eyebrow>{m.interstate.eyebrow}</Eyebrow>
            <h2 className="font-display text-heading-m-m md:text-heading-m text-primary">
              {m.interstate.headline}
            </h2>
            <p className="text-body-m-m md:text-body-l text-secondary">
              {m.interstate.body}
            </p>
          </Rise>
        </div>
      </section>

      {/* The production services: bulk supply, solventless manufacturing, post-production */}
      <section className="bg-parchment py-16 md:py-24">
        <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
          <Eyebrow className="mb-10">{m.servicesEyebrow}</Eyebrow>
          <div className="flex flex-col">
            {PRODUCTION_SERVICES.map((service) => (
              <Rise
                key={service.key}
                className="flex flex-col gap-4 border-t border-hairline py-10 first:border-t-0 first:pt-0 md:flex-row md:gap-16"
              >
                <div className="flex flex-col gap-4 md:max-w-editorial">
                  <h3 className="font-display text-heading-s-m md:text-heading-s text-primary">
                    {service.title}
                  </h3>
                  <p className="text-body-m-m md:text-body-m text-secondary">
                    {service.body}
                  </p>
                </div>
                <div className="md:ml-auto md:pt-1">
                  <ServiceSpecs service={service} tone="light" />
                </div>
              </Rise>
            ))}
          </div>
        </div>
      </section>

      {/* The boundary block. Immediately after post-production, full section on
          the ink surface for weight, never softened, never below the fold. This
          is the reconciliation between this page and the rest of the site. */}
      <section className="bg-ink py-16 md:py-32">
        <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
          <Rise className="flex max-w-editorial flex-col gap-6">
            <Eyebrow tone="inverse">{m.boundary.eyebrow}</Eyebrow>
            <h2 className="font-display text-display-l-m md:text-display-l text-inverse">
              {m.boundary.headline}
            </h2>
            <p className="text-body-m-m md:text-body-l text-inverse/80">{m.boundary.body}</p>
          </Rise>
        </div>
      </section>

      {/* Launch support, the knowledge service */}
      {LAUNCH_SERVICE ? (
        <section className="bg-parchment py-16 md:py-24">
          <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
            <Rise className="flex max-w-editorial flex-col gap-4">
              <Eyebrow>{m.servicesEyebrow}</Eyebrow>
              <h3 className="font-display text-heading-s-m md:text-heading-s text-primary">
                {LAUNCH_SERVICE.title}
              </h3>
              <p className="text-body-m-m md:text-body-l text-secondary">
                {LAUNCH_SERVICE.body}
              </p>
            </Rise>
          </div>
        </section>
      ) : null}

      {/* Capability, equipment stated factually under one controlled process */}
      <section className="bg-bone py-16 md:py-24">
        <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
          <Rise className="flex max-w-editorial flex-col gap-6">
            <Eyebrow>{m.capability.eyebrow}</Eyebrow>
            <h2 className="font-display text-heading-m-m md:text-heading-m text-primary">
              {m.capability.headline}
            </h2>
            <p className="text-body-m-m md:text-body-m text-secondary">{m.capability.body}</p>
          </Rise>
          <dl className="mt-10 grid grid-cols-1 gap-8 border-t border-hairline pt-10 md:grid-cols-3">
            {m.capability.equipment.map((item) => (
              <div key={item.name} className="flex flex-col gap-2">
                <dt className="font-display text-heading-s-m md:text-heading-s text-primary">
                  {item.name}
                </dt>
                <dd className="font-mono text-specimen uppercase tracking-specimen text-tertiary">
                  {item.role}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Compliance, what the manufacturer handles and what the client retains */}
      <section className="bg-ink py-16 md:py-24">
        <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
          <Rise className="flex max-w-editorial flex-col gap-6">
            <Eyebrow tone="inverse">{m.compliance.eyebrow}</Eyebrow>
            <h2 className="font-display text-heading-m-m md:text-heading-m text-inverse">
              {m.compliance.headline}
            </h2>
          </Rise>
          <div className="mt-10 grid grid-cols-1 gap-10 border-t border-hairline-inverse pt-10 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              <p className="font-mono text-specimen uppercase tracking-specimen text-inverse/70">
                {m.compliance.handlesHeading}
              </p>
              <ul className="flex flex-col gap-2">
                {m.compliance.handles.map((item) => (
                  <li key={item} className="text-body-m-m md:text-body-m text-inverse/80">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-4">
              <p className="font-mono text-specimen uppercase tracking-specimen text-inverse/70">
                {m.compliance.retainsHeading}
              </p>
              <ul className="flex flex-col gap-2">
                {m.compliance.retains.map((item) => (
                  <li key={item} className="text-body-m-m md:text-body-m text-inverse/80">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Request. No live form is built without a confirmed delivery mechanism,
          and none is published yet, so this states plainly what to include and
          routes to the contact path rather than a form that cannot deliver. */}
      <section id="request" className="bg-parchment py-16 md:py-32">
        <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
          <Rise className="flex max-w-editorial flex-col gap-6">
            <Eyebrow>{m.request.eyebrow}</Eyebrow>
            <h2 className="font-display text-heading-m-m md:text-heading-m text-primary">
              {m.request.headline}
            </h2>
            <p className="text-body-m-m md:text-body-l text-secondary">{m.request.body}</p>
            <Unknown label="Email" caption={m.request.emailCaption} />
            <div className="flex flex-wrap gap-8">
              <ButtonLink href={m.request.onwardHref} variant="ghost">
                {m.request.onwardLabel}
              </ButtonLink>
            </div>
          </Rise>
        </div>
      </section>
      <WholesaleInsights />
    </>
  );
}
