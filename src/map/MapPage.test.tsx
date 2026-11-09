// @vitest-environment jsdom
/**
 * Stránka Mapy předmětů nad skutečnými daty (fetch obsluhuje soubory z data/):
 * výběr roku a oboru v `.study-picker` jako na staré stránce, přepnutí oboru i roku
 * načte jiná data a vrátí filtr stupně na výchozí (stará stránka se znovu načetla).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchResponse } from "../lib/data";
import { FIELD_STORAGE_KEY, YEAR_STORAGE_KEY } from "../lib/storage";
import { MapPage } from "./MapPage";

/** Snímky D3 se nespouštějí (simulace stojí), stačí kontrolovat vykreslený obsah. */
const frameQueue = vi.hoisted(() => {
  const queue: FrameRequestCallback[] = [];
  window.requestAnimationFrame = (callback) => queue.push(callback);
  return queue;
});

Object.defineProperty(SVGElement.prototype, "getComputedTextLength", {
  configurable: true,
  value(this: SVGElement) {
    return (this.textContent ?? "").length * 7;
  },
});

const dataDir = resolve(import.meta.dirname, "../../data");
const DATA_URL = "../data/";

function readData(path: string): unknown {
  return JSON.parse(readFileSync(resolve(dataDir, path), "utf8"));
}

function countSpecs(year: string, field: string): number {
  const nodes = readData(`${year}/${field}/nodes.json`) as { group: string }[];
  return nodes.filter((node) => node.group === "spec").length;
}

const fetchMock = vi.fn((url: string): Promise<FetchResponse> => {
  if (!url.startsWith(DATA_URL)) {
    return Promise.reject(new Error(`nečekaná URL ${url}`));
  }
  const body = readData(url.slice(DATA_URL.length));
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
});

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  document.documentElement.dataset.siteRoot = "../";
  window.localStorage.clear();
  window.history.replaceState(null, "", "/specializace/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  frameQueue.length = 0;
});

function select(id: string): HTMLSelectElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLSelectElement)) throw new Error(`chybí #${id}`);
  return element;
}

function activeFilter(): string | null {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button[data-filter]"),
  );
  const active = buttons.filter((button) =>
    button.className.includes("active"),
  );
  expect(active).toHaveLength(1);
  return active[0]?.dataset.filter ?? null;
}

async function graphSpecs(expected: number): Promise<void> {
  await waitFor(() => {
    expect(document.querySelectorAll("svg g.node-spec")).toHaveLength(expected);
  });
}

describe("MapPage", () => {
  it("výběr roku a oboru jako na staré stránce", async () => {
    render(<MapPage />);
    await graphSpecs(countSpecs("2026-2027", "informatika"));

    // <label>Akademický rok <select id="year-select"></label><label>Obor <select id="obor-select"></label>
    const year = select("year-select");
    const field = select("obor-select");
    expect(year.closest("label")?.textContent).toMatch(/^Akademický rok /);
    expect(field.closest("label")?.textContent).toMatch(/^Obor /);
    expect(year.closest("label")?.parentElement).toBe(
      field.closest("label")?.parentElement,
    );
    expect(Array.from(year.options, (option) => option.textContent)).toEqual([
      "2024/2025",
      "2025/2026",
      "2026/2027",
    ]);
    expect(year.value).toBe("2026-2027");
    expect(Array.from(field.options, (option) => option.textContent)).toEqual([
      "Fyzika",
      "Informatika",
      "Matematika",
      "Učitelství",
    ]);
    expect(field.value).toBe("informatika");
    expect(field.disabled).toBe(false);
    expect(screen.getByText("Všechny stupně")).toBeTruthy();
    expect(activeFilter()).toBe("bakalarske");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "../data/years.json",
      "../data/2026-2027/fields.json",
      "../data/2026-2027/informatika/nodes.json",
      "../data/2026-2027/informatika/links.json",
    ]);
  });

  it("změna oboru načte jeho data a vrátí filtr na Bakalářské", async () => {
    render(<MapPage />);
    await graphSpecs(countSpecs("2026-2027", "informatika"));

    fireEvent.click(screen.getByText("Magisterské"));
    expect(activeFilter()).toBe("magisterske");

    await act(async () => {
      fireEvent.change(select("obor-select"), {
        target: { value: "matematika" },
      });
    });
    await graphSpecs(countSpecs("2026-2027", "matematika"));
    expect(activeFilter()).toBe("bakalarske");
    expect(window.localStorage.getItem(FIELD_STORAGE_KEY)).toBe("matematika");
    expect(new URLSearchParams(window.location.search).get("obor")).toBe(
      "matematika",
    );
    // Graf je nový: specializace mají id z matematiky a žádná není vybraná.
    expect(document.querySelectorAll("svg .selected")).toHaveLength(0);
    expect(document.querySelectorAll("svg > g.zoom-layer")).toHaveLength(1);
  });

  it("rok s jediným oborem: výběr oboru je zakázaný", async () => {
    window.history.replaceState(null, "", "/specializace/?rok=2025-2026");
    render(<MapPage />);
    await graphSpecs(countSpecs("2025-2026", "informatika"));
    const field = select("obor-select");
    expect(field.disabled).toBe(true);
    expect(field.title).toBe(
      "V tomto akademickém roce je k dispozici jen jeden obor",
    );

    fireEvent.click(screen.getByText("Všechny stupně"));
    await act(async () => {
      fireEvent.change(select("year-select"), {
        target: { value: "2026-2027" },
      });
    });
    await graphSpecs(countSpecs("2026-2027", "informatika"));
    expect(activeFilter()).toBe("bakalarske");
    expect(window.localStorage.getItem(YEAR_STORAGE_KEY)).toBe("2026-2027");
    expect(select("obor-select").disabled).toBe(false);
  });
});
