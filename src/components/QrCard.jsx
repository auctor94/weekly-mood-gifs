import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QrCard({ code }) {
  const [dataUrl, setDataUrl] = useState("");
  const joinUrl = `${window.location.origin}/j/${code}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(joinUrl, {
      width: 360,
      margin: 1,
      color: { dark: "#140b1f", light: "#f6e7c1" },
    }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  return (
    <div className="qr-card">
      <p className="code-huge">{code}</p>
      {dataUrl ? <img src={dataUrl} alt={`QR ${code}`} /> : <p className="muted">Собираем QR…</p>}
      <p className="join-url">{joinUrl}</p>
    </div>
  );
}
