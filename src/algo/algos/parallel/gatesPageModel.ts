/**
 * Stránka Hradlové sítě (#/parallel/gates) – čistá logika bez Reactu (testy v gatesPageModel.test.ts):
 * odkaz ↔ síť a vstupy, bity vstupů, souhrn hloubky a velikosti, legenda.
 *
 * Odkaz: `net=maj | or-chain | or-tree | xor-nand | adder` (+ `n=` u řetězce a stromu) = síť z knihy či
 * parametrická; `c=` = vlastní síť textem (circuitText.ts) a `p=` = knižní předloha, jejíž kresbu
 * vrcholy se stejným jménem zdědí; `in=101` = bity vstupů v pořadí vstupů. Výchozí příklad (obr. 15.1,
 * x = 1, y = 0, z = 1) dá prázdnou adresu. Volitelné `xy=` = polohy vrcholů (circuitPositions.ts) – jen
 * když se kresba liší od té, kterou by odkaz bez něj rozvrhl; vadné xy= se ignoruje (s poznámkou).
 */
import type { LegendItem } from "../../core/Visualizer";
import { importCircuitText } from "../../views/circuitEdit";
import {
  circuitDepth,
  gateCount,
  inputsOf,
  plural,
  structureKey,
  subscript,
  type Bit,
  type Circuit,
} from "./circuit";
import { orChain, orTree, presetById } from "./circuitPresets";
import { applyPositions, encodePositions } from "./circuitPositions";
import { circuitText, oneLine } from "./circuitText";

export const DEFAULT_NET = "maj";

/** síť z knihy nebo parametrická (n = počet vstupů řetězce / stromu) */
export interface NetRef {
  id: string;
  n?: number;
}

export interface GatesInit {
  circuit: Circuit;
  net?: NetRef;
  /** knižní předloha, jejíž kresbu síť drží (popisek zdroje, p=… v odkazu) */
  layoutFrom?: string;
  bits: Record<string, Bit>;
  problem: string | null;
}

export const OR_CHAIN_MAX = 12;
export const OR_TREE_SIZES = [2, 4, 8, 16] as const;

/** Síť podle odkazu; vyhodí chybu s lidským popisem (neznámá síť, špatné n). */
export function buildNet(ref: NetRef): Circuit {
  if (ref.n !== undefined) {
    if (ref.id === "or-chain") {
      if (!Number.isInteger(ref.n) || ref.n < 2 || ref.n > OR_CHAIN_MAX)
        throw new Error(`or řetězcem: n musí být 2 … ${OR_CHAIN_MAX}`);
      return orChain(ref.n);
    }
    if (ref.id === "or-tree") {
      if (!(OR_TREE_SIZES as readonly number[]).includes(ref.n))
        throw new Error(
          "or stromem: počet vstupů musí být mocnina dvou (2, 4, 8, 16)",
        );
      return orTree(ref.n);
    }
  }
  const p = presetById(ref.id);
  if (!p) throw new Error(`neznámá síť „${ref.id}“`);
  return p.build();
}

/** výchozí bity sítě (knižní předloha je má v knize, jinak nuly) */
export function defaultBits(c: Circuit, ref?: NetRef): Record<string, Bit> {
  const p = ref && ref.n === undefined ? presetById(ref.id) : undefined;
  return normalizeBits(
    c,
    Object.fromEntries(inputsOf(c).map((n, i) => [n.id, p?.bits[i] ?? 0])),
  );
}

export const normalizeBits = (
  c: Circuit,
  bits: Readonly<Record<string, Bit>>,
): Record<string, Bit> =>
  Object.fromEntries(inputsOf(c).map((n) => [n.id, bits[n.id] === 1 ? 1 : 0]));

export const bitsText = (c: Circuit, bits: Readonly<Record<string, Bit>>) =>
  inputsOf(c)
    .map((n) => (bits[n.id] === 1 ? "1" : "0"))
    .join("");

export const bitsFromArray = (
  c: Circuit,
  arr: readonly Bit[],
): Record<string, Bit> =>
  Object.fromEntries(inputsOf(c).map((n, i) => [n.id, arr[i] === 1 ? 1 : 0]));

export const toggleBit = (
  bits: Readonly<Record<string, Bit>>,
  id: string,
): Record<string, Bit> => ({
  ...bits,
  [id]: bits[id] === 1 ? 0 : 1,
});

/** Další vstup: binárně + 1 (první vstup = nejvyšší bit), po samých jedničkách zase nuly. */
export function nextBits(
  c: Circuit,
  bits: Readonly<Record<string, Bit>>,
): Record<string, Bit> {
  const ins = inputsOf(c);
  const k = ins.length;
  if (!k) return {};
  const v = (parseInt(bitsText(c, bits), 2) + 1) % (1 << k);
  return Object.fromEntries(
    ins.map((n, i) => [n.id, ((v >> (k - 1 - i)) & 1) as Bit]),
  );
}

export const bitWord = (n: number) => plural(n, "bit", "bity", "bitů");

function parseBitsParam(
  c: Circuit,
  text: string,
  fallback: Record<string, Bit>,
): { bits: Record<string, Bit>; problem: string | null } {
  const k = inputsOf(c).length;
  const names = inputsOf(c)
    .map((n) => n.id)
    .join(", ");
  if (!/^[01]*$/.test(text))
    return {
      bits: fallback,
      problem: `Vstup z odkazu „${text}“ – povoleny jen 0 a 1; použity výchozí vstupy.`,
    };
  if (text.length === k)
    return {
      bits: bitsFromArray(
        c,
        [...text].map((ch) => (ch === "1" ? 1 : 0)),
      ),
      problem: null,
    };
  const fixed = text.length < k ? text.padEnd(k, "0") : text.slice(0, k);
  return {
    bits: bitsFromArray(
      c,
      [...fixed].map((ch) => (ch === "1" ? 1 : 0)),
    ),
    problem: `Vstup z odkazu „${text}“ nemá ${bitWord(k)} (${names}) – ${text.length < k ? "doplněno nulami" : "oříznuto"}.`,
  };
}

/** Síť a vstupy z odkazu (jen při otevření stránky); vadný vstup → výchozí příklad + poznámka. */
export function gatesFromParams(p: URLSearchParams): GatesInit {
  const def = (problem: string | null): GatesInit => {
    const net = { id: DEFAULT_NET };
    const circuit = buildNet(net);
    return {
      circuit,
      net,
      layoutFrom: DEFAULT_NET,
      bits: defaultBits(circuit, net),
      problem,
    };
  };
  let init: GatesInit;
  const text = p.get("c");
  const netId = p.get("net");
  if (text !== null) {
    const from = presetById(p.get("p"));
    const base: Circuit = from ? from.build() : { nodes: [], flow: "right" };
    const r = importCircuitText(base, text);
    if (r.errors.length)
      return def(
        `Síť z odkazu nešla použít: ${r.errors[0].message} – zobrazen výchozí příklad.`,
      );
    init = {
      circuit: r.circuit,
      layoutFrom: from?.id,
      bits: normalizeBits(r.circuit, {}),
      problem: null,
    };
  } else if (netId !== null) {
    const nText = p.get("n");
    const net: NetRef =
      nText === null ? { id: netId } : { id: netId, n: Number(nText) };
    try {
      const circuit = buildNet(net);
      init = {
        circuit,
        net,
        layoutFrom: net.n === undefined ? net.id : undefined,
        bits: defaultBits(circuit, net),
        problem: null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return def(
        msg.startsWith("neznámá")
          ? `Odkaz: ${msg} – zobrazen výchozí příklad.`
          : `Síť z odkazu nešla použít: ${msg} – zobrazen výchozí příklad.`,
      );
    }
  } else init = def(null);
  const inText = p.get("in");
  if (inText !== null) {
    const b = parseBitsParam(init.circuit, inText, init.bits);
    init = { ...init, bits: b.bits, problem: init.problem ?? b.problem };
  }
  const xy = p.get("xy");
  if (xy !== null) {
    const placed = applyPositions(init.circuit, xy);
    if (placed) init = { ...init, circuit: placed };
    else
      init = {
        ...init,
        problem:
          init.problem ??
          "Polohy vrcholů z odkazu (xy=) k síti nesedí – síť je rozvržená jako bez nich.",
      };
  }
  return init;
}

/**
 * Parametry odkazu pro aktuální síť a vstupy (výchozí příklad = prázdná adresa). Polohy vrcholů (xy=)
 * jen tehdy, když by je odkaz bez nich rozvrhl jinak (ručně posunutá či nakreslená síť).
 */
export function gatesParams(
  circuit: Circuit,
  net: NetRef | undefined,
  layoutFrom: string | undefined,
  bits: Readonly<Record<string, Bit>>,
): Record<string, string> {
  const out = structureParams(circuit, net, layoutFrom, bits);
  const xy = encodePositions(circuit);
  const base = gatesFromParams(new URLSearchParams(out));
  if (encodePositions(base.circuit) === xy) return out;
  return { ...(Object.keys(out).length ? out : { net: DEFAULT_NET }), xy };
}

/** odkaz bez poloh: síť (net / c + p) a vstupy */
function structureParams(
  circuit: Circuit,
  net: NetRef | undefined,
  layoutFrom: string | undefined,
  bits: Readonly<Record<string, Bit>>,
): Record<string, string> {
  const inText = bitsText(circuit, bits);
  if (net) {
    let built: Circuit | null;
    try {
      built = buildNet(net);
    } catch {
      built = null;
    }
    if (built && structureKey(built) === structureKey(circuit)) {
      if (
        net.id === DEFAULT_NET &&
        net.n === undefined &&
        inText === bitsText(built, defaultBits(built, net))
      )
        return {};
      return {
        net: net.id,
        ...(net.n !== undefined ? { n: String(net.n) } : {}),
        ...(inText ? { in: inText } : {}),
      };
    }
  }
  return {
    c: oneLine(circuitText(circuit)),
    ...(layoutFrom ? { p: layoutFrom } : {}),
    ...(inText ? { in: inText } : {}),
  };
}

/** „hloubka 5 vrstev (S₀…S₄) · velikost 5 hradel“ – počítá se živě i u neúplné sítě. */
export function summaryText(c: Circuit): string {
  if (!c.nodes.length) return "prázdná síť";
  const d = circuitDepth(c);
  const g = gateCount(c);
  return `hloubka ${plural(d, "vrstva", "vrstvy", "vrstev")} (S₀…S${subscript(Math.max(0, d - 1))}) · velikost ${plural(g, "hradlo", "hradla", "hradel")}`;
}

/** název operace nad zprávou */
export function gatesOpTitle(
  c: Circuit,
  bits: Readonly<Record<string, Bit>>,
): string {
  const ins = inputsOf(c);
  if (!ins.length) return "Hradlová síť";
  if (ins.length > 4) return `Výpočet sítě (vstup ${bitsText(c, bits)})`;
  return `Výpočet sítě (${ins.map((n) => `${n.id} = ${bits[n.id] ?? 0}`).join(", ")})`;
}

/** popisek zdroje kresby do nápovědy */
export function captionFor(
  net: NetRef | undefined,
  layoutFrom: string | undefined,
): string | null {
  if (net && net.n !== undefined)
    return net.id === "or-chain"
      ? `Or řetězcem pro n = ${net.n} (obr. 15.2 vlevo, s. 385).`
      : `Or stromem pro n = ${net.n} (obr. 15.2 vpravo, s. 385).`;
  const p = presetById(net?.id ?? layoutFrom);
  if (!p) return null;
  return net ? p.caption : `Upraveno z předlohy: ${p.caption}`;
}

export const GATES_LEGEND: LegendItem[] = [
  { cls: "sw-wire1", label: "vodič s hodnotou 1 (silně)", shape: "line" },
  { cls: "sw-wire0", label: "vodič s hodnotou 0", shape: "line" },
  { cls: "sw-seen", label: "hodnota zatím neznámá", shape: "line-dashed" },
  { cls: "sw-compare", label: "vrstva S_t – vrcholy počítané v tomto taktu" },
  { cls: "sw-new", label: "výstup sítě – výsledek", shape: "ring" },
];
