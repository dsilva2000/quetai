# Cómo dejar el perfil de una persona

Quetai no trae datos de nadie en el código. Cada persona (sesión web o `alexa:<userId>`) empieza con el perfil vacío: apodo, temas, cosas a evitar, familia y notas. Daniel, u otro cuidador, lo llena después.

El primer uso previsto es una adulta mayor que quiere que le digan **Queta**. Ese apodo se escribe en el panel o se dice por voz. No está guardado en el repositorio.

## 1. Que la persona aparezca en el panel

En el Echo:

1. «Alexa, abre mi quetai».
2. Cuando pregunte el nombre, decir el nombre, por ejemplo «me llamo Enriqueta».
3. La sesión queda como `alexa:` más el userId de Amazon.

En el teléfono o el navegador, la sesión aparece cuando la persona escribe su nombre en el chat.

## 2. Panel del cuidador (el camino en producción)

1. Abre [https://quetai.onrender.com/#/admin](https://quetai.onrender.com/#/admin).
2. Entra con el PIN de admin (`ADMIN_PIN` en Render).
3. Abre la tarjeta de la persona.
4. En **Perfil** llena:
   - **Cómo le dicen:** `Queta`
   - **Le gusta:** por ejemplo `chisme, cocina`
   - **No sacar:** lo que prefiera no tocar
   - **Familia:** nombres que quieras que recuerde
   - **Notas:** lo que el cuidador quiera que el asistente tenga en cuenta
5. **Guardar perfil**.

A partir del siguiente turno, la voz y el chat usan ese perfil. El resumen de charlas viejas se arma solo, en SQLite, cuando ya hay bastante conversación. «Empecemos de nuevo» borra los mensajes recientes y deja el perfil y ese resumen.

## 3. Por voz

Con la skill abierta, la persona puede decir:

- «dime Queta»
- «me gusta el chisme»
- «no me hables de política» (si de verdad no quiere ese tema)
- «mi nieta se llama Rosa»

La voz **agrega** gustos, temas a evitar y familia. El apodo se reemplaza. El panel **reemplaza** todo el perfil: es la fuente de verdad del cuidador.

## 4. Archivo JSON fuera de git

Sirve en una máquina donde puedas correr TypeScript. En el shell de Render de producción no está `tsx`.

1. Copia `script/perfil.example.json` a una ruta **fuera** del repositorio, por ejemplo `~/queta-perfil.json`.
2. Edítalo ahí. No lo commitees.
3. Desde la raíz del proyecto, con `DATA_DIR` apuntando a la base que quieres tocar:

```bash
PERFIL_SEED_PATH=$HOME/queta-perfil.json npx tsx script/seed-perfil.ts
```

`alexaUserId` crea la sesión `alexa:<id>` si todavía no existe. `sessionId` sirve si ya conoces la sesión (también vale una sesión web).

El ejemplo del repo usa textos de relleno (`Tu familiar`, `Como le dicen`). Cámbialos en tu copia.
