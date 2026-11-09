import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step, type StepGen } from "../../core/steps";
import {
  abaScenario,
  chainOf,
  emptyStack,
  findCorruption,
  freeLabel,
  initial,
  LF_TRACE_MAX,
  nextAction,
  PC,
  PC_POP,
  PC_PUSH,
  pcLine,
  startOp,
  step,
  stepTitle,
  uniqueLabel,
  type LFState,
} from "./lockfree";

/* ---------- pomocníci: „stránka“ bez Reactu (stejné volání generátorů jako v LockFreePage) ---------- */

type P = 0 | 1;

function sim() {
  let st = initial();
  let label = freeLabel(st);
  let lastSteps: Step<LFState>[] = [];
  const run = (op: (s: LFState) => StepGen<LFState>) => {
    const start = structuredClone(st);
    lastSteps = materialize(op(start));
    st = lastSteps[lastSteps.length - 1].state;
    return lastSteps;
  };
  return {
    state: () => st,
    steps: () => lastSteps,
    msg: () => lastSteps[lastSteps.length - 1].message,
    pop: (p: P) => run((s) => startOp(s, p, "pop")),
    pushNew(p: P, typed?: string) {
      if (typed !== undefined) label = typed;
      const used = uniqueLabel(st, label);
      const busy = st.procs[p].op !== null;
      const prev = st;
      const out = run((s) => startOp(s, p, "push", { label }));
      if (!busy) label = freeLabel(prev, [used]);
      return out;
    },
    canPushOwned: (p: P) => st.procs[p].owned.length > 0,
    pushOwned: (p: P) => run((s) => startOp(s, p, "push", { reuse: true })),
    step(p: P, times = 1) {
      for (let i = 0; i < times; i++) run((s) => step(s, p));
    },
    aba: () => run(abaScenario),
  };
}

const labels = (st: LFState, ids: number[]) =>
  ids.map((id) => st.nodes[id].label).join("");
const stack = (st: LFState) => labels(st, chainOf(st).ids);

/** Nezávislá referenční kontrola: každý uzel je právě na jednom místě (zásobník, nebo právě jeden vlastník), řetěz je acyklický. */
function corruption(st: LFState): string | null {
  const ids: number[] = [];
  const seen = new Set<number>();
  let v = st.head;
  while (v !== null && !seen.has(v)) {
    seen.add(v);
    ids.push(v);
    v = st.nodes[v].next;
  }
  if (v !== null) return "zásobník je zacyklený";
  const where = new Map<number, string[]>();
  const add = (id: number, w: string) =>
    where.set(id, [...(where.get(id) ?? []), w]);
  for (const id of ids) add(id, "zásobník");
  for (const pr of st.procs) for (const id of pr.owned) add(id, pr.name);
  for (const id of Object.keys(st.nodes).map(Number)) {
    const w = where.get(id) ?? [];
    if (w.length === 0) return `uzel ${st.nodes[id].label} se ztratil`;
    if (w.length > 1)
      return `uzel ${st.nodes[id].label} je zároveň: ${w.join(" + ")}`;
  }
  return null;
}

/* ---------- korektní běhy ---------- */

describe("bezzámkový zásobník – korektní běhy", () => {
  it("bez recyklace uzlů je každé prokládání linearizovatelné podle pořadí úspěšných CASů (80 náhodných běhů)", () => {
    const r = rng(424242);
    for (let run = 0; run < 80; run++) {
      const page = sim();
      const model = chainOf(page.state()).ids; // sekvenční zásobník, vrchol na indexu 0
      expect(stack(page.state())).toBe("ABC");
      for (let a = 0; a < 40; a++) {
        const p = (r() < 0.5 ? 0 : 1) as P;
        const pre = page.state();
        if (pre.procs[p].op === null) {
          if (r() < 0.55) page.pop(p);
          else page.pushNew(p);
        } else {
          page.step(p);
          const before = pre.procs[p];
          const after = page.state().procs[p];
          if (after.log.length > before.log.length) {
            if (before.op === "push") model.unshift(before.arg!);
            else
              expect(model.shift()).toBe(after.owned[after.owned.length - 1]);
          } else if (before.op === "pop" && after.op === null) {
            expect(model).toEqual([]); // Pop skončil na prázdném zásobníku
          }
        }
        const st = page.state();
        expect(chainOf(st)).toEqual({ ids: model, cycleTo: null });
        expect(corruption(st)).toBeNull();
        expect(findCorruption(st)).toBeNull();
        expect(st.broken).toBeNull();
        // popisky uzlů jsou navzájem různé
        const all = Object.values(st.nodes).map((n) => n.label);
        expect(new Set(all).size).toBe(all.length);
        for (const s of page.steps())
          expect(
            s.line === null ||
              (s.line >= 0 && s.line < PC.length && PC[s.line] !== ""),
          ).toBe(true);
      }
    }
  });

  it("sekvenční použití (bez prokládání) s recyklací uzlů nic nepoškodí a nikdy nehlásí ABA (60 běhů)", () => {
    const r = rng(99);
    for (let run = 0; run < 60; run++) {
      const page = sim();
      for (let a = 0; a < 30; a++) {
        const p = (r() < 0.5 ? 0 : 1) as P;
        const x = r();
        if (x < 0.45) page.pop(p);
        else if (x < 0.8 && page.canPushOwned(p)) page.pushOwned(p);
        else page.pushNew(p);
        for (let g = 0; g < 10 && page.state().procs[p].op !== null; g++)
          page.step(p);
        const st = page.state();
        expect(st.procs[p].op).toBeNull();
        expect(corruption(st)).toBeNull();
        expect(st.broken).toBeNull();
        expect(page.msg()).not.toMatch(/Jenže/);
      }
    }
  });

  it("neškodné ABA (P1: Pop A, Push A zpět) – P2 dokončí Pop správně a nic se nehlásí", () => {
    const page = sim();
    page.pop(1);
    page.step(1, 2); // P2: h = A, s = B
    page.pop(0);
    page.step(0, 3);
    page.pushOwned(0);
    page.step(0, 3); // zásobník opět A → B → C
    expect(stack(page.state())).toBe("ABC");
    page.step(1);
    const st = page.state();
    expect(stack(st)).toBe("BC");
    expect(labels(st, st.procs[1].owned)).toBe("A");
    expect(st.broken).toBeNull();
    expect(page.msg()).not.toMatch(/Jenže/);
  });

  it("CAS selže, když se head změnil; Pop na prázdném zásobníku skončí; nečinný proces nic nekrokuje", () => {
    const page = sim();
    page.pop(0);
    page.step(0, 2);
    page.pop(1);
    page.step(1, 3); // P2 popne A dřív
    page.step(0);
    expect(page.msg()).toMatch(/P1: CAS selhal – head je B, ne A\./);
    expect(page.steps()[0].line).toBe(pcLine("pop", 5));
    expect(page.state().procs[0]).toMatchObject({ op: "pop", pc: 0 });
    page.step(0, 3);
    expect(stack(page.state())).toBe("C");
    page.pop(0);
    page.step(0, 3);
    expect(stack(page.state())).toBe("");
    page.pop(1);
    page.step(1);
    expect(page.msg()).toMatch(/zásobník je prázdný, Pop končí/);
    expect(page.state().procs[1].op).toBeNull();
    page.step(1);
    expect(page.msg()).toMatch(/P2 nemá rozpracovanou operaci/);
    expect(page.steps()[0].line).toBeNull();
    // rozpracovaná operace se nedá přebít jinou
    page.pushNew(0);
    const before = page.state();
    page.pop(0);
    expect(page.msg()).toMatch(/P1 má rozpracovanou operaci/);
    page.pushNew(0);
    expect(page.msg()).toMatch(/P1 má rozpracovanou operaci/);
    expect(Object.keys(page.state().nodes).length).toBe(
      Object.keys(before.nodes).length,
    );
    expect(page.state().procs[0]).toEqual(before.procs[0]);
    // Push(vlastněný) bez vlastněného uzlu nic nezaloží
    const p2 = sim();
    p2.pushOwned(1);
    expect(p2.msg()).toMatch(/P2 nevlastní žádný uzel/);
    expect(p2.state().procs[1].op).toBeNull();
    expect(Object.keys(p2.state().nodes).length).toBe(3);
  });
});

/* ---------- pseudokód ---------- */

describe("bezzámkový zásobník – pseudokód", () => {
  it("spojený pseudokód obsahuje Push i Pop a pcLine do něj míří správně", () => {
    expect(PC.slice(0, PC_PUSH.length)).toEqual(PC_PUSH);
    expect(PC.slice(PC_PUSH.length + 1)).toEqual(PC_POP);
    for (let i = 0; i < PC_PUSH.length; i++)
      expect(PC[pcLine("push", i)]).toBe(PC_PUSH[i]);
    for (let i = 0; i < PC_POP.length; i++)
      expect(PC[pcLine("pop", i)]).toBe(PC_POP[i]);
  });

  it("BUG lf-aba-scenario-wrong-pseudocode: ve scénáři ABA svítí u kroků Pushe řádky Push a u kroků Popu řádky Pop", () => {
    const steps = sim().aba();
    expect(steps.length).toBe(20);
    let pushSteps = 0;
    for (const s of steps) {
      const line = s.line === null ? "" : PC[s.line];
      expect(line).not.toBeUndefined();
      const P = s.state.procs[s.state.shown];
      if (/\.next ← h = /.test(s.message)) {
        expect(line).toContain("n.next ← h");
        pushSteps++;
      }
      if (/CAS uspěl \(head byl stále/.test(s.message)) {
        expect(line).toContain("CAS(head, h, n)");
        pushSteps++;
      }
      if (/Push znovu použije/.test(s.message)) {
        expect(line).toBe("Push(n):");
        pushSteps++;
      }
      if (/s ← h\.next = /.test(s.message))
        expect(line).toContain("s ← h.next");
      if (/začíná Pop/.test(s.message)) expect(line).toBe("Pop:");
      if (/CAS uspěl → head = s/.test(s.message))
        expect(line).toContain("CAS(head, h, s)");
      if (/h ← head = /.test(s.message)) {
        expect(line).toContain("h ← head");
        // „h ← head“ je v obou procedurách – musí to být řádek procedury, kterou proces právě provádí
        expect(s.line).toBe(pcLine(P.op!, 2));
        if (P.op === "push") pushSteps++;
      }
    }
    expect(pushSteps).toBe(4); // zahájení Pushe + jeho tři kroky
  });
});

/* ---------- ABA a poškození ---------- */

describe("bezzámkový zásobník – ABA", () => {
  it("scénář ABA skončí s head = B → C, B vlastní P1, A vlastní P2 a poškození se ohlásí i vysvětlí", () => {
    const page = sim();
    page.pushNew(0); // scénář začíná vždy z výchozího zásobníku, ať bylo předtím cokoli
    const steps = page.aba();
    const st = page.state();
    expect(steps[0].message).toMatch(/A → B → C/);
    expect(stack(steps[0].state)).toBe("ABC");
    expect(Object.keys(st.nodes).length).toBe(3);
    expect(stack(st)).toBe("BC");
    expect(labels(st, st.procs[0].owned)).toBe("B");
    expect(labels(st, st.procs[1].owned)).toBe("A");
    expect(st.broken).toMatch(/Zásobník obsahuje uzel B, který už vlastní P1/);
    expect(st.broken).toMatch(/ABA/);
    expect(steps[steps.length - 2].message).toMatch(
      /P2: CAS uspěl → head = s = B, vrací A\. Jenže A\.next je teď C, ne B/,
    );
    // závěrečný krok shrne výsledek scénáře a zvýrazní uzel B, který je v zásobníku, ačkoli ho vlastní P1
    const fin = steps[steps.length - 1];
    expect(fin.line).toBeNull();
    expect(fin.message).toMatch(
      /^Scénář ABA: CAS procesu P2 uspěl.*head → B → C/,
    );
    expect(
      Object.entries(fin.state.marks).map(
        ([id, m]) => fin.state.nodes[Number(id)].label + m,
      ),
    ).toEqual(["Blf-own"]);
    // před CASem procesu P2 je vše v pořádku
    for (const s of steps.slice(0, -2)) expect(s.state.broken).toBeNull();
    expect(stack(steps[steps.length - 3].state)).toBe("AC");
  });

  it("BUG lf-aba-lost-node-undetected: ABA se ztraceným uzlem (P1: Pop A, Push D, Push A; P2 dokončí starý CAS) se ohlásí", () => {
    const page = sim();
    page.pop(1);
    page.step(1, 2); // P2: h = A, s = B
    page.pop(0);
    page.step(0, 3); // P1 popne A
    page.pushNew(0, "D");
    page.step(0, 3); // zásobník D → B → C
    page.pushOwned(0);
    page.step(0, 3); // zásobník A → D → B → C
    expect(stack(page.state())).toBe("ADBC");
    expect(page.state().broken).toBeNull();
    page.step(1); // P2: CAS(head, A, B) uspěje
    const st = page.state();
    expect(stack(st)).toBe("BC");
    expect(corruption(st)).toMatch(/uzel D se ztratil/);
    expect(st.broken).toMatch(/Uzel D ze zásobníku zmizel/);
    expect(st.broken).toMatch(/ABA/);
    expect(page.msg()).toMatch(/Jenže A\.next je teď D, ne B/);
  });

  it("BUG lf-broken-warning-cleared-cycle: varování po dalším CASu nezmizí (dvojí vlastnictví, cyklus) a owned nemá duplicity", () => {
    // (a) P2 popne B, které už vlastní P1
    const a = sim();
    a.aba();
    const warned = a.state().broken;
    a.pop(1);
    a.step(1, 3);
    expect(corruption(a.state())).toMatch(/uzel B je zároveň: P1 \+ P2/);
    expect(a.state().broken).toBe(warned);
    expect(findCorruption(a.state())).toMatch(/Uzel B vlastní P1 i P2/);
    // (b) P1 pushne „svůj“ uzel B, který je právě vrcholem zásobníku → B.next = B
    const b = sim();
    b.aba();
    b.pushOwned(0);
    b.step(0, 3);
    const sb = b.state();
    expect(sb.nodes[sb.head!].next).toBe(sb.head);
    expect(corruption(sb)).toBe("zásobník je zacyklený");
    expect(sb.broken).toBeTruthy();
    expect(findCorruption(sb)).toMatch(
      /Zásobník je zacyklený: z uzlu B vede next zpět na B/,
    );
    expect(chainOf(sb)).toEqual({ ids: [sb.head], cycleTo: sb.head });
    // (c) P1 popne B podruhé → v owned je B jen jednou (dřív duplicitní React key)
    const c = sim();
    c.aba();
    c.pop(0);
    c.step(0, 3);
    const owned = c.state().procs[0].owned;
    expect(new Set(owned).size).toBe(owned.length);
    expect(c.state().broken).toBeTruthy();
    // další operace na poškozeném zásobníku nespadnou
    for (const page of [a, b, c])
      for (let k = 0; k < 12; k++) {
        const p = (k % 2) as P;
        if (page.state().procs[p].op === null) {
          if (k % 3 === 0 && page.canPushOwned(p)) page.pushOwned(p);
          else page.pop(p);
        }
        page.step(p, 2);
        expect(page.state().broken).toBeTruthy();
      }
  });

  it("BUG: náhodná prokládání s recyklací – každé poškození se ohlásí, varování pak už nezmizí a nic nespadne (150 běhů)", () => {
    const r = rng(31337);
    let corrupted = 0;
    for (let run = 0; run < 150; run++) {
      const page = sim();
      let wasBroken = false;
      const check = (what: string) => {
        const st = page.state();
        const c = corruption(st);
        if (c) expect(st.broken, `běh ${run}, ${what}: ${c}`).toBeTruthy();
        // žádný falešný poplach: první varování přijde až s prvním skutečným poškozením
        if (!wasBroken && st.broken) expect(c).not.toBeNull();
        if (wasBroken) expect(st.broken).toBeTruthy();
        wasBroken = st.broken !== null;
        for (const P of st.procs)
          expect(new Set(P.owned).size).toBe(P.owned.length);
        for (const s of page.steps()) {
          expect(s.message).not.toMatch(/undefined|NaN/);
          expect(s.line === null || (s.line >= 0 && s.line < PC.length)).toBe(
            true,
          );
        }
      };
      // jedna akce procesu p: zahájí náhodnou operaci, nebo udělá krok rozpracované
      const act = (p: P) => {
        if (page.state().procs[p].op === null) {
          const x = r();
          if (x < 0.4) page.pop(p);
          else if (x < 0.85 && page.canPushOwned(p)) page.pushOwned(p);
          else page.pushNew(p);
        } else page.step(p);
        check(`akce P${p + 1}`);
      };
      const finish = (p: P) => {
        for (let g = 0; g < 8 && page.state().procs[p].op !== null; g++) act(p);
      };
      // (1) pár sekvenčních operací, (2) „oběť“ načte h a s a je přerušena, (3) druhý proces mezitím dokončí několik
      // operací (živná půda pro ABA), (4) oběť dokončí svůj CAS, (5) volné prokládání
      for (let k = Math.floor(r() * 3); k > 0; k--) {
        const p = (r() < 0.5 ? 0 : 1) as P;
        act(p);
        finish(p);
      }
      const victim = (r() < 0.5 ? 0 : 1) as P;
      const other = (1 - victim) as P;
      page.pop(victim);
      page.step(victim, 2);
      check("přerušený Pop");
      for (let k = 2 + Math.floor(r() * 4); k > 0; k--) {
        act(other);
        finish(other);
      }
      finish(victim);
      for (let a = 0; a < 15; a++) act((r() < 0.5 ? 0 : 1) as P);
      if (wasBroken) corrupted++;
    }
    expect(corrupted).toBeGreaterThan(10); // test opravdu poškození vyrábí
  });
});

/* ---------- popisky a vykreslení ---------- */

describe("bezzámkový zásobník – popisky a vykreslení", () => {
  it("BUG lf-duplicate-node-labels: nové uzly dostávají různé popisky, zpráva o neúspěšném CASu rozliší oba uzly", () => {
    const page = sim();
    page.pushNew(0);
    page.step(0, 3); // D → A → B → C
    page.pop(1);
    page.step(1, 2); // P2: h = D, s = A
    page.pop(0);
    page.step(0, 3); // P1 popne D
    page.pushNew(0);
    page.step(0, 3); // P1 pushne další nový uzel (jiná adresa)
    page.step(1); // P2: CAS musí selhat – head je jiný uzel
    const st = page.state();
    expect(page.msg()).toBe(
      "P2: CAS selhal – head je E, ne D. Opakujeme od začátku.",
    );
    expect(page.msg()).not.toMatch(/head je (\S+), ne \1\./);
    const all = Object.values(st.nodes).map((n) => n.label);
    expect(new Set(all).size).toBe(all.length);
    expect(st.broken).toBeNull();
  });

  it("uniqueLabel / freeLabel: obsazený nebo prázdný popisek se nahradí jednoznačným", () => {
    const st = initial();
    expect(freeLabel(st)).toBe("D");
    expect(freeLabel(st, ["D", "E"])).toBe("F");
    expect(uniqueLabel(st, "D")).toBe("D");
    expect(uniqueLabel(st, "")).toBe("D");
    expect(uniqueLabel(st, "   ")).toBe("D");
    expect(uniqueLabel(st, "A")).toBe("A′");
    expect(uniqueLabel(st, "dlouhý")).toBe("dl");
    // ručně zadaný obsazený popisek: A′, A″, A3, … a zpráva na to upozorní
    const page = sim();
    const got: string[] = [];
    for (let k = 0; k < 4; k++) {
      const s = page.pushNew(0, "A");
      got.push(page.state().nodes[page.state().procs[0].arg!].label);
      expect(s[0].message).toMatch(/Popisek A už nese jiný uzel/);
      page.step(0, 3);
    }
    expect(got).toEqual(["A′", "A″", "A3", "A4"]);
    // došla písmena → N + číslo, pořád jednoznačné
    const full = initial();
    for (let c = 68; c <= 90; c++)
      full.nodes[full.nextId] = {
        id: full.nextId++,
        label: String.fromCharCode(c),
        next: null,
      };
    expect(freeLabel(full)).toBe("N" + full.nextId);
  });

  it("BUG lf-stack-truncated-at-10: zásobník s 11 uzly se vykreslí celý; cyklus se označí místo ∅", async () => {
    const { StackView } = await import("./LockFreeViews");
    const page = sim();
    for (const l of ["D", "E", "F", "G", "H", "I", "J", "K"]) {
      page.pushNew(0, l);
      page.step(0, 3);
    }
    const st = page.state();
    expect(stack(st)).toBe("KJIHGFEDABC");
    const row = (html: string) =>
      html.slice(html.indexOf("lf-row"), html.indexOf("lf-procs"));
    const html = renderToStaticMarkup(createElement(StackView, { st }));
    expect(html).not.toMatch(/NaN|undefined/);
    expect(row(html).split('class="lf-node').length - 1).toBe(11);
    expect(row(html)).toContain("∅");
    expect(html).not.toContain("lf-broken");
    // zacyklený zásobník (B.next = B): značka cyklu, žádné ∅, varování
    const c = sim();
    c.aba();
    c.pushOwned(0);
    c.step(0, 3);
    const cyc = renderToStaticMarkup(
      createElement(StackView, { st: c.state() }),
    );
    expect(row(cyc).split('class="lf-node').length - 1).toBe(1);
    expect(row(cyc)).toContain("↺ zpět na B");
    expect(row(cyc)).not.toContain("∅");
    expect(cyc).toContain("lf-broken");
    // každý krok scénáře ABA jde vykreslit; varování je až po CASu procesu P2 (předposlední a poslední krok)
    const steps = sim().aba();
    steps.forEach((s, i) => {
      const h = renderToStaticMarkup(createElement(StackView, { st: s.state }));
      expect(h).not.toMatch(/NaN|undefined/);
      expect(h.includes("lf-broken")).toBe(i >= steps.length - 2);
    });
    // karta procesu říká, co proces udělá příště
    const q = sim();
    q.pop(1);
    q.step(1, 2);
    const card = renderToStaticMarkup(
      createElement(StackView, { st: q.state() }),
    );
    expect(card).toContain("příště: <b>CAS(head, A, B)</b>");
    expect(card).toContain("čeká na Push nebo Pop");
  });
});

/* ---------- pomocníci stránky ---------- */

describe("bezzámkový zásobník – co proces udělá příště, odmítnuté operace, Vyprázdnit", () => {
  it("nextAction / stepTitle popisují příští atomický krok s dosazenými uzly a míří na správný řádek", () => {
    const page = sim();
    expect(nextAction(page.state(), 0)).toBeNull();
    expect(stepTitle(page.state(), 0)).toBe("P1: krok");
    page.pop(0);
    const seen: string[] = [];
    for (let k = 0; k < 3; k++) {
      const a = nextAction(page.state(), 0)!;
      seen.push(stepTitle(page.state(), 0));
      page.step(0);
      // řádek, který krok skutečně zvýrazní, je ten, který nextAction ohlásil
      expect(page.steps()[0].line).toBe(a.line);
    }
    expect(seen).toEqual([
      "P1: h ← head",
      "P1: s ← A.next",
      "P1: CAS(head, A, B)",
    ]);
    page.pushNew(1);
    const push: string[] = [];
    for (let k = 0; k < 3; k++) {
      const a = nextAction(page.state(), 1)!;
      push.push(a.text);
      page.step(1);
      expect(page.steps()[0].line).toBe(a.line);
    }
    expect(push).toEqual(["h ← head", "D.next ← h", "CAS(head, B, D)"]);
    expect(stack(page.state())).toBe("DBC");
  });

  it("operace, která se nemůže provést, vrátí jediný chybový krok a stav nezmění", () => {
    const page = sim();
    page.step(0);
    expect(page.steps()).toHaveLength(1);
    expect(page.steps()[0].error).toBe(true);
    page.pushOwned(0);
    expect(page.steps()[0].error).toBe(true);
    page.pop(0);
    expect(page.steps()[0].error).toBeUndefined();
    page.pop(0);
    expect(page.steps()[0].error).toBe(true);
  });

  it("emptyStack: prázdný zásobník, Pop na něm skončí a Push nového uzlu dostane popisek A", () => {
    const st = emptyStack();
    expect(chainOf(st)).toEqual({ ids: [], cycleTo: null });
    expect(st.procs.every((P) => P.op === null && P.owned.length === 0)).toBe(
      true,
    );
    expect(freeLabel(st)).toBe("A");
    const out = materialize(startOp(structuredClone(st), 0, "pop"));
    const s2 = materialize(step(out[out.length - 1].state, 0));
    expect(s2[0].message).toMatch(/zásobník je prázdný, Pop končí/);
    expect(findCorruption(st)).toBeNull();
  });
});

describe("bezzámkový zásobník – stránka", () => {
  it("výchozí stav: A → B → C, neaktivní akce nabídky mají vysvětlení, Push nového uzlu nabízí D", async () => {
    const { LockFreePage } = await import("./LockFreePage");
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(LockFreePage)),
    );
    expect(html).not.toMatch(/NaN|undefined/);
    expect(html.split('class="lf-node').length - 1).toBe(3);
    // nabídka operací pod plátnem (ActionMenu), žádné staré fieldsety
    expect(html).toContain('class="action-menu"');
    expect(html).not.toContain("op-group");
    expect(html).toContain("Scénář ABA");
    expect(html.split(">P1: Push(D)<").length - 1).toBe(1);
    expect(html.split(">P2: Push(D)<").length - 1).toBe(1);
    // „další krok“ a „Push(popnutý) znovu“ jsou neaktivní a říkají proč
    expect(html).toMatch(
      /<button[^>]*aria-disabled="true"[^>]*title="Nejdřív zvolte Pop nebo Push pro P1"/,
    );
    expect(html).toMatch(
      /<button[^>]*aria-disabled="true"[^>]*title="P2 zatím žádný uzel nevlastní – nejdřív proveďte Pop"/,
    );
    expect(html).toContain("Výchozí příklad");
    expect(html).toContain("Vyprázdnit");
  });
});

/* ---------------------------------------------------------------- průběh prokládání (E6) */

describe("průběh prokládání (časová osa pod zásobníkem)", () => {
  const trace = (st: LFState) =>
    st.trace.map(
      (t) => `P${t.p + 1} ${t.text}${t.kind === "fail" ? " !" : ""}`,
    );

  it("scénář ABA: každý atomický krok obou procesů v pořadí, v jakém proběhl", () => {
    const s = sim();
    s.aba();
    expect(trace(s.state())).toEqual([
      "P2 Pop",
      "P2 h = A",
      "P2 s = B",
      "P1 Pop",
      "P1 h = A",
      "P1 s = B",
      "P1 CAS ✓ → A",
      "P1 Pop",
      "P1 h = B",
      "P1 s = C",
      "P1 CAS ✓ → B",
      "P1 Push(A) znovu",
      "P1 h = C",
      "P1 A.next ← C",
      "P1 CAS ✓",
      "P2 CAS ✓ → A",
    ]);
    expect(s.state().traceSkipped).toBe(0);
    // průběh jde s kroky přehrávače: první krok scénáře ho má prázdný
    expect(s.steps()[0].state.trace).toEqual([]);
  });

  it("neúspěšný CAS je označený, prázdný Pop skončí hned; odmítnutá operace průběh nemění", () => {
    const s = sim();
    s.pop(0);
    s.step(0, 2); // P1: h = A, s = B
    s.pushNew(1, "D");
    s.step(1, 3); // P2 zapojí D → head se změnil
    s.step(0); // CAS procesu P1 selže
    const t = s.state().trace;
    expect(t[t.length - 1]).toMatchObject({
      p: 0,
      text: "CAS ✗",
      kind: "fail",
    });
    expect(t.find((x) => x.text === "CAS ✓")).toMatchObject({
      p: 1,
      kind: "ok",
    });
    const before = s.state().trace.length;
    s.step(1); // P2 je nečinný → odmítnuto
    expect(s.state().trace).toHaveLength(before);

    const empty = emptyStack();
    const steps = materialize(
      (function* () {
        yield* startOp(empty, 0, "pop");
        yield* step(empty, 0);
      })(),
    );
    expect(steps[steps.length - 1].state.trace).toEqual([
      { p: 0, text: "Pop", kind: "start" },
      { p: 0, text: "h = ∅ (prázdný)", kind: "end" },
    ]);
  });

  it(`drží posledních ${LF_TRACE_MAX} kroků, starší spočítá`, () => {
    const s = sim();
    for (let k = 0; k < 12; k++) {
      s.pushNew(0);
      s.step(0, 3);
    }
    expect(s.state().trace).toHaveLength(LF_TRACE_MAX);
    expect(s.state().traceSkipped).toBe(12 * 4 - LF_TRACE_MAX);
  });
});
