/**
 * Legendy stránek stromů. Každá položka říká, které třídy vrcholů / hran (st.marks, st.edgeMarks, u (a,b)-stromu
 * i zvýrazněný oddělovač „hot“) zastupuje – legend.test.ts hlídá, že legenda obsahuje přesně ty značky,
 * které generátory opravdu kreslí.
 */
import type { LegendItem } from "../../core/Visualizer";
import type { AbVariant } from "./abtree";
import type { Kind } from "./treeOps";

export interface TreeLegendItem extends LegendItem {
  /** třídy na plátně, které položka vysvětluje */
  marks: string[];
}

const ACTIVE: TreeLegendItem = {
  cls: "sw-active",
  label: "navštívený vrchol",
  marks: ["n-active"],
};
const PATH: TreeLegendItem = {
  cls: "sw-active",
  shape: "line",
  label: "prošlá hrana",
  marks: ["e-active"],
};
const REMOVED: TreeLegendItem = {
  cls: "sw-removed-dashed",
  label: "odstraňovaný vrchol",
  marks: ["n-removed"],
};
const ROTATE: TreeLegendItem = {
  cls: "bar-swap",
  shape: "line",
  label: "rotovaná hrana",
  marks: ["e-rotate"],
};

export function treeLegend(kind: Kind): TreeLegendItem[] {
  const found: TreeLegendItem = {
    cls: "sw-new",
    label:
      kind === "bb"
        ? "nalezený / nový / přestavěný vrchol"
        : "nalezený / nový vrchol",
    marks: ["n-found", "n-new"],
  };
  if (kind === "bst") {
    return [
      ACTIVE,
      PATH,
      found,
      {
        cls: "sw-compare",
        label: "cesta k následníkovi",
        marks: ["n-compare"],
      },
      {
        cls: "bar-swap",
        label: "vrchol, který převezme klíč následníka",
        marks: ["n-swap"],
      },
      REMOVED,
    ];
  }
  if (kind === "avl") {
    return [
      ACTIVE,
      PATH,
      found,
      {
        cls: "sw-compare",
        label: "syn rozhodující o rotaci / cesta k následníkovi",
        marks: ["n-compare"],
      },
      { cls: "sw-bad", label: "nevyvážený vrchol (|δ| = 2)", marks: ["n-bad"] },
      {
        cls: "bar-swap",
        label: "rotované vrcholy / převzetí klíče následníka",
        marks: ["n-swap"],
      },
      ROTATE,
      REMOVED,
    ];
  }
  if (kind === "splay") {
    return [
      ACTIVE,
      PATH,
      found,
      {
        cls: "sw-compare",
        label: "otec / děd při rotaci",
        marks: ["n-compare"],
      },
      ROTATE,
      { ...REMOVED, label: "odebraný kořen (Delete)" },
    ];
  }
  return [
    ACTIVE,
    PATH,
    found,
    { cls: "sw-bad", label: "porušená podmínka α", marks: ["n-bad"] },
    {
      cls: "bar-swap",
      label: "podstrom k přestavbě / převzetí klíče následníka",
      marks: ["n-swap"],
    },
    REMOVED,
  ];
}

export const AB_LEGEND: TreeLegendItem[] = [
  { cls: "sw-active", label: "navštívený vrchol", marks: ["n-active"] },
  {
    cls: "sw-range",
    label: "oddělovač, podle kterého sestupujeme (tučně, podtržený)",
    marks: ["hot"],
  },
  {
    cls: "sw-new",
    label: "nalezený / nový / opravený vrchol",
    marks: ["n-found", "n-new"],
  },
  {
    cls: "sw-bad",
    label: "přeplněný / podtečený vrchol, list bez hledaného klíče",
    marks: ["n-bad"],
  },
  { cls: "sw-compare", label: "sousední bratr", marks: ["n-compare"] },
  {
    cls: "bar-swap",
    label: "rozdělený vrchol / bratr, který předal syna",
    marks: ["n-swap"],
  },
  REMOVED,
];

/** Legenda knižní varianty (Průvodce 8.3): klíče ve vrcholech, štěpení, půjčka a slučování. */
const AB_BOOK_LEGEND: TreeLegendItem[] = [
  { cls: "sw-active", label: "navštívený vrchol", marks: ["n-active"] },
  {
    cls: "sw-range",
    label: "porovnávaný / vložený klíč (tučně, podtržený)",
    marks: ["hot"],
  },
  {
    cls: "sw-new",
    label: "nalezený / nový / opravený vrchol",
    marks: ["n-found", "n-new"],
  },
  {
    cls: "sw-bad",
    label: "přeplněný / podtečený vrchol, konec hledání bez klíče",
    marks: ["n-bad"],
  },
  {
    cls: "sw-compare",
    label: "sousední bratr / cesta k následníkovi",
    marks: ["n-compare"],
  },
  {
    cls: "bar-swap",
    label: "rozštěpený vrchol / bratr, který půjčil / přepsaný klíč",
    marks: ["n-swap"],
  },
  { ...REMOVED, label: "vrchol, ze kterého se klíč odebírá" },
];

/** Legenda (a,b)-stromu podle varianty. */
export const abLegend = (v: AbVariant): TreeLegendItem[] =>
  v === "kniha" ? AB_BOOK_LEGEND : AB_LEGEND;

/** Pro Visualizer: bez pomocného pole marks. */
export const toLegend = (items: TreeLegendItem[]): LegendItem[] =>
  items.map(({ marks, ...item }) => {
    void marks;
    return item;
  });
