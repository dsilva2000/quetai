import assert from "node:assert/strict";
import { test } from "node:test";
import { extraerNombre, horaParaVoz, limpiarMedicamento, pareceHora, parseHoraLibre } from "./hora.ts";

test("parsea horas de Alexa y del habla", () => {
  assert.equal(parseHoraLibre("08:00"), "08:00");
  assert.equal(parseHoraLibre("8:30 de la tarde"), "20:30");
  assert.equal(parseHoraLibre("a las 8 de la mañana"), "08:00");
  assert.equal(parseHoraLibre("a las ocho de la noche"), "20:00");
  assert.equal(parseHoraLibre("ocho y media de la mañana"), "08:30");
  assert.equal(parseHoraLibre("12 del día"), "12:00");
});

test("horaParaVoz suena natural", () => {
  assert.equal(horaParaVoz("08:00"), "8 de la mañana");
  assert.equal(horaParaVoz("15:00"), "3 de la tarde");
  assert.equal(horaParaVoz("20:30"), "8 y 30 de la noche");
  assert.equal(horaParaVoz("12:00"), "12 del día");
});

test("pareceHora no confunde un relato", () => {
  assert.equal(pareceHora("a las ocho"), true);
  assert.equal(pareceHora("ocho"), true);
  assert.equal(pareceHora("mi nieto tiene ocho años y vive en Lima"), false);
});

test("extrae nombres y rechaza saludos", () => {
  assert.equal(extraerNombre("me llamo María Elena"), "María Elena");
  assert.equal(extraerNombre("soy juan"), "Juan");
  assert.equal(extraerNombre("hola"), null);
  assert.equal(extraerNombre("quiero hablar de mi nieto"), null);
});

test("limpia el artículo del medicamento", () => {
  assert.equal(limpiarMedicamento("el losartán"), "losartán");
});
