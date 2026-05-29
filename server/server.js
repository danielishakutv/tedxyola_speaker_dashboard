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

dotenv.config();

const app    = express();
const prisma = new PrismaClient();

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

// ── JWT Auth Middleware ───────────────────────────────────
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

    // Log the login activity
    await prisma.activity.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        details: JSON.stringify({ timestamp: new Date().toISOString() })
      }
    });

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, username: user.username, userId: user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me  — verify token and return user info
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role, userId: req.user.userId });
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
app.post('/api/speakers', requireAuth, upload.single('image'), async (req, res) => {
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
    await prisma.activity.create({
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
app.put('/api/speakers/:id', requireAuth, upload.single('image'), async (req, res) => {
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
    await prisma.activity.create({
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
app.delete('/api/speakers/:id', requireAuth, async (req, res) => {
  try {
    const speaker = await prisma.speaker.findUnique({ where: { id: req.params.id } });
    await prisma.speaker.delete({ where: { id: req.params.id } });

    // Log the activity
    await prisma.activity.create({
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
app.get('/api/media', requireAuth, async (req, res) => {
  try {
    const media = await prisma.media.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(media);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// POST upload a new media file
app.post('/api/media', requireAuth, mediaUpload.single('file'), async (req, res) => {
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

    await prisma.activity.create({
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
app.delete('/api/media/:id', requireAuth, async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: req.params.id } });
    if (!media) return res.status(404).json({ error: 'Media not found' });

    // Delete file from disk
    const filePath = path.join(uploadsDir, media.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await prisma.media.delete({ where: { id: req.params.id } });

    await prisma.activity.create({
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
// SERVE FRONTEND  (production build, if present)
// ══════════════════════════════════════════════════════════
// In production the backend also serves the compiled React app, so a single
// reverse proxy (Apache → this port) handles both the UI and the API.
// In local dev there is no build, so this block is skipped and Vite serves the UI.
const distDir   = path.join(__dirname, '../frontend/dist');

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));

  // SPA fallback: any non-API GET that didn't match a static asset → index.html
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distDir, 'index.html'));
    }
    next();
  });
}

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
