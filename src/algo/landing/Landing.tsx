/**
 * Úvodní stránka /algo/#/ – rozcestník modulů: velké hledání (stejná logika jako levá lišta), přepínač
 * Vše / Bc. / Mgr. (filtruje jen karty), řada „Naposledy otevřené“ (klíč algo-recent), čipy skupin
 * s počtem modulů a karty po skupinách s mini-kresbou výchozího příkladu. Na rozdíl od stránek modulů
 * se smí posouvat.
 */
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LEVEL_LABEL,
  LEVEL_TITLE,
  START_HERE,
  formatSource,
  moduleByPath,
  type ModuleLink,
} from "../registry";
import {
  APP_TITLE,
  LEVEL_FILTERS,
  countModules,
  groupAnchorId,
  landingCategories,
  modulesWord,
  type LevelFilter,
  type UnknownState,
} from "./landingModel";
import { prefersReducedMotion } from "../core/stepTransition";
import { ModuleThumb } from "./ModuleThumb";
import { readRecent } from "./recent";

/**
 * Stav přehledu v history.state (ne v adrese ani v localStorage): hledaný výraz a filtr úrovně – po
 * otevření modulu a návratu Zpět je přehled tak, jak ho uživatel opustil.
 */
export interface LandingState extends UnknownState {
  q?: string;
  level?: LevelFilter;
}

const isLevel = (v: unknown): v is LevelFilter =>
  LEVEL_FILTERS.some((f) => f.id === v);

function LevelTag({ level }: { level: ModuleLink["level"] }) {
  return (
    <span className={"level-tag level-" + level} title={LEVEL_TITLE[level]}>
      {LEVEL_LABEL[level]}
    </span>
  );
}

/** id prvku z cesty modulu („/sort/quick“ → „m-sort-quick“) pro aria-labelledby / describedby */
const domId = (path: string) => "m" + path.replace(/[^a-z0-9]+/gi, "-");

function ModuleCard({ m, group }: { m: ModuleLink; group: string }) {
  const id = domId(m.path);
  const source = formatSource(m.source);
  return (
    <Link
      to={m.path}
      className="card"
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-d ${id}-l`}
    >
      <ModuleThumb path={m.path} group={group} />
      <span className="card-body">
        <span className="card-head">
          <span className="card-title" id={`${id}-t`}>
            {m.title}
          </span>
          <span id={`${id}-l`}>
            <LevelTag level={m.level} />
          </span>
        </span>
        <span className="card-desc" id={`${id}-d`}>
          {m.desc}
        </span>
        {source && <span className="card-source">{source}</span>}
      </span>
    </Link>
  );
}

function RecentRow({ paths }: { paths: string[] }) {
  const mods = paths
    .map((p) => moduleByPath(p))
    .filter((m): m is ModuleLink => m !== undefined);
  if (mods.length === 0) return null;
  return (
    <section className="home-recent" aria-labelledby="home-recent-title">
      <h2 id="home-recent-title">Naposledy otevřené</h2>
      <ul className="recent-list">
        {mods.map((m) => (
          <li key={m.path}>
            <Link to={m.path} className="recent-card">
              <span className="recent-title">{m.title}</span>
              <LevelTag level={m.level} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Posune ke skupině bez změny adresy (v HashRouteru by #kotva byla cesta) a dá fokus na její nadpis. */
function scrollToGroup(id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  const reduce = prefersReducedMotion();
  section.scrollIntoView?.({
    behavior: reduce ? "auto" : "smooth",
    block: "start",
  });
  section.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
}

export function Landing() {
  const location = useLocation();
  const navigate = useNavigate();
  const saved = (location.state ?? null) as LandingState | null;
  const [query, setQuery] = useState(() =>
    typeof saved?.q === "string" ? saved.q : "",
  );
  const [level, setLevel] = useState<LevelFilter>(() =>
    isLevel(saved?.level) ? saved.level : "all",
  );
  // historie se čte jednou při otevření přehledu (zapisuje ji Shell při otevření modulu)
  const [recent] = useState(readRecent);
  const unknown = saved?.unknown;

  // hledání a filtr do history.state aktuálního záznamu (replace) – Zpět z modulu je obnoví
  useEffect(() => {
    const st = (location.state ?? null) as LandingState | null;
    if ((st?.q ?? "") === query && (st?.level ?? "all") === level) return;
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: { ...st, q: query, level } },
    );
  }, [query, level, location, navigate]);
  const shown = landingCategories(query, level);
  const total = countModules(shown);
  const filtering = query.trim() !== "" || level !== "all";
  const start = START_HERE.map((p) => moduleByPath(p)).filter(
    (m): m is ModuleLink => m !== undefined,
  );

  useEffect(() => {
    document.title = APP_TITLE;
  }, []);

  return (
    <div className="home">
      <header className="home-hero">
        <h1>{APP_TITLE}</h1>
        {unknown && (
          <p className="home-notice" role="alert">
            Stránka <code>#{unknown}</code> neexistuje, proto jste na přehledu.
            Vyberte modul níže nebo ho vyhledejte.
          </p>
        )}
        <p className="home-lead">
          Interaktivní vizualizace algoritmů z knihy{" "}
          <i>Průvodce labyrintem algoritmů</i> (Mareš, Valla) a z magisterské
          přednášky Datové struktury I. Zadejte vlastní vstup, krokujte výpočet
          dopředu i zpět a sledujte zvýrazněný řádek pseudokódu.
        </p>

        <div className="home-search" role="search">
          <input
            type="search"
            className="search-field search-hero"
            value={query}
            placeholder="Hledat: halda, Dijkstra, LIFO…"
            aria-label="Hledat modul"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const first = shown[0]?.modules[0];
                if (first) {
                  e.preventDefault();
                  navigate(first.path);
                }
              } else if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
          />
          <div className="level-filter" role="group" aria-label="Úroveň">
            {LEVEL_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                title={f.title}
                aria-pressed={level === f.id}
                className={"level-btn level-btn-" + f.id}
                onClick={() => setLevel(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {/* živá oblast je v DOM pořád (jen prázdná) – vložená až s textem by ji čtečka neohlásila */}
        <p className="search-count" role="status">
          {!filtering
            ? ""
            : total === 0
              ? "Nic nenalezeno – zkuste jiné slovo (hledá se bez diakritiky i v popisech)."
              : `Nalezeno: ${modulesWord(total)}`}
        </p>
        {shown.length > 0 && (
          <nav className="home-chips" aria-label="Skupiny modulů">
            {shown.map((c) => (
              <button
                key={c.title}
                type="button"
                className="chip"
                aria-label={`${c.title}: ${modulesWord(c.modules.length)}`}
                onClick={() => scrollToGroup(groupAnchorId(c.title))}
              >
                {c.title}
                <span className="chip-count" aria-hidden="true">
                  {c.modules.length}
                </span>
              </button>
            ))}
          </nav>
        )}
      </header>

      {!query.trim() && <RecentRow paths={recent} />}

      {/* „Kde začít“ pro nové návštěvníky; kdo už něco otevřel, má místo toho řadu Naposledy otevřené */}
      {!filtering && recent.length === 0 && (
        <section className="home-start" aria-labelledby="home-start-title">
          <h2 id="home-start-title">Kde začít</h2>
          <p>
            Vyberte modul, zadejte vstup (nebo nechte výchozí příklad), pusťte{" "}
            <b>▶ Přehrát</b> a sledujte, který řádek pseudokódu se právě
            provádí. Krokovat jde i po jednom tlačítky ◀ ▶.
          </p>
          <ul className="home-start-list">
            {start.map((m) => (
              <li key={m.path}>
                <Link to={m.path}>{m.title}</Link>
              </li>
            ))}
          </ul>
          <p className="home-keys">
            Klávesy: <kbd>mezerník</kbd> přehrát / pauza, <kbd>←</kbd> /{" "}
            <kbd>→</kbd> krok, <kbd>Home</kbd> / <kbd>End</kbd> začátek / konec.
            Na kresbu se dostanete <kbd>Tab</kbd>em, šipky chodí po jejích
            prvcích, <kbd>Enter</kbd> vybere, <kbd>Shift</kbd>+šipky posunou
            vrchol a <kbd>Esc</kbd> kresbu opustí.
          </p>
        </section>
      )}

      {shown.map((c) => (
        <section
          key={c.title}
          id={groupAnchorId(c.title)}
          className="home-cat"
          aria-labelledby={groupAnchorId(c.title) + "-h"}
        >
          <h2 id={groupAnchorId(c.title) + "-h"} tabIndex={-1}>
            {c.title}
          </h2>
          {c.intro && <p className="home-cat-intro">{c.intro}</p>}
          <ul className="card-grid">
            {c.modules.map((m) => (
              <li key={m.path}>
                <ModuleCard m={m} group={c.title} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
