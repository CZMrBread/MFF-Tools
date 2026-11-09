import {
  ElectiveSubjects,
  EmailForwarding,
  Faq,
  GuideFooter,
  GuideHeader,
  ImportantLinks,
  PublishPermission,
  QuickStartIntro,
  Scholarships,
  SisSettings,
  SummerSemester,
} from "./content";
import "./guide.css";
import styles from "./guide.module.css";

/**
 * Průvodce prváka – statická stránka. Obsah (texty, odkazy, ikony) je
 * v content.tsx, tady se jen skládají sekce ve stejném pořadí jako na staré
 * stránce. Hlavičku webu vykresluje App.tsx.
 */
export function GuidePage() {
  return (
    <div className={styles.container}>
      <GuideHeader />
      <QuickStartIntro />
      <SisSettings />
      <PublishPermission />
      <EmailForwarding />
      <Scholarships />
      <ImportantLinks />
      <ElectiveSubjects />
      <Faq />
      <SummerSemester />
      <GuideFooter />
    </div>
  );
}
