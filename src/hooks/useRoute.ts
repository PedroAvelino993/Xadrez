import { useEffect, useState } from "react";

// Hash routing: works on static hosting (GitHub Pages) without server rewrites.
export function currentPath(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h.startsWith("/") ? h : "/";
}

export function navigate(path: string) {
  if (currentPath() === path) return;
  window.location.hash = path;
}

export function useRoute(): { path: string; parts: string[]; query: URLSearchParams } {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const on = () => setPath(currentPath());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const [p, q = ""] = path.split("?");
  return { path: p, parts: p.split("/").filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}
