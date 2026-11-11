import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { esFallaDeRed, llamar, mensajeDe } from "../firebase";
import { idDispositivo } from "../dispositivo";
import { encolar } from "../cola";
import { nombreFoto, subir } from "../fotos";
import { enviarAhora, posicionAhora } from "../rastreo";
import { COLOR } from "../config";
import { Aviso, Boton, Campo, Nota, Tarjeta, Titulo, s } from "../ui";
import Camara from "./Camara";

export interface ParadaDoc { id: string; orden: number; tipo: string; nombre: string; direccion: string; contacto?: string; telefono?: string; lat: number; lng: number; estado: string; }
const INCIDENCIAS = ["Cliente ausente", "Entrega rechazada", "Entrega parcial", "Faltantes", "Daños", "Devolución al origen"];

/** Cierre de una parada. Quien decide si se cierra es el servidor: valida que estés en el punto. */
export default function Parada({ choferId, servicioId, parada, onCerrada, onRegresar, alEncolar }: { choferId: string; servicioId: string; parada: ParadaDoc; onCerrada: (pendientes: number | null) => void; onRegresar: () => void; alEncolar: () => void }){
  const [fotos, setFotos] = useState<string[]>([]);
  const [camara, setCamara] = useState(false);
  const [receptor, setReceptor] = useState(""), [cantidad, setCantidad] = useState(""), [notas, setNotas] = useState("");
  const [incidencia, setIncidencia] = useState("");
  const [ocupado, setOcupado] = useState(false), [error, setError] = useState("");
  if(camara) return <Camara titulo="Foto de la entrega: que se vea la mercancía y el lugar" onCancelar={() => setCamara(false)} onFoto={uri => { setFotos(f => [...f, uri].slice(0, 6)); setCamara(false); }}/>;
  const cerrar = async () => {
    if(fotos.length === 0){ setError("Toma al menos una foto de evidencia"); return; }
    if(!receptor.trim()){ setError("Escribe el nombre de quien recibe"); return; }
    setOcupado(true); setError("");
    const cerradaMs = Date.now();
    const rutas = fotos.map(() => `evidencias/${choferId}/${servicioId}/${nombreFoto(parada.id)}`);
    const datos = { dispositivoId: await idDispositivo(), servicioId, paradaId: parada.id, cerradaMs,
      evidencia: { fotos: rutas, receptor: receptor.trim(), cantidadEntregada: cantidad.trim() === "" ? "" : Number(cantidad), notas: notas.trim(), incidencia } };
    try {
      await posicionAhora(); await enviarAhora(); alEncolar();                      // la ubicación de este momento viaja antes que el cierre
      for(const [i, uri] of fotos.entries()) await subir(uri, rutas[i] as string);
      const r = await llamar<{ ok: boolean; pendientes: number }>("choferCerrarParada", datos);
      onCerrada(r.pendientes);
    } catch(e){
      if(esFallaDeRed(e)){
        /* Sin señal: se guarda todo en el teléfono, en orden, y se envía solo al volver la red. */
        for(const [i, uri] of fotos.entries()) await encolar({ tipo: "foto", uri, ruta: rutas[i] as string });
        await encolar({ tipo: "llamada", funcion: "choferCerrarParada", datos });
        alEncolar(); onCerrada(null);
      } else setError(mensajeDe(e));
    } finally { setOcupado(false); }
  };
  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
      <Titulo>{parada.nombre}</Titulo>
      <Nota>{parada.direccion}</Nota>
      <Aviso texto={error} mal/>
      <Tarjeta>
        <Text style={{ fontSize: 16, fontWeight: "700", color: fotos.length ? COLOR.verde : COLOR.texto, marginBottom: 10 }}>{fotos.length ? `✓ ${fotos.length} foto(s) tomada(s)` : "Foto de evidencia"}</Text>
        <Boton texto={fotos.length ? "Tomar otra foto" : "Tomar foto"} borde={fotos.length > 0} onPress={() => setCamara(true)}/>
      </Tarjeta>
      <Tarjeta>
        <Campo etiqueta="Nombre de quien recibe" value={receptor} onChangeText={setReceptor} autoCapitalize="words"/>
        <Campo etiqueta="Cantidad entregada" value={cantidad} onChangeText={setCantidad} keyboardType="number-pad"/>
        <Campo etiqueta="Notas" value={notas} onChangeText={setNotas} multiline/>
      </Tarjeta>
      <Tarjeta>
        <Text style={s.etiqueta}>¿Hubo algún problema?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {["", ...INCIDENCIAS].map(i => <Pressable key={i || "no"} accessibilityRole="button" onPress={() => setIncidencia(i)}
            style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 2, borderColor: incidencia === i ? COLOR.naranja : "#d2dcea", backgroundColor: incidencia === i ? "#fff4e8" : "#fff" }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: incidencia === i ? COLOR.naranja : COLOR.gris }}>{i || "Todo bien"}</Text></Pressable>)}
        </View>
      </Tarjeta>
      <Boton texto={incidencia ? "Reportar y cerrar parada" : "Entregado: cerrar parada"} color={incidencia ? COLOR.ambar : COLOR.verde} onPress={cerrar} ocupado={ocupado}/>
      <Boton texto="Regresar" borde color={COLOR.gris} onPress={onRegresar}/>
    </ScrollView>);
}
