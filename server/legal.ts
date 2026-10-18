import type { Express, Request, Response } from "express";

const ESTILO = `
  body { font-family: Georgia, "Times New Roman", serif; max-width: 40rem; margin: 2rem auto; padding: 0 1.25rem; line-height: 1.55; color: #1c1917; background: #fffaf3; }
  h1 { font-size: 1.8rem; }
  h2 { font-size: 1.2rem; margin-top: 1.6rem; }
  a { color: #9a3412; }
`;

function pagina(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${titulo}</title>
  <style>${ESTILO}</style>
</head>
<body>
  <h1>${titulo}</h1>
  ${cuerpo}
  <p>Contacto: <a href="mailto:hola@quetai.tech">hola@quetai.tech</a>. Lima, Perú.</p>
</body>
</html>`;
}

const PRIVACIDAD = pagina(
  "Privacidad de Quetai",
  `
  <p>Quetai es un compañero de conversación para adultos mayores. Esta página explica qué datos guarda el servicio, incluido cuando se usa por la voz con Alexa (“Alexa, abre Quetai”).</p>
  <h2>Qué guardamos</h2>
  <p>El nombre que nos dices, el texto de la conversación, los medicamentos y horarios que anotas, y un identificador de sesión. En Alexa, ese identificador se asocia al userId que envía Amazon. No pedimos cuenta ni contraseña.</p>
  <p>Si aceptas el permiso de recordatorios de Alexa, Amazon entrega un aviso en el dispositivo a la hora que indicaste. Quetai no recibe tu libreta de contactos ni tu ubicación.</p>
  <h2>Para qué los usamos</h2>
  <p>Para continuar la conversación, recordar lo que ya contaste y avisarte de un medicamento que tú mismo anotaste. No vendemos estos datos y no mostramos publicidad.</p>
  <h2>Dónde viven</h2>
  <p>En la base de datos del servidor de Quetai (un archivo SQLite en el disco del servicio). Amazon procesa el audio de la frase hasta convertirla en texto y nos envía ese texto.</p>
  <h2>Cuánto tiempo</h2>
  <p>La conversación se conserva para que Quetai pueda recordar. Puedes decir “empecemos de nuevo” para borrar la charla de esa sesión. Los medicamentos se quedan hasta que se borre la sesión. Para pedir un borrado completo, escribe a hola@quetai.tech.</p>
  <h2>Salud</h2>
  <p>Quetai no es un dispositivo médico, no diagnostica y no cambia dosis. Un recordatorio de medicamento es solo lo que la persona pidió anotar. Ante una urgencia, llama a un familiar o a emergencias. En Perú, el número de emergencias es 105, y el SAMU es 106.</p>
  `,
);

const TERMINOS = pagina(
  "Términos de uso de Quetai",
  `
  <p>Quetai ofrece compañía por conversación, en el teléfono, en el navegador y por Alexa. Está pensado para adultos mayores y sus familias.</p>
  <h2>Qué no es</h2>
  <p>No es un servicio médico, de enfermería ni de emergencia. Las respuestas las redacta un modelo de lenguaje y pueden equivocarse. No sigas un consejo de salud de Quetai en lugar de tu médico.</p>
  <h2>Recordatorios</h2>
  <p>Si pides anotar un medicamento, Quetai guarda el nombre y la hora que dijiste. En un Echo, el aviso suena solo si aceptas el permiso de recordatorios de Alexa y el dispositivo está disponible. Puede fallar. No dependas de Quetai para una dosis que no puedes olvidar.</p>
  <h2>Uso aceptable</h2>
  <p>No uses Quetai para hacer daño, para suplantar a otra persona ni para recoger datos de alguien sin su conocimiento. El servicio es para acompañar, no para vigilar a escondidas.</p>
  <h2>Cambios</h2>
  <p>Estos términos pueden actualizarse. La fecha de esta versión es el 18 de octubre de 2026.</p>
  `,
);

export function registerLegalRoutes(app: Express) {
  app.get("/privacidad", (_req: Request, res: Response) => {
    res.type("html").send(PRIVACIDAD);
  });
  app.get("/terminos", (_req: Request, res: Response) => {
    res.type("html").send(TERMINOS);
  });
}
