/** Stav editoru grafu pro GraphEditor – hook nad čistým reducerem graphEdit.ts. */
import { useReducer } from "react";
import type { Graph } from "../algos/graphs/graph";
import {
  graphEditReducer,
  initGraphEdit,
  type GraphEditAction,
  type GraphEditOptions,
  type GraphEditState,
} from "./graphEdit";

export interface GraphEditControl {
  state: GraphEditState;
  /** aktuální graf (neměnný objekt – nová identita po každé úpravě) */
  graph: Graph;
  dispatch: (a: GraphEditAction) => void;
}

/** Stav editoru grafu; `initial` se použije jen při prvním renderu (nový graf zvenku: dispatch reset/load). */
export function useGraphEdit(
  initial: Graph | (() => Graph),
  options: GraphEditOptions = {},
): GraphEditControl {
  const [state, dispatch] = useReducer(graphEditReducer, null, () =>
    initGraphEdit(typeof initial === "function" ? initial() : initial, options),
  );
  return { state, graph: state.graph, dispatch };
}
