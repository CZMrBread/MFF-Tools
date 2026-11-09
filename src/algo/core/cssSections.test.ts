// Oddíly index.css pro souběžné stopy fáze 2 (každá stopa píše jen do svého oddílu) a vzorky legendy,
// které nové moduly potřebují (vodiče 0/1 hradlových sítí, červená zvýraznění).
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync(
  new URL("../index.css", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");
/** bez komentářů – pravidla, ne jejich popis */
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

/** pořadí oddílů na konci index.css (stopy fáze 2, pak stopy fáze 4) */
const TRACK_SECTIONS = [
  "strings",
  "circuits",
  "sortnet",
  "fourier",
  "flows",
  "graphs-new",
  "dp",
  "hull",
  "llrb",
  "drag",
  "goldberg",
] as const;

const open = (name: string) => `/* === ${name} === */`;
const close = (name: string) => `/* === /${name} === */`;

describe("index.css – oddíly stop fáze 2 a 4", () => {
  it("každá stopa má právě jeden otevírací a zavírací komentář oddílu, v pořadí a bez překryvu", () => {
    let last = -1;
    for (const name of TRACK_SECTIONS) {
      const a = raw.indexOf(open(name));
      const b = raw.indexOf(close(name));
      expect(a, open(name)).toBeGreaterThan(-1);
      expect(raw.indexOf(open(name), a + 1), `${name}: jen jednou`).toBe(-1);
      expect(raw.indexOf(close(name), b + 1), `${name}: jen jednou`).toBe(-1);
      expect(b, close(name)).toBeGreaterThan(a);
      expect(a, `${name} za předchozím oddílem`).toBeGreaterThan(last);
      last = b;
    }
  });

  it("oddíly jsou na konci souboru (za nimi už nic, co by někdo jiný upravoval)", () => {
    const end = raw.indexOf(close(TRACK_SECTIONS[TRACK_SECTIONS.length - 1]));
    const tail = raw
      .slice(end + close(TRACK_SECTIONS[TRACK_SECTIONS.length - 1]).length)
      .trim();
    expect(tail).toBe("");
  });
});

describe("index.css – nové vzorky legendy (sw-*)", () => {
  /** tělo pravidla `.algo-root .swatch.<cls>` (jen samostatné pravidlo, bez dalších selektorů) */
  const body = (cls: string) =>
    css.match(
      new RegExp(`\\.algo-root \\.swatch\\.${cls}\\s*\\{([^}]*)\\}`),
    )?.[1];

  it.each([
    ["sw-wire0", "--algo-c-plain"],
    ["sw-wire1", "--algo-c-active"],
    ["sw-red", "--algo-danger"],
    ["sw-green", "--algo-c-sorted"],
    ["sw-blue", "--algo-c-active"],
    ["sw-purple", "--algo-c-min"],
    ["sw-orange", "--algo-c-pivot"],
    ["sw-teal", "--algo-c-bound"],
  ])("%s má barvu z %s", (cls, color) => {
    expect(body(cls), cls).toBeDefined();
    expect(body(cls)).toContain(`var(${color})`);
  });

  it("buňky tabulek (TableView cellMarks) mají třídy cell-hot / cell-active / cell-done / cell-found", () => {
    for (const cls of ["cell-hot", "cell-active", "cell-done", "cell-found"])
      expect(css, cls).toMatch(
        new RegExp(`\\.algo-root \\.gtable td\\.${cls}\\s*[,{]`),
      );
  });
});

describe("index.css – legenda všech modulů", () => {
  /** zdrojáky modulů a pohledů (bez testů) */
  const sources = (["../algos", "../views"] as const).flatMap((dir) => {
    const root = new URL(dir + "/", import.meta.url);
    return (readdirSync(root, { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => readFileSync(new URL(f.replaceAll("\\", "/"), root), "utf8"));
  });

  it('každý vzorek legendy (cls: "sw-…") použitý v modulu má v index.css pravidlo .swatch.sw-…', () => {
    const used = new Set(
      sources.flatMap((src) =>
        [...src.matchAll(/cls:\s*"(sw-[a-z0-9-]+)"/g)].map((m) => m[1]),
      ),
    );
    // nové moduly fáze 2 legendu mají
    expect(used.size).toBeGreaterThan(20);
    const missing = [...used].filter(
      (cls) => !new RegExp(`\\.swatch\\.${cls}(?![a-z0-9-])`).test(css),
    );
    expect(missing).toEqual([]);
  });
});
