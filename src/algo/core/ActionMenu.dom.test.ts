// @vitest-environment jsdom
// ActionMenu v DOM (tenká vrstva nad actionModel.ts): Enter / Go, okamžité akce bez argumentů, varianty,
// zakázaná akce s důvodem, Esc, výběr klikem zvenku (pick), přístupnost.
import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { ActionMenu } from "./ActionMenu";
import { useActionMenu, type ActionMenuControl } from "./useActionMenu";
import type { ActionDef } from "./actionModel";
import { act, click, key, mount, type } from "./domTest";

function setup(over: Partial<Record<string, Partial<ActionDef>>> = {}) {
  const run = {
    create: vi.fn(),
    push: vi.fn(),
    pop: vi.fn(),
  };
  const defs: ActionDef[] = [
    {
      id: "create",
      label: "Vytvořit",
      variants: [
        { id: "random", label: "Náhodně" },
        {
          id: "custom",
          label: "Vlastní",
          args: [
            {
              kind: "list",
              name: "A",
              label: "A =",
              min: 0,
              max: 99,
              maxCount: 8,
              default: [5, 3, 9],
            },
          ],
        },
        {
          id: "book",
          label: "Příklady z knihy",
          args: [
            {
              kind: "choice",
              name: "fig",
              label: "Obrázek",
              options: [
                { value: "4.1", label: "Obr. 4.1" },
                { value: "4.2", label: "Obr. 4.2" },
              ],
            },
          ],
        },
      ],
      run: run.create,
    },
    {
      id: "push",
      label: "Push(x)",
      args: [
        { kind: "int", name: "x", label: "x =", min: 0, max: 99, default: 7 },
      ],
      run: run.push,
    },
    { id: "pop", label: "Pop", run: run.pop },
  ].map((d) => ({ ...d, ...over[d.id] }) as ActionDef);
  let control!: ActionMenuControl;
  function Harness() {
    control = useActionMenu(defs);
    return h(ActionMenu, { menu: control });
  }
  return { run, harness: h(Harness), control: () => control };
}

describe("ActionMenu (jsdom)", () => {
  it("klik na akci s argumentem ji rozbalí a dá fokus do pole; Enter provede s hodnotou", async () => {
    const t = setup();
    const m = await mount(t.harness);
    const action = m.button("Push(x)");
    expect(action.getAttribute("aria-expanded")).toBe("false");
    await click(action);
    expect(action.getAttribute("aria-expanded")).toBe("true");
    const x = m.input("x =");
    expect(document.activeElement).toBe(x);
    expect(x.value).toBe("7");
    await type(x, "12");
    await key(x, { key: "Enter" });
    expect(t.run.push).toHaveBeenCalledTimes(1);
    expect(t.run.push).toHaveBeenCalledWith({ x: 12 }, null);
    // argument si menu pamatuje
    expect(m.input("x =").value).toBe("12");
    await m.unmount();
  });

  it("neplatný argument: hláška (při psaní role=status, po Enter role=alert), Go zablokované s důvodem, Enter nic neprovede", async () => {
    const t = setup();
    const m = await mount(t.harness);
    await click(m.button("Push(x)"));
    await type(m.input("x ="), "abc");
    // při psaní čtečka nepřerušuje (A-04): hláška je zdvořilá, pole má aria-invalid
    const msg = m.el.querySelector(".am-msg");
    expect(msg?.textContent).toBe("Zadejte celé číslo od 0 do 99.");
    expect(msg?.getAttribute("role")).toBe("status");
    expect(m.el.querySelector('[role="alert"]')).toBeNull();
    expect(m.input("x =").getAttribute("aria-invalid")).toBe("true");
    const go = m.button("Provést");
    expect(go.getAttribute("aria-disabled")).toBe("true");
    expect(go.title).toContain("Zadejte celé číslo");
    await key(m.input("x ="), { key: "Enter" });
    // pokus o provedení: teď je to výstraha
    expect(m.el.querySelector('[role="alert"]')?.textContent).toBe(
      "Zadejte celé číslo od 0 do 99.",
    );
    // další psaní ji zase ztiší
    await type(m.input("x ="), "abcd");
    expect(m.el.querySelector('[role="alert"]')).toBeNull();
    await click(go);
    expect(t.run.push).not.toHaveBeenCalled();
    await m.unmount();
  });

  it("varianty jsou jedna zastávka tabulátoru (toolbar), šipky jen přesouvají fokus a nic nespouští (A-05)", async () => {
    const t = setup();
    const m = await mount(t.harness);
    await click(m.button("Vytvořit"));
    const bar = m.el.querySelector(".am-variants")!;
    expect(bar.getAttribute("role")).toBe("toolbar");
    const vs = [...bar.querySelectorAll<HTMLButtonElement>(".am-variant")];
    expect(vs.map((b) => b.getAttribute("role"))).toEqual(vs.map(() => null));
    // jediná zastávka = zvolená varianta
    expect(vs.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    const current = vs.find((b) => b.tabIndex === 0)!;
    expect(current.getAttribute("aria-pressed")).toBe("true");
    current.focus();
    const i = vs.indexOf(current);
    await key(current, { key: "ArrowRight" });
    expect(document.activeElement).toBe(vs[(i + 1) % vs.length]);
    await key(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(vs[vs.length - 1]);
    await key(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(vs[0]);
    await key(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(vs[vs.length - 1]);
    expect(t.run.create).not.toHaveBeenCalled();
    await m.unmount();
  });

  it("ignorované položky seznamu: poznámka je varování (třída warn, ⚠), ne šedý text (UX-08)", async () => {
    const t = setup();
    const m = await mount(t.harness);
    await click(m.button("Vytvořit"));
    await click(m.button("Vlastní"));
    await type(m.input("A ="), "5, x, 9");
    const msg = m.el.querySelector(".am-msg")!;
    expect(msg.textContent).toMatch(/^⚠ .*Ignorováno: x/);
    expect(msg.classList.contains("warn")).toBe(true);
    await m.unmount();
  });

  it("ignorované položky po provedení a sbalení akce: varování zůstane vidět pod akcemi do další úpravy (AUD-UX08)", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes("1100px"),
      media: q,
    })) as unknown as typeof window.matchMedia;
    try {
      const t = setup();
      const m = await mount(t.harness);
      await click(m.button("Vytvořit"));
      await click(m.button("Vlastní"));
      await type(m.input("A ="), "5, x, 9");
      await key(m.input("A ="), { key: "Enter" });
      expect(t.run.create).toHaveBeenCalledTimes(1);
      expect(m.el.querySelector(".am-body"), "sbaleno").toBeNull();
      const note = m.el.querySelector(".am-ran-note");
      expect(note?.textContent).toMatch(/^⚠ .*Ignorováno: x/);
      expect(note?.classList.contains("warn")).toBe(true);
      expect(note?.getAttribute("role")).toBe("status");
      // další akce bez ignorovaných položek varování smaže
      await click(m.button("Pop"));
      // živá oblast zůstává v DOM, jen prázdná
      expect(m.el.querySelector(".am-ran-note")?.textContent).toBe("");
      await m.unmount();
    } finally {
      window.matchMedia = original;
    }
  });

  it("upozornění akce (notice) ukáže ⚠ ve formuláři a po provedení zůstane pod akcemi", async () => {
    const t = setup({
      push: {
        notice: (v) =>
          Number(v.x) > 16 ? `x vezmeme mod 17 = ${Number(v.x) % 17}` : null,
      },
    });
    const m = await mount(t.harness);
    await click(m.button("Push(x)"));
    await type(m.input("x ="), "20");
    const msg = m.el.querySelector(".am-body .am-msg")!;
    expect(msg.textContent).toBe("⚠ x vezmeme mod 17 = 3");
    expect(msg.classList.contains("warn")).toBe(true);
    await key(m.input("x ="), { key: "Enter" });
    expect(t.run.push).toHaveBeenCalledTimes(1);
    expect(t.control().ranNote).toBe("x vezmeme mod 17 = 3");
    await m.unmount();
  });

  it("varování po provedení nesmaže programové doplnění pole (stránka pole sesynchronizuje), jen psaní uživatele", async () => {
    const t = setup();
    const m = await mount(t.harness);
    await click(m.button("Vytvořit"));
    await click(m.button("Vlastní"));
    await type(m.input("A ="), "5, x, 9");
    await key(m.input("A ="), { key: "Enter" });
    // stránka po běhu zapíše vyčištěný vstup do pole
    await act(async () => {
      t.control().dispatch({ type: "text", name: "A", text: "5, 9" });
    });
    expect(t.control().ranNote).toMatch(/Ignorováno: x/);
    // formulář zůstal otevřený (úzké okno se nesbaluje) – varování je vidět v něm
    expect(m.el.querySelector(".am-body .am-msg")?.textContent).toMatch(
      /^⚠ .*Ignorováno: x/,
    );
    await type(m.input("A ="), "5, 9, 1");
    expect(t.control().ranNote).toBeNull();
    expect(m.el.querySelector(".am-body .am-msg")?.textContent).toBe("");
    await m.unmount();
  });

  it("akce bez argumentu se provede hned; zakázaná ukáže důvod a neprovede se", async () => {
    const t = setup();
    const m = await mount(t.harness);
    await click(m.button("Pop"));
    expect(t.run.pop).toHaveBeenCalledWith({}, null);
    const d = setup({
      pop: { disabledReason: "Zásobník je prázdný – Pop by skončil chybou" },
    });
    const m2 = await mount(d.harness);
    const pop = [...m2.el.querySelectorAll("button")].find(
      (b) => b.textContent === "Pop",
    )!;
    expect(pop.getAttribute("aria-disabled")).toBe("true");
    expect(pop.title).toBe("Zásobník je prázdný – Pop by skončil chybou");
    await click(pop);
    expect(d.run.pop).not.toHaveBeenCalled();
    expect(m2.el.textContent).toContain("Zásobník je prázdný");
    await m.unmount();
    await m2.unmount();
  });

  it("Vytvořit: varianta bez argumentu se provede hned, Vlastní ukáže pole A =, Příklady z knihy nabídku", async () => {
    const t = setup();
    const m = await mount(t.harness);
    await click(m.button("Vytvořit"));
    const random = m.button("Náhodně");
    await click(random);
    expect(t.run.create).toHaveBeenLastCalledWith({}, "random");
    await click(m.button("Vlastní"));
    expect(m.button("Vlastní").getAttribute("aria-pressed")).toBe("true");
    const A = m.input("A =");
    await type(A, "A = 1, 2, 3");
    await key(A, { key: "Enter" });
    expect(t.run.create).toHaveBeenLastCalledWith({ A: [1, 2, 3] }, "custom");
    expect(m.input("A =").value).toBe("1, 2, 3");
    await click(m.button("Příklady z knihy"));
    const fig = m.input("Obrázek") as unknown as HTMLSelectElement;
    expect(fig.tagName).toBe("SELECT");
    expect([...fig.options].map((o) => o.textContent)).toEqual([
      "Obr. 4.1",
      "Obr. 4.2",
    ]);
    await type(fig, "4.2");
    await click(m.button("Provést"));
    expect(t.run.create).toHaveBeenLastCalledWith({ fig: "4.2" }, "book");
    await m.unmount();
  });

  it("Esc v poli zavře akci a vrátí fokus na její tlačítko; Esc odjinud zavře otevřenou akci", async () => {
    const t = setup();
    const m = await mount(t.harness);
    await click(m.button("Push(x)"));
    await key(m.input("x ="), { key: "Escape" });
    expect(m.button("Push(x)").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(m.button("Push(x)"));
    await click(m.button("Push(x)"));
    await key(document.body, { key: "Escape" });
    expect(m.button("Push(x)").getAttribute("aria-expanded")).toBe("false");
    await m.unmount();
  });

  it("pick zvenku (klik na prvek plátna) vyplní x a otevře akci, fokus na Provést", async () => {
    const t = setup();
    const m = await mount(t.harness);
    await act(async () => t.control().pick(42));
    expect(m.button("Push(x)").getAttribute("aria-expanded")).toBe("true");
    expect(m.input("x =").value).toBe("42");
    expect(document.activeElement).toBe(m.button("Provést"));
    await click(m.button("Provést"));
    expect(t.run.push).toHaveBeenCalledWith({ x: 42 }, null);
    await m.unmount();
  });

  it("tělo otevřené akce leží v DOM až za seznamem tlačítek (pořadí tabulátoru = pořadí na obrazovce)", async () => {
    const t = setup();
    const m = await mount(t.harness);
    await click(m.button("Push(x)"));
    const list = m.el.querySelector(".am-list")!;
    const body = m.el.querySelector(".am-body")!;
    expect(body).toBeTruthy();
    expect(list.contains(body)).toBe(false);
    expect(list.nextElementSibling).toBe(body);
    // seznam bez odrážek si roli drží výslovně (Safari ji u list-style: none zahodí)
    expect(list.getAttribute("role")).toBe("list");
    for (const li of list.querySelectorAll(":scope > li"))
      expect(li.getAttribute("role")).toBe("listitem");
    // tlačítko akce dál ukazuje na své tělo
    expect(m.button("Push(x)").getAttribute("aria-controls")).toBe(body.id);
    await m.unmount();
  });

  it("skupina má přístupný název a akce jsou obyčejná tlačítka v pořadí tabulátoru", async () => {
    const t = setup();
    const m = await mount(t.harness);
    const group = m.el.querySelector('[role="group"]')!;
    expect(group.getAttribute("aria-label")).toBe("Operace");
    const labels = [...m.el.querySelectorAll("button.am-action")].map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(["Vytvořit", "Push(x)", "Pop"]);
    await m.unmount();
  });

  it("na telefonu a na desktopu na jednu obrazovku se akce po provedení sbalí (plátno má zpět své místo), jinde zůstane otevřená", async () => {
    const original = window.matchMedia;
    // „obrazovka“ = část dotazu, kterou splňuje: telefon (max-width: 700px), desktop na jednu
    // obrazovku (min-width: 1100px) and (min-height: 600px), střední šířka nic z toho
    const media = (part: string | null) =>
      ((q: string) => ({
        matches: part !== null && q.includes(part),
        media: q,
      })) as unknown as typeof window.matchMedia;
    try {
      for (const [part, collapsed] of [
        ["700px", true],
        ["1100px", true],
        [null, false],
      ] as const) {
        window.matchMedia = media(part);
        const t = setup();
        const m = await mount(t.harness);
        await click(m.button("Push(x)"));
        await key(m.input("x ="), { key: "Enter" });
        expect(t.run.push).toHaveBeenCalledTimes(1);
        expect(
          m.button("Push(x)").getAttribute("aria-expanded"),
          String(part),
        ).toBe(collapsed ? "false" : "true");
        // po sbalení fokus nezmizí na <body>: vrátí se na tlačítko akce (Enter ji zase otevře)
        if (collapsed)
          expect(document.activeElement, String(part)).toBe(
            m.button("Push(x)"),
          );
        await m.unmount();
      }
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("selectedVariant (GRAPH-05)", () => {
  const pressed = (m: { el: HTMLElement }) =>
    [...m.el.querySelectorAll(".am-variant")]
      .filter((b) => b.getAttribute("aria-pressed") === "true")
      .map((b) => b.textContent);

  it("selectedVariant: null → žádná varianta zvýrazněná; tabulátor dál na první", async () => {
    const t = setup({ create: { selectedVariant: null } });
    const m = await mount(t.harness);
    await click(m.button("Vytvořit"));
    expect(pressed(m)).toEqual([]);
    expect(m.el.querySelectorAll(".am-variant.active").length).toBe(0);
    expect(m.button("Náhodně").tabIndex).toBe(0);
    await m.unmount();
  });

  it("selectedVariant: 'book' → zvýrazněná jen ta", async () => {
    const t = setup({ create: { selectedVariant: "book" } });
    const m = await mount(t.harness);
    await click(m.button("Vytvořit"));
    expect(pressed(m)).toEqual(["Příklady z knihy"]);
    await m.unmount();
  });

  it("bez vlastnosti jako dřív: zvýrazněná zvolená (první) varianta", async () => {
    const t = setup();
    const m = await mount(t.harness);
    await click(m.button("Vytvořit"));
    expect(pressed(m)).toEqual(["Náhodně"]);
    await m.unmount();
  });
});

describe("široká pole seznamu (TREEHASH-19)", () => {
  it("argument typu seznam se roztáhne na zbytek řádku (třída am-arg-wide, bez pevné šířky); číslo ne", async () => {
    const t = setup();
    const m = await mount(t.harness);
    await click(m.button("Vytvořit"));
    await click(m.button("Vlastní"));
    const list = m.input("A =");
    expect(list.closest(".am-arg")?.classList.contains("am-arg-wide")).toBe(
      true,
    );
    expect(list.style.width).toBe("");
    await click(m.button("Push(x)"));
    const x = m.input("x =");
    expect(x.closest(".am-arg")?.classList.contains("am-arg-wide")).toBe(false);
    expect(x.style.width).toBe("4.5rem");
    await m.unmount();
  });
});
