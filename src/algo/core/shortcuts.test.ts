import { describe, expect, it } from "vitest";
import { decideShortcut } from "./shortcuts";

describe("decideShortcut", () => {
  it("na stránce bez fokusu: mezerník, šipky, Home a End ovládají přehrávač a nerolují stránkou", () => {
    expect(decideShortcut({ key: " " }, "none", false)).toEqual({
      action: "toggle",
      prevent: true,
    });
    expect(decideShortcut({ key: "ArrowRight" }, "none", false)).toEqual({
      action: "next",
      prevent: true,
    });
    expect(decideShortcut({ key: "ArrowLeft" }, "none", false)).toEqual({
      action: "prev",
      prevent: true,
    });
    expect(decideShortcut({ key: "Home" }, "none", false)).toEqual({
      action: "first",
      prevent: true,
    });
    expect(decideShortcut({ key: "End" }, "none", false)).toEqual({
      action: "last",
      prevent: true,
    });
  });
  it("s modifikátorem nic (Alt+← = Zpět v prohlížeči, Ctrl+End, Ctrl+mezerník…)", () => {
    for (const mod of [
      { altKey: true },
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
    ])
      for (const key of [" ", "ArrowLeft", "ArrowRight", "Home", "End"])
        expect(decideShortcut({ key, ...mod }, "none", false)).toEqual({
          action: null,
          prevent: false,
        });
  });
  it("v textovém poli a na zaškrtávátku patří klávesy poli", () => {
    for (const key of [" ", "ArrowLeft", "Home"]) {
      expect(decideShortcut({ key }, "text", false).action).toBeNull();
      expect(decideShortcut({ key }, "choice", false).prevent).toBe(false);
    }
  });
  it("na posuvníku: šipky / Home / End nativně, mezerník přehrává", () => {
    expect(decideShortcut({ key: "ArrowRight" }, "range", false)).toEqual({
      action: null,
      prevent: false,
    });
    expect(decideShortcut({ key: "End" }, "range", false)).toEqual({
      action: null,
      prevent: false,
    });
    expect(decideShortcut({ key: " " }, "range", false)).toEqual({
      action: "toggle",
      prevent: true,
    });
  });
  it("mezerník na tlačítku: po Tab ho stiskne, po kliknutí myší přehrává", () => {
    expect(decideShortcut({ key: " " }, "button", true)).toEqual({
      action: null,
      prevent: false,
    });
    expect(decideShortcut({ key: " " }, "button", false)).toEqual({
      action: "toggle",
      prevent: true,
    });
    // šipky na tlačítku nic nedělají nativně → krokují
    expect(decideShortcut({ key: "ArrowRight" }, "button", true).action).toBe(
      "next",
    );
  });
  it("mezerník na tlačítku právě provedené akce přehrává i po klávesnici (Enter ji dál otevře)", () => {
    expect(decideShortcut({ key: " " }, "action-ran", true)).toEqual({
      action: "toggle",
      prevent: true,
    });
    expect(decideShortcut({ key: "Enter" }, "action-ran", true).action).toBe(
      null,
    );
  });
  it("držený mezerník nestřídá přehrát / pauza, ale stránkou nehýbe", () => {
    expect(decideShortcut({ key: " ", repeat: true }, "none", false)).toEqual({
      action: null,
      prevent: true,
    });
  });
  it("ostatní klávesy ignoruje", () => {
    expect(decideShortcut({ key: "a" }, "none", false)).toEqual({
      action: null,
      prevent: false,
    });
    expect(decideShortcut({ key: "Enter" }, "none", false)).toEqual({
      action: null,
      prevent: false,
    });
  });

  it("− / + mění rychlost (i + se Shiftem a = bez něj), ne v textovém poli", () => {
    expect(decideShortcut({ key: "-" }, "none", false)).toEqual({
      action: "slower",
      prevent: true,
    });
    expect(decideShortcut({ key: "+", shiftKey: true }, "none", false)).toEqual(
      { action: "faster", prevent: true },
    );
    expect(decideShortcut({ key: "+" }, "button", true)).toEqual({
      action: "faster",
      prevent: true,
    });
    expect(decideShortcut({ key: "=" }, "range", false).action).toBe("faster");
    // držení klávesy rychlost dál mění
    expect(
      decideShortcut({ key: "-", repeat: true }, "none", false).action,
    ).toBe("slower");
    expect(decideShortcut({ key: "-" }, "text", false).action).toBeNull();
    expect(decideShortcut({ key: "+" }, "choice", false).action).toBeNull();
    expect(decideShortcut({ key: "-", ctrlKey: true }, "none", false)).toEqual({
      action: null,
      prevent: false,
    });
  });
  it("Esc zavře nabídky odkudkoli (i z pole), stránce ho nebere", () => {
    for (const focus of ["none", "text", "choice", "range", "button"] as const)
      expect(decideShortcut({ key: "Escape" }, focus, false)).toEqual({
        action: "escape",
        prevent: false,
      });
    expect(
      decideShortcut({ key: "Escape", ctrlKey: true }, "none", false).action,
    ).toBeNull();
  });
  it("fokus na kresbě (roving tabindex, D3): mezerník vždy přehrávač, šipky / Home / End patří kresbě", () => {
    for (const kb of [true, false]) {
      expect(decideShortcut({ key: " " }, "canvas", kb)).toEqual({
        action: "toggle",
        prevent: true,
      });
      for (const key of [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ])
        expect(decideShortcut({ key }, "canvas", kb)).toEqual({
          action: null,
          prevent: false,
        });
    }
    expect(
      decideShortcut({ key: " ", repeat: true }, "canvas", true).action,
    ).toBeNull();
    expect(decideShortcut({ key: "Escape" }, "canvas", true).action).toBe(
      "escape",
    );
    expect(decideShortcut({ key: "+" }, "canvas", true).action).toBe("faster");
  });
});
