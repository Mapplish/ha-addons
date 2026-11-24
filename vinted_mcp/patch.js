// Patcht @andrijdavid/vinted-mcp 0.1.2 auf die neue Vinted-Katalog-API (seit Sept. 2026):
// alt:  https://www.vinted.<tld>/api/v2/catalog/items   -> 404
// neu:  https://api.vinted.<tld>/svc-catalogue/items    + Header X-Anon-Id
const fs = require("fs");
const file = process.argv[2] || "/app/node_modules/@andrijdavid/vinted-mcp/dist/bundle.js";
let src = fs.readFileSync(file, "utf8");

function replace(from, to, label) {
  if (!src.includes(from)) {
    console.error(`[patch] FEHLT: ${label}`);
    process.exit(1);
  }
  src = src.replace(from, to);
  console.log(`[patch] ok: ${label}`);
}

// 1) Neuer Such-Endpunkt auf dem api.-Host
replace(
  "const url = new URL(`${base}/api/v2/catalog/items`);",
  "const url = new URL(`${base.replace(\"://www.\", \"://api.\")}/svc-catalogue/items`);",
  "Endpunkt svc-catalogue"
);

// 2) Filter heissen jetzt attribute_ids[...]
replace('url.searchParams.set("catalog_ids", String(params.categoryId));',
        'url.searchParams.set("attribute_ids[catalog]", String(params.categoryId));', "Filter Kategorie");
replace('url.searchParams.set("brand_ids", params.brandIds.join(","));',
        'url.searchParams.set("attribute_ids[brand]", params.brandIds.join(","));', "Filter Marke");
replace('url.searchParams.set("size_ids", params.sizeIds.join(","));',
        'url.searchParams.set("attribute_ids[size]", params.sizeIds.join(","));', "Filter Groesse");
replace('url.searchParams.set("status_ids", conditionIds.join(","));',
        'url.searchParams.set("attribute_ids[status]", conditionIds.join(","));', "Filter Zustand");

// 3) Anonyme ID (Antwort-Header X-Anon-Id der Startseite) in der Sitzung merken
replace(
  "    const session = {\n      accessToken,\n      cookies,\n      csrfToken,\n      country: country.toLowerCase(),",
  "    const session = {\n      accessToken,\n      cookies,\n      csrfToken,\n      anonId: (homepageRes.headers.get(\"x-anon-id\") || \"\").trim(),\n      country: country.toLowerCase(),",
  "Sitzung mit anonId"
);

// 4) Browser-aehnliche Header fuer den api.-Host
replace(
  '      "X-CSRF-Token": session.csrfToken\n    };',
  '      "X-CSRF-Token": session.csrfToken,\n' +
  '      "Origin": getBaseUrl(country),\n' +
  '      "Referer": getBaseUrl(country) + "/",\n' +
  '      "Accept-Language": getCountry(country).language + ",en;q=0.5",\n' +
  '      "Platform": "web",\n' +
  '      "X-Next-App": "marketplace-web"\n' +
  '    };\n' +
  '    if (session.anonId) {\n      headers["X-Anon-Id"] = session.anonId;\n    }',
  "Request-Header"
);

// 5) Bei 401 (abgelaufenes Token) neue Sitzung holen und erneut versuchen
replace(
  "if ((response.status === 403 || response.status === 429) && retryCount < this.maxRetries) {",
  "if ((response.status === 401 || response.status === 403 || response.status === 429) && retryCount < this.maxRetries) {",
  "Retry bei 401"
);

// 6) Locale-Header: sonst antwortet api.vinted.* in falscher Sprache
replace(
  '      "Platform": "web",\n',
  '      "Locale": getCountry(country).language + "-" + String(country).toUpperCase(),\n      "Platform": "web",\n',
  "Locale-Header"
);

// Artikelseiten-Parser (v1.3.0) aus itempage.js, wird mit den Hilfsfunktionen eingefuegt
const ITEMPAGE_HELPER = fs.readFileSync(require("path").join(__dirname, "itempage.js"), "utf8");

// 7) Neue Trefferstruktur: Marke/Groesse/Zustand stehen in item_box, URLs sind relativ
const PARSE_HELPER = String.raw`
const __VMCP_COND = /^(neu|new|nieuw|neuf|nuovo|nuevo|sehr gut|gut|zufriedenstellend|very good|good|satisfactory|zeer goed|goed|redelijk|tr[eè]s bon [eé]tat|bon [eé]tat|satisfaisant|ottim|buon|discret|muy bueno|bueno|satisfactorio)/i;
function __vmcpBox(raw) {
  const box = raw.item_box || {};
  let size = raw.size_title || null;
  let condition = raw.status || null;
  const parts = String(box.second_line || "").split(/\s*[·•]\s*/).map((p) => p.trim()).filter(Boolean);
  const condParts = parts.filter((p) => __VMCP_COND.test(p));
  const sizeParts = parts.filter((p) => !__VMCP_COND.test(p));
  if (!condition && condParts.length) condition = condParts.join(" · ");
  if (!size && sizeParts.length) size = sizeParts.join(" · ");
  let brand = raw.brand_title || null;
  if (!brand && box.first_line && box.first_line !== raw.title) brand = box.first_line;
  return { size, condition, brand, label: box.accessibility_label || null };
}
`;
replace(
  "function parseItem(raw, country) {\n  const baseUrl = getBaseUrl(country);\n  const seller = raw.user || raw.seller || {};\n  return {",
  PARSE_HELPER + ITEMPAGE_HELPER +
  "function parseItem(raw, country) {\n  const baseUrl = getBaseUrl(country);\n  const seller = raw.user || raw.seller || {};\n" +
  "  const __box = __vmcpBox(raw);\n" +
  "  if (raw.url && String(raw.url).startsWith(\"/\")) raw = { ...raw, url: baseUrl + raw.url };\n" +
  "  if (!raw.photos && raw.photo) raw = { ...raw, photos: [raw.photo] };\n" +
  "  raw = { ...raw, brand_title: __box.brand, size_title: __box.size, status: __box.condition };\n" +
  "  return {",
  "Trefferfelder aus item_box"
);

// 8) get_item: alte API ist weg -> oeffentliche Artikelseite lesen
//    v1.3.0: zuerst vollstaendige Daten aus dem Seiten-Payload (alle Fotos, Groesse, Zustand, Verkaeufer),
//    Fallback: Meta-Tags + JSON-LD
const ITEM_PAGE = String.raw`
    try {
      const __base = getBaseUrl(country);
      const __res = await fetch(__base + "/items/" + id, {
        headers: {
          "User-Agent": defaultDesktopUserAgent(),
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": getCountry(country).language + ",en;q=0.5"
        },
        redirect: "follow"
      });
      if (__res.ok) {
        const html = await __res.text();
        try {
          const __full = __vmcpParseItemPage(html, id, __base);
          if (__full && __full.title) return parseItemDetail(__full, country);
        } catch (e) {
          console.warn("[vinted-core] item page parse failed for " + id + ": " + (e && e.message || e));
        }
        const dec = (s) => String(s || "").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        const meta = (p) => {
          const a = html.match(new RegExp("<meta[^>]+(?:property|name)=\"" + p + "\"[^>]*content=\"([^\"]*)\"", "i"));
          const b = html.match(new RegExp("<meta[^>]+content=\"([^\"]*)\"[^>]*(?:property|name)=\"" + p + "\"", "i"));
          return dec((a && a[1]) || (b && b[1]) || "");
        };
        let product = null;
        const ldRe = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
        let m;
        while ((m = ldRe.exec(html))) {
          try {
            const j = JSON.parse(m[1]);
            const list = Array.isArray(j) ? j : (j["@graph"] || [j]);
            const p = list.find((x) => x && x["@type"] === "Product");
            if (p) { product = p; break; }
          } catch {}
        }
        const offers = product && (Array.isArray(product.offers) ? product.offers[0] : product.offers) || {};
        const title = (product && product.name) || meta("og:title");
        if (title) {
          const imgs = product && product.image ? (Array.isArray(product.image) ? product.image : [product.image]) : [];
          const og = meta("og:image");
          return parseItemDetail({
            id,
            url: __base + "/items/" + id,
            title: dec(title),
            description: dec((product && product.description) || meta("og:description")),
            price: { amount: String(offers.price || meta("product:price:amount") || "0"), currency_code: offers.priceCurrency || meta("product:price:currency") || "EUR" },
            brand_title: product && product.brand ? (product.brand.name || product.brand) : null,
            size_title: (product && product.size) || null,
            status: offers.itemCondition ? String(offers.itemCondition).split("/").pop() : null,
            color1: (product && product.color) || null,
            photos: imgs.length ? imgs : (og ? [og] : [])
          }, country);
        }
      }
    } catch (error) {
      console.warn("[vinted-core] item page fetch failed for " + id + ": " + (error && error.message || error));
    }
`;
replace(
  "    if (this.playwrightAuth) {\n      try {\n        return await this.scrapeItemPage(id, country);",
  ITEM_PAGE + "    if (this.playwrightAuth) {\n      try {\n        return await this.scrapeItemPage(id, country);",
  "get_item ueber Artikelseite"
);

// 9) Sicherheit: Die Startseite "/" verriet bisher den geheimen MCP-Pfad -> jetzt nur 404
replace(
  '    if (url.pathname === "/") {\n      res.statusCode = 200;',
  '    if (false && url.pathname === "/") {\n      res.statusCode = 200;',
  "Startseite verbirgt geheimen Pfad"
);

fs.writeFileSync(file, src);
console.log("[patch] fertig");
