import { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { COLOR } from "./config";

export function Boton({ texto, onPress, color = COLOR.naranja, ocupado = false, deshabilitado = false, borde = false }: { texto: string; onPress: () => void; color?: string; ocupado?: boolean; deshabilitado?: boolean; borde?: boolean }){
  const off = ocupado || deshabilitado;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={texto} onPress={off ? undefined : onPress}
      style={({ pressed }) => [s.boton, { backgroundColor: borde ? "#fff" : color, borderColor: color, opacity: off ? 0.5 : pressed ? 0.85 : 1 }]}>
      {ocupado ? <ActivityIndicator color={borde ? color : "#fff"}/> : <Text style={[s.botonTexto, { color: borde ? color : "#fff" }]}>{texto}</Text>}
    </Pressable>
  );
}
export function Campo({ etiqueta, ...p }: { etiqueta: string } & TextInputProps){
  return <View style={{ marginBottom: 14 }}><Text style={s.etiqueta}>{etiqueta}</Text><TextInput accessibilityLabel={etiqueta} placeholderTextColor="#9aa7b5" {...p} style={[s.entrada, p.style]}/></View>;
}
export const Titulo = ({ children }: { children: ReactNode }) => <Text style={s.titulo}>{children}</Text>;
export const Nota = ({ children, color = COLOR.gris }: { children: ReactNode; color?: string }) => <Text style={[s.nota, { color }]}>{children}</Text>;
export const Tarjeta = ({ children }: { children: ReactNode }) => <View style={s.tarjeta}>{children}</View>;
export const Aviso = ({ texto, mal = false }: { texto: string; mal?: boolean }) => texto ? <View accessibilityRole="alert" style={[s.aviso, { backgroundColor: mal ? COLOR.rojo : COLOR.azul }]}><Text style={s.avisoTexto}>{texto}</Text></View> : null;

export const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLOR.fondo }, contenido: { padding: 18, paddingBottom: 40 },
  titulo: { fontSize: 24, fontWeight: "800", color: COLOR.texto, marginBottom: 6 },
  nota: { fontSize: 15, lineHeight: 21, marginBottom: 12 },
  etiqueta: { fontSize: 13, fontWeight: "700", color: COLOR.gris, marginBottom: 6 },
  entrada: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#d2dcea", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 17, color: COLOR.texto },
  boton: { minHeight: 58, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, marginBottom: 12 },
  botonTexto: { fontSize: 18, fontWeight: "800" },
  tarjeta: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#e8eef6" },
  aviso: { borderRadius: 12, padding: 14, marginBottom: 12 }, avisoTexto: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
