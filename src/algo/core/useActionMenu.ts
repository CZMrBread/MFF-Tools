/**
 * Stav nabídky operací (ActionMenu): hook nad čistým modelem actionModel.ts.
 * Komponenta je v ActionMenu.tsx; viz tam příklad použití.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  goNote,
  initialMenu,
  menuReducer,
  prepareGo,
  type ActionDef,
  type GoResult,
  type MenuAction,
  type MenuState,
} from "./actionModel";
import { FIT_MEDIA, mediaMatches } from "./layoutMedia";

/** pod touto šířkou se menu po provedení akce sbalí (plátno je pak hned vidět) */
export const COLLAPSE_MEDIA = "(max-width: 700px)";

export interface ActionMenuControl {
  defs: readonly ActionDef[];
  state: MenuState;
  dispatch: (a: MenuAction) => void;
  /** provede akci s aktuálními argumenty (jako Provést / Enter); vrací výsledek validace */
  go: (id: string) => GoResult;
  /** hodnota z kliknutí na plátno → argument otevřené (nebo naposledy použité) akce */
  pick: (value: number | string) => void;
  close: () => void;
  /**
   * Varování k naposledy provedené akci („Ignorováno: x“ – zahozené položky vstupu). Zůstává po
   * sbalení akce, dokud uživatel nezačne psát, neotevře akci nebo neprovede další operaci.
   */
  ranNote?: string | null;
  /** požadavek na fokus po příští změně (interní pro ActionMenu) */
  focusRef: RefObject<FocusRequest | null>;
}

/** kam po příštím renderu přesunout fokus: první pole / Provést otevřené akce, nebo tlačítko akce `id` */
export interface FocusRequest {
  to: "field" | "go" | "action";
  id?: string;
  /** fokus se vrací po provedení operace: tlačítko dostane data-am-ran (mezerník pak přehrává) */
  ran?: boolean;
}

/**
 * Sbalit akci po provedení? Na telefonu (plátno je nad akcemi) a na desktopu na jednu obrazovku
 * (FIT_MEDIA): otevřená akce tam ubírá výšku plátnu, takže by se obrázek při každé operaci zmenšil.
 */
function compact(): boolean {
  return mediaMatches(COLLAPSE_MEDIA) || mediaMatches(FIT_MEDIA);
}

/**
 * Stav nabídky. `defs` se smí měnit s každým renderem (disabledReason podle stavu struktury) – hook si
 * drží poslední. Argumenty si pamatuje po celou dobu života stránky.
 */
export function useActionMenu(defs: readonly ActionDef[]): ActionMenuControl {
  const [state, setState] = useState<MenuState>(() => initialMenu(defs));
  // aktuální stav i mimo render (pick a go v jedné obsluze na sebe navazují)
  const ref = useRef(state);
  const defsRef = useRef(defs);
  useEffect(() => {
    defsRef.current = defs;
  });
  const focusRef = useRef<FocusRequest | null>(null);
  const [ranNote, setRanNote] = useState<string | null>(null);

  const dispatch = useCallback((a: MenuAction) => {
    // varování k provedené akci smaže až psaní uživatele, ne doplnění pole stránkou po běhu
    if ((a.type === "text" && a.user) || a.type === "toggle") setRanNote(null);
    const next = menuReducer(ref.current, a);
    if (next === ref.current) return;
    ref.current = next;
    setState(next);
  }, []);

  const go = useCallback(
    (id: string): GoResult => {
      const def = defsRef.current.find((d) => d.id === id);
      if (!def) return { ok: false, reason: `neznámá akce ${id}` };
      const r = prepareGo(def, ref.current);
      if (!r.ok) return r;
      const collapse = compact();
      setRanNote(goNote(def, ref.current));
      // sbalená akce: fokus z jejího (zmizelého) pole zpět na tlačítko akce, ne na <body>
      if (collapse && ref.current.open === id)
        focusRef.current = { to: "action", id, ran: true };
      dispatch({ type: "ran", id, values: r.values, collapse });
      def.run(r.values, r.variant);
      return r;
    },
    [dispatch],
  );

  const pick = useCallback(
    (value: number | string) => {
      focusRef.current = { to: "go" };
      dispatch({ type: "pick", defs: defsRef.current, value });
    },
    [dispatch],
  );
  const close = useCallback(() => dispatch({ type: "close" }), [dispatch]);

  return useMemo(
    () => ({ defs, state, dispatch, go, pick, close, ranNote, focusRef }),
    [defs, state, dispatch, go, pick, close, ranNote],
  );
}
