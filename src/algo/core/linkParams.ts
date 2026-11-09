/**
 * Čitelné odkazy (rozhodnutí vlastníka E7, 7. 11. 2026): `#/sort/quick?a=4,2,8` místo `?a=4%2C2%2C8`.
 *
 * URLSearchParams.toString kóduje vše kromě písmen, číslic a `*-._`. V hodnotě parametru za hashem jsou ale
 * bezpečné i `, : ; / @ ! $ ~` – nemají v dotazu zvláštní význam a prohlížeč ani běžné aplikace je v odkazu
 * nepřekódují. Ty se proto vrací do čitelné podoby. Oddělovače `& = + # % ?`, apostrof, mezera (`+`)
 * a znaky mimo ASCII zůstávají zakódované. Čtení se nemění: `new URLSearchParams` dekóduje obě podoby
 * stejně, takže staré odkazy s `%2C` fungují dál.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  createSearchParams,
  useLocation,
  useNavigate,
  type NavigateOptions,
  type URLSearchParamsInit,
} from "react-router-dom";

/** `%XX` bezpečných znaků → znak (velká i malá písmena v kódu) */
const SAFE: Record<string, string> = {
  "2C": ",",
  "3A": ":",
  "3B": ";",
  "2F": "/",
  "40": "@",
  "21": "!",
  "24": "$",
  "7E": "~",
  "2A": "*",
};
const SAFE_RE = /%(2C|3A|3B|2F|40|21|24|7E|2A)/gi;

function unescapeSafe(query: string): string {
  return query.replace(
    SAFE_RE,
    (m, hex: string) => SAFE[hex.toUpperCase()] ?? m,
  );
}

/** Parametry → `?a=4,2,8&b=x` (prázdné → ""), pro navigate / odkazy. */
export function readableSearch(
  params: URLSearchParams | URLSearchParamsInit,
): string {
  const s = createSearchParams(params).toString();
  return s ? `?${unescapeSafe(s)}` : "";
}

/**
 * Celá adresa stránky (`window.location.href`) s čitelným dotazem za hashem – pro „Kopírovat odkaz“.
 * Cesta i případný dotaz před `#` (server) zůstávají beze změny.
 */
export function readableHref(href: string): string {
  const hash = href.indexOf("#");
  if (hash < 0) return href;
  const q = href.indexOf("?", hash);
  if (q < 0) return href;
  return href.slice(0, q) + unescapeSafe(href.slice(q));
}

/**
 * Náhrada `useSearchParams` z react-router se stejným rozhraním, která do adresy zapisuje čitelný dotaz
 * (readableSearch). Stránky ji používají místo `useSearchParams`:
 *
 *   const [params, setParams] = useLinkSearchParams();
 *   setParams(next, { replace: true });
 *
 * `setParams` přijímá URLSearchParams, objekt, pole dvojic, řetězec i funkci (prev) => next a má stabilní identitu.
 */
export function useLinkSearchParams(): [
  URLSearchParams,
  (
    next:
      URLSearchParamsInit | ((prev: URLSearchParams) => URLSearchParamsInit),
    options?: NavigateOptions,
  ) => void,
] {
  const { search } = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  // params i navigate mění identitu s adresou → setter čte poslední verzi z refu (stabilní identita)
  const latest = useRef({ params, navigate });
  useEffect(() => {
    latest.current = { params, navigate };
  });

  const setParams = useCallback(
    (
      next:
        URLSearchParamsInit | ((prev: URLSearchParams) => URLSearchParamsInit),
      options?: NavigateOptions,
    ) => {
      const { params, navigate } = latest.current;
      const value =
        typeof next === "function" ? next(new URLSearchParams(params)) : next;
      void navigate({ search: readableSearch(value) }, options);
    },
    [],
  );
  return [params, setParams];
}
