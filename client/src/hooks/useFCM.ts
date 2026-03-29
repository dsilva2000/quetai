// QUETAI — Registro de token FCM para notificaciones push nativas (APK)
// Usa el bridge nativo de Capacitor directamente para evitar el resolvedor web de Vite

import { useEffect } from "react";
import { API_BASE } from "@/lib/queryClient";

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
        // Pedir permiso
        const permResult = await push.requestPermissions();
        if (permResult?.receive !== "granted") {
          console.log("[fcm] Permiso denegado:", permResult?.receive);
          return;
        }

        // Crear canal de notificaciones con alta prioridad (Samsung/Android)
        try {
          await push.createChannel({
            id: "quetai_reminders",
            name: "Recordatorios QUETAI",
            description: "Avisos de medicamentos y pastillas",
            importance: 5, // IMPORTANCE_HIGH
            visibility: 1, // VISIBILITY_PUBLIC
            sound: "default",
            vibration: true,
            lights: true,
          });
          console.log("[fcm] Canal de notificaciones creado");
        } catch (e) {
          console.log("[fcm] Canal ya existe o no compatible:", e);
        }

        // Registrar en FCM
        await push.register();
        console.log("[fcm] Registro FCM iniciado...");

        // Pedir exención de optimización de batería (crítico para Samsung)
        const cap = (window as any).Capacitor;
        const device = cap?.Plugins?.Device;
        if (device) {
          const info = await device.getInfo?.();
          console.log("[fcm] Dispositivo:", info?.manufacturer, info?.model);
        }

        // Listener: token obtenido
        push.addListener("registration", async (data: { value: string }) => {
          const token = data.value;
          console.log("[fcm] Token FCM obtenido:", token.slice(0, 20) + "...");
          try {
            const r = await fetch(`${API_BASE}/api/fcm/token`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId, token }),
            });
            if (r.ok) console.log("[fcm] Token guardado en servidor ✓");
            else console.error("[fcm] Error guardando token:", r.status);
          } catch (err) {
            console.error("[fcm] Error enviando token:", err);
          }
        });

        // Listener: error de registro
        push.addListener("registrationError", (err: any) => {
          console.error("[fcm] Error de registro FCM:", err);
        });

        // Listener: notificación en foreground
        push.addListener("pushNotificationReceived", (notif: any) => {
          console.log("[fcm] Notificación recibida en foreground:", notif.title);
          // El bubble de RecordatorioBubble lo muestra vía polling
        });

        // Listener: usuario tocó la notificación
        push.addListener("pushNotificationActionPerformed", (action: any) => {
          const sid = action.notification?.data?.sessionId;
          console.log("[fcm] Notificación tocada, sid:", sid);
          // Ya estamos en la app, no necesitamos navegar
        });

      } catch (err) {
        console.error("[fcm] Error inicializando FCM:", err);
      }
    };

    registrar();
  }, [sessionId]);
}
