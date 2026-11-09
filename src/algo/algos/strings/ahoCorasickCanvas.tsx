/**
 * Plátno Aho–Corasickové (stránka AhoCorasickPage i náhled na úvodní stránce): strom podle obr. 13.2
 * vlevo přes celou výšku, vpravo sloupec s tabulkou stavů (posouvá se uvnitř k aktivnímu stavu), senem
 * se závorkami výskytů a řádkem fronty F / ohlášených výskytů (na telefonu pod sebou). Náhled bez
 * tabulky má seno pod stromem. Co se kreslí, počítá ahoCorasickView.ts.
 */
import { Fragment, useLayoutEffect, useRef } from "react";
import { AutomatonView } from "../../views/AutomatonView";
import { TextStripView } from "../../views/TextStripView";
import { statesWord, type AcState } from "./ahoCorasick";
import {
  AC_LEVEL,
  acAria,
  acBrackets,
  acLayout,
  acLine,
  acMarks,
  acRows,
  acTable,
} from "./ahoCorasickView";

/** Tabulka stavů (reprezentace automatu, str. 327): #, stav, Zpět, Zkratka, Slovo. */
export function AcTable({ st }: { st: AcState }) {
  const box = useRef<HTMLDivElement>(null);
  const rows = acTable(st);
  const focus = rows.findIndex((r) => /row-(cur|hot|new)/.test(r.cls));
  // aktivní řádek v záběru uvnitř tabulky (scrollTop kontejneru – okno ani plátno se nehýbou)
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || focus < 0 || el.scrollHeight <= el.clientHeight) return;
    const tr = el.querySelectorAll<HTMLElement>("tbody tr")[focus];
    if (!tr) return;
    const c = el.getBoundingClientRect();
    const r = tr.getBoundingClientRect();
    const head = el.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    if (r.top < c.top + head) el.scrollTop -= c.top + head - r.top + 4;
    else if (r.bottom > c.bottom) el.scrollTop += r.bottom - c.bottom + 4;
  }, [focus, st]);
  return (
    <div className="ac-side table-scroll" ref={box}>
      <table className="ac-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">stav</th>
            <th scope="col">Zpět</th>
            <th scope="col">Zkratka</th>
            <th scope="col">Slovo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.cls || undefined}>
              <th scope="row">{r.id}</th>
              <td>{r.name}</td>
              <td>{r.back}</td>
              <td>{r.short}</td>
              <td>{r.word}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AcCanvas({
  st,
  slots,
  reserveBrackets = 0,
  width,
  levelH = AC_LEVEL,
  names = true,
  allBack = true,
  onPickText,
  onPickNode,
  table = true,
  line = true,
}: {
  st: AcState;
  slots: number;
  reserveBrackets?: number;
  /** pevná šířka (náhled) */
  width?: number;
  /** vzdálenost hladin stromu (CanvasFit) */
  levelH?: number;
  names?: boolean;
  allBack?: boolean;
  onPickText?: (index: number) => void;
  onPickNode?: (id: number) => void;
  table?: boolean;
  line?: boolean;
}) {
  const marks = acMarks(st);
  const l = acLine(st);
  const tree = (
    <AutomatonView
      layout={acLayout(st, { names, allBack, levelH })}
      nodeCls={marks.nodeCls}
      edgeCls={marks.edgeCls}
      width={width}
      onPick={onPickNode}
      ariaLabel={`Vyhledávací automat pro ${st.words.join(", ")}: ${st.shown} ${statesWord(st.shown)}, aktuální stav ${st.nodes[st.s].name}`}
    />
  );
  const strip = (
    <TextStripView
      slots={slots}
      rows={acRows(st, !!onPickText)}
      brackets={acBrackets(st)}
      reserveBrackets={reserveBrackets}
      width={width}
      ariaLabel={acAria(st)}
      onPick={onPickText && ((_row, i) => onPickText(i))}
    />
  );
  const lineRow = line && (
    <p className="ac-line" aria-live="off">
      <span className="ac-line-label">{l.label}</span>{" "}
      {l.items.length ? (
        l.items.map((it, i) => (
          <Fragment key={i}>
            {i > 0 && " "}
            <span className={"ac-chip" + (i === l.now ? " now" : "")}>
              {it}
            </span>
          </Fragment>
        ))
      ) : (
        <span className="ac-empty">
          {st.phase === "build" ? "prázdná" : "zatím nic"}
        </span>
      )}
    </p>
  );
  // stránka: strom má celou výšku plátna, seno a ohlášené výskyty jsou ve sloupci pod tabulkou
  if (table)
    return (
      <div className="ac-layout with-table">
        {tree}
        <div className="ac-side-col">
          <AcTable st={st} />
          {strip}
          {lineRow}
        </div>
      </div>
    );
  return (
    <>
      <div className="ac-layout">{tree}</div>
      {strip}
      {lineRow}
    </>
  );
}
