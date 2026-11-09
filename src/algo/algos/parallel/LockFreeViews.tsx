/**
 * Kresba bezzámkového zásobníku s kartami procesů – sdílí ji stránka (LockFreePage.tsx, líně načítaná) a náhled na úvodní stránce (landing/previews.tsx).
 */
import { chainOf, lab, nextAction, type LFState } from "./lockfree";

/** kolik posledních dokončených operací procesu vypisujeme */
const LOG_SHOWN = 8;
/** tlačítko na kartě procesu */
export interface CardButton {
  label: string;
  title?: string;
  onClick: () => void;
}

/** výška kresby zásobníku při 1 : 1 (px) – převod delty CanvasFit na zvětšení (nejvýš 2×, nejméně 0,9×) */
export const LF_BASE_H = 180;

export function StackView({
  st,
  cardButtons,
  zoom = 1,
}: {
  st: LFState;
  /** zvětšení celé kresby na velkém plátně (CanvasFit) */
  zoom?: number;
  /** tlačítka přímo na kartě procesu (další krok, dokončit) */
  cardButtons?: (p: 0 | 1) => CardButton[];
}) {
  const { ids: chain, cycleTo } = chainOf(st);
  const Box = ({ id }: { id: number }) => (
    <span className={"lf-node " + (st.marks[id] ?? "")}>
      {st.nodes[id].label}
      <small>→{lab(st, st.nodes[id].next)}</small>
    </span>
  );
  return (
    <div className="lf" style={zoom !== 1 ? { zoom } : undefined}>
      <div className="lf-row">
        <b>head →</b>
        {chain.map((id) => (
          <Box key={id} id={id} />
        ))}
        {cycleTo === null ? (
          <span className="lf-null">∅</span>
        ) : (
          <span className="lf-null lf-cycle" title="Seznam je zacyklený">
            ↺ zpět na {lab(st, cycleTo)}
          </span>
        )}
      </div>
      <div className="lf-procs">
        {st.procs.map((P, i) => {
          const next = nextAction(st, i as 0 | 1);
          const buttons = cardButtons?.(i as 0 | 1) ?? [];
          return (
            <div
              key={i}
              className={"lf-proc" + (st.shown === i ? " shown" : "")}
            >
              <div className="lf-proc-title">
                {P.name} –{" "}
                {P.op
                  ? P.op === "push"
                    ? `Push(${lab(st, P.arg)})`
                    : "Pop"
                  : "nečinný"}
              </div>
              <div>
                {next ? (
                  <>
                    příště: <b>{next.text}</b>{" "}
                    <span className="muted">(řádek {next.line + 1})</span>
                  </>
                ) : (
                  <span className="muted">čeká na Push nebo Pop</span>
                )}
              </div>
              <div>
                h = {lab(st, P.h)} ·{" "}
                {P.op === "push"
                  ? `n = ${lab(st, P.arg)}`
                  : `s = ${lab(st, P.s)}`}
              </div>
              <div>
                vlastní:{" "}
                {P.owned.length ? (
                  P.owned.map((id, k) => <Box key={k} id={id} />)
                ) : (
                  <span className="muted">nic</span>
                )}
              </div>
              <div className="muted">
                {P.log.length > LOG_SHOWN ? "… · " : ""}
                {P.log.slice(-LOG_SHOWN).join(" · ")}
              </div>
              {buttons.length > 0 && (
                <div
                  className="lf-proc-actions"
                  style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}
                >
                  {buttons.map((b) => (
                    <button
                      key={b.label}
                      type="button"
                      title={b.title}
                      onClick={b.onClick}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {st.broken && (
        <div className="lf-broken" role="alert">
          ⚠ {st.broken}
        </div>
      )}
    </div>
  );
}
