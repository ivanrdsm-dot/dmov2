/* Configuración pública de Firebase (la misma del panel web; no es un secreto).
   Lo sensible —identidad, equipo, ubicación, geocerca— lo valida el servidor. */
export const FIREBASE = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: "salesflow-crm-13c4a.firebaseapp.com",
  projectId: "salesflow-crm-13c4a",
  storageBucket: "salesflow-crm-13c4a.firebasestorage.app",
  messagingSenderId: "525995422237",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
};
export const REGION = "us-central1";
export const COLOR = { azul: "#042552", naranja: "#F27B13", verde: "#059669", rojo: "#e11d48", ambar: "#d97706", gris: "#607080", fondo: "#f1f4fb", texto: "#0c1829" };
/* Rastreo: más seguido en movimiento, menos parado. */
export const RASTREO = { distanciaM: 30, latidoSeg: 60, lote: 25, envioSeg: 45 };
