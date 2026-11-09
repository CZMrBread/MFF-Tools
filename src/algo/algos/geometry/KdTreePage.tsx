import { useMemo, useState } from "react";
import { moduleByPath } from "../../registry";
import { ActionMenu } from "../../core/ActionMenu";
import {
  argText,
  numArg,
  strArg,
  validateArg,
  type ActionDef,
  type IntArgDef,
} from "../../core/actionModel";
import { fmtMath } from "../../core/format";
import { materialize, type Step } from "../../core/steps";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { useUrlParam } from "../../core/useUrlParam";
import { Visualizer, type LegendItem } from "../../core/Visualizer";
import { VarsView } from "../../views/ArrayView";
import { TreeView } from "../../views/TreeView";
import {
  editStep,
  kdGesture,
  kdNudge,
  kdRemove,
  movePreview,
  parsePointsParam,
  parsePointsText,
  pointsFromNumbers,
  pointsParam,
  pointsText,
  type KdGestureResult,
} from "./kdPageModel";
import {
  initInputs,
  pushInput,
  titlesOf,
  undoInput,
} from "../sorting/inputHistory";
import {
  build,
  DEFAULT_N,
  DEFAULT_QUERY,
  DEFAULT_SEED,
  finalXs,
  fmtBox,
  kdDepth,
  layoutKd,
  MAX_N,
  normalizeQuery,
  parseIntParam,
  parseQueryParam,
  PC_BUILD,
  PC_QUERY,
  PLANE,
  query,
  queryParam,
  randomPoints,
  sameBox,
  type Box,
  type KdState,
  type Pt,
} from "./kdtree";
import { KD_FRAME, KD_MAP, KD_PT_R } from "./kdPlaneMap";
import { Plane } from "./KdTreeViews";
import { DEL_R, removeButtonAt } from "./planeDrag";
import { usePlaneDrag } from "./usePlaneDrag";

const LEVEL_HEIGHT = 56;
/** největší semínko v adrese (Vytvořit ▸ Náhodně bere Date.now() mod 100 000) */
const MAX_SEED = 99999;
/** nové semínko pro Vytvořit ▸ Náhodně (volá se jen z obsluhy akce) */
const freshSeed = () => Date.now() % (MAX_SEED + 1);

/** build = přehrává se stavba, query = dotaz, edit = klidový krok po úpravě bodů (hotový strom) */
type Phase = "build" | "query" | "edit";
/** Co se právě ukazuje: fáze, použitý dotaz Q, pořadí spuštění (posun plátna do záběru) a u úpravy věta o změně. */
interface Run {
  phase: Phase;
  q: Box;
  id: number;
  change?: string;
}

const LEGEND_BUILD: LegendItem[] = [
  {
    cls: "sw-active",
    label: "aktuální vrchol (medián), jeho dělicí přímka a oblast",
  },
  { cls: "sw-compare", label: "body aktuálního podproblému P" },
  {
    cls: "sw-seen",
    label: "dělicí přímka už postaveného vrcholu",
    shape: "line",
  },
];
/** po úpravě bodů (hotový strom) je vidět i náhled dotazu Q */
const LEGEND_EDIT: LegendItem[] = [
  ...LEGEND_BUILD,
  {
    cls: "sw-compare",
    label: "dotaz Q (náhled, zatím nespuštěný)",
    shape: "dashed",
  },
];
const LEGEND_QUERY: LegendItem[] = [
  { cls: "sw-active", label: "aktuální vrchol a jeho oblast" },
  { cls: "sw-new", label: "ohlášený bod (leží v Q)" },
  {
    cls: "sw-visited",
    label: "navštívený vrchol, jehož bod v Q neleží",
    shape: "dashed",
  },
  { cls: "sw-pt-visited", label: "bod navštíveného vrcholu mimo Q (v rovině)" },
  {
    cls: "sw-removed-dashed",
    label: "odříznutý podstrom – oblast Q neprotíná, nenavštíví se",
  },
  { cls: "sw-compare", label: "dotaz Q", shape: "dashed" },
];

/** pořadí polí na stránce: x od, x do, y od, y do → indexy v Box [x1, y1, x2, y2] */
const Q_FIELDS = [
  { i: 0, name: "qx1", label: "x od =" },
  { i: 2, name: "qx2", label: "x do =" },
  { i: 1, name: "qy1", label: "y od =" },
  { i: 3, name: "qy2", label: "y do =" },
] as const;

/** argumenty RangeQuery(Q) s výchozími mezemi z dotazu q */
const qArgs = (q: Box): IntArgDef[] =>
  Q_FIELDS.map(({ i, name, label }) => ({
    kind: "int",
    name,
    label,
    min: PLANE[0],
    max: PLANE[2],
    default: q[i],
    width: "3.6rem",
  }));

/** vstup stránky do historie: body a dotaz Q */
interface KdInput {
  points: Pt[];
  q: Box;
}
const sameInput = (a: KdInput, b: KdInput) =>
  sameBox(a.q, b.q) &&
  a.points.length === b.points.length &&
  a.points.every((p, i) => p.x === b.points[i].x && p.y === b.points[i].y);

export function KdTreePage() {
  const [nParam, setNParam] = useUrlParam("n");
  const [seedParam, setSeedParam] = useUrlParam("seed");
  const [qParam, setQParam] = useUrlParam("q");
  const [ptsParam, setPtsParam] = useUrlParam("pts");
  const [n, setN] = useState(
    () => parseIntParam(nParam, 1, MAX_N) ?? DEFAULT_N,
  );
  // vlastní body z adresy (pts) mají přednost před náhodnými (n, seed)
  const [points, setPoints] = useState<Pt[]>(
    () =>
      parsePointsParam(ptsParam) ??
      randomPoints(n, parseIntParam(seedParam, 0, MAX_SEED) ?? DEFAULT_SEED),
  );
  // odkaz s dotazem (q=) otevře postavený strom s připraveným RangeQuery(Q) na kroku 1
  const [run, setRun] = useState<Run>(() => {
    const q = parseQueryParam(qParam);
    return { phase: q ? "query" : "build", q: q ?? DEFAULT_QUERY, id: 0 };
  });
  // historie vstupů (body a dotaz Q) pro řádek Historie a ↶ Vrátit operaci
  const [inputs, setInputs] = useState(() =>
    initInputs<KdInput>({ points, q: run.q }),
  );
  const record = (next: KdInput, title: string) =>
    setInputs((h) => pushInput(h, next, title, sameInput));
  /** upozornění k poslednímu vstupu (posunuté body, plná rovina) */
  const [warn, setWarn] = useState<string | null>(null);

  // Build závisí jen na bodech – úprava mezí dotazu přehrávání Buildu neresetuje
  const buildSteps = useMemo(() => materialize(build(points)), [points]);
  const built = buildSteps[buildSteps.length - 1].state;
  // vodorovné polohy z hotového stromu → vrcholy během stavby neposkakují
  const xs = useMemo(() => finalXs(built), [built]);
  // každé spuštění (nový objekt run) dá novou sadu kroků → přehrávač začne od začátku
  const steps = useMemo<Step<KdState>[]>(
    () =>
      run.phase === "build"
        ? buildSteps.slice()
        : run.phase === "edit"
          ? [editStep(points, run.change ?? "")]
          : materialize(query(structuredClone(built), run.q)),
    [run, buildSteps, built, points],
  );
  const player = usePlayer(steps);
  const st = player.current?.state;
  const lay = st ? layoutKd(st, xs) : { nodes: [], edges: [] };

  const applied = normalizeQuery(run.q) ?? PLANE;

  /**
   * spustí fázi: nový objekt run = nová sada kroků, přehrávač stojí na kroku 1 a čeká na ▶;
   * `newRun` = nové id (plátno se posune do záběru)
   */
  const start = (phase: Phase, q: Box, newRun = true, change?: string) =>
    setRun((r) => ({ phase, q, id: newRun ? r.id + 1 : r.id, change }));
  /** nové body; vlastní (klepnutí, Vlastní, prázdná rovina) jdou do adresy jako pts místo n a seed */
  const applyPoints = (ps: Pt[], own: boolean, title: string) => {
    record({ points: ps, q: run.q }, title);
    setPoints(ps);
    setWarn(null);
    if (own) {
      setPtsParam(pointsParam(ps));
      setNParam(null);
      setSeedParam(null);
    } else setPtsParam(null);
  };
  const runQuery = (q: Box) => {
    record({ points, q }, `RangeQuery(${fmtBox(normalizeQuery(q) ?? q)})`);
    setWarn(null);
    setQParam(queryParam(q));
    start("query", q);
  };

  const defs: ActionDef[] = [
    {
      id: "create",
      label: "Vytvořit",
      title: "Body v rovině: vlastní souřadnice, náhodně nebo prázdná rovina",
      variants: [
        {
          id: "custom",
          label: "Vlastní",
          title:
            "Body jako dvojice x, y (0–100), např. (10, 20), (35, 70) nebo 10 20; 35 70",
          args: [
            {
              kind: "text",
              name: "P",
              label: "body =",
              default: pointsText(points),
              width: "min(100%, 24rem)",
              check: (v) => parsePointsText(String(v)).error,
            },
          ],
        },
        {
          id: "random",
          label: "Náhodně",
          title:
            "n náhodných bodů s různými x i y, pak se připraví stavba stromu",
          args: [
            {
              kind: "int",
              name: "n",
              label: "n =",
              min: 1,
              max: MAX_N,
              default: n,
              width: "3.5rem",
            },
          ],
        },
        {
          id: "empty",
          label: "Prázdná rovina",
          title: "Smaže všechny body – pak je přidávejte klepnutím do roviny",
        },
      ],
      run: (v, variant) => {
        if (variant === "random") {
          const k = numArg(v, "n");
          const seed = freshSeed();
          setN(k);
          applyPoints(
            randomPoints(k, seed),
            false,
            `Vytvořit: náhodně, n = ${k}`,
          );
          setNParam(String(k));
          setSeedParam(String(seed));
          start("build", run.q);
        } else if (variant === "empty") {
          applyPoints([], true, "Vytvořit: prázdná rovina");
          start("edit", run.q, false, "Prázdná rovina.");
        } else {
          const r = pointsFromNumbers(parsePointsText(strArg(v, "P")).values);
          applyPoints(r.points, true, `Vytvořit(${r.points.length} bodů)`);
          setWarn(r.note);
          menu.dispatch({
            type: "text",
            name: "P",
            text: pointsText(r.points),
          });
          start("build", run.q);
        }
      },
    },
    {
      id: "build",
      label: "Build(P)",
      title: "Postaví strom z bodů v rovině (stavbu přehraje ▶)",
      run: () => start("build", run.q),
    },
    {
      id: "query",
      label: "RangeQuery(Q)",
      title:
        "Intervalový dotaz s obdélníkem Q = [x od, x do] × [y od, y do], meze 0–100; obdélník jde i natáhnout tažením v rovině",
      args: qArgs(run.q),
      run: (v) => {
        const q: Box = [0, 0, 0, 0];
        for (const f of Q_FIELDS) q[f.i] = numArg(v, f.name);
        runQuery(q);
      },
    },
  ];
  const menu = useActionMenu(defs);
  /** meze Q do polí RangeQuery (po tahu v rovině a u výchozího příkladu) */
  const setQTexts = (q: Box) => {
    for (const f of Q_FIELDS)
      menu.dispatch({ type: "text", name: f.name, text: String(q[f.i]) });
  };
  function restoreDefault() {
    const ps = randomPoints(DEFAULT_N, DEFAULT_SEED);
    setN(DEFAULT_N);
    record({ points: ps, q: DEFAULT_QUERY }, "Výchozí příklad");
    setPoints(ps);
    setWarn(null);
    setPtsParam(null);
    setNParam(null);
    setSeedParam(null);
    setQParam(null);
    menu.dispatch({ type: "text", name: "n", text: String(DEFAULT_N) });
    menu.dispatch({ type: "text", name: "P", text: pointsText(ps) });
    setQTexts(DEFAULT_QUERY);
    start("build", DEFAULT_QUERY, false);
  }
  /** ↶ Vrátit operaci: předchozí body i dotaz Q (hotový strom v klidu), adresa je převezme */
  const undo = () => {
    const last = inputs.past[inputs.past.length - 1];
    if (!last) return;
    const prev = last.before;
    setInputs(undoInput);
    setPoints(prev.points);
    setWarn(null);
    setPtsParam(pointsParam(prev.points));
    setNParam(null);
    setSeedParam(null);
    setQParam(sameBox(prev.q, DEFAULT_QUERY) ? null : queryParam(prev.q));
    menu.dispatch({ type: "text", name: "P", text: pointsText(prev.points) });
    setQTexts(prev.q);
    start("edit", prev.q, true, `Vráceno: ${last.title}.`);
  };

  // rozepsaný dotaz = platné meze v polích RangeQuery (dokud nejsou platné, platí poslední spuštěný)
  const draft = useMemo<Box>(() => {
    const q: Box = [...run.q];
    for (const [k, a] of qArgs(run.q).entries()) {
      const c = validateArg(a, argText(menu.state, a));
      if (typeof c.value !== "number") return run.q;
      q[Q_FIELDS[k].i] = c.value;
    }
    return q;
  }, [menu.state, run.q]);
  const dirty = run.phase === "query" && !sameBox(draft, run.q);
  const inverted = draft[0] > draft[2] || draft[1] > draft[3];

  /** úprava bodů z roviny (klepnutí, tah, ×, klávesnice): hotový strom v klidu, bez přehrávání */
  const editPoints = (r: KdGestureResult) => {
    if (r.kind === "points") {
      applyPoints(r.points, true, r.change.replace(/\.$/, ""));
      menu.dispatch({ type: "text", name: "P", text: pointsText(r.points) });
      start("edit", run.q, false, r.change);
    } else if (r.kind === "error") setWarn(r.message);
  };
  // vybraný bod (klik / Enter): × u něj ho smaže
  const [picked, setPicked] = useState<number | null>(null);
  const selected = points.some((p) => p.id === picked) ? picked : null;
  const selPt = points.find((p) => p.id === selected);
  const remove = (id: number) => {
    setPicked(null);
    editPoints(kdRemove(points, id));
  };
  // obdélník Q s úchopy: rozepsaný / použitý dotaz (během stavby se Q nekreslí, úchopy také ne)
  const handles = run.phase === "build" ? null : normalizeQuery(draft);
  const plane = usePlaneDrag({
    map: KD_MAP,
    plane: PLANE,
    points,
    pointR: KD_PT_R,
    remove: selPt
      ? {
          id: selPt.id,
          at: removeButtonAt(KD_MAP.toPx(selPt.x, selPt.y), KD_FRAME),
          r: DEL_R,
        }
      : null,
    rect: handles,
    emptyDrag: true,
    onTap: (at) => {
      setPicked(null);
      editPoints(kdGesture(points, { kind: "add", at }));
    },
    onSelect: setPicked,
    onRemove: remove,
    onMove: (id, to) => {
      setPicked(id);
      editPoints(kdGesture(points, { kind: "move", id, to }));
    },
    onRect: (q) => {
      setQTexts(q);
      runQuery(q);
    },
  });
  // během tahu bodu rovina ukazuje strom s bodem na místě, kam ho puštění dá (přehrávač se nemění)
  const live = plane.live;
  const shown =
    st && live?.kind === "point" ? movePreview(points, live.id, live.at) : st;

  return (
    <Visualizer
      runKey={run.id}
      drawingKeys={
        <>
          Rovina: <kbd>Tab</kbd> na ni, šipky po bodech, <kbd>Enter</kbd> bod
          vybere (jako klik), <kbd>Delete</kbd> ho smaže, <kbd>Shift</kbd>
          +šipky posun bodu, <kbd>Esc</kbd> ven
        </>
      }
      title={moduleByPath("/geom/kdtree")?.title ?? "k-d strom"}
      description={
        <>
          <p>
            2-d strom – binární vyhledávací strom nad body v rovině: v sudé
            hloubce dělíme množinu svislou přímkou v mediánu x-ové souřadnice, v
            liché vodorovnou přímkou v mediánu y. Každý vrchol tak odpovídá
            obdélníkové oblasti. Dotaz na obdélník Q prochází jen vrcholy,
            jejichž oblast Q protíná; oblasti celé uvnitř Q ohlásí najednou. V
            nejhorším případě navštíví O(√n) vrcholů. Předpokládáme, že žádné
            dva body nemají stejnou souřadnici x ani y (náhodně generované body
            to splňují, bod přidaný klepnutím se případně posune o jednotku).
          </p>
          <p className="complexity">
            <b>Build:</b> O(n log n) s lineárním hledáním mediánu ·{" "}
            <b>paměť:</b> O(n) · <b>dotaz:</b> O(√n + k) pro k ohlášených bodů
            (obecně {fmtMath("O(n^{1−1/d} + k)")})
          </p>
        </>
      }
      actions={<ActionMenu menu={menu} />}
      inputHistory={{
        history: titlesOf(inputs),
        canUndo: inputs.past.length > 0,
        undo,
      }}
      onRestoreInitial={restoreDefault}
      player={player}
      pseudocode={run.phase === "query" ? PC_QUERY : PC_BUILD}
      opTitle={
        run.phase === "build"
          ? `Build(P), n = ${points.length}`
          : run.phase === "edit"
            ? "Úprava bodů"
            : `RangeQuery(${fmtBox(applied)})`
      }
      share
      tip={
        <>
          natáhněte v rovině obdélník Q (tah z prázdného místa) nebo ho upravte
          za čtverečky v rozích, za hrany či za vnitřek – dotaz se připraví od
          kroku 1 (▶ ho přehraje): podstrom, jehož oblast leží celá v Q, se
          ohlásí najednou (řádek 3) a podstrom mimo Q se odřízne (řádek 7). Pak
          natáhněte úzký svislý pruh a porovnejte, kolik vrcholů dotaz navštíví.
          Klepnutím do prázdna přidáte bod; bod chytíte i kousek vedle kroužku a
          tažením přesunete (dělení se překresluje s ním). Klepnutím bod
          vyberete – smaže ho × vedle něj nebo Delete; omyl vrátí ↶ Vrátit
          operaci.
        </>
      }
      legend={
        run.phase === "query"
          ? LEGEND_QUERY
          : run.phase === "edit"
            ? LEGEND_EDIT
            : LEGEND_BUILD
      }
    >
      {(warn || dirty || inverted) && (
        <div className="kd-hints">
          {warn && <p className="hint input-warn">{warn}</p>}
          {dirty && (
            <p className="hint input-warn">
              Meze v polích se liší od zobrazeného dotazu – projeví se po Enter
              nebo „Provést“ u RangeQuery(Q).
            </p>
          )}
          {inverted && (
            <p className="hint input-warn">
              Dolní mez je větší než horní – při dotazu se meze prohodí.
            </p>
          )}
        </div>
      )}
      {st && shown && (
        <div className="kd-layout">
          <Plane
            st={shown}
            // během stavby náhled Q nekreslíme (rozptyloval by), po úpravě bodů a u změněných mezí ano
            preview={
              run.phase === "edit" || (run.phase === "query" && dirty)
                ? normalizeQuery(draft)
                : null
            }
            svgProps={plane.handlers}
            attachSvg={plane.attachSvg}
            live={live}
            dragged={live?.kind === "point" ? live.id : null}
            handles={handles}
            selected={selected}
            onSelect={setPicked}
            onRemove={remove}
            onNudge={(id, dx, dy) => editPoints(kdNudge(points, id, dx, dy))}
          />
          <div className="kd-tree-col">
            <TreeView
              nodes={lay.nodes}
              edges={lay.edges}
              levelHeight={LEVEL_HEIGHT}
              radius={19}
              // úzký sloupec vedle roviny: raději užší vrcholy a mezery než zmenšené písmo celé kresby
              minRadius={19}
              minHeight={(kdDepth(built) + 1) * LEVEL_HEIGHT + 20}
              ariaLabel={`k-d strom: ${lay.nodes.length} z ${points.length} vrcholů`}
              emptyLabel={
                run.phase === "build" && points.length
                  ? "Strom se staví (▶)"
                  : undefined
              }
            />
            <VarsView vars={st.vars} />
          </div>
        </div>
      )}
    </Visualizer>
  );
}
