import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const app    = express();
const prisma = new PrismaClient();

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Cloudinary ────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Multer ────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage() });

const uploadToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'tedx_speakers' },
      (err, result) => (err ? reject(err) : resolve(result))
    ).end(buffer);
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

  // Check username
  if (username !== process.env.ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Check password against bcrypt hash
  const valid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { username, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, username});
});

// GET /api/auth/me  — verify token and return user info
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
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
    // Use a pasted image URL by default; an uploaded file (below) takes precedence.
    let imageUrl = imageUrlInput?.trim() || null;

    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer);
        imageUrl = result.secure_url;
      } catch (e) {
        console.error('Cloudinary upload failed:', e.message);
        imageUrl = imageUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150';
      }
    }

    const speaker = await prisma.speaker.create({
      data: { name, email, phone, jobTitle, company, talkTitle, description, bio, socialLinks, imageUrl, status: status || 'DRAFT' },
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
      // Uploaded file takes precedence
      try {
        const result = await uploadToCloudinary(req.file.buffer);
        data.imageUrl = result.secure_url;
      } catch (e) {
        console.error('Cloudinary upload failed:', e.message);
      }
    } else if (imageUrlInput !== undefined) {
      // Otherwise, set/clear the image from a pasted URL
      data.imageUrl = imageUrlInput.trim() || null;
    }

    const speaker = await prisma.speaker.update({ where: { id: req.params.id }, data });
    res.json(speaker);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update speaker' });
  }
});

// DELETE speaker
app.delete('/api/speakers/:id', requireAuth, async (req, res) => {
  try {
    await prisma.speaker.delete({ where: { id: req.params.id } });
    res.json({ message: 'Speaker deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete speaker' });
  }
});

// ══════════════════════════════════════════════════════════
// SERVE FRONTEND  (production build, if present)
// ══════════════════════════════════════════════════════════
// In production the backend also serves the compiled React app, so a single
// reverse proxy (Apache → this port) handles both the UI and the API.
// In local dev there is no build, so this block is skipped and Vite serves the UI.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
