// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { YearSelect } from "./YearSelect";

afterEach(cleanup);

const YEARS = ["2024-2025", "2025-2026"];

function renderSelect(props: Partial<Parameters<typeof YearSelect>[0]> = {}) {
  const onChange = vi.fn<(year: string) => void>();
  const { container } = render(
    <YearSelect
      years={YEARS}
      value="2025-2026"
      onChange={onChange}
      {...props}
    />,
  );
  const select = container.querySelector("select");
  if (!select) throw new Error("YearSelect nevykreslil <select>");
  return { select, onChange, container };
}

describe("YearSelect", () => {
  it("vykreslí jen <select> s roky ve tvaru RRRR/RRRR", () => {
    const { select, container } = renderSelect();
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(select);
    const options = [...select.options];
    expect(options.map((option) => option.value)).toEqual(YEARS);
    expect(options.map((option) => option.textContent)).toEqual([
      "2024/2025",
      "2025/2026",
    ]);
  });

  it("označí vybraný rok", () => {
    expect(renderSelect().select.value).toBe("2025-2026");
    cleanup();
    expect(renderSelect({ value: "2024-2025" }).select.value).toBe("2024-2025");
  });

  it("při změně zavolá onChange s hodnotou roku (s pomlčkou)", () => {
    const { select, onChange } = renderSelect();
    fireEvent.change(select, { target: { value: "2024-2025" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("2024-2025");
  });

  it("předá className, id a disabled", () => {
    const { select } = renderSelect({
      className: "year-select",
      id: "year-select",
      disabled: true,
    });
    expect(select.className).toBe("year-select");
    expect(select.id).toBe("year-select");
    expect(select.disabled).toBe(true);
  });

  it("bez roků a bez hodnoty vykreslí prázdný select", () => {
    const { select } = renderSelect({ years: [], value: null });
    expect(select.options).toHaveLength(0);
    expect(select.value).toBe("");
  });
});
