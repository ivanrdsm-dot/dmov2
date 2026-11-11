import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Pressable, SafeAreaView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, esFallaDeRed, llamar, mensajeDe } from "./src/firebase";
import { idDispositivo, modeloDispositivo } from "./src/dispositivo";
import { alCambiarCola, pendientes, procesarCola, Tarea } from "./src/cola";
import { subir } from "./src/fotos";
import { posicionAhora, ultimaPosicion } from "./src/rastreo";
import { COLOR } from "./src/config";
import { Boton, Nota, Titulo, s } from "./src/ui";
import Login from "./src/pantallas/Login";
import CheckIn from "./src/pantallas/CheckIn";
import Ruta from "./src/pantallas/Ruta";

const fechaCDMX = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
type Estado = { paso: "cargando" } | { paso: "login" } | { paso: "bloqueado"; motivo: string } | { paso: "checkin"; choferId: string; nombre: string } | { paso: "ruta"; choferId: string; nombre: string } | { paso: "fin"; choferId: string; nombre: string };

export default function App(){
  const [estado, setEstado] = useState<Estado>({ paso: "cargando" });
  const [enCola, setEnCola] = useState(0);
  const [aviso, setAviso] = useState("");

  /* Cola offline: fotos, posiciones y cierres guardados se envían en orden al haber señal. */
  const vaciarCola = useCallback(() => {
    procesarCola(async (t: Tarea) => {
      if(t.tipo === "foto") await subir(t.uri, t.ruta);
      else if(t.tipo === "posiciones") await llamar("choferSubirPosiciones", { dispositivoId: await idDispositivo(), servicioId: t.servicioId, posiciones: t.posiciones });
      else await llamar(t.funcion, t.datos);
    }, esFallaDeRed, (t, e) => { if(t.tipo === "llamada") setAviso("Operaciones debe revisar una parada: " + mensajeDe(e)); }).catch(() => {});
  }, []);
  useEffect(() => { pendientes().then(setEnCola); const quitar = alCambiarCola(setEnCola); const t = setInterval(vaciarCola, 30000);
    const sub = AppState.addEventListener("change", x => { if(x === "active") vaciarCola(); });
    return () => { quitar(); clearInterval(t); sub.remove(); }; }, [vaciarCola]);

  const preparar = useCallback(async (u: User | null) => {
    if(!u){ setEstado({ paso: "login" }); return; }
    setEstado({ paso: "cargando" });
    try {
      const r = await llamar<{ ok: boolean; choferId: string; nombre: string }>("choferRegistrarDispositivo", { dispositivoId: await idDispositivo(), modelo: modeloDispositivo() });
      const jornada = await getDoc(doc(db, "jornadas", `${r.choferId}_${fechaCDMX()}`));
      setEstado({ paso: !jornada.exists() ? "checkin" : jornada.data()?.estado === "Cerrada" ? "fin" : "ruta", choferId: r.choferId, nombre: r.nombre });
      vaciarCola();
    } catch(e){ setEstado({ paso: "bloqueado", motivo: mensajeDe(e) }); }
  }, [vaciarCola]);
  useEffect(() => onAuthStateChanged(auth, preparar), [preparar]);

  const sos = () => Alert.alert("¿Enviar SOS?", "Operaciones recibirá una alerta de emergencia con tu ubicación.", [
    { text: "Cancelar", style: "cancel" },
    { text: "Enviar SOS", style: "destructive", onPress: async () => {
        /* Ubicación de este momento (máx. 5 s); si no llega, la última conocida. */
        const p = await Promise.race([posicionAhora(), new Promise<null>(r => setTimeout(() => r(null), 5000))]) || ultimaPosicion();
        try { await llamar("choferSOS", { lat: p?.lat, lng: p?.lng }); Alert.alert("SOS enviado", "Operaciones ya fue avisada."); }
        catch { Alert.alert("No hay señal", "Llama directamente a operaciones."); } } }]);

  const terminarJornada = () => Alert.alert("¿Terminar tu jornada?", "Operaciones verá tu hora de salida.", [
    { text: "Cancelar", style: "cancel" },
    { text: "Terminar", onPress: async () => {
        const p = await Promise.race([posicionAhora(), new Promise<null>(r => setTimeout(() => r(null), 5000))]) || ultimaPosicion();
        try { await llamar("choferTerminarJornada", { dispositivoId: await idDispositivo(), lat: p?.lat, lng: p?.lng });
          if("nombre" in estado) setEstado({ paso: "fin", choferId: estado.choferId, nombre: estado.nombre }); }
        catch(e){ Alert.alert("No se pudo", mensajeDe(e)); } } }]);

  if(estado.paso === "login") return <><StatusBar style="light"/><Login/></>;
  return (
    <SafeAreaView style={[s.pantalla, { backgroundColor: COLOR.azul }]}>
      <StatusBar style="light"/>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>D Movimiento</Text>
          <Text style={{ color: "#ffffffbb", fontSize: 13 }}>{"nombre" in estado ? estado.nombre : ""}{enCola > 0 ? ` · ${enCola} por enviar` : ""}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Botón de emergencia SOS" onPress={sos} style={{ backgroundColor: COLOR.rojo, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14 }}>
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "900" }}>SOS</Text></Pressable>
      </View>
      <View style={[s.pantalla, { borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden" }]}>
        {!!aviso && <Pressable onPress={() => setAviso("")} style={{ backgroundColor: COLOR.ambar, padding: 12 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{aviso}</Text></Pressable>}
        {estado.paso === "cargando" && <View style={s.contenido}><Nota>Preparando tu sesión…</Nota></View>}
        {estado.paso === "bloqueado" && <View style={s.contenido}><Titulo>No puedes entrar</Titulo><Nota color={COLOR.rojo}>{estado.motivo}</Nota>
          <Boton texto="Reintentar" onPress={() => preparar(auth.currentUser)}/><Boton texto="Salir de la cuenta" borde color={COLOR.gris} onPress={() => { signOut(auth); }}/></View>}
        {estado.paso === "checkin" && <CheckIn choferId={estado.choferId} onListo={() => setEstado({ ...estado, paso: "ruta" })}/>}
        {estado.paso === "ruta" && <Ruta choferId={estado.choferId} alEncolar={vaciarCola} onTerminar={terminarJornada}/>}
        {estado.paso === "fin" && <View style={s.contenido}><Titulo>Jornada terminada</Titulo><Nota>Gracias, {estado.nombre.split(" ")[0]}. Mañana empiezas con tu check-in.</Nota></View>}
      </View>
    </SafeAreaView>);
}
