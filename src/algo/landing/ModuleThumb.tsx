import {
  Component,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import {
  PREVIEWS,
  placeholderArt,
  placeholderKind,
  thumbKind,
} from "./previews";
import type { Preview } from "./previewTypes";

/** S jakým předstihem (px) se kresba připraví, než karta vjede do okna. */
const NEAR_MARGIN = "300px 0px";

/** Cesty, jejichž karta už byla blízko záběru – po skrytí filtrem a novém připojení se kreslí hned. */
const seenNear = new Set<string>();

/**
 * Je prvek blízko záběru? Jednou `true` už zůstane (kresba se nemaže), i po novém připojení karty
 * se stejnou cestou. Bez IntersectionObserver (jsdom, starý prohlížeč) hned `true`.
 */
function useNearViewport<T extends Element>(
  key: string,
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(
    () => typeof IntersectionObserver === "undefined" || seenNear.has(key),
  );
  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          seenNear.add(key);
          setNear(true);
        }
      },
      { rootMargin: NEAR_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, key]);
  return [ref, near];
}

/** Chyba v kresbě náhledu nesmí shodit přehled – ukáže se zástupce skupiny. */
class ThumbBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Hotové kresby podle náhledu: `render()` počítá celé kroky výchozí operace (k-d strom, sufixy,
 * stránkování…), takže se volá jednou – ne při každém znaku v hledání nebo přepnutí filtru.
 */
const artCache = new WeakMap<Preview, ReactElement>();

/** Kresba náhledu jako vlastní komponenta – výjimku z ní pak zachytí ThumbBoundary. */
function PreviewArt({ preview }: { preview: Preview }) {
  let art = artCache.get(preview);
  if (!art) {
    art = preview.render();
    artCache.set(preview, art);
  }
  return art;
}

/** Běžné měřítko HTML náhledu (tabulky, karty procesů); menší jen tehdy, když by se obsah nevešel. */
const HTML_THUMB_ZOOM = 0.5;

/** Měřítko HTML pohledu, aby se jeho přirozená velikost (při zoom 1) vešla do náhledu. */
function htmlThumbZoom(
  content: { w: number; h: number },
  box: { w: number; h: number },
): number {
  if (content.w <= 0 || content.h <= 0 || box.w <= 0 || box.h <= 0)
    return HTML_THUMB_ZOOM;
  return Math.min(HTML_THUMB_ZOOM, box.w / content.w, box.h / content.h);
}

/** HTML náhled: změří obsah a zmenší ho, aby nebyl oříznutý (např. telefon – jiná šířka karty). */
function useFitHtml(ref: RefObject<HTMLDivElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const art = ref.current?.querySelector<HTMLElement>(".thumb-art");
    const content = art?.firstElementChild as HTMLElement | null | undefined;
    if (!active || !art || !content) return;
    const fit = () => {
      content.style.zoom = "1";
      const c = content.getBoundingClientRect();
      const b = art.getBoundingClientRect();
      if (!c.width || !b.width) {
        content.style.zoom = ""; // bez rozložení (jsdom) zůstane měřítko z CSS
        return;
      }
      let z = htmlThumbZoom(
        { w: c.width, h: c.height },
        { w: b.width, h: b.height },
      );
      content.style.zoom = String(z);
      // zoom není úplně lineární (zalomení textu, zaokrouhlení písma) – jedna oprava podle skutečné velikosti
      const after = content.getBoundingClientRect();
      const fix = Math.min(1, b.width / after.width, b.height / after.height);
      if (fix < 0.995) {
        z *= fix;
        content.style.zoom = String(z);
      }
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    let w = art.clientWidth;
    const ro = new ResizeObserver(() => {
      if (art.clientWidth === w) return;
      w = art.clientWidth;
      fit();
    });
    ro.observe(art);
    return () => ro.disconnect();
  }, [ref, active]);
}

/**
 * Mini-kresba modulu na kartě úvodní stránky: statický náhled výchozího příkladu (registr PREVIEWS),
 * nebo zástupce skupiny. Jen obrázek – skrytý pro čtečky (název nese odkaz karty), bez ovládání.
 */
export function ModuleThumb({ path, group }: { path: string; group: string }) {
  const [ref, near] = useNearViewport<HTMLDivElement>(path);
  const preview = thumbKind(path) === "preview" ? PREVIEWS[path] : undefined;
  useFitHtml(ref, !!preview?.html && near);
  const placeholder = (
    <div className="thumb-art">{placeholderArt(placeholderKind(group))}</div>
  );
  const state = !preview ? "placeholder" : near ? "preview" : "pending";
  return (
    <div
      ref={ref}
      className={"thumb thumb-" + state + (preview?.html ? " thumb-html" : "")}
      aria-hidden="true"
    >
      {state === "placeholder" && placeholder}
      {state === "preview" && preview && (
        <ThumbBoundary fallback={placeholder}>
          <div className="thumb-art">
            <PreviewArt preview={preview} />
          </div>
        </ThumbBoundary>
      )}
    </div>
  );
}
