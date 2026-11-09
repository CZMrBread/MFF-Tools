/**
 * Model nabídky operací (ActionMenu) po vzoru VisuAlgo – čisté funkce bez Reactu (testy v actionModel.test.ts).
 * Komponenta a hook useActionMenu jsou v ActionMenu.tsx.
 *
 * Akce = operace tak, jak se jmenuje v pseudokódu („Push(x)“, „Insert(x)“). Může mít vložené argumenty
 * (celé číslo, seznam čísel, volba, text) a varianty („Vytvořit“ ▸ Náhodně / Seřazeně / Vlastní / Příklady
 * z knihy). Texty argumentů se drží podle jména argumentu – stejné jméno (x) sdílí víc akcí a hodnota
 * zůstává i po provedení.
 */
import {
  describeRange,
  listStatus,
  parseIntStrict,
  parseNumberList,
} from "./input";

/* ------------------------------------------------------------------ definice */

interface ArgBase {
  /** jméno argumentu – klíč v `values`; stejné jméno v různých akcích sdílí text */
  name: string;
  /** popisek před polem, např. „x =“ nebo „A =“ */
  label: string;
  /** šířka pole (CSS), výchozí podle druhu */
  width?: string;
  /**
   * Další kontrola platné hodnoty (počet 2ᵏ, text sítě…): text chyby, nebo null. Chyba se ukáže u pole
   * hned při psaní a akce se neprovede – formulář zůstane otevřený.
   */
  check?: (value: ArgValue) => string | null;
  /**
   * Upozornění, že se platný vstup upraví (mezery vynechány, hodnoty mod 17…): ukáže se jako „⚠“ u pole
   * a po provedení zůstane pod akcemi; akce se provede.
   */
  notice?: (value: ArgValue) => string | null;
}

export interface IntArgDef extends ArgBase {
  kind: "int";
  min?: number;
  max?: number;
  default: number;
}

export interface ListArgDef extends ArgBase {
  kind: "list";
  min?: number;
  max?: number;
  maxCount?: number;
  /** smí být prázdný (Vytvořit prázdnou strukturu) */
  allowEmpty?: boolean;
  /** false = i desetinná čísla („0.5, 0.25“ – FFT, maska); výchozí jen celá čísla */
  integerOnly?: boolean;
  /**
   * Přísný režim (Ceny hran): jakékoli neplatné slovo nebo číslo mimo rozsah je chyba (Go zablokované),
   * ne poznámka „Ignorováno“ – každé číslo patří ke konkrétní položce, vynechání by ostatní posunulo.
   */
  strict?: boolean;
  default: readonly number[];
  placeholder?: string;
}

export interface ChoiceArgDef extends ArgBase {
  kind: "choice";
  options: readonly { value: string; label: string }[];
  /** výchozí hodnota; jinak první možnost */
  default?: string;
}

export interface TextArgDef extends ArgBase {
  kind: "text";
  maxLength?: number;
  /** povolené znaky / tvar celého textu */
  pattern?: RegExp;
  /** lidský popis vzoru do hlášky, např. „malá písmena a–z“ */
  patternHint?: string;
  default: string;
}

export type ArgDef = IntArgDef | ListArgDef | ChoiceArgDef | TextArgDef;
export type ArgValue = number | number[] | string;
export type ArgValues = Readonly<Record<string, ArgValue>>;

export interface ActionVariant {
  id: string;
  label: string;
  /** argumenty jen této varianty (k argumentům akce) */
  args?: readonly ArgDef[];
  /** vysvětlivka k variantě */
  title?: string;
}

export interface ActionDef {
  id: string;
  /** název operace jako v pseudokódu: „Push(x)“, „ExtractMin“, „Vytvořit“ */
  label: string;
  args?: readonly ArgDef[];
  /** varianty (Vytvořit ▸ Náhodně / Vlastní …); první je výchozí */
  variants?: readonly ActionVariant[];
  /**
   * Která varianta je zvýrazněná (aria-pressed) – když stránka ví, co je právě zobrazené (např. graf
   * z obr. 5.4, nebo vlastní graf = null, žádná). Bez vlastnosti se zvýrazní zvolená varianta jako dřív.
   */
  selectedVariant?: string | null;
  /** proč akce teď nejde provést (prázdná struktura, plná…); null/undefined = jde */
  disabledReason?: string | null;
  /** vysvětlivka (title) u povolené akce */
  title?: string;
  /** text tlačítka provedení, výchozí „Provést“ */
  goLabel?: string;
  /** kontrola argumentů dohromady (P a N nesoudělná…): důvod, proč akci neprovést, nebo null */
  check?: (values: ArgValues, variant: string | null) => string | null;
  /** upozornění na úpravu vstupu podle více argumentů (hodnoty mod 17 v ℤ₁₇…); akce se provede */
  notice?: (values: ArgValues, variant: string | null) => string | null;
  /** provedení s platnými argumenty; `variant` = id zvolené varianty nebo null */
  run: (values: ArgValues, variant: string | null) => void;
}

/* ------------------------------------------------------------------ stav */

export interface MenuState {
  /** otevřená akce (rozbalené argumenty) */
  open: string | null;
  /** zvolená varianta podle id akce */
  variant: Readonly<Record<string, string>>;
  /** text polí podle jména argumentu (u volby hodnota); chybí = výchozí hodnota */
  texts: Readonly<Record<string, string>>;
  /** naposledy provedená akce (cíl výběru klikem, když nic není otevřené) */
  lastRun: string | null;
}

export type MenuAction =
  | { type: "toggle"; id: string }
  | { type: "open"; id: string }
  | { type: "close" }
  | { type: "variant"; id: string; variant: string }
  /** `user` = napsal uživatel (smaže varování k provedené akci); bez něj stránka pole jen sesynchronizovala */
  | { type: "text"; name: string; text: string; user?: boolean }
  /** klik na prvek plátna: vyplní číslo (nebo text) do argumentu cílové akce a tu otevře */
  | { type: "pick"; defs: readonly ActionDef[]; value: number | string }
  /** akce proběhla: zapamatovat použité hodnoty; `collapse` = sbalit (úzká obrazovka) */
  | { type: "ran"; id: string; values: ArgValues; collapse: boolean };

export function initialMenu(defs: readonly ActionDef[]): MenuState {
  const variant: Record<string, string> = {};
  for (const d of defs)
    if (d.variants?.length) variant[d.id] = d.variants[0].id;
  return { open: null, variant, texts: {}, lastRun: null };
}

const fmtList = (v: readonly number[]) =>
  v.map((n) => String(n).replace("-", "−")).join(", ");

function defaultText(def: ArgDef): string {
  switch (def.kind) {
    case "int":
      return String(def.default).replace("-", "−");
    case "list":
      return fmtList(def.default);
    case "choice":
      return def.default ?? def.options[0]?.value ?? "";
    case "text":
      return def.default;
  }
}

/** Text pole argumentu: naposledy zadaný, jinak výchozí hodnota. */
export function argText(st: MenuState, def: ArgDef): string {
  return st.texts[def.name] ?? defaultText(def);
}

/** Argumenty akce včetně argumentů zvolené varianty. */
export function actionArgs(def: ActionDef, st: MenuState): readonly ArgDef[] {
  const v = def.variants?.find((x) => x.id === st.variant[def.id]);
  return [...(def.args ?? []), ...(v?.args ?? [])];
}

/** Zvolená varianta akce (null u akce bez variant). */
export function currentVariant(
  def: ActionDef,
  st: MenuState,
): ActionVariant | null {
  if (!def.variants?.length) return null;
  return (
    def.variants.find((x) => x.id === st.variant[def.id]) ?? def.variants[0]
  );
}

/* ------------------------------------------------------------------ validace */

export interface ArgCheck {
  /** platná hodnota; undefined = nejde použít */
  value?: ArgValue;
  /** proč nejde použít (Go je zablokované) */
  error: string | null;
  /** co se ze vstupu nepoužilo (Go jde) */
  note: string | null;
}

function chars(n: number): string {
  return `${n} ${n === 1 ? "znak" : n >= 2 && n <= 4 ? "znaky" : "znaků"}`;
}

export function validateArg(def: ArgDef, text: string): ArgCheck {
  const c = baseCheck(def, text);
  if (c.value === undefined) return c;
  const error = def.check?.(c.value);
  if (error) return { error, note: null };
  const notice = def.notice?.(c.value);
  return notice ? { ...c, note: c.note ? `${c.note} ${notice}` : notice } : c;
}

function baseCheck(def: ArgDef, text: string): ArgCheck {
  switch (def.kind) {
    case "int": {
      const v = parseIntStrict(text, def).value;
      return v === null
        ? { error: `Zadejte ${describeRange(def)}.`, note: null }
        : { value: v, error: null, note: null };
    }
    case "list": {
      const opts = {
        min: def.min,
        max: def.max,
        maxCount: def.maxCount,
        integerOnly: def.integerOnly,
      };
      const r = parseNumberList(text, opts);
      if (def.strict && r.ignored.length > 0) {
        const bad = r.ignored[0];
        const isNum = parseNumberList(bad, {
          integerOnly: def.integerOnly,
        }).values.length;
        return {
          error: `‚${bad}‘ ${isNum ? "je mimo rozsah" : "není číslo"} – zadejte ${describeRange(opts, true)} oddělená mezerou.`,
          note: null,
        };
      }
      const msg = listStatus(r, opts);
      if (r.values.length === 0 && !(def.allowEmpty && r.ignored.length === 0))
        return { error: msg, note: null };
      return {
        value: r.values,
        error: null,
        note: r.values.length ? msg : null,
      };
    }
    case "choice":
      return def.options.some((o) => o.value === text)
        ? { value: text, error: null, note: null }
        : { error: "Vyberte jednu z možností.", note: null };
    case "text": {
      if (def.maxLength !== undefined && [...text].length > def.maxLength)
        return { error: `Nejvýše ${chars(def.maxLength)}.`, note: null };
      if (def.pattern && !def.pattern.test(text))
        return {
          error: `Povoleno: ${def.patternHint ?? def.pattern.source}.`,
          note: null,
        };
      return { value: text, error: null, note: null };
    }
  }
}

export type GoResult =
  | { ok: true; values: Record<string, ArgValue>; variant: string | null }
  | { ok: false; reason: string };

/** Lze akci provést? Vrací hodnoty argumentů podle jmen, nebo důvod (zakázaná akce, první chyba pole). */
export function prepareGo(def: ActionDef, st: MenuState): GoResult {
  if (def.disabledReason) return { ok: false, reason: def.disabledReason };
  const values: Record<string, ArgValue> = {};
  for (const a of actionArgs(def, st)) {
    const c = validateArg(a, argText(st, a));
    if (c.value === undefined)
      return {
        ok: false,
        reason: `${a.label}: ${c.error ?? "neplatná hodnota"}`,
      };
    values[a.name] = c.value;
  }
  const variant = currentVariant(def, st)?.id ?? null;
  const why = def.check?.(values, variant);
  if (why) return { ok: false, reason: why };
  return { ok: true, values, variant };
}

/** Upozornění k provedení akce: první poznámka pole, jinak upozornění akce (notice); null = žádné. */
export function goNote(def: ActionDef, st: MenuState): string | null {
  const field = actionArgs(def, st)
    .map((a) => validateArg(a, argText(st, a)).note)
    .find((n) => n);
  if (field) return field;
  const r = prepareGo(def, st);
  return r.ok ? (def.notice?.(r.values, r.variant) ?? null) : null;
}

/* ------------------------------------------------------------------ výběr klikem */

function firstOf(
  def: ActionDef | undefined,
  st: MenuState,
  kind: "int" | "text",
): string | null {
  if (!def || def.disabledReason) return null;
  return actionArgs(def, st).find((a) => a.kind === kind)?.name ?? null;
}

/**
 * Kam patří hodnota z kliknutí na plátno: otevřená akce, jinak naposledy provedená, jinak první povolená
 * akce s argumentem daného druhu. null = žádná akce takový argument nebere.
 */
export function pickTarget(
  defs: readonly ActionDef[],
  st: MenuState,
  kind: "int" | "text" = "int",
): { id: string; name: string } | null {
  const byId = (id: string | null) => defs.find((d) => d.id === id);
  for (const d of [byId(st.open), byId(st.lastRun), ...defs]) {
    const name = firstOf(d, st, kind);
    if (d && name) return { id: d.id, name };
  }
  return null;
}

/* ------------------------------------------------------------------ přechody */

export function menuReducer(st: MenuState, a: MenuAction): MenuState {
  switch (a.type) {
    case "toggle":
      return { ...st, open: st.open === a.id ? null : a.id };
    case "open":
      return st.open === a.id ? st : { ...st, open: a.id };
    case "close":
      return st.open === null ? st : { ...st, open: null };
    case "variant":
      return { ...st, variant: { ...st.variant, [a.id]: a.variant } };
    case "text":
      return { ...st, texts: { ...st.texts, [a.name]: a.text } };
    case "pick": {
      const kind = typeof a.value === "number" ? "int" : "text";
      const t = pickTarget(a.defs, st, kind);
      if (!t) return st;
      const text =
        typeof a.value === "number"
          ? String(a.value).replace("-", "−")
          : a.value;
      return { ...st, open: t.id, texts: { ...st.texts, [t.name]: text } };
    }
    case "ran": {
      const texts: Record<string, string> = { ...st.texts };
      for (const [name, v] of Object.entries(a.values)) {
        if (Array.isArray(v)) texts[name] = fmtList(v);
        else if (typeof v === "number")
          texts[name] = String(v).replace("-", "−");
      }
      return {
        ...st,
        texts,
        lastRun: a.id,
        open: a.collapse ? null : st.open,
      };
    }
  }
}

/* ------------------------------------------------------------------ pomůcky pro stránky */

/** Číselný argument z `values` (stránka ví, že ho akce má). */
export function numArg(values: ArgValues, name: string): number {
  const v = values[name];
  if (typeof v !== "number") throw new Error(`argument ${name} není číslo`);
  return v;
}

/** Seznam čísel z `values`. */
export function listArg(values: ArgValues, name: string): number[] {
  const v = values[name];
  if (!Array.isArray(v)) throw new Error(`argument ${name} není seznam`);
  return v;
}

/** Text nebo volba z `values`. */
export function strArg(values: ArgValues, name: string): string {
  const v = values[name];
  if (typeof v !== "string") throw new Error(`argument ${name} není text`);
  return v;
}
