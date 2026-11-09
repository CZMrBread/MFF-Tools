/** Sdílená patička kalkulačky a mapy (markup a texty 1:1 se starými stránkami). */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-info">
          <h4>MFF UK Studentské Nástroje</h4>
          <p>Vytvořeno studenty pro studenty.</p>
          <p>
            Nejedná se o oficiální stránky Matematicko-fyzikální fakulty UK.
          </p>
        </div>
        <div className="footer-links">
          <a
            href="https://github.com/CZMrBread/MFF-Tools"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="bi bi-github"></i> GitHub
          </a>
          <a
            href="https://discord.gg/7afJ9ES"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="bi bi-discord"></i> Discord
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        &copy; 2026 MFF UK Studentské Nástroje. Žádná práva nevyhrazena.
      </div>
    </footer>
  );
}
