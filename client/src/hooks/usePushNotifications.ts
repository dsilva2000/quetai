// Hook para manejar notificaciones push PWA en QUETAI
import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "@/lib/queryClient";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export type PushStatus = "unsupported" | "denied" | "granted" | "prompt" | "loading";

export function usePushNotifications(sessionId: string) {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [suscrito, setSuscrito] = useState(false);

  // Registrar el Service Worker
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(reg => {
        console.log("[sw] Service Worker registrado:", reg.scope);
        // Verificar si ya tiene suscripción activa
        return reg.pushManager.getSubscription();
      })
      .then(sub => {
        if (sub) {
          setSuscrito(true);
          setStatus("granted");
        } else {
          setStatus(Notification.permission as PushStatus);
        }
      })
      .catch(err => {
        console.error("[sw] Error registrando SW:", err);
        setStatus("unsupported");
      });
  }, []);

  // Suscribirse a notificaciones push
  const suscribirse = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false;

    try {
      setStatus("loading");

      // 1. Obtener clave pública VAPID del servidor
      const keyRes = await fetch(`${API_BASE}/api/push/vapid-key`);
      const { publicKey } = await keyRes.json();
      if (!publicKey) throw new Error("No VAPID key");

      // 2. Solicitar permiso al usuario
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return false;
      }

      // 3. Crear suscripción push
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 4. Enviar suscripción al servidor
      await fetch(`${API_BASE}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, subscription }),
      });

      setSuscrito(true);
      setStatus("granted");
      return true;
    } catch (err) {
      console.error("[push] Error suscribiéndose:", err);
      setStatus(Notification.permission as PushStatus);
      return false;
    }
  }, [sessionId]);

  // Cancelar suscripción
  const desuscribirse = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${API_BASE}/api/push/unsubscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSuscrito(false);
      setStatus("prompt");
    } catch (err) {
      console.error("[push] Error desuscribiéndose:", err);
    }
  }, []);

  return { status, suscrito, suscribirse, desuscribirse };
}
