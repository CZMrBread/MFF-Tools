import { useEffect, useState } from "react";
import { moduleByPath } from "../../registry";
import { ActionMenu } from "../../core/ActionMenu";
import { CanvasFit } from "../../core/canvasFit";
import { fmtMath } from "../../core/format";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { useStructure } from "../../core/useStructure";
import { useUrlParam } from "../../core/useUrlParam";
import { Visualizer } from "../../core/Visualizer";
import { VarsView } from "../../views/ArrayView";
import { MultiTreeView } from "../../views/MultiTreeView";
import {
  multiFitLevelHeight,
  multiLevelFitLimits,
} from "../../views/treeLayout";
import {
  AB_DEFAULT_KEYS,
  AB_DEFAULT_X,
  AB_KEYS,
  AB_MAX_KEYS,
  AB_PARAMS,
  AB_BOOK_TIP,
  AB_TIP,
  abDisabledReason,
  abIndexOf,
  abInitialMessage,
  abLabel,
  abParamIndex,
  abVariantFromParam,
  abVariantLabel,
  abVariantOf,
  buildAB,
  planAbOp,
  switchAB,
  switchAbVariant,
  type AbOpName,
} from "./abOps";
import { abKeys, layoutAB, type ABState, type AbVariant } from "./abtree";
import type { AbBookOp } from "./bookExamples";
import { keysFromParam, parseKey } from "./keys";
import { abLegend, toLegend } from "./legend";
import {
  abActions,
  abExampleFromParam,
  exampleMessage,
  exampleTitle,
  nextBookOp,
} from "./treeMenu";
import { useOpenOnMount } from "../structures/useOpenOnMount";
import { sameList, useUrlSync } from "../structures/useUrlSync";

const LEGEND: Record<AbVariant, ReturnType<typeof toLegend>> = {
  prednaska: toLegend(abLegend("prednaska")),
  kniha: toLegend(abLegend("kniha")),
};

/** výchozí vzdálenost hladin (px); CanvasFit ji na desktopu přizpůsobí výšce plátna */
const LEVEL = 80;

/** semínko náhodného vstupu (volá se až při Vytvořit ▸ Náhodně) */
const now = () => Date.now();

export function ABTreePage() {
  const [kParam, setK] = useUrlParam("k");
  const [abParam, setAbParam] = useUrlParam("ab");
  const [exParam, setEx] = useUrlParam("ex");
  // varianta: bez parametru přednáška (staré odkazy beze změny), `var=kniha` = Průvodce 8.3
  const [varParam, setVarParam] = useUrlParam("var");
  // vstup z adresy čteme jen při otevření stránky; dál ho jen zapisujeme
  const [opened] = useState(() => {
    // ?ex= (přesný tvar ze snímku přednášky) má přednost před ?k= a ?ab=
    const ex = abExampleFromParam(exParam) ?? null;
    const fromUrl = ex ? null : keysFromParam(kParam, AB_KEYS, AB_MAX_KEYS);
    const keys = ex ? [...ex.keys] : (fromUrl ?? AB_DEFAULT_KEYS);
    const x = ex?.ops[0]?.x ?? AB_DEFAULT_X;
    return {
      ex,
      keys,
      fromUrl: fromUrl !== null,
      ab: ex ? abIndexOf(ex.build()) : abParamIndex(abParam),
      variant: ex ? (ex.variant ?? "prednaska") : abVariantFromParam(varParam),
      x: ex || keys.includes(x) ? x : keys[0],
    };
  });
  // (a,b) je součástí stavu stromu: přepnutí je obyčejný reset, takže jde vrátit a historie zůstane
  const s = useStructure<ABState>(
    () =>
      opened.ex
        ? opened.ex.build()
        : buildAB(
            opened.keys,
            AB_PARAMS[opened.ab][0],
            AB_PARAMS[opened.ab][1],
            opened.variant,
          ),
    opened.ex ? exampleMessage(opened.ex) : abInitialMessage(opened.fromUrl),
  );
  // po operaci a po ↶ adresa nese množinu klíčů (tvar se po postavení z odkazu může lišit)
  const synced = useUrlSync(s, (q) => {
    const k = abKeys(q);
    setEx(null);
    setK(k.length && !sameList(k, AB_DEFAULT_KEYS) ? k.join(",") : null);
  });
  const player = usePlayer(s.steps);
  // zbývající operace načteného příkladu z přednášky (předvyplňují se jedna po druhé)
  const [bookOps, setBookOps] = useState<AbBookOp[]>(
    opened.ex ? [...opened.ex.ops] : [],
  );

  const st = player.current?.state ?? s.last;
  const lay = layoutAB(st);
  const depth = lay.nodes.reduce((m, n) => Math.max(m, n.y), 0);
  // titulek a výběr podle stromu, se kterým se pracuje (po „Vrátit operaci“ se vrátí i (a,b))
  const abIndex = abIndexOf(s.last);
  const [a, b] = AB_PARAMS[abIndex];
  const variant = abVariantOf(s.last);
  const book = variant === "kniha";

  /** předvyplní operaci z příkladu a otevře ji s fokusem na Provést */
  const prefill = (op: AbOpName, x: number) => {
    menu.dispatch({ type: "text", name: "x", text: String(x) });
    menu.dispatch({ type: "open", id: op });
    menu.focusRef.current = { to: "go" };
  };
  const setKeysField = (keys: readonly number[]) =>
    menu.dispatch({ type: "text", name: "A", text: keys.join(", ") });

  const runOp = (op: AbOpName, x: number) => {
    if (abDisabledReason(s.last, op, x) !== null) return;
    const p = planAbOp(op, x, variant);
    s.run(p.title, p.pseudocode, p.run);
    const rest = nextBookOp(bookOps, op, x);
    setBookOps(rest);
    const next = rest[0];
    if (next) prefill(next.op, next.x);
  };

  const rebuild = (keys: number[], message: string, title: string) => {
    setBookOps([]);
    s.reset(buildAB(keys, a, b, variant), message, title);
    if (keys.length) setKeysField(keys);
    setK(keys.length ? keys.join(",") : null);
    setEx(null);
  };

  /** Přepnutí (a,b): strom se postaví znovu ze stejných klíčů, které v něm právě jsou. */
  const switchParams = (i: number) => {
    if (i === abIndex) return;
    setBookOps([]);
    const next = switchAB(s.last, i);
    s.reset(next.state, next.message, `(a,b) = ${abLabel(i)}`);
    if (exParam !== null) {
      // tvar z přednášky se přepnutím ztratí – do adresy jdou klíče
      setEx(null);
      const keys = abKeys(next.state);
      setK(keys.length ? keys.join(",") : null);
    }
  };

  /** Přepnutí varianty: strom se postaví znovu ze stejných klíčů, (a,b) zůstává. */
  const switchVariant = (v: AbVariant) => {
    if (v === variant) return;
    setBookOps([]);
    const next = switchAbVariant(s.last, v);
    s.reset(next.state, next.message, `Varianta: ${abVariantLabel(v)}`);
    if (exParam !== null) {
      // tvar z obrázku / snímku se přepnutím ztratí – do adresy jdou klíče
      setEx(null);
      const keys = abKeys(next.state);
      setK(keys.length ? keys.join(",") : null);
    }
  };

  const menu = useActionMenu(
    abActions(
      {
        state: s.last,
        keys: opened.keys,
        x: opened.x,
        // odkaz na příklad s Insert (obr. 8.8: Insert(6)) – pole x nese klíč z příkladu, ne nabízený nový
        insertX:
          opened.ex?.ops[0]?.op === "insert" ? opened.ex.ops[0].x : undefined,
        seed: now,
      },
      {
        op: runOp,
        rebuild,
        params: switchParams,
        variant: switchVariant,
        example: (ex) => {
          s.reset(ex.build(), exampleMessage(ex), exampleTitle(ex));
          setKeysField(ex.keys);
          // přesný tvar nese ?ex= (postupným vkládáním klíčů by vznikl jiný strom)
          setK(null);
          setEx(ex.id);
          setBookOps([...ex.ops]);
          const first = ex.ops[0];
          if (first) prefill(first.op, first.x);
        },
      },
    ),
  );
  // Insert(x) s nabízeným novým klíčem je rozbalený hned – stačí Provést nebo Enter (CROSS-06)
  // odkaz na příklad (?ex=) rozbalí jeho první operaci s jejím x (Delete(5) u obr. 8.9)
  useOpenOnMount(menu, opened.ex?.ops[0]?.op ?? "insert");
  const { dispatch } = menu;
  // (a,b) v adrese a zvolená varianta v nabídce podle stromu – i po „Vrátit operaci“ a „Výchozí příklad“
  useEffect(() => {
    setAbParam(abIndex === 0 ? null : `${a},${b}`);
    dispatch({ type: "variant", id: "params", variant: String(abIndex) });
  }, [abIndex, a, b, setAbParam, dispatch]);
  // varianta v adrese (jen knižní – výchozí přednáška parametr nemá) a v nabídce podle stromu
  useEffect(() => {
    setVarParam(book ? "kniha" : null);
    dispatch({ type: "variant", id: "variant", variant });
  }, [book, variant, setVarParam, dispatch]);

  const restore = () => {
    s.restoreInitial();
    setBookOps(opened.ex ? [...opened.ex.ops] : []);
    setKeysField(opened.keys);
    menu.dispatch({ type: "text", name: "x", text: String(opened.x) });
    setK(opened.fromUrl ? opened.keys.join(",") : null);
    setEx(opened.ex?.id ?? null);
  };

  return (
    <Visualizer
      title={moduleByPath("/tree/ab")?.title ?? "(a,b)-strom"}
      description={
        <>
          {book ? (
            <p>
              Zobrazený strom má (a,b) = ({a},{b}), varianta z Průvodce 8.3.
              Vyhledávací strom, v němž má každý vnitřní vrchol (kromě kořene) a
              až b synů (a ≥ 2, b ≥ 2a − 1) a všechny vnější vrcholy (listy)
              leží ve stejné hloubce. Klíče jsou ve vnitřních vrcholech: vrchol
              s klíči x₁ &lt; … &lt; xₖ má k + 1 synů a klíče oddělují jejich
              podstromy; prázdné vnější listy nekreslíme. Insert vloží klíč do
              vrcholu na předposlední hladině a přeplněný vrchol rozštěpí –
              prostřední klíč jde do otce. Delete klíč z vyšší hladiny nahradí
              následníkem a podtečený vrchol doplní půjčkou od bratra, nebo ho s
              bratrem sloučí. Přednáška (DS I) ukládá klíče do listů – viz
              přepínač Varianta.
            </p>
          ) : (
            <p>
              Zobrazený strom má (a,b) = ({a},{b}). Vyhledávací strom, v němž má
              každý vnitřní vrchol (kromě kořene) a až b synů (a ≥ 2, b ≥ 2a −
              1) a všechny listy leží ve stejné hloubce. Klíče jsou v listech,
              vnitřní vrcholy obsahují oddělovače (maximum i-tého podstromu).
              Vkládání řeší přeplněné vrcholy dělením, mazání podtečené vrcholy
              přesunem syna od bratra nebo slučováním. Pro b ≥ 2a jsou dělení a
              slučování amortizovaně O(1). B-stromy na disku volí b podle
              velikosti bloku, např. (256, 512). Průvodce 8.3 ukládá klíče do
              vnitřních vrcholů – viz přepínač Varianta.
            </p>
          )}
          <p className="complexity">
            <b>Výška:</b> {fmtMath("mezi log_b n a 1 + log_a n")} · <b>Find:</b>{" "}
            {fmtMath("O(log b · log_a n)")} · <b>Insert, Delete:</b>{" "}
            {fmtMath("O(b · log_a n)")}; pro konstantní a, b je vše O(log n)
          </p>
        </>
      }
      actions={<ActionMenu menu={menu} />}
      player={player}
      pseudocode={
        s.pseudocode.length
          ? s.pseudocode
          : planAbOp(
              menu.state.open === "find" || menu.state.open === "delete"
                ? menu.state.open
                : "insert",
              null,
              variant,
            ).pseudocode
      }
      structure={synced}
      onRestoreInitial={restore}
      share
      notes={
        <p className="hint">
          Kopírovat odkaz: odkaz nese klíče, ne přesný tvar – strom se z nich
          postaví znovu, takže po operacích může vypadat jinak.
        </p>
      }
      tip={
        book
          ? AB_BOOK_TIP
          : opened.fromUrl || opened.ab !== 0 || opened.ex
            ? "Insert klíče mezi dva sousední listy, dokud se vrchol nerozdělí; pak Delete, dokud se vrcholy nesloučí. Přepněte (a,b) a porovnejte výšku."
            : AB_TIP
      }
      legend={LEGEND[variant]}
    >
      {/* vzdálenost hladin podle výšky plátna (desktop na jednu obrazovku) jako u BST/AVL – klíče 1 : 1;
          klik / Enter na klíč (list i oddělovač) vyplní x otevřené nebo naposledy použité operace */}
      <CanvasFit limits={multiLevelFitLimits(LEVEL, depth)}>
        {(delta) => (
          <MultiTreeView
            nodes={lay.nodes}
            edges={lay.edges}
            fit
            levelHeight={multiFitLevelHeight(LEVEL, delta, depth)}
            onPickKey={(k) => {
              const x = parseKey(k);
              if (x !== null) menu.pick(x);
            }}
          />
        )}
      </CanvasFit>
      <VarsView vars={st.vars} />
    </Visualizer>
  );
}
