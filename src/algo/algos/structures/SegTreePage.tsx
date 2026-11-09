import { useMemo, useState } from "react";
import { moduleByPath } from "../../registry";
import { ActionMenu } from "../../core/ActionMenu";
import { useActionMenu } from "../../core/useActionMenu";
import { listArg, strArg, type ActionDef } from "../../core/actionModel";
import { fmtMath } from "../../core/format";
import { randomArray } from "../../core/steps";
import { usePlayer } from "../../core/usePlayer";
import { useStructure } from "../../core/useStructure";
import { useUrlParam } from "../../core/useUrlParam";
import { Visualizer } from "../../core/Visualizer";
import { VarsView } from "../../views/ArrayView";
import { TreeView, type TEdge, type TNode } from "../../views/TreeView";
import { completeLayout } from "../../views/treeLayout";
import { bookExampleById } from "./bookExample";
import { DEFAULT_SEGTREE_EXAMPLE, SEGTREE_BOOK_EXAMPLES } from "./bookExamples";
import { argList, listFromUrl, toUrl, VALUE_MAX, VALUE_MIN } from "./input";
import { pickLegend, SEG_LEGEND, segClasses } from "./legend";
import {
  bookOptions,
  listText,
  segBookPlan,
  idleCode,
  segOpDefs,
  segPick,
  segPickTarget,
} from "./pageModel";
import { sameList, useUrlSync } from "./useUrlSync";
import { useOpenOnMount } from "./useOpenOnMount";
import {
  BUILD,
  QUERY,
  SEG_MAX,
  UPDATE,
  build,
  buildSteps,
  fmt,
  querySteps,
  updateSteps,
  xs,
  type SegState,
} from "./segtree";

/** posloupnost v listech stromu: x₀, x₁, … až po první doplněk +∞ */
function segValues(q: SegState): number[] {
  const out: number[] = [];
  for (let k = 0; k < q.n; k++) {
    const v = q.S[q.n + k];
    if (v === null || v === undefined) break;
    out.push(v);
  }
  return out;
}

/** výchozí příklad z knihy (obr. 4.6); výchozí dotaz ⟨2, 6⟩ se rozloží na 2 kanonické intervaly */
const INITIAL = [
  ...bookExampleById(SEGTREE_BOOK_EXAMPLES, DEFAULT_SEGTREE_EXAMPLE)!.values,
];
const VALUES = { min: VALUE_MIN, max: VALUE_MAX };
const FIGURES = bookOptions(SEGTREE_BOOK_EXAMPLES);
/** pseudokód akcí, který panel ukáže před první operací */
const IDLE_CODE: Record<string, readonly string[]> = {
  query: QUERY,
  update: UPDATE,
  build: BUILD,
};

export function SegTreePage() {
  const [urlA, setUrlA] = useUrlParam("a");
  // ze sdíleného odkazu, jinak výchozí příklad; strom se staví jen jednou
  const [start] = useState(() => listFromUrl(urlA, SEG_MAX) ?? INITIAL);
  const s = useStructure<SegState>(
    () => build(start),
    start === INITIAL
      ? `Strom z obr. 4.6 Průvodce nad posloupností ${INITIAL.join(" ")}. Vyzkoušejte dotaz Min⟨i, j⟩ nebo změnu prvku IntUpdate(i, x) – kroky se připraví a ▶ (mezerník) je přehraje.`
      : "Strom ze sdíleného odkazu. Vyzkoušejte dotaz Min⟨i, j⟩ nebo změnu prvku IntUpdate(i, x).",
  );
  // po operaci a po ↶ adresa nese aktuální posloupnost x₀ … (listy až po první +∞)
  const synced = useUrlSync(s, (q) => {
    const v = segValues(q);
    setUrlA(v.length && !sameList(v, INITIAL) ? toUrl(v) : null);
  });
  const player = usePlayer(s.steps);
  const st = player.current?.state;

  const n = s.last.n;
  const legend = useMemo(
    () => pickLegend(SEG_LEGEND, segClasses(s.steps)),
    [s.steps],
  );

  /** Build: postaví strom z posloupnosti (animovaně) a zapíše vstup do adresy */
  const apply = (values: number[]) => {
    setUrlA(toUrl(values));
    s.run(`Build(${argList(values)})`, BUILD, (q) => buildSteps(q, values));
  };

  const defs: ActionDef[] = [
    {
      id: "create",
      label: "Vytvořit",
      title: "Strom z obrázku Průvodce nebo z náhodné posloupnosti",
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
              default: DEFAULT_SEGTREE_EXAMPLE,
            },
          ],
        },
        {
          id: "random",
          label: "Náhodně",
          title: "Build z 8 náhodných čísel od 1 do 30",
        },
      ],
      run: (v, variant) => {
        if (variant === "random") {
          const values = randomArray(8, 30);
          menu.dispatch({ type: "text", name: "A", text: listText(values) });
          apply(values);
          return;
        }
        const ex = bookExampleById(SEGTREE_BOOK_EXAMPLES, strArg(v, "fig"))!;
        const plan = segBookPlan(ex);
        setUrlA(ex.id === DEFAULT_SEGTREE_EXAMPLE ? null : toUrl(plan.values));
        s.reset(ex.build(), plan.message, plan.title);
        for (const [name, text] of Object.entries(plan.texts))
          menu.dispatch({ type: "text", name, text });
      },
    },
    {
      id: "build",
      label: "Build(A)",
      title: `postaví strom nad posloupností (nejvýše ${SEG_MAX} prvků)`,
      args: [
        {
          kind: "list",
          name: "A",
          label: "A =",
          ...VALUES,
          maxCount: SEG_MAX,
          default: start,
          placeholder: "např. 3, 1, 4, 1, 5",
        },
      ],
      run: (v) => apply(listArg(v, "A")),
    },
    ...segOpDefs(n, VALUES, {
      // meze hlídá nabídka (i < j, i, j podle aktuálního stromu) – neplatný dotaz se vůbec nespustí
      query: (i, j) =>
        s.run(`Min⟨${i}, ${j}⟩`, QUERY, (q) => querySteps(q, i, j)),
      update: (i, x) =>
        s.run(`IntUpdate(${i}, ${x})`, UPDATE, (q) => updateSteps(q, i, x)),
    }),
  ];
  const menu = useActionMenu(defs);
  // dotaz Min⟨2, 6⟩ je rozbalený hned – stačí Provést nebo Enter
  useOpenOnMount(menu, "query");

  /** klik na vrchol: interval vrcholu do dotazu, u změny prvku index listu */
  const pickNode = (v: number) => {
    if (!st) return;
    const r = segPick(
      v,
      st.n,
      segPickTarget(menu.state.open, menu.state.lastRun),
    );
    // první mez vyplní menu.pick (otevřená akce, fokus na Provést), ostatní pole přímo
    const [[, first], ...rest] = Object.entries(r.texts);
    for (const [name, text] of rest)
      menu.dispatch({ type: "text", name, text });
    menu.dispatch({ type: "open", id: r.open });
    menu.pick(Number(first));
  };

  // „Výchozí příklad“ vrátí i pole A a adresu, aby nesvítil starý vstup
  const restore = () => {
    menu.dispatch({ type: "text", name: "A", text: listText(start) });
    setUrlA(start === INITIAL ? null : toUrl(start));
    s.restoreInitial();
  };

  const nodes: TNode[] = [];
  const edges: TEdge[] = [];
  if (st) {
    for (let v = 1; v < 2 * st.n; v++) {
      const { x, y } = completeLayout(v - 1);
      const leaf = v >= st.n;
      const lo = v - st.n;
      // interval kanonického vrcholu
      const depth = Math.floor(Math.log2(v));
      const size = st.n / 2 ** depth;
      const from = (v - 2 ** depth) * size;
      let cls = st.marks[v] ?? "";
      if (leaf && st.queried && lo >= st.queried[0] && lo < st.queried[1])
        cls += " n-queried";
      nodes.push({
        id: v,
        label: fmt(st.S[v]),
        x,
        y,
        cls,
        // index vrcholu před intervalem – hlášky o něm mluví („vrchol v = 5 ⟨2,4⟩“)
        sub: leaf ? `${v} · ${xs(lo)}` : `${v} · ⟨${from},${from + size}⟩`,
        aria: `Vrchol ${v} ${leaf ? xs(lo) : `⟨${from},${from + size}⟩`}, minimum ${fmt(st.S[v])}`,
      });
      if (v > 1) edges.push({ from: Math.floor(v / 2), to: v });
    }
  }

  return (
    <Visualizer
      title={moduleByPath("/ds/segtree")?.title ?? "Intervalový strom"}
      description={
        <>
          <p>
            {fmtMath(
              "Intervalový strom pro minima: posloupnost x_0 … x_{n−1} leží v listech, každý vnitřní vrchol si pamatuje minimum svého podstromu. Strom je uložen v poli jako halda: vrchol v má syny 2v a 2v+1. Dotaz ⟨i, j⟩ (prvky x_i … x_{j−1}) se rozloží na nejvýše 2 log n kanonických intervalů, změna prvku přepočítá jen cestu do kořene.",
            )}
          </p>
          <p className="complexity">
            <b>Build:</b> O(n) · <b>dotaz na minimum intervalu:</b> O(log n) ·{" "}
            <b>změna prvku:</b> O(log n) · nejvýše {SEG_MAX} prvků; počet listů
            se doplní na mocninu dvojky hodnotami +∞
          </p>
        </>
      }
      structure={synced}
      onRestoreInitial={restore}
      share
      tip={fmtMath(
        "Min⟨1, 7⟩ – dotaz se rozpadne na 4 kanonické intervaly. Pak IntUpdate(3, 0) a stejný dotaz znovu: minimum se změní, ale přepočítala se jen cesta z listu x_3 do kořene.",
      )}
      actions={<ActionMenu menu={menu} />}
      player={player}
      pseudocode={idleCode(s.pseudocode, menu.state.open, IDLE_CODE, "query")}
      legend={legend}
    >
      {st && (
        <>
          <TreeView
            nodes={nodes}
            edges={edges}
            levelHeight={64}
            radius={18}
            minRadius={12}
            onPick={(node) => pickNode(node.id)}
            ariaLabel={`Intervalový strom nad ${st.n} listy, minimum ${fmt(st.S[1])}`}
          />
          <VarsView vars={st.vars} />
        </>
      )}
    </Visualizer>
  );
}
