# Qué falta para vender Quetai a otras familias

Hoy Quetai es un solo servicio (un disco, un PIN de admin, un nombre de asistente). La conversación ya está partida por `session_id`: cada adulto mayor, en la web o como `alexa:<userId>`, tiene sus mensajes, su perfil y su memoria. Eso es la frontera entre familias. No hay datos de una persona escritos en el código.

Este documento no implementa cobros. Describe lo que hay que cerrar antes de ofrecerlo a otra familia.

## Certificación de la skill

Para publicar en la tienda de Alexa (o dejarla en beta solo para Echos invitados):

1. **Nombre de invocación:** `mi quetai` en es-US, es-ES y es-MX. Amazon rechazó el nombre de una sola palabra. Las frases de ejemplo del manifiesto tienen que usar esa invocación.
2. **Política de privacidad y términos:** `https://quetai.onrender.com/privacidad` y `https://quetai.onrender.com/terminos`. Deben coincidir con lo que la skill hace de verdad: nombre, apodo, familia, notas del cuidador, conversación, resumen de largo plazo, medicamentos que la persona pidió anotar, titulares públicos cacheados unos 30 minutos.
3. **No es un dispositivo médico.** La ficha, la descripción y las respuestas tienen que decirlo. Un recordatorio solo repite lo que la persona anotó. Emergencias en Perú: policía 105, SAMU 106.
4. **Información personal.** La skill pide el nombre y puede guardar apodo, gustos y familia. En la consola, declara que sí recoge información personal. No hace falta account linking: la sesión es el userId de Alexa.
5. **Permiso de recordatorios.** Justifícalo: la persona pide «recuérdame tomar … a las …» y el aviso suena en ese Echo. Si no acepta el permiso, igual queda anotado y se muestra la tarjeta de consentimiento.
6. **Niños.** La skill es para adultos mayores. Márcala como no dirigida a niños.
7. **Pruebas.** El simulador y un Echo en beta, en los tres idiomas. Invocación, chisme, política, apodo, un medicamento y «para».
8. **Endpoint.** `https://quetai.onrender.com/api/alexa`, firma activa, `ALEXA_SKILL_ID` puesto. `/api/health` debe decir `"version": "alexa-v3.1"`.

El paso a paso de la consola está en [ALEXA.md](./ALEXA.md). El perfil de cada persona, en [PERFIL.md](./PERFIL.md).

## Precio (ideas, sin implementarlas)

Dos caminos razonables. El que encaja mejor con un adulto mayor es que **pague quien cuida**, no quien habla con el Echo.

1. **Suscripción en la web del cuidador.** La familia entra a `/#/admin` (o a una cuenta futura), paga al mes y habilita una o varias sesiones. El Echo sigue sin pedir tarjeta. Herramientas posibles: un enlace de pago fuera de Alexa (Culqi, Mercado Pago u otro) y un flag por familia. Hoy el PIN de admin es único: para vender hay que separar cuentas de cuidadores.
2. **Compra dentro de la skill (Alexa in-skill purchasing).** Amazon cobra y se queda una comisión. Hay que diseñar productos consumibles o una suscripción, y la persona mayor tendría que confirmar la compra por voz. Es más trabajo de certificación y peor experiencia para quien no maneja pagos. Úsalo solo si el comprador es la misma persona que habla con Alexa.

Un precio de arranque, a modo de hipótesis y no de lista: una suscripción mensual baja por adulto mayor (compañía diaria más recordatorios), con el cuidador como cliente. No publiques un precio hasta tener el costo del modelo de lenguaje y el disco.

## Datos

- Cada familia es una sesión. No compartas el archivo `quetai.db` entre clientes si más adelante separas servidores.
- El cuidador ve la conversación y el perfil. Diló en el contrato y en la privacidad. No es un modo de vigilancia oculta.
- Borrado: el panel elimina a la persona, o se pide por hola@quetai.tech.
- `ASSISTANT_NAME` cambia cómo se presenta el asistente (por defecto `Quetai`). La invocación de Alexa sigue siendo `mi quetai` hasta que cada cliente publique su propia skill.
- `NEWS_ENABLED=false` apaga los titulares.
- `LLM_MODEL` y `LLM_MODEL_FALLBACK` eligen el modelo del endpoint compatible con OpenAI. El de por defecto es `llama-3.3-70b-versatile`. Si el proveedor tiene uno más fuerte, se cambia en Render, no en el código. Si el principal falla o no alcanza el tiempo de Alexa, se usa el fallback (`llama-3.1-8b-instant`).

## Salud

Quetai acompaña y recuerda lo que la persona pidió. No diagnostica, no sugiere dosis y no reemplaza a un médico ni a un servicio de emergencia. Las respuestas de política son conversación sobre titulares, sin campaña y sin inventar lo que no vino en la lista. Si el titular no está, dice que no lo sabe.

Eso tiene que estar en la ficha de la tienda, en `/terminos`, en el contrato con la familia y en la primera conversación con el cuidador.
