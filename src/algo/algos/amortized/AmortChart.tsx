/**
 * Graf „skutečná cena a potenciál“ pod polem / počítadlem (Průvodce obr. 9.2: sloupce = skutečná cena
 * každé operace, křivka = potenciál Φ). Data nese stav kroku (CostChart), takže graf jde s přehráváním:
 * sloupec probíhající operace roste s jejími kroky. Výšku dává stránka přes canvasFit (vyplní plátno).
 */
import { BarChartView } from "../../views/BarChartView";
import type { CostChart } from "./amortized";
import { barText, CHART_LABEL } from "./amortChartModel";

export function AmortChart({
  chart,
  height,
}: {
  chart: CostChart;
  height: number;
}) {
  return (
    <BarChartView
      bars={chart.ops.map((o) => o.real)}
      line={[chart.phi0, ...chart.ops.map((o) => o.phi)]}
      first={chart.first}
      height={height}
      current={chart.ops.length ? chart.ops.length - 1 : null}
      ariaLabel={CHART_LABEL}
      barLabel={(i) => barText(chart, i)}
      emptyText="zatím žádná operace"
    />
  );
}
