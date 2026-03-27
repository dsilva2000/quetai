import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'tech.quetai.app',
  appName: 'QUETAI',
  webDir: 'dist/public',
  // Sin server.url — el APK sirve el JS localmente
  // Esto permite que los plugins nativos (TTS, Push) funcionen correctamente
  android: {
    allowMixedContent: false,
    backgroundColor: '#f5f0e8',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#4a7c59',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
