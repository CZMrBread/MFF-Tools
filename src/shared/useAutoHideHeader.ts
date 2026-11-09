import { useEffect, useRef } from "react";

/**
 * Automatické schování hlavičky při scrollu dolů a zobrazení při scrollu nahoru.
 * Přepis IIFE z konce starých stránek – stejné prahy i názvy tříd.
 */
export function useAutoHideHeader<T extends HTMLElement>() {
  const headerRef = useRef<T>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    let lastScrollY = window.scrollY;
    let ticking = false;
    let frame = 0;
    const threshold = 10; // minimální pohyb, aby to nebliklo u drobných scrollů

    function onScroll() {
      if (!header) return;
      const currentScrollY = window.scrollY;

      header.classList.toggle("site-header--scrolled", currentScrollY > 8);

      if (Math.abs(currentScrollY - lastScrollY) > threshold) {
        if (
          currentScrollY > lastScrollY &&
          currentScrollY > header.offsetHeight
        ) {
          header.classList.add("site-header--hidden"); // scroll dolů -> schovat
        } else {
          header.classList.remove("site-header--hidden"); // scroll nahoru -> zobrazit
        }
        lastScrollY = currentScrollY;
      }
      ticking = false;
    }

    function requestTick() {
      if (!ticking) {
        frame = window.requestAnimationFrame(onScroll);
        ticking = true;
      }
    }

    window.addEventListener("scroll", requestTick, { passive: true });
    return () => {
      window.removeEventListener("scroll", requestTick);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return headerRef;
}
