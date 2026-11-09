import App from "./App";
import { ErrorBoundary } from "./core/ErrorBoundary";
import "./index.css";
import { useSiteHeaderOffset } from "./siteHeader";

/**
 * Čtvrtá stránka webu (/algo/): vizualizace algoritmů z dřívějšího samostatného
 * projektu algo/. Uvnitř zůstává HashRouter, takže staré odkazy
 * ~smolad/algo/#/sort/quick?a=… fungují beze změny. Veškeré styly algo jsou pod
 * .algo-root a nezasahují do hlavičky webu (kromě její tmavé varianty).
 */
export function AlgoPage() {
  useSiteHeaderOffset();
  return (
    <div className="algo-root">
      {/* poslední záchrana: chyba mimo stránku modulu (menu, router) neskončí bílou stránkou */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </div>
  );
}
