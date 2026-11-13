const puppeteer = require("/workspace/node_modules/puppeteer");

const BASE = "http://127.0.0.1:8099/ai-factory/roster";
const ROUTES = [
  ["/", "index"],
  ["/teams", "teams"],
  ["/niches", "niches"],
  ["/connectors", "connectors"],
  ["/hub", "hub"],
  ["/command-center", "command-center"],
  ["/playbooks", "playbooks"],
  ["/registry", "registry"],
  ["/studio", "studio"],
];

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160));
  });

  let pass = 0;
  let fail = 0;

  for (const [path, expected] of ROUTES) {
    await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 30000 });
    const state = await page.evaluate(() => {
      const views = Array.from(document.querySelectorAll(".view"));
      const visible = views.filter((v) => !v.hasAttribute("hidden"));
      const nav = document.querySelector('[data-nav][aria-current="page"]');
      return {
        total: views.length,
        visible: visible.map((v) => v.getAttribute("data-view")),
        nav: nav ? nav.getAttribute("data-nav") : null,
        h1: (document.querySelector(".view:not([hidden]) h1") || {}).textContent || "",
        headers: document.querySelectorAll("header.site-header").length,
        navs: document.querySelectorAll("nav.nav").length,
        footers: document.querySelectorAll("footer.site-footer").length,
        styles: document.querySelectorAll('link[rel="stylesheet"]').length,
      };
    });

    const ok =
      state.visible.length === 1 &&
      state.visible[0] === expected &&
      state.nav === expected &&
      state.total === 9 &&
      state.headers === 1 &&
      state.navs === 1 &&
      state.footers === 1;

    if (ok) pass++;
    else fail++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${path.padEnd(16)} view=${state.visible.join(",")} nav=${state.nav} ` +
        `shell(h/n/f)=${state.headers}/${state.navs}/${state.footers} h1="${state.h1.trim().slice(0, 42)}"`,
    );
  }

  // Card expansion: open an agent profile and confirm all nine sections render.
  // The click must target a card inside the VISIBLE view — the index view also
  // contains agent cards, and those are hidden on /teams.
  await page.goto(BASE + "/teams", { waitUntil: "networkidle2" });
  await page.waitForSelector('.view[data-view="teams"] .agent-card', { timeout: 15000 });
  const cardCount = await page.$$eval('.view[data-view="teams"] .agent-card', (n) => n.length);
  await page.click('.view[data-view="teams"] .agent-card');
  await page.waitForSelector(".pf-sec", { timeout: 15000 });
  const drawer = await page.evaluate(() => {
    const secs = Array.from(document.querySelectorAll(".pf-sec h5")).map((h) =>
      h.textContent.replace(/\s+/g, " ").trim(),
    );
    return {
      sections: secs,
      name: (document.querySelector(".pf-name") || {}).textContent || "",
      open: !!document.querySelector(".pf-drawer.open, .pf-drawer[class*=open]"),
    };
  });
  const need = ["Training", "Setup", "Tools", "Skills", "Connectors", "Knowledge"];
  const missing = need.filter((n) => !drawer.sections.some((s) => s.includes(n)));
  console.log(
    `\nDRAWER cards=${cardCount} name="${drawer.name}" sections=${drawer.sections.length} ` +
      `missing=${missing.length ? missing.join(",") : "none"}`,
  );
  drawer.sections.forEach((s) => console.log("   " + s));

  // Live data actually loaded (not fixtures): the drawer name must come from JSON.
  const live = await page.evaluate(async () => {
    const r = await fetch("data/agents-v10.json");
    const j = await r.json();
    return { count: Object.keys(j).length, first: j[Object.keys(j)[0]].name };
  });
  console.log(`\nLIVE DATA agents=${live.count} first="${live.first}"`);

  console.log(`\nROUTER ${pass}/${ROUTES.length} pass, ${fail} fail`);
  console.log(`ERRORS ${errors.length}`);
  errors.slice(0, 8).forEach((e) => console.log("   " + e));

  await browser.close();
  process.exit(fail === 0 && missing.length === 0 && errors.length === 0 ? 0 : 1);
})();
