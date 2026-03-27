// QUETAI — Firebase Cloud Messaging (FCM)
// Envía notificaciones push nativas a dispositivos Android via Firebase

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

let fcmInitializado = false;

// Inicializar Firebase Admin con la cuenta de servicio
export function inicializarFCM(): boolean {
  if (fcmInitializado || getApps().length > 0) return true;

  const serviceAccountJson = process.env.FCM_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    console.log("[fcm] FCM_SERVICE_ACCOUNT no configurado — notificaciones FCM desactivadas");
    return false;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
    fcmInitializado = true;
    console.log("[fcm] Firebase Admin inicializado correctamente");
    return true;
  } catch (err: any) {
    console.error("[fcm] Error inicializando Firebase Admin:", err?.message);
    return false;
  }
}

// Enviar notificación push a un token FCM específico
export async function enviarFCM(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  if (!fcmInitializado && !inicializarFCM()) return false;

  try {
    const mensaje = {
      notification: { title, body },
      data: data || {},
      android: {
        priority: "high" as const,
        notification: {
          sound: "default",
          channelId: "quetai_reminders",
          priority: "high" as const,
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      token,
    };

    const response = await getMessaging().send(mensaje);
    console.log(`[fcm] Notificación enviada: ${response}`);
    return true;
  } catch (err: any) {
    if (err?.code === "messaging/registration-token-not-registered") {
      console.log("[fcm] Token expirado, se eliminará");
      return false;
    }
    console.error("[fcm] Error enviando FCM:", err?.message);
    return false;
  }
}

// Enviar a múltiples tokens (multicast)
export async function enviarFCMMulticast(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ exitosos: number; fallidos: number }> {
  if (!tokens.length) return { exitosos: 0, fallidos: 0 };
  
  let exitosos = 0, fallidos = 0;
  for (const token of tokens) {
    const ok = await enviarFCM(token, body, title, data);
    if (ok) exitosos++; else fallidos++;
  }
  return { exitosos, fallidos };
}
