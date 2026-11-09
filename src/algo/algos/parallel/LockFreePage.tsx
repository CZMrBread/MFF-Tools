import { ActionMenu } from "../../core/ActionMenu";
import type { ActionDef } from "../../core/actionModel";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { useStructure } from "../../core/useStructure";
import { CanvasFit } from "../../core/canvasFit";
import { Visualizer } from "../../core/Visualizer";
import { moduleByPath } from "../../registry";
import { initial, PC, type LFState } from "./lockfree";
import { cardActions, lfActions, type LfAction } from "./lockfreeActions";
import { LockFreeTimeline } from "./LockFreeTraceView";
import { LF_BASE_H, StackView } from "./LockFreeViews";

const INITIAL_MESSAGE =
  "Zásobník A → B → C. Začněte akcí „Scénář ABA“, nebo zvolte operace pro P1 a P2 a jejich kroky prokládejte sami.";

export function LockFreePage() {
  const s = useStructure<LFState>(initial, INITIAL_MESSAGE);
  const player = usePlayer(s.steps);
  const st = player.current?.state;
  const cur = s.last;

  /** provede akci modelu: přehraje kroky, nebo nahradí stav (Vyprázdnit) */
  const perform = (a: LfAction) =>
    a.kind === "run"
      ? s.run(a.history, PC, a.op)
      : s.reset(a.state(), a.message, a.history);
  const defs: ActionDef[] = lfActions(cur).map((a) => ({
    id: a.id,
    label: a.label,
    title: a.title,
    disabledReason: a.disabledReason,
    run: () => perform(a),
  }));
  const menu = useActionMenu(defs);
  const cardButtons = (p: 0 | 1) =>
    cardActions(cur, p).map((a) => ({
      label: a.label,
      title: a.title,
      onClick: () => perform(a),
    }));

  return (
    <Visualizer
      title={
        moduleByPath("/parallel/lockfree")?.title ??
        "Bezzámkový zásobník (CAS, ABA)"
      }
      description={
        <>
          <p>
            Bezzámkový zásobník a problém ABA. Zásobník jako spojový seznam s
            atomickým ukazatelem head. Push i Pop načtou head, připraví nový
            stav a pokusí se ho zapsat instrukcí Compare-and-Swap: CAS(head, h,
            n) nastaví head na n jen tehdy, je-li head stále h. Když mezitím
            jiný proces head změnil, CAS selže a operace se opakuje (lock-free:
            někdo vždy pokročí, ale konkrétní proces může hladovět).
          </p>
          <p>
            <b>ABA:</b> CAS porovnává jen hodnotu ukazatele. Když P2 načte h =
            A, s = B, a mezitím P1 popne A i B a pushne znovu uzel A, head je
            opět A – CAS procesu P2 uspěje a nastaví head na B, který už v
            zásobníku není. Řešení: LL/SC, verzované ukazatele (wide CAS), nebo
            nerecyklovat uzly (hazard pointers, reference counting).
          </p>
          <p>
            Akce „další krok“ (v nabídce i na kartě procesu) provede jeden
            atomický krok procesu (načtení, zápis nebo CAS); prokládání kroků
            obou procesů tedy volíte vy. „Dokončit“ na kartě provede zbývající
            kroky operace bez přerušení. Push nového uzlu dostane vždy nový
            popisek (nový uzel = nová adresa). „Push(…) znovu“ vloží uzel, který
            proces dříve popnul – tutéž adresu, a právě tak vzniká ABA.
          </p>
        </>
      }
      actions={<ActionMenu menu={menu} />}
      player={player}
      pseudocode={PC}
      structure={s}
      // po ↶ (undoOp vynuluje název) zůstane nad zprávou poslední operace z historie
      opTitle={s.opTitle || s.history[s.history.length - 1] || ""}
      notes={
        <p>
          Stav běhu dvou procesů nejde sdílet odkazem – použijte Scénář ABA.
        </p>
      }
      tip={
        <>
          přehrajte scénář ABA a pak ho zopakujte ručně: „P2: Pop“ a dvakrát
          „Další krok“ na kartě P2; potom „P1: Pop“ s „Dokončit“ na kartě P1
          (dvakrát) a „P1: Push(A) znovu“ s „Dokončit“; nakonec „Další krok“ P2.
          Když místo „Push(A) znovu“ pushnete nový uzel, CAS procesu P2 správně
          selže.
        </>
      }
      legend={[
        { cls: "sw-compare", label: "uzel načtený procesem (h, s)" },
        { cls: "sw-active", label: "uzel vlastněný procesem" },
        { cls: "sw-new", label: "právě zapojený do zásobníku" },
      ]}
    >
      {st && (
        // na velkém plátně se zásobník i karty procesů zvětší (jinak by plátno zůstalo poloprázdné)
        <CanvasFit
          limits={{ shrink: Math.round(LF_BASE_H * 0.1), grow: LF_BASE_H }}
        >
          {(delta) => (
            <>
              <StackView
                st={st}
                cardButtons={cardButtons}
                zoom={Math.max(0.9, Math.min(2, 1 + delta / LF_BASE_H))}
              />
              {/* kdy se který proces dostal ke slovu – prokládání, které dělá ABA */}
              <LockFreeTimeline st={st} />
            </>
          )}
        </CanvasFit>
      )}
    </Visualizer>
  );
}
