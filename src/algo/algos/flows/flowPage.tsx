/**
 * Společná stránka toků v sítích (FordFulkersonPage, DinicPage): síť se kreslí na plátně (GraphEditor –
 * „Upravit graf“, kapacita = cena hrany), příklady z knihy a další vstupy jsou v nabídce akcí
 * (flowPageModel.ts), operace „FordFulkerson(z, s)“ / „Dinic(z, s)“ připraví běh na kroku 1 (▶ ho přehraje).
 * Vedle sítě „tok / kapacita“ je síť rezerv (FordFulkerson, obr. 14.4) nebo vrstevnatá síť R (Dinic,
 * obr. 14.7); přepínač „Kresba“ nechá jen jednu. Logika bez Reactu je ve flowPageModel.ts a flowView.ts.
 *
 * V režimu „Upravit graf“ zůstane rozložení i druhá kresba jako v běhu (zrušené UX-02, chyba vlastníka
 * 8. 11. 2026): druhá kresba a proměnné živě ukazují krok 1 nového běhu upravené sítě, přehrávač na něm stojí
 * (flowEditPlayer.ts). „Jen rezervy“ se v editoru kreslí jako obě (na síti se kreslí), po Hotovo se vrátí.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionMenu } from "../../core/ActionMenu";
import { FIT_MEDIA, mediaMatches } from "../../core/layoutMedia";
import { readableSearch, useLinkSearchParams } from "../../core/linkParams";
import { materialize } from "../../core/steps";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { Visualizer } from "../../core/Visualizer";
import { moduleByPath } from "../../registry";
import { VarsView } from "../../views/ArrayView";
import { GraphEditor, GraphEditorPanel } from "../../views/GraphEditor";
import { GraphView } from "../../views/GraphView";
import { useGraphEdit } from "../../views/useGraphEdit";
import { useWidth } from "../../views/useWidth";
import type { Graph } from "../graphs/graph";
import {
  graphDrawingKey,
  graphStructureKey,
  withWeights,
} from "../graphs/graphPageModel";
import { useInputHistory } from "../graphs/inputHistory";
import { dinic, dinicPseudocode } from "./dinic";
import { useEditFocus } from "./flowEditFocus";
import { frozenPlayer } from "./flowEditPlayer";
import { netProblem, residualArcs } from "./flowNet";
import {
  bipartiteNet,
  defaultExample,
  defaultSettings,
  endsNote,
  exampleInput,
  exampleOf,
  flowActionDefs,
  flowFromParams,
  flowOpTitle,
  flowParams,
  initFlowFor,
  netOf,
  randomNet,
  randomSeed,
  type FlowHandlers,
  type FlowInput,
  type FlowKind,
  type FlowSettings,
} from "./flowPageModel";
import { flowPresetById } from "./flowPresets";
import { goldbergParams } from "./goldbergPageModel";
import {
  autoFlowView,
  FLOW_MARKERS,
  flowLegend,
  flowStacked,
  flowVars,
  isMatchingNet,
  layeredFitAspect,
  layeredView,
  MATCH_FIT_ASPECT,
  netCaption,
  phoneFitAspect,
  netState,
  readableBase,
  readableWidth,
  residualGraph,
  residualState,
} from "./flowView";
import { fordFulkerson, PC_FF, PC_FF_FORWARD } from "./fordFulkerson";

const PATH: Record<FlowKind, string> = {
  ff: "/flow/ford-fulkerson",
  dinic: "/flow/dinic",
};

/** po kolika ms od posledního přesunu vrcholu se souřadnice zapíšou do adresy (xy=) */
const URL_MOVE_DELAY_MS = 250;

type ViewMode = "obe" | "sit" | "rezervy";

/** okno, kde se na jednu obrazovku vejdou pod sebou obě široké kresby (obr. 14.7) */
const ROOMY_MEDIA = "(min-width: 1600px) and (min-height: 900px)";

/** stav vstupu, který vrací „↶ Vrátit operaci“ */
interface FlowSnap {
  graph: Graph;
  example: string | null;
  z: string | null;
  s: string | null;
  /** položka je přesun vrcholu – vrácení nespouští nový běh */
  moveOnly?: boolean;
}

const LOCK_DIRECTED = "Síť je vždy orientovaný graf.";
const LOCK_WEIGHTED = "Hrany sítě mají vždy kapacitu (cenu hrany).";

const TEXTS: Record<
  FlowKind,
  { description: string; complexity: string; tip: string; resTitle: string }
> = {
  ff: {
    description:
      "Síť má zdroj z, stok s a kapacity c(e). Tok f se zlepšuje po nenasycených cestách ze z do s: rezerva hrany uv je r(uv) = c(uv) − f(uv) + f(vu), takže cesta smí jít i proti směru hrany, po které už něco teče – tam tok ubereme (δ). ε = nejmenší rezerva na cestě. Když žádná nenasycená cesta nevede, vrcholy dosažitelné ze z tvoří řez E(A, B) se stejnou kapacitou jako tok – tok je maximální. V síti párování (14.3) tvoří hrany s tokem 1 největší párování.",
    complexity:
      "celočíselné kapacity: nejvýš |f*| zlepšení po O(m); s BFS O(nm) zlepšení (cv. 14.2.9); párování O(nm) · Ford a Fulkerson, 1954",
    tip: "Obr. 14.4: DFS najde nenasycenou cestu zbcads z obrázku (ε = 1), BFS cestu zbcs z textu na str. 354. Obr. 14.3 s variantou „jen po směru“ a DFS uvízne na toku 1 – s rezervami pošle tok proti směru hrany ab. Nakreslete vlastní síť v režimu Upravit graf.",
    resTitle: "Síť rezerv r",
  },
  dinic: {
    description:
      "Tok se zlepšuje po fázích. V každé fázi se sestrojí síť rezerv R (jen hrany s kladnou rezervou), vrcholy se rozdělí do vrstev podle vzdálenosti od z a síť se pročistí: zmizí vrstvy za s, hrany dozadu a uvnitř vrstev (šedivé) a frontou F slepé uličky (tečkované). V pročištěné síti se najde blokující tok g – cesty ze z vždy po první zbylé hraně, nasycené hrany se mažou – a f se zlepší o g. Délka ℓ nejkratší cesty po každé fázi vzroste.",
    complexity: "nejvýš n fází po O(nm), celkem O(n²m) · Dinic, 1970",
    tip: "Obr. 14.7: krokujte čištění – šedivé hrany zmizí v kroku „Odstraníme hrany do předchozích vrstev a hrany uvnitř vrstev“, tečkované se slepými uličkami. Ve fázi 2 a 3 se použijí hrany, které ve fázi 1 vedly uvnitř vrstvy (k→l) a dozadu (e→b) – ℓ roste 5, 6, 7 (lemma C). Obr. 14.2 skončí po dvou fázích s tokem 18.",
    resTitle: "Síť rezerv R po vrstvách",
  },
};

export function FlowModulePage({ kind }: { kind: FlowKind }) {
  const mod = moduleByPath(PATH[kind]);
  const [params, setParams] = useLinkSearchParams();
  const navigate = useNavigate();
  // vstup z odkazu (jen při otevření stránky), jinak výchozí příklad
  const [init] = useState(() => flowFromParams(kind, params));
  const edit = useGraphEdit(init.input.graph);
  const graph = edit.graph;
  const [ends, setEnds] = useState({ z: init.input.z, s: init.input.s });
  const [example, setExample] = useState(init.input.example);
  const [settings, setSettings] = useState<FlowSettings>(init.settings);
  // volba „Kresba“ zvlášť pro síť párování a pro ostatní sítě; null = výchozí (autoFlowView)
  const [chosenView, setChosenView] = useState<{
    plain: ViewMode | null;
    match: ViewMode | null;
  }>({ plain: null, match: null });
  const [mode, setMode] = useState<"edit" | "run">("run");
  // roste se spuštěním → nový běh (krok 1, ▶ ho přehraje); kreslení ani přesun ho nemění
  const [runId, setRunId] = useState(0);
  // roste se spuštěním i s „Prázdná – nakreslit“ → Visualizer posune plátno do záběru
  const [shownId, setShownId] = useState(0);
  const [notice, setNotice] = useState(init.problem);
  // rozložení (kresby pod sebou, síť párování) zamrzne po dobu úprav – při kreslení se kresby nepřeskládají
  // ani nezmizí; nové rozložení až s novým během (Hotovo), F-03
  const [editLayout, setEditLayout] = useState<{
    stacked: boolean;
    matching: boolean;
  } | null>(null);

  const structure = graphStructureKey(graph);
  // příklad z knihy drží, jen dokud síť (bez souřadnic) zůstává stejná
  const exampleNow = exampleOf(kind, graph, example);
  const input: FlowInput = { graph, z: ends.z, s: ends.s, example: exampleNow };
  const net = netOf(input);

  // Běh: síť se zachytí jen při změně struktury, zdroje/stoku, nastavení nebo novém spuštění – přesun
  // vrcholu kroky nepřepočítá. Nové pole kroků = přehrávač na kroku 1, pozastavený (usePlayer).
  const runKey = `${structure}|${net.z}|${net.s}|${settings.search}|${settings.variant}|${runId}`;
  const [run, setRun] = useState({ key: runKey, input });
  if (run.key !== runKey) setRun({ key: runKey, input });
  const runNet = useMemo(() => netOf(run.input), [run]);
  // rozložení: pod sebou podle poměru stran kresby (flowStacked); v editoru zmrazené (editLayout)
  const stacked = useMemo(() => flowStacked(runNet, kind), [runNet, kind]);
  const layoutNow = { stacked, matching: isMatchingNet(net) };
  const editing = mode === "edit";
  const layout = (editing && editLayout) || layoutNow;
  const matching = layout.matching;
  const steps = useMemo(() => {
    if (kind === "dinic") return materialize(dinic(runNet));
    const start = initFlowFor(run.input);
    return materialize(
      fordFulkerson(runNet, {
        search: settings.search,
        forwardOnly: settings.variant === "po-smeru",
        ...(start.init ? { init: start.init, initLabel: start.label } : {}),
      }),
    );
  }, [kind, run, runNet, settings]);
  const player = usePlayer(steps);
  // v editoru krok 1 živě přepočítaného běhu (runKey obsahuje strukturu), jinak krok přehrávače
  const st = editing ? steps[0]?.state : player.current?.state;
  const legend = useMemo(
    () => flowLegend(runNet, steps, kind),
    [runNet, steps, kind],
  );
  // oblouky podle kresby (stejná struktura jako běh; v průchodu, kde se běh teprve mění, pohledy krok
  // jiné sítě nepoužijí – flowView.stateFits)
  const arcs = useMemo(() => residualArcs(graph), [graph]);
  // čitelná šířka sítě a sítě rezerv (telefon) podle rozložení při načtení sítě: přesun vrcholu ji
  // nemění – jinak by se plátno po tahu přepočítalo (vrchol přisunutý k jinému = až 1200 px a celá
  // kresba miniaturní, chyba 8. 11. 2026); nová síť, příklad či jiná struktura ji spočítají znovu
  // (u příkladu z knihy podle jeho kresby – odkaz s xy= má stejnou šířku, V-7)
  const readableKey = `${structure}|${exampleNow ?? ""}`;
  const readableOf = () => {
    const base = readableBase(graph, exampleNow);
    return {
      key: readableKey,
      net: readableWidth(base),
      res:
        kind === "ff"
          ? readableWidth(residualGraph(base, residualArcs(base)))
          : null,
    };
  };
  const [readable, setReadable] = useState(readableOf);
  if (readable.key !== readableKey) setReadable(readableOf());

  // odkaz po každé změně sítě, zdroje/stoku a nastavení; při otevření stránky ne (ani ve StrictMode).
  // Přesun vrcholu (jen xy=) se zapíše až chvíli po dotažení.
  const q = flowParams(kind, input, settings);
  const { xy: qxy, ...qrest } = q;
  const urlKey = JSON.stringify(qrest);
  const posKey = qxy ?? "";
  const written = useRef({ urlKey, posKey });
  const qText = readableSearch(q);
  useEffect(() => {
    const w = written.current;
    if (w.urlKey === urlKey && w.posKey === posKey) return;
    const write = () => {
      written.current = { urlKey, posKey };
      setParams(new URLSearchParams(qText), { replace: true });
    };
    if (w.urlKey !== urlKey) {
      write();
      return;
    }
    const t = window.setTimeout(write, URL_MOVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [urlKey, posKey, qText, setParams]);

  const start = () => {
    setMode("run");
    setEditLayout(null);
    setNotice(null);
    setRunId((r) => r + 1);
    setShownId((r) => r + 1);
  };

  // ↶ Vrátit operaci: každá změna vstupu z nabídky, import textem i celé sezení v „Upravit graf“
  const snap = (): FlowSnap => ({
    graph,
    example: exampleNow,
    z: ends.z,
    s: ends.s,
  });
  const [editStart, setEditStart] = useState<FlowSnap | null>(null);
  const history = useInputHistory<FlowSnap>();
  const restore = (b: FlowSnap) => {
    edit.dispatch({ type: "load", graph: b.graph });
    setExample(b.example);
    setEnds({ z: b.z, s: b.s });
  };
  /** sezení v editoru už síť změnilo (↶ Vrátit operaci ho nejdřív zahodí, X-05 jako G-08 u grafů) */
  const sessionDirty =
    mode === "edit" &&
    editStart !== null &&
    graphDrawingKey(editStart.graph) !== graphDrawingKey(graph);
  const undo = () => {
    if (sessionDirty && editStart) {
      // první klik v editoru: síť jako před vstupem do editoru, historie beze změny; editor zůstane otevřený
      restore(editStart);
      return;
    }
    const b = history.pop();
    if (!b) return;
    setEditStart(null);
    restore(b);
    // přesun vrcholu nebyl nový běh – krok přehrávače zůstane
    if (!b.moveOnly) start();
  };
  const flushEdit = () => {
    const before = editStart;
    setEditStart(null);
    // i sezení, které jen přesouvalo (V-4)
    if (before && graphDrawingKey(before.graph) !== graphDrawingKey(graph))
      history.record("Úprava sítě", before);
  };
  /**
   * Přesun vrcholu v režimu algoritmu = položka „↶ Vrátit operaci“ (V-4): celý tah jedna, série Shift+šipek
   * na témž vrcholu jedna (MOVE_GROUP_MS).
   */
  const noteMove = (id: number, gesture?: number) =>
    history.recordGrouped(
      `Přesun vrcholu ${graph.nodes[id]?.label ?? "?"}`,
      { ...snap(), moveOnly: true },
      gesture !== undefined ? `g${gesture}` : `k${id}`,
      gesture !== undefined ? Infinity : undefined,
    );
  const changeMode = (m: "edit" | "run") => {
    if (m === "edit") {
      // úpravy nic nespouštějí – rozběhnuté přehrávání se zastaví
      player.pause();
      if (mode !== "edit") {
        setEditStart(snap());
        setEditLayout(layoutNow);
      }
    } else {
      flushEdit();
      setEditLayout(null);
    }
    setMode(m);
  };
  /** nový vstup z nabídky: jde vrátit, zdroj a stok výchozí, běh se připraví na krok 1 */
  const load = (g: Graph, ex: string | null, title: string) => {
    flushEdit();
    history.record(title, snap());
    edit.dispatch({ type: "load", graph: g });
    setExample(ex);
    setEnds({ z: null, s: null });
    start();
  };
  const handlers: FlowHandlers = {
    random: (n, m) =>
      load(randomNet(n, m, randomSeed()), null, `Náhodně (n = ${n}, m = ${m})`),
    empty: () => {
      flushEdit();
      history.record("Prázdná síť", snap());
      const g: Graph = {
        directed: true,
        weighted: true,
        nodes: [
          { id: 0, label: "z", x: 0.08, y: 0.5 },
          { id: 1, label: "s", x: 0.92, y: 0.5 },
        ],
        edges: [],
      };
      edit.dispatch({ type: "load", graph: g });
      setExample(null);
      setEnds({ z: null, s: null });
      player.pause();
      setEditStart({ graph: g, example: null, z: null, s: null });
      setNotice(null);
      setEditLayout({ stacked: false, matching: false });
      setMode("edit");
      setShownId((r) => r + 1);
    },
    bipartite: (text) => {
      const r = bipartiteNet(text);
      if (r.graph) load(r.graph, null, "Párování");
    },
    loadExample: (id) => {
      const p = flowPresetById(id);
      if (!p) return;
      // hledání cesty jako v knize (obr. 14.4 a 14.3: DFS)
      setSettings((s) => ({ ...s, search: defaultSettings(p).search }));
      load(exampleInput(p).graph, p.id, p.label);
    },
    run: (z, s) => {
      flushEdit();
      setEnds({ z, s });
      start();
    },
    setCapacities: (cs) => {
      flushEdit();
      history.record("Kapacity hran", snap());
      edit.dispatch({ type: "load", graph: withWeights(graph, cs) });
      start();
    },
    switchAlgo: (target) => {
      if (target === "goldberg") {
        navigate({
          pathname: "/flow/goldberg",
          search: readableSearch(goldbergParams(input, "zakladni")),
        });
        return;
      }
      navigate({
        pathname: PATH[target],
        search: readableSearch(flowParams(target, input, settings)),
      });
    },
  };
  /** Výchozí příklad modulu se svým nastavením (jako po otevření stránky bez parametrů) */
  const restoreDefault = () => {
    const d = defaultExample(kind);
    setSettings(defaultSettings(d));
    load(exampleInput(d).graph, d.id, "Výchozí příklad");
  };
  const menu = useActionMenu(flowActionDefs(kind, input, handlers));

  // pole akcí sledují síť: z a s podle aktuální sítě, kapacity podle dnešních hran
  const { dispatch: menuDispatch } = menu;
  const zLabel = graph.nodes[net.z]?.label ?? "";
  const sLabel = graph.nodes[net.s]?.label ?? "";
  const capsText = graph.edges.map((e) => e.w).join(" ");
  useEffect(() => {
    menuDispatch({ type: "text", name: "z", text: zLabel });
    menuDispatch({ type: "text", name: "s", text: sLabel });
  }, [zLabel, sLabel, structure, menuDispatch]);
  useEffect(() => {
    menuDispatch({ type: "text", name: "c", text: capsText });
  }, [capsText, menuDispatch]);

  const changeSettings = (next: Partial<FlowSettings>) => {
    flushEdit();
    setSettings((s) => ({ ...s, ...next }));
    start();
  };

  // výchozí kresba podle sítě a okna
  const fit = mediaMatches(FIT_MEDIA);
  const auto = autoFlowView({
    kind,
    matching,
    stacked: layout.stacked,
    cramped: fit && !mediaMatches(ROOMY_MEDIA),
  });
  const view: ViewMode =
    chosenView[matching ? "match" : "plain"] ??
    (auto === "druha" ? "rezervy" : auto);
  const setView = (v: ViewMode) =>
    setChosenView((c) => ({ ...c, [matching ? "match" : "plain"]: v }));
  // v editoru je síť vidět vždy (kreslí se na ní): „jen rezervy“ = obě, po Hotovo zase jen rezervy
  const shown: ViewMode = editing && view === "rezervy" ? "obe" : view;
  const problem = netProblem(net);
  // proměnné kroku dole v poslední viditelné kresbě (druhé, jinak v síti): síť vedle ní má na výšku o řádek
  // víc – síť párování v menším okně (1280 × 720) se tak víc roztáhne (F-05); v editoru krok 1 (F-03)
  const vars = <VarsView reserve vars={flowVars(net, st)} />;
  const note = endsNote(input);
  const ariaNet = `Síť ${netCaption(net)}`;
  const lay = kind === "dinic" && !problem ? layeredView(net, st, arcs) : null;
  const resGraph = kind === "ff" ? residualGraph(graph, arcs) : null;
  // telefon a menší okno (stránka se posouvá): široká knižní kresba (obr. 14.7, vrstvy) nesmí být užší, než
  // aby se vrcholy nepřekrývaly – pak se posouvá do strany (.view-wrap); na desktopu na jednu obrazovku ne
  const [layoutRef, layoutW] = useWidth();
  useEditFocus(layoutRef, editing);
  // na telefonu se široká kresba místo posunu do strany roztáhne na výšku (X-09)
  const squeeze = (need: number | null) =>
    !fit && need !== null && need > layoutW;
  const fitFor = (need: number | null, a: number | undefined) =>
    matching ? MATCH_FIT_ASPECT : squeeze(need) ? phoneFitAspect(a) : undefined;
  const showNet = shown !== "rezervy";
  const showRes = shown !== "sit";
  const preset = flowPresetById(exampleNow);
  const pseudocode =
    kind === "dinic"
      ? dinicPseudocode(st?.proc ?? "dinic")
      : settings.variant === "po-smeru"
        ? PC_FF_FORWARD
        : PC_FF;

  // editor: nápověda a hláška (odmítnutá úprava, rozdělaná hrana) – ne jako třetí sloupec vedle kreseb,
  // ale v bočním sloupci (desktop na jednu obrazovku) nebo pod kresbami (stránka se posouvá), F-03
  const editHelp = (
    <div className="flow-edit-help">
      <GraphEditorPanel
        edit={edit}
        lockDirected={LOCK_DIRECTED}
        lockWeighted={LOCK_WEIGHTED}
      />
      <p className="hint">
        {kind === "ff" ? "Síť rezerv" : "Vrstevnatá síť R"} vedle sítě ukazuje
        krok 1 nového běhu upravené sítě{" "}
        {kind === "ff"
          ? "(nulový tok, r = c; u obr. 14.4 tok 16 z obr. 14.2 vpravo, dokud síť nezměníte)"
          : "(nulový tok, vrstvy podle vzdálenosti ze z)"}
        . Hotovo připraví nový běh na kroku 1.
      </p>
    </div>
  );
  const radios = (
    name: string,
    legendText: string,
    value: string,
    options: readonly { id: string; label: string; title?: string }[],
    onChange: (id: string) => void,
    disabled = false,
  ) => (
    <fieldset className="flow-options hint" disabled={disabled}>
      <legend>{legendText}</legend>
      {options.map((o) => (
        <label key={o.id} title={o.title}>
          <input
            type="radio"
            name={`${name}-${kind}`}
            value={o.id}
            checked={value === o.id}
            onChange={() => onChange(o.id)}
          />{" "}
          {o.label}
        </label>
      ))}
    </fieldset>
  );
  const options = (
    <>
      {kind === "ff" &&
        radios(
          "flow-search",
          "Hledání cesty:",
          settings.search,
          [
            {
              id: "bfs",
              label: "BFS",
              title: "Do šířky – vždy nejkratší nenasycená cesta (cv. 14.2.9)",
            },
            {
              id: "dfs",
              label: "DFS",
              title: "Do hloubky – první nalezená cesta (sousedé podle názvu)",
            },
          ],
          (id) => changeSettings({ search: id === "dfs" ? "dfs" : "bfs" }),
        )}
      {kind === "ff" &&
        radios(
          "flow-variant",
          "Varianta:",
          settings.variant,
          [
            {
              id: "rezervy",
              label: "s rezervami (str. 355)",
              title: "FordFulkerson: cesta smí jít i proti směru hrany s tokem",
            },
            {
              id: "po-smeru",
              label: "jen po směru (str. 354)",
              title:
                "Chybné zlepšování jen po směru hran z úvodu 14.2 – nemusí najít maximální tok (obr. 14.3)",
            },
          ],
          (id) =>
            changeSettings({
              variant: id === "po-smeru" ? "po-smeru" : "rezervy",
            }),
        )}
      {radios(
        "flow-view",
        "Kresba:",
        view,
        [
          { id: "obe", label: "obě" },
          { id: "sit", label: "jen síť" },
          {
            id: "rezervy",
            label: "jen rezervy",
            title:
              kind === "ff" ? "Jen síť rezerv" : "Jen vrstevnatou síť rezerv R",
          },
        ],
        (id) =>
          setView(id === "sit" ? "sit" : id === "rezervy" ? "rezervy" : "obe"),
      )}
      {editing && fit && editHelp}
    </>
  );
  const notes = (
    <>
      {preset && <p className="hint graph-source">{preset.note}</p>}
      <p className="hint">
        Síť kreslíte v režimu Upravit graf: klik do prázdna = vrchol, tah z
        vrcholu na vrchol = hrana, klik na hranu nebo její číslo = kapacita
        (celé číslo 0–999), Delete maže. Akce Kapacity hran nastaví všechny
        kapacity naráz. Zdroj a stok vyberete v akci{" "}
        {kind === "ff" ? "FordFulkerson" : "Dinic"}(z, s) – výchozí jsou vrcholy
        z a s. Sousedé se procházejí v pořadí podle názvu. Vrcholy jdou
        přetahovat myší i prstem – chytit jde i kousek vedle kroužku, síť se
        během tahu nepřeměřuje ani nezmenšuje a vrchol puštěný za okrajem
        zůstane na okraji (z klávesnice: Tab na kresbu sítě, šipkami na vrchol,
        Shift+šipky ho posunou).
      </p>
    </>
  );

  return (
    <Visualizer
      title={mod?.title ?? PATH[kind]}
      description={
        <>
          <p>{TEXTS[kind].description}</p>
          <p className="complexity">
            <b>Čas:</b> {TEXTS[kind].complexity}
          </p>
        </>
      }
      opTitle={flowOpTitle(kind, runNet, settings)}
      inputHistory={
        sessionDirty
          ? { ...history.control(undo), canUndo: true }
          : history.control(undo)
      }
      onRestoreInitial={restoreDefault}
      tip={TEXTS[kind].tip}
      share
      runKey={shownId}
      actions={<ActionMenu menu={menu} label="Síť a algoritmus" />}
      player={editing ? frozenPlayer(player) : player}
      pseudocode={pseudocode}
      legend={legend}
      notes={notes}
      options={options}
    >
      {notice && (
        <p className="hint input-error" role="status">
          {notice}
        </p>
      )}
      <div
        ref={layoutRef}
        className={
          `flow-layout flow-view-${shown}` +
          (shown === "obe" && layout.stacked ? " flow-stack" : "") +
          (matching ? " flow-match" : "")
        }
      >
        <section
          className="flow-panel flow-panel-net"
          hidden={!showNet}
          aria-label="Síť: tok / kapacita"
        >
          <p className="flow-panel-title">
            <span aria-hidden="true">Síť: tok / kapacita</span>
            {note && !problem && !showRes && (
              <span className="flow-panel-note" title={note}>
                {note}
              </span>
            )}
          </p>
          <GraphEditor
            edit={edit}
            mode={mode}
            onModeChange={changeMode}
            onRunMove={noteMove}
            onRunUndo={undo}
            onTextLoad={(g) => {
              // import textem v režimu algoritmu = samostatná operace; v editoru patří k sezení úprav
              if (mode !== "edit") history.record("Import textem", snap());
              edit.dispatch({ type: "load", graph: g });
            }}
            state={netState(net, st)}
            // v editoru popisky jako krok 1 (0/c, u párování bez popisků) – stejně široké jako v běhu,
            // kresba při vstupu do editoru ani po Hotovo nezmění viewBox (F-03, F-10)
            editState={netState(net, undefined)}
            onRun={() => start()}
            lockDirected={LOCK_DIRECTED}
            lockWeighted={LOCK_WEIGHTED}
            panel="outside"
            ariaLabel={ariaNet}
            markers={FLOW_MARKERS}
            dense
            // síť párování vyplní panel (R2), široká síť na telefonu se roztáhne na výšku (X-09)
            fitAspect={fitFor(readable.net, graph.aspect)}
          />
          {!showRes && vars}
        </section>
        {showRes && (
          <section
            className="flow-panel flow-panel-res"
            aria-label={TEXTS[kind].resTitle}
          >
            <p className="flow-panel-title">
              <span aria-hidden="true">{TEXTS[kind].resTitle}</span>
              {note && !problem && (
                <span className="flow-panel-note" title={note}>
                  {note}
                </span>
              )}
              {!showNet && (
                // síť f/c je skrytá (Kresba = jen rezervy) – editor sítě musí zůstat po ruce (UX-02)
                <button
                  type="button"
                  className="flow-edit-net"
                  onClick={() => changeMode("edit")}
                  title="Upravit síť toku (vrcholy, hrany, kapacity) – po Hotovo nový běh na kroku 1"
                >
                  Upravit síť
                </button>
              )}
            </p>
            {problem ? (
              <p className="hint flow-panel-hint" role="status">
                {problem}
              </p>
            ) : kind === "ff" && resGraph ? (
              <GraphView
                graph={resGraph}
                state={residualState(net, st, arcs)}
                ariaLabel={`Síť rezerv: ${arcs.length} oblouků`}
                markers={FLOW_MARKERS}
                browse
                dense
                fitAspect={fitFor(readable.res, resGraph.aspect)}
                // v editoru drží měřítko jako síť – přesun vrcholu ji nepřeměří (X-08)
                holdLayout={editing}
              />
            ) : lay ? (
              <GraphView
                graph={lay.graph}
                state={lay.state}
                groups={lay.groups}
                ariaLabel={`Síť rezerv R: ${lay.graph.edges.length} hran`}
                markers={FLOW_MARKERS}
                browse
                dense
                fitAspect={
                  matching && lay.graph.aspect !== undefined
                    ? layeredFitAspect(lay.graph.aspect)
                    : squeeze(readableWidth(lay.graph))
                      ? phoneFitAspect(lay.graph.aspect)
                      : undefined
                }
              />
            ) : null}
            {vars}
          </section>
        )}
      </div>
      {editing && !fit && editHelp}
    </Visualizer>
  );
}
