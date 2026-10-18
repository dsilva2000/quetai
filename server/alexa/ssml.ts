const LOCALE_OK = new Set(["es-US", "es-ES", "es-MX", "es-419"]);

export function localeVoz(locale: string | undefined): string {
  if (locale && LOCALE_OK.has(locale)) return locale;
  return "es-US";
}

export function limpiarParaVoz(texto: string): string {
  return texto
    .replace(/[*_~`#]/g, "")
    .replace(/[\u2600-\u27BF]/g, "")
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** SSML lento y claro, pensado para un parlante y un adulto mayor. */
export function toSsml(texto: string, locale?: string): string {
  const limpio = escapeXml(limpiarParaVoz(texto));
  const partes = (limpio ? limpio.split(/(?<=[.!?])\s+/) : ["Un momento, por favor."]).filter(Boolean);
  const inner = partes.join(' <break time="350ms"/> ');
  const lang = localeVoz(locale);
  return `<speak xml:lang="${lang}"><prosody rate="slow">${inner}</prosody></speak>`;
}
