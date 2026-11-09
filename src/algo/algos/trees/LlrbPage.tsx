/**
 * Červeno-černý strom LLRB (#/tree/llrb, Průvodce 8.4, str. 206–214): LlrbInsert ve variantách (2,3)
 * a (2,4), LlrbDelete, LlrbDeleteMin / Max s MoveRedLeft / MoveRedRight, vedle volitelně překlad na
 * (2,4)-strom (obr. 8.11). Tenká vrstva – logika v llrb.ts, llrbBook.ts a llrbPageModel.ts.
 */
import { useEffect, useRef, useState } from "react";
import { ActionMenu } from "../../core/ActionMenu";
import { CanvasFit } from "../../core/canvasFit";
import { fmtMath } from "../../core/format";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { useStructure } from "../../core/useStructure";
import { useUrlParam } from "../../core/useUrlParam";
import { Visualizer } from "../../core/Visualizer";
import { moduleByPath } from "../../registry";
import { VarsView } from "../../views/ArrayView";
import { MultiTreeView } from "../../views/MultiTreeView";
import { TreeView } from "../../views/TreeView";
import {
  fitLevelHeight,
  levelFitLimits,
  minLevelHeight,
  treeDepth,
} from "../../views/treeLayout";
import { useOpenOnMount } from "../structures/useOpenOnMount";
import { useUrlSync } from "../structures/useUrlSync";
import { displayVars, parseKey } from "./keys";
import { toLegend } from "./legend";
import {
  buildLlrb,
  emptyLlrb,
  islandsLayout,
  llrbLayout,
  type LlrbState,
  type LlrbVariant,
} from "./llrb";
import type { LlrbBookOp } from "./llrbBook";
import {
  LLRB_DEFAULT_X,
  LLRB_LEGEND,
  LLRB_TIP,
  idlePseudocode,
  insertDefault,
  linkState,
  llrbActions,
  llrbExampleMessage,
  llrbExampleTitle,
  llrbFieldKeys,
  openLlrb,
  opDisabledReason,
  planOp,
  switchVariant,
  variantLabel,
  type LlrbOp,
} from "./llrbPageModel";

const PATH = "/tree/llrb";
const LEGEND = toLegend(LLRB_LEGEND);
/** výchozí vzdálenost hladin (px); CanvasFit ji na desktopu přizpůsobí výšce plátna */
const LEVEL = 64;
/** vzdálenost hladin (2,4)-stromu vedle (px) */
const AB_LEVEL = 64;
/** odhad šířky plátna zdola pro stažení hladin hlubokého stromu (px) */
const DEEP_TREE_W = 520;

/** semínko náhodného vstupu (volá se až při Vytvořit ▸ Náhodně) */
const now = () => Date.now();

export function LlrbPage() {
  const [tParam, setT] = useUrlParam("t");
  const [kParam, setK] = useUrlParam("k");
  const [vParam, setV] = useUrlParam("v");
  const [abParam, setAb] = useUrlParam("ab");
  // vstup z adresy čteme jen při otevření stránky; dál ho jen zapisujeme
  const [opened] = useState(() => {
    const o = openLlrb({ t: tParam, k: kParam, v: vParam });
    return {
      ...o,
      x: o.keys.includes(LLRB_DEFAULT_X)
        ? LLRB_DEFAULT_X
        : (o.keys[0] ?? LLRB_DEFAULT_X),
      insertX: insertDefault(o.keys),
      ab: abParam === "1",
    };
  });
  const s = useStructure<LlrbState>(() => opened.state, opened.message);
  const writeLink = (q: LlrbState) => {
    const l = linkState(q);
    setT(l.t);
    setV(l.v);
    setK(null);
  };
  // po operaci a po ↶ adresa nese přesný strom (t=) a variantu (v=)
  const synced = useUrlSync(s, writeLink);
  const player = usePlayer(s.steps);
  const [showAb, setShowAb] = useState(opened.ab);
  // zbývající operace načteného příkladu z knihy (předvyplňují se jedna po druhé)
  const [bookOps, setBookOps] = useState<LlrbBookOp[]>([]);

  const st = player.current?.state ?? s.last;
  const variant = s.last.variant;
  const lay = llrbLayout(st);
  const ab = showAb ? islandsLayout(st) : null;

  /** předvyplní operaci (z obrázku) a otevře ji s fokusem na Provést */
  const prefill = (o: LlrbBookOp) => {
    if (o.x !== undefined)
      menu.dispatch({ type: "text", name: "x", text: String(o.x) });
    menu.dispatch({ type: "open", id: o.op });
    menu.focusRef.current = { to: "go" };
  };
  const setKeysField = (keys: readonly number[]) =>
    menu.dispatch({ type: "text", name: "A", text: keys.join(", ") });

  const runOp = (op: LlrbOp, x: number | null) => {
    if (opDisabledReason(s.last, op) !== null) return;
    const p = planOp(op, x, variant);
    s.run(p.title, p.pseudocode, p.run);
    const head = bookOps[0];
    const rest =
      head && head.op === op && (head.x === undefined || head.x === x)
        ? bookOps.slice(1)
        : [];
    setBookOps(rest);
    if (rest[0]) prefill(rest[0]);
  };

  /** Nový strom z klíčů (Vytvořit ▸ Vlastní / Náhodně / Seřazeně / Prázdný) – i to jde vrátit. */
  const rebuild = (keys: number[], message: string, title: string) => {
    setBookOps([]);
    const next = keys.length ? buildLlrb(keys, variant) : emptyLlrb(variant);
    s.reset(next, message, title);
    if (keys.length) setKeysField(keys);
    writeLink(next);
  };

  const changeVariant = (v: LlrbVariant) => {
    if (v === variant) return;
    setBookOps([]);
    const r = switchVariant(s.last, v);
    s.reset(r.state, r.message, `Varianta: ${variantLabel(v)}`);
    setKeysField(llrbFieldKeys(r.state));
    writeLink(r.state);
  };

  const menu = useActionMenu(
    llrbActions(
      {
        state: s.last,
        keys: opened.keys,
        x: opened.x,
        insertX: opened.insertX,
        seed: now,
      },
      {
        op: runOp,
        rebuild,
        variant: changeVariant,
        example: (e) => {
          const next = e.build();
          s.reset(next, llrbExampleMessage(e), llrbExampleTitle(e));
          setKeysField(llrbFieldKeys(next));
          writeLink(next);
          setBookOps([...e.ops]);
          if (e.showAb) toggleAb(true);
          if (e.ops[0]) prefill(e.ops[0]);
        },
      },
    ),
  );
  // Insert(x) s nabízeným novým klíčem je rozbalený hned – stačí Provést nebo Enter
  useOpenOnMount(menu, "insert");
  const { dispatch } = menu;
  // zvolená varianta v nabídce podle stromu – i po „Vrátit operaci“ a „Výchozí příklad“
  useEffect(() => {
    dispatch({ type: "variant", id: "variant", variant });
  }, [variant, dispatch]);
  // varianta v adrese podle stromu (↶ a Výchozí příklad ji vrací s ním); při otevření stránky se adresa
  // nepřepisuje – ani neznámé v= (UX-09)
  const shownVariant = useRef(variant);
  useEffect(() => {
    if (shownVariant.current === variant) return;
    shownVariant.current = variant;
    setV(variant === "24" ? "24" : null);
  }, [variant, setV]);

  const restore = () => {
    s.restoreInitial();
    setBookOps([]);
    setKeysField(opened.keys);
    menu.dispatch({ type: "text", name: "x", text: String(opened.x) });
    if (opened.fromUrl) writeLink(opened.state);
    else {
      setT(null);
      setK(null);
    }
  };

  const toggleAb = (on: boolean) => {
    setShowAb(on);
    setAb(on ? "1" : null);
  };

  // hluboký strom: menší vrcholy a hladiny stažené, dokud se vrcholy nepřekrývají
  const depth = treeDepth(lay.nodes);
  const radius = depth >= 5 ? 15 : 20;
  const minLevel =
    depth >= 5 ? minLevelHeight(lay.nodes, DEEP_TREE_W, radius) : undefined;
  const abName = variant === "24" ? "(2,4)-strom" : "(2,3)-strom";

  return (
    <Visualizer
      drawingKeys={
        <>
          Strom: <kbd>Tab</kbd> na něj, šipky po vrcholech, <kbd>Enter</kbd>{" "}
          vyplní x, <kbd>Esc</kbd> ven
        </>
      }
      title={moduleByPath(PATH)?.title ?? "Červeno-černý strom (LLRB)"}
      description={
        <>
          <p>
            {fmtMath(
              "LLRB strom (left-leaning red-black tree, Sedgewick 2008) je binární vyhledávací strom, který kóduje (2,4)-strom: klíče jednoho vrcholu (2,4)-stromu spojují červené hrany, mezi vrcholy vedou černé. Axiomy: žádné dvě červené hrany nad sebou, jediná červená hrana z vrcholu vede doleva, hrany do listů jsou černé a na každé cestě z kořene do listu je stejně černých hran. Barva hrany je uložená v jejím spodním vrcholu. Vyvažuje se rotací červené hrany a přebarvením 4-vrcholu. Varianta (2,3) (kniha s ní dál pracuje) volá při návratu z rekurze LlrbFixup; mazání udržuje invariant, že do aktuálního vrcholu nebo do syna, kam pokračujeme, vede červená hrana (MoveRedLeft / MoveRedRight).",
            )}
          </p>
          <p className="complexity">
            <b>Hloubka:</b> Θ(log n) (nejvýš dvojnásobek hloubky (2,4)-stromu) ·{" "}
            <b>Find, Insert, Delete:</b> O(log n)
          </p>
        </>
      }
      actions={<ActionMenu menu={menu} />}
      player={player}
      pseudocode={
        s.pseudocode.length
          ? s.pseudocode
          : idlePseudocode(menu.state.open, variant)
      }
      structure={synced}
      onRestoreInitial={restore}
      share
      options={
        <p className="hint">
          Zobrazení:{" "}
          <label title="Ostrůvky spojené červenými hranami jsou vrcholy (a,b)-stromu (obr. 8.11)">
            <input
              type="checkbox"
              checked={showAb}
              onChange={(e) => toggleAb(e.target.checked)}
            />{" "}
            {abName} vedle
          </label>
        </p>
      }
      notes={
        <>
          <p className="hint">
            Kopírovat odkaz: odkaz nese přesný tvar i barvy (t=klíče po
            hladinách, „r“ = červená hrana shora), variantu (v=24) a zobrazení
            (a,b)-stromu (ab=1). Ručně jde psát i k=40,20,70 – klíče se vloží
            postupně.
          </p>
          <p className="hint">
            {fmtMath(
              "LlrbDelete, řádky „ℓ(v) i ℓ(ℓ(v)) existují a jsou černé“ (a totéž vpravo): vnější vrchol ∅ počítáme jako černý, existovat musí syn, kterým pokračujeme – jako v LlrbDeleteMin. Jinak by Delete(1) ze stromu 4(2(1, 3), 6(5, 7)) smazal černý list a porušil axiom 4.",
            )}
          </p>
        </>
      }
      tip={fmtMath(LLRB_TIP)}
      legend={LEGEND}
    >
      {/* vzdálenost hladin podle výšky plátna (desktop na jednu obrazovku) – vrcholy zůstanou 1 : 1 */}
      <CanvasFit limits={levelFitLimits(LEVEL, depth, minLevel)}>
        {(fit) => (
          <div className={"llrb-layout llrb-tree" + (ab ? " with-ab" : "")}>
            <TreeView
              nodes={lay.nodes}
              edges={lay.edges}
              levelHeight={fitLevelHeight(LEVEL, fit, depth, minLevel)}
              radius={radius}
              minRadius={10}
              minScale={depth > 9 ? 0.91 : undefined}
              ariaLabel={`LLRB strom s ${lay.nodes.length} vrcholy, varianta ${variantLabel(variant)}`}
              // klik na vrchol: klíč do x otevřené (nebo naposledy použité) operace
              onPick={(n) => {
                const x = parseKey(n.label);
                if (x !== null) menu.pick(x);
              }}
            />
            {ab && (
              <div className="llrb-ab">
                <p className="llrb-ab-caption">
                  {abName}: ostrůvky spojené červenými hranami (obr. 8.11)
                </p>
                <MultiTreeView
                  nodes={ab.nodes}
                  edges={ab.edges}
                  fit
                  levelHeight={AB_LEVEL}
                  ariaLabel={`${abName} s ${ab.nodes.length} vrcholy – překlad LLRB stromu`}
                  onPickKey={(key) => {
                    const x = parseKey(key);
                    if (x !== null) menu.pick(x);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </CanvasFit>
      <VarsView vars={displayVars(st.vars)} />
    </Visualizer>
  );
}
