import { useAutoHideHeader } from "./useAutoHideHeader";
import { PAGES, navLabel, pageHref } from "./pages";

/**
 * Sdílená hlavička s navigací mezi nástroji – markup jako na starých stránkách, navíc u odkazů
 * `data-short` (krátký popisek pod 600 px), `aria-label` (navLabel) a `title` s plným jménem.
 */
export function SiteHeader() {
  const headerRef = useAutoHideHeader<HTMLElement>();

  return (
    <header className="site-header" ref={headerRef}>
      <div className="header-container">
        <a href={pageHref("guide")} className="header-logo">
          <i className="bi bi-box-seam"></i> MFF UK Nástroje
        </a>
        <nav className="main-nav">
          {PAGES.map((page) => (
            // na úzkém displeji CSS ukáže místo plného textu data-short (global.css); jméno obsahuje obojí
            <a
              key={page.id}
              href={pageHref(page.id)}
              data-short={page.short}
              aria-label={navLabel(page)}
              title={page.title}
            >
              {page.title}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
