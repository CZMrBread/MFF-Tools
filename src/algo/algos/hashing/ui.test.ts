/**
 * Výchozí příklady (musí ukazovat to, k čemu vybízí tip a úvodní hláška), rozložení buněk, odkaz ?t=…
 * a vykreslení stránek bez prohlížeče (renderToStaticMarkup).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { materialize, type Step } from "../../core/steps";
import { blBuild, blOp } from "./bloom";
import { ckBuild, ckOp } from "./cuckoo";
import { BloomPage, CuckooPage } from "./CuckooBloomPage";
import { HashPage } from "./HashPage";
import {
  buildTable,
  hashOp,
  longestRun,
  multiplesOf,
  storedKeys,
  insertAllOp,
} from "./tables";
import {
  bitRows,
  bloomLayout,
  BLOOM_LABEL_W,
  chainFonts,
  chainLayout,
  probeCell,
  BLOOM_DEFAULT,
  bloomFromShare,
  cellWidth,
  CHAIN_DEFAULT,
  CUCKOO_DEFAULT,
  cuckooFromShare,
  formatBloomShare,
  formatCuckooShare,
  formatHashShare,
  hashFromShare,
  PROBE_DEFAULT,
} from "./ui";

const last = <S>(steps: Step<S>[]) => steps[steps.length - 1];
const chain = () =>
  buildTable(
    CHAIN_DEFAULT.m,
    CHAIN_DEFAULT.fnId,
    CHAIN_DEFAULT.seed,
    CHAIN_DEFAULT.keys,
    false,
  ).state;
const probe = () =>
  buildTable(
    PROBE_DEFAULT.m,
    PROBE_DEFAULT.fnId,
    PROBE_DEFAULT.seed,
    PROBE_DEFAULT.keys,
    true,
  ).state;

describe("výchozí příklady", () => {
  it("řetězení: v přihrádce 4 je řetězec 12 → 20 → 28, výchozí x = 20 v tabulce je, Insert(36) ho prodlouží", () => {
    const st = chain();
    expect(st.buckets[4]).toEqual([12, 20, 28]);
    expect(st.buckets[7]).toEqual([7, 15]);
    expect(storedKeys(st, false)).toContain(20);
    const ins = structuredClone(st);
    materialize(hashOp(ins, 36, "insert", false));
    expect(ins.buckets[4]).toEqual([12, 20, 28, 36]);
    // tip: „Vložit násobky m“ s x mod m → všechny do přihrádky 0
    const mult = structuredClone(st);
    materialize(insertAllOp(mult, multiplesOf(8), false, "x"));
    expect(mult.buckets[0]).toEqual([8, 16, 24, 32]);
  });

  it("otevřená adresace: shluk 3–7, výchozí x = 35; Delete(19) → Find(35) projde náhrobkem; Insert(51) prodlouží shluk k buňce 9", () => {
    const st = probe();
    expect(st.cells.slice(3, 10)).toEqual([3, 19, 35, 20, 7, null, 41]);
    expect(st.cells).toContain(35);
    const del = structuredClone(st);
    materialize(hashOp(del, 19, "delete", true));
    expect(del.cells[4]).toBe("tomb");
    const find = materialize(hashOp(del, 35, "find", true));
    expect(last(find).message).toBe(
      "Find(35): nalezeno v buňce 5 po 3 sondách.",
    );
    expect(find.some((s) => s.message.includes("náhrobek"))).toBe(true);
    const ins = structuredClone(st);
    materialize(hashOp(ins, 51, "insert", true));
    expect(ins.cells[8]).toBe(51);
    expect(longestRun(ins)).toBe(7); // buňky 3–9
  });

  it("kukaččí tabulka: všech 5 klíčů je uloženo a výchozí x = 57 se najde", () => {
    const r = ckBuild(
      CUCKOO_DEFAULT.m,
      CUCKOO_DEFAULT.seed,
      CUCKOO_DEFAULT.keys,
    );
    expect(r.used).toEqual(CUCKOO_DEFAULT.keys);
    const st = structuredClone(r.state);
    expect(last(materialize(ckOp(st, 57, "find"))).message).toMatch(
      /^Find\(57\): nalezeno/,
    );
  });

  it("Bloomův filtr: tři klíče a výchozí x = 17 odpoví ANO", () => {
    const st = blBuild(
      BLOOM_DEFAULT.m,
      BLOOM_DEFAULT.k,
      BLOOM_DEFAULT.keys,
    ).state;
    expect(st.inserted).toEqual([17, 42, 99]);
    expect(
      last(materialize(blOp(structuredClone(st), 17, "lookup"))).message,
    ).toContain("ANO – 17 byl opravdu vložen");
  });
});

describe("rozložení buněk", () => {
  it("cellWidth vyplní šířku v mezích min…max", () => {
    expect(cellWidth(8, 900, 24, 44)).toBe(44);
    expect(cellWidth(32, 300, 24, 44)).toBe(24);
    expect(cellWidth(32, 650, 24, 44)).toBe(24);
    expect(cellWidth(16, 500, 24, 44)).toBe(30);
    expect(cellWidth(16, Number.NaN, 24, 44)).toBe(24);
  });

  it("bitRows zalomí dlouhý filtr do řad, aby bity nebyly užší než min", () => {
    expect(bitRows(64, 2000)).toEqual({ perRow: 64, rows: 1, w: 30 });
    expect(bitRows(64, 700)).toEqual({ perRow: 32, rows: 2, w: 21 });
    expect(bitRows(64, 360)).toEqual({ perRow: 16, rows: 4, w: 21 });
    expect(bitRows(16, 100).perRow).toBe(8);
    for (const m of [16, 32, 64]) {
      for (const avail of [200, 390, 700, 1200]) {
        const r = bitRows(m, avail);
        expect(r.perRow * r.rows).toBe(m);
        expect(r.w).toBeGreaterThanOrEqual(20);
      }
    }
  });
});

describe("odkaz ?t=…", () => {
  it("tabulka se z odkazu postaví stejně (řetězení i otevřená adresace)", () => {
    for (const probing of [false, true]) {
      const st = probing ? probe() : chain();
      const text = formatHashShare(st, storedKeys(st, probing));
      const back = hashFromShare(text, probing)!;
      expect(back.m).toBe(st.m);
      expect(back.fnId).toBe(st.fnId);
      expect(probing ? back.cells : back.buckets).toEqual(
        probing ? st.cells : st.buckets,
      );
    }
    expect(hashFromShare("16:tab:7:", true)!.n).toBe(0);
  });

  it("neplatný parametr se ignoruje (platí výchozí příklad)", () => {
    for (const t of [
      null,
      "",
      "x",
      "7:mod:1:1",
      "8:foo:1:1",
      "8:mod:-1:1",
      "8:mod:1:a,b",
      "8:mod:1:1,70000",
    ])
      expect(hashFromShare(t, false), String(t)).toBeNull();
    for (const t of [null, "12:3:1", "16:x:1", "16:3:-5"])
      expect(cuckooFromShare(t), String(t)).toBeNull();
    for (const t of [null, "20:3:1", "32:9:1", "32:3:1.5"])
      expect(bloomFromShare(t), String(t)).toBeNull();
  });

  it("kukaččí tabulka a Bloomův filtr: zápis a čtení odkazu", () => {
    const ck = ckBuild(16, 3, [57, 12, 33]).state;
    const back = cuckooFromShare(formatCuckooShare(ck))!;
    expect(back.m).toBe(16);
    expect(back.cells.filter((c) => c !== null).sort()).toEqual([12, 33, 57]);
    const bl = blBuild(64, 4, [1, 2, 3]).state;
    expect(formatBloomShare(bl)).toBe("64:4:1,2,3");
    expect(bloomFromShare("64:4:1,2,3")!.bits).toEqual(bl.bits);
  });
});

describe("stránky se vykreslí s předvyplněným příkladem", () => {
  const render = (
    path: string,
    pattern: string,
    page: () => ReturnType<typeof createElement>,
  ) =>
    renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: pattern, element: page() }),
        ),
      ),
    );

  it("řetězení a otevřená adresace", () => {
    const c = render("/hash/chaining", "/hash/:id", () =>
      createElement(HashPage),
    );
    expect(c).toContain("Tabulka s 8 přihrádkami, 6 klíčů");
    expect(c).toContain("Zkuste:");
    expect(c).toContain("Insert(x)");
    expect(c).toContain("Výchozí příklad");
    const p = render("/hash/probing", "/hash/:id", () =>
      createElement(HashPage),
    );
    expect(p).toContain("Tabulka s 16 buňkami, 6 klíčů");
    expect(p).toContain("náhrobek");
    // tabulka z odkazu
    const shared = render("/hash/chaining?t=4:mod:1:1,5,9", "/hash/:id", () =>
      createElement(HashPage),
    );
    expect(shared).toContain("Tabulka s 4 přihrádkami, 3 klíče");
    expect(shared).toContain("Tabulka z odkazu: 3 klíče");
    expect(shared).not.toContain("12 → 20 → 28");
  });

  it("kukaččí hešování a Bloomův filtr", () => {
    const c = render("/hash/cuckoo", "/hash/cuckoo", () =>
      createElement(CuckooPage),
    );
    expect(c).toContain("Kukaččí tabulka s 16 buňkami, 5 klíčů");
    expect(c).toContain("Vynutit cyklus");
    const b = render("/hash/bloom", "/hash/bloom", () =>
      createElement(BloomPage),
    );
    expect(b).toContain("Bloomův filtr, 32 bitů");
    // vložené klíče pod filtrem (každý je klikací – výběr x), v textu bez značek
    expect(b.replace(/<[^>]+>/g, "")).toContain("17, 42, 99");
    expect(b).toContain('aria-label="klíč 42 – vybrat"');
    expect(b).toContain("Lookup(x)");
    const linked = render("/hash/bloom?t=64:2:5,6", "/hash/bloom", () =>
      createElement(BloomPage),
    );
    expect(linked).toContain("Filtr z odkazu: m = 64, k = 2, 2 klíče");
  });
});

describe("kukačka: odkaz zachová obsazení buněk (TREEHASH-02)", () => {
  const cellsOf = (st: { cells: (number | null)[] }) =>
    st.cells
      .map((c, i) => (c === null ? null : `${c}@${i}`))
      .filter(Boolean)
      .join(" ");
  const base = () =>
    ckBuild(CUCKOO_DEFAULT.m, CUCKOO_DEFAULT.seed, CUCKOO_DEFAULT.keys).state;

  it("výchozí tabulka + Insert(58) → odkaz → stejné buňky", () => {
    const t = base();
    materialize(ckOp(t, 58, "insert"));
    expect(cellsOf(t)).toBe("58@2 41@5 12@7 57@11 33@13 90@14");
    const back = cuckooFromShare(formatCuckooShare(t))!;
    expect(cellsOf(back)).toBe(cellsOf(t));
  });

  it("totéž po Delete (kde to formát odkazu dovolí)", () => {
    for (const x of [57, 33, 41, 58]) {
      const t = base();
      materialize(ckOp(t, 58, "insert"));
      materialize(ckOp(t, x, "delete"));
      const back = cuckooFromShare(formatCuckooShare(t))!;
      expect(cellsOf(back), `Delete(${x})`).toBe(cellsOf(t));
    }
    // Delete(12) uvolní f(33) = 7 (33 zůstane v g(33) = 13), Delete(90) uvolní f(41) = 14: pořadím klíčů
    // to zapsat nejde – odkaz pak nese seznam buněk s „_“ (E4, share.test.ts) a buňky zůstanou stejné
    for (const x of [12, 90]) {
      const t = base();
      materialize(ckOp(t, x, "delete"));
      const back = cuckooFromShare(formatCuckooShare(t))!;
      expect(cellsOf(back), `Delete(${x})`).toBe(cellsOf(t));
    }
  });

  it("formát odkazu beze změny (m:seed:klíče); staré odkazy se načtou", () => {
    const t = base();
    expect(formatCuckooShare(t)).toMatch(/^16:3:(\d+,){4}\d+$/);
    expect(cellsOf(cuckooFromShare("16:3:57,12,33,90,41")!)).toBe(
      "41@5 12@7 57@11 33@13 90@14",
    );
  });
});

describe("kresby hešování vyplní plátno (TREEHASH-03/04)", () => {
  it("probeCell: buňka clamp(36, (W − okraje)/m, 72), písmo úměrně; na telefonu min 24", () => {
    expect(probeCell(16, 1310).w).toBe(72);
    expect(probeCell(16, 690).w).toBe(42);
    expect(probeCell(32, 690).w).toBe(36);
    expect(probeCell(16, 358).w).toBe(24);
    const c = probeCell(16, 1310);
    expect(c.h).toBeGreaterThan(36);
    expect(c.font).toBeGreaterThan(14);
    expect(probeCell(16, 690).font).toBeGreaterThanOrEqual(14);
    // řada zabere ≥ 60 % šířky plátna 1920 px (≈ 1300 px)
    expect((16 * probeCell(16, 1300).w) / 1300).toBeGreaterThanOrEqual(0.6);
  });

  it("chainLayout: výška řádku clamp(18, H/m, 56); když nestačí, 2–4 sloupce", () => {
    // výchozí m = 8 na 1920 × 1080 (~600 px) má řádky až 56 px – kresba vyplní výšku plátna
    expect(chainLayout(8, 600)).toEqual({ cols: 1, rowH: 56 });
    expect(chainLayout(8, 300)).toEqual({ cols: 1, rowH: 37 });
    expect(chainLayout(16, 400)).toEqual({ cols: 1, rowH: 25 });
    const l16 = chainLayout(16, 250);
    expect(l16.cols).toBe(2);
    expect(l16.rowH).toBeGreaterThanOrEqual(18);
    const l32 = chainLayout(32, 230);
    expect(l32.cols).toBeGreaterThanOrEqual(3);
    expect(l32.cols).toBeLessThanOrEqual(4);
    expect(Math.ceil(32 / l32.cols) * l32.rowH).toBeLessThanOrEqual(230);
    // bez známé výšky (telefon) jeden sloupec
    expect(chainLayout(32, null)).toEqual({ cols: 1, rowH: 28 });
  });

  it("chainLayout: dlouhý řetězec, který se zalomí do více řádků, zmenší řádky, aby se kresba vešla", () => {
    const lens = [16, 0, 0, 0, 0, 0, 0, 0];
    // bez zalomení by řádky měly 50 px; 16 klíčů na 500 px se zalomí do 3 řádků → menší řádky
    const narrow = chainLayout(8, 400, { lens, width: 500 });
    expect(narrow.cols).toBe(1);
    expect(narrow.rowH).toBeLessThan(chainLayout(8, 400).rowH);
    expect(narrow.rowH * 7 + 3 * narrow.rowH + 8).toBeLessThanOrEqual(400);
    expect(narrow.rowH).toBeGreaterThanOrEqual(18);
    // krátké řetězce na širokém plátně se nezalomí – řádky zůstanou velké
    expect(
      chainLayout(8, 600, { lens: [0, 0, 0, 0, 3, 0, 0, 2], width: 1160 }),
    ).toEqual({ cols: 1, rowH: 56 });
  });

  it("chainFonts: písmo klíče roste s řádkem (12–24 px), index o něco menší", () => {
    expect(chainFonts(18).key).toBe(12);
    expect(chainFonts(28).key).toBe(14);
    expect(chainFonts(56).key).toBe(24);
    expect(chainFonts(80).key).toBe(24);
    expect(chainFonts(56).idx).toBeLessThan(chainFonts(56).key);
    expect(chainFonts(18).idx).toBeGreaterThanOrEqual(13);
  });

  it("bloomLayout: filtr do 32 bitů v jedné řadě s místem na klíče vlevo, když jsou bity aspoň 17 px; jinak řady", () => {
    expect(bloomLayout(32, 1164)).toEqual({
      single: true,
      perRow: 32,
      rows: 1,
      w: Math.floor((1164 - 10 - BLOOM_LABEL_W) / 32),
      x0: 5 + BLOOM_LABEL_W,
    });
    expect(bloomLayout(32, 690).single).toBe(true);
    expect(bloomLayout(32, 690).w).toBeGreaterThanOrEqual(19);
    // plátno při 1280 × 720 (≈ 598 px)
    expect(bloomLayout(32, 598).single).toBe(true);
    expect(bloomLayout(32, 598).w).toBeGreaterThanOrEqual(17);
    // m = 64 na 1920 px a telefon: bez matice klíčů, řady jako dřív
    expect(bloomLayout(64, 1164)).toEqual({
      single: false,
      ...bitRows(64, 1164, 20, 48, 32),
      x0: 5,
    });
    expect(bloomLayout(32, 358).single).toBe(false);
  });

  it("bitRows s maxPerRow: m = 64 ve dvou řadách, m ≤ 32 větší bity", () => {
    expect(bitRows(64, 2000, 20, 48, 32)).toEqual({
      perRow: 32,
      rows: 2,
      w: 48,
    });
    expect(bitRows(32, 690, 20, 48, 32).w).toBeGreaterThan(20);
    expect(bitRows(16, 690, 20, 48, 32)).toEqual({
      perRow: 16,
      rows: 1,
      w: 42,
    });
  });
});
