import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Hash, Plus, Send, Trash2, Users, X, ChevronRight, ChevronLeft,
  MessageSquare, Lock, Globe, UserPlus, UserMinus, AlertCircle, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './Forum.css';

// ── Token helpers ─────────────────────────────────────────
const getToken = () => localStorage.getItem('tedx_token');
const parseToken = () => {
  try {
    const t = getToken();
    if (!t) return {};
    return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return {}; }
};
const getRoleFromToken     = () => parseToken().role     || null;
const getUserIdFromToken   = () => parseToken().userId   || null;
const getUsernameFromToken = () => parseToken().username || null;

// ── Date / time ───────────────────────────────────────────
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const fmtDate = (iso) => {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const groupByDay = (messages) => {
  const groups = []; let lastDay = null;
  messages.forEach(m => {
    const day = new Date(m.createdAt).toDateString();
    if (day !== lastDay) {
      groups.push({ type: 'divider', label: fmtDate(m.createdAt), key: `div-${m.createdAt}` });
      lastDay = day;
    }
    groups.push({ type: 'message', ...m });
  });
  return groups;
};

// ── Avatar ────────────────────────────────────────────────
const Avatar = ({ name = '?', size = 32 }) => {
  const initials = name.slice(0, 2).toUpperCase();
  const hue = [...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
  return (
    <div className="forum-avatar"
      style={{ width: size, height: size, background: `hsl(${hue},50%,35%)`, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
};

// ══════════════════════════════════════════════════════════
// New Room Modal
// ══════════════════════════════════════════════════════════
const NewRoomModal = ({ onClose, onCreated, allUsers }) => {
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [selected,    setSelected]    = useState([]);
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  const currentUserId = getUserIdFromToken();
  const filtered = allUsers.filter(u =>
    u.id !== currentUserId &&
    u.username.toLowerCase().includes(search.toLowerCase())
  );
  const toggle = (u) =>
    setSelected(s => s.some(x => x.id === u.id) ? s.filter(x => x.id !== u.id) : [...s, u]);

  const handleCreate = async () => {
    if (!name.trim()) { setError('Room name is required'); return; }
    setLoading(true);
    try {
      const res = await authFetch('/api/forum/rooms', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), description: description.trim(), memberIds: selected.map(u => u.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create room');
      onCreated(data);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="forum-modal-overlay" onClick={onClose}>
      <div className="forum-modal" onClick={e => e.stopPropagation()}>
        <div className="forum-modal-header">
          <h3>Create New Room</h3>
          <button className="forum-modal-close" onClick={onClose}><X size={17} /></button>
        </div>

        {error && <div className="forum-modal-error"><AlertCircle size={14} />{error}</div>}

        <div className="forum-modal-body">
          <div className="form-group">
            <label>Room Name <span className="required">*</span></label>
            <input value={name} onChange={e => { setName(e.target.value); setError(null); }}
              placeholder="e.g. Volunteer Coordinators" autoFocus />
          </div>
          <div className="form-group">
            <label>Description <span className="optional">(optional)</span></label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What's this room for?" />
          </div>
          <div className="form-group">
            <label>Add Members</label>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search users…" className="forum-member-search" />
            <div className="forum-member-list">
              {filtered.length === 0
                ? <p className="forum-member-empty">No users found</p>
                : filtered.map(u => {
                    const checked = selected.some(x => x.id === u.id);
                    return (
                      <div key={u.id} className={`forum-member-row ${checked ? 'checked' : ''}`}
                        onClick={() => toggle(u)}>
                        <Avatar name={u.username} size={28} />
                        <span className="forum-member-name">{u.username}</span>
                        <span className="forum-member-role">{u.role}</span>
                        <div className={`forum-checkbox ${checked ? 'checked' : ''}`} />
                      </div>
                    );
                  })
              }
            </div>
            {selected.length > 0 && (
              <div className="forum-selected-chips">
                {selected.map(u => (
                  <span key={u.id} className="forum-chip">
                    {u.username}
                    <button onClick={() => toggle(u)}><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="forum-modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating…' : 'Create Room'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════
// Members Panel  (slide-in from right)
// ══════════════════════════════════════════════════════════
const MembersPanel = ({ room, onClose, allUsers, onMembersChanged }) => {
  const [members, setMembers] = useState([]);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);
  const currentUserId = getUserIdFromToken();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await authFetch(`/api/forum/rooms/${room.id}/members`);
    if (res.ok) setMembers(await res.json());
    setLoading(false);
  }, [room.id]);

  useEffect(() => { load(); }, [load]);

  const memberIds = new Set(members.map(m => m.id));
  const addable   = allUsers.filter(u =>
    !memberIds.has(u.id) &&
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  const addMember = async (u) => {
    const res = await authFetch(`/api/forum/rooms/${room.id}/members`, {
      method: 'POST', body: JSON.stringify({ userId: u.id }),
    });
    if (res.ok) { await load(); onMembersChanged(); }
  };

  const removeMember = async (userId) => {
    if (userId === currentUserId) return;
    const res = await authFetch(`/api/forum/rooms/${room.id}/members/${userId}`, { method: 'DELETE' });
    if (res.ok) { await load(); onMembersChanged(); }
  };

  return (
    <div className="forum-members-panel">
      <div className="forum-members-header">
        <span>Members</span>
        <button className="icon-btn" onClick={onClose}><X size={15} /></button>
      </div>

      {loading ? (
        <p className="forum-members-loading">Loading…</p>
      ) : (
        <>
          <div className="forum-members-section-label">In this room ({members.length})</div>
          <div className="forum-members-scroll">
            {members.map(m => (
              <div key={m.id} className="forum-members-row">
                <Avatar name={m.username} size={28} />
                <span className="forum-members-name">{m.username}</span>
                <span className="forum-members-role">{m.role}</span>
                {!room.isGeneral && m.id !== currentUserId && (
                  <button className="icon-btn danger" title="Remove" onClick={() => removeMember(m.id)}>
                    <UserMinus size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add member section — only for private rooms */}
          {!room.isGeneral && (
            <>
              <div className="forum-members-section-label" style={{ marginTop: '1rem' }}>
                Add member
              </div>
              <div style={{ padding: '0 0.75rem' }}>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search users…" className="forum-member-search" />
              </div>
              <div className="forum-members-scroll">
                {addable.length === 0
                  ? <p className="forum-member-empty">
                      {search ? 'No matching users' : 'Everyone is already a member'}
                    </p>
                  : addable.map(u => (
                      <div key={u.id} className="forum-members-row forum-add-row" onClick={() => addMember(u)}>
                        <Avatar name={u.username} size={28} />
                        <span className="forum-members-name">{u.username}</span>
                        <UserPlus size={14} className="forum-add-icon" />
                      </div>
                    ))
                }
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════
// Main Forum Page
// ══════════════════════════════════════════════════════════
const Forum = () => {
  const isAdmin   = getRoleFromToken() === 'admin';
  const currentId = getUserIdFromToken();

  const [rooms,        setRooms]        = useState([]);
  const [activeRoom,   setActiveRoom]   = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [draft,        setDraft]        = useState('');
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMsgs,  setLoadingMsgs]  = useState(false);
  const [allUsers,     setAllUsers]     = useState([]);
  const [showNewRoom,  setShowNewRoom]  = useState(false);
  const [showMembers,  setShowMembers]  = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(true);   // collapsible sidebar
  const [wsStatus,     setWsStatus]     = useState('disconnected');
  const [deletingRoom, setDeletingRoom] = useState(null);

  const wsRef          = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  // Keep a stable ref to activeRoom so WS handler can read current value
  const activeRoomRef  = useRef(null);
  activeRoomRef.current = activeRoom;

  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => { scrollToBottom(); }, [messages]);

  // ── Load rooms ─────────────────────────────────────────
  // Returns the fresh list so callers can act on it synchronously
  const loadRooms = useCallback(async () => {
    try {
      const res = await authFetch('/api/forum/rooms');
      if (!res.ok) return [];
      const data = await res.json();
      setRooms(data);
      return data;
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  // Initial load — auto-select General
  useEffect(() => {
    loadRooms().then(data => {
      if (data && data.length && !activeRoomRef.current) {
        setActiveRoom(data.find(r => r.isGeneral) || data[0]);
      }
    });
  }, []); // eslint-disable-line

  // ── Load all users for admin ────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    authFetch('/api/forum/users')
      .then(r => r.ok ? r.json() : [])
      .then(d => setAllUsers(d));
  }, [isAdmin]);

  // ── Load message history ────────────────────────────────
  useEffect(() => {
    if (!activeRoom) return;
    setMessages([]);
    setLoadingMsgs(true);
    authFetch(`/api/forum/rooms/${activeRoom.id}/messages?limit=50`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { setMessages(data); setLoadingMsgs(false); })
      .catch(() => setLoadingMsgs(false));
  }, [activeRoom?.id]); // eslint-disable-line

  // ── WebSocket ───────────────────────────────────────────
  useEffect(() => {
    if (!activeRoom) return;
    const token   = getToken();
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // Always connect same-origin to /ws. The reverse proxy upgrades it to the
    // backend WebSocket (Apache → 127.0.0.1:5000 in prod; the Vite dev-server
    // proxy in dev). Connecting to a bare host or :5000 fails behind Cloudflare.
    const wsUrl   = `${wsProto}://${window.location.host}/ws?token=${token}`;

    const ws      = new WebSocket(wsUrl);
    wsRef.current = ws;
    setWsStatus('connecting');

    ws.onopen = () => {
      setWsStatus('open');
      ws.send(JSON.stringify({ type: 'JOIN', roomId: activeRoomRef.current.id }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'MESSAGE') {
        setMessages(prev => [...prev, msg.message]);
      }
      if (msg.type === 'MESSAGE_DELETED') {
        setMessages(prev => prev.filter(m => m.id !== msg.messageId));
      }
      // Server broadcasts ROOMS_UPDATED when any membership changes —
      // this makes the room list live for all connected users including
      // non-admins who were just added to a private room.
      if (msg.type === 'ROOMS_UPDATED' || msg.type === 'MEMBER_ADDED' || msg.type === 'MEMBER_REMOVED') {
        loadRooms();
      }
    };

    ws.onclose = () => setWsStatus('disconnected');
    ws.onerror = () => setWsStatus('disconnected');
    return () => ws.close();
  }, [activeRoom?.id, loadRooms]);

  // ── Send ────────────────────────────────────────────────
  const sendMessage = () => {
    const body = draft.trim();
    if (!body || wsRef.current?.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ type: 'MESSAGE', body }));
    setDraft('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleDraftChange = (e) => {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const deleteMessage = (messageId) => {
    if (wsRef.current?.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ type: 'DELETE_MESSAGE', messageId }));
  };

  // ── Switch room ─────────────────────────────────────────
  const switchRoom = (room) => {
    if (room.id === activeRoom?.id) return;
    setShowMembers(false);
    setDeletingRoom(null);
    setActiveRoom(room);
  };

  // ── Delete room ─────────────────────────────────────────
  const deleteRoom = async (room) => {
    const res = await authFetch(`/api/forum/rooms/${room.id}`, { method: 'DELETE' });
    if (res.ok) {
      const updated = rooms.filter(r => r.id !== room.id);
      setRooms(updated);
      if (activeRoom?.id === room.id) {
        setActiveRoom(updated.find(r => r.isGeneral) || updated[0] || null);
      }
    }
    setDeletingRoom(null);
  };

  const grouped = groupByDay(messages);

  return (
    <div className="forum-page">

      {/* ── Rooms sidebar ──────────────────────────────── */}
      <div className={`forum-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        {sidebarOpen ? (
          <>
            <div className="forum-sidebar-header">
              <span>Forum</span>
              <div className="forum-sidebar-header-actions">
                {isAdmin && (
                  <button className="icon-btn" title="New room" onClick={() => setShowNewRoom(true)}>
                    <Plus size={15} />
                  </button>
                )}
                <button className="icon-btn" title="Collapse sidebar"
                  onClick={() => setSidebarOpen(false)}>
                  <PanelLeftClose size={15} />
                </button>
              </div>
            </div>

            <div className="forum-rooms-list">
              {loadingRooms
                ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="forum-room-sk" />)
                : rooms.map(room => (
                    <div key={room.id} className="forum-room-item">
                      {deletingRoom?.id === room.id ? (
                        <div className="forum-room-del-confirm">
                          <span>Delete "{room.name}"?</span>
                          <div className="forum-room-del-actions">
                            <button className="forum-del-yes" onClick={() => deleteRoom(room)}>Yes, delete</button>
                            <button className="forum-del-no"  onClick={() => setDeletingRoom(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className={`forum-room-btn ${activeRoom?.id === room.id ? 'active' : ''}`}
                          onClick={() => switchRoom(room)}
                        >
                          {room.isGeneral ? <Globe size={14} /> : <Lock size={14} />}
                          <span className="forum-room-name">{room.name}</span>
                          {isAdmin && !room.isGeneral && (
                            <span className="forum-room-del-icon" title="Delete room"
                              onClick={e => { e.stopPropagation(); setDeletingRoom(room); }}>
                              <Trash2 size={12} />
                            </span>
                          )}
                          <ChevronRight size={12} className="forum-room-arrow" />
                        </button>
                      )}
                    </div>
                  ))
              }
            </div>
          </>
        ) : (
          /* Collapsed state — icon-only */
          <div className="forum-sidebar-collapsed">
            <button className="icon-btn" title="Expand sidebar"
              onClick={() => setSidebarOpen(true)}>
              <PanelLeftOpen size={16} />
            </button>
            <div className="forum-sidebar-collapsed-rooms">
              {rooms.map(room => (
                <button key={room.id}
                  className={`forum-room-icon-btn ${activeRoom?.id === room.id ? 'active' : ''}`}
                  title={room.name}
                  onClick={() => switchRoom(room)}>
                  {room.isGeneral ? <Globe size={15} /> : <Lock size={15} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Chat area ──────────────────────────────────── */}
      <div className="forum-chat">
        {activeRoom ? (
          <>
            {/* Header */}
            <div className="forum-chat-header">
              <div className="forum-chat-header-left">
                {!sidebarOpen && (
                  <button className="icon-btn" style={{ marginRight: '0.25rem' }}
                    title="Show sidebar" onClick={() => setSidebarOpen(true)}>
                    <PanelLeftOpen size={16} />
                  </button>
                )}
                {activeRoom.isGeneral ? <Globe size={16} /> : <Lock size={16} />}
                <div>
                  <span className="forum-chat-title">{activeRoom.name}</span>
                  {activeRoom.description && (
                    <span className="forum-chat-desc">{activeRoom.description}</span>
                  )}
                </div>
              </div>
              <div className="forum-chat-header-right">
                <span className={`forum-ws-dot ${wsStatus}`} title={wsStatus} />
                {/* Members panel toggle — always show for admins */}
                {isAdmin && (
                  <button className={`icon-btn ${showMembers ? 'active-btn' : ''}`}
                    title="Manage members"
                    onClick={() => setShowMembers(s => !s)}>
                    <Users size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="forum-messages">
              {loadingMsgs ? (
                <div className="forum-messages-loading">Loading messages…</div>
              ) : messages.length === 0 ? (
                <div className="forum-messages-empty">
                  <MessageSquare size={32} />
                  <p>No messages yet — say hello!</p>
                </div>
              ) : (
                grouped.map(item => {
                  if (item.type === 'divider') {
                    return (
                      <div key={item.key} className="forum-day-divider">
                        <span>{item.label}</span>
                      </div>
                    );
                  }
                  const isOwn  = item.userId === currentId;
                  const canDel = isOwn || isAdmin;
                  return (
                    <div key={item.id} className={`forum-msg ${isOwn ? 'own' : ''}`}>
                      {!isOwn && <Avatar name={item.username} size={30} />}
                      <div className="forum-msg-content">
                        {!isOwn && <span className="forum-msg-author">{item.username}</span>}
                        <div className="forum-msg-bubble">
                          <span className="forum-msg-body">{item.body}</span>
                          <span className="forum-msg-time">{fmtTime(item.createdAt)}</span>
                          {canDel && (
                            <button className="forum-msg-del" title="Delete"
                              onClick={() => deleteMessage(item.id)}>
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                      {isOwn && <Avatar name={item.username} size={30} />}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="forum-input-bar">
              <textarea
                ref={inputRef}
                className="forum-input"
                placeholder={`Message #${activeRoom.name}… (Enter to send, Shift+Enter for newline)`}
                value={draft}
                onChange={handleDraftChange}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button
                className={`forum-send-btn ${draft.trim() ? 'active' : ''}`}
                onClick={sendMessage}
                disabled={!draft.trim() || wsStatus !== 'open'}
                title="Send (Enter)"
              >
                <Send size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className="forum-no-room">
            <Hash size={40} />
            <p>Select a room to start chatting</p>
          </div>
        )}
      </div>

      {/* ── Members panel ──────────────────────────────── */}
      {showMembers && activeRoom && isAdmin && (
        <MembersPanel
          room={activeRoom}
          allUsers={allUsers}
          onClose={() => setShowMembers(false)}
          onMembersChanged={loadRooms}
        />
      )}

      {/* ── New Room modal ──────────────────────────────── */}
      {showNewRoom && (
        <NewRoomModal
          allUsers={allUsers}
          onClose={() => setShowNewRoom(false)}
          onCreated={(room) => {
            // Re-fetch the full list so the new room shows with correct shape
            loadRooms().then(() => {
              setActiveRoom(room);
              setShowNewRoom(false);
            });
          }}
        />
      )}
    </div>
  );
};

export default Forum;
