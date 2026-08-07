"use client";

import { useCallback, useEffect, useState } from "react";

function fmt(t?: string | null) {
  if (!t) return "-";
  const d = new Date(t);
  return isNaN(d.getTime()) ? String(t) : d.toLocaleString("zh-CN");
}

export default function AdminDashboard() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [loginErr, setLoginErr] = useState("");

  const [stats, setStats] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  const [genCount, setGenCount] = useState(5);
  const [genResult, setGenResult] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // 消息检索
  const [searchQ, setSearchQ] = useState("");
  const [searchHandle, setSearchHandle] = useState("");
  const [searchRoom, setSearchRoom] = useState("");
  const [searchKind, setSearchKind] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  const checkAdmin = useCallback(async () => {
    const r = await fetch("/api/admin/me");
    const d = await r.json();
    setAdmin(!!d.admin);
  }, []);

  const loadAll = useCallback(async () => {
    const [s, rm, ms, ac] = await Promise.all([
      fetch("/api/admin/stats").then((r) => r.json()),
      fetch("/api/admin/rooms").then((r) => r.json()),
      fetch("/api/admin/messages").then((r) => r.json()),
      fetch("/api/admin/accounts").then((r) => r.json()),
    ]);
    setStats(s);
    setRooms(rm.rooms || []);
    setMessages(ms.messages || []);
    setAccounts(ac.accounts || []);
  }, []);

  useEffect(() => {
    checkAdmin();
  }, [checkAdmin]);

  useEffect(() => {
    if (admin) loadAll();
  }, [admin, loadAll]);

  async function doLogin() {
    setLoginErr("");
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminCode: code }),
    });
    if (!r.ok) {
      setLoginErr("管理员码错误");
      return;
    }
    setCode("");
    await checkAdmin();
  }

  async function doLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAdmin(false);
  }

  async function genCodes() {
    setBusy(true);
    const r = await fetch("/api/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: genCount }),
    });
    const d = await r.json();
    setGenResult(d.codes || []);
    setBusy(false);
    loadAll();
  }

  async function delRoom(id: string) {
    if (!confirm("确认删除该房间及其全部消息？")) return;
    await fetch(`/api/admin/rooms/${id}`, { method: "DELETE" });
    loadAll();
  }

  async function delMsg(seq: number) {
    await fetch(`/api/admin/messages/${seq}`, { method: "DELETE" });
    loadAll();
  }

  async function toggleBan(id: string, banned: boolean) {
    await fetch(`/api/admin/accounts/${id}?unban=${banned ? 1 : 0}`, {
      method: "DELETE",
    });
    loadAll();
  }

  async function doSearch() {
    setSearching(true);
    const params = new URLSearchParams();
    if (searchQ) params.set("q", searchQ);
    if (searchHandle) params.set("handle", searchHandle);
    if (searchRoom) params.set("room", searchRoom);
    if (searchKind) params.set("kind", searchKind);
    const r = await fetch(`/api/admin/messages/search?${params}`);
    const d = await r.json();
    setSearchResults(d.messages || []);
    setSearching(false);
  }

  function clearSearch() {
    setSearchQ("");
    setSearchHandle("");
    setSearchRoom("");
    setSearchKind("");
    setSearchResults(null);
  }

  if (admin === null) return <div className="admin-loading">检查权限中…</div>;

  if (!admin) {
    return (
      <div className="admin-login">
        <div className="card">
          <h2>管理后台</h2>
          <p className="sub">输入 ADMIN_CODE 进入。</p>
          {loginErr && <div className="error">{loginErr}</div>}
          <div className="field">
            <label>管理员码</label>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doLogin()}
            />
          </div>
          <button className="btn primary" onClick={doLogin}>
            登录
          </button>
          <a className="back-link" href="/">
            ← 返回聊天
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="admin">
      <header className="admin-header">
        <h1>管理后台</h1>
        <button className="btn ghost" onClick={doLogout}>
          退出管理
        </button>
        <a className="back-link" href="/">
          ← 返回聊天
        </a>
      </header>

      <section className="stats">
        {[
          ["注册账号", stats?.accounts],
          ["已封禁", stats?.banned],
          ["房间", stats?.rooms],
          ["私密房", stats?.privateRooms],
          ["消息总数", stats?.messages],
          ["焚毁中", stats?.burnMessages],
          ["注册邀请码", stats?.regInvites],
          ["已用注册码", stats?.regInvitesUsed],
          ["房间邀请码", stats?.roomInvites],
        ].map(([label, val]) => (
          <div key={label as string} className="stat-card">
            <div className="stat-val">{val ?? 0}</div>
            <div className="stat-label">{label as string}</div>
          </div>
        ))}
      </section>

      <section className="panel">
        <h3>生成注册邀请码</h3>
        <div className="row">
          <input
            type="number"
            min={1}
            max={50}
            value={genCount}
            onChange={(e) => setGenCount(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <button className="btn primary" onClick={genCodes} disabled={busy}>
            生成
          </button>
        </div>
        {genResult.length > 0 && (
          <div className="code-list">
            {genResult.map((c) => (
              <code key={c} className="code-chip">
                {c}
              </code>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>房间管理</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>消息</th>
              <th>成员</th>
              <th>创建</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.is_public ? "公开" : "🔒私密"}</td>
                <td>{r.msg_count}</td>
                <td>{r.member_count}</td>
                <td>{fmt(r.created_at)}</td>
                <td>
                  <button className="btn danger sm" onClick={() => delRoom(r.id)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>消息检索</h3>
        <div className="search-bar">
          <input
            type="text"
            placeholder="关键词（消息内容）"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <input
            type="text"
            placeholder="发送者昵称"
            value={searchHandle}
            onChange={(e) => setSearchHandle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <input
            type="text"
            placeholder="房间名"
            value={searchRoom}
            onChange={(e) => setSearchRoom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <select value={searchKind} onChange={(e) => setSearchKind(e.target.value)}>
            <option value="">全部类型</option>
            <option value="text">文本</option>
            <option value="image">图片</option>
            <option value="voice">语音</option>
            <option value="video">视频</option>
          </select>
          <button className="btn primary" onClick={doSearch} disabled={searching}>
            {searching ? "搜索中…" : "搜索"}
          </button>
          {searchResults && (
            <button className="btn ghost" onClick={clearSearch}>
              清除
            </button>
          )}
        </div>
        {searchResults && (
          <p className="muted" style={{ marginTop: 8 }}>
            找到 {searchResults.length} 条匹配消息
          </p>
        )}
      </section>

      <section className="panel">
        <h3>{searchResults ? "搜索结果" : "最近消息（100 条）"}</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>房间</th>
              <th>发送者</th>
              <th>类型</th>
              <th>内容</th>
              <th>时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(searchResults || messages).map((m) => (
              <tr key={m.seq}>
                <td>{m.room_name}{m.room_encrypted ? " 🔐" : ""}</td>
                <td>{m.handle || "匿名"}</td>
                <td>{m.kind}</td>
                <td className="msg-cell">
                  {m.kind === "text"
                    ? (m.room_encrypted ? "🔒 [加密内容]" : m.body)
                    : `📎 ${m.kind}`}
                </td>
                <td>{fmt(m.created_at)}</td>
                <td>
                  <button className="btn danger sm" onClick={() => delMsg(m.seq)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>账号管理</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>昵称</th>
              <th>注册码</th>
              <th>注册时间</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.handle}</td>
                <td>{a.invite_code || "-"}</td>
                <td>{fmt(a.created_at)}</td>
                <td>{a.banned ? "🔒封禁" : "正常"}</td>
                <td>
                  {a.banned ? (
                    <button className="btn sm" onClick={() => toggleBan(a.id, true)}>
                      解封
                    </button>
                  ) : (
                    <button className="btn danger sm" onClick={() => toggleBan(a.id, false)}>
                      封禁
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
