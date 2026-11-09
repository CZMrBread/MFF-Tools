// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("App – stránka algo", () => {
  it(
    'data-page="algo" vykreslí pod hlavičkou webu přehled algoritmů',
    { timeout: 20000 },
    async () => {
      window.location.hash = "#/";
      const { container } = render(<App page="algo" />);

      expect(
        await screen.findByRole(
          "heading",
          {
            level: 1,
            name: "Algoritmy a datové struktury",
          },
          { timeout: 15000 },
        ),
      ).toBeTruthy();

      const header = container.querySelector(".site-header");
      const algoRoot = container.querySelector(".algo-root");
      expect(header).not.toBeNull();
      expect(algoRoot).not.toBeNull();
      // hlavička webu je před obsahem algoritmů, ne uvnitř něj
      expect(
        header!.compareDocumentPosition(algoRoot!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(algoRoot!.contains(header)).toBe(false);
      // levá lišta s moduly zůstává
      expect(
        algoRoot!.querySelector('nav[aria-label="Moduly"]'),
      ).not.toBeNull();
      // v hlavičce je odkaz na Algoritmy
      const links = [...header!.querySelectorAll(".main-nav a")].map(
        (a) => a.textContent,
      );
      expect(links.at(-1)).toBe("Algoritmy");
      // lepící prvky algo znají výšku hlavičky webu (v jsdom je 0)
      expect(
        document.documentElement.style.getPropertyValue("--site-header-h"),
      ).toBe("0px");
    },
  );
});
