import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Hash, Plus, Send, Trash2, Users, X,
  MessageSquare, Lock, Globe, UserPlus, UserMinus, AlertCircle,
  PanelLeftClose, PanelLeftOpen, CheckSquare, Square, Edit2, ClipboardList,
  Bell, Paperclip, FileText, Image, Download, ChevronDown, ChevronUp,
} from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './Forum.css';

/* ── helpers ───────────────────────────────────────────── */
const getToken    = () => localStorage.getItem('tedx_token');
const parseToken  = () => { try { const t = getToken(); if (!t) return {}; return JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); } catch { return {}; } };
const getRole     = () => parseToken().role   || null;
const getUid      = () => parseToken().userId || null;
const fmtTime     = (iso) => new Date(iso).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
const fmtBytes    = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;
const fmtDate     = (iso) => {
  const d=new Date(iso),now=new Date();
  if(d.toDateString()===now.toDateString()) return 'Today';
  const y=new Date(now); y.setDate(now.getDate()-1);
  if(d.toDateString()===y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([],{month:'short',day:'numeric'});
};
const groupByDay  = (items) => {
  const out=[]; let last=null;
  items.forEach(m => {
    const day=new Date(m.createdAt).toDateString();
    if(day!==last){ out.push({_type:'divider',label:fmtDate(m.createdAt),key:`d-${m.createdAt}`}); last=day; }
    out.push({_type:'item',...m});
  });
  return out;
};

/* ── Avatar ─────────────────────────────────────────────── */
const Avatar = ({ name='?', size=32 }) => {
  const hue = [...(name||'?')].reduce((n,c)=>n+c.charCodeAt(0),0)%360;
  return <div className="forum-avatar" style={{width:size,height:size,background:`hsl(${hue},50%,35%)`,fontSize:size*.38}}>{(name||'?').slice(0,2).toUpperCase()}</div>;
};

/* ── File bubble ─────────────────────────────────────────── */
const FileBubble = ({ body }) => {
  let info;
  try { info = JSON.parse(body); } catch { return <span className="forum-msg-body">{body}</span>; }
  if (info.isImage) {
    return (
      <div className="forum-file-image-wrap">
        <img src={info.url} alt={info.originalName} className="forum-file-img"
          onClick={() => window.open(info.url, '_blank')} />
        <span className="forum-file-name">{info.originalName}</span>
      </div>
    );
  }
  return (
    <a href={info.url} target="_blank" rel="noopener noreferrer" className="forum-file-doc">
      <FileText size={22} className="forum-file-doc-icon" />
      <div className="forum-file-doc-info">
        <span className="forum-file-doc-name">{info.originalName}</span>
        <span className="forum-file-doc-size">{fmtBytes(info.size)}</span>
      </div>
      <Download size={15} className="forum-file-doc-dl" />
    </a>
  );
};

/* ══════════════════════════════════════════════════════════
   Task Card — compact, collapsible per-item
   ══════════════════════════════════════════════════════════ */
const TaskCard = ({ task, currentId, isAdmin, onCheck, onEdit }) => {
  const items   = task.items || [];
  const total   = items.length;
  const doneCount = items.filter(it =>
    (it.assigneeIds||[]).length > 0 && (it.assigneeIds||[]).every(id=>(it.checks||{})[id])
  ).length;
  const allDone = total > 0 && doneCount === total;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`forum-task-card ${allDone?'done':''}`}>
      {/* ── header ── */}
      <div className="forum-task-card-header">
        <ClipboardList size={14} className="forum-task-icon" />
        <span className="forum-task-card-title">Checklist</span>
        <span className="forum-task-progress">{doneCount}/{total}</span>
        <div className="forum-task-progress-bar">
          <div className="forum-task-progress-fill" style={{width:`${total?Math.round(doneCount/total*100):0}%`}} />
        </div>
        {isAdmin && (
          <button className="icon-btn" title="Edit" onClick={()=>onEdit(task)}><Edit2 size={12}/></button>
        )}
        <button className="icon-btn" onClick={()=>setCollapsed(c=>!c)} title={collapsed?'Expand':'Collapse'}>
          {collapsed ? <ChevronDown size={13}/> : <ChevronUp size={13}/>}
        </button>
      </div>

      {/* ── items list ── */}
      {!collapsed && (
        <div className="forum-task-items">
          {items.map((item, idx) => {
            const assignees   = item.assignees || (item.assigneeIds||[]).map(id=>({id,username:id}));
            const checks      = item.checks || {};
            const itemDone    = assignees.length>0 && assignees.every(u=>checks[u.id]);
            const iAmAssigned = (item.assigneeIds||[]).includes(currentId);

            return (
              <div key={item.id||idx} className={`forum-task-item ${itemDone?'done':''}`}>
                {/* item title row */}
                <div className="forum-task-item-title-row">
                  <span className={`forum-task-item-text ${itemDone?'strike':''}`}>{item.text}</span>
                </div>

                {/* per-assignee rows */}
                <div className="forum-task-assignee-rows">
                  {assignees.map(u => {
                    const done = checks[u.id];
                    const isMe = u.id === currentId;
                    return (
                      <div key={u.id} className={`forum-task-assignee-row ${done?'done':''}`}>
                        <button className="forum-task-check" disabled={!isMe}
                          title={isMe?(done?'Uncheck':'Check'):'Not assigned to you'}
                          onClick={()=>isMe&&onCheck(task.id, item.id)}>
                          {done ? <CheckSquare size={14}/> : <Square size={14}/>}
                        </button>
                        <Avatar name={u.username} size={18}/>
                        <span className="forum-task-uname">{u.username}</span>
                        {done && <span className="forum-task-done-tag">Done</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {allDone && !collapsed && <div className="forum-task-alldone">✓ All done</div>}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
   Task Modal — redesigned for many tasks + many people
   ══════════════════════════════════════════════════════════ */
const newItem = () => ({ _key: Math.random().toString(36).slice(2), id:null, text:'', assigneeIds:[] });

const TaskModal = ({ participants, onClose, onSave, existing }) => {
  const [items,   setItems]   = useState(() =>
    existing?.items?.length
      ? existing.items.map(it=>({_key:it.id||Math.random().toString(36).slice(2),id:it.id,text:it.text,assigneeIds:it.assigneeIds||[]}))
      : [newItem()]
  );
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [openIdx, setOpenIdx] = useState(0); // which item's assignee picker is open

  const updateText    = (key,val) => setItems(s=>s.map(it=>it._key===key?{...it,text:val}:it));
  const toggleAssignee= (key,uid) => setItems(s=>s.map(it=>{
    if(it._key!==key) return it;
    const has=it.assigneeIds.includes(uid);
    return {...it, assigneeIds: has?it.assigneeIds.filter(x=>x!==uid):[...it.assigneeIds,uid]};
  }));
  const addItem    = () => { setItems(s=>[...s,newItem()]); setOpenIdx(items.length); };
  const removeItem = (key,idx) => { setItems(s=>s.filter(it=>it._key!==key)); setOpenIdx(o=>Math.max(0,o-(idx<=o?1:0))); };

  const handleSave = async () => {
    setError(null);
    for(let i=0;i<items.length;i++){
      if(!items[i].text.trim()){setError(`Task ${i+1}: enter a description`);return;}
      if(!items[i].assigneeIds.length){setError(`Task ${i+1}: assign at least one person`);return;}
    }
    setLoading(true);
    try{ await onSave({items:items.map(it=>({id:it.id,text:it.text,assigneeIds:it.assigneeIds}))}); }
    catch(e){ setError(e.message); setLoading(false); }
  };

  return (
    <div className="forum-modal-overlay" onClick={onClose}>
      <div className="forum-modal forum-task-modal" onClick={e=>e.stopPropagation()}>
        <div className="forum-modal-header">
          <div className="forum-modal-header-inner">
            <ClipboardList size={16} style={{color:'var(--ted-red)',flexShrink:0}}/>
            <h3>{existing?'Edit Checklist':'New Checklist'}</h3>
          </div>
          <button className="forum-modal-close" onClick={onClose}><X size={17}/></button>
        </div>

        {error && <div className="forum-modal-error"><AlertCircle size={14}/>{error}</div>}

        <div className="forum-task-modal-body">
          {items.map((item,idx)=>{
            const isOpen = openIdx===idx;
            const assignedUsers = participants.filter(u=>item.assigneeIds.includes(u.id));
            return (
              <div key={item._key} className="forum-task-modal-row">
                {/* row header: index + remove */}
                <div className="forum-task-modal-row-hd">
                  <span className="forum-task-modal-row-num">{idx+1}</span>
                  {items.length>1 && <button className="icon-btn" onClick={()=>removeItem(item._key,idx)} title="Remove"><Trash2 size={12}/></button>}
                </div>

                {/* task text */}
                <input className="forum-task-modal-input"
                  value={item.text}
                  onChange={e=>updateText(item._key,e.target.value)}
                  placeholder="What needs to be done?"
                  autoFocus={idx===0&&!existing}
                />

                {/* assignee selector */}
                <button className="forum-task-assign-trigger"
                  onClick={()=>setOpenIdx(o=>o===idx?-1:idx)}>
                  {assignedUsers.length===0
                    ? <><UserPlus size={13}/> <span>Assign to…</span></>
                    : <><div className="forum-task-assigned-avatars">
                          {assignedUsers.slice(0,4).map(u=><Avatar key={u.id} name={u.username} size={20}/>)}
                          {assignedUsers.length>4 && <span className="forum-task-more-badge">+{assignedUsers.length-4}</span>}
                        </div>
                        <span className="forum-task-assigned-names">
                          {assignedUsers.slice(0,2).map(u=>u.username).join(', ')}{assignedUsers.length>2?` +${assignedUsers.length-2} more`:''}
                        </span>
                      </>
                  }
                  <ChevronDown size={12} className={`forum-task-assign-chevron ${isOpen?'open':''}`}/>
                </button>

                {isOpen && (
                  <div className="forum-task-assignee-picker">
                    {participants.length===0
                      ? <p className="forum-member-empty">No members available</p>
                      : participants.map(u=>{
                          const on = item.assigneeIds.includes(u.id);
                          return (
                            <div key={u.id} className={`forum-task-picker-row ${on?'on':''}`}
                              onClick={()=>toggleAssignee(item._key,u.id)}>
                              <Avatar name={u.username} size={24}/>
                              <span className="forum-task-picker-name">{u.username}</span>
                              <span className="forum-task-picker-role">{u.role}</span>
                              <div className={`forum-checkbox ${on?'checked':''}`}/>
                            </div>
                          );
                        })
                    }
                  </div>
                )}
              </div>
            );
          })}

          <button className="forum-task-add-row-btn" onClick={addItem}>
            <Plus size={13}/> Add task
          </button>
        </div>

        <div className="forum-modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave} disabled={loading}>
            {loading?'Posting…':existing?'Save Changes':`Post ${items.length} task${items.length!==1?'s':''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
   New Room Modal
   ══════════════════════════════════════════════════════════ */
const NewRoomModal = ({ onClose, onCreated, allUsers }) => {
  const [name,setName]=useState(''); const [desc,setDesc]=useState('');
  const [sel,setSel]=useState([]); const [search,setSearch]=useState('');
  const [loading,setLoading]=useState(false); const [error,setError]=useState(null);
  const uid=getUid();
  const filtered=allUsers.filter(u=>u.id!==uid&&u.username.toLowerCase().includes(search.toLowerCase()));
  const toggle=u=>setSel(s=>s.some(x=>x.id===u.id)?s.filter(x=>x.id!==u.id):[...s,u]);
  const go=async()=>{
    if(!name.trim()){setError('Room name is required');return;}
    setLoading(true);
    try{
      const res=await authFetch('/api/forum/rooms',{method:'POST',body:JSON.stringify({name:name.trim(),description:desc.trim(),memberIds:sel.map(u=>u.id)})});
      const d=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(d.error||'Failed');
      onCreated(d);
    }catch(e){setError(e.message);setLoading(false);}
  };
  return (
    <div className="forum-modal-overlay" onClick={onClose}>
      <div className="forum-modal" onClick={e=>e.stopPropagation()}>
        <div className="forum-modal-header"><h3>Create New Room</h3><button className="forum-modal-close" onClick={onClose}><X size={17}/></button></div>
        {error&&<div className="forum-modal-error"><AlertCircle size={14}/>{error}</div>}
        <div className="forum-modal-body">
          <div className="form-group"><label>Room Name <span className="required">*</span></label>
            <input value={name} onChange={e=>{setName(e.target.value);setError(null);}} placeholder="e.g. Volunteer Coordinators" autoFocus/></div>
          <div className="form-group"><label>Description <span className="optional">(optional)</span></label>
            <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What's this room for?"/></div>
          <div className="form-group"><label>Add Members</label>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search users…" className="forum-member-search"/>
            <div className="forum-member-list">
              {filtered.length===0?<p className="forum-member-empty">No users found</p>
                :filtered.map(u=>{const on=sel.some(x=>x.id===u.id);return(
                  <div key={u.id} className={`forum-member-row ${on?'checked':''}`} onClick={()=>toggle(u)}>
                    <Avatar name={u.username} size={28}/><span className="forum-member-name">{u.username}</span>
                    <span className="forum-member-role">{u.role}</span><div className={`forum-checkbox ${on?'checked':''}`}/>
                  </div>);})}
            </div>
            {sel.length>0&&<div className="forum-selected-chips">{sel.map(u=><span key={u.id} className="forum-chip">{u.username}<button onClick={()=>toggle(u)}><X size={10}/></button></span>)}</div>}
          </div>
        </div>
        <div className="forum-modal-footer"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={go} disabled={loading}>{loading?'Creating…':'Create Room'}</button></div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
   Members Panel
   ══════════════════════════════════════════════════════════ */
const MembersPanel=({room,onClose,allUsers,onMembersChanged})=>{
  const [members,setMembers]=useState([]); const [search,setSearch]=useState(''); const [loading,setLoading]=useState(true);
  const uid=getUid();
  const load=useCallback(async()=>{
    setLoading(true);
    const r=await authFetch(room.isGeneral?'/api/forum/users':`/api/forum/rooms/${room.id}/members`);
    if(r.ok) setMembers(await r.json());
    setLoading(false);
  },[room.id,room.isGeneral]);
  useEffect(()=>{load();},[load]);
  const mids=new Set(members.map(m=>m.id));
  const addable=allUsers.filter(u=>!mids.has(u.id)&&u.username.toLowerCase().includes(search.toLowerCase()));
  const add=async u=>{const r=await authFetch(`/api/forum/rooms/${room.id}/members`,{method:'POST',body:JSON.stringify({userId:u.id})});if(r.ok){await load();onMembersChanged();}};
  const rem=async id=>{if(id===uid)return;const r=await authFetch(`/api/forum/rooms/${room.id}/members/${id}`,{method:'DELETE'});if(r.ok){await load();onMembersChanged();}};
  return(
    <div className="forum-members-panel">
      <div className="forum-members-header"><span>{room.isGeneral?'All Users':'Members'}</span><button className="icon-btn" onClick={onClose}><X size={15}/></button></div>
      {loading?<p className="forum-members-loading">Loading…</p>:(
        <>
          <div className="forum-members-section-label">{room.isGeneral?'All users':'In this room'} ({members.length})</div>
          <div className="forum-members-scroll">
            {members.length===0?<p className="forum-member-empty">No members</p>:members.map(m=>(
              <div key={m.id} className="forum-members-row">
                <Avatar name={m.username} size={28}/><span className="forum-members-name">{m.username}</span>
                <span className="forum-members-role">{m.role}</span>
                {!room.isGeneral&&m.id!==uid&&<button className="icon-btn danger" onClick={()=>rem(m.id)}><UserMinus size={13}/></button>}
              </div>
            ))}
          </div>
          {!room.isGeneral&&(<>
            <div className="forum-members-section-label" style={{marginTop:'1rem'}}>Add member</div>
            <div style={{padding:'0 .75rem'}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="forum-member-search"/></div>
            <div className="forum-members-scroll">
              {addable.length===0?<p className="forum-member-empty">{search?'No match':'Everyone is a member'}</p>
                :addable.map(u=><div key={u.id} className="forum-members-row forum-add-row" onClick={()=>add(u)}>
                  <Avatar name={u.username} size={28}/><span className="forum-members-name">{u.username}</span><UserPlus size={14} className="forum-add-icon"/>
                </div>)}
            </div>
          </>)}
        </>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════ */
const Forum = () => {
  const isAdmin   = getRole()==='admin';
  const currentId = getUid();

  const [rooms,setRooms]               = useState([]);
  const [activeRoom,setActiveRoom]     = useState(null);
  const [messages,setMessages]         = useState([]);
  const [taskMap,setTaskMap]           = useState({});
  const [draft,setDraft]               = useState('');
  const [loadingRooms,setLoadingRooms] = useState(true);
  const [loadingMsgs,setLoadingMsgs]   = useState(false);
  const [allUsers,setAllUsers]         = useState([]);
  const [participants,setParticipants] = useState([]);
  const [showNewRoom,setShowNewRoom]   = useState(false);
  const [showMembers,setShowMembers]   = useState(false);
  const [showTask,setShowTask]         = useState(false);
  const [editingTask,setEditingTask]   = useState(null);
  const [sidebarOpen,setSidebarOpen]   = useState(true);
  const [mobileSide,setMobileSide]     = useState(false);
  const [wsStatus,setWsStatus]         = useState('disconnected');
  const [deletingRoom,setDeletingRoom] = useState(null);
  const [doneToast,setDoneToast]       = useState(null);
  const [uploading,setUploading]       = useState(false);
  // Notifications: { id, type, text, roomId, roomName, taskId, read }
  const [notifs,setNotifs]             = useState([]);
  const [showNotifs,setShowNotifs]     = useState(false);
  // My pending tasks in active room
  const [myPendingTasks,setMyPendingTasks] = useState([]);

  const wsRef          = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const fileInputRef   = useRef(null);
  const activeRoomRef  = useRef(null);
  const msgRefs        = useRef({});   // messageId → DOM element
  const notifPanelRef  = useRef(null); // for click-outside close
  activeRoomRef.current = activeRoom;

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({behavior:'smooth'});
  useEffect(()=>{scrollToBottom();},[messages]);

  // Close notification panel when clicking outside
  useEffect(()=>{
    if(!showNotifs) return;
    const handler=(e)=>{ if(notifPanelRef.current&&!notifPanelRef.current.contains(e.target)) setShowNotifs(false); };
    document.addEventListener('mousedown',handler);
    return()=>document.removeEventListener('mousedown',handler);
  },[showNotifs]);

  // Scroll to a specific message by id, then flash-highlight it
  const [highlightId, setHighlightId] = useState(null);
  const scrollToMessage = useCallback((messageId) => {
    const el = msgRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightId(messageId);
      setTimeout(() => setHighlightId(null), 1800);
    }
  }, []);

  const loadRooms=useCallback(async()=>{
    try{const r=await authFetch('/api/forum/rooms');if(!r.ok)return[];const d=await r.json();setRooms(d);return d;}
    finally{setLoadingRooms(false);}
  },[]);

  useEffect(()=>{loadRooms().then(d=>{if(d?.length&&!activeRoomRef.current)setActiveRoom(d.find(r=>r.isGeneral)||d[0]);});},[]);// eslint-disable-line

  useEffect(()=>{if(!isAdmin)return;authFetch('/api/forum/users').then(r=>r.ok?r.json():[]).then(setAllUsers);},[isAdmin]);

  useEffect(()=>{
    if(!activeRoom)return;
    authFetch(`/api/forum/rooms/${activeRoom.id}/participants`).then(r=>r.ok?r.json():[]).then(setParticipants);
  },[activeRoom?.id]);// eslint-disable-line

  useEffect(()=>{
    if(!activeRoom)return;
    setMessages([]);setTaskMap({});setLoadingMsgs(true);
    Promise.all([
      authFetch(`/api/forum/rooms/${activeRoom.id}/messages?limit=50`).then(r=>r.ok?r.json():[]),
      authFetch(`/api/forum/rooms/${activeRoom.id}/tasks`).then(r=>r.ok?r.json():[]),
    ]).then(([msgs,tasks])=>{
      setMessages(msgs);
      const tmap={};tasks.forEach(t=>{tmap[t.id]=t;});setTaskMap(tmap);
      // Compute my unchecked items in this room for the banner
      const pending=tasks.flatMap(t=>(t.items||[]).filter(it=>(it.assigneeIds||[]).includes(currentId)&&!(it.checks||{})[currentId]).map(it=>({taskId:t.id,text:it.text})));
      setMyPendingTasks(pending);
      setLoadingMsgs(false);
    }).catch(()=>setLoadingMsgs(false));
  },[activeRoom?.id]);// eslint-disable-line

  useEffect(()=>{
    if(!activeRoom)return;
    const token=getToken();
    const proto=window.location.protocol==='https:'?'wss':'ws';
    const url=`${proto}://${window.location.host}/ws?token=${token}`;
    const ws=new WebSocket(url);
    wsRef.current=ws; setWsStatus('connecting');
    ws.onopen=()=>{ setWsStatus('open'); ws.send(JSON.stringify({type:'JOIN',roomId:activeRoomRef.current.id})); };
    ws.onmessage=e=>{
      const msg=JSON.parse(e.data);
      if(msg.type==='MESSAGE')      setMessages(p=>[...p,msg.message]);
      if(msg.type==='TASK')         { setMessages(p=>[...p,msg.message]); setTaskMap(p=>({...p,[msg.task.id]:msg.task})); }
      if(msg.type==='TASK_UPDATED') {
        setTaskMap(p=>{
          const updated={...p,[msg.task.id]:msg.task};
          // Recompute pending tasks
          const pending=Object.values(updated).flatMap(t=>(t.items||[]).filter(it=>(it.assigneeIds||[]).includes(currentId)&&!(it.checks||{})[currentId]).map(it=>({taskId:t.id,text:it.text})));
          setMyPendingTasks(pending);
          return updated;
        });
        if(msg.allDone){
          // Find the task's companion message id for scroll-to
          const taskMsgId = messages.find(m=>m.type==='TASK'&&m.taskId===msg.task.id)?.id || null;
          const notif = { id: Date.now(), type:'done', text:`All tasks done: "${msg.task.items?.[0]?.text||'Task'}"`, taskId:msg.task.id, messageId:taskMsgId, roomId:activeRoomRef.current?.id, roomName:activeRoomRef.current?.name, read:false };
          setNotifs(p=>[notif,...p.slice(0,19)]);
          setDoneToast({title:msg.task.items?.[0]?.text||'Task'});
          setTimeout(()=>setDoneToast(null),4500);
        }
      }
      if(msg.type==='TASK_ALL_DONE'&&isAdmin){
        const notif = { id: Date.now(), type:'done', text:`All tasks done: "${msg.title}"`, taskId:msg.taskId, messageId:null, roomId:msg.roomId, read:false };
        setNotifs(p=>[notif,...p.slice(0,19)]);
        setDoneToast({title:msg.title});
        setTimeout(()=>setDoneToast(null),5000);
      }
      // Notify assigned user that they have a new task
      if(msg.type==='TASK_ASSIGNED'){
        const notif = { id: Date.now(), type:'assigned', text:`You were assigned: "${msg.preview}"`, taskId:msg.taskId, messageId:msg.messageId||null, roomId:msg.roomId, roomName:msg.roomName||'a room', read:false };
        setNotifs(p=>[notif,...p.slice(0,19)]);
      }
      if(msg.type==='MESSAGE_DELETED') setMessages(p=>p.filter(m=>m.id!==msg.messageId));
      if(msg.type==='ROOMS_UPDATED')   loadRooms();
    };
    ws.onclose=()=>setWsStatus('disconnected');
    ws.onerror=()=>setWsStatus('disconnected');
    return()=>ws.close();
  },[activeRoom?.id,loadRooms,isAdmin]);

  const sendMessage=()=>{
    const body=draft.trim();
    if(!body||wsRef.current?.readyState!==1)return;
    wsRef.current.send(JSON.stringify({type:'MESSAGE',body}));
    setDraft('');
    if(inputRef.current)inputRef.current.style.height='auto';
    inputRef.current?.focus();
  };
  const handleKD=(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}};
  const handleDC=(e)=>{setDraft(e.target.value);const el=e.target;el.style.height='auto';el.style.height=Math.min(el.scrollHeight,120)+'px';};
  const delMsg=(id)=>{if(wsRef.current?.readyState!==1)return;wsRef.current.send(JSON.stringify({type:'DELETE_MESSAGE',messageId:id}));};

  /* ── file upload ─────────────────────────────────────── */
  const handleFileChange=async(e)=>{
    const file=e.target.files?.[0]; if(!file||!activeRoom)return;
    e.target.value='';
    setUploading(true);
    try{
      const fd=new FormData(); fd.append('file',file);
      const token=getToken();
      const res=await fetch(`/api/forum/rooms/${activeRoom.id}/upload`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});
      if(!res.ok){const d=await res.json().catch(()=>({}));alert(d.error||'Upload failed');}
    }catch(err){alert(err.message||'Upload failed');}
    finally{setUploading(false);}
  };

  /* ── tasks ───────────────────────────────────────────── */
  const createTask=async({items})=>{
    const r=await authFetch(`/api/forum/rooms/${activeRoom.id}/tasks`,{method:'POST',body:JSON.stringify({items})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Failed');
    setShowTask(false);
  };
  const editTask=async({items})=>{
    const r=await authFetch(`/api/forum/tasks/${editingTask.id}`,{method:'PUT',body:JSON.stringify({items})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Failed');
    setEditingTask(null);
  };
  const check=(taskId,itemId)=>authFetch(`/api/forum/tasks/${taskId}/check`,{method:'PATCH',body:JSON.stringify({itemId})});

  /* ── room management ─────────────────────────────────── */
  const switchRoom=(room)=>{
    if(room.id===activeRoom?.id)return;
    setShowMembers(false);setDeletingRoom(null);setActiveRoom(room);setMobileSide(false);
    setHighlightId(null);
    msgRefs.current={};
  };
  const delRoom=async(room)=>{
    const r=await authFetch(`/api/forum/rooms/${room.id}`,{method:'DELETE'});
    if(r.ok){const u=rooms.filter(x=>x.id!==room.id);setRooms(u);if(activeRoom?.id===room.id)setActiveRoom(u.find(x=>x.isGeneral)||u[0]||null);}
    setDeletingRoom(null);
  };

  const grouped=groupByDay(messages);

  return (
    <div className="forum-page">
      {mobileSide&&<div className="forum-mobile-backdrop" onClick={()=>setMobileSide(false)}/>}

      {/* ══ SIDEBAR ══════════════════════════════════════ */}
      <div className={`forum-sidebar ${sidebarOpen?'open':'collapsed'} ${mobileSide?'mobile-open':''}`}>
        <div className="forum-sidebar-inner">
          <div className="forum-sidebar-header">
            <span className="forum-sidebar-title">Forum</span>
            <div className="forum-sidebar-header-actions">
              {isAdmin&&<button className="icon-btn" title="New room" onClick={()=>{setShowNewRoom(true);setMobileSide(false);}}><Plus size={15}/></button>}
              <button className="icon-btn forum-sidebar-collapse-btn" onClick={()=>setSidebarOpen(false)}><PanelLeftClose size={15}/></button>
              <button className="icon-btn forum-sidebar-mobile-close" onClick={()=>setMobileSide(false)}><X size={15}/></button>
            </div>
          </div>
          <div className="forum-rooms-list">
            {loadingRooms
              ? Array.from({length:3}).map((_,i)=><div key={i} className="forum-room-sk"/>)
              : rooms.map(room=>(
                  <div key={room.id} className="forum-room-item">
                    {deletingRoom?.id===room.id?(
                      <div className="forum-room-del-confirm">
                        <span>Delete "{room.name}"?</span>
                        <div className="forum-room-del-actions">
                          <button className="forum-del-yes" onClick={()=>delRoom(room)}>Delete</button>
                          <button className="forum-del-no" onClick={()=>setDeletingRoom(null)}>Cancel</button>
                        </div>
                      </div>
                    ):(
                      <button className={`forum-room-btn ${activeRoom?.id===room.id?'active':''}`} onClick={()=>switchRoom(room)}>
                        {room.isGeneral?<Globe size={14}/>:<Lock size={14}/>}
                        <span className="forum-room-name">{room.name}</span>
                        {isAdmin&&!room.isGeneral&&(
                          <span className="forum-room-del-icon" onClick={e=>{e.stopPropagation();setDeletingRoom(room);}}><Trash2 size={12}/></span>
                        )}
                      </button>
                    )}
                  </div>
                ))
            }
          </div>
        </div>
        <div className="forum-sidebar-strip">
          <button className="icon-btn" title="Expand" onClick={()=>setSidebarOpen(true)}><PanelLeftOpen size={16}/></button>
          {rooms.map(r=><button key={r.id} className={`forum-room-icon-btn ${activeRoom?.id===r.id?'active':''}`} title={r.name} onClick={()=>switchRoom(r)}>{r.isGeneral?<Globe size={15}/>:<Lock size={15}/>}</button>)}
        </div>
      </div>

      {/* ══ CHAT ════════════════════════════════════════ */}
      <div className="forum-chat">
        {activeRoom?(
          <>
            {/* header */}
            <div className="forum-chat-header">
              <div className="forum-chat-header-left">
                <button className="icon-btn forum-mobile-menu-btn" onClick={()=>setMobileSide(true)}><Hash size={18}/></button>
                {!sidebarOpen&&<button className="icon-btn forum-desktop-expand-btn" onClick={()=>setSidebarOpen(true)}><PanelLeftOpen size={16}/></button>}
                {activeRoom.isGeneral?<Globe size={15} className="forum-header-icon"/>:<Lock size={15} className="forum-header-icon"/>}
                <div className="forum-header-text">
                  <span className="forum-chat-title">{activeRoom.name}</span>
                  {activeRoom.description&&<span className="forum-chat-desc">{activeRoom.description}</span>}
                </div>
              </div>
              <div className="forum-chat-header-right">
                <span className={`forum-ws-dot ${wsStatus}`} title={wsStatus}/>
                {/* Notification bell — everyone sees it */}
                <div className="forum-notif-wrap">
                  <button className={`icon-btn forum-notif-btn ${notifs.some(n=>!n.read)?'has-unread':''}`}
                    title="Notifications" onClick={()=>setShowNotifs(s=>!s)}>
                    <Bell size={16}/>
                    {notifs.filter(n=>!n.read).length>0 && (
                      <span className="forum-notif-badge">{Math.min(notifs.filter(n=>!n.read).length,9)}</span>
                    )}
                  </button>
                  {showNotifs && (
                    <div className="forum-notif-dropdown" ref={notifPanelRef}>
                      <div className="forum-notif-header">
                        <span>Notifications</span>
                        {notifs.length>0 && (
                          <button className="forum-notif-clear" onClick={()=>{setNotifs([]);setShowNotifs(false);}}>Clear all</button>
                        )}
                      </div>
                      <div className="forum-notif-list">
                        {notifs.length===0
                          ? <p className="forum-notif-empty">No notifications yet</p>
                          : notifs.map(n=>(
                              <div key={n.id} className={`forum-notif-item ${n.read?'read':''} ${n.type==='done'?'type-done':'type-assigned'}`}
                                onClick={async ()=>{
                                  // Mark read
                                  setNotifs(p=>p.map(x=>x.id===n.id?{...x,read:true}:x));
                                  setShowNotifs(false);
                                  // Navigate to the room
                                  const room=rooms.find(r=>r.id===n.roomId);
                                  if(room && room.id !== activeRoomRef.current?.id) {
                                    switchRoom(room);
                                    // Wait for messages to load then scroll
                                    if(n.messageId) {
                                      setTimeout(()=>scrollToMessage(n.messageId), 600);
                                    }
                                  } else if(n.messageId) {
                                    scrollToMessage(n.messageId);
                                  }
                                }}>
                                <div className={`forum-notif-dot ${n.type}`}/>
                                <div className="forum-notif-text">
                                  <span>{n.text}</span>
                                  {n.roomName && <span className="forum-notif-room">#{n.roomName}</span>}
                                </div>
                                {!n.read && <div className="forum-notif-unread-dot"/>}
                              </div>
                            ))
                        }
                      </div>
                    </div>
                  )}
                </div>
                {isAdmin&&<button className={`icon-btn ${showMembers?'active-btn':''}`} title="Members" onClick={()=>setShowMembers(s=>!s)}><Users size={16}/></button>}
              </div>
            </div>

            {/* Pending tasks banner for this user */}
            {myPendingTasks.length>0 && (
              <div className="forum-pending-banner">
                <ClipboardList size={14}/>
                <span>You have <strong>{myPendingTasks.length}</strong> pending task{myPendingTasks.length!==1?'s':''} in this room</span>
                <span className="forum-pending-tasks-preview">
                  {myPendingTasks.slice(0,2).map(t=>t.text).join(' · ')}{myPendingTasks.length>2?` +${myPendingTasks.length-2} more`:''}
                </span>
              </div>
            )}

            {/* messages */}
            <div className="forum-messages">
              {loadingMsgs?(
                <div className="forum-messages-loading">Loading…</div>
              ):messages.length===0?(
                <div className="forum-messages-empty"><MessageSquare size={32}/><p>No messages yet — say hello!</p></div>
              ):(
                grouped.map(item=>{
                  if(item._type==='divider') return <div key={item.key} className="forum-day-divider"><span>{item.label}</span></div>;
                  if(item.type==='TASK'&&item.taskId&&taskMap[item.taskId]){
                    const isOwnTask = item.userId === currentId;
                    return(
                      <div key={item.id}
                        ref={el=>{ if(el) msgRefs.current[item.id]=el; else delete msgRefs.current[item.id]; }}
                        className={`forum-msg-task-wrap ${isOwnTask?'own':''} ${highlightId===item.id?'highlight':''}`}>
                        <TaskCard task={taskMap[item.taskId]} currentId={currentId} isAdmin={isAdmin} onCheck={check} onEdit={t=>setEditingTask(t)}/>
                        <span className="forum-task-meta">{item.username} · {fmtTime(item.createdAt)}</span>
                      </div>
                    );
                  }
                  const isOwn=item.userId===currentId, canDel=isOwn||isAdmin;
                  return(
                    <div key={item.id}
                      ref={el=>{ if(el) msgRefs.current[item.id]=el; else delete msgRefs.current[item.id]; }}
                      className={`forum-msg ${isOwn?'own':''} ${highlightId===item.id?'highlight':''}`}>
                      {!isOwn&&<Avatar name={item.username} size={30}/>}
                      <div className="forum-msg-content">
                        {!isOwn&&<span className="forum-msg-author">{item.username}</span>}
                        <div className={`forum-msg-bubble ${item.type==='FILE'?'file-bubble':''}`}>
                          {item.type==='FILE'?<FileBubble body={item.body}/>:<span className="forum-msg-body">{item.body}</span>}
                          <span className="forum-msg-time">{fmtTime(item.createdAt)}</span>
                          {canDel&&<button className="forum-msg-del" onClick={()=>delMsg(item.id)}><Trash2 size={11}/></button>}
                        </div>
                      </div>
                      {isOwn&&<Avatar name={item.username} size={30}/>}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef}/>
            </div>

            {/* input bar */}
            <div className="forum-input-bar">
              {/* hidden file input */}
              <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                style={{display:'none'}} onChange={handleFileChange}/>
              <button className="forum-attach-btn" title="Attach file"
                disabled={uploading} onClick={()=>fileInputRef.current?.click()}>
                {uploading ? <span className="forum-attach-spinner"/> : <Paperclip size={16}/>}
              </button>
              <button className="forum-task-btn" title="Add checklist" onClick={()=>setShowTask(true)}>
                <ClipboardList size={16}/>
              </button>
              <textarea ref={inputRef} className="forum-input"
                placeholder={`Message #${activeRoom.name}…`}
                value={draft} onChange={handleDC} onKeyDown={handleKD} rows={1}/>
              <button className={`forum-send-btn ${draft.trim()?'active':''}`}
                onClick={sendMessage} disabled={!draft.trim()||wsStatus!=='open'}>
                <Send size={16}/>
              </button>
            </div>
          </>
        ):(
          <div className="forum-no-room"><Hash size={40}/><p>Select a room to start chatting</p></div>
        )}
      </div>

      {/* ══ MEMBERS PANEL ═══════════════════════════════ */}
      {showMembers&&activeRoom&&isAdmin&&(
        <MembersPanel room={activeRoom} allUsers={allUsers} onClose={()=>setShowMembers(false)} onMembersChanged={loadRooms}/>
      )}

      {/* ══ MODALS ══════════════════════════════════════ */}
      {showNewRoom&&<NewRoomModal allUsers={allUsers} onClose={()=>setShowNewRoom(false)} onCreated={room=>{loadRooms().then(()=>{setActiveRoom(room);setShowNewRoom(false);});}}/>}
      {showTask&&activeRoom&&<TaskModal participants={participants} onClose={()=>setShowTask(false)} onSave={createTask}/>}
      {editingTask&&<TaskModal participants={participants} existing={editingTask} onClose={()=>setEditingTask(null)} onSave={editTask}/>}

      {/* ══ TOAST ═══════════════════════════════════════ */}
      {doneToast&&(
        <div className="forum-toast">
          <Bell size={15}/>
          <span>All done: <strong>{doneToast.title}</strong></span>
          <button onClick={()=>setDoneToast(null)}><X size={13}/></button>
        </div>
      )}
    </div>
  );
};

export default Forum;
