// QUETAI — Registro de token FCM para notificaciones push nativas (APK)
// Registra el token en CADA apertura para asegurar que esté siempre vigente

import { useEffect } from "react";
import { API_BASE } from "@/lib/queryClient";

// Guardar token localmente para detectar cambios
const FCM_TOKEN_KEY = "quetai_fcm_token";

export function useFCM(sessionId: string) {
  useEffect(() => {
    if (!sessionId) return;

    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    const push = cap?.Plugins?.PushNotifications;
    if (!push) {
      console.warn("[fcm] Plugin PushNotifications no disponible");
      return;
    }

    const registrar = async () => {
      try {
        // Crear canal de alta prioridad (Samsung/Android)
        try {
          await push.createChannel({
            id: "quetai_reminders",
            name: "Recordatorios QUETAI",
            description: "Avisos de medicamentos y pastillas",
            importance: 5,
            visibility: 1,
            sound: "default",
            vibration: true,
            lights: true,
          });
        } catch (e) { /* canal ya existe */ }

        // Pedir permiso
        const permResult = await push.requestPermissions();
        if (permResult?.receive !== "granted") {
          console.log("[fcm] Permiso denegado");
          return;
        }

        // Eliminar listeners anteriores para evitar duplicados
        await push.removeAllListeners?.().catch(() => {});

        // Listener ANTES de register() para no perderse el evento
        push.addListener("registration", async (data: { value: string }) => {
          const token = data.value;
          if (!token) return;

          const tokenAnterior = localStorage.getItem(FCM_TOKEN_KEY);
          console.log(`[fcm] Token obtenido: ${token.slice(0,15)}...${tokenAnterior === token ? " (mismo)" : " (NUEVO)"}`);
          localStorage.setItem(FCM_TOKEN_KEY, token);

          // Siempre enviar al servidor (puede haber cambiado el sessionId)
          try {
            const r = await fetch(`${API_BASE}/api/fcm/token`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId, token }),
            });
            if (r.ok) console.log("[fcm] Token registrado en servidor ✓");
          } catch (err) {
            console.error("[fcm] Error enviando token:", err);
          }
        });

        push.addListener("registrationError", (err: any) => {
          console.error("[fcm] Error de registro:", err);
        });

        push.addListener("pushNotificationReceived", (notif: any) => {
          console.log("[fcm] Notificación foreground:", notif.title);
        });

        push.addListener("pushNotificationActionPerformed", (action: any) => {
          console.log("[fcm] Notificación tocada");
        });

        // Registrar (generará un token nuevo si el anterior expiró)
        await push.register();
        console.log("[fcm] Registro FCM solicitado");

      } catch (err) {
        console.error("[fcm] Error inicializando FCM:", err);
      }
    };

    registrar();
  }, [sessionId]); // Se re-ejecuta si cambia el sessionId
}
