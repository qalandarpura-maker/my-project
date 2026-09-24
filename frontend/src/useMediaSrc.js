import { useEffect, useMemo, useState } from "react";

export function resolveMediaUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  // Relative /uploads/... URL — production me frontend aur backend alag origin par
  // hain to backend origin se resolve karo (dev me Vite proxy khud handle karta hai)
  if (url.startsWith("/")) {
    const apiBase = import.meta.env.VITE_API_URL;
    if (apiBase && /^https?:\/\//i.test(apiBase)) {
      return `${apiBase.replace(/\/api\/?$/, "").replace(/\/+$/, "")}${url}`;
    }
  }
  return url;
}

// Authenticated media ke liye URL resolve + load karke blob URL deta hai.
// Public/http(s) URL seedha return hota hai (auth ki zaroorat nahi).
export function useMediaSrc(url) {
  const resolved = useMemo(() => resolveMediaUrl(url), [url]);
  const isExternal = /^https?:\/\//i.test(resolved || "");
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!resolved) {
      setSrc(null);
      return undefined;
    }
    if (isExternal) {
      setSrc(resolved);
      return undefined;
    }
    let objectUrl = null;
    let cancelled = false;
    setSrc(null);
    (async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(resolved, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`fetch fail: ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resolved, isExternal]);

  return src;
}