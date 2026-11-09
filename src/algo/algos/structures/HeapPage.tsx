import { useMemo, useState } from "react";
import { moduleByPath } from "../../registry";
import { ActionMenu } from "../../core/ActionMenu";
import { CanvasFit } from "../../core/canvasFit";
import { useActionMenu } from "../../core/useActionMenu";
import {
  listArg,
  numArg,
  strArg,
  type ActionDef,
  type IntArgDef,
} from "../../core/actionModel";
import { randomArray } from "../../core/steps";
import { usePlayer } from "../../core/usePlayer";
import { useStructure } from "../../core/useStructure";
import { useUrlParam } from "../../core/useUrlParam";
import { Visualizer } from "../../core/Visualizer";
import { ArrayView, VarsView } from "../../views/ArrayView";
import { TreeView, type TEdge, type TNode } from "../../views/TreeView";
import {
  completeLayout,
  fitLevelHeight,
  levelFitLimits,
  minLevelHeight,
  treeDepth,
} from "../../views/treeLayout";
import {
  EXTRACT,
  HEAP_MAX,
  INSERT,
  MAKE,
  heapExtractMin,
  heapFrom,
  heapInsert,
  heapKeys,
  heapOf,
  makeHeap,
  type HeapState,
} from "./heap";
import { bookExampleById } from "./bookExample";
import { DEFAULT_HEAP_EXAMPLE, HEAP_BOOK_EXAMPLES } from "./bookExamples";
import { argList, listFromUrl, toUrl, VALUE_MAX, VALUE_MIN } from "./input";
import { HEAP_LEGEND, heapClasses, pickLegend } from "./legend";
import { bookOptions, heapBookPlan, idleCode, listText } from "./pageModel";
import { sameList, useUrlSync } from "./useUrlSync";

/** pseudokód akcí, který panel ukáže před první operací */
const IDLE_CODE: Record<string, readonly string[]> = {
  insert: INSERT,
  extractMin: EXTRACT,
  make: MAKE,
};
import { useOpenOnMount } from "./useOpenOnMount";

/** výchozí vzdálenost hladin stromu haldy (px, výchozí TreeView) */
const LEVEL = 72;

/** výchozí příklad z knihy (obr. 4.2) – už je to halda */
const BOOK = bookExampleById(HEAP_BOOK_EXAMPLES, DEFAULT_HEAP_EXAMPLE)!;
const INITIAL = [...BOOK.values];
/** klíč, který kniha na obr. 4.2 vkládá */
const BOOK_X = BOOK.ops[0]?.op === "insert" ? BOOK.ops[0].x : 1;
const VALUES = { min: VALUE_MIN, max: VALUE_MAX };
const FIGURES = bookOptions(HEAP_BOOK_EXAMPLES);

export function HeapPage() {
  const [urlA, setUrlA] = useUrlParam("a");
  // ze sdíleného odkazu postavíme haldu (MakeHeap bez animace), jinak výchozí příklad; jen jednou
  const [start] = useState(() => listFromUrl(urlA, HEAP_MAX));
  const s = useStructure<HeapState>(
    () => (start ? heapFrom(start) : heapOf(INITIAL)),
    start
      ? "Halda ze sdíleného odkazu. Vyzkoušejte Insert(x) nebo ExtractMin – kroky se připraví a ▶ (mezerník) je přehraje."
      : `Halda z obr. 4.2 Průvodce (${INITIAL.length} prvků, minimum ${INITIAL[0]} je v kořeni). Vyzkoušejte Insert(${BOOK_X}) jako v knize nebo ExtractMin – kroky se připraví a ▶ (mezerník) je přehraje.`,
  );
  // po operaci a po ↶ adresa nese aktuální pole haldy (MakeHeap z něj postaví stejnou haldu)
  const synced = useUrlSync(s, (q) => {
    const v = q.a.map((it) => it.v);
    setUrlA(v.length && !sameList(v, INITIAL) ? toUrl(v) : null);
  });
  const player = usePlayer(s.steps);
  const st = player.current?.state;

  const n = s.last.a.length;
  const legend = useMemo(
    () => pickLegend(HEAP_LEGEND, heapClasses(s.steps)),
    [s.steps],
  );

  /** MakeHeap: postaví haldu z libovolného pole (animovaně) a zapíše vstup do adresy */
  const make = (values: number[]) => {
    setUrlA(toUrl(values));
    s.run(`MakeHeap(${argList(values)})`, MAKE, (q) => makeHeap(q, values));
  };

  const X: IntArgDef = {
    kind: "int",
    name: "x",
    label: "x =",
    ...VALUES,
    default: BOOK_X,
  };
  const defs: ActionDef[] = [
    {
      id: "create",
      label: "Vytvořit",
      title: "Halda z obrázku Průvodce, náhodná, nebo prázdná",
      variants: [
        {
          id: "book",
          label: "Příklady z knihy",
          args: [
            {
              kind: "choice",
              name: "fig",
              label: "Obrázek",
              options: FIGURES,
              default: DEFAULT_HEAP_EXAMPLE,
            },
          ],
        },
        {
          id: "random",
          label: "Náhodně",
          title: "MakeHeap z 10 náhodných čísel od 1 do 50",
        },
        { id: "empty", label: "Prázdná" },
      ],
      run: (v, variant) => {
        if (variant === "random") {
          const values = randomArray(10, 50);
          menu.dispatch({ type: "text", name: "A", text: listText(values) });
          make(values);
        } else if (variant === "empty") {
          setUrlA(null);
          s.reset(
            heapOf([]),
            "Halda je prázdná. Vložte prvky pomocí Insert(x), nebo ji postavte z pole – MakeHeap(A).",
            "Vyprázdnit",
          );
        } else {
          const ex = bookExampleById(HEAP_BOOK_EXAMPLES, strArg(v, "fig"))!;
          const plan = heapBookPlan(ex);
          // výchozí příklad stránky má čistou adresu, ostatní obrázky se sdílejí jako ?a=…
          setUrlA(ex.id === DEFAULT_HEAP_EXAMPLE ? null : toUrl(plan.values));
          s.reset(ex.build(), plan.message, plan.title);
          for (const [name, text] of Object.entries(plan.texts))
            menu.dispatch({ type: "text", name, text });
          if (plan.open) menu.dispatch({ type: "open", id: plan.open });
        }
      },
    },
    {
      id: "make",
      label: "MakeHeap(A)",
      title: "postaví haldu z libovolného pole v O(n) – probubláváním zdola",
      args: [
        {
          kind: "list",
          name: "A",
          label: "A =",
          ...VALUES,
          maxCount: HEAP_MAX,
          default: start ?? INITIAL,
          placeholder: "např. 9, 4, 7, 1",
        },
      ],
      run: (v) => make(listArg(v, "A")),
    },
    {
      id: "insert",
      label: "Insert(x)",
      args: [X],
      title:
        "vloží x jako nový list a nechá ho vybublat nahoru; x vyplní i klik na vrchol",
      disabledReason:
        n >= HEAP_MAX
          ? `Halda je plná – vizualizace ukazuje nejvýše ${HEAP_MAX} prvků. Nejdřív nějaký odeberte (ExtractMin).`
          : null,
      run: (v) => {
        const x = numArg(v, "x");
        s.run(`Insert(${x})`, INSERT, (q) => heapInsert(q, x));
      },
    },
    {
      id: "extractMin",
      label: "ExtractMin",
      title: "odebere a vrátí minimum (kořen)",
      disabledReason: n === 0 ? "Halda je prázdná – není co odebrat" : null,
      run: () => s.run("ExtractMin", EXTRACT, (q) => heapExtractMin(q)),
    },
  ];
  const menu = useActionMenu(defs);
  // Insert(x) s x z obr. 4.2 je rozbalený hned – „Insert(1) jako v knize“ je jeden klik
  useOpenOnMount(menu, "insert");

  // „Výchozí příklad“ vrátí i pole A a adresu, aby nesvítil starý vstup
  const restore = () => {
    menu.dispatch({
      type: "text",
      name: "A",
      text: listText(start ?? INITIAL),
    });
    setUrlA(start ? toUrl(start) : null);
    s.restoreInitial();
  };

  const nodes: TNode[] = (st?.a ?? []).map((it, i) => ({
    id: it.id,
    label: String(it.v),
    ...completeLayout(i),
    cls: st?.marks[i] ? "n-" + st.marks[i] : undefined,
    sub: String(i + 1),
    // klíče se v haldě opakují – přístupný název nese i index (unikátní)
    aria: `Vrchol s klíčem ${it.v}, index ${i + 1}`,
  }));
  // velká halda (5 hladin): hladiny stáhnout, dokud se vrcholy nepřekrývají, pole pod stromem nižší
  const many = nodes.length > 15;
  const heapMinLevel = Math.max(many ? 40 : 34, minLevelHeight(nodes, 560, 14));
  const edges: TEdge[] = (st?.a ?? [])
    .slice(1)
    .map((it, k) => ({ from: st!.a[Math.floor(k / 2)].id, to: it.id }));
  const keys = st ? heapKeys(st) : [];

  return (
    <Visualizer
      title={moduleByPath("/ds/heap")?.title ?? "Binární halda"}
      description={
        <>
          <p>
            Minimová binární halda: binární strom, v němž jsou všechny hladiny
            kromě poslední plné a každý otec má klíč ≤ klíče synů. Díky
            pravidelnému tvaru se ukládá do pole: vrchol i má syny 2i a 2i+1,
            otce ⌊i/2⌋. Minimum je vždy v kořeni.
          </p>
          <p className="complexity">
            <b>Insert, ExtractMin:</b> O(log n) · <b>Min:</b> O(1) ·{" "}
            <b>MakeHeap:</b> O(n) · vizualizace ukazuje nejvýše {HEAP_MAX} prvků
            (5 hladin)
          </p>
        </>
      }
      structure={synced}
      onRestoreInitial={restore}
      share
      tip="Provést u Insert(1) jako na obr. 4.2 – nový list 13 vybublá přes vrcholy 6 a 3 a zastaví se pod kořenem 0. Pak ExtractMin a sledujte, ke kterému synovi se nový kořen probublává dolů."
      actions={<ActionMenu menu={menu} />}
      player={player}
      pseudocode={idleCode(s.pseudocode, menu.state.open, IDLE_CODE, "insert")}
      legend={legend}
    >
      {st && (
        <>
          {/* vzdálenost hladin podle výšky plátna (desktop na jednu obrazovku); pole pod stromem stejné */}
          <CanvasFit
            limits={levelFitLimits(LEVEL, treeDepth(nodes), heapMinLevel)}
          >
            {(fit) => (
              <TreeView
                nodes={nodes}
                edges={edges}
                levelHeight={fitLevelHeight(
                  LEVEL,
                  fit,
                  treeDepth(nodes),
                  heapMinLevel,
                )}
                // 31 prvků: zúžit vrcholy a mezery mezi listy místo zmenšení písma (SORTDS-07)
                minRadius={12}
                ariaLabel={`Halda jako strom: ${keys.join(", ") || "prázdná"}`}
                // klik na vrchol vyplní klíč do argumentu (Insert(x))
                onPick={(node) => menu.pick(Number(node.label))}
              />
            )}
          </CanvasFit>
          <ArrayView
            items={st.a}
            marks={st.marks}
            min={Math.min(0, ...keys)}
            max={Math.max(1, ...keys)}
            height={many ? 64 : 90}
            // u velké haldy nese index popisek pod vrcholem stromu – pod sloupci by byl nečitelně malý
            showIndex={!many}
            label={
              many
                ? "totéž jako pole (index je pod vrcholem stromu)"
                : "totéž jako pole (indexy od 1)"
            }
            onPick={(_, v) => menu.pick(v)}
          />
          <VarsView
            vars={st.vars}
            reserve={player.steps.some(
              (x) => Object.keys(x.state.vars).length > 0,
            )}
          />
        </>
      )}
    </Visualizer>
  );
}
