import { useEffect, useMemo, useState } from "react";

function resolvePhotoUrl(photo) {
  if (!photo || /^https?:\/\//i.test(photo)) return photo;
  // Relative /uploads/... URL — production me frontend aur backend alag origin par hain
  // to backend origin se resolve karo (dev me Vite proxy khud handle karta hai)
  if (photo.startsWith("/")) {
    const apiBase = import.meta.env.VITE_API_URL;
    if (apiBase && /^https?:\/\//i.test(apiBase)) {
      return `${apiBase.replace(/\/api\/?$/, "").replace(/\/+$/, "")}${photo}`;
    }
  }
  return photo;
}

function initialsOf(customer) {
  const name = (customer?.firstName || "").trim();
  if (name) return name[0].toUpperCase();
  const user = customer?.telegramUser;
  return user ? user[0].toUpperCase() : "👤";
}

export default function Avatar({ customer, size = 40, className = "" }) {
  const photo = useMemo(() => resolvePhotoUrl(customer?.photo), [customer?.photo]);
  const isExternal = /^https?:\/\//i.test(photo || "");
  const [blobSrc, setBlobSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [photo]);

  // Relative /uploads/... URL log in karne wale user ke liye auth ke sath fetch karo
  useEffect(() => {
    if (!photo || isExternal) {
      setBlobSrc(null);
      return undefined;
    }
    let objectUrl = null;
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(photo, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`fetch fail: ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo, isExternal]);

  // Absolute URL (R2/CDN) seedha dikhao, auth/CORS ki zaroorat nahi
  const src = isExternal ? photo : blobSrc;
  const base = `flex items-center justify-center rounded-full overflow-hidden shrink-0 ${className}`;

  if (src && !failed) {
    return (
      <img
        key={src}
        src={src}
        alt="profile"
        onError={() => setFailed(true)}
        className={`${base} object-cover`}
      />
    );
  }

  return (
    <div
      className={`${base} bg-gradient-to-br from-brand to-lemon text-sm font-bold text-white`}
      title={customer?.firstName || "Customer"}
    >
      {initialsOf(customer)}
    </div>
  );
}