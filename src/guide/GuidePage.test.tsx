// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { PAGES, pageHref } from "../shared/pages";
import { GuidePage } from "./GuidePage";

/** Stará stránka průvodce v kořeni repa – reference obsahu (do úklidu v kroku 7). */
const OLD_PAGE_PATH = resolve(import.meta.dirname, "../legacy/index.html");
const oldPageExists = existsSync(OLD_PAGE_PATH);

/** Odkaz s vlastním schématem (https:, mailto:) vede mimo web a přenáší se beze změny. */
const EXTERNAL_HREF = /^[a-z][a-z0-9+.-]*:/i;

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** Obsah nové stránky (kořenový .container) vykreslený do samostatného dokumentu. */
function renderGuide(): Element {
  const root = parseHtml(renderToStaticMarkup(<GuidePage />)).body
    .firstElementChild;
  if (!root) throw new Error("GuidePage nic nevykreslila");
  return root;
}

/** Obsah staré stránky: <div class="container"> bez hlavičky webu a skriptu. */
function loadOldGuide(): Element {
  const container = parseHtml(
    readFileSync(OLD_PAGE_PATH, "utf8"),
  ).querySelector("body > div.container");
  if (!container) throw new Error("Ve staré stránce chybí div.container");
  return container;
}

const BLOCK_TAGS = new Set([
  "DIV",
  "P",
  "SECTION",
  "HEADER",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "UL",
  "LI",
]);

/**
 * Blokové prvky – bílé znaky na jejich hranicích se nevykreslují. Patří sem
 * i tlačítka (a.btn), která stojí samostatně přímo v sekci nebo v mřížce;
 * odkazy uvnitř textu (v <p>, <li>, <span>, <strong>) zůstávají řádkové.
 */
function isBlock(element: Element): boolean {
  if (BLOCK_TAGS.has(element.tagName)) return true;
  const parentTag = element.parentElement?.tagName;
  return (
    element.tagName === "A" && (parentTag === "DIV" || parentTag === "SECTION")
  );
}

function rawText(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== node.ELEMENT_NODE) return "";
  const inner = Array.from(node.childNodes, rawText).join("");
  return isBlock(node as Element) ? ` ${inner} ` : inner;
}

/**
 * Viditelný text: řádkové mezery zůstávají významné (sloučené do jedné, jen
 * HTML bílé znaky – nezlomitelná mezera by se počítala jako rozdíl), hranice
 * bloků se berou jako mezera.
 */
function visibleText(root: Element): string {
  return rawText(root)
    .replace(/[ \t\n\r\f]+/g, " ")
    .trim();
}

type LinkInfo = {
  href: string | null;
  target: string | null;
  rel: string | null;
};

function links(root: Element): LinkInfo[] {
  return Array.from(root.querySelectorAll("a"), (anchor) => ({
    href: anchor.getAttribute("href"),
    target: anchor.getAttribute("target"),
    rel: anchor.getAttribute("rel"),
  }));
}

/**
 * Interní odkaz staré stránky je relativní ke kořeni webu ("kalkulačka/",
 * "specializace/", "./") a musí přesně odpovídat cestě některé stránky
 * z PAGES – nová stránka na ni odkazuje přes pageHref(). Neznámý interní
 * odkaz (i absolutní cesta začínající "/") je chyba.
 */
function mapOldHref(href: string | null): string | null {
  if (href === null || EXTERNAL_HREF.test(href)) return href;
  const path = href === "./" ? "" : href;
  const page = PAGES.find((candidate) => candidate.path === path);
  if (!page) {
    throw new Error(`Neznámý interní odkaz ve staré stránce: ${href}`);
  }
  return pageHref(page.id);
}

/** Třídy Bootstrap ikon ("bi-…") v pořadí výskytu. */
function iconClasses(root: Element): string[] {
  return Array.from(root.querySelectorAll("[class]")).flatMap((element) =>
    Array.from(element.classList).filter((name) => name.startsWith("bi-")),
  );
}

/** Kostra stránky: názvy všech elementů v pořadí dokumentu. */
function tagSequence(root: Element): string[] {
  return Array.from(root.querySelectorAll("*"), (element) => element.tagName);
}

afterEach(() => {
  delete document.documentElement.dataset.siteRoot;
});

describe("GuidePage", () => {
  it("vykreslí úvod, sekce a patičku průvodce", () => {
    const guide = renderGuide();
    expect(guide.tagName).toBe("DIV");
    expect(guide.querySelector("header > h1")?.textContent?.trim()).toBe(
      "Vítej na Matfyzu!",
    );
    expect(guide.querySelectorAll("h2")).toHaveLength(6);
    expect(guide.querySelectorAll("section")).toHaveLength(7);
    expect(guide.querySelector("footer")?.textContent).toContain(
      "dsmola9@gmail.com",
    );
    // Hlavičku webu vykresluje App.tsx, ne průvodce.
    expect(guide.querySelector(".site-header")).toBeNull();
  });

  it("odkazy na kalkulačku a mapu jsou relativní ke kořeni webu", () => {
    const hrefs = links(renderGuide()).map((link) => link.href);
    expect(hrefs).toContain("./kalkulačka/");
    expect(hrefs).toContain("./specializace/");
    expect(hrefs.filter((href) => href?.startsWith("/"))).toEqual([]);

    document.documentElement.dataset.siteRoot = "../";
    const nestedHrefs = links(renderGuide()).map((link) => link.href);
    expect(nestedHrefs).toContain("../kalkulačka/");
    expect(nestedHrefs).toContain("../specializace/");
  });

  describe.skipIf(!oldPageExists)(
    "obsah je doslova ze starého index.html",
    () => {
      it("má stejný viditelný text", () => {
        const oldText = visibleText(loadOldGuide());
        expect(oldText.length).toBeGreaterThan(3000);
        expect(visibleText(renderGuide())).toBe(oldText);
      });

      it("má stejné odkazy (href, target, rel) ve stejném pořadí", () => {
        const oldLinks = links(loadOldGuide()).map((link) => ({
          ...link,
          href: mapOldHref(link.href),
        }));
        expect(oldLinks).toHaveLength(20);
        expect(links(renderGuide())).toEqual(oldLinks);
        // Interní odkazy staré stránky: kalkulačka a mapa (specializace).
        expect(
          oldLinks.filter((link) => !EXTERNAL_HREF.test(link.href ?? "")),
        ).toEqual([
          { href: "./kalkulačka/", target: null, rel: null },
          {
            href: "./specializace/",
            target: "_blank",
            rel: "noopener noreferrer",
          },
        ]);
      });

      it("má stejné Bootstrap ikony ve stejném pořadí", () => {
        const oldIcons = iconClasses(loadOldGuide());
        expect(oldIcons).toHaveLength(31);
        expect(iconClasses(renderGuide())).toEqual(oldIcons);
      });

      it("má stejnou kostru elementů (pořadí sekcí, zvýraznění v textu)", () => {
        expect(tagSequence(renderGuide())).toEqual(tagSequence(loadOldGuide()));
      });
    },
  );
});
