import { useState } from "react";
import { moduleByPath } from "../../registry";
import { Navigate, useParams } from "react-router-dom";
import { useLinkSearchParams } from "../../core/linkParams";
import { ActionMenu } from "../../core/ActionMenu";
import { useActionMenu } from "../../core/useActionMenu";
import { randomArray } from "../../core/steps";
import { usePlayer } from "../../core/usePlayer";
import { useStructure } from "../../core/useStructure";
import { useUrlParam } from "../../core/useUrlParam";
import { Visualizer, type LegendItem } from "../../core/Visualizer";
import {
  ARR_MAX_N,
  ARR_MAX_VALUE,
  arrBound,
  arrDelete,
  arrDeleteMany,
  arrFromUrl,
  arrInsert,
  arrInsertMany,
  batchCount,
  buildArr,
  capacityFor,
  cntBound,
  cntFromUrl,
  cntValue,
  increment,
  incrementMany,
  mkArr,
  mkCounter,
  ARR_DEFAULT,
  CNT_DEFAULT,
  PC_ARR_DELETE,
  PC_ARR_INSERT,
  PC_CNT,
  type ArrState,
  type CntState,
} from "./amortized";
import {
  arrayActions,
  BATCH,
  capFromUrl,
  counterActions,
  nextX,
} from "./pageModel";
import { CanvasFit, stretch } from "../../core/canvasFit";
import { AmortChart } from "./AmortChart";
import {
  CHART_FIT,
  CHART_H,
  CHART_LEGEND,
  CHART_MAX_H,
  CHART_MIN_H,
} from "./amortChartModel";
import { idleCode } from "../structures/pageModel";
import { useOpenOnMount } from "../structures/useOpenOnMount";
import { sameList, useUrlSync } from "../structures/useUrlSync";
import { SumsView, ArrayCells, Bits } from "./AmortizedViews";

const ARR_IDLE_CODE: Record<string, readonly string[]> = {
  insert: PC_ARR_INSERT,
  insertMany: PC_ARR_INSERT,
  delete: PC_ARR_DELETE,
  deleteMany: PC_ARR_DELETE,
};
const CNT_IDLE_CODE: Record<string, readonly string[]> = {
  increment: PC_CNT,
  incrementMany: PC_CNT,
};

/** číslo do textového pole: skutečné minus */
const fmtNum = (v: number) => String(v).replace("-", "−");

const ARR_MESSAGE =
  "Pole je plné (n = p = 4). Zkuste Insert(x) – pole se zdvojnásobí a kopírování zaplatí potenciál.";

const ARR_LEGEND: LegendItem[] = [
  { cls: "sw-new", label: "právě vložený prvek" },
  { cls: "sw-compare", label: "kopírovaný při realokaci" },
  { cls: "sw-removed-dashed", label: "odebíraný prvek" },
  { cls: "sw-free", label: "volná buňka (kapacita p)" },
  ...CHART_LEGEND,
];

const argList = (v: number[]) =>
  v.length > 6
    ? `${v.slice(0, 5).join(", ")}, … (${v.length} prvků)`
    : v.join(", ");

function DynArrayPage() {
  // vstup jde sdílet odkazem: #/ds2/array?a=5,8,13 (nepovinně &p=8 – kapacita, např. stav z přednášky)
  // (oba parametry se zapisují jedním voláním – dvě volání setteru useUrlParam v jedné obsluze by se přepsala)
  const [params, setParams] = useLinkSearchParams();
  const [start] = useState(() => {
    const values = arrFromUrl(params.get("a"));
    return values
      ? { values, p: capFromUrl(params.get("p"), values.length) }
      : null;
  });
  const writeUrl = (a: number[] | null, p: number | null = null) => {
    const copy = new URLSearchParams(params);
    if (a?.length) copy.set("a", a.join(","));
    else copy.delete("a");
    if (p !== null) copy.set("p", String(p));
    else copy.delete("p");
    if (copy.toString() !== params.toString())
      setParams(copy, { replace: true });
  };
  const startValues = start?.values ?? ARR_DEFAULT;
  const s = useStructure<ArrState>(
    () =>
      start
        ? start.p
          ? mkArr(start.p, start.values)
          : buildArr(start.values)
        : mkArr(ARR_DEFAULT.length, ARR_DEFAULT),
    start
      ? "Pole ze sdíleného odkazu. Vyzkoušejte Insert(x) nebo Delete."
      : ARR_MESSAGE,
  );
  // po operaci a po ↶ adresa nese aktuální prvky a kapacitu (p jen tam, kde se liší od nejbližší mocniny 2)
  const synced = useUrlSync(s, (q) => {
    const v = q.items.map((it) => it.v);
    if (!v.length || (sameList(v, ARR_DEFAULT) && q.p === ARR_DEFAULT.length))
      writeUrl(null);
    else writeUrl(v, q.p === capacityFor(v.length) ? null : q.p);
  });
  const player = usePlayer(s.steps);
  const firstX = Math.min(ARR_MAX_VALUE, Math.max(0, ...startValues) + 1);
  const st = player.current?.state;
  const last = s.last;
  const n = last.items.length;

  /** další navržené x (po Insertu o jedna víc) do pole x */
  const setX = (v: number) =>
    menu.dispatch({ type: "text", name: "x", text: fmtNum(v) });
  const setA = (values: readonly number[]) =>
    menu.dispatch({ type: "text", name: "A", text: values.join(", ") });

  const menu = useActionMenu(
    arrayActions({
      n,
      full: n >= ARR_MAX_N,
      values: startValues,
      xDefault: firstX,
      xText: () => menu.state.texts.x,
      insert: (v) => {
        s.run(`Insert(${v})`, PC_ARR_INSERT, (a) => arrInsert(a, v));
        setX(nextX(v));
      },
      remove: () =>
        s.run(`Delete (odebere ${last.items[n - 1].v})`, PC_ARR_DELETE, (a) =>
          arrDelete(a),
        ),
      insertMany: (x) => {
        const k = batchCount(last, BATCH, true);
        if (!k) return;
        s.run(`${k}× Insert(${x} … ${x + k - 1})`, PC_ARR_INSERT, (a) =>
          arrInsertMany(a, x, k),
        );
        setX(Math.min(ARR_MAX_VALUE, x + k));
      },
      removeMany: () => {
        const k = batchCount(last, BATCH, false);
        if (!k) return;
        s.run(`${k}× Delete`, PC_ARR_DELETE, (a) => arrDeleteMany(a, k));
      },
      build: (values) => build(values),
      random: () => build(randomArray(10, 99), " (náhodný vstup)"),
      empty: () => {
        writeUrl(null);
        s.reset(mkArr(1, []), "Prázdné pole kapacity 1.", "Vyprázdnit");
      },
      example: (e) => {
        setA(e.values);
        setX(Math.max(0, ...e.values) + 1);
        writeUrl(e.values, e.p === capacityFor(e.values.length) ? null : e.p);
        s.reset(
          mkArr(e.p, e.values),
          `${e.source}: ${e.note} (n = ${e.values.length}, p = ${e.p}).`,
          `Vytvořit: ${e.label}`,
        );
      },
    }),
  );
  // Insert(x) je rozbalený hned – první Provést ukáže realokaci (CROSS-06)
  useOpenOnMount(menu, "insert");

  function build(values: number[], how = "") {
    const b = buildArr(values);
    setA(values);
    writeUrl(values);
    setX(Math.min(ARR_MAX_VALUE, Math.max(0, ...values) + 1));
    s.reset(
      b,
      `Pole postaveno${how}: n = ${b.items.length}, p = ${b.p} (nejbližší mocnina dvojky).`,
      `Vytvořit(${argList(values)})`,
    );
  }
  const restore = () => {
    s.restoreInitial();
    setX(firstX);
    setA(startValues);
    writeUrl(start ? start.values : null, start?.p ?? null);
  };

  return (
    <Visualizer
      title={moduleByPath("/ds2/array")?.title ?? "Nafukovací pole"}
      description={
        <>
          <p>
            Pole s kapacitou p: když se zaplní, zdvojnásobíme ho; když klesne na
            čtvrtinu, zmenšíme na polovinu. Jednotlivá operace může stát Θ(n)
            (kopírování), ale posloupnost k operací stojí O(n₀ + k).
            Potenciálová metoda: Φ = 2n − p pro p ≤ 2n, jinak Φ = p/2 − n.
            Operace bez realokace změní potenciál nejvýše o 2, kopírování n
            prvků ho sníží o n – realokaci tedy zaplatí potenciál.
          </p>
          <p>
            Skutečná cena tu znamená 1 za zápis či odebrání prvku a 1 za každý
            zkopírovaný prvek; amortizovaně pak Insert stojí nejvýše 3 a Delete
            nejvýše 2 (přednáška počítá jen zkopírované prvky, tam vychází 2). V
            panelu proměnných sledujte, že stále platí Σ skutečná ≤ Σ
            amortizovaná + Φ₀ − Φ, kde Φ₀ je potenciál na začátku. Graf pod
            polem ukazuje skutečnou cenu každé operace (sloupce) a potenciál Φ
            po ní (křivka), jako obr. 9.2 v Průvodci.
          </p>
          <p className="complexity">
            <b>Insert, Delete:</b> O(1) amortizovaně, Θ(n) v nejhorším případě
          </p>
        </>
      }
      actions={<ActionMenu menu={menu} />}
      player={player}
      pseudocode={idleCode(
        s.pseudocode,
        menu.state.open,
        ARR_IDLE_CODE,
        "insert",
      )}
      structure={synced}
      onRestoreInitial={restore}
      share
      tip={
        <>
          Insert(x) do plného pole (realokace a Φ klesne na 0), pak {BATCH}×
          Delete – pole se zmenší, až když klesne na čtvrtinu. Pokaždé
          porovnejte Σ skutečnou cenu s mezí Σ amortizovaná + Φ₀ − Φ. Stavy z
          přednášky najdete ve Vytvořit ▸ Z přednášky.
        </>
      }
      legend={ARR_LEGEND}
    >
      {st && (
        // graf ceny operací vyplní zbytek plátna (na 1280 × 720 se zmenší)
        <CanvasFit limits={CHART_FIT}>
          {(delta) => (
            <>
              <ArrayCells st={st} fitWidth />
              <SumsView vars={st.vars} real={st.real} bound={arrBound(st)} />
              <AmortChart
                chart={st.chart}
                height={stretch(CHART_H, delta, CHART_MIN_H, CHART_MAX_H)}
              />
            </>
          )}
        </CanvasFit>
      )}
    </Visualizer>
  );
}

const CNT_LEGEND: LegendItem[] = [
  { cls: "sw-active", label: "jednička (leží na ní mince)" },
  { cls: "sw-new", label: "právě nastavený bit 0 → 1" },
  { cls: "sw-removed-dashed", label: "právě shozený bit 1 → 0" },
  ...CHART_LEGEND,
];

function CounterPage() {
  // počáteční hodnota jde sdílet odkazem: #/ds2/counter?v=7
  const [urlV, setUrlV] = useUrlParam("v");
  const [first] = useState(() => cntFromUrl(urlV) ?? CNT_DEFAULT);
  const s = useStructure<CntState>(
    () => mkCounter(first),
    first === CNT_DEFAULT
      ? "Počítadlo ukazuje 7 = 000111. Zkuste Increment – tři jedničky spadnou najednou."
      : `Počítadlo ze sdíleného odkazu: ${first}.`,
  );
  // po operaci a po ↶ adresa nese aktuální hodnotu počítadla (výchozí 7 = bez parametru)
  const synced = useUrlSync(s, (q) => {
    const v = cntValue(q);
    setUrlV(v === CNT_DEFAULT ? null : String(v));
  });
  const player = usePlayer(s.steps);
  const st = player.current?.state;
  const value = cntValue(s.last);
  const setV = (v: number) =>
    menu.dispatch({ type: "text", name: "v", text: String(v) });

  const menu = useActionMenu(
    counterActions({
      value: first,
      set: (v) => {
        setUrlV(String(v));
        s.reset(
          mkCounter(v),
          `Počítadlo nastaveno na ${v}; účtování začíná od Φ₀ = počet jedniček.`,
          `Vytvořit(${v})`,
        );
      },
      zero: () => {
        setV(0);
        setUrlV(null);
        s.reset(mkCounter(0), "Počítadlo vynulováno.", "Vynulovat");
      },
      example: (e) => {
        setV(e.start);
        setUrlV(String(e.start));
        s.reset(
          mkCounter(e.start),
          `${e.label} (Průvodce, s. ${e.page}): počítadlo od ${e.start}. Increment je připravený – proveďte ho ${e.increments}× (Provést nebo Enter, ${BATCH}× Increment po osmi); každý běh přehraje až ▶.`,
          `Vytvořit(obr. ${e.figure})`,
        );
        menu.dispatch({ type: "open", id: "increment" });
        menu.focusRef.current = { to: "go" };
      },
      increment: () =>
        s.run(`Increment (${value} → ${value + 1})`, PC_CNT, (c) =>
          increment(c),
        ),
      incrementMany: () =>
        s.run(
          `${BATCH}× Increment (${value} → ${value + BATCH})`,
          PC_CNT,
          (c) => incrementMany(c, BATCH),
        ),
    }),
  );
  // Increment je rozbalený hned – stačí Provést nebo Enter (CROSS-06)
  useOpenOnMount(menu, "increment");

  return (
    <Visualizer
      title={moduleByPath("/ds2/counter")?.title ?? "Binární počítadlo"}
      description={
        <>
          <p>
            Increment může shodit mnoho jedniček najednou (z 0111 na 1000), ale
            v posloupnosti k incrementů se bit i mění jen každých 2ⁱ kroků.
            Mincová metoda: za každý increment dostaneme 2 mince – jednu
            utratíme za nastavení jedničky, druhou položíme na ni; shození
            jedničky zaplatí mince, která na ní leží. Potenciál Φ = počet
            jedniček; při startu z nenulové hodnoty platí Σ skutečná ≤ Σ
            amortizovaná + Φ₀ − Φ. Graf pod počítadlem je obr. 9.2 z Průvodce:
            šedé sloupce = skutečná cena incrementů, křivka = potenciál.
          </p>
          <p className="complexity">
            <b>Increment:</b> O(1) amortizovaně, Θ(log n) v nejhorším případě
          </p>
        </>
      }
      actions={<ActionMenu menu={menu} />}
      player={player}
      pseudocode={idleCode(
        s.pseudocode,
        menu.state.open,
        CNT_IDLE_CODE,
        "increment",
      )}
      structure={synced}
      onRestoreInitial={() => {
        s.restoreInitial();
        setV(first);
        setUrlV(first === CNT_DEFAULT ? null : String(first));
      }}
      share
      tip={
        <>
          Increment ze 7 (tři shozené bity, skutečná cena 4), potom {BATCH}×
          Increment: Σ skutečná cena zůstává pod Σ amortizovanou + Φ₀ − Φ, i
          když jednotlivé kroky stojí různě.
        </>
      }
      legend={CNT_LEGEND}
    >
      {st && (
        <CanvasFit limits={CHART_FIT}>
          {(delta) => (
            <>
              <Bits st={st} />
              <SumsView vars={st.vars} real={st.real} bound={cntBound(st)} />
              <AmortChart
                chart={st.chart}
                height={stretch(CHART_H, delta, CHART_MIN_H, CHART_MAX_H)}
              />
            </>
          )}
        </CanvasFit>
      )}
    </Visualizer>
  );
}

export function AmortizedPage() {
  const { id } = useParams();
  // App přesměruje neznámé adresy už sám; pojistka pro případ, že by stránku někdo zapojil pod jinou cestou
  if (id !== "array" && id !== "counter") return <Navigate to="/" replace />;
  return id === "counter" ? <CounterPage /> : <DynArrayPage />;
}
