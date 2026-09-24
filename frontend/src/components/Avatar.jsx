import { useState } from "react";
import { useMediaSrc } from "../useMediaSrc.js";

function initialsOf(customer) {
  const name = (customer?.firstName || "").trim();
  if (name) return name[0].toUpperCase();
  const user = customer?.telegramUser;
  return user ? user[0].toUpperCase() : "👤";
}

export default function Avatar({ customer, size = 40, className = "" }) {
  const src = useMediaSrc(customer?.photo);
  const [failed, setFailed] = useState(false);

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