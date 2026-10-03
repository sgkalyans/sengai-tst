# sengai-tst

Test copy of the Sengai site (https://tst.sengai.in). The live site is the `sengai` repo
(https://sengai.in); the two differ only in `CNAME` and the files the build writes from it.

## Building (do this after every change)

`app.js` draws the page, but search engines and link previews need the content in the HTML
itself. After editing `index.html` or `app.js`, run:

```
npm install      # once
npm run build
```

and commit everything it changes. `tools/build.mjs` writes the pre-rendered `index.html`
(English, `/`) and `ta/index.html` (Tamil, `/ta/`), plus `robots.txt` and `sitemap.xml`.
Search titles live in `meta.title` in `app.js`; search descriptions and structured data live in
`tools/build.mjs`. On any host other than `sengai.in` (this test site) every page is marked
`noindex`, so the test copy stays out of search results.

## Security headers

The page sets its Content-Security-Policy and Referrer-Policy with `<meta>` tags in `index.html`.
All JavaScript lives in `app.js` and `theme-init.js`, so the policy allows no inline scripts.

GitHub Pages cannot send custom HTTP headers. When the site is behind Cloudflare (or moved to a
host that supports a `_headers` file), send these as real response headers:

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://tally.so; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://tally.so; frame-src https://tally.so; connect-src 'self' https://tally.so; form-action 'self' https://tally.so; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
```

If a new third-party service is added to the page, add its domain to the matching CSP directive
in both `index.html` and the header above.
