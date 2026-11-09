import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import {
  HashRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  filterCategories,
  formatSource,
  isKnownPath,
  moduleByPath,
  type RoutePattern,
} from "./registry";
import { ThemeToggle } from "./core/ThemeToggle";
import { prefersReducedMotion } from "./core/stepTransition";
import { revealTop } from "./AppScroll";
import { ErrorBoundary } from "./core/ErrorBoundary";
import { ModuleSourceContext } from "./core/moduleSource";
import { Landing } from "./landing/Landing";
import { APP_TITLE, type UnknownState } from "./landing/landingModel";
import { rememberModule } from "./landing/recent";
import { SortingPage } from "./algos/sorting/SortingPage";
import { ListPage } from "./algos/structures/ListPage";
import { HeapPage } from "./algos/structures/HeapPage";
import { SegTreePage } from "./algos/structures/SegTreePage";
import { TreePage } from "./algos/trees/TreePage";
import { GraphPage } from "./algos/graphs/GraphPage";
import { ABTreePage } from "./algos/trees/ABTreePage";
import { PagingPage } from "./algos/cache/PagingPage";

/**
 * Stránka načtená až při otevření (vlastní chunk). Moduly fáze 2 (kap. 13, 15, 17) – každá stránka je
 * ve svém souboru, takže na nich můžou souběžně pracovat různé stopy, aniž by sahaly do App.tsx.
 */
function lazyPage<M>(
  load: () => Promise<M>,
  pick: (m: M) => ComponentType,
): ComponentType {
  return lazy(() => load().then((m) => ({ default: pick(m) })));
}
const KmpPage = lazyPage(
  () => import("./algos/strings/KmpPage"),
  (m) => m.KmpPage,
);
const AhoCorasickPage = lazyPage(
  () => import("./algos/strings/AhoCorasickPage"),
  (m) => m.AhoCorasickPage,
);
const RabinKarpPage = lazyPage(
  () => import("./algos/strings/RabinKarpPage"),
  (m) => m.RabinKarpPage,
);
const GatesPage = lazyPage(
  () => import("./algos/parallel/GatesPage"),
  (m) => m.GatesPage,
);
const AdderPage = lazyPage(
  () => import("./algos/parallel/AdderPage"),
  (m) => m.AdderPage,
);
const SortNetPage = lazyPage(
  () => import("./algos/parallel/SortNetPage"),
  (m) => m.SortNetPage,
);
const FftPage = lazyPage(
  () => import("./algos/fourier/FftPage"),
  (m) => m.FftPage,
);
const FftNetPage = lazyPage(
  () => import("./algos/fourier/FftNetPage"),
  (m) => m.FftNetPage,
);
// Starší stránky, jejichž kód náhledy na úvodní stránce nepotřebují – líně, aby chunk AlgoPage zůstal pod
// 500 kB (build bez varování; fáze 4 ho přes náhledy nových modulů přerostla). Řazení, stromy, stránkování
// a další zůstávají v AlgoPage (SSR testy routování je vykreslují synchronně).
const AmortizedPage = lazyPage(
  () => import("./algos/amortized/AmortizedPage"),
  (m) => m.AmortizedPage,
);
const SuffixPage = lazyPage(
  () => import("./algos/strings/SuffixPage"),
  (m) => m.SuffixPage,
);
const HashPage = lazyPage(
  () => import("./algos/hashing/HashPage"),
  (m) => m.HashPage,
);
const CuckooPage = lazyPage(
  () => import("./algos/hashing/CuckooBloomPage"),
  (m) => m.CuckooPage,
);
const BloomPage = lazyPage(
  () => import("./algos/hashing/CuckooBloomPage"),
  (m) => m.BloomPage,
);
const KdTreePage = lazyPage(
  () => import("./algos/geometry/KdTreePage"),
  (m) => m.KdTreePage,
);
const LockFreePage = lazyPage(
  () => import("./algos/parallel/LockFreePage"),
  (m) => m.LockFreePage,
);
// fáze 4 (toky, dynamické programování, konvexní obal, LLRB); grafové algoritmy jdou přes /graph/:id
const FordFulkersonPage = lazyPage(
  () => import("./algos/flows/FordFulkersonPage"),
  (m) => m.FordFulkersonPage,
);
const DinicPage = lazyPage(
  () => import("./algos/flows/DinicPage"),
  (m) => m.DinicPage,
);
const GoldbergPage = lazyPage(
  () => import("./algos/flows/GoldbergPage"),
  (m) => m.GoldbergPage,
);
const EditDistancePage = lazyPage(
  () => import("./algos/dp/EditDistancePage"),
  (m) => m.EditDistancePage,
);
const LisPage = lazyPage(
  () => import("./algos/dp/LisPage"),
  (m) => m.LisPage,
);
const HullPage = lazyPage(
  () => import("./algos/geometry/HullPage"),
  (m) => m.HullPage,
);
const LlrbPage = lazyPage(
  () => import("./algos/trees/LlrbPage"),
  (m) => m.LlrbPage,
);

/** Stránka pro každý vzor cesty z registry.ts (chybějící vzor = chyba typu). */
const PAGES: Record<RoutePattern, ComponentType> = {
  "/sort/:id": SortingPage,
  "/ds/heap": HeapPage,
  "/ds/segtree": SegTreePage,
  "/ds/:id": ListPage,
  "/tree/ab": ABTreePage,
  "/tree/llrb": LlrbPage,
  "/tree/:id": TreePage,
  "/ds2/:id": AmortizedPage,
  "/cache/paging": PagingPage,
  "/string/suffix": SuffixPage,
  "/string/kmp": KmpPage,
  "/string/aho-corasick": AhoCorasickPage,
  "/string/rabin-karp": RabinKarpPage,
  "/hash/cuckoo": CuckooPage,
  "/hash/bloom": BloomPage,
  "/hash/:id": HashPage,
  "/geom/kdtree": KdTreePage,
  "/geom/hull": HullPage,
  "/flow/ford-fulkerson": FordFulkersonPage,
  "/flow/dinic": DinicPage,
  "/flow/goldberg": GoldbergPage,
  "/dp/edit": EditDistancePage,
  "/dp/lis": LisPage,
  "/parallel/lockfree": LockFreePage,
  "/parallel/gates": GatesPage,
  "/parallel/adder": AdderPage,
  "/parallel/sortnet": SortNetPage,
  "/fft/fft": FftPage,
  "/fft/net": FftNetPage,
  "/graph/:id": GraphPage,
};

/** Neznámé :id (#/sort/foo, #/ds/constructor…) nesmí potichu ukázat první modul – přesměruje na přehled. */
function KnownOnly({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (!isKnownPath(pathname))
    return (
      <Navigate
        to="/"
        replace
        state={{ unknown: pathname } satisfies UnknownState}
      />
    );
  return children;
}

/** Úzká obrazovka (menu se vysouvá) – stejná hranice jako v index.css. */
const NARROW = "(max-width: 900px)";
function subscribeNarrow(cb: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => {};
  const mq = window.matchMedia(NARROW);
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}
function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia(NARROW).matches,
    () => false,
  );
}

interface SearchProps {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  /** ↓ v poli: přejít do výsledků */
  onArrowDown?: () => void;
  label: string;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
}

function SearchField({
  value,
  onChange,
  onEnter,
  onArrowDown,
  label,
  placeholder = "Hledat algoritmus nebo strukturu…",
  inputRef,
}: SearchProps) {
  return (
    <input
      ref={inputRef}
      type="search"
      className="search-field"
      value={value}
      placeholder={placeholder}
      aria-label={label}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        } else if (e.key === "ArrowDown" && onArrowDown) {
          e.preventDefault();
          onArrowDown();
        } else if (e.key === "Escape" && value) {
          // první Escape vymaže hledání, teprve další zavře menu
          e.stopPropagation();
          onChange("");
        }
      }}
    />
  );
}

function Sidebar({
  id,
  open,
  hidden,
  onNavigate,
  onClose,
  focusRef,
}: {
  id: string;
  open: boolean;
  /** zavřené menu na úzké obrazovce: mimo pořadí Tab i čtečky */
  hidden: boolean;
  onNavigate: () => void;
  /** zavřít menu (tlačítko ✕ v otevřeném menu na úzké obrazovce) */
  onClose: () => void;
  /** prvek, na který jde fokus po otevření menu (✕ – na telefonu nevyskočí klávesnice jako u hledání) */
  focusRef: Ref<HTMLButtonElement>;
}) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const shown = filterCategories(query);
  const searching = query.trim() !== "";
  const found = shown.reduce((n, c) => n + c.modules.length, 0);
  const navRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { pathname } = useLocation();
  const revealed = useRef(false);

  // otevřený modul (i po reloadu) posunout do záběru jen uvnitř lišty – scrollIntoView by hýbal i oknem
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!nav || !link) return;
    const v = nav.getBoundingClientRect();
    const r = link.getBoundingClientRect();
    const top = revealTop(
      { top: v.top, height: v.height, scrollTop: nav.scrollTop },
      r,
    );
    // první posun (načtení stránky) hned, další plynule – s „omezit pohyb“ vždy bez animace
    const smooth = revealed.current && !prefersReducedMotion();
    revealed.current = true;
    if (top === null) return;
    if (typeof nav.scrollTo === "function")
      nav.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    else nav.scrollTop = top;
  }, [pathname]);
  /** ↓ / ↑ mezi výsledky hledání (Tab funguje dál); ↑ z prvního zpět do pole */
  const moveFocus = (from: Element | null, delta: number) => {
    const links = [
      ...(navRef.current?.querySelectorAll<HTMLElement>(".nav-cat a") ?? []),
    ];
    const i = from ? links.indexOf(from as HTMLElement) : -1;
    const next = i + delta;
    if (next < 0) searchRef.current?.focus();
    else links[Math.min(next, links.length - 1)]?.focus();
  };
  return (
    <nav
      ref={navRef}
      id={id}
      className={"sidebar" + (open ? " open" : "")}
      aria-label="Moduly"
      inert={hidden}
    >
      <Link to="/" className="brand" onClick={onNavigate}>
        ⌬ Algoritmy
      </Link>
      <button
        ref={focusRef}
        type="button"
        className="sidebar-close"
        onClick={onClose}
        aria-label="Zavřít menu"
      >
        <span aria-hidden="true">✕</span>
      </button>
      <ThemeToggle />
      <SearchField
        value={query}
        onChange={setQuery}
        label="Hledat v menu"
        placeholder="Hledat modul…"
        inputRef={searchRef}
        onArrowDown={() => moveFocus(null, 1)}
        onEnter={() => {
          if (!shown[0]) return;
          navigate(shown[0].modules[0].path);
          setQuery("");
          onNavigate();
        }}
      />
      {searching && shown.length === 0 && (
        <p className="nav-empty">Nic nenalezeno.</p>
      )}
      <p className="sr-only" role="status">
        {searching && found > 0
          ? `${found} ${found === 1 ? "výsledek" : found < 5 ? "výsledky" : "výsledků"}, Enter otevře první`
          : ""}
      </p>
      {shown.map((c, ci) => (
        <div key={c.title} className="nav-cat">
          <h2 className="nav-cat-title">{c.title}</h2>
          <ul>
            {c.modules.map((m, mi) => (
              <li key={m.path}>
                <NavLink
                  to={m.path}
                  onClick={onNavigate}
                  title={m.desc}
                  // první výsledek hledání = cíl Enteru v poli (značka ↵ v CSS)
                  className={({ isActive }) =>
                    [
                      isActive && "active",
                      searching && ci === 0 && mi === 0 && "enter-target",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                    e.preventDefault();
                    moveFocus(e.currentTarget, e.key === "ArrowDown" ? 1 : -1);
                  }}
                >
                  {m.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Kostra aplikace uvnitř routeru (App ji obalí HashRouterem, testy MemoryRouterem). */
export function Shell() {
  const location = useLocation();
  const { pathname } = location;
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  const menuOpen = open && narrow;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuFocusRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const shownPath = useRef(pathname);
  const mod = moduleByPath(pathname);

  // zavření z klávesnice (Escape, ✕) vrátí fokus na ☰ – až po renderu, kdy lišta přestane být inert
  const returnFocus = useRef(false);
  const closeToToggle = () => {
    returnFocus.current = true;
    setOpen(false);
  };
  useEffect(() => {
    if (menuOpen || !returnFocus.current) return;
    returnFocus.current = false;
    toggleRef.current?.focus();
  }, [menuOpen]);

  // otevřené menu: Escape ho zavře, stránka pod ním se neposouvá, fokus jde do menu
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeToToggle();
    };
    document.addEventListener("keydown", onKey);
    // stránka pod otevřeným menu se nemá posouvat
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menuFocusRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  // otevřený modul do „Naposledy otevřené“ na přehledu (klíč algo-recent; přehled ani neznámé cesty ne)
  const modPath = mod?.path;
  useEffect(() => {
    if (modPath) rememberModule(modPath);
  }, [modPath]);

  // přechod na jiný modul: nahoru a fokus na nadpis (čtečka ohlásí novou stránku); ne při prvním načtení
  useEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    window.scrollTo(0, 0);
    const main = mainRef.current;
    const h1 = main?.querySelector("h1");
    const target: HTMLElement | null | undefined = h1 ?? main;
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }, [pathname]);

  const close = () => setOpen(false);
  const focusMain = () => {
    const main = mainRef.current;
    if (!main) return;
    main.focus();
    main.scrollIntoView?.();
  };

  return (
    <div className={"layout" + (menuOpen ? " menu-open" : "")}>
      {/* odkaz na obsah: v HashRouteru nesmí změnit hash (#main by byl cesta), proto ručně */}
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          focusMain();
        }}
      >
        Přeskočit na obsah
      </a>
      {/* pod otevřeným menu je zbytek stránky mimo pořadí Tab (menu má vlastní ✕) */}
      <header className="topbar" inert={menuOpen}>
        <button
          ref={toggleRef}
          type="button"
          className="menu-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          aria-label={menuOpen ? "Zavřít menu" : "Otevřít menu"}
        >
          <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
        </button>
        <span className="topbar-title">
          {mod ? mod.title : pathname === "/" ? "Přehled" : APP_TITLE}
        </span>
      </header>
      <Sidebar
        id="sidebar"
        open={menuOpen}
        hidden={narrow && !menuOpen}
        onNavigate={close}
        onClose={closeToToggle}
        focusRef={menuFocusRef}
      />
      {menuOpen && (
        <div className="backdrop" onClick={close} aria-hidden="true" />
      )}
      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="content"
        inert={menuOpen}
      >
        <ErrorBoundary resetKey={pathname}>
          <ModuleSourceContext.Provider value={formatSource(mod?.source)}>
            {/* líně načítané stránky (lazyPage): do načtení chunku krátký zástupný text */}
            <Suspense
              fallback={
                <p className="page-loading" role="status">
                  Načítám modul…
                </p>
              }
            >
              <Routes>
                <Route path="/" element={<Landing />} />
                {(Object.keys(PAGES) as RoutePattern[]).map((p) => {
                  const Page = PAGES[p];
                  return (
                    <Route
                      key={p}
                      path={p}
                      element={
                        <KnownOnly>
                          <Page />
                        </KnownOnly>
                      }
                    />
                  );
                })}
                <Route
                  path="*"
                  element={
                    <Navigate
                      to="/"
                      replace
                      state={{ unknown: pathname } satisfies UnknownState}
                    />
                  }
                />
              </Routes>
            </Suspense>
          </ModuleSourceContext.Provider>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
