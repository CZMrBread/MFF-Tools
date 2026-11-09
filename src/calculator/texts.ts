/**
 * Texty Kalkulačky, které se mění podle stavu nebo se používají na víc místech –
 * doslova ze staré stránky kalkulačka/index.html (stav e0a6ccf).
 */

/** Návod nad stránkou, jak je ve statickém HTML (do prvního přepnutí záložky). */
export const INSTRUCTIONS_INITIAL =
  "Vyber obor, stupeň studia a specializaci, pak zaškrtávej splněné předměty. U každé kategorie uvidíš získané a požadované kredity a kolik ti ještě zbývá splnit.";

/** Návod po přepnutí na záložku Kalkulačka (starý `switchTab('calc')`). */
export const INSTRUCTIONS_CALC =
  "Vyber stupeň studia a specializaci, pak zaškrtávej splněné předměty. U každé kategorie uvidíš získané a požadované kredity a kolik ti ještě zbývá splnit.";

/** Návod po přepnutí na záložku Rozvrh (starý `switchTab('sched')`). */
export const INSTRUCTIONS_SCHEDULE =
  "Přetáhni (na počítači) nebo klepni (na mobilu) na předmět a zařaď ho do ročníku a semestru. Zařazení předmětu ho zároveň označí jako splněný.";

/** Potvrzení tlačítka „Změnit obor" (starý `resetProgress`). */
export const CHANGE_SPEC_CONFIRM =
  "Opravdu změnit obor? Smaže to aktuální výběr předmětů.";

/** Hláška místo celé stránky, když se nepodaří načíst data (starý `init` → catch). */
export const LOAD_ERROR_MESSAGE =
  "Chyba při načítání dat (nodes.json). Zkontrolujte konzoli.";

/** Popisek přepínače „bez kreditů". */
export const NO_CREDIT_TITLE =
  "Předmět splněn bez započtení kreditů — sníží požadované minimum, ale nepřičte kredity.";
