import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { Shell } from '@/components/shell/Shell';
import { AgeGate } from '@/components/shell/AgeGate';
import { ReservationProvider } from '@/components/reserve/ReservationProvider';
import { MotionProvider } from '@/components/motion/MotionProvider';
import { isAgeGateEnabled } from '@/lib/flags';
import {
  fontClassName,
  ibmPlexMonoFamily,
  interTightFamily,
  newsreaderFamily,
} from '@/fonts/faces';
import '../../tokens.css';
import './globals.css';
import './font-fallback.css';

// Three faces, no more (Section 4.2). Files live in src/fonts with their OFL
// texts. next/font/local reads them at build time and does not call Google.
// The CSS variables list every subset next/font/google used to embed, then
// the packaged size-adjust fallback where Next.js 14.2.35 has one.
const fontVariables = {
  '--font-newsreader': newsreaderFamily,
  '--font-inter-tight': interTightFamily,
  '--font-ibm-plex-mono': ibmPlexMonoFamily,
} as CSSProperties;

export const metadata: Metadata = {
  title: {
    default: 'CedarGrowth Organics',
    template: '%s, CedarGrowth Organics',
  },
  description:
    'CedarGrowth produces solventless live rosin in Buffalo, New York, formulated for outcome rather than potency.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fontClassName} style={fontVariables}>
      <body className="bg-parchment text-primary font-sans">
        {/*
          Age gate (spec Section C item 6), guarded at this mount site rather
          than inside AgeGate itself: isAgeGateEnabled() defaults OFF, and
          when it is off this branch renders nothing at all, so the gate adds
          zero DOM and zero behavioral change. Do not flip
          NEXT_PUBLIC_AGE_GATE_ENABLED on without an explicit go-ahead.
        */}
        {isAgeGateEnabled() ? <AgeGate /> : null}
        <MotionProvider>
          <ReservationProvider>
            <Shell>{children}</Shell>
          </ReservationProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
