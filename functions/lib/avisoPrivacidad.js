/* AVISO DE PRIVACIDAD PARA COLABORADORES (choferes y oficina).
   Una sola fuente: la usan la app del chofer, el sistema de oficina y el servidor (que exige la autorización).
   Si cambia el texto, se sube VERSION y todos vuelven a autorizar al entrar.
   Razón social y domicilio: Constancia de Situación Fiscal del SAT (5-mar-2026). Correo: lo dio el director.
   Recomendado: revisión de un abogado laboral. */
export const VERSION_AVISO = "2026-11-25";             // choferes
export const VERSION_AVISO_OFICINA = "2026-11-26.2";   // oficina: selfie y ubicación durante la jornada (también continua en la app)
export const versionAviso = tipo => tipo === "chofer" ? VERSION_AVISO : VERSION_AVISO_OFICINA;
export const RESPONSABLE = {
  nombre: "D Movimiento",
  razonSocial: "D EN MOVIMIENTO, S.A. de C.V.",
  domicilio: "Av. Insurgentes Sur 1814, interior 702, col. Florida, alcaldía Álvaro Obregón, C.P. 01030, Ciudad de México",
  contacto: "el correo logistica@denmovimiento.mx, el WhatsApp de operación 55 9911 2326 o directamente en la oficina",
};

/** Secciones del aviso. tipo: "chofer" | "oficina". */
export function textoAviso(tipo = "chofer"){
  const chofer = tipo === "chofer";
  const quien = [RESPONSABLE.razonSocial ? `${RESPONSABLE.razonSocial} (${RESPONSABLE.nombre})` : RESPONSABLE.nombre, RESPONSABLE.domicilio ? `con domicilio en ${RESPONSABLE.domicilio}` : ""].filter(Boolean).join(", ");
  return [
    { titulo: "Quién es responsable de tus datos", texto: `${quien} es responsable del uso y la protección de tus datos personales. Para cualquier duda sobre este aviso: ${RESPONSABLE.contacto}.` },
    { titulo: "Qué datos usamos", texto: chofer
      ? "Tu nombre y celular; la fotografía de tu rostro que tomas al iniciar tu día; las fotos de placas, tablero, tickets y entregas; la ubicación GPS de tu celular durante tu jornada (desde tu check-in hasta tu check-out); kilometraje, gasolina y gastos que registras; y el modelo del celular con el que entras."
      : "Tu nombre, correo y cuenta de acceso; la fotografía de tu rostro que tomas al registrar tu entrada y tu salida; tu ubicación al registrar entrada y salida y durante tu jornada; el modelo del celular con el que entras; y el registro de lo que haces en el sistema (rutas que das de alta, cambios, lugares nuevos y la hora en que lo haces)." },
    { titulo: "Para qué los usamos", texto: chofer
      ? "Control de asistencia y puntualidad; tu seguridad, la de la unidad y la de la carga (incluido el botón SOS); seguimiento de las rutas y avisos a los clientes; comprobar las entregas; revisar y reembolsar gastos; prevenir fraudes y el uso indebido de las unidades; y medir el desempeño para incentivos."
      : "Control de asistencia, puntualidad y tiempo extra; operar el servicio y dar seguimiento a las rutas; mantener la seguridad de la información; prevenir fraudes y el uso indebido de unidades o datos; y auditar los cambios que se hacen en el sistema." },
    ...(chofer ? [{ titulo: "Tu ubicación", texto: "Se registra solo durante tu jornada de trabajo, del check-in al check-out (en rutas foráneas, cada día de trabajo). El cliente ve la ubicación de la unidad únicamente mientras dura su servicio, con un enlace temporal." }]
      : [{ titulo: "Tu ubicación", texto: "Se registra al marcar tu entrada y tu salida y, durante tu jornada (de tu entrada a tu salida): cada pocos minutos mientras tengas abierto el sistema en el navegador, o de forma continua si usas la app de D Movimiento (también con el celular bloqueado, con un aviso fijo en pantalla). Fuera de tu jornada no se registra. Solo la ve la dirección." }]),
    { titulo: "Con quién se comparten", texto: chofer
      ? "Con los clientes, solo la ubicación de la unidad durante su servicio y las evidencias de su entrega; con los proveedores de tecnología que alojan y procesan el sistema (Google Cloud; Anthropic para leer los tickets de gastos), que no pueden usarlos para otra cosa; y con autoridades cuando la ley lo pida. Tus datos no se venden."
      : "Con los proveedores de tecnología que alojan el sistema (Google Cloud) y con autoridades cuando la ley lo pida. Tus datos no se venden." },
    { titulo: "Cuánto tiempo se guardan", texto: "Mientras dure tu relación de trabajo con la empresa y, después, el tiempo que la ley obliga a conservar estos registros." },
    { titulo: "Tus derechos", texto: `Puedes pedir acceder a tus datos, corregirlos, cancelarlos u oponerte a su uso, y también revocar esta autorización, por ${RESPONSABLE.contacto}. ${chofer ? "La app es tu herramienta de trabajo: sin esta autorización no puedes usarla." : "Sin esta autorización no puedes usar el sistema."}` },
    { titulo: "Cambios a este aviso", texto: "Si este aviso cambia, te lo mostraremos al entrar y te pediremos autorizar de nuevo." },
  ];
}
