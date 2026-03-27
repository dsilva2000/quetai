// QUETAI — Hook para registrar token FCM en el APK nativo
// Solo activo cuando corre en Capacitor (Android APK)

import { useEffect } from "react";
import { API_BASE } from "@/lib/queryClient";

// Detectar si estamos corriendo en Capacitor (APK)
function isCapacitor(): boolean {
  return !!(window as any).Capacitor;
}

export function useFCM(sessionId: string) {
  useEffect(() => {
    if (!sessionId || !isCapacitor()) return;

    // Registrar token FCM cuando la app arranca en Android
    const registrarToken = async () => {
      try {
        // Importar Capacitor PushNotifications dinámicamente
        const { PushNotifications } = await import("@capacitor/push-notifications");

        // Pedir permiso
        const permResult = await PushNotifications.requestPermissions();
        if (permResult.receive !== "granted") {
          console.log("[fcm] Permiso de notificaciones denegado");
          return;
        }

        // Registrar con FCM
        await PushNotifications.register();

        // Escuchar cuando llega el token
        PushNotifications.addListener("registration", async (tokenData) => {
          const token = tokenData.value;
          console.log("[fcm] Token obtenido:", token.slice(0, 20) + "...");

          // Enviar token al servidor
          try {
            await fetch(`${API_BASE}/api/fcm/token`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId, token }),
            });
            console.log("[fcm] Token guardado en el servidor");
          } catch (err) {
            console.error("[fcm] Error guardando token:", err);
          }
        });

        // Manejar notificaciones cuando la app está en primer plano
        PushNotifications.addListener("pushNotificationReceived", (notification) => {
          console.log("[fcm] Notificación recibida:", notification.title);
          // En foreground, mostrar como toast o alert nativo
          if (notification.title && notification.body) {
            // El sistema la muestra automáticamente en Android 13+
          }
        });

        // Manejar tap en la notificación
        PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          console.log("[fcm] Notificación tocada:", action.notification.title);
          // La app ya está abierta, no necesitamos hacer nada más
        });

        PushNotifications.addListener("registrationError", (err) => {
          console.error("[fcm] Error de registro:", err.error);
        });

      } catch (err) {
        console.error("[fcm] Error iniciando FCM:", err);
      }
    };

    registrarToken();
  }, [sessionId]);
}
