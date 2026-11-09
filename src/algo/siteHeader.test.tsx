// @vitest-environment jsdom
// Lepící prvky algo (menu, horní lišta, pseudokód) se řídí výškou hlavičky webu,
// kterou stránka zapisuje do proměnné --site-header-h (schovaná hlavička = 0).
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { siteHeaderOffset, useSiteHeaderOffset } from "./siteHeader";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.documentElement.style.removeProperty("--site-header-h");
});

describe("siteHeaderOffset", () => {
  it("viditelná hlavička = její výška, schovaná = 0", () => {
    expect(siteHeaderOffset(64, false)).toBe(64);
    expect(siteHeaderOffset(64, true)).toBe(0);
    expect(siteHeaderOffset(0, false)).toBe(0);
  });
});

function Probe() {
  useSiteHeaderOffset();
  return null;
}

function addHeader(height: number): HTMLElement {
  const header = document.createElement("header");
  header.className = "site-header";
  Object.defineProperty(header, "offsetHeight", {
    configurable: true,
    get: () => height,
  });
  document.body.append(header);
  return header;
}

const value = () =>
  document.documentElement.style.getPropertyValue("--site-header-h");

describe("useSiteHeaderOffset", () => {
  it("zapíše výšku hlavičky a při schování ji vynuluje", async () => {
    const header = addHeader(72);
    render(<Probe />);
    expect(value()).toBe("72px");

    await act(async () => {
      header.classList.add("site-header--hidden");
      await Promise.resolve();
    });
    expect(value()).toBe("0px");

    await act(async () => {
      header.classList.remove("site-header--hidden");
      await Promise.resolve();
    });
    expect(value()).toBe("72px");
  });

  it("po odchodu ze stránky proměnnou odstraní; bez hlavičky nic nepadá", () => {
    addHeader(50);
    const { unmount } = render(<Probe />);
    expect(value()).toBe("50px");
    unmount();
    expect(value()).toBe("");

    document.body.innerHTML = "";
    expect(() => render(<Probe />)).not.toThrow();
    expect(value()).toBe("");
  });
});

describe("useSiteHeaderOffset – místo, které hlavička zabírá v toku stránky", () => {
  const space = () =>
    document.documentElement.style.getPropertyValue("--algo-site-header-space");
  afterEach(() =>
    document.documentElement.style.removeProperty("--algo-site-header-space"),
  );

  it("--algo-site-header-space je výška hlavičky i když je schovaná (kostra modulu pak při schování neroste)", async () => {
    const header = addHeader(60);
    const { unmount } = render(<Probe />);
    expect(space()).toBe("60px");
    await act(async () => {
      header.classList.add("site-header--hidden");
      await Promise.resolve();
    });
    expect(value()).toBe("0px");
    expect(space()).toBe("60px");
    unmount();
    expect(space()).toBe("");
  });
});
