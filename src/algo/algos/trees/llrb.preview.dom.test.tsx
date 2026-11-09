// @vitest-environment jsdom
/*
 * Náhled LLRB na úvodní stránce: skutečná mini-kresba výchozího příkladu (stejný strom jako stránka,
 * čtyři červené hrany) přes celou šířku náhledu – (2,3)-strom vedle by měl v malém náhledu nečitelné
 * písmo (UX-15); nic interaktivního.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mount, type Mounted } from "../../core/domTest";
import { llrbPreview } from "./llrb.preview";

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});

describe("náhled LLRB", () => {
  it("výchozí strom s červenými hranami, bez (2,3)-stromu a bez prvků k ovládání", async () => {
    page = await mount(llrbPreview.render());
    const el = page.el;
    expect(el.querySelector(".llrb-tree")).not.toBeNull();
    const nodes = [...el.querySelectorAll(".tree-node text")].map(
      (t) => t.textContent,
    );
    expect(nodes).toHaveLength(11);
    expect(el.querySelectorAll(".tree-edge.e-red")).toHaveLength(4);
    expect(el.querySelectorAll(".mtree-node")).toHaveLength(0);
    expect(
      el.querySelector("a, button, input, [tabindex], .pickable"),
    ).toBeNull();
  });
});
