import type { Express, Request, Response } from "express";
import { nombreAsistente } from "./brand";

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

function escapar(texto: string): string {
  return texto.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

function privacidad(nombre: string): string {
  const n = escapar(nombre);
  return pagina(
    `Privacidad de ${n}`,
    `
  <p>${n} es un compañero de conversación para adultos mayores. Esta página explica qué datos guarda el servicio, en el navegador, en el teléfono y por Alexa (“Alexa, abre mi quetai”). El nombre del asistente se puede cambiar; hoy es ${n}.</p>
  <h2>Qué guardamos</h2>
  <p>Por cada persona (una sesión web o un usuario de Alexa) guardamos: el nombre que nos dice, el apodo si lo pide o si lo anota quien la cuida, temas que le gustan, temas que prefiere evitar, nombres de familiares que ella mencione, notas libres del cuidador, el texto de la conversación, un resumen de charlas anteriores y los medicamentos con horario que ella misma anota. En Alexa, la sesión se asocia al userId que envía Amazon. No pedimos cuenta ni contraseña.</p>
  <p>Quien cuida puede ver y editar ese perfil en el panel de administración. La persona también puede cambiar el apodo y los gustos por voz.</p>
  <p>Para conversar de actualidad, el servidor consulta titulares públicos de Google News (español de Latinoamérica, Perú) y los guarda en memoria unos 30 minutos. Esos titulares no son datos personales y no se mezclan con el perfil.</p>
  <p>Si aceptas el permiso de recordatorios de Alexa, Amazon entrega un aviso en el dispositivo a la hora que indicaste. ${n} no recibe tu libreta de contactos ni tu ubicación.</p>
  <h2>Para qué los usamos</h2>
  <p>Para continuar la conversación, recordar lo que ya contaste y avisarte de un medicamento que tú mismo anotaste. No vendemos estos datos y no mostramos publicidad. Cada familia usa su propia sesión: los datos de una persona no se usan para hablar con otra.</p>
  <h2>Dónde viven</h2>
  <p>En la base de datos del servidor (un archivo SQLite en el disco del servicio). Amazon procesa el audio de la frase hasta convertirla en texto y nos envía ese texto. El modelo de lenguaje recibe el perfil, el resumen y los titulares para redactar la respuesta.</p>
  <h2>Cuánto tiempo</h2>
  <p>La conversación y el resumen se conservan para que ${n} pueda recordar. Puedes decir “empecemos de nuevo” para borrar la charla reciente; el perfil, el resumen de largo plazo y los medicamentos se quedan. Para pedir un borrado completo, escribe a hola@quetai.tech o usa el panel del cuidador.</p>
  <h2>Salud y política</h2>
  <p>${n} no es un dispositivo médico, no diagnostica y no cambia dosis. Un recordatorio de medicamento es solo lo que la persona pidió anotar. Ante una urgencia, llama a un familiar o a emergencias. En Perú, el número de la policía es 105, y el SAMU es 106.</p>
  <p>Si conversa de política, comenta titulares públicos. No recomienda un partido ni un candidato. Puede equivocarse o no tener el dato: en ese caso debe decir que no lo sabe, no inventar una noticia.</p>
  `,
  );
}

function terminos(nombre: string): string {
  const n = escapar(nombre);
  return pagina(
    `Términos de uso de ${n}`,
    `
  <p>${n} ofrece compañía por conversación, en el teléfono, en el navegador y por Alexa. Está pensado para adultos mayores y las familias que los cuidan. El nombre del producto se puede configurar; en este servicio es ${n}.</p>
  <h2>Qué no es</h2>
  <p>No es un servicio médico, de enfermería ni de emergencia. Las respuestas las redacta un modelo de lenguaje y pueden equivocarse. No sigas un consejo de salud de ${n} en lugar de tu médico. Las noticias que menciona salen de titulares públicos del momento; si no tiene un titular, no debe inventarlo.</p>
  <h2>Política</h2>
  <p>Puede conversar de política a partir de titulares. No hace campaña, no empuja a un partido ni a un candidato, y debe decir cuando no está seguro.</p>
  <h2>Recordatorios</h2>
  <p>Si pides anotar un medicamento, ${n} guarda el nombre y la hora que dijiste. En un Echo, el aviso suena solo si aceptas el permiso de recordatorios de Alexa y el dispositivo está disponible. Puede fallar. No dependas de ${n} para una dosis que no puedes olvidar.</p>
  <h2>Perfil</h2>
  <p>El cuidador puede anotar apodo, gustos, temas a evitar, familia y notas. La persona puede cambiar parte de eso por voz. Esas notas sirven para acompañar, no para vigilar a escondidas.</p>
  <h2>Uso aceptable</h2>
  <p>No uses ${n} para hacer daño, para suplantar a otra persona ni para recoger datos de alguien sin su conocimiento.</p>
  <h2>Cambios</h2>
  <p>Estos términos pueden actualizarse. La fecha de esta versión es el 18 de octubre de 2026.</p>
  `,
  );
}

export function registerLegalRoutes(app: Express) {
  app.get("/privacidad", (_req: Request, res: Response) => {
    res.type("html").send(privacidad(nombreAsistente()));
  });
  app.get("/terminos", (_req: Request, res: Response) => {
    res.type("html").send(terminos(nombreAsistente()));
  });
}
