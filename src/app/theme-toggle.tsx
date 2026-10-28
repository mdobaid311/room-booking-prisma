"use client";

/**
 * Switches between light and dark, starting from whichever is showing, and
 * remembers the choice in this browser. The script in layout.tsx applies it
 * before the first paint.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const dark =
      root.dataset.theme === "dark" ||
      (root.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset.theme = dark ? "light" : "dark";
    try {
      localStorage.setItem("theme", root.dataset.theme);
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
