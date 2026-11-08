# CedarGrowth - Figma MCP Design-System Rules

Rules for translating between Figma designs and this codebase via the Figma MCP.
Read this before any `get_design_context` / `use_figma` / `generate_figma_design` call.

**Repo:** `C:\Users\garyf\Cedargrowth` - Next.js App Router site for "CedarGrowth Organics".
**Live reference:** cedargrowth-dxxt.vercel.app (Vercel team `via-connect`).
**Design target breakpoints:** 390px (mobile), 1440px (desktop). Always design/implement both in one pass.

---

## 0. Non-negotiable rails (encode these into every Figma import/export)

These are house rules from the README. A design that violates them is wrong, not a variant.

- **No em/en-dashes** anywhere - code, comments, or copy. Use commas, parentheses, or restructure.
- **Border-radius is 0** everywhere. The single exception is data-layer status chips: `2px` (`rounded-chip`). No other rounding.
- **No shadows, gradients, blur, glassmorphism, or neon.** Depth = hairlines, tone, and space only. There is no `boxShadow` in the theme by design; do not add one.
- **Lucide icons only**, `strokeWidth={1.5}`, no fills, ~20 glyphs total across the whole product. Icons inherit `currentColor`.
- **`cedar` accent (`#9C4A1E`) is capped at ~4 uses per screen.** It is the one accent color.
- **Light mode only.** "Dark" sections are the `ink` surface used compositionally, not a theme. There is no dark mode.
- **Images are placeholders.** The image optimizer is off and there is no `public/` folder yet - see §4.

---

## 1. Design tokens

**Stack: Tailwind v3 (config-based), NOT v4.** There is no `@theme` block. Do not introduce one.

Tokens live in two mirrored files:
- **`tokens.css`** (repo root) - canonical source of truth. `:root` CSS custom properties, global `:focus-visible` ring, reduced-motion safety net. Imported in `src/app/layout.tsx` **before** `globals.css`.
- **`tailwind.config.js`** - the Tailwind theme, which *reads* those variables.

**Colors are stored as space-separated RGB channels** so alpha works via Tailwind:
```css
/* tokens.css */
--parchment: 243 238 231;   /* #F3EEE7 */
```
```js
// tailwind.config.js - colors is a full REPLACE, not extend.
// Only these tokens exist (+ transparent/current/inherit).
colors: { parchment: 'rgb(var(--parchment) / <alpha-value>)', /* ... */ }
```
When Figma output needs a tinted color, use `bg-cedar/10` style alpha utilities - the channel format supports it. Never emit raw hex in components; map to a token name.

### Color palette (Tailwind name → hex → role)
| Token | Hex | Role |
|---|---|---|
| `parchment` | `#F3EEE7` | Default page background |
| `bone` | `#E8E1D7` | Alternating sections / plates |
| `clinical` | `#FFFFFF` | Data panels, COA tables, app cards |
| `ink` | `#1C1B19` | Dark sections, footer, solid buttons |
| `primary` | `#1C1B19` | Body text |
| `secondary` | `#3A3835` | Secondary text |
| `tertiary` | `#6F6A62` | Tertiary text (AA-safe) |
| `inverse` | `#F3EEE7` | Text on ink |
| `hairline` | `#D8D1C6` | 1px rules on light |
| `hairline-inverse` | `#3A3835` | 1px rules on ink |
| `cedar` | `#9C4A1E` | The one accent (≤4/screen) |
| `verdant` | `#2E4034` | Deep green signal |
| `pass` | `#3F6B4A` | Status: pass |
| `attention` | `#A8761C` | Status: attention |
| `fail` | `#8C2F1F` | Status: fail |

**Wellness "line pigments"** - `rest #3B4457`, `relief #9C5B45`, `focus #A08B3C`, `calm #7C8A72`, `restore #6B5340`. Rule: usable ONLY as a 3px marker or a tinted plate, **never** as a background or button fill. Dynamic pigment classes are pinned in `src/lib/lines.ts` via the `PIGMENT_MARK` map so Tailwind JIT does not purge them - if a Figma import generates pigment classes dynamically, add them to that map or they will not render.

### Typography (three families, self-hosted)
| Tailwind | CSS var | Face | Use |
|---|---|---|---|
| `font-display` | `--font-newsreader` | Newsreader (serif, 400 + italic) | Display / headings |
| `font-sans` | `--font-inter-tight` | Inter Tight (400/500) | Default body |
| `font-mono` | `--font-ibm-plex-mono` | IBM Plex Mono (400/500) | Data / specimen, `tabular-nums` |

Files live in `src/fonts` and load through `next/font/local`. The build does not fetch Google Fonts. Keep the subset files (latin, latin-ext, Vietnamese, and, where that family has them, Cyrillic and Greek). Do not switch these calls back to `next/font/google`.

**Type scale** - desktop is the base key; mobile is a `-m` suffix applied mobile-first. The house pattern is `text-<key>-m md:text-<key>`:
`display-xl` 76/40 · `display-l` 56/32 · `heading-m` 34/26 · `heading-s` 20/18 · `body-l` 18/17 · `body-m` 16/15 · `eyebrow` 12/11 (0.14em tracking) · `caption` 13/12 · `specimen` 12/11 · `data` 15/14. (Each carries its own line-height/letter-spacing in the config.)

### Spacing / layout
Base-8 ramp (`--space-1`…`10` = 8,16,24,32,48,64,96,128,160,200px). Named Tailwind additions only:
`section: 200px` · `page-margin: 64px` (`page-margin-mobile: 20px`) · `gutter: 24px` (`gutter-mobile: 16px`). Max widths: `content 1280px`, `editorial 720px`. House pattern: `px-page-margin-mobile md:px-page-margin`.

### Radii / shadows / motion
- Radius: `rounded-none` is default; `rounded-chip` (2px) only on status chips.
- Shadows: none. Do not add.
- Motion: `ease-cedar` = `cubic-bezier(0.22,1,0.36,1)`; durations reveal 500 / image 900 / hover 240 / page 240 / reduced 120ms. Keyframes `reveal`, `image-settle`, `fade`. Focus ring: 2px cedar, 2px offset, enforced globally.

---

## 2. Components

Location: `src/components/`, grouped by role - `atoms/` (`ButtonLink`, `Eyebrow`, `SectionHeader`, `Accordion`), `shell/` (`Shell`, `Header`, `Footer`, `AnnouncementBar`, `MegaPanel`, `MobileMenu`, `Wordmark`, `NewsletterForm`, `Placeholder`), `home/`, `reserve/`.

**Architecture: plain hand-written React function components. NOT shadcn/ui, NOT Radix.** There is no `components.json`, no `cn()` util, and **none** of `clsx` / `classnames` / `class-variance-authority` / `tailwind-merge`. **Do not introduce them** - match the existing style.

Conventions a Figma-to-code import MUST follow:
- Named export: `export function Name({ ... }: { inline type }) { ... }`.
- Variants are plain string-union props resolved with `if`/ternary into template-literal `className` strings. No `cva`.
- A `tone` prop (`'light' | 'inverse'`, sometimes `'quiet' | 'cedar'`) swaps token classes so the component stays AA-legible on parchment vs. ink.
- Every component accepts a trailing `className = ''` for composition.
- Server components by default; add `'use client'` only for interactivity (`Accordion`, `reserve/*`).

```tsx
// atoms/ButtonLink.tsx - the canonical variant pattern
type Variant = 'outline' | 'solid' | 'ghost';
type Tone = 'light' | 'inverse';
return <Link href={href} className={`${base} ${variantClasses} ${className}`}>
```

---

## 3. Frameworks & libraries

`next 14.2.35` (App Router) · `react`/`react-dom 18.3.1` · `tailwindcss 3.4.7` · `postcss 8.4.40` · `autoprefixer 10.4.19` · `typescript 5.5.4` (strict) · `lucide-react 0.417.0` (only runtime UI dep besides Next/React) · `eslint 8.57` + `eslint-config-next`.

Build: **Next default (SWC/Webpack), no Turbopack flag.** Package manager: **npm** (`package-lock.json`; `vercel.json` pins `installCommand: npm install`). Path alias `@/*` → `./src/*`. `vercel.json` pins `framework: nextjs` - never set `outputDirectory`.

---

## 4. Assets

- **No `public/` folder exists.** The image optimizer is off: `next.config.mjs` sets `images: { unoptimized: true }` until real assets land. There is **no `next/image` usage** and **no `remotePatterns`**.
- Every image slot renders **`src/components/shell/Placeholder.tsx`** - a labeled `<div role="img" aria-label>` with `bg-bone`/`bg-ink`, a hairline border, and a mono `"Placeholder, {family}"` marker.
- Image families are typed in `src/lib/nav.ts`: `'raw material macro' | 'specimen plate' | 'process documentary' | 'facility' | 'map still' | 'thin line diagram'`.
- **When a Figma design contains images, render `<Placeholder family="…" />` with the closest family - do NOT wire `next/image` or real URLs** unless explicitly told assets have landed. No CDN / Supabase Storage / Vercel Blob is used in-app.

---

## 5. Icons

`lucide-react` only. Named ESM imports: `import { ArrowRight } from 'lucide-react'`. In use: `ArrowRight`, `Menu`, `Search`, `User`, `ShoppingBag`, `X`.

Usage convention: `strokeWidth={1.5}`, `aria-hidden="true"`, explicit pixel `size` - `16` for inline/button, `18` for form/teaser arrows, `20` for header/mobile controls. No fills, no color props (inherit `currentColor`). Keep the total glyph count small (~20).

---

## 6. Styling

Tailwind utility classes **exclusively**, inline in template literals. No CSS Modules, no styled-components. Global CSS = `src/app/globals.css` (`@tailwind base/components/utilities` + small `@layer` blocks) plus root `tokens.css`. Custom global utilities in `globals.css`: `.cedar-underline` (240ms hover/focus underline draw), `.reveal` / `.settle` (CSS-only scroll reveals via `animation-timeline: view()`, double-gated on `prefers-reduced-motion` and `@supports`).

Responsive: standard Tailwind mobile-first (`sm:`, `md:`), mobile base + `md:` desktop, paired with the `-m` type suffix. No dark mode.

---

## 7. Project structure

```
Cedargrowth/
├─ src/
│  ├─ app/            App Router routes + globals.css
│  │  ├─ layout.tsx page.tsx (home)
│  │  ├─ method/ products/ (+ [slug]) wellness/ (+ [line]) reserve/
│  ├─ components/     atoms/ shell/ home/ reserve/
│  └─ lib/            nav.ts lines.ts wellness.ts products.ts method.ts site.ts
├─ tokens.css         canonical token source (imported before globals.css)
├─ tailwind.config.js postcss.config.js next.config.mjs
├─ vercel.json (framework: nextjs) tsconfig.json (@/* → ./src/*)
└─ package.json (npm)
```

**Feature pattern: content is data-driven.** Typed constants live in `src/lib/*.ts` (`PRIMARY_NAV`, `FOOTER_COLUMNS`, wellness `LINES` + `PIGMENT_MARK`, product/method data) and route `page.tsx` files compose `atoms` + `shell`. When importing a Figma page, put copy/data in a `src/lib/*.ts` module and keep the `page.tsx` a thin composition layer - do not hardcode content in the route.

> Note: nav links in `src/lib/nav.ts` point ahead of built routes (DNA/Research/Find/Transparency exist in nav but not yet as pages). Do not assume a route file exists just because it is in the nav.
