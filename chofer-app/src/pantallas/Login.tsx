import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { COLOR } from "../config";
import { Aviso, Boton, Campo, Nota, s } from "../ui";

export default function Login(){
  const [correo, setCorreo] = useState(""), [clave, setClave] = useState("");
  const [ocupado, setOcupado] = useState(false), [error, setError] = useState("");
  const entrar = async () => {
    if(!correo.trim() || !clave){ setError("Escribe tu correo y tu contraseña"); return; }
    setOcupado(true); setError("");
    try { await signInWithEmailAndPassword(auth, correo.trim().toLowerCase(), clave); }
    catch { setError("Correo o contraseña incorrectos. Si no tienes cuenta, pídela a operaciones."); }
    finally { setOcupado(false); }
  };
  return (
    <KeyboardAvoidingView style={[s.pantalla, { backgroundColor: COLOR.azul }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[s.contenido, { flexGrow: 1, justifyContent: "center" }]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: "#fff", fontSize: 30, fontWeight: "800", marginBottom: 4 }}>D Movimiento</Text>
        <Text style={{ color: "#ffffffcc", fontSize: 16, marginBottom: 28 }}>App de choferes</Text>
        <View style={{ backgroundColor: "#fff", borderRadius: 18, padding: 18 }}>
          <Aviso texto={error} mal/>
          <Campo etiqueta="Correo" value={correo} onChangeText={setCorreo} autoCapitalize="none" keyboardType="email-address" autoComplete="email"/>
          <Campo etiqueta="Contraseña" value={clave} onChangeText={setClave} secureTextEntry autoComplete="password"/>
          <Boton texto="Entrar" onPress={entrar} ocupado={ocupado}/>
          <Nota>Tu cuenta la crea operaciones y solo funciona en este teléfono.</Nota>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>);
}
