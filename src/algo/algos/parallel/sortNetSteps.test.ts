/**
 * Kroky simulace třídicí sítě: vstup, jedna vrstva komparátorů za krok (obr. 15.7 – „skutečný průběh“),
 * nebo jeden komparátor za krok (obr. 15.6 – „jak je zapsaná“), závěrečné shrnutí; pseudokód z knihy.
 */
import { describe, expect, it } from "vitest";
import { parseMath } from "../../core/format";
import { materialize } from "../../core/steps";
import { ADDER_PSEUDOCODE } from "./adder";
import { CIRCUIT_PSEUDOCODE } from "./circuit";
import { buildNet, NET_KINDS, validSizes } from "./sortNet";
import {
  netTitle,
  sortNetPseudocode,
  sortNetSteps,
  type SortNetState,
} from "./sortNetSteps";

const T8_INPUT = [5, 2, 7, 1, 8, 3, 6, 4];

function stepsOf(
  kind: Parameters<typeof buildNet>[0],
  input: number[],
  opts: { seq?: boolean; removed?: number[] } = {},
) {
  const net = buildNet(kind, input.length, { seq: opts.seq });
  return materialize(sortNetSteps({ net, input, removed: opts.removed ?? [] }));
}

describe("kroky T₈ (obr. 15.9) na 5, 2, 7, 1, 8, 3, 6, 4", () => {
  const steps = stepsOf("t", T8_INPUT);

  it("vstup + 6 vrstev + shrnutí", () => {
    expect(steps.length).toBe(8);
    expect(steps[0].state.t).toBe(0);
    expect(steps[0].state.layer).toBeNull();
    expect(steps.slice(1, 7).map((s) => s.state.layer)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(steps[7].state.final).toBe(true);
  });

  it("hodnoty na vodičích po vrstvách = trasa z knihy (mezera t vyplněná v kroku t)", () => {
    const last = steps[7].state;
    expect(last.gaps[6]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(steps[4].state.t).toBe(4);
    expect(steps[4].state.gaps[4]).toEqual([1, 2, 4, 3, 7, 5, 6, 8]);
    // budoucí mezery nejsou vyplněné
    expect(steps[4].state.gaps.length).toBe(5);
  });

  it("zpráva vrstvy podle rozpisu: M₄: obrácení + S₈, kdo prohodí a kdo ponechá", () => {
    expect(steps[4].message).toBe(
      "Vrstva 4 (M₄: obrácení + S₈): (0,7) 1|8 ponechá, (1,6) 2|6 ponechá, (2,5) 5|4 prohodí, (3,4) 7|3 prohodí.",
    );
    expect(steps[4].state.active).toEqual([12, 13, 14, 15]);
    expect(steps[4].state.done[14]).toBe("swap");
    expect(steps[4].state.done[12]).toBe("keep");
  });

  it("počítadla a závěr: hloubka 6, komparátorů 24, prohození 13", () => {
    const last = steps[7];
    expect(last.state.swaps).toBe(13);
    expect(last.state.compares).toBe(24);
    expect(last.state.sorted).toBe(true);
    expect(last.message).toBe(
      "Hotovo: výstup y₀ … y₇ = 1, 2, 3, 4, 5, 6, 7, 8 je setříděný. Hloubka 6, komparátorů 24, prohození 13.",
    );
    expect(last.state.vars).toEqual({
      vrstva: "6 / 6",
      porovnání: 24,
      prohození: 13,
    });
  });

  it("řádek proměnných má od kroku 1 stejné položky (výška plátna se mezi kroky nemění)", () => {
    expect(steps[0].state.vars).toEqual({
      vrstva: "0 / 6",
      porovnání: 0,
      prohození: 0,
    });
    for (const s of steps)
      expect(Object.keys(s.state.vars)).toEqual([
        "vrstva",
        "porovnání",
        "prohození",
      ]);
    const seq = stepsOf("bubble", [5, 2, 4, 1, 3], { seq: true });
    for (const s of seq)
      expect(Object.keys(s.state.vars)).toEqual([
        "porovnání",
        "takt",
        "prohození",
      ]);
  });

  it("úvodní zpráva říká síť, hloubku a velikost", () => {
    expect(steps[0].message).toBe(
      "Vstup x₀ … x₇ = 5, 2, 7, 1, 8, 3, 6, 4. Třídička T₈: hloubka 6, komparátorů 24.",
    );
  });

  it("zvýrazněný řádek pseudokódu: slévačka (obrácení) a třídička B₂ₘ", () => {
    const code = sortNetPseudocode("t");
    expect(code[steps[1].line!]).toMatch(/obrátíme/);
    expect(code[steps[3].line!]).toMatch(/B_\{2m\}/);
    expect(code[steps[4].line!]).toMatch(/obrátíme/);
    expect(code[steps[7].line!]).toMatch(/Výstup/);
  });
});

describe("bublinková síť n = 5: skutečný průběh vs. jak je zapsaná", () => {
  const input = [5, 2, 4, 1, 3];

  it("skutečný průběh: 2n − 3 = 7 vrstev, popisky vodičů od 1 jako v obr. 15.7", () => {
    const steps = stepsOf("bubble", input);
    expect(steps.length).toBe(1 + 7 + 1);
    expect(steps[0].message).toMatch(/^Vstup x₁ … x₅ = 5, 2, 4, 1, 3\./);
    // vrstva 3: komparátory z průchodů 1 a 2 počítají současně
    expect(steps[3].message).toMatch(/^Vrstva 3 \(průchody 1 a 2\): \(1,2\)/);
    expect(steps[8].state.sorted).toBe(true);
  });

  it("jak je zapsaná: n(n − 1)/2 = 10 kroků po jednom komparátoru, takt podle obr. 15.7", () => {
    const steps = stepsOf("bubble", input, { seq: true });
    expect(steps.length).toBe(1 + 10 + 1);
    const s7 = steps[7].state; // 7. komparátor = (3,4) ve 2. průchodu, v obr. 15.7 až v 5. vrstvě
    expect(s7.active).toEqual([6]);
    expect(s7.vars).toMatchObject({ porovnání: "7 / 10", takt: 5 });
    expect(steps[7].message).toMatch(/^Porovnání 7 \(průchod 2\): \(3,4\)/);
    // hloubka sítě je i tady skutečná (7 taktů), zapsaných řádků je 10
    expect(steps[0].message).toMatch(
      /hloubka 7, komparátorů 10\. Krokujeme jak je zapsaná \(obr\. 15\.6\): po jednom komparátoru\./,
    );
    expect(steps[11].message).toMatch(/Hloubka 7, komparátorů 10/);
  });
});

describe("separátor S₈ (obr. 15.10, 15.11): hora a údolí", () => {
  it("bitonický vstup 4, 5, 7, 8, 6, 3, 1, 2: zpráva podle důkazu (k = 1)", () => {
    const steps = stepsOf("sep", [4, 5, 7, 8, 6, 3, 1, 2]);
    expect(steps[0].message).toMatch(/Hora \(4 největší\): x₁ … x₄, k = 1\./);
    expect(steps[0].state.mountain).toEqual([
      false,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(steps[1].message).toMatch(
      /komparátor 0 neprohazuje \(vlevo údolí, vpravo hora\), komparátory 1–3 prohazují \(vlevo hora, vpravo údolí\)/,
    );
    expect(steps[2].message).toMatch(
      /levá polovina 4, 3, 1, 2 < pravá 6, 5, 7, 8 a obě jsou bitonické/,
    );
  });

  it("nebitonický vstup: varování, hora se nekreslí", () => {
    const steps = stepsOf("sep", T8_INPUT);
    expect(steps[0].message).toMatch(/Vstup není bitonický/);
    expect(steps[0].state.mountain).toBeNull();
  });

  it("bitonická třídička na nebitonickém vstupu: varování a výstup není setříděný", () => {
    const steps = stepsOf("bitonic", T8_INPUT);
    expect(steps[0].message).toMatch(/B₈ ho setřídit nemusí/);
    const last = steps[steps.length - 1];
    expect(last.state.sorted).toBe(false);
    expect(last.message).toMatch(/není setříděný/);
  });
});

describe("rozbitá síť a 0-1 vstupy", () => {
  it("vynechaný komparátor se nevyhodnotí a zpráva to řekne", () => {
    const steps = stepsOf("t", [1, 0, 1, 0, 1, 0, 1, 0], { removed: [0] });
    expect(steps[0].message).toMatch(/Vynechaný komparátor: 1\./);
    expect(steps[0].message).toMatch(/nul a jedniček/);
    expect(steps[1].state.done[0]).toBeUndefined();
    expect(steps[1].message).toMatch(/\(0,1\) vynechán/);
  });

  it("každá síť a velikost: poslední mezera = výstup sítě, kroky = 1 + hloubka + 1", () => {
    for (const kind of NET_KINDS)
      for (const n of validSizes(kind).filter((n) => [4, 8, 16].includes(n))) {
        const input = Array.from({ length: n }, (_, i) => (i * 7) % n);
        const steps = stepsOf(kind, input);
        const net = buildNet(kind, n);
        expect(steps.length, `${kind} ${n}`).toBe(net.layers.length + 2);
        const last: SortNetState = steps[steps.length - 1].state;
        expect(last.gaps.length).toBe(net.layers.length + 1);
        for (const s of steps) expect(s.line).not.toBeNull();
      }
  });
});

describe("názvy sítí", () => {
  it("podle knihy", () => {
    expect(netTitle("t", 8)).toBe("Třídička T₈");
    expect(netTitle("bitonic", 16)).toBe("Bitonická třídička B₁₆");
    expect(netTitle("sep", 8)).toBe("Separátor S₈");
    expect(netTitle("bubble", 5)).toBe("Bublinková síť (n = 5)");
    expect(netTitle("batcher", 8)).toBe("Batcherovo třídění (n = 8)");
  });
});

describe("pseudokódy paralelních modulů – sazba jako u FFT a textů", () => {
  const all: [string, readonly string[]][] = [
    ...NET_KINDS.map(
      (k) => [`sortnet ${k}`, sortNetPseudocode(k)] as [string, string[]],
    ),
    ...Object.entries(ADDER_PSEUDOCODE).map(
      ([k, l]) => [`adder ${k}`, l] as [string, string[]],
    ),
    ["gates", CIRCUIT_PSEUDOCODE],
  ];
  it("řádky nezačínají knižním číslem a nemají nevysázené ^( ani _(", () => {
    for (const [name, lines] of all)
      for (const line of lines) {
        expect(line, name).not.toMatch(/^\s*\d+\./);
        expect(line, name).not.toMatch(/[\^_]\(/);
        const flat = parseMath(line)
          .filter((n) => typeof n === "string")
          .join("");
        expect(flat, `${name}: ${line}`).not.toMatch(/[\p{L}\p{N})][\^_]/u);
      }
  });
  it("komparátor: menší hodnota odchází na vodič vlevo (ne „menší vstup“)", () => {
    const text = sortNetPseudocode("bubble").join("\n");
    expect(text).not.toMatch(/menší vstup/);
    expect(text).toMatch(/menší hodnota odchází na vodič vlevo/);
  });
});

describe("zprávy sortnet srozumitelně", () => {
  it("rozbitá síť: „síť s vynechaným komparátorem c už netřídí“", () => {
    const steps = stepsOf("t", [1, 0, 1, 0, 1, 0, 1, 0], { removed: [0] });
    const end = steps[steps.length - 1].message;
    expect(end).not.toMatch(/bez vynechaných/);
    expect(end).toMatch(/síť s vynechaným komparátorem 1 už netřídí/);
  });
  it("Batcher n = 8: vrstvy popsané slévanými bloky (dvojice, čtveřice, osmice), ne „BMerge řádu 1“", () => {
    const msgs = stepsOf("batcher", T8_INPUT).map((s) => s.message);
    for (const m of msgs) expect(m).not.toMatch(/BMerge řádu/);
    expect(msgs[1]).toMatch(/slévání prvků do dvojic/);
    expect(msgs[2]).toMatch(/slévání dvojic do čtveřic/);
    expect(msgs[4]).toMatch(/slévání čtveřic do osmic/);
    expect(msgs[4]).not.toMatch(/dvojic do čtveřic/);
  });
});
