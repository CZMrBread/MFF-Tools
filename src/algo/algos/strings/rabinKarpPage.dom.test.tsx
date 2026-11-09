// @vitest-environment jsdom
/*
 * Stránka Rabin–Karp (jsdom): výchozí příklad, odkaz ?j=&s=&p=&n=, Enter v poli N spustí běh
 * (krok 1, pozastaveno), falešná shoda ≈ v DOM, soudělné P a N = chybový krok, klik na seno vyplní ι.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { click, key, mount, type, type Mounted } from "../../core/domTest";
import { moduleByPath } from "../../registry";
import { RabinKarpPage } from "./RabinKarpPage";

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});
const counter = (el: HTMLElement) =>
  el.querySelector(".step-counter")?.textContent ?? "";
const op = (el: HTMLElement) => el.querySelector(".viz-op")?.textContent ?? "";
const msg = (el: HTMLElement) =>
  el.querySelector(".viz-message")?.textContent ?? "";

describe("Rabin–Karp – stránka", () => {
  let search = "";
  function Spy() {
    search = useLocation().search;
    return null;
  }
  const open = (url: string) =>
    mount(
      h(
        MemoryRouter,
        { initialEntries: [url] },
        h(
          Routes,
          null,
          h(Route, { path: "/string/rabin-karp", element: h(RabinKarpPage) }),
        ),
        h(Spy),
      ),
    );
  it("nadpis z registru, výchozí příklad bez kolize stojí na kroku 1; na konci heše všech okének a 1 výskyt", async () => {
    page = await open("/string/rabin-karp");
    const el = page.el;
    expect(el.querySelector("h1")?.textContent).toBe(
      moduleByPath("/string/rabin-karp")!.title,
    );
    expect(op(el)).toContain("P = 31, N = 101 – bez kolize");
    expect(counter(el)).toMatch(/^krok 1 \/ \d+$/);
    expect(el.querySelector(".rk-params")?.textContent).toContain("N = 101");
    await click(page.button("Na konec"));
    const hashes = [...el.querySelectorAll(".strip-row-num")].at(
      -1,
    )!.textContent;
    expect(hashes).toContain("71");
    expect(hashes).toContain("92");
    expect(msg(el)).toContain("1 výskyt (7)");
  });

  it("odkaz s N = 17: Enter v poli N spustí běh; na konci falešná shoda ≈ v DOM", async () => {
    page = await open("/string/rabin-karp?j=kokos&s=clanekokokosu&p=31&n=101");
    await click(page.button("Hledat(ι, σ)"));
    expect(page.input("N =").value).toBe("101");
    await type(page.input("N ="), "17");
    await key(page.input("N ="), { key: "Enter" });
    expect(op(page.el)).toContain("falešná shoda");
    expect(counter(page.el)).toMatch(/^krok 1 \/ \d+$/);
    expect(
      page.el.querySelector(".ctl-play")?.getAttribute("aria-label"),
    ).not.toBe("Pozastavit");
    expect(search).toContain("n=17");
    await click(page.button("Na konec"));
    expect(page.el.querySelector(".strip-svg")?.textContent).toContain("≈");
    expect(msg(page.el)).toContain("falešných shod 1");
  });

  it("soudělná P = 26, N = 13: jediný chybový krok a výstraha", async () => {
    page = await open("/string/rabin-karp?j=ana&s=bananas&p=26&n=13");
    expect(page.el.querySelector(".viz-message.error")?.textContent).toContain(
      "nesoudělná",
    );
  });

  it("soudělná P a N ve formuláři: hláška u formuláře, formulář zůstane otevřený, běh se nezmění", async () => {
    page = await open("/string/rabin-karp");
    const before = op(page.el);
    const steps = counter(page.el);
    await click(page.button("Hledat(ι, σ)"));
    await type(page.input("P ="), "4");
    await type(page.input("N ="), "18");
    await key(page.input("N ="), { key: "Enter" });
    expect(page.el.querySelector(".am-body")).not.toBeNull();
    expect(page.input("N =").value).toBe("18");
    const alert = page.el.querySelector(".am-msg[role=alert]");
    expect(alert?.textContent).toMatch(/nesoudělná.*gcd\(4, 18\) = 2/);
    expect(op(page.el)).toBe(before);
    expect(counter(page.el)).toBe(steps);
    expect(search).not.toContain("n=18");
  });

  it("velká písmena v jehle: ⚠ ve formuláři ještě před Enterem", async () => {
    page = await open("/string/rabin-karp");
    await click(page.button("Hledat(ι, σ)"));
    await type(page.input("ι ="), "Kokos");
    expect(page.el.querySelector(".am-body .am-msg")?.textContent).toBe(
      "⚠ Velká písmena převedena na malá.",
    );
  });

  it("klik na znak sena vyplní jehlu σ[i : i + J] akce Hledat", async () => {
    page = await open("/string/rabin-karp");
    const cells = page.el.querySelectorAll<SVGElement>(".strip-cell.pickable");
    expect(cells.length).toBeGreaterThan(5);
    await click(cells[5]);
    expect(page.input("ι =").value).toBe("kokok");
  });

  it("legenda: každá třída sw-* existuje v index.css", async () => {
    page = await open("/string/rabin-karp");
    const css = readFileSync(
      resolve(process.cwd(), "src/algo/index.css"),
      "utf8",
    );
    const used = [...page.el.querySelectorAll(".legend .swatch")].flatMap((s) =>
      [...s.classList].filter((c) => c.startsWith("sw-")),
    );
    expect(used.length).toBeGreaterThan(3);
    for (const c of used)
      expect(css, c).toMatch(new RegExp(`\\.swatch\\.${c}\\b`));
  });
});
