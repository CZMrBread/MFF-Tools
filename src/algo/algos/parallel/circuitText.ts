/**
 * Textový zápis hradlové sítě (panel Import / export, odkaz `?c=…`, Vytvořit ▸ Vlastní) – testy
 * v circuitText.test.ts. Jeden příkaz na řádek nebo oddělené středníkem, komentář `#` či `//`:
 *
 *   in x, y, z            vstupy sítě (v tomto pořadí se zadávají bity)
 *   A1 = and(y, x)        hradlo: jméno = funkce(zdroje portů v pořadí argumentů); _ = nezapojený
 *   out q = O2            výstup sítě a jeho zdroj (out q = nezapojený)
 *
 * Funkce: and, or, not, nand, nor, xor (velikost písmen nerozhoduje). Pořadí řádků je libovolné
 * (odkazy dopředu jdou), výsledná síť má vstupy, hradla a výstupy v pořadí zápisu. Polohy vrcholů text
 * nenese – při importu je doplní editor (views/circuitEdit.ts).
 */
import {
  cycleMessage,
  findCycle,
  GATE_FNS,
  GATE_INFO,
  MAX_INPUTS,
  MAX_NODES,
  type CNode,
  type Circuit,
  type GateFn,
} from "./circuit";

export interface CircuitTextIssue {
  /** číslo řádku (od 1), null = celá síť (cyklus, velikost) */
  line: number | null;
  message: string;
}

export interface CircuitParse {
  circuit: Circuit;
  errors: CircuitTextIssue[];
}

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const RESERVED = new Set(["in", "out"]);

/** Text sítě: vstupy, hradla, výstupy v pořadí sítě. */
export function circuitText(c: Circuit): string {
  const lines: string[] = [];
  const ins = c.nodes.filter((n) => n.kind === "in").map((n) => n.id);
  if (ins.length) lines.push(`in ${ins.join(", ")}`);
  for (const n of c.nodes)
    if (n.kind === "gate")
      lines.push(
        `${n.id} = ${n.fn ?? "and"}(${n.inputs.map((s) => s ?? "_").join(", ")})`,
      );
  for (const n of c.nodes)
    if (n.kind === "out")
      lines.push(
        n.inputs[0] == null ? `out ${n.id}` : `out ${n.id} = ${n.inputs[0]}`,
      );
  return lines.join("\n");
}

/** Text sítě na jeden řádek (příkazy oddělené „; “) – pole Vlastní a odkaz. */
export const oneLine = (text: string) =>
  text
    .split(/\n|;/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("; ");

const vstupu = (n: number) =>
  n === 1 ? "vstup" : n >= 2 && n <= 4 ? "vstupy" : "vstupů";
const zadano = (n: number) =>
  n === 1 ? "zadán 1" : n >= 2 && n <= 4 ? `zadány ${n}` : `zadáno ${n}`;

export function parseCircuitText(text: string): CircuitParse {
  const errors: CircuitTextIssue[] = [];
  const ins: CNode[] = [];
  const gates: CNode[] = [];
  const outs: CNode[] = [];
  /** odkud se zdroj bere (řádek) – kontrola po přečtení všeho */
  const refs: { line: number; node: CNode; src: string; what: string }[] = [];
  const names = new Set<string>();
  /** jména z řádků s chybou – odkazy na ně se už podruhé nehlásí */
  const broken = new Set<string>();
  // jednořádkový zápis (odkaz c=, pole Vlastní) hlásí pořadí příkazu, víceřádkový řádek
  const single =
    !text.includes("\n") &&
    text.split(";").filter((p) => p.replace(/(#|\/\/).*$/, "").trim()).length >
      1;
  const err = (line: number, message: string) =>
    errors.push({
      line,
      message: `${single ? "Příkaz" : "Řádek"} ${line}: ${message}`,
    });
  const claim = (line: number, name: string): boolean => {
    if (!NAME.test(name) || RESERVED.has(name.toLowerCase())) {
      err(
        line,
        `„${name}“ není platné jméno (písmeno, pak písmena, číslice nebo _).`,
      );
      return false;
    }
    if (names.has(name)) {
      err(line, `jméno „${name}“ už je použité.`);
      return false;
    }
    names.add(name);
    return true;
  };

  let stmt = 0;
  text.split("\n").forEach((raw, i) => {
    // komentář (# nebo //) platí do konce svého příkazu – v jednořádkovém zápisu „in x # vstup; out q = x“
    // nesmí smazat další příkazy
    for (const part of raw.split(";")) {
      const s = part.replace(/(#|\/\/).*$/, "").trim();
      if (!s) continue;
      stmt += 1;
      const line = single ? stmt : i + 1;
      let m = /^in(?:\s*:\s*|\s+)(.*)$/i.exec(s);
      if (m) {
        for (const name of m[1].split(/[\s,]+/).filter(Boolean))
          if (claim(line, name))
            ins.push({ id: name, kind: "in", inputs: [], x: 0, y: 0 });
        continue;
      }
      m = /^out\s+(\S+?)\s*(?:=\s*(\S+))?$/i.exec(s);
      if (m) {
        if (!claim(line, m[1])) continue;
        const node: CNode = {
          id: m[1],
          kind: "out",
          inputs: [null],
          x: 0,
          y: 0,
        };
        outs.push(node);
        const src = m[2];
        if (src !== undefined && src !== "_") {
          node.inputs[0] = src;
          refs.push({
            line,
            node,
            src,
            what: `zdroj „${src}“ výstupu ${m[1]}`,
          });
        }
        continue;
      }
      m = /^(\S+?)\s*=\s*([A-Za-z]+)\s*\((.*)\)$/.exec(s);
      if (m) {
        const fn = m[2].toLowerCase() as GateFn;
        if (!GATE_FNS.includes(fn)) {
          broken.add(m[1]);
          err(
            line,
            `neznámé hradlo „${m[2]}“ – použijte ${GATE_FNS.join(", ")}.`,
          );
          continue;
        }
        const args =
          m[3].trim() === "" ? [] : m[3].split(",").map((a) => a.trim());
        const ar = GATE_INFO[fn].arity;
        if (args.length !== ar) {
          broken.add(m[1]);
          err(line, `${fn} má ${ar} ${vstupu(ar)}, ${zadano(args.length)}.`);
          continue;
        }
        if (!claim(line, m[1])) continue;
        const node: CNode = {
          id: m[1],
          kind: "gate",
          fn,
          inputs: args.map(() => null),
          x: 0,
          y: 0,
        };
        gates.push(node);
        args.forEach((a, j) => {
          if (a === "_") return;
          node.inputs[j] = a;
          refs.push({
            line,
            node,
            src: a,
            what: `vstup „${a}“ hradla ${m![1]}`,
          });
        });
        continue;
      }
      err(
        line,
        `nerozumím řádku „${s}“ – očekávám „in a, b“, „G = and(a, b)“ nebo „out q = G“.`,
      );
    }
  });

  const kind = new Map<string, CNode["kind"]>();
  for (const n of [...ins, ...gates, ...outs]) kind.set(n.id, n.kind);
  for (const r of refs) {
    const k = kind.get(r.src);
    if (k === undefined && broken.has(r.src)) continue;
    if (k === undefined) err(r.line, `${r.what} neexistuje.`);
    else if (k === "out")
      err(r.line, `„${r.src}“ je výstup sítě – z výstupu nevedou hrany.`);
    if (k === undefined || k === "out") {
      const j = r.node.inputs.indexOf(r.src);
      if (j >= 0) r.node.inputs[j] = null;
    }
  }
  if (ins.length > MAX_INPUTS)
    errors.push({
      line: null,
      message: `Síť má nejvýše ${MAX_INPUTS} vstupů (zadáno ${ins.length}).`,
    });
  const total = ins.length + gates.length + outs.length;
  if (total > MAX_NODES)
    errors.push({
      line: null,
      message: `Síť má nejvýše ${MAX_NODES} vrcholů (zadáno ${total}).`,
    });
  const circuit: Circuit = { nodes: [...ins, ...gates, ...outs] };
  if (!errors.length) {
    const cyc = findCycle(circuit);
    if (cyc) errors.push({ line: null, message: cycleMessage(cyc) });
  }
  // chyby v pořadí řádků (kontrola odkazů běží až po přečtení všeho); bez řádku na konci
  errors.sort((p, q) => (p.line ?? Infinity) - (q.line ?? Infinity));
  return { circuit, errors };
}
