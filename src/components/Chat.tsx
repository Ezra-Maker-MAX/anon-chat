"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Room = {
  id: string;
  name: string;
  topic: string | null;
  createdBy: string;
  createdAt: string;
  isPublic: boolean;
};

type Message = {
  seq: number;
  id: string;
  roomId: string;
  accountId: string;
  kind: string;
  body: string;
  createdAt: string;
  handle: string | null;
  burnsAt: string | null;
};

type LocalAccount = { id: string; handle: string; credential: string };

const ACCOUNTS_KEY = "anon_accounts";
const APP = process.env.NEXT_PUBLIC_APP_NAME || "匿名聊天空间";

function pickMime(kind: "voice" | "video"): string {
  const MR = (window as any).MediaRecorder;
  const prefs =
    kind === "video"
      ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const m of prefs) if (MR && MR.isTypeSupported(m)) return m;
  return "";
}

export default function Chat() {
  const [me, setMe] = useState<{ id: string; handle: string } | null>(null);
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [authOpen, setAuthOpen] = useState(true);
  const [authTab, setAuthTab] = useState<"register" | "login">("register");
  const [codeInput, setCodeInput] = useState("");
  const [handleInput, setHandleInput] = useState("");
  const [authError, setAuthError] = useState("");

  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState("");
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [burnOn, setBurnOn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // 创建房间弹窗
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrivate, setNewPrivate] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<string | null>(null);
  const [createErr, setCreateErr] = useState("");

  // 录制状态
  const [rec, setRec] = useState<{ kind: "voice" | "video"; startedAt: number } | null>(null);
  const [recElapsed, setRecElapsed] = useState(0);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recStartRef = useRef(0);
  const recTimerRef = useRef<number | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const lastSeqRef = useRef(0);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingKind = useRef<"image" | "voice" | "video">("image");

  /* ---------- 账号持久化 ---------- */
  const loadAccounts = useCallback(() => {
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY);
      if (raw) setAccounts(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const saveAccounts = useCallback((list: LocalAccount[]) => {
    setAccounts(list);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  }, []);

  /* ---------- 会话 ---------- */
  const refreshMe = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    if (data.account) {
      setMe(data.account);
      setAuthOpen(false);
    } else {
      setMe(null);
      setAuthOpen(true);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    refreshMe();
  }, [loadAccounts, refreshMe]);

  /* ---------- 房间 ---------- */
  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/rooms");
    const data = await res.json();
    const list: Room[] = data.rooms || [];
    setRooms(list);
    if (list.length && !list.find((r) => r.id === activeRoom)) {
      setActiveRoom(list[0].id);
    }
  }, [activeRoom]);

  useEffect(() => {
    if (me) loadRooms();
  }, [me, loadRooms]);

  /* ---------- 消息 + SSE ---------- */
  useEffect(() => {
    if (!me || !activeRoom) return;
    let es: EventSource | null = null;
    let cancelled = false;

    (async () => {
      const res = await fetch(`/api/messages?room=${encodeURIComponent(activeRoom)}`);
      if (res.status === 403) {
        // 无权访问（例如刚退出私密房），切回首房
        const publicRoom = rooms.find((r) => r.isPublic);
        if (publicRoom) setActiveRoom(publicRoom.id);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      const list: Message[] = (data.messages || []).filter(
        (m: Message) => !m.burnsAt || Date.now() < new Date(m.burnsAt).getTime()
      );
      seenIdsRef.current = new Set(list.map((m) => m.id));
      setMsgs(list);
      const maxSeq = list.reduce((a, m) => Math.max(a, m.seq), 0);
      lastSeqRef.current = maxSeq;

      es = new EventSource(
        `/api/messages/stream?room=${encodeURIComponent(activeRoom)}&lastSeq=${maxSeq}`
      );
      es.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data) as Message;
          if (seenIdsRef.current.has(m.id)) return;
          if (m.burnsAt && Date.now() >= new Date(m.burnsAt).getTime()) return;
          seenIdsRef.current.add(m.id);
          lastSeqRef.current = Math.max(lastSeqRef.current, m.seq);
          setMsgs((prev) => [...prev, m]);
        } catch {
          /* ignore */
        }
      };
      esRef.current = es;
    })();

    return () => {
      cancelled = true;
      es?.close();
      esRef.current?.close();
      esRef.current = null;
    };
  }, [me, activeRoom, rooms]);

  // 阅后即焚：到期自动从本地列表移除
  useEffect(() => {
    const t = setInterval(() => {
      setMsgs((prev) =>
        prev.filter((m) => !m.burnsAt || Date.now() < new Date(m.burnsAt).getTime())
      );
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  /* ---------- 发送文本 ---------- */
  async function sendText() {
    const body = text.trim();
    if (!body || !activeRoom) return;
    setText("");
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: activeRoom, kind: "text", body, burn: burnOn }),
    });
  }

  /* ---------- 图片（选文件） ---------- */
  function pickImage() {
    pendingKind.current = "image";
    const input = fileRef.current;
    if (!input) return;
    input.accept = "image/*";
    input.click();
  }

  /* ---------- 浏览器内录音 / 录像 ---------- */
  async function startRecording(kind: "voice" | "video") {
    if (rec || !activeRoom) return;
    try {
      const constraints =
        kind === "video" ? { audio: true, video: true } : { audio: true, video: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      const mime = pickMime(kind);
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        const type = mr.mimeType || (kind === "video" ? "video/webm" : "audio/webm");
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `rec.${ext}`, { type });
        setRec(null);
        setUploading(true);
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          if (!res.ok) throw new Error("上传失败 " + res.status);
          const { url } = await res.json();
          await fetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              roomId: activeRoom,
              kind,
              body: url,
              burn: burnOn,
            }),
          });
        } catch (err) {
          alert("录制发送失败：" + (err as Error).message);
        } finally {
          setUploading(false);
        }
      };
      mr.start();
      mediaRecRef.current = mr;
      recStartRef.current = Date.now();
      setRec({ kind, startedAt: Date.now() });
      setRecElapsed(0);
      recTimerRef.current = window.setInterval(() => {
        setRecElapsed(Math.floor((Date.now() - recStartRef.current) / 1000));
      }, 1000);
    } catch (err) {
      alert("无法访问麦克风/摄像头：" + (err as Error).message);
    }
  }

  function stopRecording() {
    mediaRecRef.current?.stop();
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activeRoom) return;
    const kind = pendingKind.current;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("upload failed " + res.status);
      const { url } = await res.json();
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: activeRoom, kind, body: url, burn: burnOn }),
      });
    } catch (err) {
      alert("上传失败：" + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  /* ---------- 注册 / 登录 / 登出 ---------- */
  async function doRegister() {
    setAuthError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: codeInput, handle: handleInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(data.error || "注册失败");
      return;
    }
    const acc: LocalAccount = { id: data.id, handle: data.handle, credential: data.credential };
    saveAccounts([...accounts.filter((a) => a.id !== acc.id), acc]);
    setMe({ id: data.id, handle: data.handle });
    setAuthOpen(false);
    setCodeInput("");
    setHandleInput("");
  }

  async function loginWith(credential: string) {
    setAuthError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(data.error || "登录失败");
      return;
    }
    setMe({ id: data.id, handle: data.handle });
    setMenuOpen(false);
    setAuthOpen(false);
  }

  async function doLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    setMenuOpen(false);
    setMsgs([]);
    setActiveRoom("");
    setAuthOpen(true);
  }

  /* ---------- 私密房：创建 / 加入 / 退出 ---------- */
  async function submitCreate() {
    setCreateErr("");
    if (!newName.trim()) {
      setCreateErr("房间名必填");
      return;
    }
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, isPrivate: newPrivate }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCreateErr(data.error || "创建失败");
      return;
    }
    setCreateOpen(false);
    setNewName("");
    await loadRooms();
    setActiveRoom(data.id);
    if (data.inviteCode) setCreatedInvite(data.inviteCode);
  }

  async function joinPrivate() {
    const code = window.prompt("输入私密房邀请码");
    if (!code) return;
    const res = await fetch("/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "加入失败");
      return;
    }
    await loadRooms();
    setActiveRoom(data.roomId);
  }

  async function leaveRoom() {
    if (!activeRoom) return;
    if (!window.confirm("退出该私密房？退出后仍可用邀请码再次加入。")) return;
    await fetch(`/api/rooms/${activeRoom}/leave`, { method: "POST" });
    await loadRooms();
  }

  /* ---------- 渲染 ---------- */
  function renderBody(m: Message) {
    if (m.kind === "image")
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="msg-media" src={m.body} alt="图片" />
      );
    if (m.kind === "voice")
      return (
        <audio className="msg-media audio" src={m.body} controls preload="none" />
      );
    if (m.kind === "video")
      return (
        <video className="msg-media" src={m.body} controls preload="none" style={{ maxWidth: 260 }} />
      );
    return <div className="msg-bubble">{m.body}</div>;
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="sigil" aria-hidden="true" />
          <span className="brand-text">
            {APP}
            <small>多账号匿名 · 邀请码注册 · 不支持外链与分享</small>
          </span>
        </div>
        <div className="header-right">
          <a className="admin-link" href="/admin">
            管理
          </a>
          {me && (
            <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{me.handle}</span>
          )}
          {me && (
            <button className="btn ghost" onClick={() => setMenuOpen((o) => !o)}>
              ☰
            </button>
          )}
        </div>
      </header>

      {menuOpen && me && (
        <div className="menu">
          <div className="muted" style={{ padding: 4 }}>
            切换 / 管理账号
          </div>
          {accounts.map((a) => (
            <div key={a.id} className="acct" onClick={() => loginWith(a.credential)}>
              <span>{a.handle}</span>
              <span className="meta">{a.id === me.id ? "当前" : "点击登录"}</span>
            </div>
          ))}
          <button
            className="btn"
            onClick={() => {
              setMenuOpen(false);
              setAuthTab("register");
              setAuthOpen(true);
            }}
          >
            + 添加账号
          </button>
          <button className="btn ghost" onClick={doLogout}>
            退出当前账号
          </button>
        </div>
      )}

      {me && (
        <>
          <div className="rooms">
            {rooms.map((r) => (
              <button
                key={r.id}
                className={"room-tab" + (r.id === activeRoom ? " active" : "")}
                onClick={() => setActiveRoom(r.id)}
              >
                {!r.isPublic && "🔒 "} {r.name}
              </button>
            ))}
            <button
              className="room-tab"
              title="加入私密房"
              onClick={joinPrivate}
            >
              🔑
            </button>
            <button
              className="room-tab"
              title="创建房间"
              onClick={() => setCreateOpen(true)}
            >
              ＋
            </button>
            {(() => {
              const ar = rooms.find((r) => r.id === activeRoom);
              return ar && !ar.isPublic ? (
                <button className="room-tab" title="退出该私密房" onClick={leaveRoom}>
                  ⇲
                </button>
              ) : null;
            })()}
          </div>

          <div className="messages">
            {msgs.length === 0 && (
              <div className="muted">还没有消息，打个招呼吧 👋</div>
            )}
            {msgs.map((m) => {
              const mine = m.accountId === me.id;
              const time = new Date(m.createdAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              });
              const burned = !!m.burnsAt;
              const remaining = burned
                ? Math.max(0, (new Date(m.burnsAt!).getTime() - Date.now()) / 1000)
                : 0;
              return (
                <div key={m.id} className={"msg" + (mine ? " me" : "") + (burned ? " burn" : "")}>
                  <div className="msg-meta">
                    {mine ? "我" : m.handle || "匿名"} · {time}
                    {burned && <span className="burn-badge" title="阅后即焚"> 🔥</span>}
                  </div>
                  {renderBody(m)}
                  {burned && (
                    <div
                      className="burn-bar"
                      title="本条将在读后自动焚毁"
                      style={{ animationDuration: `${remaining}s` }}
                    />
                  )}
                </div>
              );
            })}
            <div ref={listEndRef} />
          </div>

          <div className="composer">
            {rec ? (
              <div className="rec-pill">
                <span className="rec-dot" />
                {rec.kind === "video" ? "录像" : "录音"}中 {recElapsed}s
                <button className="btn primary" onClick={stopRecording}>
                  ■ 停止
                </button>
              </div>
            ) : (
              <>
                <button className="btn icon-btn" title="图片" onClick={pickImage} disabled={uploading}>
                  🖼️
                </button>
                <button
                  className="btn icon-btn"
                  title="语音"
                  onClick={() => startRecording("voice")}
                  disabled={uploading}
                >
                  🎙️
                </button>
                <button
                  className="btn icon-btn"
                  title="视频"
                  onClick={() => startRecording("video")}
                  disabled={uploading}
                >
                  🎬
                </button>
                <button
                  className={"btn icon-btn" + (burnOn ? " burn-on" : "")}
                  title="阅后即焚：开启后本条消息会在对方读后自动销毁"
                  onClick={() => setBurnOn((v) => !v)}
                >
                  🔥
                </button>
                <textarea
                  rows={1}
                  placeholder={uploading ? "上传中…" : "说点什么（链接会被自动屏蔽）"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendText();
                    }
                  }}
                  disabled={uploading}
                />
                <button
                  className="btn primary"
                  onClick={sendText}
                  disabled={uploading || !text.trim()}
                >
                  发送
                </button>
              </>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            style={{ display: "none" }}
            onChange={onFilePicked}
          />
        </>
      )}

      {/* 创建房间弹窗 */}
      {createOpen && (
        <div className="overlay" onClick={() => setCreateOpen(false)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h2>创建房间</h2>
            <p className="sub">公开房所有人可见；私密房仅受邀成员可见。</p>
            {createErr && <div className="error">{createErr}</div>}
            <div className="field">
              <label>房间名</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例如 深夜树洞" />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={newPrivate}
                onChange={(e) => setNewPrivate(e.target.checked)}
              />
              设为私密房（需邀请码加入）
            </label>
            <div className="row">
              <button className="btn ghost" onClick={() => setCreateOpen(false)}>
                取消
              </button>
              <button className="btn primary" onClick={submitCreate}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 私密房邀请码结果 */}
      {createdInvite && (
        <div className="overlay" onClick={() => setCreatedInvite(null)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h2>私密房已创建</h2>
            <p className="sub">把邀请码告诉想邀请的人（凭码在「🔑」处加入）。可多次使用。</p>
            <div className="invite-code">{createdInvite}</div>
            <div className="row">
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard?.writeText(createdInvite);
                  alert("已复制邀请码");
                }}
              >
                复制
              </button>
              <button className="btn primary" onClick={() => setCreatedInvite(null)}>
                好的
              </button>
            </div>
          </div>
        </div>
      )}

      {authOpen && !me && (
        <div className="overlay">
          <div className="card">
            <div className="tabs">
              <button
                className={"btn" + (authTab === "register" ? " primary" : " ghost")}
                onClick={() => setAuthTab("register")}
              >
                注册
              </button>
              <button
                className={"btn" + (authTab === "login" ? " primary" : " ghost")}
                onClick={() => setAuthTab("login")}
              >
                登录
              </button>
            </div>

            {authTab === "register" ? (
              <>
                <h2>加入 {APP}</h2>
                <p className="sub">需要邀请码。注册即生成匿名身份，可多账号切换。</p>
                {authError && <div className="error">{authError}</div>}
                <div className="field">
                  <label>邀请码</label>
                  <input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    placeholder="例如 A1B2C3D4"
                  />
                </div>
                <div className="field">
                  <label>昵称（可选，留空随机生成）</label>
                  <input
                    value={handleInput}
                    onChange={(e) => setHandleInput(e.target.value)}
                    placeholder="匿名·青柠旅人#123"
                  />
                </div>
                <button className="btn primary" onClick={doRegister}>
                  用邀请码注册
                </button>
              </>
            ) : (
              <>
                <h2>登录</h2>
                <p className="sub">选择本设备已保存的匿名账号一键登录。</p>
                {authError && <div className="error">{authError}</div>}
                {accounts.length === 0 && (
                  <div className="muted">本设备还没有账号，去「注册」吧。</div>
                )}
                <div className="acct-list">
                  {accounts.map((a) => (
                    <div key={a.id} className="acct" onClick={() => loginWith(a.credential)}>
                      <span>{a.handle}</span>
                      <span className="meta">点击登录</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
