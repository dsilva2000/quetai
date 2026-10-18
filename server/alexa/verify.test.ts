import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  certificateUsable,
  resetCertCache,
  timestampFresh,
  validateCertUrl,
  verifyAlexaRequest,
  verifyBodySignature,
} from "./verify.ts";

const CERT_URL = "https://s3.amazonaws.com/echo.api/echo-api-cert-test.pem";

function openssl(args: string[], cwd: string) {
  execFileSync("openssl", args, { cwd, stdio: "pipe" });
}

function certConSan(dir: string, days: number, san: string): { cert: string; key: string } {
  const key = path.join(dir, "key.pem");
  const cert = path.join(dir, "cert.pem");
  openssl(
    [
      "req", "-x509", "-newkey", "rsa:2048",
      "-keyout", key, "-out", cert, "-nodes",
      "-days", String(days),
      "-subj", "/CN=echo-api.amazon.com",
      "-addext", `subjectAltName=DNS:${san}`,
    ],
    dir,
  );
  return { cert: readFileSync(cert, "utf8"), key: readFileSync(key, "utf8") };
}

function firmar(keyPem: string, body: Buffer): string {
  const sign = crypto.createSign("RSA-SHA1");
  sign.update(body);
  sign.end();
  return sign.sign(keyPem).toString("base64");
}

test("la URL del certificado solo puede ser echo.api en S3", () => {
  assert.equal(validateCertUrl("https://s3.amazonaws.com/echo.api/echo-api-cert.pem"), true);
  assert.equal(validateCertUrl("https://s3.amazonaws.com:443/echo.api/echo-api-cert.pem"), true);
  assert.equal(validateCertUrl("http://s3.amazonaws.com/echo.api/echo-api-cert.pem"), false);
  assert.equal(validateCertUrl("https://evil.example/echo.api/echo-api-cert.pem"), false);
  assert.equal(validateCertUrl("https://s3.amazonaws.com/Echo.api/x.pem"), false);
  assert.equal(validateCertUrl("https://s3.amazonaws.com/echo.api/../x.pem"), false);
  assert.equal(validateCertUrl("https://s3.amazonaws.com:8443/echo.api/x.pem"), false);
  assert.equal(validateCertUrl("https://user:pass@s3.amazonaws.com/echo.api/x.pem"), false);
});

test("el reloj admite 150 segundos y rechaza lo más viejo", () => {
  const now = new Date("2026-10-18T15:00:00.000Z");
  assert.equal(timestampFresh("2026-10-18T14:58:00.000Z", now), true);
  assert.equal(timestampFresh("2026-10-18T14:57:00.000Z", now), false);
  assert.equal(timestampFresh("no-es-fecha", now), false);
  assert.equal(timestampFresh(undefined, now), false);
});

test("verifica la firma RSA-SHA1 del cuerpo", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const body = Buffer.from('{"request":{"type":"LaunchRequest"}}');
  const sign = crypto.createSign("RSA-SHA1");
  sign.update(body);
  sign.end();
  const signature = sign.sign(privateKey).toString("base64");
  assert.equal(verifyBodySignature(publicKey, signature, body), true);
  assert.equal(verifyBodySignature(publicKey, signature, Buffer.from("alterado")), false);
});

test("acepta un certificado vigente de echo-api y rechaza otro nombre", () => {
  const bueno = certConSan(mkdtempSync(path.join(tmpdir(), "quetai-cert-")), 30, "echo-api.amazon.com");
  const malo = certConSan(mkdtempSync(path.join(tmpdir(), "quetai-cert-")), 30, "evil.example");
  const ahora = new Date();
  assert.equal(certificateUsable(bueno.cert, ahora), true);
  assert.equal(certificateUsable(malo.cert, ahora), false);
});

test("rechaza SAN equivocado, certificado vencido y cuerpo alterado", async () => {
  const now = new Date();
  const bueno = certConSan(mkdtempSync(path.join(tmpdir(), "quetai-ok-")), 30, "echo-api.amazon.com");
  const malo = certConSan(mkdtempSync(path.join(tmpdir(), "quetai-bad-")), 30, "evil.example");
  const viejo = certConSan(mkdtempSync(path.join(tmpdir(), "quetai-old-")), 1, "echo-api.amazon.com");
  const dentroDeUnMes = new Date(now.getTime() + 40 * 24 * 60 * 60 * 1000);

  const raw = Buffer.from(`{"request":{"timestamp":"${now.toISOString()}"}}`);
  const signature = firmar(bueno.key, raw);
  resetCertCache();

  const ok = await verifyAlexaRequest({
    certUrl: CERT_URL,
    signature,
    rawBody: raw,
    timestamp: now.toISOString(),
    now,
    fetchCert: async () => bueno.cert,
  });
  assert.equal(ok.ok, true);

  const alterado = await verifyAlexaRequest({
    certUrl: CERT_URL + "?v=2",
    signature,
    rawBody: Buffer.from("no-es-el-cuerpo"),
    timestamp: now.toISOString(),
    now,
    fetchCert: async () => bueno.cert,
  });
  assert.equal(alterado.ok, false);
  assert.equal(alterado.status, 400);

  const san = await verifyAlexaRequest({
    certUrl: "https://s3.amazonaws.com/echo.api/otro.pem",
    signature: firmar(malo.key, raw),
    rawBody: raw,
    timestamp: now.toISOString(),
    now,
    fetchCert: async () => malo.cert,
  });
  assert.equal(san.ok, false);

  const vencido = await verifyAlexaRequest({
    certUrl: "https://s3.amazonaws.com/echo.api/viejo.pem",
    signature: firmar(viejo.key, raw),
    rawBody: raw,
    timestamp: dentroDeUnMes.toISOString(),
    now: dentroDeUnMes,
    fetchCert: async () => viejo.cert,
  });
  assert.equal(vencido.ok, false);

  const viejaPeticion = await verifyAlexaRequest({
    certUrl: CERT_URL,
    signature,
    rawBody: raw,
    timestamp: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
    now,
    fetchCert: async () => bueno.cert,
  });
  assert.equal(viejaPeticion.ok, false);
});

test("rechaza una cadena que no enlaza", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "quetai-chain-"));
  const caKey = path.join(dir, "ca.key");
  const caPem = path.join(dir, "ca.pem");
  const leafKey = path.join(dir, "leaf.key");
  const leafCsr = path.join(dir, "leaf.csr");
  const leafPem = path.join(dir, "leaf.pem");
  openssl(["req", "-x509", "-newkey", "rsa:2048", "-keyout", caKey, "-out", caPem, "-days", "30", "-nodes", "-subj", "/CN=TestCA"], dir);
  openssl([
    "req", "-newkey", "rsa:2048", "-keyout", leafKey, "-out", leafCsr, "-nodes",
    "-subj", "/CN=echo-api.amazon.com", "-addext", "subjectAltName=DNS:echo-api.amazon.com",
  ], dir);
  openssl([
    "x509", "-req", "-in", leafCsr, "-CA", caPem, "-CAkey", caKey, "-CAcreateserial",
    "-out", leafPem, "-days", "30", "-copy_extensions", "copy",
  ], dir);
  const leaf = readFileSync(leafPem, "utf8");
  const ca = readFileSync(caPem, "utf8");
  const otra = certConSan(mkdtempSync(path.join(tmpdir(), "quetai-otra-")), 30, "echo-api.amazon.com");
  const raw = Buffer.from("cuerpo");
  const now = new Date();
  resetCertCache();
  const bien = await verifyAlexaRequest({
    certUrl: "https://s3.amazonaws.com/echo.api/cadena.pem",
    signature: firmar(readFileSync(leafKey, "utf8"), raw),
    rawBody: raw,
    timestamp: now.toISOString(),
    now,
    fetchCert: async () => `${leaf}\n${ca}`,
  });
  assert.equal(bien.ok, true);

  resetCertCache();
  const mal = await verifyAlexaRequest({
    certUrl: "https://s3.amazonaws.com/echo.api/cadena-rota.pem",
    signature: firmar(readFileSync(leafKey, "utf8"), raw),
    rawBody: raw,
    timestamp: now.toISOString(),
    now,
    fetchCert: async () => `${leaf}\n${otra.cert}`,
  });
  assert.equal(mal.ok, false);
});

test("la cadena descargada se cachea", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "quetai-cache-"));
  const bueno = certConSan(dir, 30, "echo-api.amazon.com");
  const raw = Buffer.from("{}");
  const signature = firmar(bueno.key, raw);
  let descargas = 0;
  resetCertCache();
  const url = "https://s3.amazonaws.com/echo.api/cacheado.pem";
  const input = {
    certUrl: url,
    signature,
    rawBody: raw,
    timestamp: new Date().toISOString(),
    fetchCert: async () => {
      descargas += 1;
      return bueno.cert;
    },
  };
  assert.equal((await verifyAlexaRequest(input)).ok, true);
  assert.equal((await verifyAlexaRequest(input)).ok, true);
  assert.equal(descargas, 1);
});
