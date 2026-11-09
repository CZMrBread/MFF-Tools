import { useEffect, useState } from "react";
import { moduleByPath } from "../../registry";
import { useParams } from "react-router-dom";
import { ActionMenu } from "../../core/ActionMenu";
import { randomArray } from "../../core/steps";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { useStructure } from "../../core/useStructure";
import { useUrlParam } from "../../core/useUrlParam";
import { Visualizer, type LegendItem } from "../../core/Visualizer";
import { VarsView } from "../../views/ArrayView";
import { plural } from "../../views/text";
import { argList } from "../structures/input";
import { HASH_FNS } from "./hashfn";
import {
  clampKeys,
  hashMenu,
  INSERT_ARG,
  rehashTitle,
  type HashCmd,
} from "./menus";
import {
  buildTable,
  hashOp,
  insertAllOp,
  multiplesOf,
  PC_CHAIN,
  PC_LP,
  rehashTable,
  storedKeys,
  type HashOp,
  type HashState,
} from "./tables";
import {
  CHAIN_DEFAULT,
  hashShare,
  HASH_BOOK_EXAMPLES,
  hashFromShare,
  keysWord,
  PROBE_DEFAULT,
} from "./ui";
import { ChainView, ProbeView } from "./HashViews";

/** „, 1 náhrobek“ / „, 3 náhrobky“ pro hlášku tabulky z odkazu (jen když nějaké jsou) */
const tombsNote = (st: HashState) => {
  const k = st.cells.filter((c) => c === "tomb").length;
  return k > 0 ? `, ${k} ${plural(k, "náhrobek", "náhrobky", "náhrobků")}` : "";
};

/** semínko náhodných klíčů – volá se jen z obsluhy akce (ActionMenu.run), nikdy při vykreslení */
const clock = () => Date.now();

/* ================================================================== stránka */

export function HashPage() {
  const { id } = useParams();
  const probing = id === "probing";
  return <HashInner key={String(probing)} probing={probing} />;
}

const LEGEND_CHAIN: LegendItem[] = [
  { cls: "sw-active", label: "přihrádka h(x)" },
  { cls: "sw-compare", label: "porovnávaný klíč" },
  { cls: "sw-new", label: "vložený / nalezený klíč" },
  { cls: "sw-removed", label: "mazaný klíč" },
];
const LEGEND_PROBE: LegendItem[] = [
  { cls: "sw-active", label: "buňka h(x) (první sonda)", shape: "ring" },
  {
    cls: "sw-compare",
    label: "prohlížená buňka (sonda; pod tabulkou pořadí sond)",
  },
  { cls: "sw-new", label: "vložený / nalezený klíč" },
  { cls: "sw-removed", label: "mazaný klíč" },
  { cls: "sw-tomb", label: "náhrobek", glyph: "†" },
];

function HashInner({ probing }: { probing: boolean }) {
  const [shared, setShared] = useUrlParam("t");
  const def = probing ? PROBE_DEFAULT : CHAIN_DEFAULT;
  // výchozí příklad, nebo tabulka z odkazu (?t=…) – úvodní hláška a tip pak mluví o tom, co je opravdu vidět
  const [init] = useState(() => {
    const linked = hashFromShare(shared, probing);
    if (linked)
      return {
        state: linked,
        link: true,
        message: `Tabulka z odkazu: ${keysWord(linked.n)}${tombsNote(linked)}, α = ${linked.vars["α = n/m"]}. Vyzkoušejte Insert, Find nebo Delete.`,
      };
    return {
      state: buildTable(def.m, def.fnId, def.seed, def.keys, probing).state,
      link: false,
      message: probing
        ? "Tabulka obsahuje 6 klíčů, 3, 19 a 35 mají stejné h(x) = 3. Insert(51) čeká – Provést a ▶ ukáže, jak se shluk prodlouží."
        : "Tabulka obsahuje 6 klíčů, v přihrádce 4 je řetězec 12 → 20 → 28. Insert(36) čeká – Provést a ▶ ukáže kolizi v přihrádce 4.",
    };
  });
  const s = useStructure<HashState>(init.state, init.message);
  const player = usePlayer(s.steps);
  const st = player.current?.state;
  // zbývající Inserty načteného obrázku z knihy (předvyplňují se jeden po druhém, spouští je uživatel)
  const [bookOps, setBookOps] = useState<number[]>([]);

  // parametry tabulky se čtou z její poslední verze – „Vrátit operaci“ i „Výchozí příklad“ je tak vrátí také
  const { m, fnId, seed } = s.last;
  const f = HASH_FNS.find((h) => h.id === fnId)!;
  const PC = probing ? PC_LP : PC_CHAIN;
  const kind = probing ? "probe" : "chain";

  // odkaz na stránku nese aktuální tabulku (m, funkci, seed a klíče)
  useEffect(() => {
    setShared(hashShare(s.last, probing));
  }, [s.last, probing, setShared]);

  /** předvyplní Insert(x) a otevře ho s fokusem na Provést (další operace obrázku z knihy) */
  const prefillInsert = (x: number) => {
    menu.dispatch({ type: "text", name: INSERT_ARG, text: String(x) });
    menu.dispatch({ type: "open", id: "insert" });
    menu.focusRef.current = { to: "go" };
  };

  const run = (op: HashOp, v: number) => {
    const name = op === "insert" ? "Insert" : op === "find" ? "Find" : "Delete";
    s.run(`${name}(${v})`, PC[op], (t) => hashOp(t, v, op, probing));
    const rest = op === "insert" && bookOps[0] === v ? bookOps.slice(1) : [];
    setBookOps(rest);
    if (rest.length > 0) prefillInsert(rest[0]);
  };

  /** Přehešuje klíče poslední verze tabulky s novými parametry (náhrobky zmizí). */
  const rebuild = (nm: number, nf: string, ns: number, title: string) => {
    const r = rehashTable(s.last, probing, nm, nf, ns);
    if (r.ok) s.reset(r.state, r.message, title);
  };

  /** Nová tabulka z klíčů (bez přehrávání – je to jediný klidový krok). */
  const build = (values: number[], nm: number, nf: string, title: string) => {
    const { keys, extra } = clampKeys(values, nm, kind);
    const r = buildTable(nm, nf, seed, keys, probing);
    const skipped = [...r.skipped, ...extra];
    const fn = HASH_FNS.find((h) => h.id === nf) ?? f;
    const msg = `Tabulka postavena z ${r.used.length} klíčů (${fn.describe(nm)}).${
      skipped.length > 0
        ? ` Přeskočeno ${skipped.length} (opakované nebo nad kapacitu ${probing ? "m" : "2m"}): ${skipped.join(", ")}.`
        : ""
    }`;
    s.reset(r.state, msg, title);
  };

  const exec = (c: HashCmd) => {
    if (c.kind !== "op") setBookOps([]);
    switch (c.kind) {
      case "op":
        if (c.op !== "lookup") run(c.op, c.x);
        return;
      case "book": {
        const ex = HASH_BOOK_EXAMPLES.find((e) => e.id === c.id);
        if (!ex) return;
        const fn = HASH_FNS.find((h) => h.id === ex.fnId) ?? f;
        s.reset(
          buildTable(ex.m, ex.fnId, seed, [], probing).state,
          `${ex.label}: prázdná tabulka m = ${ex.m}, ${fn.describe(ex.m)}. Postupně vložíme ${ex.inserts.join(", ")} – každý Insert spustí Provést, průběh přehraje ▶.`,
          ex.label,
        );
        setBookOps([...ex.inserts]);
        prefillInsert(ex.inserts[0]);
        return;
      }
      case "build": {
        const nf = c.fn ?? fnId;
        if (c.how === "empty" || (c.how === "custom" && c.keys.length === 0))
          s.reset(
            buildTable(c.m, nf, seed, [], probing).state,
            "Tabulka vyprázdněna.",
            "Vyprázdnit",
          );
        else if (c.how === "random")
          build(
            randomArray(Math.floor(c.m / 2), 999, clock()),
            c.m,
            nf,
            "Náhodný vstup",
          );
        else build(c.keys, c.m, nf, `Vytvořit(${argList(c.keys)})`);
        return;
      }
      case "rehash": {
        const nf = c.fn ?? fnId;
        rebuild(c.m, nf, seed, rehashTitle(s.last, c.m, nf));
        return;
      }
      case "reseed":
        rebuild(m, fnId, seed + 1, "Nová náhodná h");
        return;
      case "bulk":
        if (c.what === "random") {
          const keys = randomArray(c.count, 999, clock());
          s.run(`Insert ×${keys.length} (${keys.join(", ")})`, PC.insert, (t) =>
            insertAllOp(t, keys, probing, `Insert ×${keys.length}`),
          );
        } else
          s.run(`Insert násobků ${m}`, PC.insert, (t) =>
            insertAllOp(t, multiplesOf(t.m), probing, `Insert násobků ${t.m}`),
          );
        return;
    }
  };

  const menu = useActionMenu(hashMenu({ table: s.last, probing, exec }));
  const { dispatch } = menu;
  // pole m a h ukazují parametry aktuální tabulky (i po „Vrátit operaci“)
  useEffect(() => {
    dispatch({ type: "text", name: "m", text: String(m) });
    dispatch({ type: "text", name: "h", text: fnId });
  }, [m, fnId, dispatch]);

  // po načtení čeká Insert(x) s novým klíčem (bez fokusu – stránka ho uživateli nekrade)
  useEffect(() => {
    dispatch({ type: "open", id: "insert" });
  }, [dispatch]);

  // „Výchozí příklad“ vrátí i pole A
  const restore = () => {
    setBookOps([]);
    dispatch({
      type: "text",
      name: "A",
      text: storedKeys(init.state, probing).join(", "),
    });
    s.restoreInitial();
  };

  return (
    <Visualizer
      title={
        moduleByPath(probing ? "/hash/probing" : "/hash/chaining")?.title ??
        "Hešování"
      }
      description={
        <>
          <p>
            {probing
              ? "Hešování s otevřenou adresací (lineární přidávání): každá buňka pojme jeden klíč. Při kolizi zkoušíme buňky h(x), h(x)+1, h(x)+2, … (lineární přidávání). Vznikají shluky obsazených buněk – delší shluk přitahuje další klíče. Mazání nesmí buňku vyprázdnit, používají se náhrobky. Při faktoru naplnění α ≤ 1/2 a dostatečně nezávislé funkci je očekávaný počet sond O(1)."
              : "Hešování se separovanými řetězci: klíč x uložíme do přihrádky h(x), kolize řešíme spojovým seznamem. Pro c-univerzální rodinu hešovacích funkcí je očekávaná délka prohledaného řetězce nejvýše c·n/m, takže při m = Ω(n) jsou všechny operace v očekávaném čase O(1). Všimněte si, jak se liší rozložení pro „x mod m“ na pravidelných datech a pro náhodně zvolenou funkci."}
          </p>
          <p className="complexity">
            <b>Insert, Find, Delete:</b> O(1) očekávaně při α = n/m = O(1)
            {probing ? " (α < 1, prakticky ≤ 1/2)" : ""}; nejhorší případ Θ(n)
          </p>
        </>
      }
      tip={
        (init.link && probing ? "ve výchozím příkladu: " : "") +
        (probing
          ? "Insert(51) (h = 3) prodlouží shluk 3–8. Pak Delete(19) a Find(35): náhrobek v buňce 4 nechá hledání pokračovat. „Vytvořit ▸ Příklady z knihy“ zopakuje obr. 11.2. Klik na klíč v tabulce vyplní x."
          : "Insert(36) přidá čtvrtý klíč do přihrádky 4. „Vložit násobky m“ s funkcí x mod m – všechny klíče skončí v přihrádce 0; pak Přehešovat(m, h) s náhodnou funkcí h a porovnejte délky řetězců. Klik na klíč v tabulce vyplní x.")
      }
      share
      structure={s}
      onRestoreInitial={restore}
      actions={<ActionMenu menu={menu} />}
      player={player}
      // před první operací pseudokód Insert (bez zvýrazněného řádku) – modul čeká právě na něj
      pseudocode={s.pseudocode.length > 0 ? s.pseudocode : PC.insert}
      legend={probing ? LEGEND_PROBE : LEGEND_CHAIN}
    >
      {st && (
        <>
          {probing ? (
            <ProbeView st={st} onPick={menu.pick} />
          ) : (
            <ChainView st={st} onPick={menu.pick} />
          )}
          <VarsView vars={st.vars} />
          <div className="hint">{f.describe(m)}</div>
        </>
      )}
    </Visualizer>
  );
}
