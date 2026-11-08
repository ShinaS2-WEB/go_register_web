const ITERATIONS = 600000;
const hex = (bytes) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

async function derive(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: encoder.encode(salt), iterations: ITERATIONS, hash: "SHA-256" }, key, 256));
}

export async function createCancellationHash(password) {
  if (typeof password !== "string" || password.length < 6 || password.length > 128) throw new Error("A senha deve ter entre 6 e 128 caracteres.");
  const salt = hex(crypto.getRandomValues(new Uint8Array(24)));
  return `pbkdf2-sha256$${ITERATIONS}$${salt}$${await derive(password, salt)}`;
}

export async function verifyCancellationHash(password, storedHash) {
  if (typeof password !== "string" || !password || password.length > 128) return false;
  const value = String(storedHash || "");
  const modern = /^pbkdf2-sha256\$600000\$([a-f0-9]{48})\$([a-f0-9]{64})$/.exec(value);
  if (modern) return await derive(password, modern[1]) === modern[2];
  const legacy = /^sha256\$([a-f0-9]{32,128})\$([a-f0-9]{64})$/.exec(value);
  if (!legacy) return false;
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${legacy[1]}:${password}`))) === legacy[2];
}
