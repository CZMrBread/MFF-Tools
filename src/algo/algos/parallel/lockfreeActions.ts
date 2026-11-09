/**
 * Nabídka operací bezzámkového zásobníku – čistý model bez Reactu (testy v lockfreeActions.test.ts).
 * LockFreePage z něj skládá akce pro ActionMenu (lfActions) a tlačítka na kartě procesu (cardActions).
 */
import type { StepGen } from "../../core/steps";
import {
  abaScenario,
  emptyStack,
  finishOp,
  freeLabel,
  lab,
  nextAction,
  startOp,
  step,
  stepTitle,
  type LFState,
} from "./lockfree";

interface Base {
  id: string;
  /** text tlačítka */
  label: string;
  /** vysvětlivka u povolené akce */
  title?: string;
  /** proč akce teď nejde; null = jde */
  disabledReason: string | null;
  /** název operace do historie a nad zprávu */
  history: string;
}
/** akce přehraje kroky generátoru (s.run) */
export interface LfRun extends Base {
  kind: "run";
  op: (st: LFState) => StepGen<LFState>;
}
/** akce nahradí stav bez přehrávání (s.reset) */
export interface LfReset extends Base {
  kind: "reset";
  state: () => LFState;
  message: string;
}
export type LfAction = LfRun | LfReset;

const P_IDS = ["p1", "p2"] as const;

function procActions(st: LFState, p: 0 | 1): LfRun[] {
  const P = st.procs[p];
  const id = P_IDS[p];
  const busy = P.op !== null;
  const busyReason = busy
    ? `${P.name} má rozpracovanou operaci – nejdřív ji dokončete krokem „${P.name}: další krok“`
    : null;
  const owned = P.owned[0];
  // nový uzel = nová adresa → vždy dosud nepoužitý popisek (D, E, …)
  const newLabel = freeLabel(st);
  const ownedLabel = owned === undefined ? "popnutý" : lab(st, owned);
  return [
    {
      kind: "run",
      id: `${id}-pop`,
      label: `${P.name}: Pop`,
      title: `${P.name} začne Pop`,
      disabledReason: busyReason,
      history: `${P.name}: Pop`,
      op: (s) => startOp(s, p, "pop"),
    },
    {
      kind: "run",
      id: `${id}-push`,
      label: `${P.name}: Push(${newLabel})`,
      title: `${P.name} začne Push nového uzlu ${newLabel}`,
      disabledReason: busyReason,
      history: `${P.name}: Push(${newLabel})`,
      op: (s) => startOp(s, p, "push", { label: newLabel }),
    },
    {
      kind: "run",
      id: `${id}-reuse`,
      label: `${P.name}: Push(${ownedLabel}) znovu`,
      title: `Znovu vloží uzel ${ownedLabel}, který ${P.name} dříve popnul – stejná adresa v paměti`,
      disabledReason:
        busyReason ??
        (owned === undefined
          ? `${P.name} zatím žádný uzel nevlastní – nejdřív proveďte Pop`
          : null),
      history: `${P.name}: Push(${ownedLabel}) znovu`,
      op: (s) => startOp(s, p, "push", { reuse: true }),
    },
    {
      kind: "run",
      id: `${id}-step`,
      label: `${P.name}: další krok`,
      title: busy
        ? `${P.name} provede: ${nextAction(st, p)?.text ?? "krok"}`
        : undefined,
      disabledReason: busy
        ? null
        : `Nejdřív zvolte Pop nebo Push pro ${P.name}`,
      history: stepTitle(st, p),
      op: (s) => step(s, p),
    },
  ];
}

/** Akce nabídky v pořadí, v jakém se zobrazí. */
export function lfActions(st: LFState): LfAction[] {
  return [
    {
      kind: "run",
      id: "aba",
      label: "Scénář ABA",
      title:
        "Přehraje prokládání ze skript, při kterém CAS uspěje nad recyklovaným uzlem",
      disabledReason: null,
      history: "Scénář ABA",
      op: abaScenario,
    },
    ...procActions(st, 0),
    ...procActions(st, 1),
    {
      kind: "reset",
      id: "empty",
      label: "Vyprázdnit",
      title:
        "Prázdný zásobník a nečinné procesy; zásobník A → B → C vrátí „Výchozí příklad“",
      disabledReason: null,
      history: "Vyprázdnit",
      state: emptyStack,
      message: "Zásobník je prázdný (head = ∅), oba procesy jsou nečinné.",
    },
  ];
}

/** Tlačítka přímo na kartě procesu (jen u rozpracované operace): další krok a dokončení bez prokládání. */
export function cardActions(st: LFState, p: 0 | 1): LfRun[] {
  const P = st.procs[p];
  if (!P.op) return [];
  const next = nextAction(st, p);
  const opName = P.op === "pop" ? "Pop" : `Push(${lab(st, P.arg)})`;
  return [
    {
      kind: "run",
      id: `${P_IDS[p]}-card-step`,
      label: "Další krok",
      title: `${P.name} provede: ${next?.text ?? "krok"}`,
      disabledReason: null,
      history: stepTitle(st, p),
      op: (s) => step(s, p),
    },
    {
      kind: "run",
      id: `${P_IDS[p]}-card-finish`,
      label: "Dokončit",
      title: `${P.name} provede všechny zbývající kroky ${opName} bez přerušení druhým procesem`,
      disabledReason: null,
      history: `${P.name}: dokončit ${opName}`,
      op: (s) => finishOp(s, p),
    },
  ];
}
