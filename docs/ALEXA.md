# Quetai en Alexa

Esta guía es para Daniel. El código de la skill ya está en el repositorio. Lo que sigue son los pasos que solo puedes hacer tú, en Amazon y en Render.

Quetai en el Echo se abre con: **«Alexa, abre Quetai»**.

## Qué hace esta versión

- Conversación abierta, en español, con frases cortas y voz lenta (SSML).
- Pide el nombre la primera vez y lo guarda.
- Recuerda la charla de cada dispositivo Echo.
- Anota un medicamento y una hora («recuérdame tomar losartán a las ocho de la mañana»).
- Si la persona acepta el permiso, Alexa avisa en el Echo todos los días a esa hora.
- Ayuda, repetir, borrar la charla, parar.

No pide cuenta ni contraseña. Una persona mayor no tiene que enlazar nada.

## Dónde se guarda todo

Quetai **no usa Supabase**. El servidor (Express) guarda los datos en un archivo SQLite: `data/quetai.db`, en el disco de Render (`/app/data`). Ahí ya viven los usuarios del teléfono, los mensajes y los medicamentos.

Alexa reutiliza esas mismas tablas:

| Dato | Tabla |
| --- | --- |
| Nombre | `usuarios` |
| Charla | `mensajes` |
| Medicamentos | `medicamentos` |
| userId de Amazon → sesión | `alexa_usuarios` |

La sesión de un Echo es `alexa:` más el userId que envía Amazon. Así no se mezcla con la sesión del celular.

`migrations/0001_alexa_usuarios.sql` documenta la tabla nueva. **No tienes que ejecutarla.** Al arrancar, `server/storage.ts` hace `CREATE TABLE IF NOT EXISTS`. El archivo de Drizzle/Postgres del repo (`shared/schema.ts`, `DATABASE_URL`) no es el que usa el servidor hoy.

## 1. Publicar este código en Render

1. Revisa el pull request y únelo a `master`.
2. Render despliega solo la rama `master` (`render.yaml`, servicio `quetai`). El build **no compila** el servidor: solo hace `npm install` y recompila `better-sqlite3`. Lo que se ejecuta es `dist/index.cjs`, el bundle que está en git. Si ese archivo no entró en el merge, `/api/alexa` y `/privacidad` siguen devolviendo la página web.
3. Espera a que el deploy quede en verde.
4. Abre en el navegador. `/api/health` tiene que incluir `"version": "alexa-v3.2"` y un `"commit"` (el SHA que Render inyecta en `RENDER_GIT_COMMIT`). Si `version` no aparece, o sigue en una versión anterior, sigue corriendo el bundle viejo. El campo `model` dice qué modelo está configurado. El perfil de cada persona se configura aparte: [PERFIL.md](./PERFIL.md).
   - `https://quetai.onrender.com/api/health` → debe decir `"status": "ok"`.
   - `https://quetai.onrender.com/api/alexa` → debe decir `"servicio": "quetai-alexa"` y `"verificacion": "activa"`.
   - `https://quetai.onrender.com/privacidad`
   - `https://quetai.onrender.com/terminos`

Si el Echo que ya usas apunta a Fly (`quetai-app.fly.dev`) en lugar de Render, el endpoint de la skill tiene que ser el mismo sitio donde corre **esta** versión. El manifiesto trae Render porque es la URL del cliente (`quetai.onrender.com`).

## 2. Variables de entorno

En Render → servicio `quetai` → Environment. No las pongas en git.

| Variable | Valor | Obligatorio |
| --- | --- | --- |
| `ALEXA_SKILL_ID` | El id `amzn1.ask.skill....` que verás al crear la skill | Sí, antes de invitar a nadie |
| `ALEXA_SKIP_VERIFICATION` | `false` (o bórrala) | Sí |
| `OPENAI_API_KEY` | La clave que ya usa el chat | Ya está |
| `OPENAI_BASE_URL` | El host compatible con la API de OpenAI (hoy, Groq) | Ya está |
| `LLM_MODEL` | Modelo principal. Si lo dejas vacío, usa `openai/gpt-oss-120b`. Groq apagó `llama-3.3-70b-versatile` el 16 de agosto de 2026; si la variable sigue con ese id, el servidor lo cambia solo | No |
| `LLM_MODEL_FALLBACK` | Si el principal falla. Por defecto `openai/gpt-oss-20b` (reemplazo de `llama-3.1-8b-instant`, también apagado) | No |
| `ALEXA_LLM_TIMEOUT_MS` | Tope del modelo en Alexa, en milisegundos. Por defecto `5500` | No |
| `ASSISTANT_NAME` | Cómo se presenta. Por defecto `Quetai`. La invocación de Alexa sigue siendo `mi quetai` | No |
| `NEWS_ENABLED` | `true` para titulares de Google News. `false` los apaga | No |
| `TZ` | `America/Lima` | Ya está en `render.yaml` |

`ALEXA_SKIP_VERIFICATION=true` apaga la comprobación de firma. Sirve solo si estás depurando con `curl` en tu máquina. **No lo actives en Render.** El simulador de Alexa sí firma las peticiones, así que no hace falta apagar nada para probar.

El id de la skill lo copias en el paso 4. Guarda la variable y espera a que Render reinicie.

En Fly.io, si despliegas ahí, configura los mismos secretos (`fly secrets set ALEXA_SKILL_ID=...`). No hace falta un secreto nuevo de Supabase: no hay proyecto Supabase.

## 3. Crear la skill en la consola de Amazon

1. Entra a [https://developer.amazon.com/alexa/console/ask](https://developer.amazon.com/alexa/console/ask) con tu cuenta de Amazon.
2. **Create Skill**.
3. Nombre: `Quetai`.
4. Idioma principal: **Spanish (US)** / Español (Estados Unidos). En Perú no existe `es-PE`. `es-US` es el español latinoamericano que mejor encaja. Luego se agregan España y México.
5. Modelo: **Custom**.
6. Alojamiento: **Provision your own** (el endpoint es el servidor de Quetai, no un Lambda de Amazon).
7. Plantilla: **Start from scratch**.
8. Crea la skill.

### Nombre de invocación

1. Menú izquierdo → **Invocations** → **Skill Invocation Name**.
2. Escribe `mi quetai` (minúsculas, dos palabras). Amazon rechazó el nombre de una sola palabra.
3. **Save**. Repite el nombre en es-ES y es-MX. El JSON del repo ya trae `invocationName`: `mi quetai`.

Se abre con «Alexa, abre mi quetai».

### Modelo de interacción

Para cada idioma (`es-US`, y luego `es-ES` y `es-MX`):

1. Arriba, el selector de idioma → **Add new language** para Español (España) y Español (México). Elige el mismo modelo Custom.
2. **Interaction Model** → **JSON Editor**.
3. Borra lo que haya y pega el archivo correspondiente:
   - `alexa/skill-package/interactionModels/custom/es-US.json`
   - `alexa/skill-package/interactionModels/custom/es-ES.json`
   - `alexa/skill-package/interactionModels/custom/es-MX.json`
4. **Save Model** y **Build Model**. Espera a que diga que el build terminó. Hazlo en los tres idiomas.

El modelo incluye:

- `ConversarIntent` y `PreguntarIntent`: conversación libre (ranura abierta y `AMAZON.SearchQuery`).
- `CharlarIntent`: «conversa conmigo».
- `DecirNombreIntent`: «me llamo María».
- `RecordarMedicamentoIntent`: medicamento + hora.
- `ListarMedicamentosIntent` y `OlvidarConversacionIntent`.
- `ChismeIntent`, `PoliticaIntent` y `NoticiasIntent`: titulares, sin inventar.
- `CambiarApodoIntent`, `GustosIntent`, `EvitarTemaIntent` y `FamiliaIntent`. Toda muestra con `AMAZON.SearchQuery` lleva palabras además de la ranura.
- Ayuda, parar, cancelar, repetir, sí, no y `AMAZON.FallbackIntent`.

### Endpoint

1. Menú → **Endpoint**.
2. Tipo: **HTTPS**.
3. Región por defecto (y NA, EU, FE si aparecen):

   `https://quetai.onrender.com/api/alexa`

4. Certificado: **My development endpoint has a certificate from a trusted certificate authority**. Render usa un certificado de una autoridad conocida. No elijas el certificado autofirmado.
5. **Save Endpoints**.

Copia el **Skill ID** (`amzn1.ask.skill....`). Está en esta pantalla o en la URL de la consola. Pégalo en `ALEXA_SKILL_ID` en Render (paso 2) y espera el reinicio.

### Permiso de recordatorios

1. Menú → **Tools** → **Permissions** (o **Permisos**).
2. Activa **Reminders** / Recordatorios (`alexa::alerts:reminders:skill:readwrite`).
3. Guarda.

Sin este permiso, Quetai igual **anota** el medicamento en su base. El aviso dentro del Echo solo suena si la persona acepta la tarjeta de permiso en la app de Alexa.

## 4. Probar en el simulador

1. Arriba, pestaña **Test**.
2. El interruptor de prueba: **Development**.
3. Idioma del simulador: **Spanish (US)**.
4. Escribe o habla, una frase por turno:

   1. `abre mi quetai`  
      Debe preguntar cómo te llamas, despacio.
   2. `me llamo María`  
      Debe saludar por el nombre.
   3. `hoy vinieron mis nietos`  
      Debe responder corto y hacer una pregunta.
   4. `recuérdame tomar losartán a las ocho de la mañana`  
      Debe confirmar que lo guardó. La primera vez pide el permiso de recordatorios.
   5. `cuáles son mis medicamentos`  
      Debe mencionar losartán y la mañana.
   6. `repite`
   7. `ayuda`
   8. `para`  
      Debe despedirse y cerrar la sesión.

En el panel JSON de la petición verás la firma. No la borres. Si el servidor responde 400 con `"solicitud no válida"`, la firma o el reloj no cuadran: revisa que `ALEXA_SKIP_VERIFICATION` no esté en `true` por error inverso, que la URL sea exactamente `/api/alexa`, y que el deploy nuevo ya esté activo. Un 400 con `"skill id no coincide"` significa que `ALEXA_SKILL_ID` no es el de esta skill.

Mira los logs de Render. No deben imprimir la frase completa ni el token de Amazon.

Para ver que la memoria quedó guardada: abre `https://quetai.onrender.com/#/admin`, entra con el PIN de admin, y busca una sesión que empiece por `alexa:`.

## 5. Probar en tu Echo

El Echo y la consola de desarrollador tienen que usar **la misma cuenta de Amazon**.

1. En el Echo, el idioma del dispositivo debe poder hablar español (Español Estados Unidos, México o España). En la app de Alexa: Dispositivos → el Echo → Idioma.
2. La skill, en la consola, sigue en **In Development**. No hace falta publicarla para probarla con tu cuenta.
3. Di: **«Alexa, abre Quetai»**.
4. Si Alexa dice que no encuentra esa skill, espera un minuto y repite. Si sigue fallando, prueba desde la app de Alexa → Más → Skills → **Tus skills** → **Dev** / En desarrollo → Quetai → Activar.
5. Haz la misma charla que en el simulador. Habla un poco más lento de lo normal.
6. Cuando pida el permiso de recordatorios, acepta en la app de Alexa (la tarjeta no se puede aceptar solo con la voz).
7. Para el aviso de la pastilla, espera a la hora anotada o anota una hora 2 minutos adelante y deja el Echo encendido. El texto del aviso es del estilo: «María, es hora de tomar tu losartán».

La cuenta de desarrollador en Perú puede crear skills y probarlas en un Echo registrado en esa misma cuenta. No hace falta un Echo en Estados Unidos.

## 6. Beta, para otra persona de la familia

Mientras la skill no esté certificada, **solo tu cuenta** la puede abrir. Para el Echo de tu mamá u otro familiar:

1. Consola → **Distribution** → **Availability**.
2. **Beta Test**.
3. Agrega el correo de la cuenta de Amazon que usa esa persona en su app de Alexa.
4. Esa persona acepta la invitación e instala la skill en beta.

En beta sigue siendo la misma URL y la misma base de datos.

## 7. Certificación, cuando quieras publicarla

Consola → **Distribution**, y completa:

1. Nombre, descripción corta y descripción. Puedes copiarlas de `alexa/skill-package/skill.json`.
2. Frases de ejemplo (tienen que existir en el modelo):
   - Alexa, abre mi quetai
   - Alexa, pídele a mi quetai que me cuente el chisme
   - Alexa, pregúntale a mi quetai qué pasó en política
3. Categoría: **Lifestyle**. No la marques como skill de salud o médica.
4. Ícono: 512×512 y 108×108. La consola no acepta el envío sin íconos.
5. **Privacy Policy URL**: `https://quetai.onrender.com/privacidad`
6. **Terms of Use URL**: `https://quetai.onrender.com/terminos`
7. ¿Usa información personal? **Sí** (nombre, conversación, medicamentos, userId de Alexa).
8. ¿Dirigida a niños? **No**.
9. ¿Compras o anuncios? **No**.
10. ¿Export compliance? **Sí**.
11. Instrucciones para el revisor: las de `testingInstructions` en `skill.json`. Di claro que no hay account linking.
12. En la justificación del permiso de recordatorios escribe: «La persona dice el nombre de un medicamento y una hora. Quetai crea un recordatorio diario en el dispositivo para esa hora. No lee otros recordatorios del usuario.»

### Aviso de salud (ponlo también en las notas al revisor)

Quetai es compañía y un recordatorio que la propia persona dicta. No diagnostica, no sugiere dosis y no sustituye a un médico ni a un servicio de urgencias. En Perú, emergencias es el 105 (policía) y el SAMU es el 106. Si Amazon pide un disclaimer más visible, ya está en la descripción de la skill, en `/terminos` y en la respuesta de «ayuda».

### Account linking

**No lo actives.** El teléfono de Quetai tampoco tiene usuarios con contraseña: la sesión es un id anónimo en el navegador. Forzar un login dejaría fuera a quien solo puede hablar. Cada Echo queda ligado por el `userId` de Alexa.

Más adelante, si quieres unir la charla del Echo con la del celular, habría que agregar Account Linking (un código que la familia escribe, o Login with Amazon) y fusionar los dos `session_id`. No está en esta versión a propósito.

### Antes de enviar a revisión

- `ALEXA_SKIP_VERIFICATION` no está en `true`.
- `ALEXA_SKILL_ID` es el de esta skill.
- Los tres idiomas tienen el modelo construido sin errores.
- Probaste en el simulador y en un Echo real.
- `/privacidad` y `/terminos` abren en el navegador.
- La descripción no promete vigilancia, diagnóstico ni que el aviso de la pastilla sea infalible.

## 8. ASK CLI, si prefieres la terminal

La consola basta. Si quieres subir el modelo por CLI:

1. `npm install -g ask-cli`
2. `ask configure` e inicia sesión.
3. No uses el alojamiento de Alexa (Lambda). El código corre en Render.
4. Con el skill id ya creado en la consola:

```bash
ask smapi set-interaction-model \
  --skill-id amzn1.ask.skill.TU_ID \
  -l es-US \
  --interaction-model file:alexa/skill-package/interactionModels/custom/es-US.json
```

Repite con `-l es-ES` y `-l es-MX`.

El endpoint HTTPS déjalo como en la consola. Un `ask deploy` completo puede intentar crear un Lambda y sustituir la URL: no lo hagas salvo que sepas que solo estás subiendo metadatos.

## Si algo falla

| Síntoma | Qué revisar |
| --- | --- |
| Alexa dice que no existe la skill | Misma cuenta en el Echo y en la consola. Skill en Development. Idioma español. |
| 400 solicitud no válida | Firma o reloj. URL exacta `/api/alexa`. Deploy nuevo. No desactives la verificación. |
| 400 skill id no coincide | `ALEXA_SKILL_ID` en Render. |
| Responde pero no recuerda al día siguiente | El disco de Render (`quetai-data` en `/app/data`) tiene que seguir montado. Sin disco, SQLite se borra en cada deploy. |
| No suena el recordatorio en el Echo | Permiso aceptado en la app de Alexa. La hora es de Lima (`TZ=America/Lima`). El plan gratuito de Render puede tardar en despertar; el aviso lo pronuncia Alexa, no el servidor, una vez creado. |
| La respuesta tarda o sale el tropiezo | Mira el log `llm.error` en Render (clase, status, código, milisegundos; sin la clave). `/api/health` debe mostrar `model` `openai/gpt-oss-120b` si no cambiaste `LLM_MODEL`. |
| No abre con «quetai» | La invocación es `mi quetai`. Di «Alexa, abre mi quetai». |

Para borrar los datos de una persona: panel `https://quetai.onrender.com/#/admin`, o un correo a hola@quetai.tech. Borrar el usuario también borra su fila en `alexa_usuarios`.
