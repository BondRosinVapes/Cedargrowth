import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Shell } from '@/components/shell/Shell';
import { AgeGate } from '@/components/shell/AgeGate';
import { ReservationProvider } from '@/components/reserve/ReservationProvider';
import { MotionProvider } from '@/components/motion/MotionProvider';
import { isAgeGateEnabled } from '@/lib/flags';
import '../../tokens.css';
import './globals.css';

// Three faces, no more (Section 4.2). Files live in src/fonts with their OFL
// texts. next/font/local reads them at build time and does not call Google.
// Weights and styles match the previous next/font/google calls.
const newsreader = localFont({
  src: [
    { path: '../fonts/newsreader-latin-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/newsreader-latin-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-newsreader',
  display: 'swap',
  adjustFontFallback: false,
});

const interTight = localFont({
  src: '../fonts/inter-tight-latin-variable.woff2',
  weight: '400 500',
  style: 'normal',
  variable: '--font-inter-tight',
  display: 'swap',
});

const ibmPlexMono = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono-latin-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-mono-latin-500.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

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
    <html
      lang="en"
      className={`${newsreader.variable} ${interTight.variable} ${ibmPlexMono.variable}`}
    >
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
