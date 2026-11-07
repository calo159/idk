"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScanBarcode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizarCodigo } from "@/lib/codigos";

interface DetectorNativo {
  detect(fuente: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: {
      new (op?: { formats: string[] }): DetectorNativo;
    };
  }
}

const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

/**
 * Botón que abre la cámara y entrega el primer código leído.
 * Usa BarcodeDetector (Chrome/Android) y, si no existe (iPhone/Safari), ZXing.
 * Un lector USB/Bluetooth funciona aparte: escribe en el campo enfocado.
 */
export function EscanerCodigo({
  alLeer,
  etiqueta = "Escanear",
}: {
  alLeer: (codigo: string) => void;
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  const cerrar = useCallback(() => setAbierto(false), []);

  useEffect(() => {
    if (!abierto) return;
    let activo = true;
    let flujo: MediaStream | null = null;
    let detener: (() => void) | null = null;

    const entregar = (crudo: string) => {
      if (!activo) return;
      const codigo = normalizarCodigo(crudo);
      if (!codigo) return;
      activo = false;
      navigator.vibrate?.(60);
      alLeer(codigo);
      setAbierto(false);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador no permite usar la cámara (se necesita HTTPS).");
        return;
      }
      try {
        if (window.BarcodeDetector) {
          flujo = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
          });
          if (!activo || !video.current) return flujo.getTracks().forEach((t) => t.stop());
          video.current.srcObject = flujo;
          await video.current.play();
          const detector = new window.BarcodeDetector({ formats: FORMATOS });
          const id = setInterval(async () => {
            if (!video.current) return;
            try {
              const r = await detector.detect(video.current);
              if (r[0]) entregar(r[0].rawValue);
            } catch {
              /* frame no listo */
            }
          }, 250);
          detener = () => clearInterval(id);
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const lector = new BrowserMultiFormatReader();
          const controles = await lector.decodeFromConstraints(
            { video: { facingMode: { ideal: "environment" } } },
            video.current!,
            (resultado) => resultado && entregar(resultado.getText()),
          );
          detener = () => controles.stop();
        }
      } catch (e) {
        const nombre = e instanceof DOMException ? e.name : "";
        setError(
          nombre === "NotAllowedError"
            ? "Permite el acceso a la cámara para escanear."
            : "No pudimos abrir la cámara.",
        );
      }
    })();

    return () => {
      activo = false;
      detener?.();
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, [abierto, alLeer]);

  return (
    <>
      <Button type="button" variant="outline" className="h-11" onClick={() => {
          setError(null);
          setAbierto(true);
        }}>
        <ScanBarcode className="size-4" aria-hidden /> {etiqueta}
      </Button>
      {abierto ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Escáner de código de barras"
          className="fixed inset-0 z-50 flex flex-col bg-black"
        >
          <div className="flex items-center justify-between p-3 text-white">
            <span className="text-sm">Apunta al código de barras</span>
            <Button type="button" variant="ghost" size="icon" onClick={cerrar} aria-label="Cerrar">
              <X className="size-5" />
            </Button>
          </div>
          <div className="relative flex-1">
            <video ref={video} playsInline muted className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80" />
          </div>
          {error ? (
            <p role="alert" className="bg-destructive p-3 text-center text-sm text-white">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
