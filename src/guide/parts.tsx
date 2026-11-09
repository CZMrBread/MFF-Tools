import type { ReactNode } from "react";
import styles from "./guide.module.css";

/**
 * Drobné stavební prvky obsahu průvodce (bez logiky). Texty a odkazy samotné
 * jsou v content.tsx – tady je jen markup a třídy převzaté ze staré stránky.
 */

/** Atributy odkazů otevíraných v nové záložce (stejné jako ve staré stránce). */
const NEW_TAB = { target: "_blank", rel: "noopener noreferrer" } as const;

function classNames(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

type ButtonLinkProps = {
  href: string;
  /** Třída Bootstrap ikony, např. "bi-discord". */
  icon: string;
  /** Plné červené tlačítko, modré Discord tlačítko, nebo jen s obrysem. */
  variant?: "solid" | "discord" | "outline";
  /** Samostatné tlačítko pod textem (šířka podle obsahu, ne podle mřížky). */
  inline?: boolean;
  /** Otevřít v nové záložce (výchozí: ano). */
  newTab?: boolean;
  children: ReactNode;
};

/** Tlačítko-odkaz s ikonou (staré třídy .btn, .btn-discord, .btn-outline). */
export function ButtonLink({
  href,
  icon,
  variant = "solid",
  inline = false,
  newTab = true,
  children,
}: ButtonLinkProps) {
  return (
    <a
      href={href}
      {...(newTab ? NEW_TAB : {})}
      className={classNames(
        styles.btn,
        variant === "discord" && styles.btnDiscord,
        variant === "outline" && styles.btnOutline,
        inline && styles.btnInline,
      )}
    >
      <i className={`bi ${icon}`}></i> {children}
    </a>
  );
}

type TextLinkProps = {
  href: string;
  /** Otevřít v nové záložce (výchozí: ano). */
  newTab?: boolean;
  children: ReactNode;
};

/** Červený tučný odkaz uvnitř textu. */
export function TextLink({ href, newTab = true, children }: TextLinkProps) {
  return (
    <a href={href} {...(newTab ? NEW_TAB : {})} className={styles.textLink}>
      {children}
    </a>
  );
}

/** Odkaz na předmět v SISu podle jeho kódu. */
export function SubjectLink({
  code,
  children,
}: {
  code: string;
  children: ReactNode;
}) {
  return (
    <a
      href={`https://is.cuni.cz/studium/predmety/index.php?do=predmet&kod=${code}`}
      {...NEW_TAB}
      className={styles.subjectLink}
    >
      {children}
    </a>
  );
}

/** Štítek s kódem předmětu. */
export function SubjectCode({ children }: { children: ReactNode }) {
  return <span className={styles.subjectCode}>{children}</span>;
}

/** Položka seznamu doporučeného nastavení (zaškrtnuté políčko + text). */
export function SettingsItem({ children }: { children: ReactNode }) {
  return (
    <li>
      <i className="bi bi-check-square-fill"></i> <span>{children}</span>
    </li>
  );
}

/** Jedna otázka a odpověď v sekci FAQ. */
export function FaqItem({
  question,
  children,
}: {
  question: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.faqItem}>
      <div className={styles.faqQuestion}>{question}</div>
      <div className={styles.faqAnswer}>{children}</div>
    </div>
  );
}
