import { useEffect, useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db, llamar, mensajeDe } from "../firebase";
import { idDispositivo } from "../dispositivo";
import { detenerRastreo, iniciarRastreo } from "../rastreo";
import { COLOR } from "../config";
import { Aviso, Boton, Nota, Tarjeta, Titulo, s } from "../ui";
import Parada, { ParadaDoc } from "./Parada";

interface Servicio { id: string; folio: string; estado: string; empresa?: string; }

/** Ruta del día: solo los servicios asignados a este chofer. Lo que cambia de estado lo decide el servidor. */
export default function Ruta({ choferId, alEncolar, onTerminar }: { choferId: string; alEncolar: () => void; onTerminar?: () => void }){
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [paradas, setParadas] = useState<ParadaDoc[]>([]);
  const [abierta, setAbierta] = useState<ParadaDoc | null>(null);
  const [ocupado, setOcupado] = useState(false), [msg, setMsg] = useState({ texto: "", mal: false });
  const actual = servicios[0] ?? null;

  useEffect(() => onSnapshot(query(collection(db, "servicios"), where("choferId", "==", choferId), where("estado", "in", ["Asignada", "En ruta"])),
    x => setServicios(x.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Servicio, "id">) })).sort((a, b) => (a.estado === "En ruta" ? -1 : 1) - (b.estado === "En ruta" ? -1 : 1))),
    () => setMsg({ texto: "No se pudo leer tu ruta. Revisa tu señal.", mal: true })), [choferId]);
  useEffect(() => { if(!actual) { setParadas([]); return; }
    return onSnapshot(query(collection(db, "servicios", actual.id, "paradas"), orderBy("orden")), x => setParadas(x.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ParadaDoc, "id">) }))), () => {}); }, [actual?.id]);
  /* Si la ruta ya está en curso (por ejemplo, tras reiniciar el teléfono), el rastreo se retoma solo. */
  useEffect(() => { if(actual?.estado === "En ruta") iniciarRastreo(actual.id, alEncolar).catch(() => {}); }, [actual?.id, actual?.estado]);

  const iniciar = async () => {
    if(!actual) return;
    setOcupado(true); setMsg({ texto: "", mal: false });
    try { await llamar("choferIniciarRuta", { dispositivoId: await idDispositivo(), servicioId: actual.id }); await iniciarRastreo(actual.id, alEncolar); }
    catch(e){ setMsg({ texto: mensajeDe(e), mal: true }); }
    finally { setOcupado(false); }
  };
  const navegar = (p: ParadaDoc) => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`).catch(() => Alert.alert("No se pudo abrir el mapa"));
  const llamarA = (tel?: string) => { const t = (tel ?? "").replace(/\D/g, ""); if(t.length >= 8) Linking.openURL("tel:" + t).catch(() => {}); };

  if(abierta && actual) return <Parada choferId={choferId} servicioId={actual.id} parada={abierta} alEncolar={alEncolar} onRegresar={() => setAbierta(null)}
    onCerrada={async pendientes => { setAbierta(null);
      if(pendientes === null) setMsg({ texto: "Guardado en el teléfono. Se enviará cuando vuelva la señal.", mal: false });
      else if(pendientes === 0){ await detenerRastreo().catch(() => {}); setMsg({ texto: "Ruta terminada. Buen trabajo.", mal: false }); }
      else setMsg({ texto: `Parada cerrada. Faltan ${pendientes}.`, mal: false }); }}/>;

  const siguiente = paradas.find(p => p.estado === "Pendiente" || p.estado === "En sitio");
  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido}>
      <Titulo>Mi ruta de hoy</Titulo>
      <Aviso texto={msg.texto} mal={msg.mal}/>
      {!actual && <Nota>No tienes servicios asignados por ahora. En cuanto operaciones te asigne uno, aparece aquí.</Nota>}
      {actual && <Tarjeta>
        <Text style={{ fontSize: 13, fontWeight: "700", color: COLOR.gris }}>{actual.folio}</Text>
        <Text style={{ fontSize: 19, fontWeight: "800", color: COLOR.texto, marginBottom: 6 }}>{actual.empresa ?? ""}</Text>
        <Text style={{ fontSize: 15, fontWeight: "700", color: actual.estado === "En ruta" ? COLOR.verde : COLOR.ambar, marginBottom: 12 }}>{actual.estado === "En ruta" ? "En ruta · tu ubicación se comparte con operaciones" : "Lista para iniciar"}</Text>
        {actual.estado === "Asignada" && <Boton texto="Iniciar ruta" onPress={iniciar} ocupado={ocupado} deshabilitado={paradas.length === 0}/>}
        {actual.estado === "Asignada" && paradas.length === 0 && <Nota color={COLOR.ambar}>Operaciones todavía no arma las paradas de este servicio.</Nota>}
      </Tarjeta>}
      {paradas.map(p => { const hecha = p.estado === "Entregada" || p.estado === "Incidencia"; const esSig = siguiente?.id === p.id && actual?.estado === "En ruta"; return (
        <Tarjeta key={p.id}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: hecha ? COLOR.verde : COLOR.gris }}>{hecha ? "✓ " + p.estado : `Parada ${p.orden} · ${p.tipo === "carga" ? "Carga" : "Entrega"}`}</Text>
          <Text style={{ fontSize: 18, fontWeight: "800", color: COLOR.texto }}>{p.nombre}</Text>
          <Text style={{ fontSize: 15, color: COLOR.gris, marginBottom: esSig ? 12 : 0 }}>{p.direccion}{p.contacto ? " · " + p.contacto : ""}</Text>
          {esSig && <View>
            <Boton texto="Cómo llegar" color={COLOR.azul} onPress={() => navegar(p)}/>
            {!!p.telefono && <Boton texto={"Llamar a " + (p.contacto || "contacto")} borde color={COLOR.azul} onPress={() => llamarA(p.telefono)}/>}
            <Boton texto={p.tipo === "carga" ? "Ya cargué: cerrar parada" : "Ya llegué: entregar"} color={COLOR.verde} onPress={() => setAbierta(p)}/>
          </View>}
        </Tarjeta>); })}
      {onTerminar && (!actual || actual.estado !== "En ruta") && <Boton texto="Terminar mi jornada" borde color={COLOR.gris} onPress={onTerminar}/>}
    </ScrollView>);
}
