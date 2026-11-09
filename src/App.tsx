import { lazy, Suspense } from "react";
import { SiteHeader } from "./shared/SiteHeader";
import type { PageId } from "./shared/pages";

// Každá stránka se načítá jako samostatný chunk (JS i CSS). Na jedné URL se tak
// stáhne jen kód a styly jejího nástroje (např. D3 jen na mapě) a stránkové styly
// se navzájem neovlivňují.
const GuidePage = lazy(() =>
  import("./guide/GuidePage").then((module) => ({ default: module.GuidePage })),
);
const CalculatorPage = lazy(() =>
  import("./calculator/CalculatorPage").then((module) => ({
    default: module.CalculatorPage,
  })),
);
const MapPage = lazy(() =>
  import("./map/MapPage").then((module) => ({ default: module.MapPage })),
);
const AlgoPage = lazy(() =>
  import("./algo/AlgoPage").then((module) => ({ default: module.AlgoPage })),
);

/**
 * Layout: sdílená hlavička + stránka zvoleného nástroje.
 * Patičku si řeší každá stránka sama (průvodce má vlastní, kalkulačka a mapa
 * používají sdílenou SiteFooter) – stejně jako ve starých stránkách. Stránka
 * algoritmů patičku nemá (jako dřívější samostatné algo/).
 */
export default function App({ page }: { page: PageId }) {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={null}>
        {page === "guide" && <GuidePage />}
        {page === "calculator" && <CalculatorPage />}
        {page === "map" && <MapPage />}
        {page === "algo" && <AlgoPage />}
      </Suspense>
    </>
  );
}
