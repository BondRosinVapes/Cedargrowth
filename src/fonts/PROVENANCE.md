# Font files

These are the latin woff2 files Google Fonts returned for the same CSS requests `next/font/google` made from `src/app/layout.tsx` before this change. They are vendored so `next build` does not fetch Google Fonts. The loader in Next.js 14.2.35 crashes when that response uses an extensionless `/l/font?kit=` URL.

No family was substituted. Weights and styles are the ones the layout already requested.

| File | Family | Weight | Style | Google Fonts version |
| --- | --- | --- | --- | --- |
| newsreader-latin-400.woff2 | Newsreader | 400 | normal | v26 |
| newsreader-latin-400-italic.woff2 | Newsreader | 400 | italic | v26 |
| inter-tight-latin-variable.woff2 | Inter Tight | 400 and 500 | normal | v9 |
| ibm-plex-mono-latin-400.woff2 | IBM Plex Mono | 400 | normal | v20 |
| ibm-plex-mono-latin-500.woff2 | IBM Plex Mono | 500 | normal | v20 |

Inter Tight's latin response for weight 400 and weight 500 was the same variable file (`wght` 100 to 900, default 400). The layout declares that file as weight `400 500`, which is the range the previous setup requested.

Licenses, SIL Open Font License 1.1:

- `OFL-Newsreader.txt`, copyright 2020 The Newsreader Project Authors
- `OFL-Inter-Tight.txt`, copyright 2022 The Inter Project Authors
- `OFL-IBM-Plex-Mono.txt`, copyright 2017 IBM Corp. Reserved Font Name "Plex"

Fetched from the Google Fonts `ofl` tree on 8 Nov 2026. The woff2 bytes were fetched the same day from `fonts.gstatic.com` with the Chrome 104 user agent Next.js sends.
