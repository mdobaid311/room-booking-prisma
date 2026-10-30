"use client";

/**
 * Switches between light and dark, starting from whichever is showing, and
 * remembers the choice in this browser. The script in layout.tsx applies it
 * before the first paint. The switch is a view transition: the browser
 * cross-fades the whole page at once, so the page and the scheduler, which
 * have color transitions of their own, change together instead of one by one.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const dark =
      root.dataset.theme === "dark" ||
      (root.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    const theme = dark ? "light" : "dark";
    const apply = () => {
      root.dataset.theme = theme;
    };
    if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
  }

  return (
    <button type="button" className="button icon" aria-label="Switch between light and dark theme" onClick={toggle}>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 2.75a7.25 7.25 0 0 1 0 14.5z" fill="currentColor" />
      </svg>
    </button>
  );
}
