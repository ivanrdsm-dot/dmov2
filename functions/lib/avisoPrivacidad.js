/* AVISO DE PRIVACIDAD PARA COLABORADORES (choferes y oficina).
   Una sola fuente: la usan la app del chofer, el sistema de oficina y el servidor (que exige la autorización).
   Si cambia el texto, se sube VERSION y todos vuelven a autorizar al entrar.
   Datos que faltan de la empresa (razón social, domicilio, correo de privacidad): van vacíos y NO se inventan;
   en cuanto el director los dé, se agregan aquí y se sube la versión. Recomendado: revisión de un abogado laboral. */
export const VERSION_AVISO = "2026-11-25";
export const RESPONSABLE = {
  nombre: "D Movimiento",
  razonSocial: "",          // PENDIENTE: la da el director
  domicilio: "",            // PENDIENTE: la da el director
  contacto: "WhatsApp de operación 55 9911 2326 o directamente en la oficina",
};

/** Secciones del aviso. tipo: "chofer" | "oficina". */
export function textoAviso(tipo = "chofer"){
  const chofer = tipo === "chofer";
  const quien = [RESPONSABLE.razonSocial || RESPONSABLE.nombre, RESPONSABLE.domicilio ? `con domicilio en ${RESPONSABLE.domicilio}` : ""].filter(Boolean).join(", ");
  return [
    { titulo: "Quién es responsable de tus datos", texto: `${quien} es responsable del uso y la protección de tus datos personales. Para cualquier duda sobre este aviso: ${RESPONSABLE.contacto}.` },
    { titulo: "Qué datos usamos", texto: chofer
      ? "Tu nombre y celular; la fotografía de tu rostro que tomas al iniciar tu día; las fotos de placas, tablero, tickets y entregas; la ubicación GPS de tu celular durante tu jornada (desde tu check-in hasta tu check-out); kilometraje, gasolina y gastos que registras; y el modelo del celular con el que entras."
      : "Tu nombre, correo y cuenta de acceso, y el registro de lo que haces en el sistema (rutas que das de alta, cambios, lugares nuevos y la hora en que lo haces)." },
    { titulo: "Para qué los usamos", texto: chofer
      ? "Control de asistencia y puntualidad; tu seguridad, la de la unidad y la de la carga (incluido el botón SOS); seguimiento de las rutas y avisos a los clientes; comprobar las entregas; revisar y reembolsar gastos; prevenir fraudes y el uso indebido de las unidades; y medir el desempeño para incentivos."
      : "Operar el servicio, dar seguimiento a las rutas, mantener la seguridad de la información, prevenir fraudes y el uso indebido de unidades o datos, y auditar los cambios que se hacen en el sistema." },
    ...(chofer ? [{ titulo: "Tu ubicación", texto: "Se registra solo durante tu jornada de trabajo, del check-in al check-out (en rutas foráneas, cada día de trabajo). El cliente ve la ubicación de la unidad únicamente mientras dura su servicio, con un enlace temporal." }] : []),
    { titulo: "Con quién se comparten", texto: chofer
      ? "Con los clientes, solo la ubicación de la unidad durante su servicio y las evidencias de su entrega; con los proveedores de tecnología que alojan y procesan el sistema (Google Cloud; Anthropic para leer los tickets de gastos), que no pueden usarlos para otra cosa; y con autoridades cuando la ley lo pida. Tus datos no se venden."
      : "Con los proveedores de tecnología que alojan el sistema (Google Cloud) y con autoridades cuando la ley lo pida. Tus datos no se venden." },
    { titulo: "Cuánto tiempo se guardan", texto: "Mientras dure tu relación de trabajo con la empresa y, después, el tiempo que la ley obliga a conservar estos registros." },
    { titulo: "Tus derechos", texto: `Puedes pedir acceder a tus datos, corregirlos, cancelarlos u oponerte a su uso, y también revocar esta autorización, por ${RESPONSABLE.contacto}. ${chofer ? "La app es tu herramienta de trabajo: sin esta autorización no puedes usarla." : "Sin esta autorización no puedes usar el sistema."}` },
    { titulo: "Cambios a este aviso", texto: "Si este aviso cambia, te lo mostraremos al entrar y te pediremos autorizar de nuevo." },
  ];
}
