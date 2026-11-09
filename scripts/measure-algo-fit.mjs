// Ruční kontrola rozložení stránky /algo/ (není součástí npm test): vejde se modul na jednu obrazovku?
//
//   npm run build
//   node scripts/measure-algo-fit.mjs [--w 1366] [--h 768] [--edge <msedge.exe|chrome>] [--shots <složka>]
//                                     [--port 8765] [--dist dist] [--edit] [cesta …]   (bez cest: všechny moduly z registry.ts)
//
// --edit: navíc stav „edit“ – po operaci otevře „Upravit graf“ (u toků s Kresbou jen rezervy / výšky
// „Upravit síť“), u modulů bez editoru se nic nemění. Cesta smí mít parametry (/flow/dinic?ex=obr-14-6).
//
// Spustí statický server nad dist/ a prohlížeč (Edge/Chrome headless přes DevTools protokol, bez
// závislostí – Node 22+ má WebSocket). Každý modul změří ve stavech: načteno, po první operaci
// z nabídky (Provést), s rozbalenou nápovědou a s rozbaleným popisem („více“). Hlásí, kdy stránka
// přetéká okno (posuvník; na telefonu se stránka posouvat smí, hlídá se jen přesah do strany),
// nejmenší měřítko SVG (1 = skutečná velikost), stav přehrávače a na telefonu (šířka pod 700 px),
// jestli plátno po operaci (posun k němu) nezakrývá hlavička webu nebo horní lišta. Na desktopu je chyba
// i vnitřní přetečení plátna (.viz-canvas má vlastní posuvník – kresba se nevešla, NEWMODS-03).
// Výstup: tabulka na stdout; návratový kód 1, když něco přeteče.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf("--" + name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const W = +opt("w", 1366);
const H = +opt("h", 768);
const PORT = +opt("port", 8765);
const DIST = path.resolve(opt("dist", path.join(ROOT, "dist")));
const SHOTS = opt("shots", null);
const EDIT = args.includes("--edit");
if (EDIT) args.splice(args.indexOf("--edit"), 1);
const EDGE = opt(
  "edge",
  process.platform === "win32"
    ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
    : "google-chrome",
);
const ROUTES = args.length
  ? args
  : fs
      .readFileSync(path.join(ROOT, "src/algo/registry.ts"), "utf8")
      .match(/path: "([^"]+)"/g)
      .map((s) => s.slice(7, -1));

if (!fs.existsSync(path.join(DIST, "algo", "index.html"))) {
  console.error("Chybí dist/algo/index.html – nejdřív npm run build.");
  process.exit(2);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
const server = http
  .createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    let p = path.resolve(path.join(DIST, decodeURIComponent(u.pathname)));
    if (!p.startsWith(DIST)) return res.writeHead(403).end();
    if (fs.existsSync(p) && fs.statSync(p).isDirectory())
      p = path.join(p, "index.html");
    if (!fs.existsSync(p)) return res.writeHead(404).end("404");
    res.writeHead(200, {
      "content-type": TYPES[path.extname(p)] ?? "application/octet-stream",
    });
    fs.createReadStream(p).pipe(res);
  })
  .listen(PORT, "127.0.0.1");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEBUG = PORT + 1;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "algo-fit-"));
const browser = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${DEBUG}`,
    `--window-size=${Math.max(W, 500)},${H}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let target;
for (let i = 0; i < 60 && !target; i++) {
  try {
    const list = await (
      await fetch(`http://127.0.0.1:${DEBUG}/json/list`)
    ).json();
    target = list.find((t) => t.type === "page");
  } catch {
    /* prohlížeč ještě startuje */
  }
  if (!target) await sleep(250);
}
if (!target) {
  console.error("Prohlížeč se nespustil:", EDGE);
  process.exit(2);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.result?.exceptionDetails)
    throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};
const shot = async (name) => {
  if (!SHOTS) return;
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(
    path.join(SHOTS, name),
    Buffer.from(r.result.data, "base64"),
  );
};

// měření v okně stránky: přetečení, nejmenší měřítko SVG v plátně, přehrávač
const MEASURE = `(() => {
  const d = document, de = d.documentElement;
  const scales = [...d.querySelectorAll('.viz-canvas svg')]
    .filter((s) => !s.closest('button, .legend') && s.viewBox?.baseVal?.height)
    .map((s) => +(s.getBoundingClientRect().height / s.viewBox.baseVal.height).toFixed(2))
    .filter((x) => x > 0);
  const c = d.querySelector('.viz-canvas');
  const code = d.querySelector('.viz-code .pseudocode');
  return {
    over: Math.max(de.scrollHeight, d.body.scrollHeight) - innerHeight,
    overX: Math.max(de.scrollWidth, d.body.scrollWidth) - innerWidth,
    scale: scales.length ? Math.min(...scales) : null,
    canvasScroll: c ? c.scrollHeight - c.clientHeight : null,
    pseudo: code ? Math.round(code.getBoundingClientRect().height) : null,
    play: d.querySelector('.ctl-play')?.getAttribute('aria-label') ?? null,
    step: d.querySelector('.step-counter')?.textContent ?? null,
    // telefon: kolik px horního okraje plátna zakrývá hlavička webu a horní lišta (po posunu k plátnu)
    hidden: (() => {
      if (!c) return null;
      const bottoms = ['.site-header', '.algo-root .topbar']
        .map((s) => d.querySelector(s))
        .filter((e) => e && !e.classList.contains('site-header--hidden') && getComputedStyle(e).display !== 'none')
        .map((e) => e.getBoundingClientRect().bottom);
      const top = c.getBoundingClientRect().top;
      return bottoms.length && top < innerHeight ? Math.max(0, Math.round(Math.max(...bottoms) - top)) : 0;
    })(),
    error: c ? null : (d.querySelector('.algo-root details pre, .algo-root details')?.textContent ?? 'chybí plátno').slice(0, 300),
  };
})()`;
// „po operaci“ = skutečná operace nad strukturou (Push, Insert, Find…, u grafů spuštění), ne Vytvořit /
// Příklady / Výchozí (ty jen postaví vstup a přehrávač zůstane „připraveno“). Zkouší operační akce
// v pořadí nabídky, pak ostatní; vrátí název akce, po které přehrávač ukazuje kroky, jinak null.
const FIRST_ACTION = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SKIP = /^(Vytvořit|Příklady|Výchozí|Vyprázdnit|Vynulovat|Prázdn|↶|Import)/;
  const label = (b) => (b.textContent ?? '').trim();
  const enabled = [...document.querySelectorAll('.am-action')].filter((b) => b.getAttribute('aria-disabled') !== 'true');
  const ops = enabled.filter((b) => !SKIP.test(label(b)));
  for (const a of [...ops, ...enabled.filter((b) => !ops.includes(b))]) {
    if (!a.isConnected) continue;
    // už otevřenou akci (třídění otevře Vytvořit hned po načtení) neklikat – zavřela by se
    if (a.getAttribute('aria-expanded') !== 'true') a.click();
    await sleep(300);
    const go = document.querySelector('.am-go');
    if (go && go.getAttribute('aria-disabled') !== 'true') go.click();
    else document.querySelector('.am-body .am-variant')?.click();
    await sleep(300);
    const step = document.querySelector('.step-counter')?.textContent ?? '';
    if (step && step !== 'připraveno') return label(a);
  }
  return null;
})()`;

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: W,
  height: H,
  deviceScaleFactor: 1,
  mobile: W < 500,
});
const ORIGIN = `http://127.0.0.1:${PORT}`;
const rows = [];
let bad = 0;
for (const r of ROUTES) {
  const tag = r.slice(1).replace(/[/?&=%,+]/g, "-");
  await send("Page.navigate", { url: "about:blank" });
  await sleep(150);
  await send("Page.navigate", { url: `${ORIGIN}/algo/#${r}` });
  await sleep(1800);
  const row = { route: r, load: await evaluate(MEASURE) };
  await shot(`${tag}_${W}x${H}_1-load.png`);
  // na telefonu leží akce pod plátnem: uživatel k nim nejdřív posune stránku (hlavička se schová)
  if (W < 700) {
    await evaluate(
      "(() => { const a = document.querySelector('.viz-actions'); if (a) window.scrollTo(0, a.getBoundingClientRect().top + scrollY - 200); })()",
    );
    await sleep(800);
  }
  const op = await evaluate(FIRST_ACTION);
  await sleep(1500);
  row.action = await evaluate(MEASURE);
  row.op = op;
  await shot(`${tag}_${W}x${H}_2-action.png`);
  await evaluate(
    "(() => { const m = document.querySelector('.viz-more'); if (m) m.open = true; })()",
  );
  await sleep(500);
  row.help = await evaluate(MEASURE);
  await evaluate("document.querySelector('.viz-desc-toggle')?.click()");
  await sleep(500);
  row.desc = await evaluate(MEASURE);
  await shot(`${tag}_${W}x${H}_3-help-desc.png`);
  if (EDIT) {
    // editor grafu / sítě: plátno se nesmí přetéct ani s otevřeným editorem
    row.hasEditor = await evaluate(
      "(() => { const b = [...document.querySelectorAll('.viz-canvas .flow-edit-net, .viz-canvas .ge-mode')].find((x) => x.offsetParent !== null && x.getAttribute('aria-pressed') !== 'true'); if (b) b.click(); return !!b; })()",
    );
    await sleep(800);
    row.edit = await evaluate(MEASURE);
    await shot(`${tag}_${W}x${H}_4-edit.png`);
  }
  rows.push(row);
}

/** plátno má vnitřní posuvník (víc než 1 px na zaokrouhlení) – na telefonu plátno teče, tam se nehlídá */
const canvasOver = (m) => W >= 700 && (m.canvasScroll ?? 0) > 1;
const fmt = (m) =>
  `${W < 700 ? "výška +" + m.over : m.over > 0 ? "PŘETÉKÁ +" + m.over : "ok"} ${m.overX > 0 ? "(do strany +" + m.overX + ")" : ""}` +
  (canvasOver(m) ? ` PLÁTNO PŘETÉKÁ +${m.canvasScroll}` : "") +
  ` měřítko ${m.scale ?? "–"} pseudokód ${m.pseudo ?? "–"}px` +
  (m.hidden > 0 ? ` ZAKRYTO PLÁTNO ${m.hidden}px` : "");
console.log(`/algo/ v okně ${W}×${H}`);
for (const row of rows) {
  const states = ["load", "action", "help", "desc", ...(EDIT ? ["edit"] : [])];
  const phone = W < 700;
  if (
    states.some(
      (s) =>
        (!phone && row[s].over > 0) || row[s].overX > 0 || canvasOver(row[s]),
    ) ||
    (phone && row.action.hidden > 0) ||
    !row.op
  )
    bad++;
  console.log(
    row.route.padEnd(18),
    states.map((s) => `${s}: ${fmt(row[s])}`).join(" | "),
    row.op
      ? `| po operaci ${row.op}: ${row.action.play} ${row.action.step}`
      : "| ŽÁDNÁ OPERACE (přehrávač zůstal „připraveno“)",
    row.load.error
      ? `
  CHYBA: ${row.load.error}`
      : "",
  );
  if (row.load.error) bad++;
}
console.log(
  bad
    ? `Přetéká ${bad} z ${rows.length} modulů.`
    : `Vše se vejde (${rows.length} modulů).`,
);
fs.writeFileSync(
  path.join(os.tmpdir(), `algo-fit-${W}x${H}.json`),
  JSON.stringify(rows, null, 1),
);
ws.close();
browser.kill();
server.close();
process.exit(bad ? 1 : 0);
