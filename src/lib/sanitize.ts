/**
 * 内容净化：匿名空间禁止超链接 / 分享。
 * - 把 Markdown 链接 [text](url) 还原成 text
 * - 删除 http(s)://、www. 以及裸域名（含路径）
 * 注意：系统生成的 Vercel Blob URL（图片/语音/视频）不走此函数，
 * 而是由上传接口写入消息 body，用户无法手动输入链接。
 */
export function stripLinks(input: string): string {
  let s = input.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/https?:\/\/[^\s<>"']+/gi, "");
  s = s.replace(/www\.[^\s<>"']+/gi, "");
  s = s.replace(/\b[a-z0-9-]+(\.[a-z]{2,}){1,}(?:\/[^\s<>"']*)?/gi, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

export function containsLink(input: string): boolean {
  return /https?:\/\/|www\.|\b[a-z0-9-]+\.[a-z]{2,}/i.test(input);
}
