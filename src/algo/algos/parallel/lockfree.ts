import { snap, type Step, type StepGen } from "../../core/steps";

/* Bezzámkový zásobník s CAS a problém ABA – čisté generátory kroků bez UI. Dva procesy, prokládání volí uživatel. */

export interface LFNode {
  id: number;
  label: string;
  next: number | null;
}
export interface Proc {
  name: string;
  op: "push" | "pop" | null;
  /** uzel, který se pushuje (znovupoužitý nebo nový) */
  arg: number | null;
  pc: number;
  h: number | null | "nenačteno";
  s: number | null | "nenačteno";
  /** uzly, které proces vlastní (popnuté nebo nově vytvořené a ještě nezapojené) */
  owned: number[];
  log: string[];
}
/** Jeden atomický krok v průběhu prokládání (časová osa pod zásobníkem). */
export interface LFTraceItem {
  /** proces, který krok provedl */
  p: 0 | 1;
  /** krátký popis: „Pop“, „h = A“, „CAS ✓ → A“… */
  text: string;
  /** start = začátek operace, read = čtení / zápis do vlastního uzlu, ok / fail = CAS, end = prázdný Pop */
  kind: "start" | "read" | "ok" | "fail" | "end";
}

/** Kolik posledních kroků průběh drží (scénář ABA jich má 16). */
export const LF_TRACE_MAX = 24;

export interface LFState {
  nodes: Record<number, LFNode>;
  head: number | null;
  procs: [Proc, Proc];
  /** index procesu, jehož krok se právě provedl */
  shown: 0 | 1;
  nextId: number;
  marks: Record<number, string>;
  /** popis poškození zásobníku; jakmile nastane, zůstává až do nového začátku */
  broken: string | null;
  /** průběh prokládání: posledních LF_TRACE_MAX atomických kroků obou procesů */
  trace: LFTraceItem[];
  /** kolik starších kroků z průběhu vypadlo */
  traceSkipped: number;
}

export const PC_PUSH = [
  "Push(n):",
  "  Opakujeme:",
  "    h ← head",
  "    n.next ← h",
  "    Pokud CAS(head, h, n) = h: hotovo",
  "    (jinak někdo head změnil – zkusíme znovu)",
];
export const PC_POP = [
  "Pop:",
  "  Opakujeme:",
  "    h ← head   (je-li ∅, zásobník je prázdný)",
  "    s ← h.next",
  "    Pokud CAS(head, h, s) = h: vrátíme h",
  "    (jinak někdo head změnil – zkusíme znovu)",
];
/** Push i Pop pod sebou – procesy se střídají, takže se zobrazují obě procedury najednou. */
export const PC = [...PC_PUSH, "", ...PC_POP];
/** index řádku ve spojeném pseudokódu PC: i-tý řádek procedury op */
export const pcLine = (op: "push" | "pop", i: number) =>
  op === "push" ? i : PC_PUSH.length + 1 + i;

const newProc = (name: string): Proc => ({
  name,
  op: null,
  arg: null,
  pc: 0,
  h: "nenačteno",
  s: "nenačteno",
  owned: [],
  log: [],
});
export const lab = (st: LFState, id: number | null | "nenačteno") =>
  id === "nenačteno" ? "?" : id === null ? "∅" : (st.nodes[id]?.label ?? "?");

export function initial(): LFState {
  const st: LFState = {
    nodes: {},
    head: null,
    procs: [newProc("P1"), newProc("P2")],
    shown: 0,
    nextId: 1,
    marks: {},
    broken: null,
    trace: [],
    traceSkipped: 0,
  };
  for (const l of ["C", "B", "A"]) {
    const id = st.nextId++;
    st.nodes[id] = { id, label: l, next: st.head };
    st.head = id;
  }
  return st;
}

/** Prázdný zásobník (head = ∅), oba procesy nečinné – „Vyprázdnit“. */
export function emptyStack(): LFState {
  return {
    nodes: {},
    head: null,
    procs: [newProc("P1"), newProc("P2")],
    shown: 0,
    nextId: 1,
    marks: {},
    broken: null,
    trace: [],
    traceSkipped: 0,
  };
}

/** Zapíše krok procesu do průběhu (nejvýš LF_TRACE_MAX posledních). */
function record(
  st: LFState,
  p: 0 | 1,
  text: string,
  kind: LFTraceItem["kind"],
) {
  st.trace.push({ p, text, kind });
  while (st.trace.length > LF_TRACE_MAX) {
    st.trace.shift();
    st.traceSkipped++;
  }
}

/** Krok, který jen oznamuje neprovedenou operaci (UI ho zvýrazní jako chybu). */
const refuse = (st: LFState, message: string): Step<LFState> => ({
  ...snap(st, null, message),
  error: true,
});

/* ---------- co proces udělá příště ---------- */

/**
 * Atomický krok, který proces p provede při příštím „Další krok“: text (s dosazenými uzly) a index řádku
 * ve spojeném pseudokódu PC. Nečinný proces → null.
 */
export function nextAction(
  st: LFState,
  p: 0 | 1,
): { text: string; line: number } | null {
  const P = st.procs[p];
  if (!P.op) return null;
  if (P.op === "push") {
    const n = lab(st, P.arg);
    const texts = [
      "h ← head",
      `${n}.next ← h`,
      `CAS(head, ${lab(st, P.h)}, ${n})`,
    ];
    return { text: texts[P.pc], line: pcLine("push", P.pc + 2) };
  }
  const texts = [
    "h ← head",
    `s ← ${lab(st, P.h)}.next`,
    `CAS(head, ${lab(st, P.h)}, ${lab(st, P.s)})`,
  ];
  return { text: texts[P.pc], line: pcLine("pop", P.pc + 2) };
}

/** Název operace „Další krok“ do historie a nad zprávu, např. „P2: CAS(head, A, B)“. */
export function stepTitle(st: LFState, p: 0 | 1): string {
  const a = nextAction(st, p);
  return `${st.procs[p].name}: ${a ? a.text : "krok"}`;
}

/* ---------- popisky uzlů ---------- */

/** První nepoužité písmeno A–Z (vůči uzlům ve stavu a popiskům v `taken`), jinak N + číslo. */
export function freeLabel(st: LFState, taken: readonly string[] = []): string {
  const used = new Set([
    ...Object.values(st.nodes).map((n) => n.label),
    ...taken,
  ]);
  for (let c = 65; c <= 90; c++)
    if (!used.has(String.fromCharCode(c))) return String.fromCharCode(c);
  for (let k = st.nextId; ; k++) if (!used.has("N" + k)) return "N" + k;
}

/**
 * Popisek pro nový uzel: různé uzly (= různé adresy) musí mít různé popisky, jinak nejde poznat ABA.
 * Prázdný popisek → první volné písmeno; obsazený dostane čárku (A′, A″), případně číslo.
 */
export function uniqueLabel(st: LFState, wanted: string): string {
  const w = wanted.trim().slice(0, 2);
  if (!w) return freeLabel(st);
  const used = new Set(Object.values(st.nodes).map((n) => n.label));
  if (!used.has(w)) return w;
  for (const suffix of ["′", "″"]) if (!used.has(w + suffix)) return w + suffix;
  for (let k = 3; ; k++) if (!used.has(w + k)) return w + k;
}

/* ---------- kontrola struktury ---------- */

/** Uzly dosažitelné z head (od vrcholu); cycleTo = uzel, na který se seznam zacyklil (jinak null). */
export function chainOf(st: LFState): {
  ids: number[];
  cycleTo: number | null;
} {
  const ids: number[] = [];
  const seen = new Set<number>();
  let v = st.head;
  while (v !== null && !seen.has(v) && st.nodes[v]) {
    seen.add(v);
    ids.push(v);
    v = st.nodes[v].next;
  }
  return { ids, cycleTo: v !== null && seen.has(v) ? v : null };
}

/**
 * Úplný invariant: každý uzel je právě na jednom místě – v zásobníku (v řetězu od head), nebo ho vlastní
 * právě jeden proces – a řetěz je acyklický. Vrací popis porušení, nebo null.
 */
export function findCorruption(st: LFState): string | null {
  const { ids, cycleTo } = chainOf(st);
  const inChain = new Set(ids);
  const problems: string[] = [];
  // klasická ABA: v zásobníku je uzel, který už někdo popnul
  for (const id of ids)
    for (const P of st.procs)
      if (P.owned.includes(id))
        problems.push(
          `Zásobník obsahuje uzel ${st.nodes[id].label}, který už vlastní ${P.name} (byl popnut)!`,
        );
  if (cycleTo !== null)
    problems.push(
      `Zásobník je zacyklený: z uzlu ${st.nodes[ids[ids.length - 1]].label} vede next zpět na ${st.nodes[cycleTo].label}.`,
    );
  for (const n of Object.values(st.nodes)) {
    const owners = st.procs.filter((P) => P.owned.includes(n.id));
    if (owners.length > 1)
      problems.push(
        `Uzel ${n.label} vlastní ${owners.map((P) => P.name).join(" i ")} – Pop ho vydal dvakrát!`,
      );
    if (!owners.length && !inChain.has(n.id))
      problems.push(
        `Uzel ${n.label} ze zásobníku zmizel, přestože ho nikdo nepopnul!`,
      );
  }
  return problems.length ? `${problems.join(" ")} Tohle je problém ABA.` : null;
}

/** Po úspěšném CASu ověří invariant. Varování je „lepkavé“: poškozená struktura se sama neopraví. */
function checkBroken(st: LFState) {
  if (st.broken === null) st.broken = findCorruption(st);
}

/* ---------- operace ---------- */

/** Zahájí operaci procesu p (zatím nic neprovede – kroky dělá step). */
export function* startOp(
  st: LFState,
  p: 0 | 1,
  op: "push" | "pop",
  opts: { reuse?: boolean; label?: string } = {},
): StepGen<LFState> {
  const P = st.procs[p];
  st.shown = p;
  st.marks = {};
  if (P.op) {
    yield refuse(
      st,
      `${P.name} má rozpracovanou operaci – nejdřív ji dokrokujte.`,
    );
    return;
  }
  if (op === "push" && opts.reuse && !P.owned.length) {
    yield refuse(
      st,
      `${P.name} nevlastní žádný uzel – nejdřív musí nějaký popnout.`,
    );
    return;
  }
  P.op = op;
  P.pc = 0;
  P.h = "nenačteno";
  P.s = "nenačteno";
  if (op === "pop") {
    P.arg = null;
    record(st, p, "Pop", "start");
    yield snap(st, pcLine("pop", 0), `${P.name}: začíná Pop.`);
  } else if (opts.reuse) {
    P.arg = P.owned[0];
    st.marks[P.arg] = "lf-own";
    record(st, p, `Push(${st.nodes[P.arg].label}) znovu`, "start");
    yield snap(
      st,
      pcLine("push", 0),
      `${P.name}: Push znovu použije uzel ${st.nodes[P.arg].label}, který dříve popnul (stejná adresa v paměti!).`,
    );
  } else {
    const id = st.nextId++;
    const wanted = (opts.label ?? "").trim().slice(0, 2);
    const label = uniqueLabel(st, wanted);
    st.nodes[id] = { id, label, next: null };
    P.owned.push(id);
    P.arg = id;
    st.marks[id] = "lf-own";
    record(st, p, `Push(${label})`, "start");
    const note =
      wanted && wanted !== label
        ? ` (Popisek ${wanted} už nese jiný uzel.)`
        : "";
    yield snap(
      st,
      pcLine("push", 0),
      `${P.name}: Push nového uzlu ${label}.${note}`,
    );
  }
}

/** Jeden atomický krok procesu p. */
export function* step(st: LFState, p: 0 | 1): StepGen<LFState> {
  const P = st.procs[p];
  st.shown = p;
  st.marks = {};
  if (!P.op) {
    yield refuse(
      st,
      `${P.name} nemá rozpracovanou operaci – zvolte Push nebo Pop.`,
    );
    return;
  }
  const who = P.name;
  if (P.op === "push") {
    const n = P.arg as number;
    const L = (i: number) => pcLine("push", i);
    if (P.pc === 0) {
      P.h = st.head;
      P.pc = 1;
      st.marks[n] = "lf-own";
      if (P.h !== null && P.h !== n) st.marks[P.h] = "lf-read";
      record(st, p, `h = ${lab(st, P.h)}`, "read");
      yield snap(st, L(2), `${who}: h ← head = ${lab(st, P.h)}`);
    } else if (P.pc === 1) {
      st.nodes[n].next = P.h as number | null;
      P.pc = 2;
      st.marks[n] = "lf-own";
      record(st, p, `${st.nodes[n].label}.next ← ${lab(st, P.h)}`, "read");
      yield snap(
        st,
        L(3),
        `${who}: ${st.nodes[n].label}.next ← h = ${lab(st, P.h)}`,
      );
    } else if (st.head === P.h) {
      st.head = n;
      P.owned = P.owned.filter((x) => x !== n);
      P.op = null;
      P.pc = 0;
      st.marks[n] = "lf-new";
      P.log.push(`Push(${st.nodes[n].label}) ✓`);
      record(st, p, "CAS ✓", "ok");
      checkBroken(st);
      yield snap(
        st,
        L(4),
        `${who}: CAS uspěl (head byl stále ${lab(st, P.h)}) → head = ${st.nodes[n].label}.`,
      );
    } else {
      P.pc = 0;
      st.marks[n] = "lf-own";
      record(st, p, "CAS ✗", "fail");
      yield snap(
        st,
        L(5),
        `${who}: CAS selhal – head je ${lab(st, st.head)}, ne ${lab(st, P.h)}. Opakujeme od začátku.`,
      );
    }
    return;
  }
  const L = (i: number) => pcLine("pop", i);
  if (P.pc === 0) {
    P.h = st.head;
    P.s = "nenačteno";
    if (P.h === null) {
      P.op = null;
      record(st, p, "h = ∅ (prázdný)", "end");
      yield snap(
        st,
        L(2),
        `${who}: h ← head = ∅ – zásobník je prázdný, Pop končí.`,
      );
      return;
    }
    P.pc = 1;
    st.marks[P.h] = "lf-read";
    record(st, p, `h = ${lab(st, P.h)}`, "read");
    yield snap(st, L(2), `${who}: h ← head = ${lab(st, P.h)}`);
  } else if (P.pc === 1) {
    const h = P.h as number;
    P.s = st.nodes[h].next;
    P.pc = 2;
    st.marks[h] = "lf-read";
    if (P.s !== null) st.marks[P.s] = "lf-read";
    record(st, p, `s = ${lab(st, P.s)}`, "read");
    yield snap(st, L(3), `${who}: s ← h.next = ${lab(st, P.s)}`);
  } else if (st.head === P.h) {
    const popped = P.h as number;
    const s = P.s as number | null;
    // h.next se od načtení s změnil → head mezitím odešel a vrátil se (ABA), CAS to nepozná
    const now = st.nodes[popped].next;
    st.head = s;
    if (!P.owned.includes(popped)) P.owned.push(popped);
    P.op = null;
    P.pc = 0;
    st.marks[popped] = "lf-own";
    P.log.push(`Pop → ${st.nodes[popped].label}`);
    record(st, p, `CAS ✓ → ${st.nodes[popped].label}`, "ok");
    checkBroken(st);
    const name = st.nodes[popped].label;
    const aba =
      now !== s
        ? ` Jenže ${name}.next je teď ${lab(st, now)}, ne ${lab(st, s)}: head se mezitím změnil a vrátil zpět, CAS to nepoznal.`
        : "";
    yield snap(
      st,
      L(4),
      `${who}: CAS uspěl → head = s = ${lab(st, st.head)}, vrací ${name}.${aba}`,
    );
  } else {
    P.pc = 0;
    record(st, p, "CAS ✗", "fail");
    yield snap(
      st,
      L(5),
      `${who}: CAS selhal – head je ${lab(st, st.head)}, ne ${lab(st, P.h)}. Opakujeme od začátku.`,
    );
  }
}

/** nejvýš tolik kroků při dokončení operace (jediný proces vždy doběhne do 6 kroků; pojistka) */
const FINISH_MAX = 30;

/**
 * Dokončí rozpracovanou operaci procesu p bez prokládání: opakuje step, dokud proces nezahálí.
 * Nečinný proces → jediný chybový krok (jako step).
 */
export function* finishOp(st: LFState, p: 0 | 1): StepGen<LFState> {
  if (!st.procs[p].op) {
    yield* step(st, p);
    return;
  }
  for (let k = 0; k < FINISH_MAX && st.procs[p].op; k++) yield* step(st, p);
}

/**
 * Scénář ABA ze skript: P2 začne Pop (h = A, s = B) a je přerušen; P1 provede Pop, Pop, Push(A);
 * P2 pak dokončí CAS, který uspěje, a vrátí do zásobníku už popnutý uzel B.
 */
export function* abaScenario(st: LFState): StepGen<LFState> {
  Object.assign(st, initial());
  yield snap(
    st,
    null,
    "Scénář ABA: zásobník A → B → C. P2 začne Pop, P1 mu do něj vstoupí.",
  );
  yield* startOp(st, 1, "pop");
  yield* step(st, 1);
  yield* step(st, 1);
  yield snap(
    st,
    pcLine("pop", 3),
    "P2 je uprostřed Popu: načetl h = A, s = B a byl přerušen (plánovačem).",
  );
  for (let k = 0; k < 2; k++) {
    yield* startOp(st, 0, "pop");
    yield* step(st, 0);
    yield* step(st, 0);
    yield* step(st, 0);
  }
  yield* startOp(st, 0, "push", { reuse: true });
  yield* step(st, 0);
  yield* step(st, 0);
  yield* step(st, 0);
  const P2 = st.procs[1];
  st.shown = 1;
  st.marks = {};
  for (const id of [P2.h, P2.s])
    if (typeof id === "number") st.marks[id] = "lf-read";
  yield snap(
    st,
    null,
    "Zásobník je A → C a B vlastní P1. P2 se probudí a dokončí svůj CAS s h = A, s = B…",
  );
  yield* step(st, 1);
  // zvýraznit uzel, který je v zásobníku, ačkoli ho vlastní proces (B u P1)
  st.marks = {};
  for (const id of chainOf(st).ids)
    if (st.procs.some((P) => P.owned.includes(id))) st.marks[id] = "lf-own";
  yield snap(
    st,
    null,
    `Scénář ABA: CAS procesu P2 uspěl, protože head byl zase A – jenže teď head → ${chainOf(
      st,
    )
      .ids.map((id) => st.nodes[id].label)
      .join(" → ")} ` +
      "a uzel B, který vlastní P1, je zpět v zásobníku. Zásobník je poškozený, ačkoli každý CAS proběhl „správně“.",
  );
}
