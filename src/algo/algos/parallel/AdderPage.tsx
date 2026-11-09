/**
 * Sčítačka (#/parallel/adder, Průvodce 15.2, s. 386–390): školní sčítání (obr. 15.3, řetěz krabiček Σ,
 * hloubka Θ(n)) proti paralelnímu (obr. 15.4, bloky 0 / 1 / <, přenosy zahušťováním, Θ(log n)).
 *
 * Výchozí režim „Obě souběžně“: v kroku t proběhne hladina t obou sčítaček – je vidět, která skončí dřív.
 * Každá změna vstupu (Sečíst, Vytvořit, příklad, klik na bit, režim) = nová sada kroků od kroku 1,
 * pozastavená (▶ ji přehraje). Logika bez Reactu je v adder.ts a adderPageModel.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLinkSearchParams } from "../../core/linkParams";
import { ActionMenu } from "../../core/ActionMenu";
import { materialize } from "../../core/steps";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { Visualizer } from "../../core/Visualizer";
import { CanvasFit, type FitLimits } from "../../core/canvasFit";
import { moduleByPath } from "../../registry";
import { VarsView } from "../../views/ArrayView";
import {
  ADDER_PSEUDOCODE,
  adderSteps,
  bitsOf,
  parallelDepth,
  schoolDepth,
  valueOf,
  type AdderMode,
} from "./adder";
import {
  adderActions,
  adderLegend,
  BOOK_EXAMPLES,
  configFromUrl,
  configToUrl,
  decimalPair,
  DEFAULT_CONFIG,
  depthText,
  exampleOf,
  normalizePair,
  randomPair,
  toggleBit,
  worstCarry,
  type AdderConfig,
  type AdderHandlers,
} from "./adderPageModel";
import {
  AdderTable,
  CompositionTable,
  SchoolChain,
  WrittenSum,
} from "./adderViews";

const PATH = "/parallel/adder";

interface Note {
  text: string;
  error: boolean;
}

/** přibližná výška kresby při měřítku 1 (px) – převod delty CanvasFit na měřítko */
const BASE_H: Record<AdderMode, number> = { both: 400, par: 280, school: 280 };
/** meze měřítka: školní řetěz se smí zvětšit (jinak by pod ním zůstalo prázdné plátno) */
const SCALE_MIN = 0.55;
const SCALE_MAX: Record<AdderMode, number> = {
  both: 1.15,
  par: 1.25,
  school: 1.6,
};

function adderFitLimits(mode: AdderMode): FitLimits {
  return {
    shrink: Math.round(BASE_H[mode] * (1 - SCALE_MIN)),
    grow: Math.round(BASE_H[mode] * (SCALE_MAX[mode] - 1)),
  };
}

/** Měřítko kresby z delty CanvasFit: výška obsahu ≈ BASE_H · měřítko. */
function adderScale(mode: AdderMode, delta: number): number {
  const s = 1 + delta / BASE_H[mode];
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX[mode], s));
}

const buildSteps = (c: AdderConfig) =>
  materialize(adderSteps(bitsOf(c.x), bitsOf(c.y), c.mode));

export function AdderPage() {
  const mod = moduleByPath(PATH);
  // vstup jde sdílet odkazem: #/parallel/adder?x=01110100&y=00111011&m=par&pq=1
  const [params, setParams] = useLinkSearchParams();
  const [initial] = useState(() => configFromUrl(params));
  const [config, setConfig] = useState<AdderConfig>(initial.config);
  // nové pole kroků jen při nové konfiguraci (usePlayer pak stojí na kroku 1, pozastavený)
  const [steps, setSteps] = useState(() => buildSteps(initial.config));
  const [shownId, setShownId] = useState(0);
  const [note, setNote] = useState<Note | null>(
    initial.notice ? { text: initial.notice, error: true } : null,
  );

  // odkaz se při otevření stránky nepřepisuje – jen po změně vstupu, režimu nebo zobrazení
  const writeUrl = (c: AdderConfig) => {
    const next = new URLSearchParams(configToUrl(c));
    if (next.toString() !== params.toString())
      setParams(next, { replace: true });
  };
  const apply = (c: AdderConfig, n: Note | null = null, scroll = true) => {
    setConfig(c);
    setSteps(buildSteps(c));
    setNote(n);
    writeUrl(c);
    if (scroll) setShownId((r) => r + 1);
  };
  const withPair = (x: string, y: string, mode = config.mode) => {
    const r = normalizePair(x, y);
    if ("error" in r) {
      setNote({ text: `Vstup nešel použít: ${r.error}.`, error: true });
      return;
    }
    apply(
      { ...config, x: r.x, y: r.y, mode },
      r.padded
        ? {
            text: `x = ${x}, y = ${y} – doplněno zleva nulami na n = ${r.n} (kniha předpokládá n = 2ᵏ, s. 389).`,
            error: false,
          }
        : null,
    );
  };

  const handlers: AdderHandlers = {
    add: (x, y) => withPair(x, y),
    random: (n) => {
      const r = randomPair(n);
      withPair(r.x, r.y);
    },
    decimal: (a, b) => {
      const r = decimalPair(a, b);
      apply({ ...config, x: r.x, y: r.y });
    },
    worst: (n) => {
      const r = worstCarry(n);
      apply({ ...config, x: r.x, y: r.y });
    },
    example: (id) => {
      const e = BOOK_EXAMPLES.find((b) => b.id === id);
      if (!e) return;
      const mode: AdderMode =
        e.mode ?? (config.mode === "school" ? "both" : config.mode);
      apply({ ...config, x: e.x, y: e.y, mode });
    },
    mode: (mode) => apply({ ...config, mode }),
  };
  const menu = useActionMenu(adderActions(config, handlers));
  const { dispatch } = menu;
  // pole x, y a zvolený režim sledují aktuální vstup (klik na bit, příklad, odkaz)
  useEffect(() => {
    dispatch({ type: "text", name: "x", text: config.x });
    dispatch({ type: "text", name: "y", text: config.y });
  }, [config.x, config.y, dispatch]);
  useEffect(
    () => dispatch({ type: "variant", id: "mode", variant: config.mode }),
    [config.mode, dispatch],
  );

  const player = usePlayer(steps);
  const st = player.current?.state ?? null;
  const n = config.x.length;
  const { mode } = config;
  const toggle = (which: "x" | "y", i: number) =>
    apply(toggleBit(config, which, i), null, false);
  const setPq = (pq: boolean) => {
    const c = { ...config, pq };
    setConfig(c);
    writeUrl(c);
  };

  const example = exampleOf(config);
  const vars = useMemo(() => {
    if (!st) return {};
    const v: Record<string, string | number> = {
      x: valueOf(st.x),
      y: valueOf(st.y),
    };
    if (st.par?.done || st.school?.done)
      v.z = valueOf(st.par?.done ? st.par.z : st.school!.z);
    if (st.school)
      v["školní hladina"] = `${st.school.level} / ${schoolDepth(n)}`;
    if (st.par)
      v["paralelní hladina"] = `${st.par.level} / ${parallelDepth(n)}`;
    return v;
  }, [st, n]);

  const notes = (
    <>
      {example && <p className="hint graph-source">{example.caption}</p>}
      <p className="hint">
        Bity sčítanců se přepínají klikem (nebo Enterem) – každé přepnutí
        připraví nový výpočet od kroku 1, ▶ ho přehraje. Blok = část sítě přes
        řády [i, j); jeho chování je funkce přenosu, který do něj vstoupí: 0
        pohlcuje, 1 vytváří, &lt; kopíruje (¬ nenastane, s. 388). Hladina má
        konstantní hloubku hradel – školní krabička Σ stejně jako jeden řádek
        tabulky.
      </p>
      <p className="hint">
        Školní sčítačku rozepsanou na hradla ukazuje modul{" "}
        <Link to="/parallel/gates?net=adder">Hradlové sítě</Link>.
      </p>
    </>
  );
  const options =
    mode !== "school" ? (
      <p className="hint">
        Zobrazení:{" "}
        <label title="Kódování chování bloku dvěma bity (s. 389): (1, ∗) = <, (0, 0) = 0, (0, 1) = 1">
          <input
            type="checkbox"
            checked={config.pq}
            onChange={(e) => setPq(e.target.checked)}
          />{" "}
          (p, q) u bloků
        </label>
      </p>
    ) : undefined;

  return (
    <Visualizer
      title={mod?.title ?? "Sčítačka"}
      description={
        <>
          <p>
            Školní sčítání (obr. 15.3) počítá krabička po krabičce: Σᵢ čeká na
            přenos cᵢ z Σᵢ₋₁, takže n bitů potřebuje n hladin. Paralelní
            sčítačka (obr. 15.4) nejdřív spočte chování všech kanonických bloků
            (0 pohlcuje, 1 vytváří, &lt; kopíruje přenos), pak přenosy
            zahušťováním a nakonec všechna zᵢ = xᵢ ⊕ yᵢ ⊕ cᵢ najednou.
          </p>
          <p className="complexity">
            <b>Hloubka</b>: školní Θ(n), paralelní 2·log₂ n + 3 ∈ Θ(log n); obě
            mají Θ(n) hradel.
          </p>
        </>
      }
      opTitle={`${valueOf(bitsOf(config.x))} + ${valueOf(bitsOf(config.y))} (n = ${n})`}
      tip="Pro n = 8 je školní sčítačka ještě rychlejší (8 hladin proti 9). Zkuste Vytvořit ▸ Nejhorší přenos s n = 16: paralelní skončí v hladině 11, školní až v 16."
      share
      runKey={shownId}
      // Výchozí příklad = obr. 15.4 v režimu Obě souběžně (adresa bez parametrů)
      onRestoreInitial={() => apply(DEFAULT_CONFIG)}
      actions={<ActionMenu menu={menu} label="Sčítání" />}
      player={player}
      pseudocode={ADDER_PSEUDOCODE[mode]}
      legend={adderLegend(mode)}
      notes={notes}
      options={options}
    >
      {note && (
        <p
          className={"hint" + (note.error ? " input-error" : "")}
          role="status"
        >
          {note.text}
        </p>
      )}
      <p className="hint adder-depth">Hloubka: {depthText(n)}</p>
      {st && (
        // na jednu obrazovku: tabulka i řetěz se zmenší / zvětší tak, aby vyplnily výšku plátna
        // (i s otevřenou akcí); školní režim navíc ukáže písemné sčítání pod řetězem
        <CanvasFit limits={adderFitLimits(mode)}>
          {(delta) => {
            const s = adderScale(mode, delta);
            return (
              <div className={`adder-layout adder-${mode}`}>
                {st.par && (
                  <div className="adder-par">
                    <div className="adder-par-main">
                      <AdderTable
                        state={st}
                        par={st.par}
                        pq={config.pq}
                        onToggle={toggle}
                        scale={s}
                      />
                      <CompositionTable composed={st.par.composed} scale={s} />
                    </div>
                  </div>
                )}
                {st.school && (
                  <div className="view-wrap adder-chain">
                    <SchoolChain
                      x={st.x}
                      y={st.y}
                      school={st.school}
                      onToggle={mode === "school" ? toggle : undefined}
                      scale={s}
                    />
                  </div>
                )}
                {st.school && mode === "school" && (
                  <WrittenSum
                    x={st.x}
                    y={st.y}
                    school={st.school}
                    scale={Math.min(s, 1.3)}
                  />
                )}
                <VarsView reserve vars={vars} />
              </div>
            );
          }}
        </CanvasFit>
      )}
    </Visualizer>
  );
}
