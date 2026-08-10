import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const COOKIE = 'ig_session'

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (secret && secret.length >= 16) return secret
  if (process.env.NODE_ENV === 'production') {
    console.warn('[server] JWT_SECRET missing or short — set a strong secret in production')
  }
  return secret || 'dev-only-insecure-jwt-secret'
}

export function signUser(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    getJwtSecret(),
    { expiresIn: '7d' }
  )
}

export function cookieOptions() {
  const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  }
}

export function clearCookieOptions() {
  const opts = cookieOptions()
  return { ...opts, maxAge: 0 }
}

export { COOKIE }

export function requireAuth(db) {
  return (req, res, next) => {
    const token = req.cookies?.[COOKIE]
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }
    try {
      const payload = jwt.verify(token, getJwtSecret())
      const user = db
        .prepare('SELECT id, email, role, created_at FROM users WHERE id = ?')
        .get(payload.sub)
      if (!user) {
        res.status(401).json({ error: 'User not found' })
        return
      }
      req.user = user
      next()
    } catch {
      res.status(401).json({ error: 'Invalid session' })
    }
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' })
    return
  }
  next()
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash)
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, 12)
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.created_at
  }
}
