// Liest die Artikeldaten aus dem React-Server-Components-Payload einer Vinted-Artikelseite
// (self.__next_f.push([1,"..."])). Gibt ein "raw"-Objekt im Format der alten API zurueck
// oder null, wenn die Seite nicht wie erwartet aufgebaut ist.
function __vmcpParseItemPage(html, id, base) {
  const pushRe = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let d = "";
  let m;
  while ((m = pushRe.exec(html))) {
    try { d += JSON.parse('"' + m[1] + '"'); } catch {}
  }
  if (!d) return null;

  // Alle Objekte der Form {"data":{...},...,"name":"<block>","section":...} einsammeln
  const blocks = {};
  const stack = [];
  let inStr = false, esc = false;
  for (let i = 0; i < d.length; i++) {
    const ch = d.charCodeAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (ch === 92) esc = true;        // backslash
      else if (ch === 34) inStr = false;     // "
      continue;
    }
    if (ch === 34) inStr = true;
    else if (ch === 123) stack.push(i);      // {
    else if (ch === 125 && stack.length) {   // }
      const s = stack.pop();
      if (d.startsWith('{"data":', s)) {
        const tail = d.slice(Math.max(s, i - 200), i + 1);
        if (tail.includes('"section":') && tail.includes('"name":')) {
          try {
            const o = JSON.parse(d.slice(s, i + 1));
            if (o && o.name && !blocks[o.name]) {
              const itemId = o.data && o.data.item_id;
              if (!itemId || String(itemId) === String(id)) blocks[o.name] = o.data || {};
            }
          } catch {}
        }
      }
    }
  }

  const gallery = blocks.gallery;
  const offer = blocks.make_offer || {};
  if (!gallery && !offer.title) return null;

  const attrs = {};
  for (const a of (blocks.attributes && blocks.attributes.attributes) || []) {
    if (a && a.code && a.data) attrs[a.code] = a.data.value;
  }
  const summaryTitle = (() => {
    const l = blocks.summary && blocks.summary.lines && blocks.summary.lines[0];
    return l && l.elements && l.elements[0] && l.elements[0].value;
  })();
  const crumbs = ((blocks.breadcrumbs && blocks.breadcrumbs.breadcrumbs) || []).map((c) => c.title);
  if (crumbs.length > 1 && /\/brand\//.test(((blocks.breadcrumbs.breadcrumbs || []).slice(-1)[0] || {}).url || "")) crumbs.pop();
  const user = blocks.user_info_header || {};
  const sellerName = user.name || (blocks.seller_badges_info && blocks.seller_badges_info.username) || "";
  const sellerId = user.seller_id || offer.seller_id || (blocks.favourite && blocks.favourite.seller_id) || 0;
  const lastOnline = ((user.user_info || []).find((x) => x && x.key === "last-logged-in") || {}).text || "";

  const extra = [];
  if (attrs.material) extra.push("Material: " + attrs.material);
  if (attrs.upload_date) extra.push("Hochgeladen: vor " + attrs.upload_date);
  if (blocks.ask_seller && blocks.ask_seller.is_reserved) extra.push("RESERVIERT");
  if (lastOnline) extra.push("Verkäufer " + lastOnline);
  // Lange Texte stehen im RSC-Payload als Referenz ("$16a") auf eine Textzeile "16a:T<hexlaenge>,<text>"
  const resolveRef = (v) => {
    const mm = /^\$([0-9a-f]+)$/.exec(String(v || ""));
    if (!mm) return v;
    const key = mm[1] + ":T";
    let at = d.indexOf("\n" + key);
    at = at >= 0 ? at + 1 : (d.startsWith(key) ? 0 : -1);
    if (at < 0) return "";
    const comma = d.indexOf(",", at);
    const len = parseInt(d.slice(at + key.length, comma), 16);
    if (!(len >= 0)) return "";
    return Buffer.from(d.slice(comma + 1, comma + 1 + len + 16), "utf8").subarray(0, len).toString("utf8");
  };
  const description = (resolveRef(blocks.description && blocks.description.description) || "") +
    (extra.length ? "\n\n[Details: " + extra.join(" · ") + "]" : "");

  return {
    id: Number(id),
    url: base + "/items/" + id,
    title: offer.title || summaryTitle || (gallery && gallery.accessibility_label) || "",
    description,
    price: offer.price || null,
    brand_title: attrs.brand || null,
    size_title: attrs.size || null,
    status: attrs.status || null,
    color1: attrs.color || null,
    catalog_title: crumbs.length ? crumbs.join(" › ") : null,
    catalog_id: blocks.breadcrumbs && blocks.breadcrumbs.catalog_id ? Number(blocks.breadcrumbs.catalog_id) : null,
    photos: ((gallery && gallery.photos) || []).map((p) => p.full_size_url || p.url).filter(Boolean),
    favourite_count: (blocks.favourite && blocks.favourite.favourite_count) || 0,
    is_closed: !!(gallery && gallery.is_closed),
    user: {
      id: Number(sellerId) || 0,
      login: sellerName,
      feedback_reputation: typeof user.feedback_reputation === "number" ? Math.round(user.feedback_reputation * 50) / 10 : undefined,
      feedback_count: user.feedback_count || 0,
      profile_url: sellerId ? base + "/member/" + sellerId + "-" + sellerName : undefined
    }
  };
}
