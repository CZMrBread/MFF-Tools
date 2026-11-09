import { useEffect, useState } from "react";
import { ActionMenu } from "../../core/ActionMenu";
import { fmtMath } from "../../core/format";
import { randomArray } from "../../core/steps";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { useStructure } from "../../core/useStructure";
import { useRovingFocus } from "../../core/useRovingFocus";
import { useUrlParam } from "../../core/useUrlParam";
import { Visualizer, type LegendItem } from "../../core/Visualizer";
import { VarsView } from "../../views/ArrayView";
import { pickProps } from "../../views/pick";
import { argList } from "../structures/input";
import {
  blBuild,
  blInsertAllOp,
  blOp,
  blTestForeign,
  PC_BL_INSERT,
  PC_BL_QUERY,
  type BloomState,
} from "./bloom";
import {
  ckBuild,
  ckBulkOp,
  ckFill,
  ckForceCycle,
  ckInsertAll,
  ckOp,
  PC_CK_DELETE,
  PC_CK_FIND,
  PC_CK_INSERT,
  type CuckooState,
} from "./cuckoo";
import { bloomMenu, cuckooMenu, type HashCmd } from "./menus";
import {
  BLOOM_DEFAULT,
  bloomFromShare,
  CUCKOO_DEFAULT,
  cuckooFromShare,
  formatBloomShare,
  formatCuckooShare,
  keysWord,
} from "./ui";
import { CuckooView, BloomView } from "./CuckooBloomViews";

const clock = () => Date.now();

const cuckooKeys = (st: CuckooState) =>
  st.cells.filter((c): c is number => c !== null);
const skippedNote = (skipped: number[], why: string) =>
  skipped.length > 0
    ? ` Přeskočeno ${skipped.length} (${why}): ${skipped.join(", ")}.`
    : "";

/* ================================================================== kukaččí hešování */

const LEGEND_CUCKOO: LegendItem[] = [
  {
    cls: "sw-compare",
    label: "kandidátní buňka f(x), g(x) / druhé místo vyhozeného klíče",
  },
  { cls: "sw-new", label: "vložený / nalezený klíč" },
  { cls: "sw-removed", label: "mazaný klíč" },
  { cls: "sw-removed", label: "přesun vyhozeného klíče", shape: "line" },
  {
    cls: "sw-compare",
    label: "pod tabulkou cesta vyhazovaných klíčů (shora dolů)",
  },
];

export function CuckooPage() {
  const [shared, setShared] = useUrlParam("t");
  const [init] = useState(() => {
    const linked = cuckooFromShare(shared);
    if (linked)
      return {
        state: linked,
        message: `Tabulka z odkazu: ${keysWord(linked.n)}, α = ${linked.vars["α = n/m"]}. Vyzkoušejte Insert, Find nebo Delete.`,
      };
    return {
      state: ckBuild(CUCKOO_DEFAULT.m, CUCKOO_DEFAULT.seed, CUCKOO_DEFAULT.keys)
        .state,
      message:
        "Tabulka obsahuje 5 klíčů. Insert(20) čeká – obě jeho buňky f(20) = 14 a g(20) = 7 jsou obsazené, Provést a ▶ ukáže vyhazování.",
    };
  });
  const s = useStructure<CuckooState>(init.state, init.message);
  const player = usePlayer(s.steps);
  const st = player.current?.state;
  // m se čte z poslední verze tabulky – „Vrátit operaci“ a „Výchozí příklad“ ho vrátí také
  const { m, seed } = s.last;

  useEffect(() => {
    setShared(formatCuckooShare(s.last));
  }, [s.last, setShared]);

  const op = (kind: "insert" | "find" | "delete", v: number) => {
    const name =
      kind === "insert" ? "Insert" : kind === "find" ? "Find" : "Delete";
    const pc =
      kind === "insert"
        ? PC_CK_INSERT
        : kind === "find"
          ? PC_CK_FIND
          : PC_CK_DELETE;
    s.run(`${name}(${v})`, pc, (t) => ckOp(t, v, kind));
  };

  /** Nová tabulka z klíčů (bez přehrávání). */
  const build = (values: number[], size: number, title: string) => {
    const r = ckBuild(size, seed, values);
    s.reset(
      r.state,
      `Tabulka postavena: m = ${size}, ${r.used.length} klíčů, α = ${r.state.vars["α = n/m"]}.${skippedNote(r.skipped, "opakované nebo se nevešly")}`,
      title,
    );
  };

  const exec = (c: HashCmd) => {
    switch (c.kind) {
      case "op":
        if (c.op !== "lookup") op(c.op, c.x);
        return;
      case "build":
        if (c.how === "empty" || (c.how === "custom" && c.keys.length === 0))
          s.reset(
            ckBuild(c.m, seed, []).state,
            "Tabulka vyprázdněna.",
            "Vyprázdnit",
          );
        else if (c.how === "random")
          build(
            randomArray(Math.floor(c.m / 3), 999, clock()),
            c.m,
            "Náhodný vstup",
          );
        else build(c.keys, c.m, `Vytvořit(${argList(c.keys)})`);
        return;
      case "rehash":
        build(cuckooKeys(s.last), c.m, `m = ${c.m}`);
        return;
      case "reseed":
        return;
      case "bulk":
        if (c.what === "random") {
          const keys = randomArray(c.count, 999, clock());
          s.run(
            `Insert ×${keys.length} (${keys.join(", ")})`,
            PC_CK_INSERT,
            (t) => ckBulkOp(t, `Insert ×${keys.length}`, ckInsertAll(t, keys)),
          );
        } else if (c.what === "fill") {
          const r = clock();
          s.run("Doplnit na 60 %", PC_CK_INSERT, (t) =>
            ckBulkOp(t, "Doplnit na 60 %", ckFill(t, Math.floor(t.m * 0.6), r)),
          );
        } else
          s.run("Vynutit cyklus", PC_CK_INSERT, (t) =>
            ckBulkOp(t, "Vynutit cyklus", ckForceCycle(t)),
          );
        return;
    }
  };

  const menu = useActionMenu(cuckooMenu({ table: s.last, exec }));
  const { dispatch } = menu;
  // pole m ukazuje velikost aktuální tabulky (i po „Vrátit operaci“)
  useEffect(() => {
    dispatch({ type: "text", name: "m", text: String(m) });
  }, [m, dispatch]);

  // po načtení čeká Insert(x) s novým klíčem (bez fokusu)
  useEffect(() => {
    dispatch({ type: "open", id: "insert" });
  }, [dispatch]);

  const restore = () => {
    dispatch({
      type: "text",
      name: "A",
      text: cuckooKeys(init.state).join(", "),
    });
    s.restoreInitial();
  };

  return (
    <Visualizer
      title="Kukaččí hešování"
      description={
        <>
          <p>
            Dvě hešovací funkce f, g; klíč x smí ležet jen v buňce f(x) nebo
            g(x), každá buňka pojme jeden klíč. Find tedy stojí nejvýše 2
            přístupy i v nejhorším případě. Insert klíč „vystrčí“ obsazenou
            buňku jako kukačka: vyhozený klíč se přestěhuje do své druhé buňky,
            případně vyhodí dalšího. Při m ≥ (2+ε)n a dostatečně nezávislých
            funkcích je očekávaný čas vkládání O(1); po ⌈6 log n⌉ přesunech bez
            úspěchu přehešujeme s novými funkcemi. Nad α = 1/2 už vhodné f, g
            existují jen zřídka – vkládání pak končí opakovaným přehešováním,
            nebo se klíč nepodaří vložit vůbec.
          </p>
          <p className="complexity">
            <b>Find, Delete:</b> O(1) nejhůře · <b>Insert:</b> O(1) očekávaně
            (amortizovaně včetně přehešování)
          </p>
        </>
      }
      tip="Insert(20): obě kandidátní buňky jsou obsazené, 20 vyhodí klíč z f(20). „Doplnit na 60 %“ – nad α = 1/2 se klíče začnou řetězově vyhazovat. „Vynutit cyklus“ vloží tři klíče se stejnými f(x), g(x): do dvou buněk se nevejdou a tabulka se přehešuje. Klik na klíč v tabulce vyplní x."
      share
      structure={s}
      onRestoreInitial={restore}
      actions={<ActionMenu menu={menu} />}
      player={player}
      pseudocode={s.pseudocode.length > 0 ? s.pseudocode : PC_CK_INSERT}
      legend={LEGEND_CUCKOO}
    >
      {st && (
        <>
          <CuckooView st={st} onPick={menu.pick} />
          <VarsView vars={st.vars} />
          <div className="hint">
            f, g: ((a·x + b) mod 65537) mod m s náhodnými a, b
          </div>
        </>
      )}
    </Visualizer>
  );
}

/* ================================================================== Bloomův filtr */

const LEGEND_BLOOM: LegendItem[] = [
  { cls: "sw-active", label: "bit = 1" },
  { cls: "sw-new", label: "nově nastavený bit (Insert)" },
  { cls: "sw-compare", label: "bit už byl 1 (Insert)" },
  { cls: "sw-found", label: "testovaný bit = 1 (Lookup)" },
  { cls: "sw-removed", label: "testovaný bit = 0 → určitě není (Lookup)" },
];

export function BloomPage() {
  const [shared, setShared] = useUrlParam("t");
  const [init] = useState(() => {
    const linked = bloomFromShare(shared);
    if (linked)
      return {
        state: linked,
        message: `Filtr z odkazu: m = ${linked.m}, k = ${linked.k}, ${keysWord(linked.inserted.length)}. Vyzkoušejte Insert nebo Lookup.`,
      };
    return {
      state: blBuild(BLOOM_DEFAULT.m, BLOOM_DEFAULT.k, BLOOM_DEFAULT.keys)
        .state,
      message:
        "Filtr obsahuje klíče 17, 42 a 99. Insert(55) čeká – Provést a ▶ ukáže, které bity nastaví. Pak Lookup(17), Lookup nevloženého čísla nebo „Otestovat 10 nevložených“.",
    };
  });
  const s = useStructure<BloomState>(init.state, init.message);
  const player = usePlayer(s.steps);
  const st = player.current?.state;
  // m a k se čtou z poslední verze filtru – „Vrátit operaci“ a „Výchozí příklad“ je vrátí také
  const { m, k, inserted } = s.last;

  useEffect(() => {
    setShared(formatBloomShare(s.last));
  }, [s.last, setShared]);

  /** Nový filtr z klíčů (bez přehrávání). */
  const build = (values: number[], nm: number, nk: number, title: string) => {
    const r = blBuild(nm, nk, values);
    s.reset(
      r.state,
      `Filtr postaven: m = ${nm}, k = ${nk}, ${r.used.length} klíčů.${skippedNote(r.skipped, "opakované")}`,
      title,
    );
  };

  /** Změna m nebo k: skutečný filtr klíče nezná, tady ho postavíme znovu ze seznamu vložených klíčů. */
  const resize = (nm: number, nk: number) => {
    const r = blBuild(nm, nk, inserted);
    const title = [
      ...(nm !== m ? [`m = ${nm}`] : []),
      ...(nk !== k ? [`k = ${nk}`] : []),
    ].join(", ");
    s.reset(
      r.state,
      `Filtr postaven znovu: m = ${nm}, k = ${nk}, z ${inserted.length} vložených klíčů. (Skutečný Bloomův filtr své klíče nezná – kvůli změně m nebo k by je musel mít uložené jinde.)`,
      title || "Přestavit",
    );
  };

  const exec = (c: HashCmd) => {
    switch (c.kind) {
      case "op":
        if (c.op === "insert")
          s.run(`Insert(${c.x})`, PC_BL_INSERT, (t) => blOp(t, c.x, "insert"));
        else if (c.op === "lookup")
          s.run(`Lookup(${c.x})`, PC_BL_QUERY, (t) => blOp(t, c.x, "lookup"));
        return;
      case "build": {
        const nk = c.k ?? k;
        if (c.how === "empty" || (c.how === "custom" && c.keys.length === 0))
          s.reset(
            blBuild(c.m, nk, []).state,
            "Filtr vyprázdněn.",
            "Vyprázdnit",
          );
        else if (c.how === "random")
          build(randomArray(6, 999, clock()), c.m, nk, "Náhodný vstup");
        else build(c.keys, c.m, nk, `Vytvořit(${argList(c.keys)})`);
        return;
      }
      case "rehash":
        resize(c.m, c.k ?? k);
        return;
      case "reseed":
        return;
      case "bulk":
        if (c.what === "random") {
          const keys = randomArray(c.count, 999, clock());
          s.run(
            `Insert ×${keys.length} (${keys.join(", ")})`,
            PC_BL_INSERT,
            (t) => blInsertAllOp(t, keys, `Insert ×${keys.length}`),
          );
        } else {
          const seed = clock() + 5;
          s.run(`Lookup ${c.count} nevložených`, PC_BL_QUERY, (t) =>
            blTestForeign(t, c.count, seed),
          );
        }
        return;
    }
  };

  const menu = useActionMenu(bloomMenu({ table: s.last, exec }));
  const { dispatch } = menu;
  // pole m a k ukazují parametry aktuálního filtru (i po „Vrátit operaci“)
  useEffect(() => {
    dispatch({ type: "text", name: "m", text: String(m) });
    dispatch({ type: "text", name: "k", text: String(k) });
  }, [m, k, dispatch]);

  // po načtení čeká Insert(x) s novým klíčem (bez fokusu)
  useEffect(() => {
    dispatch({ type: "open", id: "insert" });
  }, [dispatch]);

  const restore = () => {
    dispatch({
      type: "text",
      name: "A",
      text: init.state.inserted.join(", "),
    });
    s.restoreInitial();
  };

  return (
    <Visualizer
      title="Bloomův filtr"
      description={
        <>
          <p>
            Přibližná reprezentace množiny v m bitech: k hešovacích funkcí,
            Insert nastaví bity {fmtMath("h_1(x), …, h_k(x)")}, Lookup odpoví
            ANO, jen jsou-li všechny jedničkové. Falešně negativní odpověď nikdy
            nenastane, falešně pozitivní s pravděpodobností zhruba{" "}
            {fmtMath("(1 − e^{−kn/m})^k")}; optimální je k ≈ (m/n) ln 2, tedy m
            ≈ 1,44 · n · log₂(1/ε). Mazat nelze (leda s počítadly místo bitů).
          </p>
          <p className="complexity">
            <b>Insert, Lookup:</b> O(k) · <b>paměť:</b> m bitů nezávisle na
            velikosti univerza
          </p>
        </>
      }
      tip="Insert(55) a pak „Otestovat 10 nevložených“ – porovnejte počet falešně pozitivních odpovědí s odhadem. Pak vložte další klíče nebo Přestavit(m, k) s jiným k a test zopakujte. Klik na vložený klíč pod filtrem vyplní x."
      share
      structure={s}
      onRestoreInitial={restore}
      actions={<ActionMenu menu={menu} />}
      player={player}
      pseudocode={s.pseudocode.length > 0 ? s.pseudocode : PC_BL_INSERT}
      legend={LEGEND_BLOOM}
    >
      {st && (
        <>
          <BloomView st={st} />
          <VarsView vars={st.vars} />
          <div className="hint">
            Vložené klíče (filtr sám je nezná, slouží k rozpoznání falešně
            pozitivních odpovědí):{" "}
            {st.inserted.length > 0 ? (
              <BloomKeys keys={st.inserted} onPick={menu.pick} />
            ) : (
              "—"
            )}
          </div>
        </>
      )}
    </Visualizer>
  );
}

/** vložené klíče pod Bloomovým filtrem: jedna zastávka Tabu, šipky chodí po klíčích, Enter / klik vyplní x (D3) */
function BloomKeys({
  keys,
  onPick,
}: {
  keys: readonly number[];
  onPick: (key: number) => void;
}) {
  const rove = useRovingFocus(keys);
  return (
    <span role="group" aria-label="Vložené klíče" {...rove.group}>
      {keys.map((key, i) => (
        <span key={key}>
          {i > 0 && ", "}
          <span
            className="bloom-key pickable"
            // index.css zatím nemá styl klikacího textu – tečkované podtržení naznačí, že jde vybrat
            style={{ textDecoration: "underline dotted" }}
            {...pickProps(() => onPick(key), `klíč ${key}`)}
            {...rove.item(key)}
          >
            {key}
          </span>
        </span>
      ))}
    </span>
  );
}
