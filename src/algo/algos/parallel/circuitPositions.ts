/**
 * Polohy vrcholů hradlové sítě v odkazu (`xy=…`, testy v circuitPositions.test.ts). Odkaz `c=` / `net=`
 * nese strukturu, `xy=` jen kresbu – ručně posunutá hradla se v novém okně objeví na stejném místě.
 *
 * Zápis: volitelná předpona `d` (tok shora dolů, bez ní zleva doprava), pak vrcholy oddělené `_`
 * v pořadí vstupy, hradla, výstupy (jako textový zápis c=), každý `x.y` nebo `x.y.sběrnice` – celá
 * čísla, záporná s `-`. Znaky `0-9 . _ - d` URLSearchParams ani encodeURIComponent nekódují.
 * Vadný zápis (jiný počet vrcholů, nečíslo, obří číslo) vrátí null – stránka ho pak tiše ignoruje
 * a síť zůstane rozvržená jako bez `xy=`.
 */
import type { CNode, Circuit, NodeKind } from "./circuit";

/** souřadnice z odkazu jen v tomto rozsahu (kresba má pár set jednotek) */
const LIMIT = 100_000;
const KIND_ORDER: readonly NodeKind[] = ["in", "gate", "out"];
const INT = /^-?\d{1,6}$/;

/** vrcholy v pořadí zápisu: vstupy, hradla, výstupy (uvnitř skupiny v pořadí sítě) */
const ordered = (c: Circuit): CNode[] =>
  KIND_ORDER.flatMap((k) => c.nodes.filter((n) => n.kind === k));

const num = (v: number) => String(Math.round(v) || 0);

/** Polohy (a knižní sběrnice) všech vrcholů jako krátký řetězec pro odkaz. */
export function encodePositions(c: Circuit): string {
  const body = ordered(c)
    .map(
      (n) =>
        `${num(n.x)}.${num(n.y)}` +
        (n.bus !== undefined ? `.${num(n.bus)}` : ""),
    )
    .join("_");
  return (c.flow === "down" ? "d" : "") + body;
}

/**
 * Síť `c` s polohami ze zápisu `text`; struktura (jména, zapojení, pořadí) zůstane. Počet vrcholů musí
 * sedět, jinak (i při jakékoli chybě zápisu) null.
 */
export function applyPositions(c: Circuit, text: string): Circuit | null {
  const down = text.startsWith("d");
  const body = down ? text.slice(1) : text;
  const nodes = ordered(c);
  const parts = body === "" ? [] : body.split("_");
  if (parts.length !== nodes.length) return null;
  const pos = new Map<string, number[]>();
  for (let i = 0; i < parts.length; i++) {
    const nums = parts[i]!.split(".");
    if (nums.length < 2 || nums.length > 3 || !nums.every((s) => INT.test(s)))
      return null;
    const v = nums.map(Number);
    if (v.some((x) => Math.abs(x) > LIMIT)) return null;
    pos.set(nodes[i]!.id, v);
  }
  return {
    ...c,
    flow: down ? "down" : "right",
    nodes: c.nodes.map((n) => {
      const [x, y, bus] = pos.get(n.id)!;
      const m: CNode = { ...n, x: x!, y: y! };
      if (bus === undefined) delete m.bus;
      else m.bus = bus;
      return m;
    }),
  };
}
