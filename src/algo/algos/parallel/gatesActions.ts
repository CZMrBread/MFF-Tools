/**
 * Nabídka operací stránky Hradlové sítě (ActionMenu) – definice akcí (testy v gatesPageModel.test.ts).
 * Spočítat(vstupy) a Další vstup připraví výpočet po taktech (přehrávač stojí na kroku 1, ▶ ho
 * přehraje); Vytvořit a Příklady z knihy načtou síť.
 */
import type { ActionDef } from "../../core/actionModel";
import {
  inputsOf,
  MAX_INPUTS,
  type Bit,
  type Circuit,
  type CircuitIssues,
} from "./circuit";
import { BOOK_PRESETS } from "./circuitPresets";
import { parseCircuitText } from "./circuitText";
import {
  bitsText,
  bitWord,
  OR_CHAIN_MAX,
  OR_TREE_SIZES,
} from "./gatesPageModel";

export interface GatesHandlers {
  /** nový výpočet se zadanými bity (v pořadí vstupů) */
  simulate: (bits: Bit[]) => void;
  /** vstup o 1 větší (binárně) */
  next: () => void;
  loadPreset: (id: string) => void;
  /** parametrická síť: náhodná (n vstupů, m hradel), or řetězcem / stromem (n vstupů) */
  build: (
    kind: "random" | "or-chain" | "or-tree",
    n: number,
    m?: number,
  ) => void;
  /** vlastní síť textem (jeden řádek, příkazy oddělené středníkem) */
  custom: (text: string) => void;
  /** prázdná síť a režim kreslení */
  empty: () => void;
}

export const CUSTOM_DEFAULT = "in a, b; G = nand(a, b); out q = G";

export function gatesActionDefs(
  c: Circuit,
  bits: Readonly<Record<string, Bit>>,
  issues: CircuitIssues,
  h: GatesHandlers,
): ActionDef[] {
  const ins = inputsOf(c);
  const k = ins.length;
  const broken = issues.errors[0] ?? null;
  const sim: ActionDef = {
    id: "sim",
    label: "Spočítat(vstupy)",
    title: "Připraví výpočet sítě po taktech pro zadané vstupy (▶ ho přehraje)",
    goLabel: "Spočítat",
    disabledReason: broken,
    args: [
      {
        kind: "text",
        name: "bits",
        label: "vstupy =",
        default: bitsText(c, bits),
        // mezery a čárky mezi bity se vynechají („0 1 1“, „0, 1, 1“)
        pattern: new RegExp(`^[\\s,]*(?:[01][\\s,]*){${Math.max(1, k)}}$`),
        notice: (v) =>
          /[01][\s,]+[01]/.test(String(v)) ? "Mezery vynechány." : null,
        patternHint: `přesně ${bitWord(k)} 0/1 v pořadí ${ins.map((n) => n.id).join(", ")}`,
        maxLength: MAX_INPUTS + 4,
        width: `${Math.max(5, k + 3)}ch`,
      },
    ],
    run: (v) =>
      h.simulate(
        [...String(v.bits).replace(/[\s,]/g, "")].map(
          (ch) => (ch === "1" ? 1 : 0) as Bit,
        ),
      ),
  };
  const next: ActionDef = {
    id: "next",
    label: "Další vstup",
    title:
      "Vstup o 1 větší (binárně) – postupně projde celou pravdivostní tabulku",
    disabledReason: broken,
    run: () => h.next(),
  };
  const create: ActionDef = {
    id: "create",
    label: "Vytvořit",
    variants: [
      {
        id: "random",
        label: "Náhodně",
        title: "Náhodná síť z hradel and, or, not, nand, nor, xor",
        args: [
          {
            kind: "int",
            name: "n",
            label: "vstupů n =",
            min: 1,
            max: 6,
            default: 3,
          },
          {
            kind: "int",
            name: "m",
            label: "hradel m =",
            min: 1,
            max: 14,
            default: 5,
          },
        ],
      },
      {
        id: "or-chain",
        label: "Or řetězcem(n)",
        title: "n-bitový or jako na obr. 15.2 vlevo – hloubka roste s n",
        args: [
          {
            kind: "int",
            name: "n",
            label: "n =",
            min: 2,
            max: OR_CHAIN_MAX,
            default: 4,
          },
        ],
      },
      {
        id: "or-tree",
        label: "Or stromem(n)",
        title: "n-bitový or jako na obr. 15.2 vpravo – hloubka log₂ n",
        args: [
          {
            kind: "choice",
            name: "nt",
            label: "n =",
            options: OR_TREE_SIZES.map((s) => ({
              value: String(s),
              label: String(s),
            })),
            default: "8",
          },
        ],
      },
      {
        id: "custom",
        label: "Vlastní",
        title:
          "Síť textem: in a, b; G = and(a, b); out q = G (_ = nezapojený port)",
        args: [
          {
            kind: "text",
            name: "text",
            label: "síť =",
            default: CUSTOM_DEFAULT,
            maxLength: 1200,
            width: "min(30rem, 100%)",
            // chyba textu sítě se ukáže u pole hned při psaní; Enter pak nic nenačte
            check: (v) =>
              parseCircuitText(String(v)).errors[0]?.message ?? null,
          },
        ],
      },
      {
        id: "empty",
        label: "Prázdná – nakreslit",
        title: "Prázdné plátno v režimu Upravit síť",
      },
    ],
    run: (v, variant) => {
      if (variant === "random") h.build("random", Number(v.n), Number(v.m));
      else if (variant === "or-chain") h.build("or-chain", Number(v.n));
      else if (variant === "or-tree") h.build("or-tree", Number(v.nt));
      else if (variant === "custom") h.custom(String(v.text));
      else if (variant === "empty") h.empty();
    },
  };
  const book: ActionDef = {
    id: "book",
    label: "Příklady z knihy",
    variants: BOOK_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      title: p.caption,
    })),
    run: (_, variant) => {
      if (variant) h.loadPreset(variant);
    },
  };
  // jako u ostatních modulů: vstup (Vytvořit, Příklady z knihy) první, pak operace nad ním
  return [create, book, sim, next];
}
