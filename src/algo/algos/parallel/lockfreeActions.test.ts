/*
 * Nabídka operací bezzámkového zásobníku (čistý model pro ActionMenu): jaké akce jsou, kdy jsou
 * zakázané a proč, a že jejich provedení dá stejný výsledek jako dřívější tlačítka.
 */
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { chainOf, findCorruption, initial, type LFState } from "./lockfree";
import { finishOp } from "./lockfree";
import { cardActions, lfActions, type LfAction } from "./lockfreeActions";

const byId = (st: LFState, id: string): LfAction => {
  const a = lfActions(st).find((x) => x.id === id);
  if (!a) throw new Error(`akce ${id} chybí`);
  return a;
};
/** provede akci jako stránka (s.run): na kopii stavu, výsledek = poslední krok */
function apply(st: LFState, a: LfAction): LFState {
  if (a.kind === "reset") return a.state();
  const steps = materialize(a.op(structuredClone(st)));
  return steps[steps.length - 1].state;
}
const stack = (st: LFState) =>
  chainOf(st)
    .ids.map((id) => st.nodes[id].label)
    .join("");

describe("bezzámkový zásobník – nabídka operací", () => {
  it("výchozí stav: scénář ABA, pro každý proces Pop / Push(D) / Push znovu / další krok, Vyprázdnit", () => {
    const st = initial();
    expect(lfActions(st).map((a) => a.label)).toEqual([
      "Scénář ABA",
      "P1: Pop",
      "P1: Push(D)",
      "P1: Push(popnutý) znovu",
      "P1: další krok",
      "P2: Pop",
      "P2: Push(D)",
      "P2: Push(popnutý) znovu",
      "P2: další krok",
      "Vyprázdnit",
    ]);
    expect(byId(st, "p1-step").disabledReason).toBe(
      "Nejdřív zvolte Pop nebo Push pro P1",
    );
    expect(byId(st, "p2-reuse").disabledReason).toBe(
      "P2 zatím žádný uzel nevlastní – nejdřív proveďte Pop",
    );
    expect(byId(st, "p1-pop").disabledReason).toBeNull();
    expect(byId(st, "p1-push").title).toBe("P1 začne Push nového uzlu D");
  });

  it("rozpracovaná operace zakáže Pop/Push procesu a povolí další krok s popisem, co provede", () => {
    let st = apply(initial(), byId(initial(), "p2-pop"));
    expect(byId(st, "p2-pop").disabledReason).toBe(
      "P2 má rozpracovanou operaci – nejdřív ji dokončete krokem „P2: další krok“",
    );
    expect(byId(st, "p2-step").disabledReason).toBeNull();
    expect(byId(st, "p2-step").title).toBe("P2 provede: h ← head");
    expect(byId(st, "p2-step").history).toBe("P2: h ← head");
    // druhý proces je dál volný
    expect(byId(st, "p1-pop").disabledReason).toBeNull();
    st = apply(st, byId(st, "p2-step"));
    expect(byId(st, "p2-step").title).toBe("P2 provede: s ← A.next");
  });

  it("ruční ABA z tipu: P2 Pop ×2 kroky, P1 dvakrát Pop, Push(A) znovu, poslední krok P2 → poškozený zásobník", () => {
    let st = initial();
    const run = (id: string, times = 1) => {
      for (let k = 0; k < times; k++) st = apply(st, byId(st, id));
    };
    run("p2-pop");
    run("p2-step", 2);
    run("p1-pop");
    run("p1-step", 3);
    run("p1-pop");
    run("p1-step", 3);
    expect(byId(st, "p1-reuse").label).toBe("P1: Push(A) znovu");
    run("p1-reuse");
    run("p1-step", 3);
    run("p2-step");
    expect(stack(st)).toBe("BC");
    expect(findCorruption(st)).not.toBeNull();
  });

  it("Push nového uzlu dostane vždy nepoužitý popisek a Vyprázdnit vrátí prázdný zásobník", () => {
    let st = initial();
    const push = byId(st, "p1-push");
    expect(push.history).toBe("P1: Push(D)");
    st = apply(st, push);
    expect(byId(st, "p2-push").label).toBe("P2: Push(E)");
    const empty = byId(st, "empty");
    expect(empty.kind).toBe("reset");
    const e = apply(st, empty);
    expect(e.head).toBeNull();
    expect(e.procs.every((P) => P.op === null)).toBe(true);
  });

  it("scénář ABA se přehraje celý a skončí poškozeným zásobníkem", () => {
    const st = apply(initial(), byId(initial(), "aba"));
    expect(findCorruption(st)).not.toBeNull();
  });
});

describe("bezzámkový zásobník – dokončení operace jedním klikem (karta procesu)", () => {
  it("finishOp provede všechny zbývající kroky procesu bez prokládání; nečinný proces odmítne", () => {
    let st = apply(initial(), byId(initial(), "p1-pop"));
    const steps = materialize(finishOp(structuredClone(st), 0));
    expect(steps).toHaveLength(3);
    st = steps[2].state;
    expect(st.procs[0].op).toBeNull();
    expect(stack(st)).toBe("BC");
    expect(st.procs[0].owned.map((id) => st.nodes[id].label)).toEqual(["A"]);
    const idle = materialize(finishOp(structuredClone(st), 0));
    expect(idle).toHaveLength(1);
    expect(idle[0].error).toBe(true);
  });

  it("finishOp po přerušení druhým procesem projde i neúspěšným CAS a zopakuje pokus", () => {
    let st = initial();
    st = apply(st, byId(st, "p2-pop"));
    st = apply(st, byId(st, "p2-step"));
    st = apply(st, byId(st, "p2-step"));
    st = apply(st, byId(st, "p1-pop"));
    for (let k = 0; k < 3; k++) st = apply(st, byId(st, "p1-step"));
    const steps = materialize(finishOp(structuredClone(st), 1));
    expect(steps.some((s) => s.message.includes("CAS selhal"))).toBe(true);
    st = steps[steps.length - 1].state;
    expect(st.procs[1].op).toBeNull();
    expect(stack(st)).toBe("C");
    expect(findCorruption(st)).toBeNull();
  });

  it("karta procesu: nečinný nic nenabízí, rozpracovaný nabízí další krok a dokončení", () => {
    const st0 = initial();
    expect(cardActions(st0, 0)).toEqual([]);
    const st = apply(st0, byId(st0, "p1-pop"));
    const card = cardActions(st, 0);
    expect(card.map((a) => a.label)).toEqual(["Další krok", "Dokončit"]);
    expect(card[0].history).toBe("P1: h ← head");
    expect(card[1].history).toBe("P1: dokončit Pop");
    const done = apply(st, card[1]);
    expect(done.procs[0].op).toBeNull();
  });
});
