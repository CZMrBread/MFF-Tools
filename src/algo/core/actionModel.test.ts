// Model ActionMenu (čisté funkce): otevírání akcí, argumenty a jejich validace, varianty „Vytvořit“,
// zapamatované argumenty, výběr klikem na plátně, zakázané akce s důvodem.
import { describe, expect, it, vi } from "vitest";
import {
  actionArgs,
  argText,
  initialMenu,
  menuReducer,
  pickTarget,
  prepareGo,
  validateArg,
  type ActionDef,
  type ArgDef,
  type ListArgDef,
  type MenuState,
} from "./actionModel";

const X = {
  kind: "int",
  name: "x",
  label: "x =",
  min: -9,
  max: 99,
  default: 7,
} as const;

function defs(
  over: Partial<Record<string, Partial<ActionDef>>> = {},
): ActionDef[] {
  const base: ActionDef[] = [
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
              maxCount: 4,
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
      run: vi.fn(),
    },
    { id: "push", label: "Push(x)", args: [X], run: vi.fn() },
    { id: "pop", label: "Pop", run: vi.fn() },
    { id: "find", label: "Find(x)", args: [X], run: vi.fn() },
  ];
  return base.map((d) => ({ ...d, ...over[d.id] }));
}

const reduce = (
  st: MenuState,
  ...actions: Parameters<typeof menuReducer>[1][]
) => actions.reduce(menuReducer, st);

describe("otevírání akcí", () => {
  it("na začátku je vše zavřené, varianta = první, argumenty z výchozích hodnot", () => {
    const d = defs();
    const st = initialMenu(d);
    expect(st.open).toBeNull();
    expect(st.variant.create).toBe("random");
    expect(argText(st, X)).toBe("7");
    expect(
      argText(
        st,
        actionArgs(d[0], { ...st, variant: { create: "custom" } })[0],
      ),
    ).toBe("5, 3, 9");
  });
  it("otevření jedné akce zavře ostatní; druhé kliknutí ji zavře; Esc (close) zavře vše", () => {
    const st = initialMenu(defs());
    const a = reduce(st, { type: "toggle", id: "push" });
    expect(a.open).toBe("push");
    expect(reduce(a, { type: "toggle", id: "find" }).open).toBe("find");
    expect(reduce(a, { type: "toggle", id: "push" }).open).toBeNull();
    expect(reduce(a, { type: "close" }).open).toBeNull();
    // zavřít zavřené = tentýž objekt (React nepřekresluje)
    expect(menuReducer(st, { type: "close" })).toBe(st);
  });
  it("varianta Vytvořit: výběr si menu pamatuje, argumenty jsou ty z varianty", () => {
    const d = defs();
    const st = reduce(initialMenu(d), {
      type: "variant",
      id: "create",
      variant: "custom",
    });
    expect(st.variant.create).toBe("custom");
    expect(actionArgs(d[0], st).map((a) => a.name)).toEqual(["A"]);
    expect(actionArgs(d[0], initialMenu(d))).toEqual([]);
  });
});

describe("validace argumentů", () => {
  it("int: prázdné, mimo rozsah a nečíselné pole je chyba s hláškou; „x = 5“ projde", () => {
    expect(validateArg(X, "12")).toEqual({
      value: 12,
      error: null,
      note: null,
    });
    expect(validateArg(X, "x = 5").value).toBe(5);
    expect(validateArg(X, "").error).toBe("Zadejte celé číslo od −9 do 99.");
    expect(validateArg(X, "100").error).toBe("Zadejte celé číslo od −9 do 99.");
    expect(validateArg(X, "1.5").value).toBeUndefined();
  });
  it("list: použije platná čísla, ignorované / oříznuté ohlásí poznámkou; nic platného = chyba", () => {
    const A = defs()[0].variants![1].args![0] as ListArgDef;
    expect(validateArg(A, "A = 5, 3, 9")).toEqual({
      value: [5, 3, 9],
      error: null,
      note: null,
    });
    const r = validateArg(A, "1 2 x 3 4 5");
    expect(r.value).toEqual([1, 2, 3, 4]);
    expect(r.error).toBeNull();
    expect(r.note).toContain("Použito prvních 4 z 5 čísel");
    expect(r.note).toContain("x");
    expect(validateArg(A, "abc").error).toContain("Zadejte aspoň jedno");
    expect(validateArg({ ...A, allowEmpty: true }, "").value).toEqual([]);
  });
  it("list s integerOnly: false bere i desetinná čísla (FFT, maska 1/2, 1/4 …); výchozí jen celá", () => {
    const D: ListArgDef = {
      kind: "list",
      name: "z",
      label: "z =",
      integerOnly: false,
      min: -100,
      max: 100,
      default: [0.5, 0.25, 0, -1.5],
    };
    expect(validateArg(D, "z = 0.5, 0.25, 0, −1.5")).toEqual({
      value: [0.5, 0.25, 0, -1.5],
      error: null,
      note: null,
    });
    // výchozí text pole: desetinná tečka, typografické minus
    expect(argText(initialMenu([]), D)).toBe("0.5, 0.25, 0, −1.5");
    const r = validateArg(D, "1.5 x 200");
    expect(r.value).toEqual([1.5]);
    expect(r.note).toContain("povolena jsou čísla od −100 do 100");
    // bez integerOnly zůstává celočíselná validace jako dřív
    const I: ListArgDef = { ...D, integerOnly: undefined };
    expect(validateArg(I, "1 2.5 3").value).toEqual([1, 3]);
    expect(validateArg(I, "1 2.5 3").note).toContain("celá čísla");
  });

  it("choice: jen hodnota z nabídky; text: délka a vzor", () => {
    const fig = defs()[0].variants![2].args![0];
    expect(validateArg(fig, "4.2").value).toBe("4.2");
    expect(validateArg(fig, "9.9").error).toBe("Vyberte jednu z možností.");
    const T = {
      kind: "text",
      name: "s",
      label: "α =",
      maxLength: 4,
      pattern: /^[a-z]*$/,
      patternHint: "jen malá písmena a–z",
      default: "abc",
    } as const;
    expect(validateArg(T, "abca").value).toBe("abca");
    expect(validateArg(T, "abcab").error).toBe("Nejvýše 4 znaky.");
    expect(validateArg(T, "AB").error).toBe("Povoleno: jen malá písmena a–z.");
  });
});

describe("Go (prepareGo) a zapamatované argumenty", () => {
  it("platné argumenty → hodnoty podle jmen; varianta se předá", () => {
    const d = defs();
    let st = reduce(initialMenu(d), { type: "text", name: "x", text: "42" });
    expect(prepareGo(d[1], st)).toEqual({
      ok: true,
      values: { x: 42 },
      variant: null,
    });
    st = reduce(st, { type: "variant", id: "create", variant: "custom" });
    expect(prepareGo(d[0], st)).toEqual({
      ok: true,
      values: { A: [5, 3, 9] },
      variant: "custom",
    });
  });
  it("neplatný argument Go zablokuje a vrátí hlášku", () => {
    const d = defs();
    const st = reduce(initialMenu(d), { type: "text", name: "x", text: "abc" });
    expect(prepareGo(d[1], st)).toEqual({
      ok: false,
      reason: "x =: Zadejte celé číslo od −9 do 99.",
    });
  });
  it("zakázaná akce vrátí svůj důvod (prázdná struktura → Pop)", () => {
    const d = defs({ pop: { disabledReason: "Zásobník je prázdný" } });
    expect(prepareGo(d[2], initialMenu(d))).toEqual({
      ok: false,
      reason: "Zásobník je prázdný",
    });
  });
  it("po provedení (ran) zůstanou argumenty, seznam se přepíše na použitá čísla, na mobilu se menu sbalí", () => {
    const d = defs();
    let st = reduce(
      initialMenu(d),
      { type: "variant", id: "create", variant: "custom" },
      { type: "toggle", id: "create" },
      { type: "text", name: "A", text: "A = 1 x 2" },
    );
    st = reduce(st, {
      type: "ran",
      id: "create",
      values: { A: [1, 2] },
      collapse: false,
    });
    expect(st.open).toBe("create");
    expect(st.texts.A).toBe("1, 2");
    expect(st.lastRun).toBe("create");
    const c = reduce(st, {
      type: "ran",
      id: "create",
      values: { A: [1, 2] },
      collapse: true,
    });
    expect(c.open).toBeNull();
    // x z dřívějška zůstává
    expect(
      argText(reduce(st, { type: "text", name: "x", text: "13" }), X),
    ).toBe("13");
  });
  it("sdílené jméno argumentu: x napsané u Push platí i pro Find", () => {
    const d = defs();
    const st = reduce(initialMenu(d), { type: "text", name: "x", text: "8" });
    expect(prepareGo(d[3], st)).toMatchObject({ ok: true, values: { x: 8 } });
  });
});

describe("výběr klikem na plátně (pick)", () => {
  it("vyplní argument otevřené akce", () => {
    const d = defs();
    const st = reduce(initialMenu(d), { type: "toggle", id: "find" });
    expect(pickTarget(d, st)).toEqual({ id: "find", name: "x" });
    const p = reduce(st, { type: "pick", defs: d, value: 12 });
    expect(p.texts.x).toBe("12");
    expect(p.open).toBe("find");
  });
  it("bez otevřené akce (nebo s akcí bez čísla) otevře naposledy použitou, jinak první akci s číslem", () => {
    const d = defs();
    const st = initialMenu(d);
    expect(pickTarget(d, st)).toEqual({ id: "push", name: "x" });
    const ran = reduce(st, {
      type: "ran",
      id: "find",
      values: { x: 7 },
      collapse: true,
    });
    expect(reduce(ran, { type: "pick", defs: d, value: 3 }).open).toBe("find");
    const popOpen = reduce(st, { type: "toggle", id: "pop" });
    expect(reduce(popOpen, { type: "pick", defs: d, value: 3 }).open).toBe(
      "push",
    );
  });
  it("zakázané akce se přeskočí; když žádná číslo nebere, nic se nezmění", () => {
    const d = defs({ push: { disabledReason: "plný" } });
    expect(pickTarget(d, initialMenu(d))).toEqual({ id: "find", name: "x" });
    const none: ActionDef[] = [{ id: "pop", label: "Pop", run: () => {} }];
    const st = initialMenu(none);
    expect(menuReducer(st, { type: "pick", defs: none, value: 1 })).toBe(st);
  });
});

describe("vlastní kontrola argumentu a akce (chyba ve formuláři, ne až po odeslání)", () => {
  const even: ArgDef = {
    kind: "list",
    name: "P",
    label: "P =",
    default: [1, 2],
    check: (v) =>
      (v as number[]).length % 2 ? "potřebuji sudý počet čísel" : null,
  };
  it("check argumentu: chyba u pole, ne hodnota", () => {
    expect(validateArg(even, "1, 2, 3")).toEqual({
      error: "potřebuji sudý počet čísel",
      note: null,
    });
    expect(validateArg(even, "1, 2").value).toEqual([1, 2]);
  });
  it("check akce: prepareGo vrátí důvod (formulář zůstane otevřený)", () => {
    const run = vi.fn();
    const def: ActionDef = {
      id: "s",
      label: "S(P, N)",
      args: [
        { kind: "int", name: "P", label: "P =", default: 4 },
        { kind: "int", name: "N", label: "N =", default: 18 },
      ],
      check: (v) => {
        const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
        return gcd(Number(v.P), Number(v.N)) > 1
          ? "P a N musí být nesoudělná"
          : null;
      },
      run,
    };
    const st = initialMenu([def]);
    expect(prepareGo(def, st)).toEqual({
      ok: false,
      reason: "P a N musí být nesoudělná",
    });
    expect(prepareGo(def, { ...st, texts: { P: "5", N: "18" } })).toMatchObject(
      { ok: true },
    );
  });
});

describe("upozornění na úpravu vstupu (notice) – akce se provede, uživatel ví, co se změnilo", () => {
  it("notice argumentu se vrací jako note platné hodnoty", () => {
    const def: ArgDef = {
      kind: "text",
      name: "s",
      label: "σ =",
      default: "",
      notice: (v) => (/\s/.test(String(v)) ? "Mezery vynechány." : null),
    };
    expect(validateArg(def, "a b")).toEqual({
      value: "a b",
      error: null,
      note: "Mezery vynechány.",
    });
    expect(validateArg(def, "ab").note).toBeNull();
  });
});

describe("list strict (GRAPH-06 – Ceny hran)", () => {
  const W: ListArgDef = {
    kind: "list",
    name: "w",
    label: "w =",
    min: 1,
    max: 99,
    default: [1, 2, 3],
  };
  it("strict: neplatné slovo = chyba (ne poznámka), hodnota undefined", () => {
    const r = validateArg({ ...W, strict: true }, "1 x 3");
    expect(r.value).toBeUndefined();
    expect(r.note).toBeNull();
    expect(r.error).toBe(
      "‚x‘ není číslo – zadejte celá čísla od 1 do 99 oddělená mezerou.",
    );
    expect(validateArg({ ...W, strict: true }, "1 120 3").error).toBe(
      "‚120‘ je mimo rozsah – zadejte celá čísla od 1 do 99 oddělená mezerou.",
    );
    expect(validateArg({ ...W, strict: true }, "1 2 3").value).toEqual([
      1, 2, 3,
    ]);
  });
  it("bez strict beze změny: neplatné slovo jen ohlásí poznámkou", () => {
    const r = validateArg(W, "1 x 3");
    expect(r.value).toEqual([1, 3]);
    expect(r.error).toBeNull();
    expect(r.note).toContain("gnorováno: x");
  });
});
