import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 服务端直传：客户端把文件以 FormData 发来，服务端用 BLOB_READ_WRITE_TOKEN
 * 上传到 Vercel Blob，返回可公开访问的 url。该 url 只作为消息 body 存储，
 * 用户无法手动输入链接，因此不违反“禁外链”规则。
 *
 * 注意：Vercel 函数请求体有上限（Hobby 约 4.5MB）。图片/短视频足够；
 * 若要支持大视频，请升级 Pro 或改用客户端分片直传。
 */
export async function POST(request: NextRequest) {
  const s = await getSession();
  if (!s) return new Response("unauthorized", { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return new Response("no file", { status: 400 });

  const blob = await put(file.name, file, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN!,
    contentType: file.type || undefined,
  });

  return NextResponse.json({ url: blob.url });
}
