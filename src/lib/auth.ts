import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const COOKIE = "anon_session";
const ADMIN_COOKIE = "anon_admin";

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export type SessionUser = { id: string; handle: string };

export async function signSession(payload: {
  sub: string;
  handle: string;
}): Promise<string> {
  return new SignJWT({ handle: payload.handle })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(getSecret());
}

export async function setSession(payload: {
  sub: string;
  handle: string;
}): Promise<void> {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;
    return { id: payload.sub, handle: (payload.handle as string) ?? "匿名" };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/* ---------------- 管理员会话 ---------------- */

export async function setAdminSession(): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSecret());
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getAdminSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

/**
 * 管理权限判定：优先看管理员会话 Cookie；同时兼容运营脚本用
 * x-admin-code 请求头带 ADMIN_CODE 调用（用于 curl / CI）。
 */
export async function isAdmin(req?: NextRequest): Promise<boolean> {
  if (await getAdminSession()) return true;
  if (req) {
    const h = req.headers.get("x-admin-code") || "";
    if (process.env.ADMIN_CODE && h === process.env.ADMIN_CODE) return true;
  }
  return false;
}
