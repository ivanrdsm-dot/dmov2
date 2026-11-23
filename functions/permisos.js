/* DMOV · permisos dentro de la cuenta (custom claims).
   Storage no siempre puede consultar Firestore en producción; por eso cada cuenta lleva sus permisos:
   - oficina: perfil activo en dmov_usuarios · admin: además rol admin
   - choferId: la cuenta está ligada a ese chofer (choferes_auth)
   Se recalculan solos cuando cambia el perfil o la liga. La app pide un token nuevo al entrar. */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getAuth } from "firebase-admin/auth";
import { logger } from "firebase-functions";

const OPC = { region: "us-central1", memory: "256MiB", retry: false };

export async function fusionarClaims(uid, cambios){
  let actuales = {};
  try { actuales = (await getAuth().getUser(uid)).customClaims || {}; }
  catch(e){ if(e?.code === "auth/user-not-found") return false; throw e; }
  const nuevos = { ...actuales };
  for(const [k, v] of Object.entries(cambios)){ if(v === null || v === false || v === "") delete nuevos[k]; else nuevos[k] = v; }
  if(JSON.stringify(nuevos) === JSON.stringify(actuales)) return false;
  await getAuth().setCustomUserClaims(uid, nuevos);
  return true;
}

export const permisosOficina = onDocumentWritten({ ...OPC, document: "dmov_usuarios/{uid}" }, async ev => {
  const d = ev.data?.after?.exists ? ev.data.after.data() : null;
  const activo = d?.activo === true;
  const cambio = await fusionarClaims(ev.params.uid, { oficina: activo, admin: activo && d?.rol === "admin" });
  if(cambio) logger.info("permisos de oficina actualizados", { uid: ev.params.uid, oficina: activo, admin: activo && d?.rol === "admin" });
});

export const permisosChofer = onDocumentWritten({ ...OPC, document: "choferes_auth/{uid}" }, async ev => {
  const d = ev.data?.after?.exists ? ev.data.after.data() : null;
  const cambio = await fusionarClaims(ev.params.uid, { choferId: d?.choferId || "" });
  if(cambio) logger.info("permiso de chofer actualizado", { uid: ev.params.uid, choferId: d?.choferId || "" });
});
