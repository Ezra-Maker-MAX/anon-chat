/**
 * 客户端端到端加密 (E2EE) — 基于 Web Crypto API 的 AES-GCM 256。
 *
 * 设计要点：
 * - 房间密钥由创建者在浏览器内生成，**服务端永远拿不到明文密钥**。
 * - 密钥通过邀请码"片段"传递：邀请码格式 = `SERVER_CODE#BASE64_KEY`。
 *   服务端只存储和验证 `SERVER_CODE` 部分；`#BASE64_KEY` 永远不离开客户端。
 * - 加入私密房时，客户端拆分邀请码：发 SERVER_CODE 给服务端做成员校验，
 *   保留 BASE64_KEY 在本地（localStorage），后续用于加解密。
 * - 每条消息用随机 12 字节 IV 加密；密文格式 = `base64(iv).base64(ciphertext)`。
 * - 媒体文件（图片/语音/视频）在上传前整体加密，Blob 存的是密文；
 *   下载后客户端解密再渲染。
 */

const KEY_STORAGE_PREFIX = "anon_e2ee_key_";

/** 生成新的 AES-GCM 256 密钥，返回 base64 编码的 raw key。 */
export async function generateRoomKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufToBase64(raw);
}

/** 从 base64 字符串导入 AES-GCM CryptoKey。 */
async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = base64ToBuf(base64Key);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** 加密文本，返回 `iv.ciphertext`（均为 base64）。 */
export async function encryptText(
  plaintext: string,
  base64Key: string
): Promise<string> {
  const key = await importKey(base64Key);
  const ivBuf = new ArrayBuffer(12);
  const iv = new Uint8Array(ivBuf);
  crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuf },
    key,
    encoded
  );
  return `${bufToBase64(ivBuf)}.${bufToBase64(cipher)}`;
}

/** 解密 `iv.ciphertext` 格式的密文，返回明文。 */
export async function decryptText(
  packed: string,
  base64Key: string
): Promise<string> {
  const key = await importKey(base64Key);
  const [ivB64, cipherB64] = packed.split(".");
  if (!ivB64 || !cipherB64) throw new Error("invalid ciphertext format");
  const iv = base64ToBuf(ivB64);
  const cipher = base64ToBuf(cipherB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

/** 加密二进制数据（用于媒体文件），返回加密后的 Blob。 */
export async function encryptBlob(
  data: Blob,
  base64Key: string
): Promise<Blob> {
  const key = await importKey(base64Key);
  const ivBuf = new ArrayBuffer(12);
  const iv = new Uint8Array(ivBuf);
  crypto.getRandomValues(iv);
  const buf = await data.arrayBuffer();
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuf },
    key,
    buf
  );
  // 输出 = iv(12 bytes) + ciphertext
  const merged = new Uint8Array(12 + cipher.byteLength);
  merged.set(new Uint8Array(ivBuf), 0);
  merged.set(new Uint8Array(cipher), 12);
  return new Blob([merged.buffer], { type: "application/octet-stream" });
}

/** 解密二进制数据（用于媒体文件），返回解密后的 Blob。 */
export async function decryptBlob(
  encryptedData: ArrayBuffer,
  base64Key: string,
  mimeType: string
): Promise<Blob> {
  const key = await importKey(base64Key);
  const iv = encryptedData.slice(0, 12);
  const cipher = encryptedData.slice(12);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher
  );
  return new Blob([plain], { type: mimeType });
}

/** 拆分邀请码：返回 { serverCode, key? }。 */
export function parseInviteCode(raw: string): {
  serverCode: string;
  key: string | null;
} {
  const idx = raw.indexOf("#");
  if (idx === -1) return { serverCode: raw.trim(), key: null };
  return {
    serverCode: raw.slice(0, idx).trim(),
    key: raw.slice(idx + 1).trim() || null,
  };
}

/** 拼合邀请码：`SERVER_CODE#BASE64_KEY`。 */
export function buildInviteCode(serverCode: string, key: string): string {
  return `${serverCode}#${key}`;
}

/** 把房间密钥存到 localStorage（按 roomId 索引）。 */
export function saveRoomKey(roomId: string, key: string): void {
  localStorage.setItem(KEY_STORAGE_PREFIX + roomId, key);
}

/** 读取房间密钥；不存在返回 null。 */
export function getRoomKey(roomId: string): string | null {
  return localStorage.getItem(KEY_STORAGE_PREFIX + roomId);
}

/** 判断消息 body 是否为加密格式（`iv.ciphertext`）。 */
export function isEncrypted(body: string): boolean {
  const parts = body.split(".");
  return parts.length === 2 && parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p));
}

/* ---------- helpers ---------- */

function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}
