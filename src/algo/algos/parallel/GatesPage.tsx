/**
 * Hradlové sítě (#/parallel/gates, Průvodce 15.1, s. 381–385).
 *
 * Síť se kreslí přímo na plátně (CircuitEditor – „Upravit síť“: paleta hradel, vodiče tahem z portu
 * na port), příklady z knihy a další sítě jsou v nabídce operací pod plátnem (gatesActions.ts). Výpočet
 * po taktech připraví „Spočítat(vstupy)“, „Další vstup“, klik na vstup (přepne bit) nebo řádek
 * pravdivostní tabulky – vždy nová sada kroků od kroku 1, pozastavená (▶ ji přehraje). Kreslení ani
 * přesun nic nespouštějí. Logika bez Reactu je v circuit.ts, gatesPageModel.ts a gatesActions.ts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLinkSearchParams } from "../../core/linkParams";
import { ActionMenu } from "../../core/ActionMenu";
import { materialize } from "../../core/steps";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { Visualizer } from "../../core/Visualizer";
import { moduleByPath } from "../../registry";
import { VarsView } from "../../views/ArrayView";
import { importCircuitText, useCircuitEdit } from "../../views/circuitEdit";
import { CircuitEditor } from "../../views/CircuitEditor";
import { TruthTableView } from "../../views/CircuitView";
import {
  CIRCUIT_PSEUDOCODE,
  circuitSteps,
  inputsOf,
  structureKey,
  TABLE_MAX_INPUTS,
  truthTable,
  validateCircuit,
  type Bit,
  type Circuit,
} from "./circuit";
import {
  orChain,
  orTree,
  presetById,
  randomCircuit,
  randomSeed,
} from "./circuitPresets";
import { encodePositions } from "./circuitPositions";
import { gatesActionDefs, type GatesHandlers } from "./gatesActions";
import { useInputHistory } from "../graphs/inputHistory";
import {
  bitsFromArray,
  bitsText,
  buildNet,
  captionFor,
  defaultBits,
  gatesFromParams,
  gatesOpTitle,
  gatesParams,
  GATES_LEGEND,
  nextBits,
  normalizeBits,
  toggleBit,
  type NetRef,
} from "./gatesPageModel";

const PATH = "/parallel/gates";
/** výchozí příklad stránky: obr. 15.1 Majorita */
const DEFAULT_PRESET = "maj";

/** stav vstupu, který vrací „↶ Vrátit operaci“ */
interface GatesSnap {
  circuit: Circuit;
  net: NetRef | undefined;
  layoutFrom: string | undefined;
  bits: Record<string, Bit>;
}
/** pravdivostní tabulka jen do tolika vstupů (2⁶ = 64 řádků) */
const EMPTY: Circuit = { nodes: [], flow: "right" };

export function GatesPage() {
  const mod = moduleByPath(PATH);
  const [params, setParams] = useLinkSearchParams();
  // vstup z odkazu (jen při otevření stránky), jinak obr. 15.1
  const [init] = useState(() => gatesFromParams(params));
  const edit = useCircuitEdit(init.circuit);
  const circuit = edit.circuit;
  /** síť z knihy / parametrická, ze které síť vznikla (odkaz net=…, popisek zdroje) */
  const [net, setNet] = useState<NetRef | undefined>(init.net);
  /** knižní předloha, jejíž kresbu síť drží (p=… v odkazu) */
  const [layoutFrom, setLayoutFrom] = useState(init.layoutFrom);
  const [rawBits, setBits] = useState<Record<string, Bit>>(init.bits);
  const [mode, setMode] = useState<"edit" | "run">("run");
  // roste s každým spuštěním výpočtu (i se stejnými vstupy) → nová sada kroků (krok 1, pozastaveno)
  const [runId, setRunId] = useState(0);
  // roste se spuštěním z nabídky → Visualizer posune plátno do záběru
  const [shownId, setShownId] = useState(0);
  const [notice, setNotice] = useState<string | null>(init.problem);
  const [showTable, setShowTable] = useState(true);
  const [showLayers, setShowLayers] = useState(true);

  const structure = structureKey(circuit);
  const bits = useMemo(
    () => normalizeBits(circuit, rawBits),
    [circuit, rawBits],
  );
  const bitsKey = bitsText(circuit, bits);
  const issues = useMemo(() => validateCircuit(circuit), [circuit]);
  const broken = issues.errors.length > 0;

  // Výpočet: síť se zachytí jen při změně struktury (bez poloh), vstupů nebo novém spuštění – přesun
  // vrcholu kroky nepřepočítá. Nové pole kroků = přehrávač na kroku 1, pozastavený (usePlayer).
  const runKey = `${structure}|${bitsKey}|${runId}`;
  const [run, setRun] = useState({ key: runKey, circuit, bits });
  if (run.key !== runKey) setRun({ key: runKey, circuit, bits });
  const steps = useMemo(
    () =>
      validateCircuit(run.circuit).errors.length
        ? []
        : materialize(circuitSteps(run.circuit, run.bits)),
    [run],
  );
  const player = usePlayer(steps);
  const st = player.current?.state;

  // vstup do adresy po každé změně sítě, poloh vrcholů (xy=) nebo vstupů – při otevření stránky ne
  // (odkaz platí; ani ve StrictMode)
  const positions = encodePositions(circuit);
  const urlKey = `${structure}|${positions}|${bitsKey}|${net?.id}:${net?.n}|${layoutFrom}`;
  const writtenKey = useRef(urlKey);
  useEffect(() => {
    if (writtenKey.current === urlKey) return;
    writtenKey.current = urlKey;
    setParams(gatesParams(circuit, net, layoutFrom, bits), { replace: true });
  }, [urlKey, circuit, net, layoutFrom, bits, setParams]);

  const start = (scroll = true) => {
    setMode("run");
    setNotice(null);
    setRunId((r) => r + 1);
    if (scroll) setShownId((r) => r + 1);
  };
  // ↶ Vrátit operaci: Vytvořit, Příklady z knihy, Výchozí příklad i celé sezení v „Upravit síť“
  const snap = (): GatesSnap => ({ circuit, net, layoutFrom, bits: rawBits });
  const [editStart, setEditStart] = useState<GatesSnap | null>(null);
  const history = useInputHistory<GatesSnap>();
  const undo = () => {
    const b = history.pop();
    if (!b) return;
    setEditStart(null);
    edit.dispatch({ type: "load", circuit: b.circuit });
    setNet(b.net);
    setLayoutFrom(b.layoutFrom);
    setBits(b.bits);
    start();
  };
  const flushEdit = () => {
    const before = editStart;
    setEditStart(null);
    if (before && structureKey(before.circuit) !== structure)
      history.record("Úprava sítě", before);
  };
  const changeMode = (m: "edit" | "run") => {
    if (m === "edit") {
      player.pause();
      if (mode !== "edit") setEditStart(snap());
    } else flushEdit();
    setMode(m);
  };
  const load = (
    c: Circuit,
    ref: NetRef | undefined,
    from: string | undefined,
    b: Record<string, Bit> | undefined,
    title: string,
  ) => {
    flushEdit();
    history.record(title, snap());
    edit.dispatch({ type: "load", circuit: c });
    setNet(ref);
    setLayoutFrom(from);
    setBits(b ?? defaultBits(c, ref));
    start();
  };
  const handlers: GatesHandlers = {
    simulate: (arr) => {
      setBits(bitsFromArray(circuit, arr));
      start();
    },
    next: () => {
      setBits(nextBits(circuit, bits));
      start();
    },
    loadPreset: (id) => {
      const p = presetById(id);
      if (p) load(p.build(), { id }, id, undefined, p.label);
    },
    build: (kind, n, m) => {
      if (kind === "random")
        load(
          randomCircuit(n, m ?? 5, randomSeed()),
          undefined,
          undefined,
          undefined,
          `Náhodně (n = ${n}, m = ${m ?? 5})`,
        );
      else if (kind === "or-chain")
        load(
          orChain(n),
          { id: "or-chain", n },
          undefined,
          undefined,
          `Or řetězcem(${n})`,
        );
      else
        load(
          orTree(n),
          { id: "or-tree", n },
          undefined,
          undefined,
          `Or stromem(${n})`,
        );
    },
    custom: (text) => {
      const r = importCircuitText(circuit, text);
      if (r.errors.length) {
        setNotice(`Síť nešla použít: ${r.errors[0].message}`);
        return;
      }
      const shared = r.circuit.nodes.some((n) =>
        circuit.nodes.some((m) => m.id === n.id),
      );
      load(
        r.circuit,
        undefined,
        shared ? layoutFrom : undefined,
        normalizeBits(r.circuit, bits),
        "Vlastní síť",
      );
    },
    empty: () => {
      flushEdit();
      history.record("Prázdná síť", snap());
      player.pause();
      setEditStart({
        circuit: EMPTY,
        net: undefined,
        layoutFrom: undefined,
        bits: {},
      });
      edit.dispatch({ type: "load", circuit: EMPTY });
      setNet(undefined);
      setLayoutFrom(undefined);
      setBits({});
      setNotice(null);
      setMode("edit");
      setShownId((r) => r + 1);
    },
  };
  /** Výchozí příklad = obr. 15.1 (majorita), se kterým se stránka otevírá */
  const restoreDefault = () => {
    const p = presetById(DEFAULT_PRESET);
    if (p) load(p.build(), { id: p.id }, p.id, undefined, "Výchozí příklad");
  };
  const menu = useActionMenu(gatesActionDefs(circuit, bits, issues, handlers));

  // pole „vstupy =“ sleduje aktuální bity (klik na vstup, řádek tabulky, Další vstup)
  const { dispatch: menuDispatch } = menu;
  useEffect(() => {
    menuDispatch({ type: "text", name: "bits", text: bitsKey });
  }, [bitsKey, menuDispatch]);

  const toggleInput = (id: string) => {
    setBits(toggleBit(bits, id));
    start(false);
  };
  const pickRow = (arr: Bit[]) => {
    setBits(bitsFromArray(circuit, arr));
    start(false);
  };

  const netMatches = useMemo(() => {
    if (!net) return false;
    try {
      return structureKey(buildNet(net)) === structure;
    } catch {
      return false;
    }
  }, [net, structure]);
  const caption = captionFor(
    netMatches ? net : undefined,
    netMatches ? undefined : layoutFrom,
  );
  const k = inputsOf(circuit).length;
  // tabulka závisí jen na struktuře (polohy ne): síť se pro ni zachytí jen při změně struktury
  const [shape, setShape] = useState({ key: structure, circuit });
  if (shape.key !== structure) setShape({ key: structure, circuit });
  const table = useMemo(
    () =>
      showTable && !broken && k > 0 && k <= TABLE_MAX_INPUTS
        ? truthTable(shape.circuit)
        : null,
    [shape, showTable, broken, k],
  );
  const running = mode === "run" && !!st;

  const notes = (
    <>
      {caption && <p className="hint graph-source">{caption}</p>}
      <p className="hint">
        Vstupy se přepínají klikem (nebo Enterem) – každé přepnutí připraví nový
        výpočet od taktu 0, ▶ ho přehraje. V režimu Upravit síť se síť kreslí:
        paleta hradel, vodič tahem z výstupního portu na vstupní, Delete maže,
        tah přesouvá; Kopírovat odkaz nese i polohy posunutých vrcholů. Cyklus
        editor nedovolí – hradlová síť musí být acyklická. Hloubka = počet
        vrstev S₀ … Sₖ (i se vstupy a výstupy, s. 384), velikost = počet hradel.
      </p>
    </>
  );
  const options = (
    <p className="hint">
      Zobrazení:{" "}
      <label title="Tečkované vrstvy S₀ … Sₖ jako na obr. 15.1 (u vlastní kresby štítek u vrcholu)">
        <input
          type="checkbox"
          checked={showLayers}
          onChange={(e) => setShowLayers(e.target.checked)}
        />{" "}
        vrstvy S₀…Sₖ
      </label>{" "}
      <label
        title={`Všechny vstupy a výstupy sítě (do ${TABLE_MAX_INPUTS} vstupů); klik na řádek = vstup`}
      >
        <input
          type="checkbox"
          checked={showTable}
          onChange={(e) => setShowTable(e.target.checked)}
        />{" "}
        pravdivostní tabulka
      </label>
      {showTable && k > TABLE_MAX_INPUTS && (
        <span className="muted"> (jen do {TABLE_MAX_INPUTS} vstupů)</span>
      )}
    </p>
  );

  return (
    <Visualizer
      title={mod?.title ?? "Hradlové sítě"}
      description={
        <>
          <p>
            Hradlová síť počítá po taktech: v taktu 0 mají hodnotu vstupy, v
            každém dalším taktu se současně ohodnotí všechny vrcholy, které už
            znají hodnoty všech svých vstupů. Vrstva Sᵢ = vrcholy hotové v i-tém
            taktu. Síť nakreslíte v režimu Upravit síť (hradla AND, OR, NOT,
            NAND, NOR, XOR), vstupy přepínáte klikem.
          </p>
          <p className="complexity">
            <b>Čas</b> = hloubka sítě (počet neprázdných vrstev), <b>prostor</b>{" "}
            = počet hradel; n-bitový or: řetězcem Θ(n) vrstev, stromem Θ(log n).
          </p>
        </>
      }
      opTitle={
        steps.length ? gatesOpTitle(run.circuit, run.bits) : "Hradlová síť"
      }
      tip="Or řetězcem a or stromem pro n = 8 mají stejně hradel (7), ale hloubku 9 proti 5 vrstvám. Zkuste nakreslit majoritu ze 4 vstupů (cv. 15.1.6) nebo xor jen z hradel nand."
      share
      runKey={shownId}
      inputHistory={history.control(undo)}
      onRestoreInitial={restoreDefault}
      actions={<ActionMenu menu={menu} label="Síť a výpočet" />}
      player={player}
      pseudocode={CIRCUIT_PSEUDOCODE}
      legend={GATES_LEGEND}
      notes={notes}
      options={options}
      codePlaceholder="Síť zatím nejde spočítat."
    >
      {notice && (
        <p className="hint input-error" role="status">
          {notice}
        </p>
      )}
      {broken && mode === "run" && (
        <p className="hint input-warn ce-issue" role="status">
          Síť zatím nejde spočítat: {issues.errors[0]}
          {issues.errors.length > 1
            ? ` (a ${issues.errors.length - 1} další)`
            : ""}
        </p>
      )}
      <div className={"circuit-layout" + (table ? " with-table" : "")}>
        <CircuitEditor
          edit={edit}
          mode={mode}
          onModeChange={changeMode}
          onRun={() => start()}
          values={running ? st.values : undefined}
          active={running ? st.active : undefined}
          done={running && st.done}
          bits={bits}
          showLayers={showLayers}
          onToggleInput={toggleInput}
          issue={broken ? issues.errors[0] : null}
        />
        {(table || running) && (
          <div className="circuit-result">
            {running && (
              <VarsView
                reserve
                vars={{
                  takt: `${st.takt} / ${st.depth - 1}`,
                  vrstev: st.depth,
                  hradel: st.gates,
                }}
              />
            )}
            {table && mode === "run" && (
              <TruthTableView
                table={table}
                current={bitsKey}
                onPick={pickRow}
              />
            )}
          </div>
        )}
      </div>
    </Visualizer>
  );
}
