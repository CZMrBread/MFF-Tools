import { describe, expect, it } from "vitest";
import {
  SA_BASE_H,
  SA_CLAMP_MIN,
  saAtMin,
  saClamp,
  saFitLimits,
  saKeepRowsVisible,
  SA_ZOOM_MAX,
  SA_ZOOM_MIN,
  saWidthCap,
  saZoom,
  saZoomLimits,
} from "./suffixView";

describe("zvětšení tabulky sufixového pole na velkém plátně (E6: ≥ 55 % výšky při 1920 × 1080)", () => {
  it("roste nad dřívějších 1,8× (tabulka zabírala jen polovinu plátna), nejvýš SA_ZOOM_MAX, nejméně SA_ZOOM_MIN", () => {
    expect(SA_ZOOM_MAX).toBeGreaterThanOrEqual(2.2);
    expect(saZoom(0)).toBe(1);
    expect(saZoom(SA_BASE_H)).toBe(2);
    expect(saZoom(1e6)).toBe(SA_ZOOM_MAX);
    expect(saZoom(-1e6)).toBe(SA_ZOOM_MIN);
    expect(saZoomLimits()).toEqual({
      shrink: Math.round(SA_BASE_H * (1 - SA_ZOOM_MIN)),
      grow: Math.round(SA_BASE_H * (SA_ZOOM_MAX - 1)),
    });
  });

  it("šířka plátna zvětšení omezí: tabulka s víc sloupci (kola zdvojování, LCP) se nezačne posouvat do strany", () => {
    expect(saZoom(1e6, 1.5)).toBe(1.5);
    // pod 1 šířka nezmenšuje (užší plátno řeší posouvání tabulky)
    expect(saZoom(1e6, 0.5)).toBe(1);
    expect(saZoom(0, 0.5)).toBe(1);
  });

  it("saWidthCap: dostupná šířka / šířka tabulky při 1 : 1; bez měření (0, NaN) bez omezení", () => {
    // tabulka 600 px při zvětšení 2 → při 1 : 1 má 300 px, obal 900 px → nejvýš 3×
    expect(saWidthCap(900, 600, 2)).toBe(3);
    expect(saWidthCap(0, 600, 2)).toBe(Infinity);
    expect(saWidthCap(900, 0, 1)).toBe(Infinity);
    expect(saWidthCap(NaN, 600, 1)).toBe(Infinity);
  });
});

describe("delta CanvasFit → zvětšení podle skutečné výšky tabulky (integrace dávky 2)", () => {
  it("delta v px odpovídá změně výšky tabulky: base = výška tabulky při 1 : 1 (delší α má víc řádků)", () => {
    // tabulka „mississippi“ má při 1 : 1 např. 400 px: o 100 px menší obsah = zvětšení 0,75
    expect(saZoom(-100, Infinity, 400)).toBeCloseTo(0.75);
    expect(saZoom(400, Infinity, 400)).toBe(2);
    expect(saZoomLimits(400)).toEqual({
      shrink: Math.round(400 * (1 - SA_ZOOM_MIN)),
      grow: Math.round(400 * (SA_ZOOM_MAX - 1)),
    });
  });

  it("dlouhé α se při 1280 × 720 smí zmenšit pod 0,9× (dřív vnitřní posuvník plátna), ale ne pod 0,7×", () => {
    expect(SA_ZOOM_MIN).toBeLessThanOrEqual(0.8);
    expect(SA_ZOOM_MIN).toBeGreaterThanOrEqual(0.7);
    expect(saZoom(-1e6, Infinity, 400)).toBe(SA_ZOOM_MIN);
  });

  it("bez změřené výšky (0, NaN) platí výchozí SA_BASE_H", () => {
    expect(saZoom(SA_BASE_H, Infinity, 0)).toBe(2);
    expect(saZoom(SA_BASE_H, Infinity, NaN)).toBe(2);
    expect(saZoomLimits(0)).toEqual(saZoomLimits());
  });
});

describe("dlouhé α na malém plátně (1280 × 720, rozbalený popis): tabulka se posouvá uvnitř, plátno nepřeteče", () => {
  it("saClamp: dokud se tabulka vejde (i se zaokrouhlením), žádné omezení", () => {
    expect(saClamp(null, { atMin: true, natural: 300, avail: 300 })).toBeNull();
    expect(saClamp(null, { atMin: true, natural: 301, avail: 300 })).toBeNull();
    expect(saClamp(180, { atMin: true, natural: 250, avail: 260 })).toBeNull();
  });

  it("saClamp: nejdřív se zmenšuje písmo (CanvasFit), omezí se až na nejmenším zvětšení", () => {
    expect(
      saClamp(null, { atMin: false, natural: 500, avail: 300 }),
    ).toBeNull();
    expect(saClamp(null, { atMin: true, natural: 500, avail: 300.6 })).toBe(
      300,
    );
  });

  it("saClamp: omezená tabulka sleduje volnou výšku, drobné změny (≤ 2 px) ignoruje; nejméně SA_CLAMP_MIN", () => {
    expect(saClamp(300, { atMin: true, natural: 500, avail: 301.5 })).toBe(300);
    expect(saClamp(300, { atMin: true, natural: 500, avail: 340 })).toBe(340);
    expect(saClamp(300, { atMin: true, natural: 500, avail: 10 })).toBe(
      SA_CLAMP_MIN,
    );
    // omezená tabulka zůstane omezená, i když by zvětšení samo o sobě nebylo na minimu (delta je přišpendlená)
    expect(saClamp(300, { atMin: false, natural: 500, avail: 300 })).toBe(300);
  });

  it("saAtMin: nejmenší zvětšení podle meze CanvasFit (zaokrouhlená mez dá např. 0,701×, i to je minimum)", () => {
    // baseH 398: shrink = round(119,4) = 119 → zvětšení 1 − 119/398 ≈ 0,701
    const { shrink } = saZoomLimits(398);
    expect(saZoom(-shrink, Infinity, 398)).toBeGreaterThan(SA_ZOOM_MIN);
    expect(saAtMin(-shrink, 398)).toBe(true);
    expect(saAtMin(-shrink - 5, 398)).toBe(true);
    expect(saAtMin(-shrink + 3, 398)).toBe(false);
    expect(saAtMin(0, 0)).toBe(false);
    expect(saAtMin(-1e6, 0)).toBe(true);
  });

  it("saFitLimits: omezená tabulka přišpendlí deltu CanvasFit na nejmenší zvětšení (nezačne zase růst)", () => {
    expect(saFitLimits(400, false)).toEqual(saZoomLimits(400));
    const pinned = saFitLimits(400, true);
    expect(pinned.grow).toBe(-pinned.shrink);
    expect(saZoom(pinned.grow, Infinity, 400)).toBeCloseTo(SA_ZOOM_MIN);
  });

  it("saKeepRowsVisible: zvýrazněné řádky se posunou do záběru pod lepící záhlaví", () => {
    const view = { top: 100, bottom: 300 };
    // řádky už vidět → beze změny
    expect(saKeepRowsVisible(view, [{ top: 150, bottom: 170 }], 40, 20)).toBe(
      40,
    );
    // řádek pod spodním okrajem → posun dolů o přesah
    expect(saKeepRowsVisible(view, [{ top: 310, bottom: 330 }], 40, 20)).toBe(
      70,
    );
    // řádek pod záhlavím → posun nahoru
    expect(saKeepRowsVisible(view, [{ top: 105, bottom: 125 }], 40, 20)).toBe(
      25,
    );
    // dva řádky (Kasai: i a jeho následník) – oba v záběru
    expect(
      saKeepRowsVisible(
        view,
        [
          { top: 260, bottom: 280 },
          { top: 280, bottom: 300 },
          { top: 300, bottom: 320 },
        ],
        0,
        20,
      ),
    ).toBe(20);
    // úsek vyšší než záběr → začátek úseku pod záhlaví
    expect(
      saKeepRowsVisible(
        view,
        [
          { top: 400, bottom: 420 },
          { top: 700, bottom: 720 },
        ],
        0,
        20,
      ),
    ).toBe(280);
    // žádný zvýrazněný řádek → beze změny
    expect(saKeepRowsVisible(view, [], 33, 20)).toBe(33);
  });
});
