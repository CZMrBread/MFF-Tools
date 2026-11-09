import { bubbleSort, insertSort, selectSort } from "./simple";
import { mergeSort } from "./merge";
import { quickSort } from "./quick";
import { countingSort, heapSort } from "./heapcount";
import type { SortAlgorithm } from "./types";

/** Všechny třídicí algoritmy v pořadí, v jakém jsou v menu. */
export const SORTING: SortAlgorithm[] = [
  bubbleSort,
  selectSort,
  insertSort,
  mergeSort,
  quickSort,
  heapSort,
  countingSort,
];
