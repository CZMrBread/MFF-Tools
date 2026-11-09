import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { readableSearch } from "./linkParams";

/**
 * Zápis, který router ještě nevykreslil. Sdílený všemi instancemi hooku: víc setterů v jedné obsluze
 * (i z různých useUrlParam na stejné stránce) tak navazuje na předchozí zápis a nepřepisuje ho.
 * `from` je adresa (cesta + query), ze které zápis vyšel – po překreslení nebo jiné navigaci už neplatí.
 */
let pending: { from: string; to: URLSearchParams } | null = null;

/**
 * Jeden parametr v adrese za hashem (`#/sort/quick?a=38,27,43`) – vstup stránky pak jde sdílet odkazem.
 * Funguje uvnitř HashRouteru i MemoryRouteru. Zápis nahrazuje položku historie (tlačítko Zpět nezahlcuje)
 * a stejná hodnota se podruhé nezapisuje. Adresa je čitelná (`a=4,2,8`, ne `a=4%2C2%2C8`, viz linkParams);
 * staré odkazy s `%2C` se čtou stejně. Víc zápisů v jedné obsluze se skládá (`setA(…); setB(…)` zapíše oba).
 *
 *   const [a, setA] = useUrlParam('a')            // string | null
 *   setA(values.join(','))                         // null nebo '' parametr odstraní
 *
 * `set` má stabilní identitu, smí tedy do závislostí efektu.
 */
export function useUrlParam(
  name: string,
): [string | null, (value: string | null) => void] {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const value = params.get(name);

  // navigate i params mění identitu s každou změnou adresy → poslední verze držíme v refu
  const latest = useRef({ params, navigate, where: pathname + search });
  useEffect(() => {
    latest.current = { params, navigate, where: pathname + search };
    // router vykreslil novou adresu → rozpracovaný zápis už je v ní (nebo ho přebila jiná navigace)
    if (pending && pending.from !== latest.current.where) pending = null;
  });

  const set = useCallback(
    (next: string | null) => {
      const { params, navigate, where } = latest.current;
      const base = pending && pending.from === where ? pending.to : params;
      const wanted = next ?? "";
      if ((base.get(name) ?? "") === wanted) return;
      const copy = new URLSearchParams(base);
      if (wanted === "") copy.delete(name);
      else copy.set(name, wanted);
      pending = { from: where, to: copy };
      void navigate({ search: readableSearch(copy) }, { replace: true });
    },
    [name],
  );

  return [value, set];
}
