const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    cryptoObj.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < size; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export function createId(prefix = "id"): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `${prefix}-${cryptoObj.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createJoinCode(length = 4): string {
  const size = Math.max(1, Math.min(8, Math.floor(length)));
  const bytes = randomBytes(size);
  let code = "";
  for (let i = 0; i < size; i += 1) {
    code += JOIN_ALPHABET[bytes[i]! % JOIN_ALPHABET.length];
  }
  return code;
}

export function createToken(): string {
  const bytes = randomBytes(24);
  let token = "";
  for (const byte of bytes) {
    token += byte.toString(16).padStart(2, "0");
  }
  return token;
}
