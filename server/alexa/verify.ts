import crypto from "crypto";

const MAX_SKEW_MS = 150_000;
const CERT_TTL_MS = 60 * 60 * 1000;
const MAX_CERT_CHARS = 20_000;

export interface VerifyResult {
  ok: boolean;
  status: number;
  reason: string;
}

interface CertCacheEntry {
  pem: string;
  fetchedAt: number;
}

const certCache = new Map<string, CertCacheEntry>();

export function resetCertCache(): void {
  certCache.clear();
}

/**
 * Reglas de Amazon para SignatureCertChainUrl:
 * https, host s3.amazonaws.com, path /echo.api/..., puerto 443 si viene.
 */
export function validateCertUrl(urlStr: string): boolean {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.hostname !== "s3.amazonaws.com") return false;
  if (!url.pathname.startsWith("/echo.api/")) return false;
  if (url.pathname.includes("..") || url.pathname.includes("\\")) return false;
  if (url.port && url.port !== "443") return false;
  if (url.username || url.password) return false;
  return true;
}

export function timestampFresh(timestamp: string | undefined, now = new Date()): boolean {
  if (!timestamp) return false;
  const when = Date.parse(timestamp);
  if (Number.isNaN(when)) return false;
  return Math.abs(now.getTime() - when) <= MAX_SKEW_MS;
}

export function splitPem(pem: string): string[] {
  const matches = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  return matches ?? [];
}

export function certificateUsable(pem: string, now = new Date()): boolean {
  let cert: crypto.X509Certificate;
  try {
    cert = new crypto.X509Certificate(pem);
  } catch {
    return false;
  }
  const from = Date.parse(cert.validFrom);
  const to = Date.parse(cert.validTo);
  if (Number.isNaN(from) || Number.isNaN(to)) return false;
  if (now.getTime() < from || now.getTime() > to) return false;
  const san = cert.subjectAltName || "";
  const names = san.split(",").map((part) => part.trim().toLowerCase());
  return names.includes("dns:echo-api.amazon.com");
}

export function verifyBodySignature(pemOrKey: string | crypto.KeyObject, signatureB64: string, rawBody: Buffer): boolean {
  if (!signatureB64 || rawBody.length === 0) return false;
  try {
    const verifier = crypto.createVerify("RSA-SHA1");
    verifier.update(rawBody);
    verifier.end();
    const key = typeof pemOrKey === "string" ? new crypto.X509Certificate(pemOrKey).publicKey : pemOrKey;
    return verifier.verify(key, signatureB64, "base64");
  } catch {
    return false;
  }
}

function chainLinks(pems: string[]): boolean {
  if (pems.length < 2) return true;
  try {
    for (let i = 0; i < pems.length - 1; i++) {
      const child = new crypto.X509Certificate(pems[i]);
      const parent = new crypto.X509Certificate(pems[i + 1]);
      if (!child.checkIssued(parent)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function verifyAlexaRequest(input: {
  certUrl: string | undefined;
  signature: string | undefined;
  rawBody: Buffer;
  timestamp: string | undefined;
  now?: Date;
  fetchCert?: (url: string) => Promise<string>;
}): Promise<VerifyResult> {
  const now = input.now ?? new Date();
  if (!input.certUrl || !validateCertUrl(input.certUrl)) {
    return { ok: false, status: 400, reason: "url de certificado inválida" };
  }
  if (!input.signature) {
    return { ok: false, status: 400, reason: "falta la firma" };
  }
  if (!timestampFresh(input.timestamp, now)) {
    return { ok: false, status: 400, reason: "marca de tiempo fuera de rango" };
  }

  let pem: string;
  try {
    pem = await loadCert(input.certUrl, input.fetchCert);
  } catch (err: any) {
    console.error("[alexa] no se pudo descargar el certificado:", err?.message || err);
    return { ok: false, status: 400, reason: "certificado no disponible" };
  }

  const certs = splitPem(pem);
  if (certs.length === 0) return { ok: false, status: 400, reason: "certificado vacío" };
  if (!certificateUsable(certs[0], now)) {
    return { ok: false, status: 400, reason: "certificado no vigente o sin SAN echo-api" };
  }
  if (!chainLinks(certs)) {
    return { ok: false, status: 400, reason: "cadena de certificados inválida" };
  }
  if (!verifyBodySignature(certs[0], input.signature, input.rawBody)) {
    return { ok: false, status: 400, reason: "firma inválida" };
  }
  return { ok: true, status: 200, reason: "ok" };
}

async function loadCert(url: string, fetchCert?: (url: string) => Promise<string>): Promise<string> {
  const cached = certCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CERT_TTL_MS) return cached.pem;

  const pem = fetchCert ? await fetchCert(url) : await downloadCert(url);
  if (pem.length === 0 || pem.length > MAX_CERT_CHARS) {
    throw new Error("tamaño de certificado inesperado");
  }
  if (!pem.includes("BEGIN CERTIFICATE")) throw new Error("el cuerpo no es un PEM");
  certCache.set(url, { pem, fetchedAt: Date.now() });
  return pem;
}

async function downloadCert(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(4000) });
  if (res.status >= 300 && res.status < 400) {
    throw new Error("el certificado no debe redirigir");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}
