/*
 * Logika stránky LLRB (#/tree/llrb) bez Reactu: otevření z odkazu (t=, k=, v=), zápis stavu do odkazu,
 * přepnutí varianty, nabídka akcí, legenda a pseudokód podle operace.
 */
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import type { ActionDef } from "../../core/actionModel";
import {
  buildLlrb,
  emptyLlrb,
  islandsLayout,
  llrbFromSpec,
  llrbLayout,
  llrbSpec,
  PC_LLRB_DELETE,
  PC_LLRB_INSERT_23,
  PC_LLRB_INSERT_24,
} from "./llrb";
import { LLRB_BOOK_EXAMPLES } from "./llrbBook";
import {
  LLRB_DEFAULT_KEYS,
  LLRB_DEFAULT_SPEC,
  LLRB_INSERT_X,
  LLRB_LEGEND,
  LLRB_MAX,
  LLRB_TIP,
  defaultLlrb,
  idlePseudocode,
  linkState,
  llrbActions,
  llrbExampleMessage,
  openLlrb,
  opDisabledReason,
  planOp,
  switchVariant,
  variantFromParam,
} from "./llrbPageModel";

const last = <T>(a: readonly T[]) => a[a.length - 1];

describe("výchozí příklad", () => {
  it("(2,3)-strom z výchozích klíčů se čtyřmi 3-vrcholy; Insert(27) ho rozštěpí rotacemi a přebarvením", () => {
    const st = defaultLlrb();
    expect(st.variant).toBe("23");
    expect(llrbSpec(st)).toBe(LLRB_DEFAULT_SPEC);
    expect(llrbSpec(buildLlrb(LLRB_DEFAULT_KEYS, "23"))).toBe(
      LLRB_DEFAULT_SPEC,
    );
    const steps = materialize(planOp("insert", LLRB_INSERT_X, "23").run(st));
    expect(last(steps).state.vars).toMatchObject({ rotace: 3, přebarvení: 1 });
  });
});

describe("odkaz", () => {
  it("bez parametrů výchozí příklad; výchozí stav se do odkazu nepíše", () => {
    const o = openLlrb({ t: null, k: null, v: null });
    expect(llrbSpec(o.state)).toBe(LLRB_DEFAULT_SPEC);
    expect(o.fromUrl).toBe(false);
    expect(linkState(o.state)).toEqual({ t: null, v: null });
  });
  it("t= nese přesný tvar i barvy, v=24 variantu", () => {
    const o = openLlrb({ t: "4,1r,6r,0,3,5,8,2r,7r,9r", k: null, v: "24" });
    expect(o.state.variant).toBe("24");
    expect(llrbSpec(o.state)).toBe("4,1r,6r,0,3,5,8,2r,7r,9r");
    expect(linkState(o.state)).toEqual({
      t: "4,1r,6r,0,3,5,8,2r,7r,9r",
      v: "24",
    });
  });
  it("t= se stromem, který není LLRB, postaví strom znovu vložením klíčů a řekne proč", () => {
    const o = openLlrb({ t: "1,2r,3r", k: null, v: null });
    expect(o.message).toMatch(/Axiom/);
    expect(llrbSpec(o.state)).toBe(llrbSpec(buildLlrb([1, 2, 3], "23")));
  });
  it("prázdný strom má v odkazu t=-", () => {
    expect(linkState(emptyLlrb("23"))).toEqual({ t: "-", v: null });
    expect(openLlrb({ t: "-", k: null, v: null }).state.root).toBeNull();
  });
  it("k= jsou klíče vložené postupně (ručně psaný odkaz); neplatný v= dá variantu (2,3)", () => {
    const o = openLlrb({ t: null, k: "1,2,3,4", v: "x" });
    expect(o.state.variant).toBe("23");
    expect(llrbSpec(o.state)).toBe(llrbSpec(buildLlrb([1, 2, 3, 4], "23")));
    expect(variantFromParam("24")).toBe("24");
    expect(variantFromParam(null)).toBe("23");
  });
  it("nečitelný odkaz (t=, k=, v=) řekne, co nešlo použít, a ukáže výchozí příklad (UX-09)", () => {
    const t = openLlrb({ t: "garbage", k: null, v: null });
    expect(llrbSpec(t.state)).toBe(LLRB_DEFAULT_SPEC);
    expect(t.message).toMatch(/^Strom z odkazu \(t=\) nešel přečíst/);
    const k = openLlrb({ t: null, k: "a,b", v: null });
    expect(llrbSpec(k.state)).toBe(LLRB_DEFAULT_SPEC);
    expect(k.message).toMatch(/^Klíče z odkazu \(k=\) nešly přečíst/);
    const v = openLlrb({ t: null, k: null, v: "99" });
    expect(v.state.variant).toBe("23");
    expect(v.message).toMatch(/^Varianta „99“ neexistuje/);
    // platný strom + neznámá varianta: hláška před popisem stromu
    const tv = openLlrb({ t: "2,1,3", k: null, v: "x" });
    expect(tv.message).toMatch(/^Varianta „x“ neexistuje.*Strom z odkazu/);
  });
  it("odkaz s víc než LLRB_MAX klíči se ořízne", () => {
    const keys = Array.from({ length: LLRB_MAX + 5 }, (_, i) => i + 1);
    const o = openLlrb({ t: null, k: keys.join(","), v: null });
    expect(Object.keys(o.state.nodes)).toHaveLength(LLRB_MAX);
  });
});

describe("varianta", () => {
  it("(2,3) → (2,4): strom zůstane (každý (2,3)-strom je (2,4)-strom)", () => {
    const st = defaultLlrb();
    const r = switchVariant(st, "24");
    expect(r.state.variant).toBe("24");
    expect(llrbSpec(r.state)).toBe(llrbSpec(st));
  });
  it("(2,4) se 4-vrcholy → (2,3): postaví se znovu ze stejných klíčů", () => {
    const st = llrbFromSpec("4,1r,6r,0,3,5,8,2r,7r,9r", "24")!;
    const r = switchVariant(st, "23");
    expect(r.state.variant).toBe("23");
    expect(r.message).toMatch(/4-vrchol/);
    expect(Object.keys(r.state.nodes)).toHaveLength(10);
  });
  it("pseudokód Insert podle varianty, Delete jen (2,3)", () => {
    expect(planOp("insert", 5, "23").pseudocode).toBe(PC_LLRB_INSERT_23);
    expect(planOp("insert", 5, "24").pseudocode).toBe(PC_LLRB_INSERT_24);
    expect(planOp("delete", 5, "23").pseudocode).toBe(PC_LLRB_DELETE);
    expect(idlePseudocode(null, "24")).toBe(PC_LLRB_INSERT_24);
    expect(idlePseudocode("delete", "23")).toBe(PC_LLRB_DELETE);
  });
  it("mazání ve variantě (2,4) je zakázané s vysvětlením; prázdný strom nejde mazat", () => {
    const st24 = llrbFromSpec("2,1r,3r", "24")!;
    expect(opDisabledReason(st24, "delete")).toMatch(/\(2,3\)/);
    expect(opDisabledReason(st24, "deleteMin")).toMatch(/\(2,3\)/);
    expect(opDisabledReason(st24, "insert")).toBeNull();
    expect(opDisabledReason(emptyLlrb("23"), "deleteMax")).toMatch(/prázdný/);
  });
});

describe("nabídka akcí", () => {
  const actions = (): ActionDef[] =>
    llrbActions(
      {
        state: defaultLlrb(),
        keys: LLRB_DEFAULT_KEYS,
        x: 25,
        insertX: LLRB_INSERT_X,
        seed: () => 1,
      },
      { op: () => {}, rebuild: () => {}, example: () => {}, variant: () => {} },
    );
  it("Vytvořit je první, příklady z knihy hned za vlastními/náhodnými; operace jako v pseudokódu", () => {
    const a = actions();
    expect(a.map((d) => d.label)).toEqual([
      "Vytvořit",
      "Find(x)",
      "Insert(x)",
      "Delete(x)",
      "DeleteMin",
      "DeleteMax",
      "Varianta: (2,3)",
    ]);
    const create = a[0];
    expect(create.variants!.map((v) => v.label)).toContain("Příklady z knihy");
    const book = create.variants!.find((v) => v.id === "book")!;
    const fig = book.args![0];
    expect(fig.kind).toBe("choice");
    if (fig.kind === "choice")
      expect(fig.options.map((o) => o.value)).toEqual(
        LLRB_BOOK_EXAMPLES.map((e) => e.id),
      );
  });
  it("Insert nabízí klíč, který ve stromu není", () => {
    const ins = actions().find((d) => d.id === "insert")!;
    const arg = ins.args![0];
    expect(arg.kind === "int" && arg.default).toBe(LLRB_INSERT_X);
  });
  it("zpráva po načtení příkladu říká stranu, poznámku a předvyplněnou operaci", () => {
    const e = LLRB_BOOK_EXAMPLES.find((x) => x.id === "str-211-pujcka")!;
    expect(llrbExampleMessage(e)).toMatch(/s\. 211/);
    expect(llrbExampleMessage(e)).toMatch(/Předvyplněno DeleteMin/);
  });
});

describe("legenda", () => {
  it("vysvětluje právě ty třídy, které operace kreslí (LLRB i (2,4)-strom)", () => {
    const used = new Set<string>();
    const collect = (st: ReturnType<typeof defaultLlrb>) => {
      const a = llrbLayout(st);
      const b = islandsLayout(st);
      for (const n of [...a.nodes, ...a.edges, ...b.nodes])
        for (const c of (n.cls ?? "").split(" ").filter(Boolean)) used.add(c);
    };
    const trees = [
      defaultLlrb(),
      llrbFromSpec("2,1,4,3r", "23")!,
      llrbFromSpec("3,2,4,1r", "23")!,
      llrbFromSpec("4,1r,6r,0,3,5,8,2r,7r,9r", "24")!,
    ];
    const ops = [
      planOp("insert", 27, "23"),
      planOp("delete", 20, "23"),
      planOp("deleteMin", null, "23"),
      planOp("deleteMax", null, "23"),
      planOp("find", 25, "23"),
      planOp("find", 26, "23"),
    ];
    for (const st of trees)
      for (const p of [
        ...ops,
        planOp("insert", 10, st.variant),
        planOp("insert", 11, st.variant),
      ])
        if (st.variant === "23" || p.title.startsWith("Insert"))
          for (const s of materialize(p.run(structuredClone(st))))
            collect(s.state);
    const legend = new Set(LLRB_LEGEND.flatMap((i) => i.marks));
    expect([...used].sort()).toEqual([...legend].sort());
  });
  it("tip je konkrétní a bez „▶ Spustit“", () => {
    expect(LLRB_TIP.length).toBeGreaterThan(20);
    expect(LLRB_TIP).not.toMatch(/Spustit/);
  });
});
