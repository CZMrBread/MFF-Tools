import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { isKnownPath, moduleByPath } from "../../registry";
import { ActionMenu } from "../../core/ActionMenu";
import { useActionMenu } from "../../core/useActionMenu";
import { useOpenOnMount } from "./useOpenOnMount";
import {
  listArg,
  numArg,
  type ActionDef,
  type IntArgDef,
} from "../../core/actionModel";
import { randomArray } from "../../core/steps";
import { usePlayer } from "../../core/usePlayer";
import { useStructure } from "../../core/useStructure";
import { useUrlParam } from "../../core/useUrlParam";
import { Visualizer } from "../../core/Visualizer";
import { VarsView } from "../../views/ArrayView";
import { BoxListView } from "../../views/BoxListView";
import {
  argList,
  count,
  listFromUrl,
  toUrl,
  VALUE_MAX,
  VALUE_MIN,
} from "./input";
import { LIST_LEGEND, listClasses, pickLegend } from "./legend";
import { idleCode, insertAfterDef } from "./pageModel";
import { sameList, useUrlSync } from "./useUrlSync";
import {
  DEQ,
  ENQ,
  L_DELETE,
  L_FIND,
  L_INSERT_AFTER,
  L_INSERT_HEAD,
  LIST_MAX,
  POP,
  PUSH,
  dequeue,
  enqueue,
  listDelete,
  listFind,
  listInsertAfter,
  LIST_INITIAL,
  listInsertFirst,
  listValues,
  makeList,
  stackPop,
  stackPush,
  type ListState,
} from "./list";

/* ------------------------------------------------------------------ stránka */

const KINDS = {
  stack: {
    title: "Zásobník (stack)",
    desc: "Zásobník (stack) je posloupnost, do které přidáváme (Push) i odebíráme (Pop) na stejném konci – „poslední dovnitř, první ven“ (LIFO). Obě operace v O(1).",
    what: "Zásobník",
    a: "ý", // rod: prázdný / plný / postaven
    tip: "několikrát Push(x) a pak Pop – prvky odcházejí v opačném pořadí, než přišly (LIFO). Pop na prázdném zásobníku ukáže chybovou větev pseudokódu.",
    message:
      "Zásobník 5, 12, 8 (vrchol 8). Vyzkoušejte Push(x) nebo Pop – kroky se připraví a ▶ (mezerník) je přehraje.",
  },
  queue: {
    title: "Fronta (queue)",
    desc: "Fronta (queue): přidáváme na konec (Enqueue), odebíráme ze začátku (Dequeue) – „první dovnitř, první ven“ (FIFO). Spojový seznam s ukazateli na začátek i konec zvládne obě operace v O(1).",
    what: "Fronta",
    a: "á",
    tip: "Enqueue(x) a pak Dequeue – odchází nejstarší prvek (FIFO). Odeberte vše až na jeden prvek: začátek i konec pak ukazují na tutéž krabičku.",
    message:
      "Fronta 5, 12, 8 (začátek 5, konec 8). Vyzkoušejte Enqueue(x) nebo Dequeue – kroky se připraví a ▶ (mezerník) je přehraje.",
  },
  list: {
    title: "Jednosměrný spojový seznam",
    desc: "Jednosměrný spojový seznam: každý prvek si pamatuje hodnotu a ukazatel na následníka. Vložení na začátek je O(1), ale nalezení prvku vyžaduje průchod od hlavy – O(n). Nelze v něm hledat binárně.",
    what: "Seznam",
    a: "ý",
    tip: "Find(99) – hodnotu, která v seznamu není: ukazatel p projde všechny prvky až na ∅. Pak Delete(12) a InsertAfter(1, x) – k i x vyplní i klik na krabičku.",
    message:
      "Seznam 5 → 12 → 8. Vyzkoušejte Find(12), Delete(x) nebo InsertAfter(k, x) – kroky se připraví a ▶ (mezerník) je přehraje.",
  },
} as const;
type Kind = keyof typeof KINDS;

/** pseudokód akcí, který panel ukáže před první operací */
const IDLE_CODE: Record<string, readonly string[]> = {
  push: PUSH,
  pop: POP,
  enqueue: ENQ,
  dequeue: DEQ,
  find: L_FIND,
  delete: L_DELETE,
  insertFirst: L_INSERT_HEAD,
  insertAfter: L_INSERT_AFTER,
};

/** výchozí příklad; výchozí x = 12 v něm je, takže Find/Delete hned něco najdou */
const INITIAL = LIST_INITIAL;
const VALUES = { min: VALUE_MIN, max: VALUE_MAX };

export function ListPage() {
  const { id } = useParams();
  // pojistka k přesměrování v App (KnownOnly): „constructor“, „toString“ apod. nejsou druhy struktury (Object.hasOwn)
  const path = `/ds/${id ?? ""}`;
  if (id === undefined || !Object.hasOwn(KINDS, id) || !isKnownPath(path))
    return <Navigate to="/" replace state={{ unknown: path }} />;
  return <ListInner key={id} kind={id as Kind} />;
}

function ListInner({ kind }: { kind: Kind }) {
  const K = KINDS[kind];
  const [urlA, setUrlA] = useUrlParam("a");
  // výchozí stav: ze sdíleného odkazu, jinak výchozí příklad (staví se jen jednou)
  const [start] = useState(() => listFromUrl(urlA, LIST_MAX) ?? INITIAL);
  const s = useStructure<ListState>(
    () => makeList(kind, start),
    start === INITIAL
      ? K.message
      : `${K.what} ze sdíleného odkazu. Vyzkoušejte operace v nabídce pod obrázkem.`,
  );
  // po operaci a po ↶ adresa nese aktuální prvky (výchozí příklad = bez parametru)
  const synced = useUrlSync(s, (q) => {
    const v = listValues(q);
    setUrlA(v.length && !sameList(v, INITIAL) ? toUrl(v) : null);
  });
  const player = usePlayer(s.steps);
  const st = player.current?.state;

  const n = s.last.boxes.length;
  const fullReason =
    n >= LIST_MAX
      ? `${K.what} je pln${K.a} – vizualizace ukazuje nejvýše ${LIST_MAX} prvků`
      : null;
  const emptyWord = `prázdn${K.a}`;
  const legend = useMemo(
    () => pickLegend(LIST_LEGEND[kind], listClasses(s.steps)),
    [kind, s.steps],
  );

  /** Vytvořit: nová struktura (bez přehrávání – je to jediný klidový krok) a vstup do adresy */
  const build = (values: number[], how: string) => {
    setUrlA(values.length ? toUrl(values) : null);
    if (values.length === 0) {
      s.reset(makeList(kind, []), `${K.what} je ${emptyWord}.`, "Vyprázdnit");
      return;
    }
    const built = `${K.what} postaven${K.a === "á" ? "a" : ""}${how}: ${count(values.length)}.`;
    s.reset(
      makeList(kind, values),
      `${built} Vyzkoušejte operace v nabídce pod obrázkem.`,
      `Vytvořit(${argList(values)})`,
    );
  };

  const X: IntArgDef = {
    kind: "int",
    name: "x",
    label: "x =",
    ...VALUES,
    default: kind === "list" ? 12 : 7,
  };
  /** operace s hodnotou x – jednotný tvar pro Push, Enqueue, Find… */
  const withX = (
    id: string,
    name: string,
    code: string[],
    op: (q: ListState, x: number) => ReturnType<typeof stackPush>,
    disabledReason: string | null = null,
  ): ActionDef => ({
    id,
    label: `${name}(x)`,
    args: [X],
    disabledReason,
    run: (v) => {
      const x = numArg(v, "x");
      s.run(`${name}(${x})`, code, (q) => op(q, x));
    },
  });
  const emptyHint = (op: string) =>
    n
      ? undefined
      : `${K.what} je ${emptyWord} – ${op} skončí chybou (řádek 2 pseudokódu)`;

  const create: ActionDef = {
    id: "create",
    label: "Vytvořit",
    title: `${K.what}: náhodně, ${emptyWord} nebo z vlastních čísel`,
    variants: [
      { id: "random", label: "Náhodně", title: "6 náhodných čísel od 1 do 50" },
      { id: "empty", label: emptyWord[0].toUpperCase() + emptyWord.slice(1) },
      {
        id: "custom",
        label: "Vlastní",
        args: [
          {
            kind: "list",
            name: "A",
            label: "A =",
            ...VALUES,
            maxCount: LIST_MAX,
            default: start,
            placeholder: "např. 5, 12, 8",
          },
        ],
      },
    ],
    run: (v, variant) => {
      if (variant === "random") build(randomArray(6, 50), " (náhodný vstup)");
      else if (variant === "empty") build([], "");
      else build(listArg(v, "A"), "");
    },
  };

  const ops: ActionDef[] =
    kind === "stack"
      ? [
          withX("push", "Push", PUSH, stackPush, fullReason),
          {
            id: "pop",
            label: "Pop",
            title: emptyHint("Pop"),
            run: () => s.run("Pop", POP, (q) => stackPop(q)),
          },
        ]
      : kind === "queue"
        ? [
            withX("enqueue", "Enqueue", ENQ, enqueue, fullReason),
            {
              id: "dequeue",
              label: "Dequeue",
              title: emptyHint("Dequeue"),
              run: () => s.run("Dequeue", DEQ, (q) => dequeue(q)),
            },
          ]
        : [
            withX("find", "Find", L_FIND, listFind),
            withX("delete", "Delete", L_DELETE, listDelete),
            withX(
              "insertFirst",
              "InsertFirst",
              L_INSERT_HEAD,
              listInsertFirst,
              fullReason,
            ),
            insertAfterDef(
              n,
              X,
              fullReason ??
                (n === 0
                  ? "Seznam je prázdný, není za co vkládat – použijte InsertFirst(x)"
                  : null),
              (k, x) =>
                s.run(`InsertAfter(${k}, ${x})`, L_INSERT_AFTER, (q) =>
                  listInsertAfter(q, k, x),
                ),
            ),
          ];
  const menu = useActionMenu([create, ...ops]);
  // hlavní operace (Push / Enqueue / Find) je rozbalená hned – stačí Provést nebo Enter
  useOpenOnMount(menu, ops[0].id);

  // „Výchozí příklad“ vrátí i pole A a adresu, aby nesvítil starý vstup
  const restore = () => {
    menu.dispatch({ type: "text", name: "A", text: start.join(", ") });
    setUrlA(start === INITIAL ? null : toUrl(start));
    s.restoreInitial();
  };

  return (
    <Visualizer
      title={moduleByPath(`/ds/${kind}`)?.title ?? K.title}
      description={<p>{K.desc}</p>}
      structure={synced}
      onRestoreInitial={restore}
      share
      tip={K.tip}
      actions={<ActionMenu menu={menu} />}
      player={player}
      pseudocode={idleCode(s.pseudocode, menu.state.open, IDLE_CODE, ops[0].id)}
      legend={legend}
    >
      {st && (
        <>
          <BoxListView
            fit
            boxes={st.boxes}
            pointers={st.pointers}
            arrows={kind === "list"}
            nullEnd={kind === "list"}
            vertical={kind === "stack"}
            emptyLabel={
              kind === "queue"
                ? "prázdná fronta"
                : kind === "stack"
                  ? "prázdný zásobník"
                  : "prázdný seznam"
            }
            ariaLabel={`${K.what}: ${st.boxes.length ? listValues(st).join(", ") : emptyWord}`}
            // klik na krabičku: pozice k u InsertAfter, jinak hodnota x
            onPick={(i, box) =>
              menu.pick(
                menu.state.open === "insertAfter" ? i + 1 : Number(box.label),
              )
            }
          />
          <VarsView vars={st.vars} />
        </>
      )}
    </Visualizer>
  );
}
