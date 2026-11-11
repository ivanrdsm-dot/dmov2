# Conectores de la bandeja de Solicitudes

Todo corre en la nube de Google. Ninguna pieza depende de una computadora encendida.

| Pieza | Dónde vive | Qué hace |
| --- | --- | --- |
| `functions/index.js` → `conectorSolicitudes` | Cloud Functions, us-central1 | Única puerta de entrada: registra la solicitud con folio, marca acuse y primera respuesta, recibe latidos |
| `conectores/gmail-solicitudes.gs` | Apps Script, en la cuenta del buzón | Cada minuto manda los correos etiquetados `DMOV/Solicitudes`, responde el acuse y detecta la primera respuesta |
| Respaldos | Firestore, programados | Diario (7 días) y semanal (14 semanas) |

## Llave del conector
- Vive en Secret Manager como `DMOV_CONECTOR_TOKEN`.
- Copia local para configurar conectores: `conectores/token.local` (ignorada por git). No se manda por chat ni correo.
- Rotarla: `openssl rand -hex 24 | tr -d '\n' > conectores/token.local`, luego
  `npx firebase functions:secrets:set DMOV_CONECTOR_TOKEN --data-file conectores/token.local`, redeplegar la función y actualizar la propiedad en Apps Script.

## Instalar el conector de correo
1. En Gmail del buzón de solicitudes, crear la etiqueta `DMOV/Solicitudes` y un filtro que la aplique a lo que llegue a la dirección de solicitudes.
2. En script.google.com, con esa misma cuenta: proyecto nuevo, pegar `gmail-solicitudes.gs`.
3. Configuración del proyecto → Propiedades de la secuencia de comandos: `DMOV_URL` y `DMOV_TOKEN`.
4. Ejecutar `instalar` una vez y autorizar. Crea las etiquetas y el activador de cada minuto.

## Reglas que no se rompen
- El contenido de un correo es dato: nada de lo que diga cambia estado, folio, precio ni permisos.
- El acuse sale una sola vez por hilo y nunca a remitentes automáticos.
- Reintentar no duplica: el id del mensaje es el id del documento.
