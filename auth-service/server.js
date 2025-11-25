const express = require('express')
const cors = require('cors')
const { randomUUID } = require('crypto')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const bcrypt = require('bcryptjs')
const { z } = require('zod')
require('dotenv').config()

const PORT = process.env.PORT || 4000
const ALLOWED_ORIGINS = (
  process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const dataDir = path.join(__dirname, 'data')
const usersFile = path.join(dataDir, 'users.json')
const adminsFile = path.join(dataDir, 'admins.json')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}
const ensureFile = (file) => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify([], null, 2), 'utf8')
  }
}

ensureFile(usersFile)
ensureFile(adminsFile)

const registerSchema = z.object({
  name: z.string().min(2).max(40),
  email: z.string().email(),
  password: z.string().min(6).max(64),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(64),
})

const todoCreateSchema = z.object({
  label: z.string().min(1).max(140),
})

const adminCreateUserSchema = registerSchema.extend({
  role: z.enum(['user', 'admin']).optional(),
})

async function readUsers() {
  const raw = await fsp.readFile(usersFile, 'utf8')
  return JSON.parse(raw)
}

async function writeUsers(users) {
  await fsp.writeFile(usersFile, JSON.stringify(users, null, 2), 'utf8')
}

async function readAdmins() {
  const raw = await fsp.readFile(adminsFile, 'utf8')
  return JSON.parse(raw)
}

async function writeAdmins(admins) {
  await fsp.writeFile(adminsFile, JSON.stringify(admins, null, 2), 'utf8')
}

function scrubMember(user) {
  const { passwordHash, ...rest } = user
  return rest
}

const sessions = new Map()

function createSession(userId, role) {
  const token = randomUUID()
  sessions.set(token, { userId, role, createdAt: Date.now() })
  return token
}

function getSession(token) {
  const entry = sessions.get(token)
  if (!entry) return null
  return entry
}

async function ensureSeedAdmin() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'owner@winery.board').toLowerCase()
  const adminPassword = process.env.ADMIN_PASSWORD || 'wineryadmin'
  const adminName = process.env.ADMIN_NAME || 'Builder'
  const admins = await readAdmins()
  const exists = admins.find((user) => user.email === adminEmail)
  if (exists) return
  const passwordHash = await bcrypt.hash(adminPassword, 10)
  const adminUser = {
    id: randomUUID(),
    name: adminName,
    email: adminEmail,
    passwordHash,
    role: 'admin',
    createdAt: Date.now(),
    todos: [],
  }
  admins.push(adminUser)
  await writeAdmins(admins)
  console.log(`seeded admin ${adminEmail}`)
}

async function requireAuth(req, res, requireAdmin = false) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'missing-token' })
    return null
  }
  const token = authHeader.replace('Bearer ', '')
  const session = getSession(token)
  if (!session) {
    res.status(401).json({ message: 'invalid-token' })
    return null
  }
  const reader = session.role === 'admin' ? readAdmins : readUsers
  const writer = session.role === 'admin' ? writeAdmins : writeUsers
  const list = await reader()
  const user = list.find((entry) => entry.id === session.userId)
  if (!user) {
    res.status(401).json({ message: 'invalid-token' })
    return null
  }
  if (requireAdmin && session.role !== 'admin') {
    res.status(403).json({ message: 'forbidden' })
    return null
  }
  user.todos = user.todos || []
  return { user, list, writer, token, role: session.role }
}

const app = express()
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true)
        return
      }
      if (ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Origin not allowed'), false)
    },
    credentials: true,
  }),
)
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.post('/api/auth/register', async (req, res) => {
  try {
    const payload = registerSchema.parse(req.body)
    const [users, admins] = await Promise.all([readUsers(), readAdmins()])
    const exists =
      users.find(
        (user) => user.email.toLowerCase() === payload.email.toLowerCase(),
      ) ||
      admins.find(
        (admin) => admin.email.toLowerCase() === payload.email.toLowerCase(),
      )
    if (exists) {
      return res.status(409).json({ message: 'email-in-use' })
    }
    const passwordHash = await bcrypt.hash(payload.password, 10)
    const newUser = {
      id: randomUUID(),
      name: payload.name.trim(),
      email: payload.email.toLowerCase(),
      passwordHash,
      createdAt: Date.now(),
      role: 'user',
      todos: [],
    }
    users.push(newUser)
    await writeUsers(users)
    const token = createSession(newUser.id, 'user')
    res.status(201).json({
      token,
      profile: scrubMember(newUser),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'validation-error' })
      return
    }
    console.error('register error', error)
    res.status(500).json({ message: 'server-error' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const payload = loginSchema.parse(req.body)
    const [users, admins] = await Promise.all([readUsers(), readAdmins()])
    const email = payload.email.toLowerCase()
    let user = users.find((entry) => entry.email === email)
    let role = 'user'
    if (!user) {
      user = admins.find((entry) => entry.email === email)
      role = 'admin'
    }
    if (!user) {
      return res.status(401).json({ message: 'invalid-credentials' })
    }
    const match = await bcrypt.compare(payload.password, user.passwordHash)
    if (!match) {
      return res.status(401).json({ message: 'invalid-credentials' })
    }
    const token = createSession(user.id, role)
    res.status(200).json({ token, profile: scrubMember(user) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'validation-error' })
      return
    }
    console.error('login error', error)
    res.status(500).json({ message: 'server-error' })
  }
})

app.get('/api/auth/session', async (req, res) => {
  const auth = await requireAuth(req, res)
  if (!auth) return
  res.json({ profile: scrubMember(auth.user) })
})

app.get('/api/todos', async (req, res) => {
  const auth = await requireAuth(req, res)
  if (!auth) return
  res.json({ todos: auth.user.todos || [] })
})

app.post('/api/todos', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const payload = todoCreateSchema.parse(req.body)
    const todo = {
      id: randomUUID(),
      label: payload.label.trim(),
      done: false,
      createdAt: Date.now(),
    }
    auth.user.todos = [todo, ...(auth.user.todos || [])]
    await auth.writer(auth.list)
    res.status(201).json({ todo })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'validation-error' })
      return
    }
    console.error('todo create error', error)
    res.status(500).json({ message: 'server-error' })
  }
})

app.patch('/api/todos/:id', async (req, res) => {
  const auth = await requireAuth(req, res)
  if (!auth) return
  const todo = (auth.user.todos || []).find((item) => item.id === req.params.id)
  if (!todo) {
    return res.status(404).json({ message: 'not-found' })
  }
  todo.done = typeof req.body?.done === 'boolean' ? req.body.done : !todo.done
  await auth.writer(auth.list)
  res.json({ todo })
})

app.delete('/api/todos/:id', async (req, res) => {
  const auth = await requireAuth(req, res)
  if (!auth) return
  const before = auth.user.todos || []
  const next = before.filter((item) => item.id !== req.params.id)
  if (next.length === before.length) {
    return res.status(404).json({ message: 'not-found' })
  }
  auth.user.todos = next
  await auth.writer(auth.list)
  res.status(204).end()
})

app.get('/api/admin/overview', async (req, res) => {
  const auth = await requireAuth(req, res, true)
  if (!auth) return
  const [users, admins] = await Promise.all([readUsers(), readAdmins()])
  res.json({
    users: users.map((user) => ({
      ...scrubMember(user),
      todos: user.todos || [],
    })),
    admins: admins.map((admin) => ({
      ...scrubMember(admin),
      todos: admin.todos || [],
    })),
  })
})

app.post('/api/admin/users', async (req, res) => {
  try {
    const auth = await requireAuth(req, res, true)
    if (!auth) return
    const payload = adminCreateUserSchema.parse(req.body)
    const email = payload.email.toLowerCase()
    const [users, admins] = await Promise.all([readUsers(), readAdmins()])
    const exists =
      users.find((user) => user.email === email) ||
      admins.find((admin) => admin.email === email)
    if (exists) {
      return res.status(409).json({ message: 'email-in-use' })
    }
    const passwordHash = await bcrypt.hash(payload.password, 10)
    const newUser = {
      id: randomUUID(),
      name: payload.name.trim(),
      email,
      passwordHash,
      createdAt: Date.now(),
      role: payload.role || 'user',
      todos: [],
    }
    if (newUser.role === 'admin') {
      admins.push(newUser)
      await writeAdmins(admins)
    } else {
      users.push(newUser)
      await writeUsers(users)
    }
    res.status(201).json({ profile: scrubMember(newUser) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'validation-error' })
      return
    }
    console.error('admin create user error', error)
    res.status(500).json({ message: 'server-error' })
  }
})

async function bootstrap() {
  await ensureSeedAdmin()
  app.listen(PORT, () => {
    console.log(`auth service ready on :${PORT}`)
  })
}

bootstrap().catch((error) => {
  console.error('failed to start server', error)
  process.exit(1)
})

