import { useEffect, useState } from "react";
import { moduleByPath } from "../../registry";
import { Navigate, useParams } from "react-router-dom";
import { ActionMenu } from "../../core/ActionMenu";
import { CanvasFit } from "../../core/canvasFit";
import { fmtMath } from "../../core/format";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { useStructure } from "../../core/useStructure";
import { useUrlParam } from "../../core/useUrlParam";
import { Visualizer } from "../../core/Visualizer";
import { VarsView } from "../../views/ArrayView";
import { TreeView } from "../../views/TreeView";
import {
  fitLevelHeight,
  levelFitLimits,
  minLevelHeight,
  treeDepth,
} from "../../views/treeLayout";
import type { TreeBookOp } from "./bookExamples";
import { emptyTree, layout, type TreeState } from "./bst";
import { displayVars, keysFromParam } from "./keys";
import { toLegend, treeLegend } from "./legend";
import {
  exampleMessage,
  exampleTitle,
  nextBookOp,
  treeActions,
} from "./treeMenu";
import {
  DEFAULT_ALPHA,
  DEFAULT_KEYS,
  DEFAULT_X,
  insertDefault,
  levelOrderKeys,
  MAX_NODES,
  SUB_HINT,
  TIPS,
  TREE_KEYS,
  alphaFromParam,
  alphaNotice,
  buildTree,
  initialMessage,
  opDisabledReason,
  planOp,
  type Kind,
  type OpName,
} from "./treeOps";
import { sizeLabels } from "./trees2";
import { useOpenOnMount } from "../structures/useOpenOnMount";
import { sameList, useUrlSync } from "../structures/useUrlSync";

/** operace, jejíž pseudokód panel ukáže před první operací: otevřená, jinak Insert */
const idleOp = (open: string | null): OpName =>
  open === "find" || open === "delete" ? open : "insert";

/** odhad šířky plátna zdola pro stažení hladin hlubokého stromu (px) */
const DEEP_TREE_W = 560;

/** výchozí vzdálenost hladin stromu (px) */
const LEVEL = 68;

const INFO: Record<Kind, { title: string; desc: string; cx: string }> = {
  bst: {
    title: "Binární vyhledávací strom (BST)",
    desc: "Binary search tree (BST): v každém vrcholu je klíč; všechny klíče v levém podstromu jsou menší, v pravém větší. Find, Insert i Delete jdou po jedné cestě od kořene, takže stojí O(hloubka). Bez vyvažování může strom degenerovat na cestu s hloubkou n – zkuste vložit setříděnou posloupnost.",
    cx: "Find, Insert, Delete: O(h), kde h je hloubka stromu; v nejhorším případě Θ(n)",
  },
  avl: {
    title: "AVL strom",
    desc: "Vyhledávací strom s hloubkovým vyvážením: u každého vrcholu se hloubky levého a pravého podstromu liší nejvýše o 1 (znaménko δ ∈ {−1, 0, +1}). Po vložení či smazání se vracíme ke kořeni, přepočítáváme znaménka a rovnováhu opravujeme rotacemi; jakmile se hloubka podstromu nezměnila, končíme. Insert vystačí s jednou (jednoduchou nebo dvojitou) rotací, Delete jich může potřebovat víc. Hloubka je vždy O(log n).",
    cx: "Find, Insert, Delete: O(log n)",
  },
  splay: {
    title: "Splay strom",
    desc: "Samoupravující se BST bez jakýchkoli vyvažovacích informací: po každém přístupu vyneseme navštívený vrchol do kořene posloupností dvojitých rotací (zig-zig, zig-zag) a nejvýše jedné jednoduché (zig). Jednotlivá operace může stát Θ(n), ale amortizovaně O(log n). Potenciál Φ = Σ log₂ s(v) – sledujte, jak klesá při „narovnávání“ dlouhých cest. Delete podle Průvodce (9.5, obr. 9.7): x vysplayujeme do kořene a odebereme, maximum levého podstromu vysplayujeme do jeho kořene a připojíme k němu pravý podstrom. Přednáška DS I (skripta Mareš, 2.2) uvádí i variantu: smazat x jako v obyčejném BST a vysplayovat otce odstraněného vrcholu – amortizovaně je také O(log n).",
    cx: "Find, Insert, Delete: O(log n) amortizovaně; posloupnost k operací O((n + k) log n)",
  },
  bb: {
    title: "BB[α]-strom (váhové vyvážení, líná přestavba)",
    desc: "Váhově vyvážený strom s línou přestavbou: u každého vrcholu u má každý syn nejvýše α·s_u vrcholů (1/2 < α < 1), takže hloubka je O(log n). Vkládáme a mažeme jako v BST; když se podmínka poruší, nejvyšší porušený podstrom celý přestavíme na dokonale vyvážený v čase O(s_u). Potenciál Φ = Σ |s_levý − s_pravý| (pro rozdíl ≥ 2) ukazuje, že přestavby jsou amortizovaně zdarma. Když α mezi operacemi snížíte, další Insert nebo Delete nejdřív zkontroluje celý strom.",
    cx: "Find: O(log n); Insert, Delete: O(log n) amortizovaně",
  },
};

const KINDS: readonly string[] = ["bst", "avl", "splay", "bb"];

/** semínko náhodného vstupu (volá se až při Vytvořit ▸ Náhodně) */
const now = () => Date.now();

export function TreePage() {
  const { id } = useParams();
  // neznámé id („#/tree/foo“) nepřesměruje na BST potichu, ale na přehled (ten ohlásí neexistující adresu)
  if (!id || !KINDS.includes(id))
    return <Navigate to="/" replace state={{ unknown: `/tree/${id ?? ""}` }} />;
  const kind = id as Kind;
  return <TreeInner key={kind} kind={kind} />;
}

function TreeInner({ kind }: { kind: Kind }) {
  const info = INFO[kind];
  const [kParam, setK] = useUrlParam("k");
  const [alphaParam, setAlphaParam] = useUrlParam("alpha");
  // vstup z adresy čteme jen při otevření stránky; dál ho jen zapisujeme
  const [opened] = useState(() => {
    const fromUrl = keysFromParam(kParam, TREE_KEYS, MAX_NODES);
    const keys = fromUrl ?? DEFAULT_KEYS[kind];
    return {
      keys,
      fromUrl: fromUrl !== null,
      x: keys.includes(DEFAULT_X[kind]) ? DEFAULT_X[kind] : keys[0],
      insertX: insertDefault(kind, keys),
      alpha: alphaFromParam(alphaParam),
    };
  });
  const s = useStructure<TreeState>(
    () => buildTree(opened.keys, kind),
    initialMessage(kind, opened.fromUrl),
  );
  // po operaci a po ↶ adresa nese klíče po hladinách (u BST, AVL a splay z nich vznikne stejný tvar)
  const synced = useUrlSync(s, (q) => {
    const k = levelOrderKeys(q);
    setK(
      k.length &&
        !sameList(k, levelOrderKeys(buildTree(DEFAULT_KEYS[kind], kind)))
        ? k.join(",")
        : null,
    );
  });
  const player = usePlayer(s.steps);
  const [alpha, setAlpha] = useState(opened.alpha);
  // zbývající operace načteného obrázku z knihy (předvyplňují se jedna po druhé)
  const [bookOps, setBookOps] = useState<TreeBookOp[]>([]);

  const st = player.current?.state ?? s.last;
  const lay = layout(st);
  if (kind === "splay" || kind === "bb") {
    const sub = sizeLabels(st);
    for (const n of lay.nodes) n.sub = sub.get(n.id);
  }

  /** předvyplní operaci (z obrázku nebo doporučenou) a otevře ji s fokusem na Provést */
  const prefill = (op: OpName, x: number) => {
    menu.dispatch({ type: "text", name: "x", text: String(x) });
    menu.dispatch({ type: "open", id: op });
    menu.focusRef.current = { to: "go" };
  };
  const setKeysField = (keys: readonly number[]) =>
    menu.dispatch({ type: "text", name: "A", text: keys.join(", ") });

  const runOp = (op: OpName, x: number) => {
    if (opDisabledReason(s.last, op, x) !== null) return;
    const p = planOp(kind, op, x, alpha);
    s.run(p.title, p.pseudocode, p.run);
    const rest = nextBookOp(bookOps, op, x);
    setBookOps(rest);
    const next = rest[0];
    if (next) prefill(next.op, next.x);
  };

  /** Nový strom z klíčů (Vytvořit ▸ Vlastní / Náhodně / Seřazeně / Prázdný) – i to jde vrátit. */
  const rebuild = (
    keys: number[],
    message: string,
    title: string,
    x?: number | null,
  ) => {
    setBookOps([]);
    s.reset(
      keys.length ? buildTree(keys, kind) : emptyTree(kind === "avl"),
      message,
      title,
    );
    if (keys.length) setKeysField(keys);
    setK(keys.length ? keys.join(",") : null);
    if (x !== undefined && x !== null)
      menu.dispatch({ type: "text", name: "x", text: String(x) });
  };

  const changeAlpha = (a: number) => {
    setAlpha(a);
    setAlphaParam(a === DEFAULT_ALPHA ? null : String(a));
  };

  const menu = useActionMenu(
    treeActions(
      {
        kind,
        state: s.last,
        keys: opened.keys,
        x: opened.x,
        insertX: opened.insertX,
        alpha,
        seed: now,
      },
      {
        op: runOp,
        rebuild,
        alpha: changeAlpha,
        example: (ex) => {
          s.reset(ex.build(), exampleMessage(ex), exampleTitle(ex));
          setKeysField(ex.keys);
          setK(ex.keys.join(","));
          setBookOps([...ex.ops]);
          const first = ex.ops[0];
          if (first) prefill(first.op, first.x);
        },
      },
    ),
  );
  // Insert(x) s nabízeným novým klíčem je rozbalený hned – stačí Provést nebo Enter (CROSS-06)
  useOpenOnMount(menu, "insert");
  const { dispatch } = menu;
  // zvolená varianta α v nabídce odpovídá α stránky (i po otevření odkazu s ?alpha=)
  useEffect(() => {
    if (kind === "bb")
      dispatch({ type: "variant", id: "alpha", variant: String(alpha) });
  }, [kind, alpha, dispatch]);

  const restore = () => {
    s.restoreInitial();
    setBookOps([]);
    setKeysField(opened.keys);
    menu.dispatch({ type: "text", name: "x", text: String(opened.x) });
    setAlpha(opened.alpha);
    setK(opened.fromUrl ? opened.keys.join(",") : null);
    setAlphaParam(opened.alpha === DEFAULT_ALPHA ? null : String(opened.alpha));
  };

  const warn = kind === "bb" ? alphaNotice(s.last, alpha) : null;
  // hluboký strom (cesta ze setříděného vstupu): menší vrcholy a hladiny stažené, dokud se vrcholy
  // nepřekrývají (šířka odhadem zdola – plátno je na desktopu širší), aby písmo nekleslo pod 10 px
  const depth = treeDepth(lay.nodes);
  const radius = depth >= 5 ? 14 : 20;
  const minLevel =
    depth >= 5 ? minLevelHeight(lay.nodes, DEEP_TREE_W, radius) : undefined;

  return (
    <Visualizer
      title={moduleByPath(`/tree/${kind}`)?.title ?? info.title}
      description={
        <>
          <p>{fmtMath(info.desc)}</p>
          <p className="complexity">
            <b>Složitost:</b> {info.cx}
          </p>
        </>
      }
      actions={<ActionMenu menu={menu} />}
      input={warn ? <p className="hint input-warn">{warn}</p> : undefined}
      player={player}
      pseudocode={
        s.pseudocode.length
          ? s.pseudocode
          : planOp(kind, idleOp(menu.state.open), null).pseudocode
      }
      structure={synced}
      onRestoreInitial={restore}
      share
      notes={
        kind === "bb" ? (
          <p className="hint">
            Kopírovat odkaz: odkaz nese klíče, ne přesný tvar – strom se z nich
            postaví znovu, takže po operacích může vypadat jinak.
          </p>
        ) : undefined
      }
      tip={fmtMath(TIPS[kind])}
      legend={toLegend(treeLegend(kind))}
    >
      {/* vzdálenost hladin podle výšky plátna (desktop na jednu obrazovku) – vrcholy zůstanou 1 : 1 */}
      <CanvasFit limits={levelFitLimits(LEVEL, depth, minLevel)}>
        {(fit) => (
          <TreeView
            nodes={lay.nodes}
            edges={lay.edges}
            levelHeight={fitLevelHeight(LEVEL, fit, depth, minLevel)}
            radius={radius}
            minRadius={10}
            // hluboký strom se raději posouvá, než aby popisky klesly pod 10 px
            minScale={depth > 10 ? 0.91 : undefined}
            // klik na vrchol: klíč do x otevřené (nebo naposledy použité) operace
            onPick={(n) => menu.pick(Number(n.label))}
          />
        )}
      </CanvasFit>
      {SUB_HINT[kind] && <p className="hint">{SUB_HINT[kind]}</p>}
      <VarsView vars={displayVars(st.vars)} />
    </Visualizer>
  );
}
