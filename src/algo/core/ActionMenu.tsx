/**
 * Nabídka operací vedle plátna (po vzoru VisuAlgo): akce = operace z pseudokódu, vložené argumenty,
 * „Provést“ nebo Enter. Logika je v actionModel.ts (čisté funkce), tady jen vykreslení a fokus.
 *
 * Použití na stránce (hook useActionMenu je v useActionMenu.ts):
 *   const menu = useActionMenu([
 *     { id: "push", label: "Push(x)", args: [{ kind: "int", name: "x", label: "x =", min: 0, max: 99, default: 7 }],
 *       run: (v) => s.run(`Push(${numArg(v, "x")})`, PUSH, (st) => stackPush(st, numArg(v, "x"))) },
 *     { id: "pop", label: "Pop", disabledReason: n ? null : "Zásobník je prázdný", run: () => … },
 *   ]);
 *   <Visualizer actions={<ActionMenu menu={menu} />} …>
 *     <BoxListView onPick={(i, box) => menu.pick(Number(box.label))} … />
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  actionArgs,
  argText,
  currentVariant,
  prepareGo,
  validateArg,
  type ActionDef,
  type ArgDef,
} from "./actionModel";
import { fmtMath } from "./format";
import { decideShortcut } from "./shortcuts";
import type { ActionMenuControl } from "./useActionMenu";

/* ------------------------------------------------------------------ pole argumentu */

function ArgInput({
  def,
  text,
  error,
  errorId,
  first,
  onText,
  onKeyDown,
}: {
  def: ArgDef;
  text: string;
  error: boolean;
  errorId: string;
  first: boolean;
  onText: (t: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}) {
  const common = {
    "aria-invalid": error || undefined,
    "aria-describedby": errorId,
    "data-am-first": first || undefined,
    onKeyDown,
  };
  if (def.kind === "choice") {
    return (
      <select
        value={text}
        onChange={(e) => onText(e.target.value)}
        style={def.width ? { width: def.width } : undefined}
        {...common}
      >
        {def.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  // seznam bez vlastní šířky se roztáhne na zbytek řádku (CSS .am-arg-wide), ať výchozí hodnota není uříznutá
  const width =
    def.width ??
    (def.kind === "int" ? "4.5rem" : def.kind === "list" ? undefined : "9rem");
  return (
    <input
      type="text"
      inputMode={
        def.kind === "int" && def.min !== undefined && def.min >= 0
          ? "numeric"
          : "text"
      }
      autoComplete="off"
      spellCheck={false}
      value={text}
      placeholder={def.kind === "list" ? def.placeholder : undefined}
      maxLength={def.kind === "text" ? def.maxLength : undefined}
      style={width ? { width } : undefined}
      onChange={(e) => onText(e.target.value)}
      {...common}
    />
  );
}

/** ←/→/↑/↓, Home, End mezi tlačítky toolbaru (roving tabindex); nic nespouští */
function moveInToolbar(e: KeyboardEvent<HTMLElement>) {
  const keys = [
    "ArrowRight",
    "ArrowDown",
    "ArrowLeft",
    "ArrowUp",
    "Home",
    "End",
  ];
  if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>("button")];
  const i = items.indexOf(e.target as HTMLElement);
  if (i < 0) return;
  // klávesa je naše – přehrávač (šipky = krok, Home/End) ji nedostane
  e.preventDefault();
  const n = items.length;
  const next =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? n - 1
        : e.key === "ArrowRight" || e.key === "ArrowDown"
          ? (i + 1) % n
          : (i - 1 + n) % n;
  items[next].focus();
}

/* ------------------------------------------------------------------ komponenta */

export function ActionMenu({
  menu,
  label = "Operace",
}: {
  menu: ActionMenuControl;
  /** přístupný název skupiny */
  label?: string;
}) {
  const { defs, state, dispatch, go, focusRef } = menu;
  const baseId = useId();
  const root = useRef<HTMLDivElement>(null);

  // fokus po otevření akce (do prvního pole), po pick (na Provést) a po Esc (zpět na akci)
  useEffect(() => {
    const req = focusRef.current;
    if (!req) return;
    focusRef.current = null;
    const el = root.current;
    if (!el) return;
    const want = req.to;
    const item =
      want === "action"
        ? [...el.querySelectorAll<HTMLElement>(".am-action")].find(
            (b) => b.dataset.amId === req.id,
          )
        : el.querySelector<HTMLElement>(".am-body");
    const target =
      want === "action"
        ? item
        : want === "go"
          ? item?.querySelector<HTMLElement>(".am-go")
          : (item?.querySelector<HTMLElement>("[data-am-first]") ??
            item?.querySelector<HTMLElement>(".am-go"));
    target?.focus();
    // tlačítko právě provedené akce: mezerník na něm přehrává (shortcuts.ts, „action-ran“), dokud
    // fokus neodejde
    if (req.ran && target && document.activeElement === target) {
      target.dataset.amRan = "";
      target.addEventListener("blur", () => delete target.dataset.amRan, {
        once: true,
      });
    }
    if (want === "field" && target instanceof HTMLInputElement) target.select();
  });

  // Esc odkudkoli na stránce zavře otevřenou akci (klávesu stránce nebereme)
  const open = state.open;
  const openDef = open === null ? undefined : defs.find((d) => d.id === open);
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (decideShortcut(e, "none", false).action === "escape")
        dispatch({ type: "close" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dispatch]);

  return (
    <div className="action-menu" role="group" aria-label={label} ref={root}>
      <ul className="am-list" role="list">
        {defs.map((def) => {
          const isOpen = state.open === def.id;
          const expandable =
            actionArgs(def, state).length > 0 || !!def.variants?.length;
          const disabled = !!def.disabledReason;
          const onAction = () => {
            if (!expandable && !disabled) {
              go(def.id);
              return;
            }
            if (!isOpen) focusRef.current = { to: "field" };
            dispatch({ type: "toggle", id: def.id });
          };
          return (
            <li
              key={def.id}
              role="listitem"
              className={"am-item" + (isOpen ? " open" : "")}
            >
              <button
                type="button"
                className={"am-action" + (disabled ? " is-disabled" : "")}
                data-am-id={def.id}
                aria-expanded={expandable || disabled ? isOpen : undefined}
                aria-controls={isOpen ? `${baseId}-${def.id}` : undefined}
                aria-disabled={disabled || undefined}
                title={def.disabledReason ?? def.title}
                onClick={onAction}
              >
                {fmtMath(def.label)}
              </button>
            </li>
          );
        })}
      </ul>
      {/* tělo otevřené akce až za tlačítky: pořadí tabulátoru odpovídá pořadí na obrazovce */}
      {openDef && (
        <ActionBody
          key={openDef.id}
          id={`${baseId}-${openDef.id}`}
          def={openDef}
          menu={menu}
          args={actionArgs(openDef, state)}
          variantId={currentVariant(openDef, state)?.id ?? null}
        />
      )}
      {/* varování k provedené akci (zahozené položky) i po sbalení – živá oblast je v DOM pořád */}
      <p className="am-msg warn am-ran-note" role="status">
        {!openDef && menu.ranNote ? `⚠ ${menu.ranNote}` : ""}
      </p>
    </div>
  );
}

function ActionBody({
  id,
  def,
  menu,
  args,
  variantId,
}: {
  id: string;
  def: ActionDef;
  menu: ActionMenuControl;
  args: readonly ArgDef[];
  variantId: string | null;
}) {
  const { state, dispatch, go, focusRef } = menu;
  const msgId = `${id}-msg`;
  const [tried, setTried] = useState(false);

  if (def.disabledReason) {
    return (
      <div className="am-body" id={id}>
        <p className="am-msg am-disabled" role="note">
          {def.disabledReason}
        </p>
      </div>
    );
  }

  const checks = args.map((a) => validateArg(a, argText(state, a)));
  // zvýrazněná varianta: stránka ji může určit sama (selectedVariant, i null = žádná), jinak zvolená
  const pressedId =
    def.selectedVariant !== undefined ? def.selectedVariant : variantId;
  const firstError = checks.findIndex((c) => c.error !== null);
  const result = prepareGo(def, state);
  const reason = result.ok ? undefined : result.reason;
  const note =
    checks.find((c) => c.note)?.note ??
    (result.ok ? (def.notice?.(result.values, result.variant) ?? null) : null);

  const submit = () => {
    setTried(true);
    go(def.id);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      focusRef.current = { to: "action", id: def.id };
      dispatch({ type: "close" });
    }
  };

  return (
    <div className="am-body" id={id}>
      {def.variants && def.variants.length > 0 && (
        // toolbar s jednou zastávkou tabulátoru (zvolená varianta); šipky, Home a End jen přesouvají
        // fokus – varianta bez argumentu se provede hned, takže výběr šipkou (vzor radiogroup) nejde
        <div
          className="am-variants"
          role="toolbar"
          aria-label="Způsob"
          onKeyDown={moveInToolbar}
        >
          {def.variants.map((v, i) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={v.id === pressedId}
              tabIndex={
                v.id === variantId || (variantId === null && i === 0) ? 0 : -1
              }
              className={"am-variant" + (v.id === pressedId ? " active" : "")}
              title={v.title}
              onClick={() => {
                dispatch({ type: "variant", id: def.id, variant: v.id });
                if (!def.args?.length && !v.args?.length) {
                  setTried(true);
                  go(def.id);
                } else focusRef.current = { to: "field" };
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") onKeyDown(e);
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      {(args.length > 0 || !def.variants?.length) && (
        <div className="am-args">
          {args.map((a, i) => (
            <label
              key={a.name}
              className={
                "am-arg" +
                (a.kind === "list" && !a.width ? " am-arg-wide" : "") +
                (checks[i]?.error ? " invalid" : "")
              }
            >
              <span className="am-arg-label">{fmtMath(a.label)}</span>
              <ArgInput
                def={a}
                text={argText(state, a)}
                error={!!checks[i]?.error}
                errorId={msgId}
                first={i === 0}
                onText={(t) => {
                  // znovu psaní: hláška zase jen zdvořile (role=status), výstraha až po dalším pokusu
                  setTried(false);
                  dispatch({ type: "text", name: a.name, text: t, user: true });
                }}
                onKeyDown={onKeyDown}
              />
            </label>
          ))}
          <button
            type="button"
            className="am-go primary"
            aria-disabled={!result.ok || undefined}
            title={reason ?? `Provede ${def.label} (Enter v poli)`}
            onClick={() => (result.ok ? submit() : setTried(true))}
            onKeyDown={(e) => {
              if (e.key === "Escape") onKeyDown(e);
            }}
          >
            {def.goLabel ?? "Provést"}
          </button>
        </div>
      )}
      <p
        id={msgId}
        className={
          "am-msg" +
          (firstError >= 0 || (tried && reason)
            ? " error"
            : note || (menu.ranNote && state.lastRun === def.id)
              ? " warn"
              : "")
        }
        // při psaní čtečka nepřerušuje (status); výstraha (alert) až po pokusu o provedení – i když
        // nevadí jedno pole, ale jejich kombinace (P a N soudělná)
        role={(firstError >= 0 || reason) && tried ? "alert" : "status"}
      >
        {firstError >= 0
          ? checks[firstError].error
          : note
            ? // něco ze vstupu se zahodí – varování, ať si uživatel všimne, co se opravdu provede
              `⚠ ${note}`
            : tried && reason
              ? reason
              : // akce proběhla a formulář zůstal otevřený (pole stránka sesynchronizovala): varování
                // k provedení je vidět tady, dokud uživatel nezačne psát
                menu.ranNote && state.lastRun === def.id
                ? `⚠ ${menu.ranNote}`
                : ""}
      </p>
    </div>
  );
}
