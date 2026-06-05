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
app.post('/api/sponsors', requireAuth, upload.single('image'), async (req, res) => {
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

    await prisma.activity.create({
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
app.put('/api/sponsors/:id', requireAuth, upload.single('image'), async (req, res) => {
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

    await prisma.activity.create({
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
app.delete('/api/sponsors/:id', requireAuth, async (req, res) => {
  try {
    const sponsor = await prisma.sponsor.findUnique({ where: { id: req.params.id } });
    await prisma.sponsor.delete({ where: { id: req.params.id } });

    await prisma.activity.create({
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
app.post('/api/blogs', requireAuth, upload.single('image'), async (req, res) => {
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

    await prisma.activity.create({
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
app.put('/api/blogs/:id', requireAuth, upload.single('image'), async (req, res) => {
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

    await prisma.activity.create({
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
app.delete('/api/blogs/:id', requireAuth, async (req, res) => {
  try {
    const blog = await prisma.blog.findUnique({ where: { id: req.params.id } });
    await prisma.blog.delete({ where: { id: req.params.id } });

    await prisma.activity.create({
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
app.get('/api/popups', requireAuth, async (req, res) => {
  try {
    const popups = await prisma.popup.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(popups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch popups' });
  }
});

// ── ADMIN: single popup ────────────────────────────────────
app.get('/api/popups/:id', requireAuth, async (req, res) => {
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
app.post('/api/popups', requireAuth, upload.single('image'), async (req, res) => {
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

    await prisma.activity.create({
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
app.put('/api/popups/:id', requireAuth, upload.single('image'), async (req, res) => {
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

    await prisma.activity.create({
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
app.delete('/api/popups/:id', requireAuth, async (req, res) => {
  try {
    const popup = await prisma.popup.findUnique({ where: { id: req.params.id } });
    await prisma.popup.delete({ where: { id: req.params.id } });

    await prisma.activity.create({
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
app.get('/api/links', requireAuth, async (req, res) => {
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
app.post('/api/links', requireAuth, async (req, res) => {
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
      await prisma.activity.create({
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
app.delete('/api/links/:slug', requireAuth, async (req, res) => {
  if (!process.env.API_KEY) return res.status(500).json({ error: 'Link service API key not configured' });
  try {
    const r    = await fetch(`${LINKS_API}/${encodeURIComponent(req.params.slug)}`, {
      method:  'DELETE',
      headers: linksHeaders(),
    });
    const data = await r.json().catch(() => ({}));

    if (r.ok) {
      await prisma.activity.create({
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
// Express 5 returns a Promise from listen() — await it so the process stays alive
await app.listen(PORT);
console.log(`Server running on port ${PORT}`);
