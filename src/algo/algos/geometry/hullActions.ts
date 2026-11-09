/**
 * Nabídka akcí konvexního obalu (ActionMenu) – čistá funkce nad kontextem stránky (testy v hullActions.test.ts).
 * Pořadí: Vytvořit, Příklady z knihy, KonvexníObal (zametání), Provázkový, Přidat bod(x, y), Odebrat bod(x, y)
 * (pole x, y sdílí obě akce – klik / Enter na bod v rovině je vyplní).
 */
import { numArg, strArg, type ActionDef } from "../../core/actionModel";
import {
  circlePoints,
  MAX_CIRCLE,
  MAX_N,
  PLANE,
  randomHullPoints,
} from "./hull";
import { HULL_EXAMPLES } from "./hullBook";
import {
  addAt,
  exampleOf,
  pointsFromNumbers,
  pointsText,
  removeAt,
  type HullConfig,
  type HullEdit,
} from "./hullPageModel";
import { parsePointsText } from "./kdPageModel";

export interface HullCtx {
  config: HullConfig;
  /** nová konfigurace = nový běh (krok 1, pozastaveno); `title` do historie, `note` = upozornění */
  apply: (c: HullConfig, title: string, note?: string | null) => void;
  /** úprava bodů (Přidat bod, klepnutí do roviny) */
  edit: (e: HullEdit) => void;
  /** semínko pro Náhodně */
  seed: () => number;
}

const ALG_TITLE = {
  sweep: "KonvexníObal",
  wrap: "Provázkový",
} as const;

export function hullActions(ctx: HullCtx): ActionDef[] {
  const c = ctx.config;
  const n = c.points.length;
  return [
    {
      id: "create",
      label: "Vytvořit",
      title:
        "Body v rovině (celá čísla 0–100): vlastní souřadnice, náhodně, na kružnici, nebo prázdná rovina k naklikání",
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
              default: pointsText(c.points),
              width: "min(100%, 24rem)",
              check: (v) => parsePointsText(String(v)).error,
              notice: (v) =>
                pointsFromNumbers(parsePointsText(String(v)).values).note,
            },
          ],
        },
        {
          id: "random",
          label: "Náhodně",
          title: "n náhodných různých bodů",
          args: [
            {
              kind: "int",
              name: "n",
              label: "n =",
              min: 1,
              max: MAX_N,
              default: n >= 1 && n <= MAX_N ? n : 15,
              width: "3.5rem",
            },
          ],
        },
        {
          id: "circle",
          label: "Na kružnici",
          title: `n bodů na kružnici – všechny leží na obalu (n ≤ ${MAX_CIRCLE})`,
          args: [
            {
              kind: "int",
              name: "n",
              label: "n =",
              min: 3,
              max: MAX_CIRCLE,
              default: Math.max(3, Math.min(MAX_CIRCLE, n || 12)),
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
          ctx.apply(
            { points: randomHullPoints(k, ctx.seed()), alg: c.alg },
            `Vytvořit: náhodně, n = ${k}`,
          );
        } else if (variant === "circle") {
          const k = numArg(v, "n");
          ctx.apply(
            { points: circlePoints(k), alg: c.alg },
            `Vytvořit: na kružnici, n = ${k}`,
          );
        } else if (variant === "empty")
          ctx.apply({ points: [], alg: c.alg }, "Vytvořit: prázdná rovina");
        else {
          const r = pointsFromNumbers(parsePointsText(strArg(v, "P")).values);
          ctx.apply(
            { points: r.points, alg: c.alg },
            `Vytvořit(${r.points.length} bodů)`,
            r.note,
          );
        }
      },
    },
    {
      id: "book",
      label: "Příklady z knihy",
      title:
        "Obrázky 16.1–16.3 a cvičení 16.1.1 (souřadnice změřené z obrázků knihy)",
      selectedVariant: exampleOf(c.points)?.id ?? null,
      variants: HULL_EXAMPLES.map((e) => ({
        id: e.id,
        label: e.label,
        title: e.title,
      })),
      run: (_v, variant) => {
        const e = HULL_EXAMPLES.find((x) => x.id === variant);
        if (e)
          ctx.apply(
            { points: e.points.map((p) => ({ ...p })), alg: e.alg },
            e.label,
          );
      },
    },
    {
      id: "sweep",
      label: ALG_TITLE.sweep,
      title:
        "Zametání roviny (str. 403): body setříděné podle x přidává do horní a dolní obálky – připraví běh od kroku 1",
      run: () => ctx.apply({ ...c, alg: "sweep" }, ALG_TITLE.sweep),
    },
    {
      id: "wrap",
      label: ALG_TITLE.wrap,
      title:
        "Provázkový algoritmus (obr. 16.2): z nejlevějšího bodu otáčí polopřímkou po směru hodinových ručiček – připraví běh od kroku 1",
      run: () => ctx.apply({ ...c, alg: "wrap" }, ALG_TITLE.wrap),
    },
    {
      id: "add",
      label: "Přidat bod(x, y)",
      title: "Přidá bod se zadanými souřadnicemi (totéž co klepnutí do roviny)",
      goLabel: "Přidat",
      disabledReason: n >= MAX_N ? `Nejvýše ${MAX_N} bodů.` : null,
      args: [
        {
          kind: "int",
          name: "x",
          label: "x =",
          min: PLANE[0],
          max: PLANE[2],
          default: 50,
          width: "3.5rem",
        },
        {
          kind: "int",
          name: "y",
          label: "y =",
          min: PLANE[1],
          max: PLANE[3],
          default: 50,
          width: "3.5rem",
        },
      ],
      run: (v) => ctx.edit(addAt(c.points, numArg(v, "x"), numArg(v, "y"))),
    },
    {
      id: "remove",
      label: "Odebrat bod(x, y)",
      title:
        "Smaže bod se zadanými souřadnicemi – klik na bod v rovině je vyplní (totéž co Delete na bodu nebo × u vybraného bodu)",
      goLabel: "Odebrat",
      disabledReason: n === 0 ? "V rovině nejsou žádné body." : null,
      args: [
        {
          kind: "int",
          name: "x",
          label: "x =",
          min: PLANE[0],
          max: PLANE[2],
          default: 50,
          width: "3.5rem",
        },
        {
          kind: "int",
          name: "y",
          label: "y =",
          min: PLANE[1],
          max: PLANE[3],
          default: 50,
          width: "3.5rem",
        },
      ],
      run: (v) => ctx.edit(removeAt(c.points, numArg(v, "x"), numArg(v, "y"))),
    },
  ];
}
