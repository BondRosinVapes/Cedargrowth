# Font files

The build loads these woff2 files with `next/font/local`. It does not call Google Fonts.

No family was substituted. Weights and styles are the ones the layout already requested: Newsreader 400 roman and italic, Inter Tight 400 and 500, IBM Plex Mono 400 and 500. `font-display` is `swap`.

## What this is, and what it is not

`src/fonts/observations/` is a CSS response fetched on 8 Nov 2026 from `fonts.googleapis.com` with the Chrome 104 user agent that `next/font/google` sends. The request URLs are the ones `getGoogleFontsUrl` builds for the layout calls:

- Inter Tight: `family=Inter+Tight:wght@400;500&display=swap`
- IBM Plex Mono: `family=IBM+Plex+Mono:wght@400;500&display=swap`
- Newsreader: `family=Newsreader:ital,wght@0,400;1,400&display=swap`

That response is not a capture of the CSS production served before the self-host change. No earlier Google response was retained. The latin files already in the repo match this observation byte for byte. The other subset files were taken from the same response.

`next/font/google` in Next.js 14.2.35 does not stop at the subset named in the call. `findFontFilesInCss` downloads every file in the CSS. The named subset, latin, is the only one preloaded. The CSS keeps each subset's `unicode-range`, so the browser fetches the other files when the text needs those characters. A latin-only file does not provide that coverage, even when the latin bytes match.

Newsreader's observed subsets are Vietnamese, latin-ext, and latin. IBM Plex Mono adds Cyrillic and Cyrillic Extended. Inter Tight adds those plus Greek and Greek Extended. Those are the subsets in this observation and in Next's font metadata. They are not a claim that every script is covered.

## Fallback metrics

Inter Tight and IBM Plex Mono use the size-adjust values `next/font/google` reads from `capsize-font-metrics.json` on Next.js 14.2.35: Inter Tight 96.39% against Arial, IBM Plex Mono 134.59% against Arial. `next/font/local` would measure the files itself and emit 97.21% and 131.49%. Those measured values are recorded by the regression and are not the faces in `src/app/font-fallback.css`.

Newsreader has no row in that metrics file. The Google loader then emits no size-adjust face. This repo does the same.

## Licenses

SIL Open Font License 1.1:

- `OFL-Newsreader.txt`, copyright 2020 The Newsreader Project Authors
- `OFL-Inter-Tight.txt`, copyright 2022 The Inter Project Authors
- `OFL-IBM-Plex-Mono.txt`, copyright 2017 IBM Corp. Reserved Font Name "Plex"

The additional subset files are the same families and the same licenses. The woff2 bytes were fetched on 8 Nov 2026 from `fonts.gstatic.com`. `observations/manifest.json` records the sha256 of each file.
