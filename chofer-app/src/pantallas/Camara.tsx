import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Boton, Nota, s } from "../ui";
import { comprimir } from "../fotos";

/** Cámara de la app. No hay opción de galería: la foto se toma en el momento. */
export default function Camara({ titulo, frontal = false, onFoto, onCancelar }: { titulo: string; frontal?: boolean; onFoto: (uri: string) => void; onCancelar: () => void }){
  const [permiso, pedir] = useCameraPermissions();
  const ref = useRef<CameraView>(null);
  const [ocupado, setOcupado] = useState(false);
  if(!permiso) return <View style={s.pantalla}/>;
  if(!permiso.granted) return (
    <View style={[s.pantalla, s.contenido, { justifyContent: "center" }]}>
      <Nota>Para tomar la foto, permite el uso de la cámara.</Nota>
      <Boton texto="Permitir cámara" onPress={() => { pedir(); }}/><Boton texto="Regresar" borde onPress={onCancelar}/>
    </View>);
  const tomar = async () => {
    setOcupado(true);
    try { const f = await ref.current?.takePictureAsync({ quality: 0.8, skipProcessing: false }); if(f?.uri) onFoto(await comprimir(f.uri)); }
    finally { setOcupado(false); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView ref={ref} style={{ flex: 1 }} facing={frontal ? "front" : "back"}/>
      <View style={{ padding: 18, backgroundColor: "#000" }}>
        <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700", marginBottom: 12, textAlign: "center" }}>{titulo}</Text>
        <Boton texto="Tomar foto" onPress={tomar} ocupado={ocupado}/><Boton texto="Cancelar" borde onPress={onCancelar}/>
      </View>
    </View>);
}
