// @vitest-environment jsdom
/*
 * Odkaz ?t=… v prohlížeči (E4): po Delete nese náhrobek „~“ (otevřená adresace) a skutečné buňky
 * kukačky; odkaz s náhrobkem se otevře se stejnou tabulkou.
 */
import { createElement as h, useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { click, key, mount, type, type Mounted } from "../../core/domTest";
import { CuckooPage } from "./CuckooBloomPage";
import { HashPage } from "./HashPage";

const url = { search: "" };
function Spy() {
  const { search } = useLocation();
  useEffect(() => {
    url.search = search;
  }, [search]);
  return null;
}
const app = (path: string) =>
  h(
    MemoryRouter,
    { initialEntries: [path] },
    h(
      Routes,
      null,
      h(Route, { path: "/hash/cuckoo", element: h(CuckooPage) }),
      h(Route, { path: "/hash/:id", element: h(HashPage) }),
    ),
    h(Spy),
  );

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});
const t = () => new URLSearchParams(url.search).get("t") ?? "";

async function del(p: Mounted, x: number) {
  await click(p.button("Delete(x)"));
  await type(p.input("x ="), String(x));
  await key(p.input("x ="), { key: "Enter" });
}

describe("odkaz hešování zachová stav tabulky (E4)", () => {
  it("otevřená adresace: Delete(19) → odkaz s „~“ v buňce 4, čitelný (bez %7E a %2C)", async () => {
    page = await mount(app("/hash/probing"));
    await del(page, 19);
    expect(page.el.textContent).toContain("Delete(19)");
    expect(t().split(":")[3].split(",")[4]).toBe("~");
    expect(url.search).not.toMatch(/%7E|%2C/i);
  });

  it("odkaz s náhrobkem otevře tabulku s náhrobkem a hláška ho zmíní", async () => {
    page = await mount(
      app("/hash/probing?t=16:mod:1:_,_,_,3,~,35,20,7,_,41,_,_,_,_,_,_"),
    );
    expect(page.el.textContent).toContain(
      "Tabulka z odkazu: 5 klíčů, 1 náhrobek",
    );
    const tombs = page.el.querySelectorAll("g.cell-tomb");
    expect(tombs).toHaveLength(1);
    expect(tombs[0].textContent).toContain("†");
    // odkaz se po načtení nepřepíše na jiný tvar
    expect(t()).toBe("16:mod:1:_,_,_,3,~,35,20,7,_,41,_,_,_,_,_,_");
  });

  it("kukačka: Delete(12) → odkaz nese buňky („_“), nové otevření má 33 v buňce 13", async () => {
    page = await mount(app("/hash/cuckoo"));
    await del(page, 12);
    expect(t()).toContain("_");
    const shared = t();
    await page.unmount();
    page = await mount(app(`/hash/cuckoo?t=${shared}`));
    const cell13 = page.el.querySelector('[aria-label^="buňka 13, klíč 33"]');
    expect(cell13).not.toBeNull();
  });
});
