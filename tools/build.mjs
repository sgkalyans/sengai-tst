/* Pre-renders the site for search engines. Run after any change to index.html or app.js:
 *
 *   npm install      (once — installs Playwright)
 *   npm run build
 *
 * index.html stays the single source page. This script:
 *   - fills the <!--seo--> block (title, description, canonical, hreflang, structured data);
 *     page titles come from meta.title in app.js, descriptions from `pages` below,
 *   - fills the <!--app--> block with what app.js draws, so crawlers that don't run
 *     JavaScript still see the full page,
 *   - writes ta/index.html (the Tamil page), robots.txt and sitemap.xml.
 *
 * The live domain is always https://sengai.in. When CNAME is any other host (the test
 * site), every page is marked noindex, so the test copy
 * never competes with the live site in search results, and visitor analytics are left out.
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://sengai.in";
const host = readFileSync(join(root, "CNAME"), "utf8").trim();
const live = host === "sengai.in";
// Cloudflare Web Analytics (no cookies). Live site only, so test-site visits aren't counted.
const ANALYTICS_TOKEN = "b81980f74791424d9883ce418241490a";

const pages = {
  en: {
    path: "/",
    ogLocale: "en_IN",
    description: "Living abroad or in another city? Sengai delivers freshly prepared, home-style meals and caring local support to your parents and loved ones in Pattukkottai, Tamil Nadu.",
  },
  ta: {
    path: "/ta/",
    ogLocale: "ta_IN",
    description: "வெளிநாட்டிலோ வேறு ஊரிலோ இருக்கிறீர்களா? பட்டுக்கோட்டையில் உள்ள உங்கள் அம்மா, அப்பாவுக்குச் சுவையான வீட்டுச் சாப்பாடும் அக்கறையான உள்ளூர் உதவியும் செங்கை வழங்குகிறது.",
  },
};

const esc = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const between = (s, tag, inner) => {
  const re = new RegExp(`<!--${tag}-->[\\s\\S]*?<!--/${tag}-->`);
  if (!re.test(s)) throw new Error(`index.html is missing the <!--${tag}--> markers`);
  return s.replace(re, () => `<!--${tag}-->${inner}<!--/${tag}-->`);
};

function seo(lang, title) {
  const p = pages[lang];
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#org`,
        name: "Sengai",
        alternateName: "செங்கை",
        slogan: "A Caring Hand",
        url: `${SITE}/`,
        logo: `${SITE}/logo-mark.png`,
        image: `${SITE}/og-image.jpg`,
        description: pages.en.description,
        areaServed: { "@type": "City", name: "Pattukkottai", containedInPlace: { "@type": "State", name: "Tamil Nadu", containedInPlace: { "@type": "Country", name: "India" } } },
        knowsLanguage: ["en", "ta"],
      },
      {
        "@type": "Service",
        name: "Home-style meal delivery for elderly parents",
        serviceType: "Meal delivery and local care support",
        provider: { "@id": `${SITE}/#org` },
        areaServed: { "@type": "City", name: "Pattukkottai" },
        audience: { "@type": "Audience", audienceType: "Families living away from their parents, in India or abroad" },
      },
      { "@type": "WebSite", "@id": `${SITE}/#website`, url: `${SITE}/`, name: "Sengai", inLanguage: ["en", "ta"], publisher: { "@id": `${SITE}/#org` } },
    ],
  };
  return [
    "",
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(p.description)}">`,
    live ? null : `<meta name="robots" content="noindex, nofollow">`,
    `<link rel="canonical" href="${SITE}${p.path}">`,
    ...Object.entries(pages).map(([l, q]) => `<link rel="alternate" hreflang="${l}" href="${SITE}${q.path}">`),
    `<link rel="alternate" hreflang="x-default" href="${SITE}/">`,
    `<meta property="og:url" content="${SITE}${p.path}">`,
    `<meta property="og:locale" content="${p.ogLocale}">`,
    ...Object.entries(pages).filter(([l]) => l !== lang).map(([, q]) => `<meta property="og:locale:alternate" content="${q.ogLocale}">`),
    live ? `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${ANALYTICS_TOKEN}"}'></script>` : null,
    `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>`,
    "",
  ].filter(x => x !== null).join("\n");
}

// Serve the repo with the app block emptied, so app.js draws everything fresh.
const source = between(readFileSync(join(root, "index.html"), "utf8"), "app", "")
  .replace(/<div id="app"[^>]*>/, '<div id="app">');
const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/" || path === "/ta/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(source); }
  const file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise(ok => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
for (const lang of Object.keys(pages)) {
  const ctx = await browser.newContext({ reducedMotion: "reduce", colorScheme: "light" });
  const page = await ctx.newPage();
  // Only local files: fonts and the Tally form aren't needed for the snapshot.
  await page.route(u => !u.href.startsWith(base), r => r.abort());
  await page.goto(`${base}/?lang=${lang}`, { waitUntil: "load" });
  const { app, sticky, title } = await page.evaluate(() => {
    const a = document.getElementById("app").cloneNode(true);
    a.querySelectorAll(".logo .en").forEach(e => e.removeAttribute("style")); // sized again at runtime
    a.querySelectorAll("iframe[src]").forEach(e => e.removeAttribute("src"));  // Tally loads at runtime
    return { app: a.innerHTML, sticky: document.getElementById("stickyCta").textContent, title: document.title };
  });
  await ctx.close();

  let out = between(source, "seo", seo(lang, title));
  out = between(out, "app", app);
  out = out.replace(/<html lang="[^"]*" data-locale="[^"]*">/, `<html lang="${lang}" data-locale="${lang}">`);
  out = out.replace('<div id="app">', `<div id="app" data-prerendered="${lang}">`);
  out = out.replace(/(id="stickyCta">)[^<]*(<\/a>)/, `$1${sticky}$2`);
  const dest = join(root, pages[lang].path, "index.html");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, out);
  console.log(`wrote ${pages[lang].path}index.html`);
}
await browser.close();
server.close();

writeFileSync(join(root, "robots.txt"), live
  ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`
  // Test site: crawling stays allowed so search engines can read each page's noindex tag and drop it.
  : `# Test site (${host}). Every page is marked noindex; the live site is ${SITE}/\nUser-agent: *\nAllow: /\n`);

const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(root, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${Object.values(pages).map(p => `  <url>
    <loc>${SITE}${p.path}</loc>
    <lastmod>${today}</lastmod>
${Object.entries(pages).map(([l, q]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${q.path}"/>`).join("\n")}
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>
  </url>`).join("\n")}
</urlset>
`);
console.log(`wrote robots.txt and sitemap.xml (${live ? "live site" : `test site ${host}: noindex`})`);
