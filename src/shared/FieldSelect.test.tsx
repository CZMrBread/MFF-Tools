// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FieldSelect, SINGLE_FIELD_TITLE } from "./FieldSelect";

afterEach(cleanup);

const FIELDS = ["fyzika", "informatika", "matematika", "ucitelstvi"];

function renderSelect(props: Partial<Parameters<typeof FieldSelect>[0]> = {}) {
  const onChange = vi.fn<(field: string) => void>();
  const { container } = render(
    <FieldSelect
      fields={FIELDS}
      value="informatika"
      onChange={onChange}
      {...props}
    />,
  );
  const select = container.querySelector("select");
  if (!select) throw new Error("FieldSelect nevykreslil <select>");
  return { select, onChange, container };
}

describe("FieldSelect", () => {
  it("vykreslí jen <select> s obory a názvy z OBORY_NAZVY", () => {
    const { select, container } = renderSelect();
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(select);
    const options = [...select.options];
    expect(options.map((option) => option.value)).toEqual(FIELDS);
    expect(options.map((option) => option.textContent)).toEqual([
      "Fyzika",
      "Informatika",
      "Matematika",
      "Učitelství",
    ]);
  });

  it("neznámý obor zobrazí jeho id (OBORY_NAZVY[o] || o)", () => {
    const { select } = renderSelect({
      fields: ["informatika", "chemie", "constructor"],
    });
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Informatika",
      "chemie",
      "constructor",
    ]);
  });

  it("označí vybraný obor", () => {
    expect(renderSelect().select.value).toBe("informatika");
    cleanup();
    expect(renderSelect({ value: "fyzika" }).select.value).toBe("fyzika");
  });

  it("při změně zavolá onChange s id oboru", () => {
    const { select, onChange } = renderSelect();
    fireEvent.change(select, { target: { value: "matematika" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("matematika");
  });

  it("s více obory je povolený a má prázdný title", () => {
    const { select } = renderSelect();
    expect(select.disabled).toBe(false);
    expect(select.getAttribute("title")).toBe("");
  });

  it("s jediným oborem je zakázaný s vysvětlením (jako starý kód)", () => {
    const { select } = renderSelect({
      fields: ["informatika"],
      value: "informatika",
    });
    expect(select.disabled).toBe(true);
    expect(select.title).toBe(
      "V tomto akademickém roce je k dispozici jen jeden obor",
    );
    expect(SINGLE_FIELD_TITLE).toBe(select.title);
    expect(select.value).toBe("informatika");
  });

  it("před načtením oborů je prázdný a povolený, bez title", () => {
    const { select } = renderSelect({ fields: [], value: null });
    expect(select.options).toHaveLength(0);
    expect(select.value).toBe("");
    expect(select.disabled).toBe(false);
    expect(select.hasAttribute("title")).toBe(false);
  });

  it("předá className a id", () => {
    const { select } = renderSelect({
      className: "obor-select",
      id: "obor-select",
    });
    expect(select.className).toBe("obor-select");
    expect(select.id).toBe("obor-select");
  });

  it("starý kód zakazuje výběr ve stejných případech (obory.length < 2)", () => {
    for (const page of ["kalkulačka/index.html", "specializace/index.html"]) {
      const html = readFileSync(
        resolve(import.meta.dirname, "../legacy", page),
        "utf8",
      );
      expect(html).toContain("sel.disabled = obory.length < 2;");
      expect(html).toContain(
        `sel.title = sel.disabled ? '${SINGLE_FIELD_TITLE}' : '';`,
      );
    }
  });
});
