import { useEffect, useState } from "react";

function initialsOf(customer) {
  const name = (customer?.firstName || "").trim();
  if (name) return name[0].toUpperCase();
  const user = customer?.telegramUser;
  return user ? user[0].toUpperCase() : "👤";
}

export default function Avatar({ customer, size = 40, className = "" }) {
  const [src, setSrc] = useState(null);
  const photo = customer?.photo;

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;

    if (!photo) {
      setSrc(null);
      return undefined;
    }

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
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo]);

  const base = `flex items-center justify-center rounded-full overflow-hidden shrink-0 ${className}`;

  if (src) {
    return <img src={src} alt="profile" className={`${base} object-cover`} />;
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