import { pageHref } from "../shared/pages";
import {
  ButtonLink,
  FaqItem,
  SettingsItem,
  SubjectCode,
  SubjectLink,
  TextLink,
} from "./parts";
import styles from "./guide.module.css";

/*
 * Obsah Průvodce prváka – texty, odkazy a ikony přenesené doslova ze staré
 * stránky (index.html). Každá sekce je komponenta bez logiky; pořadí sekcí
 * určuje GuidePage.tsx. Text upravuj přímo tady.
 */

export function GuideHeader() {
  return (
    <header>
      <h1>
        <i className="bi bi-mortarboard"></i> Vítej na Matfyzu!
      </h1>
      <p className={styles.intro}>
        Ahoj, jsem Dominik Smola, tvůj studentský průvodce pro 1. ročník
        informatiky. Gratuluji k přijetí na MFF UK! Začátky můžou vypadat
        děsivě, ale slibuju, že se v tom rychle zorientuješ. Tahle stránka ti
        pomůže přežít první týdny.
      </p>
    </header>
  );
}

export function QuickStartIntro() {
  return (
    <p style={{ marginBottom: "1.5rem" }}>
      <strong>Rychlé startovní To-Do.</strong> Tři věci, které si zařiď hned na
      začátku — zaberou deset minut a ušetří ti nervy na celý semestr.
    </p>
  );
}

export function SisSettings() {
  return (
    <section className={styles.card}>
      <h2>
        <i className="bi bi-sliders"></i> Nastavení SISu
      </h2>
      <p>
        V <strong>Osobních údajích</strong> pod <em>Možnosti uživatele</em> si
        zapni tohle — takhle to mám nastavené já:
      </p>
      <ul className={styles.settingsList}>
        <SettingsItem>
          <strong>Prodloužená doba přihlášení</strong> — SIS tě nevyhodí po pár
          minutách nečinnosti. Zapni si to jen na svém počítači, ne ve studovně.
        </SettingsItem>
        <SettingsItem>
          <strong>Ukládat profil (nastavení filtrů, …)</strong> — SIS si
          zapamatuje filtry jako semestr a fakultu, takže je nemusíš překlikávat
          pořád dokola.
        </SettingsItem>
        <SettingsItem>
          <strong>Zasílat upozornění o vypsání nového termínu</strong> —
          nejdůležitější přepínač před zkouškovým. U oblíbených termínů zmizí
          místa během pár minut.
        </SettingsItem>
        <SettingsItem>
          <strong>Zasílat upozornění o změně výsledků zkoušek</strong> — o
          známce se dozvíš e-mailem a nemusíš SIS refreshovat každou hodinu.
        </SettingsItem>
        <SettingsItem>
          <strong>
            Studijní mezivýsledky: upozornění po editaci položky učitelem
          </strong>{" "}
          — uvidíš body ze zápočtáků a domácích úkolů, jakmile je učitel zapíše.
        </SettingsItem>
        <SettingsItem>
          <strong>Povolit vyhledání mého studia ostatním studentům</strong> — ať
          tě spolužáci najdou, když budou zakládat skupinu nebo shánět parťáka
          na projekt.
        </SettingsItem>
      </ul>
      <p className={styles.appTip}>
        <i className="bi bi-android2"></i>{" "}
        <span>
          <strong>Máš Android?</strong> Stáhni si neoficiální aplikaci{" "}
          <TextLink href="https://github.com/sykoram/sis">
            SIS pro Android
          </TextLink>
          . Je to pohodlnější než mobilní web.
        </span>
      </p>
    </section>
  );
}

export function PublishPermission() {
  return (
    <section className={styles.card}>
      <h2>
        <i className="bi bi-person-badge"></i> Povolení zveřejnit
      </h2>
      <p>
        Hned vedle v <em>Osobních údajích</em> si vybereš, co o tobě uvidí
        ostatní ve vyhledávání osob. Žádné správné nastavení neexistuje — někomu
        vyhovuje být dohledatelný, někdo chce mít zapnuté úplné minimum. Projdi
        si ten seznam a zaškrtej jen to, s čím ti je opravdu příjemné, že to o
        tobě někdo uvidí.
      </p>
    </section>
  );
}

export function EmailForwarding() {
  return (
    <section className={styles.card}>
      <h2>
        <i className="bi bi-envelope-at"></i> Přeposílání školního e-mailu
      </h2>
      <p>
        Tohle si nastav určitě. Všechna důležitá komunikace od fakulty,
        studijního oddělení i od učitelů chodí na{" "}
        <strong>fakultní adresu</strong> — a do školní schránky se ti chodit
        koukat nebude chtít.
      </p>
      <p>
        Ve školním <strong>Outlooku</strong> si proto zapni přeposílání na
        e-mail, který čteš každý den: <em>Nastavení → Pošta → Přeposílání</em>.
      </p>
      <p className={styles.settingsNote}>
        Nech si zaškrtnuté i zachování kopie ve školní schránce, ať o nic
        nepřijdeš, kdyby přeposílání někdy vypadlo.
      </p>
    </section>
  );
}

export function Scholarships() {
  return (
    <section className={styles.moneyCard}>
      <h3>
        <i className="bi bi-cash-coin"></i> Nezapomeň na peníze zdarma:
        stipendia!
      </h3>
      <p>
        Pokud nemáš trvalé bydliště v Praze, máš skoro jistě nárok na{" "}
        <strong>ubytovací stipendium</strong> — a to i když nebydlíš na koleji.
        Jsou to tisícovky za semestr, jen si o ně musíš sám zažádat.
      </p>
      <p>
        Jestli jsi z rodiny s nižšími příjmy, zažádej si i o{" "}
        <strong>sociální stipendium</strong>. Stačí doložit pár dokumentů, a
        když ho dostaneš, můžeš si pak zažádat i o vyšší ubytovací stipendium.
      </p>
      <ul style={{ marginBottom: "1.5rem" }}>
        <li>
          <strong>Kdy:</strong> na přelomu října a listopadu. Sleduj upozornění
          v SISu.
        </li>
        <li>
          <strong>Kde:</strong> v SISu klikni na{" "}
          <em>Ubytovací a sociální stipendia</em>. Otevře se aplikace, kde podáš
          obě žádosti.
        </li>
        <li>
          <strong>Číslo účtu:</strong> musíš ho vyplnit dvakrát — v SISu v{" "}
          <em>Osobních údajích a nastavení</em> a ještě jednou v aplikaci pro
          stipendia přes <em>Úprava bankovního spojení</em>.
        </li>
      </ul>
      <div className={styles.btnRow} style={{ marginBottom: "1.5rem" }}>
        <ButtonLink
          href="https://is.cuni.cz/webapps/"
          icon="bi-box-arrow-up-right"
          inline
        >
          Zažádat o stipendium
        </ButtonLink>
      </div>
      <p style={{ marginBottom: "0.5rem" }}>
        Podmínky a podrobnosti najdeš na webu univerzity:
      </p>
      <div className={styles.btnRow}>
        <ButtonLink
          href="https://cuni.cz/UK-4315.html"
          icon="bi-house"
          variant="outline"
          inline
        >
          Ubytovací stipendium
        </ButtonLink>
        <ButtonLink
          href="https://cuni.cz/UK-4316.html"
          icon="bi-people"
          variant="outline"
          inline
        >
          Sociální stipendium
        </ButtonLink>
        <ButtonLink
          href="https://cuni.cz/UK-59.html"
          icon="bi-info-circle"
          variant="outline"
          inline
        >
          Přehled stipendií na UK
        </ButtonLink>
      </div>
    </section>
  );
}

export function ImportantLinks() {
  return (
    <section>
      <h2>
        <i className="bi bi-link-45deg"></i> Důležité odkazy
      </h2>
      <div className={styles.linksGrid}>
        <ButtonLink
          href="https://wiki.matfyz.cz/"
          icon="bi-journal-bookmark-fill"
        >
          Fakultní Wiki
        </ButtonLink>
        <ButtonLink
          href="https://discord.gg/7afJ9ES"
          icon="bi-discord"
          variant="discord"
        >
          Neoficiální MFF Discord
        </ButtonLink>
        <ButtonLink
          href="https://discord.gg/9S5fDKYS4T"
          icon="bi-discord"
          variant="discord"
        >
          Kruhový Discord pro prváky
        </ButtonLink>
        <ButtonLink
          href="https://cs.mff.cuni.cz/cs/pro-studenty/pro-prvaky"
          icon="bi-signpost-split"
          variant="outline"
        >
          Oficiální průvodce pro prváky
        </ButtonLink>
        <ButtonLink
          href="https://www.mff.cuni.cz/cs/studenti/bc-a-mgr-studium/studijni-plany"
          icon="bi-journals"
          variant="outline"
        >
          Karolínka (studijní plány)
        </ButtonLink>
        <ButtonLink
          href={pageHref("calculator")}
          icon="bi-calculator"
          variant="outline"
          newTab={false}
        >
          Moje kalkulačka kreditů
        </ButtonLink>
      </div>
    </section>
  );
}

export function ElectiveSubjects() {
  return (
    <section>
      <h2>
        <i className="bi bi-star"></i> Fajn volitelné předměty
      </h2>
      <p>
        I když je rozvrh plný povinných věcí, vyplatí se přihodit si něco z
        tohto výběru.
      </p>
      <ul className={styles.subjectList}>
        <li>
          <SubjectCode>NMAI069</SubjectCode>{" "}
          <SubjectLink code="NMAI069">Matematické dovednosti</SubjectLink>
        </li>
        <li>
          <SubjectCode>NDMI050</SubjectCode>{" "}
          <SubjectLink code="NDMI050">
            Úvod do řešení problémů kombinatorických, mat. i jiných (IPS) I
          </SubjectLink>
        </li>
        <li>
          <SubjectCode>NMAT100</SubjectCode>{" "}
          <SubjectLink code="NMAT100">
            Matematické problémy nematematiků
          </SubjectLink>
        </li>
        <li>
          <SubjectCode>NJAZ071/070/170</SubjectCode>{" "}
          <strong>
            Anglický jazyk pro <SubjectLink code="NJAZ071">mírně</SubjectLink> /{" "}
            <SubjectLink code="NJAZ070">středně</SubjectLink> /{" "}
            <SubjectLink code="NJAZ170">pokročilé</SubjectLink> I
          </strong>
        </li>
      </ul>
      <p style={{ marginTop: "1.5rem" }}>
        Tohle je jen můj užší výběr. Delší soupis doporučených volitelných
        předmětů — najdeš na fakultní wiki:
      </p>
      <ButtonLink
        href="https://wiki.matfyz.cz/Doporu%C4%8Den%C3%A9%20voliteln%C3%A9%20p%C5%99edm%C4%9Bty"
        icon="bi-journal-bookmark-fill"
        variant="outline"
        inline
      >
        Doporučené volitelné předměty na wiki
      </ButtonLink>
    </section>
  );
}

export function Faq() {
  return (
    <section>
      <h2>
        <i className="bi bi-lightbulb"></i> Časté dotazy (FAQ) &amp; Tipy
      </h2>

      <FaqItem question="Kdy a jak si mám zapsat rozvrh?">
        V zimním semestru v prváku máte rozvrh <strong>pevně daný</strong> (tzv.
        kruhy). Nemusíte si ho složitě skládat. Stačí si zapsat zobrazené
        předměty a máš hotovo. Navíc si akorát můžeš zapsat volitelné předměty
        (třeba ty ze seznamu výše).
      </FaqItem>

      <FaqItem question="Ztrácím se v informacích, kde najdu odpovědi?">
        Doporučuji <strong>Fakultní Wiki</strong>, o kterou se staráme my,
        studenti. Najdeš tam poznámky, rady, předchozí zkoušky i návody na
        byrokracii. Pokud něco nenajde napiš <strong>mě</strong> nebo na{" "}
        <strong>Discord</strong>
      </FaqItem>

      <FaqItem question="Bude to hodně těžké?">Bude to jízda. :D</FaqItem>
    </section>
  );
}

export function SummerSemester() {
  return (
    <div className={styles.futureBox}>
      <h3>
        <i className="bi bi-calendar-check"></i> Co vás čeká v letním semestru?
      </h3>
      <p style={{ marginBottom: "1.5rem" }}>
        Teď to ještě řešit nemusíte, ale v letním semestru si budete vybírat{" "}
        <strong>specializaci</strong>. Připravil jsem k tomu samostatný web, kam
        se můžete v průběhu zimy mrknout, ať víte, co vás čeká.
      </p>
      <ButtonLink
        href={pageHref("map")}
        icon="bi-arrow-right-circle"
        variant="outline"
        inline
      >
        Můj průvodce specializacemi
      </ButtonLink>
    </div>
  );
}

export function GuideFooter() {
  return (
    <footer>
      <p>
        <strong>Máš dotaz, který tu není?</strong> Napiš mi!
      </p>
      <p>
        <i className="bi bi-envelope"></i> E-mail:{" "}
        <TextLink href="mailto:dsmola9@gmail.com" newTab={false}>
          dsmola9@gmail.com
        </TextLink>{" "}
        | <i className="bi bi-discord"></i> Discord: <strong>.mr_bread</strong>
      </p>
      <p style={{ marginTop: "2rem" }}>
        Vytvořeno pro prváky informatiky (česká paralelka) s{" "}
        <i
          className="bi bi-heart-fill"
          style={{ color: "var(--primary-red)" }}
        ></i>
      </p>
    </footer>
  );
}
