import { describe, expect, it } from "vitest";
import {
  DEFAULT_DELAY,
  initialPlayerState,
  playerReducer,
  readStoredDelay,
  SPEED_KEY,
  SPEEDS,
  speedIndex,
  stepDelay,
  storeDelay,
  syncPlayer,
  trackPlayer,
  type PlayerAction,
  type PlayerState,
} from "./player";
import { rng } from "./steps";

const S = (index: number, playing = false): PlayerState => ({ index, playing });

describe("playerReducer", () => {
  it("play na konci začne znovu od začátku, při ≤ 1 kroku nic nespustí", () => {
    expect(playerReducer(S(4), { type: "play" }, 5)).toEqual(S(0, true));
    expect(playerReducer(S(2), { type: "play" }, 5)).toEqual(S(2, true));
    expect(playerReducer(S(0), { type: "play" }, 1)).toEqual(S(0, false));
    expect(playerReducer(S(0), { type: "play" }, 0)).toEqual(S(0, false));
  });
  it("tick posune o krok a na posledním kroku přehrávání zastaví", () => {
    expect(playerReducer(S(2, true), { type: "tick" }, 5)).toEqual(S(3, true));
    expect(playerReducer(S(3, true), { type: "tick" }, 5)).toEqual(S(4, false));
    expect(playerReducer(S(3, false), { type: "tick" }, 5)).toEqual(
      S(3, false),
    );
  });
  it("ruční krokování přehrávání zastaví a drží index v rozsahu", () => {
    expect(playerReducer(S(2, true), { type: "next" }, 5)).toEqual(S(3, false));
    expect(playerReducer(S(4), { type: "next" }, 5)).toEqual(S(4, false));
    expect(playerReducer(S(0), { type: "prev" }, 5)).toEqual(S(0, false));
    expect(playerReducer(S(2), { type: "last" }, 5)).toEqual(S(4, false));
    expect(playerReducer(S(2), { type: "first" }, 5)).toEqual(S(0, false));
    expect(playerReducer(S(2), { type: "seek", index: 99 }, 5)).toEqual(
      S(4, false),
    );
    expect(playerReducer(S(2), { type: "seek", index: NaN }, 5)).toEqual(
      S(0, false),
    );
  });
  it("toggle střídá přehrávání a pauzu", () => {
    expect(playerReducer(S(1), { type: "toggle" }, 5)).toEqual(S(1, true));
    expect(playerReducer(S(1, true), { type: "toggle" }, 5)).toEqual(
      S(1, false),
    );
  });
  it("beze změny vrací tentýž objekt (React pak nepřekresluje)", () => {
    const st = S(0);
    expect(playerReducer(st, { type: "prev" }, 5)).toBe(st);
    expect(playerReducer(st, { type: "pause" }, 5)).toBe(st);
  });
  it("náhodné posloupnosti akcí: index vždy v rozsahu, přehrává jen když je kam pokračovat", () => {
    const r = rng(99);
    const actions: PlayerAction["type"][] = [
      "play",
      "pause",
      "toggle",
      "next",
      "prev",
      "first",
      "last",
      "tick",
      "tick",
      "tick",
    ];
    for (let t = 0; t < 30; t++) {
      const n = Math.floor(r() * 8);
      let st = initialPlayerState();
      for (let k = 0; k < 60; k++) {
        const type = actions[Math.floor(r() * actions.length)];
        const action = (
          type === "tick" && r() < 0.1
            ? { type: "seek", index: Math.floor(r() * 12) - 2 }
            : { type }
        ) as PlayerAction;
        st = playerReducer(st, action, n);
        expect(st.index).toBeGreaterThanOrEqual(0);
        expect(st.index).toBeLessThanOrEqual(Math.max(0, n - 1));
        if (st.playing) expect(st.index).toBeLessThan(n - 1);
      }
    }
  });
});

describe("syncPlayer – nová sada kroků", () => {
  const A = [1, 2, 3, 4, 5];
  const B = [1, 2, 3];

  it("nová sada kroků → index 0 hned (žádný stav se starým indexem), přehrávání stojí", () => {
    const prev = { ...trackPlayer(A), index: 4, playing: true };
    const next = syncPlayer(prev, B);
    expect(next.steps).toBe(B);
    expect(next.index).toBe(0);
    expect(next.playing).toBe(false);
  });
  it("stejná sada kroků → beze změny", () => {
    const prev = trackPlayer(A);
    expect(syncPlayer(prev, A)).toBe(prev);
  });
  it("nová sada kroků přehrávání nikdy sama nespustí – ani po nové operaci (vlastník 6. 11. 2026)", () => {
    const prev = { ...trackPlayer(A), index: 2 };
    const next = syncPlayer(prev, B);
    expect(next.playing).toBe(false);
    expect(next.index).toBe(0);
  });
  it("počáteční stav stojí na kroku 0, ▶ teprve spustí", () => {
    const st = initialPlayerState();
    expect(st).toEqual({ index: 0, playing: false });
    expect(playerReducer(st, { type: "play" }, 5).playing).toBe(true);
  });
});

describe("rychlost", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      m,
    };
  };
  it("pamatuje si jen hodnoty ze SPEEDS", () => {
    const st = memory();
    expect(readStoredDelay(DEFAULT_DELAY, st)).toBe(DEFAULT_DELAY);
    storeDelay(250, st);
    expect(st.m.get(SPEED_KEY)).toBe("250");
    expect(readStoredDelay(DEFAULT_DELAY, st)).toBe(250);
    st.setItem(SPEED_KEY, "123");
    expect(readStoredDelay(700, st)).toBe(700);
  });
  it("výjimka z localStorage (zakázané úložiště) se spolkne", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(readStoredDelay(500, broken)).toBe(500);
    expect(() => storeDelay(250, broken)).not.toThrow();
    expect(readStoredDelay(500, null)).toBe(500);
  });
  it("speedIndex najde nejbližší rychlost", () => {
    expect(SPEEDS[speedIndex(500)].ms).toBe(500);
    expect(SPEEDS[speedIndex(260)].ms).toBe(250);
    expect(SPEEDS[speedIndex(99999)].ms).toBe(2000);
  });
});

describe("stepDelay – klávesy − / +", () => {
  it("+ zrychlí na další rychlost, − zpomalí, na krajích zůstane", () => {
    expect(stepDelay(500, 1)).toBe(250);
    expect(stepDelay(500, -1)).toBe(1000);
    expect(stepDelay(SPEEDS[SPEEDS.length - 1].ms, 1)).toBe(
      SPEEDS[SPEEDS.length - 1].ms,
    );
    expect(stepDelay(SPEEDS[0].ms, -1)).toBe(SPEEDS[0].ms);
  });
  it("prodleva mimo SPEEDS se nejdřív přichytí k nejbližší", () => {
    expect(stepDelay(260, 1)).toBe(120);
    expect(stepDelay(260, -1)).toBe(500);
  });
});
