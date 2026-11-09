// @vitest-environment jsdom
/**
 * Smoke test komponenty <MapGraph> nad výsekem skutečných dat každé kombinace
 * rok × obor: graf se vykreslí (i ve StrictMode jen jednou), simulace běží, klik na
 * specializaci a na předmět funguje a po odpojení nezůstane žádná běžící simulace
 * ani časovač D3.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFields, parseLinks, parseNodes, parseYears } from "../lib/data";
import type { StudyLink, StudyNode } from "../lib/types";
import { MapGraph } from "./MapGraph";
import type { FilterRequest } from "./MapGraph";

/**
 * Snímky se nespouštějí samy: `requestAnimationFrame` jen řadí zpětná volání do
 * fronty (nahrazuje se dřív, než se načte D3). Časovač D3 si o další snímek řekne,
 * jen dokud má aktivní časovač – prázdná fronta po odpojení = nic neběží.
 */
const frameQueue = vi.hoisted(() => {
  const queue: FrameRequestCallback[] = [];
  window.requestAnimationFrame = (callback) => queue.push(callback);
  return queue;
});

/** Pustí nejvýš `limit` snímků; vrací, kolik jich proběhlo. */
function runFrames(limit: number): number {
  let count = 0;
  while (count < limit && frameQueue.length > 0) {
    act(() => {
      frameQueue.shift()?.(performance.now());
    });
    count++;
  }
  return count;
}

// jsdom neumí měřit text (zalamování popisků specializací).
Object.defineProperty(SVGElement.prototype, "getComputedTextLength", {
  configurable: true,
  value(this: SVGElement) {
    return (this.textContent ?? "").length * 7;
  },
});

const dataDir = resolve(import.meta.dirname, "../../data");
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(dataDir, path), "utf8"));
}

/**
 * Výsek dat: všechny specializace, prvních 40 předmětů a hrany mezi nimi (plus uzly
 * program_req, které graf musí přeskočit).
 */
function slice(year: string, field: string) {
  const nodes = parseNodes(readJson(`${year}/${field}/nodes.json`));
  const links = parseLinks(readJson(`${year}/${field}/links.json`));
  const specs = nodes.filter((node) => node.group === "spec");
  const subjects = nodes.filter((node) => node.group === "subj").slice(0, 40);
  const requirements = nodes.filter((node) => node.group === "program_req");
  const subjectIds = new Set(subjects.map((subject) => subject.id));
  const sliceLinks: StudyLink[] = links.filter((link) =>
    subjectIds.has(link.source),
  );
  const sliceNodes: StudyNode[] = [...specs, ...subjects, ...requirements];
  return { nodes: sliceNodes, links: sliceLinks, specs, subjects };
}

const combinations = parseYears(readJson("years.json")).flatMap((year) =>
  parseFields(readJson(`${year}/fields.json`)).map((field) => ({
    year,
    field,
    label: `${year}/${field}`,
  })),
);

afterEach(() => {
  cleanup();
  frameQueue.length = 0;
});

describe("MapGraph", () => {
  it("pokrývá všechny roky a obory", () => {
    expect(combinations).toHaveLength(6);
  });

  describe.each(combinations)("$label", ({ year, field }) => {
    it("vykreslí uzly a hrany, reaguje na kliky a po odpojení nic neběží", () => {
      const { nodes, links, specs, subjects } = slice(year, field);
      const filter: FilterRequest = { value: "all" };
      const { container, unmount } = render(
        <StrictMode>
          <MapGraph data={{ nodes, links }} filter={filter} />
        </StrictMode>,
      );

      // StrictMode spouští efekty dvakrát – graf musí být v <svg> jen jednou.
      const svg = container.querySelector("svg");
      if (!svg) throw new Error("chybí <svg>");
      expect(svg.querySelectorAll(":scope > g.zoom-layer")).toHaveLength(1);
      expect(svg.querySelectorAll("g.node-spec")).toHaveLength(specs.length);
      expect(svg.querySelectorAll("g.node-subj")).toHaveLength(subjects.length);
      expect(svg.querySelectorAll("line.link")).toHaveLength(links.length);
      expect(links.length).toBeGreaterThan(0);
      // Uzly program_req se nevykreslují.
      expect(svg.querySelectorAll("g.node")).toHaveLength(
        specs.length + subjects.length,
      );

      // Simulace běží: po pár snímcích mají uzly polohu.
      expect(runFrames(5)).toBe(5);
      const firstSpec = specs[0];
      const firstSubject = subjects[0];
      if (!firstSpec || !firstSubject) throw new Error("chybí data");
      const specElement = svg.querySelector(`#node-${firstSpec.id}`);
      const subjectElement = svg.querySelector(`#node-${firstSubject.id}`);
      if (!specElement || !subjectElement) throw new Error("chybí uzel");
      expect(subjectElement.getAttribute("transform")).toMatch(/^translate\(/);

      // Klik na specializaci ji vybere, další klik zruší.
      fireEvent.click(specElement);
      expect(specElement.classList).toContain("selected");
      fireEvent.click(specElement);
      expect(specElement.classList).not.toContain("selected");

      // Klik na předmět otevře popover; tlačítko v něm zvýrazní specializace.
      fireEvent.click(subjectElement);
      const popover = document.body.querySelector('[role="tooltip"]');
      expect(popover?.querySelector("h3")?.textContent?.trim()).toBe(
        firstSubject.id,
      );
      const specsButton = Array.from(
        popover?.querySelectorAll("button") ?? [],
      ).find((button) => button.textContent === "Zobrazit specializace");
      if (!specsButton) throw new Error("chybí tlačítko Zobrazit specializace");
      fireEvent.click(specsButton);
      expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
      expect(subjectElement.classList).toContain("subj-source");
      expect(
        svg.querySelectorAll("g.node-spec.subj-emphasized-and").length,
      ).toBe(firstSubject.shared_count);

      // Po odpojení: <svg> je pryč a časovač D3 po posledním snímku usne.
      unmount();
      expect(container.querySelector("svg")).toBeNull();
      runFrames(100);
      expect(frameQueue).toHaveLength(0);
    });
  });

  it("filtr Bakalářské u fyziky: jediná bakalářská specializace nahoře", () => {
    const { nodes, links, specs } = slice("2026-2027", "fyzika");
    const bachelor = specs.filter((spec) => spec.study_type === "bakalarske");
    expect(bachelor).toHaveLength(1);
    const { container } = render(
      <MapGraph data={{ nodes, links }} filter={{ value: "bakalarske" }} />,
    );
    runFrames(3);
    const svg = container.querySelector("svg");
    const only = svg?.querySelector(`#node-${bachelor[0]?.id ?? ""}`);
    expect(only?.classList).not.toContain("filtered-out");
    expect(only?.getAttribute("transform")).toBe("translate(600,150)");
    for (const spec of specs) {
      if (spec.study_type === "magisterske") {
        expect(svg?.querySelector(`#node-${spec.id}`)?.classList).toContain(
          "filtered-out",
        );
      }
    }
  });

  it("bez dat (načítání) nevykreslí <svg> a ukáže chybu, je-li", () => {
    const { container } = render(
      <MapGraph data={null} filter={{ value: "all" }} error="Chyba." />,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Chyba.",
    );
    expect(frameQueue).toHaveLength(0);
  });
});
