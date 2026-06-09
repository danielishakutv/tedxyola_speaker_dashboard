import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketServer } from 'ws';
import http from 'http';

dotenv.config();

const app    = express();
const prisma = new PrismaClient();

// Safe activity logger. Audit logging must NEVER break the operation it records:
// a logging failure (or a stale session token with no userId) used to bubble up
// and turn a successful update into a 500. This swallows those failures and skips
// logging when there is no actor. Accepts the same shape as prisma.activity.create.
const logActivity = async (args) => {
  try {
    if (!args?.data?.userId) return; // stale token / no actor — nothing to attribute
    await prisma.activity.create(args);
  } catch (e) {
    console.error('activity log failed (non-fatal):', e.message);
  }
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Uploads directory ─────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve uploaded files as static — /uploads/filename.jpg
app.use('/uploads', express.static(uploadsDir));

// ── Multer — memory storage for speaker images (URL input fallback)
const upload = multer({ storage: multer.memoryStorage() });

// ── Multer — disk storage for media library uploads
const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});
const mediaUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const uploadToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    // Cloudinary not configured — reject immediately so callers fall back to placeholder
    reject(new Error('Cloudinary not configured'));
  });

// ── JWT Auth Middleware───────────────────────────────────
const requireAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — no token' });
  }
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
  }
};

// ── Admin-only guard — use AFTER requireAuth ──────────────
// Sensitive areas (e.g. Accounts/Finance) are restricted to admins.
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden — admin access required' });
  }
  next();
};

// ── Roles & member permissions ────────────────────────────
// Three roles: admin (everything), editor (content staff), member (volunteer).
// "Staff" = admin or editor — they can create/edit/delete content. Members are
// limited to whatever the admin enables in the global member-permission toggles.
const STAFF_ROLES = ['admin', 'editor'];
const isStaff = (role) => STAFF_ROLES.includes(role);

// Member capability keys + their defaults (all on). Stored as JSON under the
// "member_permissions" Setting key. Cached in memory; cache busted on update.
const MEMBER_CAPABILITIES = ['viewContent', 'manageLinks', 'forum', 'uploadMedia'];
const DEFAULT_MEMBER_PERMISSIONS = { viewContent: true, manageLinks: true, forum: true, uploadMedia: true };

let _memberPermsCache = null;
const getMemberPermissions = async () => {
  if (_memberPermsCache) return _memberPermsCache;
  try {
    const row = await prisma.setting.findUnique({ where: { key: 'member_permissions' } });
    const stored = row ? JSON.parse(row.value) : {};
    // Merge over defaults so a newly-added capability is on until explicitly disabled.
    _memberPermsCache = { ...DEFAULT_MEMBER_PERMISSIONS, ...stored };
  } catch {
    _memberPermsCache = { ...DEFAULT_MEMBER_PERMISSIONS };
  }
  return _memberPermsCache;
};
const setMemberPermissions = async (perms) => {
  const clean = {};
  for (const cap of MEMBER_CAPABILITIES) clean[cap] = perms[cap] === true;
  await prisma.setting.upsert({
    where: { key: 'member_permissions' },
    update: { value: JSON.stringify(clean) },
    create: { key: 'member_permissions', value: JSON.stringify(clean) },
  });
  _memberPermsCache = clean; // refresh cache so enforcement is immediate
  return clean;
};

// Effective capabilities for a given role — staff get everything; members get
// the configured toggles. Used by /api/auth/me to drive the UI.
const effectivePermissions = async (role) => {
  if (isStaff(role)) {
    const all = {}; for (const c of MEMBER_CAPABILITIES) all[c] = true;
    return { ...all, manageContent: true, isStaff: true };
  }
  const perms = await getMemberPermissions();
  return { ...perms, manageContent: false, isStaff: false };
};

// Guard: content writes (create/edit/delete) — staff only, never members.
const requireStaff = (req, res, next) => {
  if (!isStaff(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden — staff access required' });
  }
  next();
};

// Guard factory: an action gated by a member capability. Staff always pass;
// members pass only if the admin has enabled that capability.
const requireMemberCapability = (capability) => async (req, res, next) => {
  if (isStaff(req.user?.role)) return next();
  if (req.user?.role === 'member') {
    const perms = await getMemberPermissions();
    if (perms[capability]) return next();
  }
  return res.status(403).json({ error: 'You do not have permission to do this' });
};

// ── Team helpers ──────────────────────────────────────────
// Add a user to their team's forum room (idempotent — ignores duplicates).
const addUserToTeamRoom = async (userId, teamId) => {
  if (!userId || !teamId) return;
  const room = await prisma.forumRoom.findUnique({ where: { teamId } });
  if (!room) return;
  try {
    await prisma.forumMember.create({ data: { roomId: room.id, userId } });
  } catch (e) {
    if (e.code !== 'P2002') throw e; // already a member — fine
  }
};

// Move a user's team-room membership when their team changes (drops the old
// team's room, joins the new one).
const syncTeamRoomMembership = async (userId, oldTeamId, newTeamId) => {
  if (oldTeamId && oldTeamId !== newTeamId) {
    const oldRoom = await prisma.forumRoom.findUnique({ where: { teamId: oldTeamId } });
    if (oldRoom) await prisma.forumMember.deleteMany({ where: { roomId: oldRoom.id, userId } });
  }
  if (newTeamId) await addUserToTeamRoom(userId, newTeamId);
};

// ══════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Gate access on the account lifecycle status. Credentials are correct, but
    // the account may not yet be cleared to use the platform.
    if (user.status === 'PENDING') {
      return res.status(403).json({
        error: 'Your account is awaiting administrator approval. You will be able to sign in once it has been approved.',
        status: 'PENDING',
      });
    }
    if (user.status === 'REJECTED') {
      return res.status(403).json({
        error: 'Your account is not active. Please contact an administrator.',
        status: 'REJECTED',
      });
    }

    // Log the login activity
    await logActivity({
      data: {
        userId: user.id,
        action: 'LOGIN',
        details: JSON.stringify({ timestamp: new Date().toISOString() })
      }
    });

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      username: user.username,
      userId: user.id,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me  — verify token and return user info + effective permissions
app.get('/api/auth/me', requireAuth, async (req, res) => {
  let team = null;
  try {
    const u = await prisma.user.findUnique({ where: { id: req.user.userId }, include: { team: true } });
    if (u?.team) team = { id: u.team.id, name: u.team.name };
  } catch { /* ignore */ }
  res.json({
    username: req.user.username,
    role: req.user.role,
    userId: req.user.userId,
    mustChangePassword: req.user.mustChangePassword ?? false,
    permissions: await effectivePermissions(req.user.role),
    team,
  });
});

// POST /api/auth/register — public self-registration.
// Creates a PENDING account that cannot sign in until an admin approves it.
app.post('/api/auth/register', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const name     = (req.body.name || '').trim();
    const password = req.body.password || '';

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: 'That username is already taken' });
    }

    // Optional team selection — only honour a real team id.
    let validTeamId = null;
    if (req.body.teamId) {
      const team = await prisma.team.findUnique({ where: { id: req.body.teamId } });
      if (team) validTeamId = team.id;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        name: name || null,
        passwordHash,
        role: 'member',       // self-registered users are general members; admin can promote
        status: 'PENDING',    // must be approved before they can sign in
        mustChangePassword: false,
        teamId: validTeamId,
      },
    });

    // Record the registration in the audit log (actor is the new user)
    await logActivity({
      data: {
        userId: user.id,
        action: 'REGISTER',
        details: JSON.stringify({ username: user.username }),
      },
    });

    res.status(201).json({
      message: 'Account created. An administrator must approve it before you can sign in.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/change-password — the signed-in user sets a new password.
// Used both for the forced change after an admin reset and for voluntary changes.
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const currentPassword = req.body.currentPassword || '';
    const newPassword     = req.body.newPassword || '';

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return res.status(400).json({ error: 'New password must be different from the current one' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    await logActivity({
      data: { userId: user.id, action: 'CHANGE_PASSWORD', details: JSON.stringify({ username: user.username }) },
    });

    // Issue a fresh token so the client drops the mustChangePassword flag immediately.
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, mustChangePassword: false },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, message: 'Password updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ══════════════════════════════════════════════════════════
// USER MANAGEMENT  (admin only)
// ══════════════════════════════════════════════════════════
const USER_PUBLIC_FIELDS = {
  id: true, username: true, name: true, role: true,
  status: true, mustChangePassword: true, createdAt: true, updatedAt: true,
  teamId: true, team: { select: { id: true, name: true } },
};

// Readable one-time password handed to a user after an admin reset.
const generateTempPassword = () => `Tedx@${uuidv4().replace(/-/g, '').slice(0, 8)}`;

// GET /api/users — list every account (newest pending first so approvals are easy to spot)
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: [{ createdAt: 'desc' }],
      select: USER_PUBLIC_FIELDS,
    });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users — admin creates an account directly (auto-approved).
// Optionally force a password change on first login.
app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const name     = (req.body.name || '').trim();
    const password = req.body.password || '';
    const role     = ['admin', 'editor', 'member'].includes(req.body.role) ? req.body.role : 'member';
    const requireChange = req.body.requirePasswordChange === true;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(409).json({ error: 'That username is already taken' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username, name: name || null, passwordHash, role,
        status: 'APPROVED', mustChangePassword: requireChange,
      },
      select: USER_PUBLIC_FIELDS,
    });

    await logActivity({
      data: { userId: req.user.userId, action: 'CREATE_USER', details: JSON.stringify({ username, role }) },
    });

    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH /api/users/:id — change status (approve/reject), role, or name.
app.patch('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, role, name } = req.body;
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    const isSelf = target.id === req.user.userId;
    const data = {};

    if (status !== undefined) {
      if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      // Guard against an admin locking themselves out of their own account.
      if (isSelf && status !== 'APPROVED') {
        return res.status(400).json({ error: 'You cannot change the status of your own account' });
      }
      data.status = status;
    }

    if (role !== undefined) {
      if (!['admin', 'editor', 'member'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      if (isSelf && role !== 'admin') {
        return res.status(400).json({ error: 'You cannot change your own role' });
      }
      // Don't allow demoting the last remaining admin.
      if (target.role === 'admin' && role !== 'admin') {
        const adminCount = await prisma.user.count({ where: { role: 'admin', status: 'APPROVED' } });
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'At least one admin must remain' });
        }
      }
      data.role = role;
    }

    if (name !== undefined) data.name = (name || '').trim() || null;

    // Team assignment (null/'' = unassign; otherwise must be a real team).
    if (req.body.teamId !== undefined) {
      if (req.body.teamId === null || req.body.teamId === '') {
        data.teamId = null;
      } else {
        const team = await prisma.team.findUnique({ where: { id: req.body.teamId } });
        if (!team) return res.status(400).json({ error: 'Invalid team' });
        data.teamId = team.id;
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const updated = await prisma.user.update({
      where: { id: target.id }, data, select: USER_PUBLIC_FIELDS,
    });

    // Keep the user's team forum-room membership in sync with their state.
    const finalStatus = data.status !== undefined ? data.status : target.status;
    const finalTeamId = data.teamId !== undefined ? data.teamId : target.teamId;
    let roomsChanged = false;
    if (data.teamId !== undefined && data.teamId !== target.teamId) {
      // Team changed — drop the old team's room; join the new one if approved.
      if (target.teamId) {
        const oldRoom = await prisma.forumRoom.findUnique({ where: { teamId: target.teamId } });
        if (oldRoom) await prisma.forumMember.deleteMany({ where: { roomId: oldRoom.id, userId: target.id } });
      }
      if (finalStatus === 'APPROVED' && finalTeamId) await addUserToTeamRoom(target.id, finalTeamId);
      roomsChanged = true;
    } else if (data.status === 'APPROVED' && finalTeamId) {
      // Just approved (team unchanged) — make sure they're in their team room.
      await addUserToTeamRoom(target.id, finalTeamId);
      roomsChanged = true;
    }
    if (roomsChanged) broadcastAll({ type: 'ROOMS_UPDATED' });

    const action = data.status === 'APPROVED' ? 'APPROVE_USER'
                 : data.status === 'REJECTED' ? 'REJECT_USER'
                 : data.role !== undefined     ? 'UPDATE_USER_ROLE'
                 : 'UPDATE_USER';
    await logActivity({
      data: { userId: req.user.userId, action, details: JSON.stringify({ username: target.username, ...data }) },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/users/:id/reset-password — set a new (or generated) password and
// require the user to change it on next login. Returns the temp password once.
app.post('/api/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    let newPassword = (req.body.newPassword || '').trim();
    if (newPassword && newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!newPassword) newPassword = generateTempPassword();

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash, mustChangePassword: true },
    });

    await logActivity({
      data: { userId: req.user.userId, action: 'RESET_PASSWORD', details: JSON.stringify({ username: target.username }) },
    });

    res.json({ tempPassword: newPassword, username: target.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// DELETE /api/users/:id — permanently remove an account (admin only).
// Guarded: cannot delete yourself or the last admin. Their forum MESSAGES are
// kept (authorship is a denormalised username, not an FK), so old posts still
// show who wrote them. Their audit-log entries and forum memberships are removed
// (the audit FK would otherwise block the delete).
app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.id === req.user.userId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    if (target.role === 'admin') {
      const adminCount = await prisma.user.count({ where: { role: 'admin', status: 'APPROVED' } });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'At least one admin must remain' });
      }
    }

    // Remove user-specific rows that depend on the account. Forum messages are
    // intentionally NOT touched — they keep the user's username.
    await prisma.activity.deleteMany({ where: { userId: target.id } });
    await prisma.forumMember.deleteMany({ where: { userId: target.id } });
    await prisma.user.delete({ where: { id: target.id } });

    // Attribute the deletion to the acting admin (their own audit trail).
    await logActivity({ data: { userId: req.user.userId, action: 'DELETE_USER', details: JSON.stringify({ username: target.username, role: target.role }) } });
    broadcastAll({ type: 'ROOMS_UPDATED' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ── Member permissions (admin) ────────────────────────────
// GET current global member capability toggles.
app.get('/api/settings/member-permissions', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json(await getMemberPermissions());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load member permissions' });
  }
});

// PUT update the global member capability toggles (takes effect immediately).
app.put('/api/settings/member-permissions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const saved = await setMemberPermissions(req.body || {});
    await logActivity({ data: { userId: req.user.userId, action: 'UPDATE_MEMBER_PERMISSIONS', details: JSON.stringify(saved) } });
    res.json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update member permissions' });
  }
});

// ══════════════════════════════════════════════════════════
// TEAMS
// ══════════════════════════════════════════════════════════

// GET /api/public/teams — public list (id + name) for the registration picker.
app.get('/api/public/teams', async (req, res) => {
  try {
    const teams = await prisma.team.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
    res.json(teams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// GET /api/teams — admin list with member counts and room id.
app.get('/api/teams', requireAuth, requireAdmin, async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } }, room: { select: { id: true } } },
    });
    res.json(teams.map(t => ({
      id: t.id, name: t.name, description: t.description,
      memberCount: t._count.members, roomId: t.room?.id || null, createdAt: t.createdAt,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// GET /api/teams/:id/members — admin list of a team's members.
app.get('/api/teams/:id/members', requireAuth, requireAdmin, async (req, res) => {
  try {
    const members = await prisma.user.findMany({
      where: { teamId: req.params.id },
      orderBy: { username: 'asc' },
      select: { id: true, username: true, name: true, role: true, status: true },
    });
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// POST /api/teams — create a team and its dedicated forum room.
app.post('/api/teams', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const description = (req.body.description || '').trim() || null;
    if (!name) return res.status(400).json({ error: 'Team name is required' });

    const existing = await prisma.team.findUnique({ where: { name } });
    if (existing) return res.status(409).json({ error: 'A team with that name already exists' });

    const team = await prisma.team.create({ data: { name, description } });

    // Auto-create the team's forum room.
    await prisma.forumRoom.create({
      data: {
        name,
        description: description || `${name} team room`,
        isGeneral: false,
        createdBy: req.user.username,
        teamId: team.id,
      },
    });

    await logActivity({ data: { userId: req.user.userId, action: 'CREATE_TEAM', details: JSON.stringify({ teamId: team.id, name }) } });
    broadcastAll({ type: 'ROOMS_UPDATED' });
    res.status(201).json({ id: team.id, name: team.name, description: team.description, memberCount: 0, roomId: null, createdAt: team.createdAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// PUT /api/teams/:id — rename / re-describe (keeps the room name in sync).
app.put('/api/teams/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const data = {};
    if (req.body.name !== undefined) {
      const name = (req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Team name cannot be empty' });
      const clash = await prisma.team.findFirst({ where: { name, NOT: { id: req.params.id } } });
      if (clash) return res.status(409).json({ error: 'A team with that name already exists' });
      data.name = name;
    }
    if (req.body.description !== undefined) data.description = (req.body.description || '').trim() || null;
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const team = await prisma.team.update({ where: { id: req.params.id }, data });
    if (data.name) {
      await prisma.forumRoom.updateMany({ where: { teamId: team.id }, data: { name: data.name } });
      broadcastAll({ type: 'ROOMS_UPDATED' });
    }
    await logActivity({ data: { userId: req.user.userId, action: 'UPDATE_TEAM', details: JSON.stringify({ teamId: team.id, ...data }) } });
    res.json(team);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// DELETE /api/teams/:id — detaches members + orphans the room (SetNull). An
// empty team room is removed; a room with history is kept to preserve messages.
app.delete('/api/teams/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const room = await prisma.forumRoom.findUnique({
      where: { teamId: team.id },
      include: { _count: { select: { messages: true } } },
    });

    // SetNull detaches User.teamId and ForumRoom.teamId automatically.
    await prisma.team.delete({ where: { id: team.id } });
    if (room && room._count.messages === 0) {
      await prisma.forumRoom.delete({ where: { id: room.id } });
    }

    await logActivity({ data: { userId: req.user.userId, action: 'DELETE_TEAM', details: JSON.stringify({ teamId: team.id, name: team.name }) } });
    broadcastAll({ type: 'ROOMS_UPDATED' });
    res.json({ ok: true, roomKept: !!(room && room._count.messages > 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// GET /api/activities — activity logs
app.get('/api/activities', requireAuth, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const activities = await prisma.activity.findMany({
      include: { user: { select: { username: true } } },
      orderBy: { timestamp: 'desc' },
      take: parseInt(limit, 10) || 50
    });
    res.json(activities);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// ══════════════════════════════════════════════════════════
// PUBLIC ROUTES  (no auth required)
// ══════════════════════════════════════════════════════════

// GET /api/public/speakers — only LIVE speakers, safe fields only
// Optional query filters:
//   q       full-text search across name, talkTitle, company, jobTitle, description, bio
//   company filter by company (partial, case-insensitive)
//   sort    newest (default) | oldest | name
//   limit   max results, 1–100 (omit for all)
//   offset  number of results to skip (pagination)
app.get('/api/public/speakers', async (req, res) => {
  try {
    const { q, company, sort = 'newest', limit, offset } = req.query;

    const where = { status: 'LIVE' };
    if (company) where.company = { contains: String(company) };
    if (q) {
      const term = String(q);
      where.OR = [
        { name:        { contains: term } },
        { talkTitle:   { contains: term } },
        { company:     { contains: term } },
        { jobTitle:    { contains: term } },
        { description: { contains: term } },
        { bio:         { contains: term } },
      ];
    }

    const orderBy =
      sort === 'oldest' ? { createdAt: 'asc' } :
      sort === 'name'   ? { name: 'asc' }      :
                          { createdAt: 'desc' };

    // limit: clamp to 1–100; offset: clamp to >= 0
    const take = limit  !== undefined ? Math.min(Math.max(parseInt(limit,  10) || 0, 0), 100) || undefined : undefined;
    const skip = offset !== undefined ? Math.max(parseInt(offset, 10) || 0, 0) : undefined;

    const speakers = await prisma.speaker.findMany({
      where,
      orderBy,
      ...(take !== undefined ? { take } : {}),
      ...(skip !== undefined ? { skip } : {}),
      select: {
        id:          true,
        name:        true,
        jobTitle:    true,
        company:     true,
        talkTitle:   true,
        description: true,
        bio:         true,
        imageUrl:    true,
        socialLinks: true,
        createdAt:   true,
      },
    });
    res.json(speakers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch speakers' });
  }
});

// GET /api/public/speakers/:id — single LIVE speaker, safe fields only
app.get('/api/public/speakers/:id', async (req, res) => {
  try {
    const speaker = await prisma.speaker.findFirst({
      where: { id: req.params.id, status: 'LIVE' },
      select: {
        id:          true,
        name:        true,
        jobTitle:    true,
        company:     true,
        talkTitle:   true,
        description: true,
        bio:         true,
        imageUrl:    true,
        socialLinks: true,
        createdAt:   true,
      },
    });
    if (!speaker) return res.status(404).json({ error: 'Speaker not found' });
    res.json(speaker);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch speaker' });
  }
});

// GET /api/public/sponsors — only LIVE sponsors, safe fields only
// Optional query filters:
//   q      partial, case-insensitive match on name or description
//   sort   newest (default) | oldest | name
//   limit  max results, 1–100 (omit for all)
//   offset number of results to skip (pagination)
app.get('/api/public/sponsors', async (req, res) => {
  try {
    const { q, sort = 'newest', limit, offset } = req.query;

    const where = { status: 'LIVE' };
    if (q) {
      const term = String(q);
      where.OR = [
        { name:        { contains: term } },
        { description: { contains: term } },
      ];
    }

    const orderBy =
      sort === 'oldest' ? { createdAt: 'asc' } :
      sort === 'name'   ? { name: 'asc' }      :
                          { createdAt: 'desc' };

    const take = limit  !== undefined ? Math.min(Math.max(parseInt(limit,  10) || 0, 0), 100) || undefined : undefined;
    const skip = offset !== undefined ? Math.max(parseInt(offset, 10) || 0, 0) : undefined;

    const sponsors = await prisma.sponsor.findMany({
      where,
      orderBy,
      ...(take !== undefined ? { take } : {}),
      ...(skip !== undefined ? { skip } : {}),
      select: {
        id:          true,
        name:        true,
        description: true,
        imageUrl:    true,
        website:     true,
        createdAt:   true,
      },
    });
    res.json(sponsors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sponsors' });
  }
});

// GET /api/public/sponsors/:id — single LIVE sponsor, safe fields only
app.get('/api/public/sponsors/:id', async (req, res) => {
  try {
    const sponsor = await prisma.sponsor.findFirst({
      where: { id: req.params.id, status: 'LIVE' },
      select: {
        id:          true,
        name:        true,
        description: true,
        imageUrl:    true,
        website:     true,
        createdAt:   true,
      },
    });
    if (!sponsor) return res.status(404).json({ error: 'Sponsor not found' });
    res.json(sponsor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sponsor' });
  }
});

// GET /api/public/blogs — only LIVE blog posts, safe fields only
// Optional query filters:
//   q        partial, case-insensitive match on title or content
//   category filter by category (exact)
//   sort     newest (default) | oldest | title
//   limit    max results, 1–100 (omit for all)
//   offset   number of results to skip (pagination)
app.get('/api/public/blogs', async (req, res) => {
  try {
    const { q, category, sort = 'newest', limit, offset } = req.query;

    const where = { status: 'LIVE' };
    if (category) where.category = String(category);
    if (q) {
      const term = String(q);
      where.OR = [
        { title:   { contains: term } },
        { content: { contains: term } },
      ];
    }

    const orderBy =
      sort === 'oldest' ? { publishDate: 'asc' } :
      sort === 'title'  ? { title: 'asc' }       :
                          { publishDate: 'desc' };

    const take = limit  !== undefined ? Math.min(Math.max(parseInt(limit,  10) || 0, 0), 100) || undefined : undefined;
    const skip = offset !== undefined ? Math.max(parseInt(offset, 10) || 0, 0) : undefined;

    const blogs = await prisma.blog.findMany({
      where,
      orderBy,
      ...(take !== undefined ? { take } : {}),
      ...(skip !== undefined ? { skip } : {}),
      select: {
        id:          true,
        title:       true,
        content:     true,
        category:    true,
        author:      true,
        imageUrl:    true,
        publishDate: true,
        createdAt:   true,
      },
    });
    res.json(blogs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

// GET /api/public/blogs/:id — single LIVE blog post, safe fields only
app.get('/api/public/blogs/:id', async (req, res) => {
  try {
    const blog = await prisma.blog.findFirst({
      where: { id: req.params.id, status: 'LIVE' },
      select: {
        id:          true,
        title:       true,
        content:     true,
        category:    true,
        author:      true,
        imageUrl:    true,
        publishDate: true,
        createdAt:   true,
      },
    });
    if (!blog) return res.status(404).json({ error: 'Blog not found' });
    res.json(blog);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch blog' });
  }
});

// ══════════════════════════════════════════════════════════
// SPEAKER ROUTES  (all protected)
// ══════════════════════════════════════════════════════════

// GET all speakers
app.get('/api/speakers', requireAuth, async (req, res) => {
  try {
    const speakers = await prisma.speaker.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(speakers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch speakers' });
  }
});

// GET single speaker
app.get('/api/speakers/:id', requireAuth, async (req, res) => {
  try {
    const speaker = await prisma.speaker.findUnique({ where: { id: req.params.id } });
    if (!speaker) return res.status(404).json({ error: 'Speaker not found' });
    res.json(speaker);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch speaker' });
  }
});

// POST new speaker
app.post('/api/speakers', requireAuth, requireStaff, upload.single('image'), async (req, res) => {
  try {
    const { name, email, phone, jobTitle, company, talkTitle, description, bio, socialLinks, status, imageUrl: imageUrlInput } = req.body;
    let imageUrl = imageUrlInput?.trim() || null;

    if (req.file) {
      // Save to disk
      const ext      = path.extname(req.file.originalname).toLowerCase();
      const filename = `${uuidv4()}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
      const proto    = req.headers['x-forwarded-proto'] || req.protocol;
      const host     = req.headers['x-forwarded-host']  || req.get('host');
      imageUrl = `${proto}://${host}/uploads/${filename}`;
    }

    const speaker = await prisma.speaker.create({
      data: { name, email, phone, jobTitle, company, talkTitle, description, bio, socialLinks, imageUrl, status: status || 'DRAFT' },
    });

    // Log the activity
    await logActivity({
      data: {
        userId: req.user.userId,
        action: 'CREATE_SPEAKER',
        details: JSON.stringify({ speakerId: speaker.id, speakerName: name })
      }
    });

    res.status(201).json(speaker);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create speaker' });
  }
});

// PUT update speaker
app.put('/api/speakers/:id', requireAuth, requireStaff, upload.single('image'), async (req, res) => {
  try {
    const { name, email, phone, jobTitle, company, talkTitle, description, bio, socialLinks, status, imageUrl: imageUrlInput } = req.body;
    const data = { name, email, phone, jobTitle, company, talkTitle, description, bio, socialLinks, status };

    if (req.file) {
      const ext      = path.extname(req.file.originalname).toLowerCase();
      const filename = `${uuidv4()}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
      const proto    = req.headers['x-forwarded-proto'] || req.protocol;
      const host     = req.headers['x-forwarded-host']  || req.get('host');
      data.imageUrl  = `${proto}://${host}/uploads/${filename}`;
    } else if (imageUrlInput !== undefined) {
      data.imageUrl = imageUrlInput.trim() || null;
    }

    const speaker = await prisma.speaker.update({ where: { id: req.params.id }, data });

    // Log the activity
    await logActivity({
      data: {
        userId: req.user.userId,
        action: 'UPDATE_SPEAKER',
        details: JSON.stringify({ speakerId: speaker.id, speakerName: name })
      }
    });

    res.json(speaker);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update speaker' });
  }
});

// DELETE speaker
app.delete('/api/speakers/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    const speaker = await prisma.speaker.findUnique({ where: { id: req.params.id } });
    await prisma.speaker.delete({ where: { id: req.params.id } });

    // Log the activity
    await logActivity({
      data: {
        userId: req.user.userId,
        action: 'DELETE_SPEAKER',
        details: JSON.stringify({ speakerId: req.params.id, speakerName: speaker?.name })
      }
    });

    res.json({ message: 'Speaker deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete speaker' });
  }
});

// ══════════════════════════════════════════════════════════
// MEDIA ROUTES  (all protected)
// ══════════════════════════════════════════════════════════

// GET all media
app.get('/api/media', requireAuth, requireMemberCapability('uploadMedia'), async (req, res) => {
  try {
    const media = await prisma.media.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(media);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// POST upload a new media file
app.post('/api/media', requireAuth, requireMemberCapability('uploadMedia'), mediaUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host  = req.headers['x-forwarded-host']  || req.get('host');
    const url   = `${proto}://${host}/uploads/${req.file.filename}`;

    const media = await prisma.media.create({
      data: {
        filename:     req.file.filename,
        originalName: req.file.originalname,
        url,
        size:         req.file.size,
        mimeType:     req.file.mimetype,
        uploadedBy:   req.user.username,
      },
    });

    await logActivity({
      data: {
        userId:  req.user.userId,
        action:  'UPLOAD_MEDIA',
        details: JSON.stringify({ mediaId: media.id, filename: req.file.originalname }),
      },
    });

    res.status(201).json(media);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

// DELETE a media file
app.delete('/api/media/:id', requireAuth, requireMemberCapability('uploadMedia'), async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: req.params.id } });
    if (!media) return res.status(404).json({ error: 'Media not found' });

    // Delete file from disk
    const filePath = path.join(uploadsDir, media.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await prisma.media.delete({ where: { id: req.params.id } });

    await logActivity({
      data: {
        userId:  req.user.userId,
        action:  'DELETE_MEDIA',
        details: JSON.stringify({ mediaId: req.params.id, filename: media.originalName }),
      },
    });

    res.json({ message: 'Media deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

// ══════════════════════════════════════════════════════════
// SPONSOR ROUTES  (all protected)
// ══════════════════════════════════════════════════════════

// GET all sponsors
app.get('/api/sponsors', requireAuth, async (req, res) => {
  try {
    const sponsors = await prisma.sponsor.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(sponsors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sponsors' });
  }
});

// GET single sponsor
app.get('/api/sponsors/:id', requireAuth, async (req, res) => {
  try {
    const sponsor = await prisma.sponsor.findUnique({ where: { id: req.params.id } });
    if (!sponsor) return res.status(404).json({ error: 'Sponsor not found' });
    res.json(sponsor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sponsor' });
  }
});

// POST new sponsor
app.post('/api/sponsors', requireAuth, requireStaff, upload.single('image'), async (req, res) => {
  try {
    const { name, description, website, status, imageUrl: imageUrlInput } = req.body;
    let imageUrl = imageUrlInput?.trim() || null;

    if (req.file) {
      const ext      = path.extname(req.file.originalname).toLowerCase();
      const filename = `${uuidv4()}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
      const proto    = req.headers['x-forwarded-proto'] || req.protocol;
      const host     = req.headers['x-forwarded-host']  || req.get('host');
      imageUrl = `${proto}://${host}/uploads/${filename}`;
    }

    const sponsor = await prisma.sponsor.create({
      data: { name, description, website, imageUrl, status: status || 'DRAFT' },
    });

    await logActivity({
      data: {
        userId: req.user.userId,
        action: 'CREATE_SPONSOR',
        details: JSON.stringify({ sponsorId: sponsor.id, sponsorName: name })
      }
    });

    res.status(201).json(sponsor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create sponsor' });
  }
});

// PUT update sponsor
app.put('/api/sponsors/:id', requireAuth, requireStaff, upload.single('image'), async (req, res) => {
  try {
    const { name, description, website, status, imageUrl: imageUrlInput } = req.body;
    const data = { name, description, website, status };

    if (req.file) {
      const ext      = path.extname(req.file.originalname).toLowerCase();
      const filename = `${uuidv4()}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
      const proto    = req.headers['x-forwarded-proto'] || req.protocol;
      const host     = req.headers['x-forwarded-host']  || req.get('host');
      data.imageUrl  = `${proto}://${host}/uploads/${filename}`;
    } else if (imageUrlInput !== undefined) {
      data.imageUrl = imageUrlInput.trim() || null;
    }

    const sponsor = await prisma.sponsor.update({ where: { id: req.params.id }, data });

    await logActivity({
      data: {
        userId: req.user.userId,
        action: 'UPDATE_SPONSOR',
        details: JSON.stringify({ sponsorId: sponsor.id, sponsorName: name })
      }
    });

    res.json(sponsor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update sponsor' });
  }
});

// DELETE sponsor
app.delete('/api/sponsors/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    const sponsor = await prisma.sponsor.findUnique({ where: { id: req.params.id } });
    await prisma.sponsor.delete({ where: { id: req.params.id } });

    await logActivity({
      data: {
        userId: req.user.userId,
        action: 'DELETE_SPONSOR',
        details: JSON.stringify({ sponsorId: req.params.id, sponsorName: sponsor?.name })
      }
    });

    res.json({ message: 'Sponsor deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete sponsor' });
  }
});

// ══════════════════════════════════════════════════════════
// BLOG ROUTES  (all protected)
// ══════════════════════════════════════════════════════════

// GET all blogs
app.get('/api/blogs', requireAuth, async (req, res) => {
  try {
    const blogs = await prisma.blog.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(blogs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

// GET single blog
app.get('/api/blogs/:id', requireAuth, async (req, res) => {
  try {
    const blog = await prisma.blog.findUnique({ where: { id: req.params.id } });
    if (!blog) return res.status(404).json({ error: 'Blog not found' });
    res.json(blog);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch blog' });
  }
});

// POST new blog
app.post('/api/blogs', requireAuth, requireStaff, upload.single('image'), async (req, res) => {
  try {
    const { title, content, category, author, publishDate, status, imageUrl: imageUrlInput } = req.body;
    let imageUrl = imageUrlInput?.trim() || null;

    if (req.file) {
      const ext      = path.extname(req.file.originalname).toLowerCase();
      const filename = `${uuidv4()}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
      const proto    = req.headers['x-forwarded-proto'] || req.protocol;
      const host     = req.headers['x-forwarded-host']  || req.get('host');
      imageUrl = `${proto}://${host}/uploads/${filename}`;
    }

    const blog = await prisma.blog.create({
      data: {
        title,
        content,
        category,
        author,
        imageUrl,
        publishDate: publishDate ? new Date(publishDate) : new Date(),
        status: status || 'DRAFT'
      },
    });

    await logActivity({
      data: {
        userId: req.user.userId,
        action: 'CREATE_BLOG',
        details: JSON.stringify({ blogId: blog.id, blogTitle: title })
      }
    });

    res.status(201).json(blog);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create blog' });
  }
});

// PUT update blog
app.put('/api/blogs/:id', requireAuth, requireStaff, upload.single('image'), async (req, res) => {
  try {
    const { title, content, category, author, publishDate, status, imageUrl: imageUrlInput } = req.body;
    const data = { title, content, category, author, status };

    if (publishDate !== undefined) {
      data.publishDate = new Date(publishDate);
    }

    if (req.file) {
      const ext      = path.extname(req.file.originalname).toLowerCase();
      const filename = `${uuidv4()}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
      const proto    = req.headers['x-forwarded-proto'] || req.protocol;
      const host     = req.headers['x-forwarded-host']  || req.get('host');
      data.imageUrl  = `${proto}://${host}/uploads/${filename}`;
    } else if (imageUrlInput !== undefined) {
      data.imageUrl = imageUrlInput.trim() || null;
    }

    const blog = await prisma.blog.update({ where: { id: req.params.id }, data });

    await logActivity({
      data: {
        userId: req.user.userId,
        action: 'UPDATE_BLOG',
        details: JSON.stringify({ blogId: blog.id, blogTitle: title })
      }
    });

    res.json(blog);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update blog' });
  }
});

// DELETE blog
app.delete('/api/blogs/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    const blog = await prisma.blog.findUnique({ where: { id: req.params.id } });
    await prisma.blog.delete({ where: { id: req.params.id } });

    await logActivity({
      data: {
        userId: req.user.userId,
        action: 'DELETE_BLOG',
        details: JSON.stringify({ blogId: req.params.id, blogTitle: blog?.title })
      }
    });

    res.json({ message: 'Blog deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete blog' });
  }
});

// ══════════════════════════════════════════════════════════
// POPUP / ANNOUNCEMENT ROUTES
// ══════════════════════════════════════════════════════════
// A popup is "active" on the public website when it is PUBLISHED *and* the
// current time falls inside its [startAt, endAt] window. The server computes
// this so the website never has to reason about dates — it just renders what
// the public endpoint returns, or nothing.

const FREQUENCIES = ['EVERY_VISIT', 'ONCE_PER_SESSION', 'ONCE_PER_DAY', 'ONCE_EVER'];

// Parse a datetime-local / ISO string into a Date, or null when empty.
const parsePopupDate = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

// ── PUBLIC: list all currently-active popups (no auth) ─────
// Returns an array (possibly empty) ordered by priority desc, then newest.
// The website can show one or queue/stack several.
app.get('/api/public/popups/active', async (req, res) => {
  try {
    const now = new Date();
    const popups = await prisma.popup.findMany({
      where: {
        status: 'PUBLISHED',
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null },   { endAt:   { gte: now } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      select: {
        id:          true,
        title:       true,
        body:        true,
        buttonLabel: true,
        buttonUrl:   true,
        imageUrl:    true,
        frequency:   true,
        priority:    true,
        startAt:     true,
        endAt:       true,
      },
    });
    res.json(popups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch active popups' });
  }
});

// ── PUBLIC: track an impression (no auth) ──────────────────
app.post('/api/public/popups/:id/view', async (req, res) => {
  try {
    await prisma.popup.update({
      where: { id: req.params.id },
      data: { views: { increment: 1 } },
    });
    res.json({ ok: true });
  } catch {
    // Don't leak whether the id exists; tracking is best-effort.
    res.json({ ok: true });
  }
});

// ── PUBLIC: track a CTA click (no auth) ────────────────────
app.post('/api/public/popups/:id/click', async (req, res) => {
  try {
    await prisma.popup.update({
      where: { id: req.params.id },
      data: { clicks: { increment: 1 } },
    });
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// ── ADMIN: list all popups ─────────────────────────────────
app.get('/api/popups', requireAuth, requireStaff, async (req, res) => {
  try {
    const popups = await prisma.popup.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(popups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch popups' });
  }
});

// ── ADMIN: single popup ────────────────────────────────────
app.get('/api/popups/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    const popup = await prisma.popup.findUnique({ where: { id: req.params.id } });
    if (!popup) return res.status(404).json({ error: 'Popup not found' });
    res.json(popup);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch popup' });
  }
});

// ── ADMIN: create popup ────────────────────────────────────
app.post('/api/popups', requireAuth, requireStaff, upload.single('image'), async (req, res) => {
  try {
    const { title, body, buttonLabel, buttonUrl, status, frequency, priority,
            startAt, endAt, imageUrl: imageUrlInput } = req.body;

    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    let imageUrl = imageUrlInput?.trim() || null;
    if (req.file) {
      const ext      = path.extname(req.file.originalname).toLowerCase();
      const filename = `${uuidv4()}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
      const proto    = req.headers['x-forwarded-proto'] || req.protocol;
      const host     = req.headers['x-forwarded-host']  || req.get('host');
      imageUrl = `${proto}://${host}/uploads/${filename}`;
    }

    const popup = await prisma.popup.create({
      data: {
        title:       title.trim(),
        body:        body.trim(),
        buttonLabel: buttonLabel?.trim() || null,
        buttonUrl:   buttonUrl?.trim() || null,
        imageUrl,
        status:      status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
        frequency:   FREQUENCIES.includes(frequency) ? frequency : 'ONCE_PER_SESSION',
        priority:    Number.isFinite(parseInt(priority, 10)) ? parseInt(priority, 10) : 0,
        startAt:     parsePopupDate(startAt),
        endAt:       parsePopupDate(endAt),
      },
    });

    await logActivity({
      data: {
        userId: req.user.userId,
        action: 'CREATE_POPUP',
        details: JSON.stringify({ popupId: popup.id, popupTitle: popup.title }),
      },
    });

    res.status(201).json(popup);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create popup' });
  }
});

// ── ADMIN: update popup ────────────────────────────────────
app.put('/api/popups/:id', requireAuth, requireStaff, upload.single('image'), async (req, res) => {
  try {
    const { title, body, buttonLabel, buttonUrl, status, frequency, priority,
            startAt, endAt, imageUrl: imageUrlInput } = req.body;

    const data = {};
    if (title       !== undefined) data.title       = title.trim();
    if (body        !== undefined) data.body        = body.trim();
    if (buttonLabel !== undefined) data.buttonLabel = buttonLabel.trim() || null;
    if (buttonUrl   !== undefined) data.buttonUrl   = buttonUrl.trim() || null;
    if (status      !== undefined) data.status      = status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
    if (frequency   !== undefined && FREQUENCIES.includes(frequency)) data.frequency = frequency;
    if (priority    !== undefined && Number.isFinite(parseInt(priority, 10))) data.priority = parseInt(priority, 10);
    if (startAt     !== undefined) data.startAt = parsePopupDate(startAt);
    if (endAt       !== undefined) data.endAt   = parsePopupDate(endAt);

    if (req.file) {
      const ext      = path.extname(req.file.originalname).toLowerCase();
      const filename = `${uuidv4()}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
      const proto    = req.headers['x-forwarded-proto'] || req.protocol;
      const host     = req.headers['x-forwarded-host']  || req.get('host');
      data.imageUrl  = `${proto}://${host}/uploads/${filename}`;
    } else if (imageUrlInput !== undefined) {
      data.imageUrl = imageUrlInput.trim() || null;
    }

    const popup = await prisma.popup.update({ where: { id: req.params.id }, data });

    await logActivity({
      data: {
        userId: req.user.userId,
        action: 'UPDATE_POPUP',
        details: JSON.stringify({ popupId: popup.id, popupTitle: popup.title }),
      },
    });

    res.json(popup);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update popup' });
  }
});

// ── ADMIN: delete popup ────────────────────────────────────
app.delete('/api/popups/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    const popup = await prisma.popup.findUnique({ where: { id: req.params.id } });
    await prisma.popup.delete({ where: { id: req.params.id } });

    await logActivity({
      data: {
        userId: req.user.userId,
        action: 'DELETE_POPUP',
        details: JSON.stringify({ popupId: req.params.id, popupTitle: popup?.title }),
      },
    });

    res.json({ message: 'Popup deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete popup' });
  }
});

// ══════════════════════════════════════════════════════════
// LINK SHORTENER + QR  (proxied to the external tedxyola.com service)
// ══════════════════════════════════════════════════════════
// The external admin API requires a secret API key. We keep that key on the
// server (process.env.API_KEY) and proxy requests through here so it is never
// exposed to the browser. These routes reuse the dashboard's own JWT auth.
// The QR endpoint is public, so the frontend loads those images directly.
const LINKS_API = 'https://tedxyola.com/api/admin/links';

const linksHeaders = () => ({
  Authorization: `Bearer ${process.env.API_KEY}`,
  'Content-Type': 'application/json',
});
// GET /api/links — list all short links
app.get('/api/links', requireAuth, requireMemberCapability('manageLinks'), async (req, res) => {
  if (!process.env.API_KEY) return res.status(500).json({ error: 'Link service API key not configured' });
  try {
    const r    = await fetch(LINKS_API, { headers: linksHeaders() });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to reach link service' });
  }
});

// POST /api/links — create a short link  { url, slug? }
app.post('/api/links', requireAuth, requireMemberCapability('manageLinks'), async (req, res) => {
  if (!process.env.API_KEY) return res.status(500).json({ error: 'Link service API key not configured' });
  const { url, slug } = req.body;
  if (!url) return res.status(400).json({ error: 'A target URL is required' });
  try {
    const r    = await fetch(LINKS_API, {
      method:  'POST',
      headers: linksHeaders(),
      body:    JSON.stringify(slug ? { url, slug } : { url }),
    });
    const data = await r.json().catch(() => ({}));

    if (r.ok) {
      await logActivity({
        data: {
          userId:  req.user.userId,
          action:  'CREATE_LINK',
          details: JSON.stringify({ slug: data?.slug || slug, url }),
        },
      });
    }
    res.status(r.status).json(data);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to reach link service' });
  }
});

// DELETE /api/links/:slug — remove a short link
app.delete('/api/links/:slug', requireAuth, requireMemberCapability('manageLinks'), async (req, res) => {
  if (!process.env.API_KEY) return res.status(500).json({ error: 'Link service API key not configured' });
  try {
    const r    = await fetch(`${LINKS_API}/${encodeURIComponent(req.params.slug)}`, {
      method:  'DELETE',
      headers: linksHeaders(),
    });
    const data = await r.json().catch(() => ({}));

    if (r.ok) {
      await logActivity({
        data: {
          userId:  req.user.userId,
          action:  'DELETE_LINK',
          details: JSON.stringify({ slug: req.params.slug }),
        },
      });
    }
    res.status(r.status).json(data);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to reach link service' });
  }
});

// ══════════════════════════════════════════════════════════
// GITHUB COMMITS PROXY  (admin only — keeps any token server-side)
// ══════════════════════════════════════════════════════════
app.get('/api/commits', requireAuth, async (req, res) => {
  try {
    const GITHUB_OWNER = process.env.GITHUB_OWNER || 'danielishakutv';
    const GITHUB_REPO  = process.env.GITHUB_REPO  || 'tedxyola_speaker_dashboard';
    const page         = parseInt(req.query.page)  || 1;
    const per_page     = Math.min(parseInt(req.query.per_page) || 100, 100);

    const headers = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;

    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?per_page=${per_page}&page=${page}`,
      { headers }
    );

    if (!ghRes.ok) {
      const err = await ghRes.json().catch(() => ({}));
      return res.status(ghRes.status).json({ error: err.message || 'GitHub API error' });
    }

    const commits = await ghRes.json();

    // Shape into a clean, minimal response the frontend can consume directly
    const shaped = commits.map(c => ({
      sha:     c.sha,
      short:   c.sha.slice(0, 7),
      message: c.commit.message,
      subject: c.commit.message.split('\n')[0],
      body:    c.commit.message.split('\n').slice(2).join('\n').trim(),
      author:  {
        name:   c.commit.author.name,
        email:  c.commit.author.email,
        date:   c.commit.author.date,
        avatar: c.author?.avatar_url || null,
        login:  c.author?.login     || null,
      },
      url: c.html_url,
    }));

    // Pass through pagination headers
    res.set('X-GitHub-Total', ghRes.headers.get('x-github-total-count') || '');
    res.json(shaped);
  } catch (err) {
    console.error('GitHub proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch commits' });
  }
});

// ══════════════════════════════════════════════════════════
// ACCOUNTS & FINANCE ROUTES  (admin only)
// ══════════════════════════════════════════════════════════
// "Accounts" are where money lives (cash, bank, mobile money). Balances are
// always COMPUTED from openingBalance + every transaction touching the account,
// so they can never drift. Transactions are INCOME, EXPENSE, or TRANSFER.

const TXN_TYPES = ['INCOME', 'EXPENSE', 'TRANSFER'];
const ACCOUNT_TYPES = ['CASH', 'BANK', 'MOBILE', 'OTHER'];

// Compute a { accountId: balance } map from accounts + their transactions.
const computeBalances = (accounts, txns) => {
  const bal = {};
  accounts.forEach(a => { bal[a.id] = a.openingBalance || 0; });
  for (const t of txns) {
    if (t.type === 'INCOME') {
      if (t.accountId in bal) bal[t.accountId] += t.amount;
    } else if (t.type === 'EXPENSE') {
      if (t.accountId in bal) bal[t.accountId] -= t.amount;
    } else if (t.type === 'TRANSFER') {
      if (t.accountId in bal)            bal[t.accountId]   -= t.amount;
      if (t.toAccountId && t.toAccountId in bal) bal[t.toAccountId] += t.amount;
    }
  }
  return bal;
};

const parseAmount = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

const parseTxnDate = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return new Date();
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
};

// ── GET /api/accounts — all accounts with computed balances ──
app.get('/api/accounts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [accounts, txns] = await Promise.all([
      prisma.account.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.transaction.findMany({ select: { type: true, amount: true, accountId: true, toAccountId: true } }),
    ]);
    const bal = computeBalances(accounts, txns);
    res.json(accounts.map(a => ({ ...a, balance: bal[a.id] ?? a.openingBalance })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// ── GET /api/accounts/:id — single account + recent transactions ──
app.get('/api/accounts/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const account = await prisma.account.findUnique({ where: { id: req.params.id } });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const txns = await prisma.transaction.findMany({
      where: { OR: [{ accountId: account.id }, { toAccountId: account.id }] },
      include: { account: { select: { name: true } }, toAccount: { select: { name: true } } },
      orderBy: { date: 'desc' },
    });
    const allForBalance = txns.map(t => ({ type: t.type, amount: t.amount, accountId: t.accountId, toAccountId: t.toAccountId }));
    const bal = computeBalances([account], allForBalance);

    res.json({ ...account, balance: bal[account.id], transactions: txns });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// ── POST /api/accounts ──────────────────────────────────────
app.post('/api/accounts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, type, description, openingBalance } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Account name is required' });

    const opening = parseAmount(openingBalance);
    const account = await prisma.account.create({
      data: {
        name:           name.trim(),
        type:           ACCOUNT_TYPES.includes(type) ? type : 'BANK',
        description:    description?.trim() || null,
        openingBalance: Number.isFinite(opening) ? opening : 0,
      },
    });

    await logActivity({
      data: { userId: req.user.userId, action: 'CREATE_ACCOUNT', details: JSON.stringify({ accountId: account.id, name: account.name }) },
    });

    res.status(201).json(account);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// ── PUT /api/accounts/:id ───────────────────────────────────
app.put('/api/accounts/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, type, description, openingBalance, archived } = req.body;
    const data = {};
    if (name        !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Account name cannot be empty' });
      data.name = name.trim();
    }
    if (type        !== undefined && ACCOUNT_TYPES.includes(type)) data.type = type;
    if (description !== undefined) data.description = description?.trim() || null;
    if (openingBalance !== undefined) {
      const opening = parseAmount(openingBalance);
      if (Number.isFinite(opening)) data.openingBalance = opening;
    }
    if (archived !== undefined) data.archived = Boolean(archived);

    const account = await prisma.account.update({ where: { id: req.params.id }, data });

    await logActivity({
      data: { userId: req.user.userId, action: 'UPDATE_ACCOUNT', details: JSON.stringify({ accountId: account.id, name: account.name }) },
    });

    res.json(account);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// ── DELETE /api/accounts/:id ────────────────────────────────
// Refuse to delete an account that has transaction history — archive instead,
// so financial records are never silently lost.
app.delete('/api/accounts/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const count = await prisma.transaction.count({
      where: { OR: [{ accountId: req.params.id }, { toAccountId: req.params.id }] },
    });
    if (count > 0) {
      return res.status(409).json({
        error: `This account has ${count} transaction${count !== 1 ? 's' : ''}. Archive it instead of deleting to keep your records.`,
      });
    }

    const account = await prisma.account.findUnique({ where: { id: req.params.id } });
    await prisma.account.delete({ where: { id: req.params.id } });

    await logActivity({
      data: { userId: req.user.userId, action: 'DELETE_ACCOUNT', details: JSON.stringify({ accountId: req.params.id, name: account?.name }) },
    });

    res.json({ message: 'Account deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ── GET /api/finance/summary — simple analytics ─────────────
// Optional query: from, to (ISO dates) to scope the income/expense figures.
app.get('/api/finance/summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) { const d = new Date(from); if (!isNaN(d)) dateFilter.gte = d; }
    if (to)   { const d = new Date(to);   if (!isNaN(d)) dateFilter.lte = d; }
    const where = Object.keys(dateFilter).length ? { date: dateFilter } : {};

    const [accounts, allTxns, scopedTxns] = await Promise.all([
      prisma.account.findMany({ orderBy: { createdAt: 'asc' } }),
      // Balances must reflect ALL history regardless of the date scope
      prisma.transaction.findMany({ select: { type: true, amount: true, accountId: true, toAccountId: true } }),
      prisma.transaction.findMany({ where, select: { type: true, amount: true, category: true, date: true } }),
    ]);

    const bal = computeBalances(accounts, allTxns);

    const totalIncome  = scopedTxns.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
    const totalExpense = scopedTxns.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
    const totalBalance = accounts.reduce((s, a) => s + (bal[a.id] ?? 0), 0);

    // Income & expense grouped by category
    const byCategory = (type) => {
      const map = {};
      scopedTxns.filter(t => t.type === type).forEach(t => {
        const key = (t.category || 'Uncategorized').trim() || 'Uncategorized';
        map[key] = (map[key] || 0) + t.amount;
      });
      return Object.entries(map).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
    };

    // Last 6 months income vs expense trend
    const monthly = {};
    scopedTxns.forEach(t => {
      if (t.type === 'TRANSFER') return;
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthly[key]) monthly[key] = { month: key, income: 0, expense: 0 };
      if (t.type === 'INCOME')  monthly[key].income  += t.amount;
      if (t.type === 'EXPENSE') monthly[key].expense += t.amount;
    });
    const trend = Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

    res.json({
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
      totalBalance,
      accountCount: accounts.length,
      transactionCount: scopedTxns.length,
      incomeByCategory:  byCategory('INCOME'),
      expenseByCategory: byCategory('EXPENSE'),
      trend,
      accounts: accounts.map(a => ({ id: a.id, name: a.name, type: a.type, archived: a.archived, balance: bal[a.id] ?? a.openingBalance })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build finance summary' });
  }
});

// ── GET /api/transactions — list with optional filters ──────
// Query: type, accountId, category, from, to, limit
app.get('/api/transactions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { type, accountId, category, from, to, limit } = req.query;
    const where = {};
    if (type && TXN_TYPES.includes(type)) where.type = type;
    if (category) where.category = { contains: String(category) };
    if (accountId) where.OR = [{ accountId: String(accountId) }, { toAccountId: String(accountId) }];
    if (from || to) {
      where.date = {};
      if (from) { const d = new Date(from); if (!isNaN(d)) where.date.gte = d; }
      if (to)   { const d = new Date(to);   if (!isNaN(d)) where.date.lte = d; }
    }
    const take = limit !== undefined ? Math.min(Math.max(parseInt(limit, 10) || 0, 0), 500) || undefined : undefined;

    const transactions = await prisma.transaction.findMany({
      where,
      include: { account: { select: { name: true } }, toAccount: { select: { name: true } } },
      orderBy: { date: 'desc' },
      ...(take !== undefined ? { take } : {}),
    });
    res.json(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ── GET /api/transactions/:id ───────────────────────────────
app.get('/api/transactions/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const txn = await prisma.transaction.findUnique({
      where: { id: req.params.id },
      include: { account: { select: { name: true } }, toAccount: { select: { name: true } } },
    });
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });
    res.json(txn);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// Validate a transaction payload against existing accounts. Returns { error } or { data }.
// excludeTxnId: when editing an existing transaction, exclude it from the balance
// calculation so the account's balance is computed as if this txn doesn't exist yet.
const validateTxn = async ({ type, amount, accountId, toAccountId, category, note, date }, excludeTxnId = null) => {
  if (!TXN_TYPES.includes(type)) return { error: 'Invalid transaction type' };

  const amt = parseAmount(amount);
  if (!Number.isFinite(amt) || amt <= 0) return { error: 'Amount must be a positive number' };

  if (!accountId) return { error: 'An account is required' };
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { error: 'The selected account does not exist' };

  let toId = null;
  if (type === 'TRANSFER') {
    if (!toAccountId) return { error: 'A destination account is required for transfers' };
    if (toAccountId === accountId) return { error: 'Cannot transfer to the same account' };
    const toAccount = await prisma.account.findUnique({ where: { id: toAccountId } });
    if (!toAccount) return { error: 'The destination account does not exist' };
    toId = toAccountId;
  }

  // ── Insufficient-funds check (EXPENSE and TRANSFER only) ──────────────────
  // We allow INCOME without restriction. For EXPENSE/TRANSFER we compute the
  // current balance of the source account (optionally excluding a txn being
  // edited) and reject if the amount would take it negative.
  if (type === 'EXPENSE' || type === 'TRANSFER') {
    const txnWhere = { OR: [{ accountId }, { toAccountId: accountId }] };
    if (excludeTxnId) txnWhere.NOT = { id: excludeTxnId };

    const existingTxns = await prisma.transaction.findMany({
      where: txnWhere,
      select: { type: true, amount: true, accountId: true, toAccountId: true },
    });

    const bal = computeBalances([account], existingTxns);
    const currentBalance = bal[accountId] ?? account.openingBalance;

    if (amt > currentBalance) {
      const fmt = (n) => `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
      return {
        error: `Insufficient funds — "${account.name}" has ${fmt(currentBalance)} but you're trying to ${type === 'TRANSFER' ? 'transfer' : 'spend'} ${fmt(amt)}.`,
      };
    }
  }

  return {
    data: {
      type,
      amount:      amt,
      accountId,
      toAccountId: toId,
      category:    type === 'TRANSFER' ? null : (category?.trim() || null),
      note:        note?.trim() || null,
      date:        parseTxnDate(date),
    },
  };
};

// ── POST /api/transactions ──────────────────────────────────
app.post('/api/transactions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { error, data } = await validateTxn(req.body);
    if (error) return res.status(400).json({ error });

    const txn = await prisma.transaction.create({
      data: { ...data, createdBy: req.user.username },
      include: { account: { select: { name: true } }, toAccount: { select: { name: true } } },
    });

    await logActivity({
      data: { userId: req.user.userId, action: 'CREATE_TRANSACTION', details: JSON.stringify({ transactionId: txn.id, type: txn.type, amount: txn.amount }) },
    });

    res.status(201).json(txn);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// ── PUT /api/transactions/:id ───────────────────────────────
app.put('/api/transactions/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { error, data } = await validateTxn(req.body, req.params.id);
    if (error) return res.status(400).json({ error });

    const txn = await prisma.transaction.update({
      where: { id: req.params.id },
      data,
      include: { account: { select: { name: true } }, toAccount: { select: { name: true } } },
    });

    await logActivity({
      data: { userId: req.user.userId, action: 'UPDATE_TRANSACTION', details: JSON.stringify({ transactionId: txn.id, type: txn.type, amount: txn.amount }) },
    });

    res.json(txn);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// ── DELETE /api/transactions/:id ────────────────────────────
app.delete('/api/transactions/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const txn = await prisma.transaction.findUnique({ where: { id: req.params.id } });
    await prisma.transaction.delete({ where: { id: req.params.id } });

    await logActivity({
      data: { userId: req.user.userId, action: 'DELETE_TRANSACTION', details: JSON.stringify({ transactionId: req.params.id, type: txn?.type, amount: txn?.amount }) },
    });

    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// ══════════════════════════════════════════════════════════
// FORUM REST ROUTES  (all require auth)
// ══════════════════════════════════════════════════════════

// ── WebSocket broadcast helper — declared here so forum routes can use it ──
const roomClients    = new Map(); // roomId → Set<ws>
const allClients     = new Set(); // every connected ws

const broadcastToRoom = (roomId, payload, excludeWs = null) => {
  const clients = roomClients.get(roomId);
  if (!clients) return;
  const msg = JSON.stringify(payload);
  clients.forEach(ws => {
    if (ws !== excludeWs && ws.readyState === 1) ws.send(msg);
  });
};

// Broadcast to every connected authenticated client (e.g. rooms list changed)
const broadcastAll = (payload) => {
  const msg = JSON.stringify(payload);
  allClients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
};

// ── Seed the General room exactly once ─────────────────────
const seedGeneralRoom = async () => {
  const generals = await prisma.forumRoom.findMany({
    where: { isGeneral: true }, orderBy: { createdAt: 'asc' },
  });

  // Clean up any duplicates created by watch-mode restarts
  if (generals.length > 1) {
    const [, ...extras] = generals;
    const extraIds = extras.map(r => r.id);
    // Delete child rows first (SQLite may not honour cascade without pragma)
    await prisma.forumMessage.deleteMany({ where: { roomId: { in: extraIds } } });
    await prisma.forumMember.deleteMany({  where: { roomId: { in: extraIds } } });
    await prisma.forumRoom.deleteMany({    where: { id:     { in: extraIds } } });
    console.log(`Forum: removed ${extras.length} duplicate General room(s)`);
  }

  if (generals.length === 0) {
    await prisma.forumRoom.create({
      data: { name: 'General', description: 'Open chat for all members', isGeneral: true, createdBy: 'admin' },
    });
    console.log('Forum: seeded General room');
  }
};
await seedGeneralRoom();

// GET /api/forum/rooms — rooms the current user can see
// General is always visible. Private rooms only if member.
app.get('/api/forum/rooms', requireAuth, requireMemberCapability('forum'), async (req, res) => {
  try {
    const rooms = await prisma.forumRoom.findMany({
      orderBy: [{ isGeneral: 'desc' }, { createdAt: 'asc' }],
      include: {
        _count: { select: { messages: true, members: true } },
        members: { where: { userId: req.user.userId }, select: { id: true } },
      },
    });
    const visible = rooms.filter(r => r.isGeneral || r.members.length > 0 || req.user.role === 'admin');
    res.json(visible.map(r => ({
      id:          r.id,
      name:        r.name,
      description: r.description,
      isGeneral:   r.isGeneral,
      createdBy:   r.createdBy,
      createdAt:   r.createdAt,
      messageCount: r._count.messages,
      memberCount:  r._count.members,
      isMember:    r.isGeneral || r.members.length > 0,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// GET /api/forum/rooms/:id/users — list all users (admin only, for member management)
app.get('/api/forum/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { username: 'asc' },
      select: { id: true, username: true, role: true },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/forum/rooms — create a new room (admin only)
app.post('/api/forum/rooms', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description, memberIds = [] } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Room name is required' });

    const room = await prisma.forumRoom.create({
      data: {
        name:        name.trim(),
        description: description?.trim() || null,
        isGeneral:   false,
        createdBy:   req.user.username,
      },
    });

    // Add specified members one-by-one to avoid createMany + skipDuplicates
    // (not supported reliably on SQLite in Prisma 5)
    const ids = [...new Set([req.user.userId, ...memberIds])];
    const validUsers = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } });

    for (const u of validUsers) {
      try {
        await prisma.forumMember.create({ data: { roomId: room.id, userId: u.id } });
      } catch (e) {
        if (e.code !== 'P2002') throw e; // ignore duplicate, rethrow anything else
      }
    }

    await logActivity({
      data: { userId: req.user.userId, action: 'CREATE_FORUM_ROOM', details: JSON.stringify({ roomId: room.id, name: room.name }) },
    });

    // Notify all connected clients so their room list refreshes immediately
    broadcastAll({ type: 'ROOMS_UPDATED' });

    res.status(201).json({ ...room, memberCount: validUsers.length, messageCount: 0, isMember: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// PUT /api/forum/rooms/:id — rename / redescribe (admin only)
app.put('/api/forum/rooms/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    const data = {};
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Room name cannot be empty' });
      data.name = name.trim();
    }
    if (description !== undefined) data.description = description?.trim() || null;
    const room = await prisma.forumRoom.update({ where: { id: req.params.id }, data });
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update room' });
  }
});

// DELETE /api/forum/rooms/:id — delete non-general room (admin only)
app.delete('/api/forum/rooms/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const room = await prisma.forumRoom.findUnique({ where: { id: req.params.id } });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.isGeneral) return res.status(400).json({ error: 'Cannot delete the General room' });
    // Delete child rows first so SQLite FK constraints are satisfied
    await prisma.forumMessage.deleteMany({ where: { roomId: req.params.id } });
    await prisma.forumMember.deleteMany({  where: { roomId: req.params.id } });
    await prisma.forumRoom.delete({ where: { id: req.params.id } });
    res.json({ message: 'Room deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// POST /api/forum/rooms/:id/members — add member (admin only)
app.post('/api/forum/rooms/:id/members', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    try {
      await prisma.forumMember.create({ data: { roomId: req.params.id, userId } });
    } catch (e) {
      if (e.code === 'P2002') return res.status(409).json({ error: 'User already a member' });
      throw e;
    }
    // Tell all clients to refresh their room list — the newly added user will now see this room
    broadcastAll({ type: 'ROOMS_UPDATED' });
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// DELETE /api/forum/rooms/:id/members/:userId — remove member (admin only)
app.delete('/api/forum/rooms/:id/members/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.forumMember.deleteMany({
      where: { roomId: req.params.id, userId: req.params.userId },
    });
    broadcastAll({ type: 'ROOMS_UPDATED' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// GET /api/forum/rooms/:id/members — list members
app.get('/api/forum/rooms/:id/members', requireAuth, requireMemberCapability('forum'), async (req, res) => {
  try {
    const members = await prisma.forumMember.findMany({
      where: { roomId: req.params.id },
      include: { user: { select: { id: true, username: true, role: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    res.json(members.map(m => ({ ...m.user, joinedAt: m.joinedAt })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// GET /api/forum/rooms/:id/messages — last N messages (before cursor)
app.get('/api/forum/rooms/:id/messages', requireAuth, requireMemberCapability('forum'), async (req, res) => {
  try {
    // Access control: general is open to all; private rooms require membership
    const room = await prisma.forumRoom.findUnique({ where: { id: req.params.id } });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (!room.isGeneral && req.user.role !== 'admin') {
      const member = await prisma.forumMember.findUnique({
        where: { roomId_userId: { roomId: req.params.id, userId: req.user.userId } },
      });
      if (!member) return res.status(403).json({ error: 'Not a member of this room' });
    }

    const limit  = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const before = req.query.before; // ISO timestamp cursor for pagination
    const where  = { roomId: req.params.id };
    if (before) {
      const d = new Date(before);
      if (!isNaN(d)) where.createdAt = { lt: d };
    }

    const messages = await prisma.forumMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(messages.reverse()); // return oldest-first
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ══════════════════════════════════════════════════════════
// SERVE FRONTEND  (production build, if present)
// ══════════════════════════════════════════════════════════
const distDir = path.join(__dirname, '../frontend/dist');

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distDir, 'index.html'));
    }
    next();
  });
}

// ══════════════════════════════════════════════════════════
// HTTP SERVER + WEBSOCKET  (forum real-time)
// ══════════════════════════════════════════════════════════
const PORT       = process.env.PORT || 5000;
const httpServer = http.createServer(app);
const wss        = new WebSocketServer({ server: httpServer });

// Verify JWT from WS query string (?token=...)
const verifyWsToken = (req) => {
  try {
    const url   = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) return null;
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
};

wss.on('connection', async (ws, req) => {
  const user = verifyWsToken(req);
  if (!user) { ws.close(4001, 'Unauthorized'); return; }

  // Members can only use the forum if the admin has enabled that capability.
  if (user.role === 'member') {
    const perms = await getMemberPermissions();
    if (!perms.forum) { ws.close(4003, 'Forum access disabled'); return; }
  }

  ws.userId   = user.userId;
  ws.username = user.username;
  ws.role     = user.role;
  ws.roomId   = null;

  // Track every live connection so we can broadcast room-list updates to all users
  allClients.add(ws);

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── JOIN ─────────────────────────────────────────────
    if (msg.type === 'JOIN') {
      const { roomId } = msg;
      if (!roomId) return;

      try {
        const room = await prisma.forumRoom.findUnique({ where: { id: roomId } });
        if (!room) return ws.send(JSON.stringify({ type: 'ERROR', error: 'Room not found' }));

        if (!room.isGeneral && ws.role !== 'admin') {
          const member = await prisma.forumMember.findUnique({
            where: { roomId_userId: { roomId, userId: ws.userId } },
          });
          if (!member) return ws.send(JSON.stringify({ type: 'ERROR', error: 'Not a member' }));
        }
      } catch {
        return ws.send(JSON.stringify({ type: 'ERROR', error: 'Join failed' }));
      }

      if (ws.roomId && roomClients.has(ws.roomId)) {
        roomClients.get(ws.roomId).delete(ws);
      }
      ws.roomId = roomId;
      if (!roomClients.has(roomId)) roomClients.set(roomId, new Set());
      roomClients.get(roomId).add(ws);
      ws.send(JSON.stringify({ type: 'JOINED', roomId }));
    }

    // ── SEND MESSAGE ─────────────────────────────────────
    if (msg.type === 'MESSAGE') {
      const body = (msg.body || '').trim();
      if (!body || !ws.roomId) return;
      if (body.length > 2000) return ws.send(JSON.stringify({ type: 'ERROR', error: 'Message too long' }));
      try {
        const saved = await prisma.forumMessage.create({
          data: { roomId: ws.roomId, userId: ws.userId, username: ws.username, body },
        });
        broadcastToRoom(ws.roomId, { type: 'MESSAGE', message: saved });
      } catch (err) {
        console.error('WS message save error:', err);
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Failed to send message' }));
      }
    }

    // ── DELETE MESSAGE (admin or own) ────────────────────
    if (msg.type === 'DELETE_MESSAGE') {
      const { messageId } = msg;
      if (!messageId || !ws.roomId) return;
      try {
        const existing = await prisma.forumMessage.findUnique({ where: { id: messageId } });
        if (!existing) return;
        if (existing.userId !== ws.userId && ws.role !== 'admin') return;
        await prisma.forumMessage.delete({ where: { id: messageId } });
        broadcastToRoom(ws.roomId, { type: 'MESSAGE_DELETED', messageId });
      } catch { /* ignore */ }
    }
  });

  ws.on('close', () => {
    allClients.delete(ws);
    if (ws.roomId && roomClients.has(ws.roomId)) {
      roomClients.get(ws.roomId).delete(ws);
    }
  });
});

await httpServer.listen(PORT);
console.log(`Server running on port ${PORT}`);
