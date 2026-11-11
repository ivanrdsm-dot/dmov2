import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { llamar, mensajeDe } from "../firebase";
import { idDispositivo } from "../dispositivo";
import { nombreFoto, subir } from "../fotos";
import { posicionAhora } from "../rastreo";
import { COLOR } from "../config";
import { Aviso, Boton, Campo, Nota, Tarjeta, Titulo, s } from "../ui";
import Camara from "./Camara";

type Paso = "selfie" | "placas" | "odometro";
const PASOS: { id: Paso; titulo: string; boton: string; frontal: boolean }[] = [
  { id: "selfie", titulo: "Tómate una foto de frente, sin gorra ni lentes", boton: "Tomar mi foto", frontal: true },
  { id: "placas", titulo: "Foto de las placas de la unidad", boton: "Foto de las placas", frontal: false },
  { id: "odometro", titulo: "Foto del tablero: kilometraje y gasolina", boton: "Foto del tablero", frontal: false },
];

/** Inicio de jornada. Sin check-in válido el servidor no libera la ruta. */
export default function CheckIn({ choferId, onListo }: { choferId: string; onListo: () => void }){
  const [fotos, setFotos] = useState<Partial<Record<Paso, string>>>({});
  const [camara, setCamara] = useState<Paso | null>(null);
  const [placa, setPlaca] = useState(""), [km, setKm] = useState(""), [gas, setGas] = useState("");
  const [ocupado, setOcupado] = useState(false), [error, setError] = useState("");
  const pasoCamara = PASOS.find(p => p.id === camara);
  if(pasoCamara) return <Camara titulo={pasoCamara.titulo} frontal={pasoCamara.frontal} onCancelar={() => setCamara(null)} onFoto={uri => { setFotos(f => ({ ...f, [pasoCamara.id]: uri })); setCamara(null); }}/>;
  const falta = [!fotos.selfie && "tu foto", !fotos.placas && "foto de placas", !fotos.odometro && "foto del tablero", !placa.trim() && "placas", !km.trim() && "kilometraje", !gas.trim() && "gasolina"].filter(Boolean);
  const enviar = async () => {
    if(falta.length){ setError("Falta: " + falta.join(", ")); return; }
    setOcupado(true); setError("");
    try {
      /* El check-in exige señal: es la prueba de presencia con hora del servidor. */
      const rutas: Record<Paso, string> = { selfie: "", placas: "", odometro: "" };
      for(const p of PASOS){ rutas[p.id] = `jornadas/${choferId}/${nombreFoto(p.id)}`; await subir(fotos[p.id] as string, rutas[p.id]); }
      const pos = await posicionAhora();
      await llamar("choferCheckIn", { dispositivoId: await idDispositivo(), selfieRuta: rutas.selfie, fotoPlacasRuta: rutas.placas, fotoOdometroRuta: rutas.odometro,
        unidadPlaca: placa.trim().toUpperCase(), odometroKm: Number(km), combustiblePct: Number(gas), lat: pos?.lat, lng: pos?.lng, simulada: pos?.simulada === true });
      onListo();
    } catch(e){ setError(mensajeDe(e)); }
    finally { setOcupado(false); }
  };
  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
      <Titulo>Inicio de jornada</Titulo>
      <Nota>Tres fotos y tres datos. Sin esto no se abre tu ruta de hoy.</Nota>
      <Aviso texto={error} mal/>
      {PASOS.map(p => <Tarjeta key={p.id}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: fotos[p.id] ? COLOR.verde : COLOR.texto, marginBottom: 10 }}>{fotos[p.id] ? "✓ " : ""}{p.titulo}</Text>
        <Boton texto={fotos[p.id] ? "Repetir foto" : p.boton} borde={!!fotos[p.id]} onPress={() => setCamara(p.id)}/>
      </Tarjeta>)}
      <Tarjeta>
        <Campo etiqueta="Placas de la unidad" value={placa} onChangeText={setPlaca} autoCapitalize="characters"/>
        <Campo etiqueta="Kilometraje del tablero" value={km} onChangeText={setKm} keyboardType="number-pad"/>
        <Campo etiqueta="Gasolina, de 0 a 100" value={gas} onChangeText={setGas} keyboardType="number-pad" placeholder="75"/>
      </Tarjeta>
      <View style={{ height: 6 }}/>
      <Boton texto="Iniciar mi jornada" onPress={enviar} ocupado={ocupado}/>
    </ScrollView>);
}
