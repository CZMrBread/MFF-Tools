import { useEffect, useRef } from "react";
import { fmtMath, splitComment } from "./format";

/** jednotný text prázdného panelu pseudokódu (dokud stránka nemá co ukázat) */
export const CODE_PLACEHOLDER = "Pseudokód se zobrazí po spuštění operace.";

interface Props {
  lines: string[];
  active: number | null;
  /** text místo prázdného panelu, dokud není co ukázat */
  placeholder?: string;
}

/**
 * Panel s pseudokódem. Řádky jsou řetězce; odsazení se udává počtem úvodních mezer
 * (každé 2 mezery = jedna úroveň). Zápis `x_i`, `2^k` se vysází jako index / mocnina, text za `//` jako komentář.
 */
export function Pseudocode({
  lines,
  active,
  placeholder = CODE_PLACEHOLDER,
}: Props) {
  const box = useRef<HTMLPreElement>(null);

  // aktivní řádek držíme v záběru uvnitř panelu (stránkou samotnou se nehýbe)
  useEffect(() => {
    const el = box.current;
    if (!el || active === null || el.scrollHeight <= el.clientHeight) return;
    const line = el.children[active] as HTMLElement | undefined;
    if (!line) return;
    const h = line.offsetHeight;
    const margin = h * 2;
    // poloha řádku vůči obsahu panelu (offsetTop by se měřil od offsetParent – panel jím být nemusí)
    const top =
      line.getBoundingClientRect().top -
      el.getBoundingClientRect().top +
      el.scrollTop;
    const bottom = top + h;
    // vejde se řádek i s okrajem bez posunu? pak nahoře zůstane záhlaví algoritmu (řádek 1)
    if (bottom + margin <= el.clientHeight) el.scrollTop = 0;
    else if (top - margin < el.scrollTop)
      el.scrollTop = Math.max(0, top - margin);
    else if (bottom + margin > el.scrollTop + el.clientHeight)
      el.scrollTop = bottom + margin - el.clientHeight;
  }, [active, lines]);

  if (lines.length === 0)
    return <div className="pseudocode empty">{placeholder}</div>;

  return (
    <pre className="pseudocode" ref={box}>
      {lines.map((raw, i) => {
        const indent = raw.match(/^ */)?.[0].length ?? 0;
        const { code, comment } = splitComment(raw.trimStart());
        const isActive = i === active;
        return (
          <div
            key={i}
            className={
              "pc-line" +
              (isActive ? " active" : "") +
              (comment && !code ? " comment" : "")
            }
            style={{ paddingLeft: `${0.75 + indent * 0.75}rem` }}
            aria-current={isActive ? "step" : undefined}
          >
            <span className="pc-num">{i + 1}</span>
            <span className="pc-text">
              {fmtMath(code)}
              {comment && (
                <span className="pc-comment">{fmtMath(comment)}</span>
              )}
            </span>
          </div>
        );
      })}
    </pre>
  );
}
