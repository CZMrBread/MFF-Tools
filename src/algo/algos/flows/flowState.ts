/**
 * Stav kroku obou algoritmů toků (FordFulkerson, Dinic) – jeden typ, aby se kreslil stejnými pohledy
 * (flowView.ts). Toky a rezervy jsou pole podle id hrany sítě, resp. id oblouku sítě rezerv (flowNet.Arc).
 */

/** Která procedura právě běží (podle ní stránka ukáže pseudokód). */
export type FlowProc = "ff" | "forward" | "dinic" | "clean" | "block";

/**
 * Osud oblouku vrstevnaté sítě během fáze Dinicova algoritmu (obr. 14.7): `live` zůstává, `gray` zmizel
 * při ČištěníSítě ř. 2–3 (vede dozadu, uvnitř vrstvy nebo za s – na obrázku šedivé), `dead` vedl do slepé
 * uličky (tečkované), `sat` nasytil ho blokující tok (g = r).
 */
export type ArcFate = "live" | "gray" | "dead" | "sat";

export interface FlowState {
  proc: FlowProc;
  /** tok po hranách sítě */
  f: number[];
  /** |f| */
  value: number;
  /** nalezená cesta – id oblouků sítě rezerv ze z do s */
  path: number[];
  /** oblouky cesty, na kterých se nabývá ε */
  bottleneck: number[];
  /** právě zpracovávaný oblouk cesty (FordFulkerson ř. 5–7) */
  cur: number | null;
  /** hrany sítě, jejichž tok se v tomto kroku změnil */
  changed: number[];
  /** vrcholy, kam došlo hledání cesty (BFS / DFS) */
  seen: number[];
  eps: number | null;
  delta: number | null;
  /** číslo zlepšení (FordFulkerson) */
  iteration: number;
  /** konec: minimální řez E(A, B) – vrcholy A a hrany z A do B */
  cut: { A: number[]; edges: number[] } | null;
  /** konec v síti párování: hrany L → R s tokem 1 */
  matching: number[] | null;

  /* ---- Dinic ---- */
  /** číslo fáze (od 1); 0 = před první fází */
  phase: number;
  /** vzdálenosti od z v síti rezerv fáze (null = nedosažitelný) */
  dist: (number | null)[] | null;
  /** ℓ = vzdálenost stoku (null = stok nedosažitelný) */
  ell: number | null;
  /** rezervy oblouků na začátku fáze (síť R) */
  r: number[] | null;
  /** osud oblouků R (jen oblouky s r > 0) */
  fate: Record<number, ArcFate>;
  /** smazané vrcholy R */
  gone: number[];
  /** vrstvy už jsou rozdělené (ČištěníSítě ř. 1) – kresba ukáže obtažené vrstvy */
  layered: boolean;
  /** blokující tok g po obloucích (null = ještě se nehledá) */
  g: number[] | null;
  /** fronta F slepých uliček */
  queue: number[] | null;
}

export function initialFlowState(
  proc: FlowProc,
  f: number[],
  value: number,
): FlowState {
  return {
    proc,
    f,
    value,
    path: [],
    bottleneck: [],
    cur: null,
    changed: [],
    seen: [],
    eps: null,
    delta: null,
    iteration: 0,
    cut: null,
    matching: null,
    phase: 0,
    dist: null,
    ell: null,
    r: null,
    fate: {},
    gone: [],
    layered: false,
    g: null,
    queue: null,
  };
}
