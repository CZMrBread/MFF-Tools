import { describe, expect, it } from "vitest";
import { readableHref, readableSearch } from "./linkParams";

describe("readableSearch (E7 – čitelné odkazy)", () => {
  it("čárky a další bezpečné znaky zůstanou nezakódované", () => {
    expect(readableSearch(new URLSearchParams({ a: "4,2,8,1" }))).toBe(
      "?a=4,2,8,1",
    );
    expect(
      readableSearch(new URLSearchParams({ t: "4:mod:1:1,5,9~,3;x/y@z!$*" })),
    ).toBe("?t=4:mod:1:1,5,9~,3;x/y@z!$*");
  });

  it("oddělovače a znaky se zvláštním významem zůstanou zakódované", () => {
    const p = new URLSearchParams({ s: "a&b=c+d#e%f g?h'i" });
    const s = readableSearch(p);
    // jediné & a = jsou oddělovače parametru, mezera jako +
    expect(s).toBe("?s=a%26b%3Dc%2Bd%23e%25f+g%3Fh%27i");
    expect(new URLSearchParams(s).get("s")).toBe("a&b=c+d#e%f g?h'i");
  });

  it("prázdné parametry → prázdný řetězec (bez otazníku)", () => {
    expect(readableSearch(new URLSearchParams())).toBe("");
  });

  it("přijme i objekt / pole dvojic jako URLSearchParams", () => {
    expect(readableSearch({ p: "1,2", q: "x" })).toBe("?p=1,2&q=x");
    expect(
      readableSearch([
        ["a", "1,2"],
        ["a", "3"],
      ]),
    ).toBe("?a=1,2&a=3");
  });

  it("čte se stejně jako stará zakódovaná podoba (staré odkazy beze změny)", () => {
    const old = "?a=1%2C2%2C3&t=4%3Amod%7E";
    const p = new URLSearchParams(old);
    const fresh = readableSearch(p);
    expect(fresh).toBe("?a=1,2,3&t=4:mod~");
    expect([...new URLSearchParams(fresh)]).toEqual([...p]);
  });

  it("písmena s diakritikou zůstanou zakódovaná (odkaz se kopíruje celý)", () => {
    expect(readableSearch({ s: "žluť" })).toBe("?s=%C5%BElu%C5%A5");
  });
});

describe("readableHref (Kopírovat odkaz)", () => {
  it("odkóduje bezpečné znaky jen v dotazu za hashem", () => {
    expect(
      readableHref(
        "https://www.ms.mff.cuni.cz/~smolad/algo/#/sort/quick?a=1%2C2%2C3",
      ),
    ).toBe("https://www.ms.mff.cuni.cz/~smolad/algo/#/sort/quick?a=1,2,3");
  });

  it("cesta a dotaz před hashem zůstanou, jak jsou", () => {
    expect(readableHref("https://x/a%2Cb/?q=1%2C2#/g?x=3%2C4%3A5")).toBe(
      "https://x/a%2Cb/?q=1%2C2#/g?x=3,4:5",
    );
  });

  it("zakódované oddělovače a % zůstanou; bez dotazu beze změny", () => {
    expect(readableHref("https://x/#/s?t=a%26b%3Dc%25d%2C")).toBe(
      "https://x/#/s?t=a%26b%3Dc%25d,",
    );
    expect(readableHref("https://x/#/sort/quick")).toBe(
      "https://x/#/sort/quick",
    );
    expect(readableHref("https://x/")).toBe("https://x/");
  });

  it("malá písmena v kódu (%2c) se odkódují také", () => {
    expect(readableHref("https://x/#/s?a=1%2c2%7e")).toBe(
      "https://x/#/s?a=1,2~",
    );
  });
});
