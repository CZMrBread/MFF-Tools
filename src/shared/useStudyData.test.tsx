// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAP_YEARS_FALLBACK, YEARS_FALLBACK } from "../lib/data";
import type { FetchResponse } from "../lib/data";
import { FIELD_STORAGE_KEY, YEAR_STORAGE_KEY } from "../lib/storage";
import { GENERIC_LOAD_ERROR, useStudyData } from "./useStudyData";

// V prostředí jsdom je globální URL z jsdom, proto cesta přes import.meta.dirname.
const dataDir = resolve(import.meta.dirname, "../../data");
const DATA_URL = "../data/";

function readData(path: string): unknown {
  return JSON.parse(readFileSync(resolve(dataDir, path), "utf8"));
}

const realYears = readData("years.json") as string[];
const NEWEST = realYears.at(-1) ?? "";
const OLDER = realYears[0] ?? "";

function realFields(year: string): string[] {
  return readData(`${year}/fields.json`) as string[];
}

/** Každá kombinace rok × obor z years.json a fields.json. */
const realPairs = realYears.flatMap((year) =>
  realFields(year).map((field) => ({ year, field, name: `${year}/${field}` })),
);

/** Obor nejnovějšího roku jiný než informatika, který nejstarší rok nemá. */
const OTHER_FIELD =
  realFields(NEWEST).find(
    (field) => field !== "informatika" && !realFields(OLDER).includes(field),
  ) ?? "";

function jsonResponse(body: unknown, status = 200): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

/** Odpověď ze skutečných souborů v data/ (URL začíná "../data/"), jinak 404. */
function serveRepoData(url: string): Promise<FetchResponse> {
  if (!url.startsWith(DATA_URL)) {
    return Promise.reject(new Error(`nečekaná URL ${url}`));
  }
  try {
    return Promise.resolve(jsonResponse(readData(url.slice(DATA_URL.length))));
  } catch {
    return Promise.resolve(jsonResponse(null, 404));
  }
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Handler = (url: string) => Promise<FetchResponse>;

let handler: Handler = serveRepoData;
const fetchMock = vi.fn(
  (url: string, init?: { cache?: RequestCache }): Promise<FetchResponse> => {
    void init;
    return handler(url);
  },
);

function fetchedUrls(): string[] {
  return fetchMock.mock.calls.map(([url]) => url);
}

function fieldsUrl(year: string): string {
  return `${DATA_URL}${year}/fields.json`;
}

function nodesUrl(year: string, field = "informatika"): string {
  return `${DATA_URL}${year}/${field}/nodes.json`;
}

function linksUrl(year: string, field = "informatika"): string {
  return `${DATA_URL}${year}/${field}/links.json`;
}

/**
 * Požadavky na soubory končící `suffix` zůstanou viset, dokud je test nevyřídí
 * přes `respond(url)`; ostatní soubory se obslouží hned.
 */
function holdRequests(suffix: string) {
  const pending = new Map<string, Deferred<FetchResponse>>();
  handler = (url) => {
    if (!url.endsWith(suffix)) return serveRepoData(url);
    const request = deferred<FetchResponse>();
    pending.set(url, request);
    return request.promise;
  };
  const respond = async (url: string, body?: unknown) => {
    const request = pending.get(url);
    if (!request) throw new Error(`požadavek ${url} neběží`);
    const response =
      body === undefined ? await serveRepoData(url) : jsonResponse(body);
    await act(async () => {
      request.resolve(response);
      await request.promise;
    });
  };
  return { pending, respond };
}

beforeEach(() => {
  handler = serveRepoData;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  document.documentElement.dataset.siteRoot = "../";
  window.localStorage.clear();
  window.history.replaceState(null, "", "/kalkulačka/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useStudyData – výběr roku, oboru a načtení", () => {
  it("má smysl testovat jen s různými roky a s rokem o více oborech", () => {
    expect(realYears.length).toBeGreaterThanOrEqual(2);
    expect(OLDER).not.toBe(NEWEST);
    expect(realFields(OLDER)).toEqual(["informatika"]);
    expect(OTHER_FIELD).not.toBe("");
  });

  it("začíná ve stavu loading; bez URL a úložiště vybere poslední rok a informatiku", async () => {
    const { result } = renderHook(() => useStudyData());
    expect(result.current).toMatchObject({
      status: "loading",
      years: [],
      year: null,
      fields: [],
      field: null,
      data: null,
      error: null,
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.years).toEqual(realYears);
    expect(result.current.year).toBe(NEWEST);
    expect(result.current.fields).toEqual(realFields(NEWEST));
    expect(result.current.field).toBe("informatika");
    expect(result.current.error).toBeNull();
    expect(result.current.data?.year).toBe(NEWEST);
    expect(result.current.data?.field).toBe("informatika");
    expect(result.current.data?.nodes).toEqual(
      readData(`${NEWEST}/informatika/nodes.json`),
    );
    expect(result.current.data?.index.specs).toHaveLength(14);
    expect(result.current.data).not.toHaveProperty("links");

    // relativní URL z dataBaseUrl(); years.json a fields.json bez cache (jako
    // starý kód), hrany se nenačítají
    expect(fetchMock.mock.calls).toEqual([
      [`${DATA_URL}years.json`, { cache: "no-store" }],
      [fieldsUrl(NEWEST), { cache: "no-store" }],
      [nodesUrl(NEWEST), undefined],
    ]);
    // samotné načtení nic neukládá a nemění URL (jako starý kód)
    expect(window.localStorage.getItem(YEAR_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(FIELD_STORAGE_KEY)).toBeNull();
    expect(window.location.search).toBe("");
  });

  it.each(realPairs)(
    "$name: z ?rok= a ?obor= načte uzly i hrany oboru",
    async ({ year, field }) => {
      window.history.replaceState(
        null,
        "",
        `/specializace/?rok=${year}&obor=${field}`,
      );
      const { result } = renderHook(() => useStudyData({ links: true }));
      await waitFor(() => expect(result.current.status).toBe("ready"));
      expect(result.current).toMatchObject({
        year,
        field,
        fields: realFields(year),
      });
      expect(result.current.data?.nodes).toEqual(
        readData(`${year}/${field}/nodes.json`),
      );
      expect(result.current.data?.links).toEqual(
        readData(`${year}/${field}/links.json`),
      );
    },
  );

  it("rok z URL má přednost před uloženým", async () => {
    window.history.replaceState(null, "", `/kalkulačka/?rok=${OLDER}`);
    window.localStorage.setItem(YEAR_STORAGE_KEY, NEWEST);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.year).toBe(OLDER);
    expect(result.current.data?.year).toBe(OLDER);
    expect(fetchedUrls()).toContain(nodesUrl(OLDER));
    expect(fetchedUrls()).not.toContain(fieldsUrl(NEWEST));
  });

  it("bez platného roku v URL použije uložený rok", async () => {
    window.history.replaceState(null, "", "/kalkulačka/?rok=1999-2000");
    window.localStorage.setItem(YEAR_STORAGE_KEY, OLDER);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.year).toBe(OLDER);
  });

  it("neplatný rok v URL i v úložišti → poslední rok", async () => {
    window.history.replaceState(null, "", "/kalkulačka/?rok=letos");
    window.localStorage.setItem(YEAR_STORAGE_KEY, "1999-2000");
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.year).toBe(NEWEST);
    // neplatné hodnoty nepřepisuje
    expect(window.localStorage.getItem(YEAR_STORAGE_KEY)).toBe("1999-2000");
    expect(window.location.search).toBe("?rok=letos");
  });

  it("obor z URL má přednost před uloženým", async () => {
    window.history.replaceState(null, "", `/kalkulačka/?obor=${OTHER_FIELD}`);
    window.localStorage.setItem(FIELD_STORAGE_KEY, "informatika");
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.field).toBe(OTHER_FIELD);
    expect(result.current.data?.field).toBe(OTHER_FIELD);
    expect(fetchedUrls()).toContain(nodesUrl(NEWEST, OTHER_FIELD));
    expect(fetchedUrls()).not.toContain(nodesUrl(NEWEST));
  });

  it("bez platného oboru v URL použije uložený obor", async () => {
    window.history.replaceState(null, "", "/kalkulačka/?obor=chemie");
    window.localStorage.setItem(FIELD_STORAGE_KEY, OTHER_FIELD);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.field).toBe(OTHER_FIELD);
    expect(window.location.search).toBe("?obor=chemie");
  });

  it("uložený obor, který rok nemá, se nepoužije ani nepřepíše", async () => {
    window.history.replaceState(null, "", `/kalkulačka/?rok=${OLDER}`);
    window.localStorage.setItem(FIELD_STORAGE_KEY, OTHER_FIELD);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.fields).toEqual(["informatika"]);
    expect(result.current.field).toBe("informatika");
    expect(window.localStorage.getItem(FIELD_STORAGE_KEY)).toBe(OTHER_FIELD);
  });

  it("rok bez informatiky → první platný obor z fields.json", async () => {
    handler = (url) =>
      url === fieldsUrl(NEWEST)
        ? Promise.resolve(jsonResponse(["matematika", "Fyzika", "fyzika"]))
        : serveRepoData(url);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    // neplatná id se zahodí (nactiObory)
    expect(result.current.fields).toEqual(["matematika", "fyzika"]);
    expect(result.current.field).toBe("matematika");
    expect(fetchedUrls()).toContain(nodesUrl(NEWEST, "matematika"));
  });

  it("když fields.json nejde načíst, použije záložní seznam [informatika]", async () => {
    window.localStorage.setItem(FIELD_STORAGE_KEY, OTHER_FIELD);
    handler = (url) =>
      url.endsWith("fields.json")
        ? Promise.resolve(jsonResponse(null, 404))
        : serveRepoData(url);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.fields).toEqual(["informatika"]);
    expect(result.current.field).toBe("informatika");
  });

  it("když years.json nejde načíst, použije záložní seznam kalkulačky", async () => {
    handler = (url) =>
      url.endsWith("years.json")
        ? Promise.reject(new TypeError("síť"))
        : serveRepoData(url);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.years).toEqual(YEARS_FALLBACK);
    expect(result.current.years).toEqual(["2026-2027"]);
    expect(result.current.year).toBe("2026-2027");
  });

  it("mapa předá vlastní záložní seznam roků (MAP_YEARS_FALLBACK)", async () => {
    handler = (url) =>
      url.endsWith("years.json")
        ? Promise.resolve(jsonResponse(["nic"]))
        : serveRepoData(url);
    const { result } = renderHook(() =>
      useStudyData({ links: true, yearsFallback: MAP_YEARS_FALLBACK }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.years).toEqual(["2025-2026"]);
    expect(result.current.data?.year).toBe("2025-2026");
  });

  it("s links: true načte i links.json", async () => {
    const { result } = renderHook(() => useStudyData({ links: true }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.links).toEqual(
      readData(`${NEWEST}/informatika/links.json`),
    );
    expect(fetchedUrls().sort()).toEqual(
      [
        `${DATA_URL}years.json`,
        fieldsUrl(NEWEST),
        linksUrl(NEWEST),
        nodesUrl(NEWEST),
      ].sort(),
    );
  });

  it("data bere ze složky podle data-site-root", async () => {
    document.documentElement.dataset.siteRoot = "./";
    handler = (url) => serveRepoData(`.${url}`);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchedUrls()).toEqual([
      "./data/years.json",
      `./data/${NEWEST}/fields.json`,
      `./data/${NEWEST}/informatika/nodes.json`,
    ]);
  });
});

describe("useStudyData – setYear", () => {
  it("uloží rok, zapíše ?rok= do URL a načte data nového roku bez reloadu", async () => {
    window.history.replaceState(null, "", "/kalkulačka/?x=1#rozvrh");
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const historyLength = window.history.length;

    act(() => result.current.setYear(OLDER));
    expect(window.localStorage.getItem(YEAR_STORAGE_KEY)).toBe(OLDER);
    expect(window.localStorage.getItem(FIELD_STORAGE_KEY)).toBeNull();
    expect(window.location.search).toBe(`?x=1&rok=${OLDER}`);
    expect(window.location.hash).toBe("#rozvrh");
    expect(window.history.length).toBe(historyLength);
    // data starého roku se už nenabízejí; obory nového roku se teprve načítají
    expect(result.current).toMatchObject({
      status: "loading",
      year: OLDER,
      fields: [],
      field: null,
      data: null,
      error: null,
      years: realYears,
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.year).toBe(OLDER);
    expect(result.current.fields).toEqual(realFields(OLDER));
    expect(result.current.data?.year).toBe(OLDER);
    expect(result.current.data?.nodes).toEqual(
      readData(`${OLDER}/informatika/nodes.json`),
    );
  });

  it("přepíše existující parametr rok", async () => {
    window.history.replaceState(null, "", `/kalkulačka/?rok=${OLDER}`);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.setYear(NEWEST));
    expect(window.location.search).toBe(`?rok=${NEWEST}`);
    await waitFor(() => expect(result.current.data?.year).toBe(NEWEST));
  });

  it("po změně roku vybere obor znovu jako reload staré stránky (?obor= → mff_obor → informatika)", async () => {
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.setField(OTHER_FIELD));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    // starší rok obor nemá → informatika; ?obor= i mff_obor zůstávají
    act(() => result.current.setYear(OLDER));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject({
      year: OLDER,
      fields: ["informatika"],
      field: "informatika",
    });
    expect(result.current.data?.field).toBe("informatika");
    expect(window.location.search).toBe(`?obor=${OTHER_FIELD}&rok=${OLDER}`);
    expect(window.localStorage.getItem(FIELD_STORAGE_KEY)).toBe(OTHER_FIELD);

    // zpět na nejnovější rok → obor z ?obor= znovu platí
    act(() => result.current.setYear(NEWEST));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.field).toBe(OTHER_FIELD);
    expect(result.current.data?.field).toBe(OTHER_FIELD);
    // fields.json každého roku se načetl jen jednou
    expect(
      fetchedUrls().filter((url) => url === fieldsUrl(NEWEST)),
    ).toHaveLength(1);
  });

  it("bez ?obor= v URL rozhoduje po změně roku uložený obor", async () => {
    window.history.replaceState(null, "", `/kalkulačka/?rok=${OLDER}`);
    window.localStorage.setItem(FIELD_STORAGE_KEY, OTHER_FIELD);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.field).toBe("informatika");
    act(() => result.current.setYear(NEWEST));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.field).toBe(OTHER_FIELD);
  });

  it("rok mimo seznam ignoruje", async () => {
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const before = result.current;
    act(() => result.current.setYear("1999-2000"));
    expect(result.current).toBe(before);
    expect(window.localStorage.getItem(YEAR_STORAGE_KEY)).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("před načtením seznamu roků nedělá nic", () => {
    handler = () => new Promise<FetchResponse>(() => undefined);
    const { result } = renderHook(() => useStudyData());
    act(() => result.current.setYear(NEWEST));
    expect(result.current.year).toBeNull();
    expect(window.localStorage.getItem(YEAR_STORAGE_KEY)).toBeNull();
  });

  it("pozdě doběhlé fields.json předchozího roku se zahodí", async () => {
    const { pending, respond } = holdRequests("fields.json");
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(pending.has(fieldsUrl(NEWEST))).toBe(true));
    act(() => result.current.setYear(OLDER));
    await waitFor(() => expect(pending.has(fieldsUrl(OLDER))).toBe(true));

    await respond(fieldsUrl(NEWEST), [OTHER_FIELD]);
    expect(result.current).toMatchObject({
      year: OLDER,
      fields: [],
      field: null,
    });
    expect(fetchedUrls()).not.toContain(nodesUrl(NEWEST, OTHER_FIELD));

    await respond(fieldsUrl(OLDER));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.year).toBe(OLDER);
    expect(result.current.data?.field).toBe("informatika");
  });

  it("pozdě doběhlé načtení jiného roku se zahodí", async () => {
    const { pending, respond } = holdRequests("nodes.json");
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(pending.has(nodesUrl(NEWEST))).toBe(true));
    act(() => result.current.setYear(OLDER));
    await waitFor(() => expect(pending.has(nodesUrl(OLDER))).toBe(true));

    // nejdřív doběhne zastaralý požadavek na původní rok
    await respond(nodesUrl(NEWEST));
    expect(result.current).toMatchObject({
      status: "loading",
      year: OLDER,
      data: null,
    });

    await respond(nodesUrl(OLDER));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.year).toBe(OLDER);
    expect(result.current.data?.year).toBe(OLDER);
  });

  it("zastaralý požadavek nepřepíše data, ani když doběhne až po aktuálním", async () => {
    const { pending, respond } = holdRequests("nodes.json");
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(pending.has(nodesUrl(NEWEST))).toBe(true));
    act(() => result.current.setYear(OLDER));
    await waitFor(() => expect(pending.has(nodesUrl(OLDER))).toBe(true));

    await respond(nodesUrl(OLDER));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const ready = result.current;

    await respond(nodesUrl(NEWEST));
    expect(result.current).toBe(ready);
    expect(result.current.data?.year).toBe(OLDER);
  });

  it("rychlé přepnutí tam a zpět nenačítá už načtený rok znovu", async () => {
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const data = result.current.data;

    handler = (url) =>
      url === nodesUrl(OLDER)
        ? new Promise<FetchResponse>(() => undefined)
        : serveRepoData(url);
    act(() => result.current.setYear(OLDER));
    expect(result.current.status).toBe("loading");
    act(() => result.current.setYear(NEWEST));

    expect(result.current.status).toBe("ready");
    expect(result.current.data).toBe(data);
    await waitFor(() => expect(result.current.fields).not.toEqual([]));
    expect(result.current.data).toBe(data);
    expect(
      fetchedUrls().filter((url) => url === nodesUrl(NEWEST)),
    ).toHaveLength(1);
    expect(window.localStorage.getItem(YEAR_STORAGE_KEY)).toBe(NEWEST);
    expect(window.location.search).toBe(`?rok=${NEWEST}`);
  });
});

describe("useStudyData – setField", () => {
  it("uloží obor, zapíše ?obor= do URL a načte data oboru; rok zůstane", async () => {
    window.history.replaceState(null, "", "/kalkulačka/?x=1#rozvrh");
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const historyLength = window.history.length;

    act(() => result.current.setField(OTHER_FIELD));
    expect(window.localStorage.getItem(FIELD_STORAGE_KEY)).toBe(OTHER_FIELD);
    expect(window.localStorage.getItem(YEAR_STORAGE_KEY)).toBeNull();
    expect(window.location.search).toBe(`?x=1&obor=${OTHER_FIELD}`);
    expect(window.location.hash).toBe("#rozvrh");
    expect(window.history.length).toBe(historyLength);
    expect(result.current).toMatchObject({
      status: "loading",
      year: NEWEST,
      field: OTHER_FIELD,
      fields: realFields(NEWEST),
      data: null,
      error: null,
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.year).toBe(NEWEST);
    expect(result.current.data?.field).toBe(OTHER_FIELD);
    expect(result.current.data?.nodes).toEqual(
      readData(`${NEWEST}/${OTHER_FIELD}/nodes.json`),
    );
    // změna oboru nenačítá znovu years.json ani fields.json
    expect(fetchedUrls()).toEqual([
      `${DATA_URL}years.json`,
      fieldsUrl(NEWEST),
      nodesUrl(NEWEST),
      nodesUrl(NEWEST, OTHER_FIELD),
    ]);
  });

  it("přepíše existující parametr obor", async () => {
    window.history.replaceState(null, "", `/kalkulačka/?obor=${OTHER_FIELD}`);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.setField("informatika"));
    expect(window.location.search).toBe("?obor=informatika");
    await waitFor(() => expect(result.current.data?.field).toBe("informatika"));
  });

  it("obor mimo seznam roku ignoruje", async () => {
    window.history.replaceState(null, "", `/kalkulačka/?rok=${OLDER}`);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const before = result.current;
    act(() => result.current.setField(OTHER_FIELD));
    expect(result.current).toBe(before);
    expect(window.localStorage.getItem(FIELD_STORAGE_KEY)).toBeNull();
    expect(window.location.search).toBe(`?rok=${OLDER}`);
  });

  it("před načtením oborů nedělá nic", async () => {
    handler = (url) =>
      url.endsWith("fields.json")
        ? new Promise<FetchResponse>(() => undefined)
        : serveRepoData(url);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.year).toBe(NEWEST));
    act(() => result.current.setField("informatika"));
    expect(result.current.field).toBeNull();
    expect(window.localStorage.getItem(FIELD_STORAGE_KEY)).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("pozdě doběhlé načtení předchozího oboru se zahodí", async () => {
    const { pending, respond } = holdRequests("nodes.json");
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(pending.has(nodesUrl(NEWEST))).toBe(true));
    act(() => result.current.setField(OTHER_FIELD));
    await waitFor(() =>
      expect(pending.has(nodesUrl(NEWEST, OTHER_FIELD))).toBe(true),
    );

    await respond(nodesUrl(NEWEST));
    expect(result.current).toMatchObject({
      status: "loading",
      field: OTHER_FIELD,
      data: null,
    });
    await respond(nodesUrl(NEWEST, OTHER_FIELD));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.field).toBe(OTHER_FIELD);
  });
});

describe("useStudyData – chyby a odpojení", () => {
  it("chybu načtení dat vrátí jako český text", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    handler = (url) =>
      url.endsWith("nodes.json")
        ? Promise.resolve(jsonResponse(null, 404))
        : serveRepoData(url);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toMatchObject({
      year: NEWEST,
      years: realYears,
      field: "informatika",
      fields: realFields(NEWEST),
      data: null,
      error: `Nepodařilo se načíst data (${nodesUrl(NEWEST)}): HTTP 404.`,
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("chybný tvar dat hlásí s názvem souboru", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    handler = (url) =>
      url.endsWith("nodes.json")
        ? Promise.resolve(jsonResponse({ nodes: [] }))
        : serveRepoData(url);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe(
      `${NEWEST}/informatika/nodes.json: očekáváno pole uzlů, nalezeno: objekt.`,
    );
  });

  it("s links: true je chybou i nenačtené links.json", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    handler = (url) =>
      url.endsWith("links.json")
        ? Promise.resolve(jsonResponse(null, 500))
        : serveRepoData(url);
    const { result } = renderHook(() => useStudyData({ links: true }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toContain("links.json): HTTP 500.");
  });

  it("neznámá chyba má obecnou hlášku", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // odpověď, která není StudyDataError (rozbitý objekt Response)
    handler = (url) =>
      url.endsWith("nodes.json")
        ? Promise.resolve({
            get ok(): boolean {
              throw new TypeError("boom");
            },
            status: 200,
            json: () => Promise.resolve([]),
          })
        : serveRepoData(url);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe(GENERIC_LOAD_ERROR);
    expect(GENERIC_LOAD_ERROR).toBe("Chyba při načítání dat.");
  });

  it("po chybě jde přepnout na jiný rok a vrátit se (načtení se zopakuje)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let failNewest = true;
    handler = (url) =>
      failNewest && url === nodesUrl(NEWEST)
        ? Promise.resolve(jsonResponse(null, 503))
        : serveRepoData(url);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("error"));

    act(() => result.current.setYear(OLDER));
    expect(result.current).toMatchObject({ status: "loading", error: null });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.year).toBe(OLDER);

    failNewest = false;
    act(() => result.current.setYear(NEWEST));
    // stará chyba se neukáže, čeká se na nové načtení
    expect(result.current).toMatchObject({ status: "loading", error: null });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.year).toBe(NEWEST);
  });

  it("po chybě jde přepnout obor a vrátit se (načtení se zopakuje)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let fail = true;
    handler = (url) =>
      fail && url === nodesUrl(NEWEST)
        ? Promise.resolve(jsonResponse(null, 503))
        : serveRepoData(url);
    const { result } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.status).toBe("error"));

    act(() => result.current.setField(OTHER_FIELD));
    expect(result.current).toMatchObject({ status: "loading", error: null });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    fail = false;
    act(() => result.current.setField("informatika"));
    expect(result.current).toMatchObject({ status: "loading", error: null });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.field).toBe("informatika");
  });

  it("po odpojení už výsledek načtení nic nezmění", async () => {
    const request = deferred<FetchResponse>();
    handler = (url) =>
      url.endsWith("nodes.json") ? request.promise : serveRepoData(url);
    const { result, unmount } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.field).toBe("informatika"));
    const beforeUnmount = result.current;
    unmount();

    request.resolve(await serveRepoData(nodesUrl(NEWEST)));
    await request.promise;
    await Promise.resolve();
    expect(result.current).toBe(beforeUnmount);
    expect(result.current.status).toBe("loading");
  });

  it("po odpojení během načítání oborů se nic nenačítá dál", async () => {
    const request = deferred<FetchResponse>();
    handler = (url) =>
      url.endsWith("fields.json") ? request.promise : serveRepoData(url);
    const { result, unmount } = renderHook(() => useStudyData());
    await waitFor(() => expect(result.current.year).toBe(NEWEST));
    const beforeUnmount = result.current;
    unmount();

    request.resolve(jsonResponse(realFields(NEWEST)));
    await request.promise;
    await Promise.resolve();
    expect(result.current).toBe(beforeUnmount);
    expect(fetchedUrls().some((url) => url.endsWith("nodes.json"))).toBe(false);
  });
});
