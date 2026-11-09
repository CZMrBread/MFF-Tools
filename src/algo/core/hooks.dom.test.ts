// @vitest-environment jsdom
/*
 * Hooky a komponenty jádra v DOM (prostředí jsdom z hlavičky souboru – nikdy se potichu nepřeskočí).
 * Čistá logika je navíc pokrytá v player/structure/shortcuts/input testech.
 */
import { describe, expect, it, vi } from "vitest";
import { materialize, snap, type Step, type StepGen } from "./steps";

function* count(n: number): StepGen<number> {
  for (let i = 0; i < n; i++) yield snap(i, null, `krok ${i}`);
}

describe("jádro v DOM (jsdom)", async () => {
  // DOM dodává prostředí jsdom (hlavička souboru) – test se nikdy potichu nepřeskočí
  const dom = { window };
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

  const { act, createElement: h, useLayoutEffect } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { usePlayer } = await import("./usePlayer");
  const { useStructure } = await import("./useStructure");
  const { Controls } = await import("./Controls");
  const { NumberInput } = await import("./NumberInput");
  const { useUrlParam } = await import("./useUrlParam");
  const { useLinkSearchParams } = await import("./linkParams");
  const { MemoryRouter, useLocation } = await import("react-router-dom");
  type Player<S> = import("./usePlayer").Player<S>;
  type Structure<S> = import("./useStructure").Structure<S>;

  const mount = () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return { el, root: createRoot(el) };
  };
  const key = (target: EventTarget, init: KeyboardEventInit) => {
    const ev = new dom.window.KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(ev);
    return ev;
  };

  describe("usePlayer", () => {
    const run = async (startIndex: number, a: number, b: number) => {
      const A = materialize(count(a));
      const B = materialize(count(b));
      const commits: { n: number; index: number; msg: string | null }[] = [];
      let player!: Player<number>;
      function Harness({ steps }: { steps: Step<number>[] }) {
        const p = usePlayer(steps);
        player = p;
        useLayoutEffect(() => {
          commits.push({
            n: steps.length,
            index: p.index,
            msg: p.current?.message ?? null,
          });
        });
        return h("div", null, p.current?.message ?? "—");
      }
      const { root } = mount();
      await act(async () => root.render(h(Harness, { steps: A })));
      await act(async () => player.seek(startIndex));
      commits.length = 0;
      await act(async () => root.render(h(Harness, { steps: B })));
      root.unmount();
      return commits.filter((c) => c.n === b);
    };

    it("nová kratší sada kroků: žádný commit s indexem mimo rozsah (prázdné plátno)", async () => {
      const commits = await run(29, 30, 5);
      expect(commits.length).toBeGreaterThan(0);
      expect(commits.every((c) => c.index === 0 && c.msg === "krok 0")).toBe(
        true,
      );
    });

    it("nová sada kroků: nikdy se neukáže krok ze středu nové operace", async () => {
      const commits = await run(3, 30, 5);
      expect(commits.map((c) => c.msg)).toEqual(commits.map(() => "krok 0"));
    });

    it("druhý parametr jako číslo (starší volání) i jako objekt", async () => {
      const steps = materialize(count(3));
      let a!: Player<number>;
      let b!: Player<number>;
      function Harness() {
        a = usePlayer(steps, 250);
        b = usePlayer(steps, { initialDelay: 1000 });
        return null;
      }
      const { root } = mount();
      await act(async () => root.render(h(Harness)));
      // globální localStorage tu není → platí výchozí prodleva z parametru
      expect(a.delay).toBe(250);
      expect(b.delay).toBe(1000);
      root.unmount();
    });
  });

  describe("useStructure + přehrávač", () => {
    const setup = async (initial: { v: number } | (() => { v: number })) => {
      let s!: Structure<{ v: number }>;
      let p!: Player<{ v: number }>;
      function Harness() {
        s = useStructure(initial);
        p = usePlayer(s.steps);
        return h("div", null, "mounted");
      }
      const m = mount();
      await act(async () => m.root.render(h(Harness)));
      return { ...m, s: () => s, p: () => p };
    };
    const inc = function* (st: { v: number }): StepGen<{ v: number }> {
      yield snap(st, 0, "před");
      st.v++;
      yield snap(st, 1, "po");
    };

    it("inicializátor se zavolá jen jednou, i když se stránka překresluje", async () => {
      const init = vi.fn(() => ({ v: 7 }));
      const t = await setup(init);
      await act(async () => t.s().run("Inc", ["a", "b"], inc));
      await act(async () => t.p().next());
      expect(init).toHaveBeenCalledTimes(1);
      expect(t.s().last.v).toBe(8);
      t.root.unmount();
    });

    it("po operaci, undo ani resetu se přehrávání samo nespustí – stojí na kroku 1, ▶ ho rozběhne", async () => {
      const t = await setup({ v: 0 });
      expect(t.p().playing).toBe(false);
      await act(async () => t.s().run("Inc", ["a", "b"], inc));
      expect(t.p().playing).toBe(false);
      expect(t.p().index).toBe(0);
      await act(async () => t.p().play());
      expect(t.p().playing).toBe(true);
      await act(async () => t.s().undo());
      expect(t.p().playing).toBe(false);
      expect(t.s().last.v).toBe(0);
      await act(async () => t.s().reset({ v: 5 }, "nastaveno", "Postavit"));
      expect(t.p().playing).toBe(false);
      t.root.unmount();
    });

    it("operace jen s chybovými kroky se nepřehrává a nejde vrátit", async () => {
      const t = await setup({ v: 0 });
      await act(async () => t.s().run("Inc", [], inc));
      await act(async () => t.p().pause());
      await act(async () =>
        t.s().run("Pop", [], function* (st) {
          yield { ...snap(st, 0, "prázdné"), error: true };
        }),
      );
      expect(t.p().playing).toBe(false);
      expect(t.p().current?.message).toBe("prázdné");
      expect(t.s().opId).toBe(1);
      expect(t.s().history).toEqual(["Inc"]);
      expect(t.s().last.v).toBe(1);
      t.root.unmount();
    });

    it("dvě operace za sebou v jedné obsluze na sebe navazují", async () => {
      const t = await setup({ v: 0 });
      await act(async () => {
        t.s().run("Inc", [], inc);
        t.s().run("Inc", [], inc);
      });
      expect(t.s().last.v).toBe(2);
      expect(t.s().history).toEqual(["Inc", "Inc"]);
      t.root.unmount();
    });

    it("výjimka v generátoru neshodí aplikaci a ukáže chybový krok", async () => {
      const t = await setup({ v: 0 });
      const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
      await act(async () =>
        // eslint-disable-next-line require-yield -- záměrně: operace, která spadne před prvním krokem
        t.s().run("Bad", [], function* () {
          throw new Error("boom");
        }),
      );
      quiet.mockRestore();
      expect(t.el.textContent).toBe("mounted");
      expect(t.p().current?.error).toBe(true);
      expect(t.p().current?.message).toMatch(/boom/);
      t.root.unmount();
    });
  });

  describe("Controls – klávesové zkratky a přístupnost", () => {
    const steps = materialize(count(10));
    const setup = async () => {
      const player: Player<number> = {
        steps,
        index: 3,
        current: steps[3],
        playing: false,
        delay: 500,
        setDelay: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        toggle: vi.fn(),
        next: vi.fn(),
        prev: vi.fn(),
        first: vi.fn(),
        last: vi.fn(),
        seek: vi.fn(),
        atStart: false,
        atEnd: false,
      };
      const m = mount();
      await act(async () => m.root.render(h(Controls<number>, { player })));
      return { ...m, player };
    };

    it("mezerník na tlačítku, ke kterému uživatel došel klávesnicí, patří tlačítku", async () => {
      const t = await setup();
      const other = document.createElement("button");
      document.body.appendChild(other);
      key(document.body, { key: "Tab" });
      const ev = key(other, { key: " " });
      expect(ev.defaultPrevented).toBe(false);
      expect(t.player.toggle).not.toHaveBeenCalled();
      other.remove();
      t.root.unmount();
    });

    it("Home / End obslouží přehrávač a nerolují stránkou; s modifikátory nic", async () => {
      const t = await setup();
      expect(key(document.body, { key: "Home" }).defaultPrevented).toBe(true);
      expect(key(document.body, { key: "End" }).defaultPrevented).toBe(true);
      key(document.body, { key: "ArrowLeft", altKey: true });
      key(document.body, { key: "End", ctrlKey: true });
      expect(t.player.first).toHaveBeenCalledTimes(1);
      expect(t.player.last).toHaveBeenCalledTimes(1);
      expect(t.player.prev).not.toHaveBeenCalled();
      t.root.unmount();
    });

    it("mezerník funguje i s fokusem na posuvníku kroků; šipky tam patří posuvníku", async () => {
      const t = await setup();
      const seek = t.el.querySelector("input.seek")!;
      key(seek, { key: " " });
      key(seek, { key: "ArrowRight" });
      expect(t.player.toggle).toHaveBeenCalledTimes(1);
      expect(t.player.next).not.toHaveBeenCalled();
      t.root.unmount();
    });

    it("+ / − přepnou rychlost o stupeň, Esc přehrávač nechá být", async () => {
      const t = await setup();
      expect(
        key(document.body, { key: "+", shiftKey: true }).defaultPrevented,
      ).toBe(true);
      key(document.body, { key: "-" });
      expect(t.player.setDelay).toHaveBeenNthCalledWith(1, 250);
      expect(t.player.setDelay).toHaveBeenNthCalledWith(2, 1000);
      const esc = key(document.body, { key: "Escape" });
      expect(esc.defaultPrevented).toBe(false);
      expect(t.player.toggle).not.toHaveBeenCalled();
      expect(t.player.setDelay).toHaveBeenCalledTimes(2);
      t.root.unmount();
    });

    it("tlačítka i posuvník mají přístupné názvy", async () => {
      const t = await setup();
      const buttons = [...t.el.querySelectorAll("button")];
      expect(buttons.length).toBe(5);
      expect(
        buttons.every((b) => (b.getAttribute("aria-label") ?? "").length > 0),
      ).toBe(true);
      const seek = t.el.querySelector("input.seek")!;
      expect(seek.getAttribute("aria-label")).toBe("Krok");
      expect(seek.getAttribute("aria-valuetext")).toBe("krok 4 z 10");
      t.root.unmount();
    });
  });

  describe("NumberInput", () => {
    it("blur bez změny textu nevolá onChange", async () => {
      const onChange = vi.fn();
      const { el, root } = mount();
      await act(async () =>
        root.render(h(NumberInput, { values: [3, 1, 2], onChange })),
      );
      const input = el.querySelector('input[type="text"]') as HTMLInputElement;
      await act(async () => {
        input.dispatchEvent(
          new dom.window.FocusEvent("focusin", { bubbles: true }),
        );
        input.dispatchEvent(
          new dom.window.FocusEvent("focusout", { bubbles: true }),
        );
      });
      expect(onChange).not.toHaveBeenCalled();
      root.unmount();
    });

    it("children se vykreslí na konci řádku s předvolbami", async () => {
      const { el, root } = mount();
      await act(async () =>
        root.render(
          h(
            NumberInput,
            { values: [1, 2], onChange: () => {} },
            h("button", { id: "extra" }, "Navíc"),
          ),
        ),
      );
      const row = el.querySelector(".input-buttons")!;
      expect(row.lastElementChild?.id).toBe("extra");
      root.unmount();
    });

    it("když rodič změní values, pole ukazuje nové hodnoty", async () => {
      const { el, root } = mount();
      await act(async () =>
        root.render(
          h(NumberInput, { values: [38, 27, 82], onChange: () => {} }),
        ),
      );
      await act(async () =>
        root.render(h(NumberInput, { values: [4, 9, 1], onChange: () => {} })),
      );
      expect(
        (el.querySelector('input[type="text"]') as HTMLInputElement).value,
      ).toBe("4 9 1");
      root.unmount();
    });
  });

  describe("useUrlParam", () => {
    const setup = async (url: string) => {
      const set: Record<string, (v: string | null) => void> = {};
      let search = "";
      function Param({ name }: { name: string }) {
        const [value, setValue] = useUrlParam(name);
        set[name] = setValue;
        return h("span", null, `${name}=${value ?? "∅"};`);
      }
      function Where() {
        search = useLocation().search;
        return null;
      }
      const m = mount();
      await act(async () =>
        m.root.render(
          h(
            MemoryRouter,
            { initialEntries: [url] },
            h(Param, { name: "a" }),
            h(Param, { name: "b" }),
            h(Where),
          ),
        ),
      );
      return {
        ...m,
        set,
        search: () => new URLSearchParams(search),
        raw: () => search,
      };
    };

    it("dva settery (různé instance) v jedné obsluze: zapíšou se oba parametry", async () => {
      const t = await setup("/x?keep=1");
      await act(async () => {
        t.set.a("1,2");
        t.set.b("7");
      });
      expect(t.search().get("a")).toBe("1,2");
      expect(t.search().get("b")).toBe("7");
      expect(t.search().get("keep")).toBe("1");
      expect(t.el.textContent).toBe("a=1,2;b=7;");
      t.root.unmount();
    });

    it("zápis a smazání v jedné obsluze i stejný setter dvakrát: platí poslední hodnota", async () => {
      const t = await setup("/x?a=5&b=6");
      await act(async () => {
        t.set.a("8");
        t.set.b(null);
        t.set.a("9");
      });
      expect(t.search().get("a")).toBe("9");
      expect(t.search().has("b")).toBe(false);
      // další obsluha navazuje na vykreslenou adresu
      await act(async () => t.set.b("3"));
      expect(t.search().get("a")).toBe("9");
      expect(t.search().get("b")).toBe("3");
      t.root.unmount();
    });

    it("E7: zapisuje čitelný odkaz (čárky, dvojtečky, ~ bez %XX); starý odkaz s %2C se čte stejně", async () => {
      const t = await setup("/x?a=1%2C2&keep=1");
      expect(t.el.textContent).toBe("a=1,2;b=∅;");
      await act(async () => {
        t.set.a("4,2,8");
        t.set.b("4:mod:~,5");
      });
      expect(t.raw()).toBe("?a=4,2,8&keep=1&b=4:mod:~,5");
      expect(t.search().get("b")).toBe("4:mod:~,5");
      t.root.unmount();
    });
  });

  describe("useLinkSearchParams (E7)", () => {
    it("drop-in náhrada useSearchParams: čitelný zápis, funkce prev → next, stabilní setter", async () => {
      let search = "";
      let api: ReturnType<typeof useLinkSearchParams> | null = null;
      const setters = new Set<unknown>();
      function Page() {
        api = useLinkSearchParams();
        setters.add(api[1]);
        search = useLocation().search;
        return h("span", null, api[0].get("a") ?? "∅");
      }
      const m = mount();
      await act(async () =>
        m.root.render(
          h(MemoryRouter, { initialEntries: ["/x?a=1%2C2"] }, h(Page)),
        ),
      );
      expect(m.el.textContent).toBe("1,2");
      await act(async () =>
        api![1](new URLSearchParams({ a: "3,4", t: "8:mod" }), {
          replace: true,
        }),
      );
      expect(search).toBe("?a=3,4&t=8:mod");
      expect(m.el.textContent).toBe("3,4");
      await act(async () =>
        api![1]((prev) => {
          prev.set("a", "5,6");
          return prev;
        }),
      );
      expect(search).toBe("?a=5,6&t=8:mod");
      await act(async () => api![1]({}));
      expect(search).toBe("");
      expect(setters.size).toBe(1);
      m.root.unmount();
    });
  });
});
