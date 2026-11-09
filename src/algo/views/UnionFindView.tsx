/**
 * Les keříků Union-Find (Kruskal, Průvodce 7.4, E5) v panelu výsledku vedle grafu: šipka vede ze syna
 * k otci P(v), u kořene je hloubka keříku H. Cesty, kterými právě vystoupal Find, a nová šipka po Union se
 * zvýrazní. Třídy jen podle sdíleného kontraktu .viz-ufforest v index.css (uf-node is-root / is-path / is-hot,
 * uf-edge [is-path], uf-arrow [is-path], uf-rank) – třídy kresby grafu (graph-node, n-comp…) by se s ním
 * přebíjely (v tmavém tématu tmavý text na tmavém kroužku).
 *
 * Barvy komponent: s `nodeMarks` (značky vrcholů z kresby grafu) dostane každý vrchol lesa třídu uf-compK
 * podle značky n-compK svého vrcholu v grafu – keřík má tak stejnou barvu jako jeho komponenta v grafu
 * (paleta n-comp0…7 v index.css sdílená s .graph-node). Jiné značky (n-closed…) les nebarví.
 *
 * Kresba nic nevybírá – je to obrázek (role img s popisem lesu), bez zastávky Tabu; roving tabindex mají
 * jen kresby, ve kterých jde něco vybrat. Rozměry 1 jednotka = 1 px (ufForestLayout.ts).
 */
import type { UnionFindState } from "../algos/graphs/graph";
import {
  UF_MAX_COLS,
  UF_R,
  ufForestLabel,
  ufForestLayout,
  type UfLayoutNode,
} from "./ufForestLayout";

/** třída barvy komponenty v lese podle značky vrcholu v grafu („n-comp3“ → „uf-comp3“), jinak null */
function ufCompClass(mark: string | undefined): string | null {
  const m = mark ? /(?:^|\s)n-comp(\d+)(?=\s|$)/.exec(mark) : null;
  return m ? `uf-comp${m[1]}` : null;
}

/** délka hrotu šipky */
const HEAD = 7;

/** popisek do kroužku: do 3 znaků celý, delší zkrácený (celý v <title>) */
function shortLabel(label: string): { text: string; font: number } {
  const chars = [...label];
  if (chars.length <= 2) return { text: label, font: 13 };
  if (chars.length === 3) return { text: label, font: 10 };
  return { text: chars.slice(0, 2).join("") + "…", font: 10 };
}

/** úsečka syn → otec mezi okraji kroužků a trojúhelník hrotu u otce */
function arrow(a: UfLayoutNode, b: UfLayoutNode) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sx = a.x + ux * UF_R;
  const sy = a.y + uy * UF_R;
  const tx = b.x - ux * (UF_R + 1);
  const ty = b.y - uy * (UF_R + 1);
  const bx = tx - ux * HEAD;
  const by = ty - uy * HEAD;
  const px = -uy * (HEAD / 2);
  const py = ux * (HEAD / 2);
  const f = (x: number) => Math.round(x * 10) / 10;
  return {
    line: `M${f(sx)},${f(sy)} L${f(bx)},${f(by)}`,
    head: `M${f(tx)},${f(ty)} L${f(bx + px)},${f(by + py)} L${f(bx - px)},${f(by - py)} Z`,
  };
}

export function UnionFindView({
  uf,
  labels,
  reserveH = 0,
  reserveW = 0,
  nodeMarks,
}: {
  uf: UnionFindState;
  /** popisky vrcholů podle id */
  labels: readonly string[];
  /** výška a šířka, které kresba drží (nejvyšší / nejširší les běhu) – panel ani graf se mezi kroky nepřeskládají */
  reserveH?: number;
  reserveW?: number;
  /** značky vrcholů z kresby grafu (GraphState.nodeMarks) – barva komponenty n-compK se přenese do lesa */
  nodeMarks?: Readonly<Record<number, string>>;
}) {
  const L = ufForestLayout(uf.parent, UF_MAX_COLS);
  const W = Math.max(L.w, reserveW);
  const H = Math.max(L.h, reserveH);
  // les vodorovně uprostřed vyhrazené šířky
  const shift = (W - L.w) / 2;
  const nodes = L.nodes.map((n) => ({ ...n, x: n.x + shift }));
  const at = new Map(nodes.map((n) => [n.id, n]));
  const onPath = new Set(uf.path);
  const name = (v: number) => labels[v] ?? String(v);
  return (
    <div className="gtable uf-forest">
      <div
        className="gtable-title"
        title="Šipka vede od vrcholu v k jeho otci P(v); H u kořene = hloubka keříku (Průvodce 7.4)."
      >
        Keříky Union-Find · šipka = otec P
      </div>
      <svg
        className="viz-ufforest uf-svg"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={ufForestLabel(uf.parent, uf.depth, labels)}
      >
        {L.edges.map(({ child, parent }) => {
          const { line, head } = arrow(at.get(child)!, at.get(parent)!);
          // nová šipka po Union, jinak úsek cesty, kterou právě vystoupal Find
          const hot =
            child === uf.linked
              ? " is-path is-new"
              : onPath.has(child) && onPath.has(parent)
                ? " is-path"
                : "";
          return (
            <g key={child} className="uf-link" data-child={name(child)}>
              <path className={"uf-edge" + hot} d={line} />
              <path className={"uf-arrow" + (hot ? " is-path" : "")} d={head} />
            </g>
          );
        })}
        {nodes.map((n) => {
          const { text, font } = shortLabel(name(n.id));
          // vrchol na cestě Find / právě připojený kořen
          const state = onPath.has(n.id)
            ? " is-path"
            : n.id === uf.linked
              ? " is-hot"
              : "";
          const comp = ufCompClass(nodeMarks?.[n.id]);
          return (
            <g
              key={n.id}
              className={`uf-node${comp ? " " + comp : ""}${n.root ? " is-root" : ""}${state}`}
              transform={`translate(${n.x},${n.y})`}
            >
              <title>{name(n.id)}</title>
              <circle r={UF_R} />
              <text
                className="uf-label"
                textAnchor="middle"
                dominantBaseline="central"
                style={font !== 13 ? { fontSize: font } : undefined}
              >
                {text}
              </text>
              {n.root && (
                <text
                  className="uf-rank"
                  textAnchor="middle"
                  dominantBaseline="central"
                  y={-UF_R - 7}
                >
                  H={uf.depth[n.id] ?? 0}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
