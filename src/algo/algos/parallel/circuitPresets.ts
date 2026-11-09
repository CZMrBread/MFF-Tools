/**
 * Hradlové sítě z kapitoly 15 Průvodce (testy v circuit.test.ts a circuitLayout.test.ts proti
 * circuitBook.fixtures.ts): majorita (obr. 15.1, kresba podle knihy), n-bitový or řetězcem a stromem
 * (obr. 15.2, obě kresby jako v knize), xor ze čtyř nand (cv. 15.1.4), školní sčítačka ze hradel
 * (k obr. 15.3), náhodná síť.
 */
import { rng } from "../../core/steps";
import { autoLayout } from "../../views/circuitLayout";
import {
  GATE_FNS,
  type Bit,
  type CNode,
  type Circuit,
  type GateFn,
} from "./circuit";

const inp = (id: string, x = 0, y = 0, bus?: number): CNode => ({
  id,
  kind: "in",
  inputs: [],
  x,
  y,
  ...(bus !== undefined ? { bus } : {}),
});
const gate = (
  id: string,
  fn: GateFn,
  inputs: string[],
  x = 0,
  y = 0,
): CNode => ({ id, kind: "gate", fn, inputs, x, y });
const out = (id: string, src: string, x = 0, y = 0): CNode => ({
  id,
  kind: "out",
  inputs: [src],
  x,
  y,
});

/**
 * Obr. 15.1 (s. 382). Kresba: rozpětí vstup → q = 384 jednotek, středy A1 → A3 = 160 (poměr 2,40);
 * x a z leží přesně na úrovni dolního / horního portu A1 / A3, sběrnice z y vede v 0,094 šířky,
 * odbočky z x a z v 0,164 (doplněk kritika 10.2).
 */
export function majority(): Circuit {
  const U = 384;
  return {
    flow: "right",
    nodes: [
      inp("x", 0, 12, Math.round(0.164 * U)),
      inp("y", 0, 80, Math.round(0.094 * U)),
      inp("z", 0, 148, Math.round(0.164 * U)),
      gate("A1", "and", ["y", "x"], 106, 0),
      gate("A2", "and", ["x", "z"], 106, 80),
      gate("A3", "and", ["z", "y"], 106, 160),
      gate("O1", "or", ["A1", "A2"], 212, 40),
      gate("O2", "or", ["O1", "A3"], 318, 120),
      out("q", "O2", U, 120),
    ],
  };
}

/** Obr. 15.2 vlevo (s. 385): ∨(x₁, x₂) → ∨(·, x₃) → … → y; hradla pod sebou, xᵢ přichází zleva. */
export function orChain(n: number): Circuit {
  if (n < 2) throw new Error("or řetězcem potřebuje aspoň 2 vstupy");
  const ROW = 90;
  const nodes: CNode[] = [inp("x1", 0, -12), inp("x2", 0, 12)];
  for (let k = 3; k <= n; k++) nodes.push(inp(`x${k}`, 0, (k - 2) * ROW + 12));
  for (let i = 1; i < n; i++)
    nodes.push(
      gate(
        `O${i}`,
        "or",
        [i === 1 ? "x1" : `O${i - 1}`, `x${i + 1}`],
        100,
        (i - 1) * ROW,
      ),
    );
  nodes.push(out("y", `O${n - 1}`, 190, (n - 2) * ROW));
  return { flow: "right", nodes };
}

/** Obr. 15.2 vpravo (s. 385): dvojice vstupů → or, výsledky opět do dvojic …; tok shora dolů. */
export function orTree(n: number): Circuit {
  const k = Math.log2(n);
  if (!Number.isInteger(k) || n < 2)
    throw new Error(
      "or stromem: počet vstupů musí být mocnina dvou (2, 4, 8, 16)",
    );
  const PAIR = 76;
  const LEVEL = 76;
  const nodes: CNode[] = [];
  for (let i = 0; i < n; i++)
    nodes.push(
      inp(`x${i + 1}`, Math.floor(i / 2) * PAIR + (i % 2 ? 12 : -12), 0),
    );
  let prev = nodes.map((m) => m.id);
  let centers = Array.from({ length: n / 2 }, (_, i) => i * PAIR);
  let g = 0;
  for (let depth = 1; ; depth++) {
    const ids = centers.map((v, i) => {
      const id = `O${++g}`;
      nodes.push(
        gate(id, "or", [prev[2 * i], prev[2 * i + 1]], v, depth * LEVEL),
      );
      return id;
    });
    if (ids.length === 1) {
      nodes.push(out("y", ids[0], centers[0], depth * LEVEL + 66));
      break;
    }
    centers = centers
      .filter((_, i) => i % 2 === 0)
      .map((v, i) => (v + centers[2 * i + 1]) / 2);
    prev = ids;
  }
  return { flow: "down", nodes };
}

/** Cv. 15.1.4 (s. 385): xor dvou bitů ze čtyř hradel nand. */
export function xorFromNand(): Circuit {
  return autoLayout({
    flow: "right",
    nodes: [
      inp("x"),
      inp("y"),
      gate("NA1", "nand", ["x", "y"]),
      gate("NA2", "nand", ["x", "NA1"]),
      gate("NA3", "nand", ["NA1", "y"]),
      gate("NA4", "nand", ["NA2", "NA3"]),
      out("q", "NA4"),
    ],
  });
}

/**
 * Školní sčítačka (s. 386–387, obr. 15.3) rozepsaná na hradla: zᵢ = xᵢ ⊕ yᵢ ⊕ cᵢ,
 * cᵢ₊₁ = (xᵢ ∧ yᵢ) ∨ ((xᵢ ⊕ yᵢ) ∧ cᵢ) (= majorita), c₀ = 0, zₙ = cₙ.
 */
export function rippleAdder(n: number): Circuit {
  const nodes: CNode[] = [];
  for (let i = 0; i < n; i++) nodes.push(inp(`x${i}`), inp(`y${i}`));
  const zs: [string, string][] = [];
  nodes.push(gate("S0", "xor", ["x0", "y0"]), gate("C1", "and", ["x0", "y0"]));
  zs.push(["z0", "S0"]);
  for (let i = 1; i < n; i++) {
    nodes.push(
      gate(`T${i}`, "xor", [`x${i}`, `y${i}`]),
      gate(`S${i}`, "xor", [`T${i}`, `C${i}`]),
      gate(`G${i}`, "and", [`x${i}`, `y${i}`]),
      gate(`P${i}`, "and", [`T${i}`, `C${i}`]),
      gate(`C${i + 1}`, "or", [`G${i}`, `P${i}`]),
    );
    zs.push([`z${i}`, `S${i}`]);
  }
  zs.push([`z${n}`, `C${n}`]);
  for (const [z, s] of zs) nodes.push(out(z, s));
  return autoLayout({ flow: "right", nodes });
}

/**
 * Náhodná platná síť: `nIn` vstupů, `nGates` hradel (každé bere vstupy z dřívějších vrcholů, nejdřív
 * z dosud nepoužitých), výstupy = hradla, ze kterých nic nevede. Deterministická podle `seed`.
 */
export function randomCircuit(
  nIn: number,
  nGates: number,
  seed: number,
): Circuit {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const names =
    nIn <= 4
      ? ["x", "y", "z", "w"].slice(0, nIn)
      : Array.from({ length: nIn }, (_, i) => `x${i + 1}`);
  const nodes: CNode[] = names.map((id) => inp(id));
  const unused = new Set(names);
  const avail = [...names];
  for (let i = 1; i <= nGates; i++) {
    const fn: GateFn =
      r() < 0.12 ? "not" : pick(GATE_FNS.filter((f) => f !== "not"));
    const ar = fn === "not" ? 1 : 2;
    const ins: string[] = [];
    for (let j = 0; j < ar; j++) {
      const pool = [...unused].filter((s) => !ins.includes(s));
      const choices = avail.filter((s) => !ins.includes(s));
      const s = pool.length
        ? pick(pool)
        : pick(choices.length ? choices : avail);
      ins.push(s);
      unused.delete(s);
    }
    const id = `G${i}`;
    nodes.push(gate(id, fn, ins));
    avail.push(id);
    unused.add(id);
  }
  const used = new Set(nodes.flatMap((n) => n.inputs));
  const sinks = nodes.filter((n) => n.kind === "gate" && !used.has(n.id));
  sinks.forEach((g, i) =>
    nodes.push(out(sinks.length === 1 ? "q" : `q${i + 1}`, g.id)),
  );
  return autoLayout({ flow: "right", nodes });
}

/** semínko pro Vytvořit ▸ Náhodně (každé spuštění jiná síť) */
export const randomSeed = () =>
  (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;

export interface CircuitPreset {
  id: string;
  /** text v nabídce „Příklady z knihy“ */
  label: string;
  /** tištěná strana Průvodce */
  page: number;
  /** popis zdroje do nápovědy */
  caption: string;
  build: () => Circuit;
  /** výchozí vstupy (v pořadí vstupů) */
  bits: Bit[];
}

export const BOOK_PRESETS: readonly CircuitPreset[] = [
  {
    id: "maj",
    label: "Obr. 15.1 Majorita ze tří vstupů",
    page: 382,
    caption:
      "Obr. 15.1 Průvodce (s. 382): hradlová síť pro majoritu ze tří vstupů.",
    build: majority,
    bits: [1, 0, 1],
  },
  {
    id: "or-chain",
    label: "Obr. 15.2 vlevo: or řetězcem (n = 4)",
    page: 385,
    caption: "Obr. 15.2 vlevo (s. 385): n-bitový or řetězcem – Θ(n) vrstev.",
    build: () => orChain(4),
    bits: [0, 0, 1, 0],
  },
  {
    id: "or-tree",
    label: "Obr. 15.2 vpravo: or stromem (n = 8)",
    page: 385,
    caption:
      "Obr. 15.2 vpravo (s. 385): n-bitový or stromem – Θ(log n) vrstev, n − 1 hradel.",
    build: () => orTree(8),
    bits: [0, 0, 0, 0, 0, 1, 0, 0],
  },
  {
    id: "xor-nand",
    label: "Cv. 15.1.4 xor ze čtyř nand",
    page: 385,
    caption: "Cvičení 15.1.4 (s. 385): xor dvou bitů ze čtyř hradel nand.",
    build: xorFromNand,
    bits: [1, 0],
  },
  {
    id: "adder",
    label: "Školní sčítačka ze hradel (k obr. 15.3, n = 2)",
    page: 387,
    caption:
      "Školní sčítání (s. 386–387, obr. 15.3) rozepsané na hradla: zᵢ = xᵢ ⊕ yᵢ ⊕ cᵢ, přenos = majorita; vstupy x₀ y₀ x₁ y₁.",
    build: () => rippleAdder(2),
    bits: [1, 0, 1, 1],
  },
];

export const presetById = (id: string | null | undefined) =>
  BOOK_PRESETS.find((p) => p.id === id);
