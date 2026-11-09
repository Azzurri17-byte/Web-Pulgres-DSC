const express = require('express')
const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')
const bcrypt = require('bcrypt')
const multer = require('multer')
const db = require('../lib/connection')
const verifyToken = require('../middleware/verifyToken')
const response = require('../utils/response')
const errorResponse = require('../utils/errorResponse')

const router = express.Router()
const avatarDirectory = path.resolve(__dirname, '../../storage/avatars')
const uploadAvatar = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })
const avatarTypes = {
    'image/jpeg': { extension: 'jpg', valid: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
    'image/png': { extension: 'png', valid: (buffer) => buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) },
    'image/webp': { extension: 'webp', valid: (buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' }
}
const managedAvatarPath = (avatarUrl) => {
    const match = /^\/api\/profile\/avatar\/([a-f0-9]{32}\.(?:jpg|png|webp))$/i.exec(avatarUrl || '')
    return match ? path.join(avatarDirectory, match[1]) : null
}
const matchesPasswordKey = (providedKey) => {
    const configuredKey = process.env.PWD_KEY
    if (typeof configuredKey !== 'string' || !configuredKey || typeof providedKey !== 'string' || !providedKey) return false
    const expected = Buffer.from(configuredKey)
    const provided = Buffer.from(providedKey)
    return expected.length === provided.length && crypto.timingSafeEqual(expected, provided)
}
const isPasswordKeyConfigured = () => typeof process.env.PWD_KEY === 'string' && process.env.PWD_KEY.length > 0

router.get('/avatar/:filename', async (req, res) => {
    const filename = req.params.filename
    if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/i.test(filename)) return errorResponse(404, 'Avatar tidak ditemukan', res)
    const filepath = path.join(avatarDirectory, filename)
    try {
        const mimeType = path.extname(filename).toLowerCase() === '.png' ? 'image/png'
            : path.extname(filename).toLowerCase() === '.webp' ? 'image/webp' : 'image/jpeg'
        res.setHeader('Content-Type', mimeType)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cache-Control', 'public, max-age=86400')
        return res.sendFile(filepath, (error) => {
            if (error && !res.headersSent) return errorResponse(404, 'Avatar tidak ditemukan', res)
        })
    } catch (error) {
        console.error('Gagal mengambil avatar:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.get('/', verifyToken(), async (req, res) => {
    try {
        const [rows] = await db.promise().execute(
            `SELECT u.id, u.username, u.nim, u.role, p.display_name, p.bio, p.avatar_url
             FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ? LIMIT 1`, [req.user.id]
        )
        if (!rows.length) return errorResponse(404, 'Profil tidak ditemukan', res)
        return response(200, 'Profil berhasil diambil', rows[0], res)
    } catch (error) {
        console.error('Gagal mengambil profil:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.post('/admin/password/verify', verifyToken(['admin']), (req, res) => {
    if (!isPasswordKeyConfigured()) return errorResponse(500, 'Konfigurasi server belum lengkap', res)
    if (!matchesPasswordKey(req.body?.pwd_key)) return errorResponse(403, 'Key konfirmasi tidak valid', res)
    return response(200, 'Key konfirmasi berhasil', null, res)
})

router.patch('/admin/password', verifyToken(['admin']), async (req, res) => {
    const { pwd_key: passwordKey, password } = req.body || {}
    if (!isPasswordKeyConfigured()) return errorResponse(500, 'Konfigurasi server belum lengkap', res)
    if (!matchesPasswordKey(passwordKey)) return errorResponse(403, 'Key konfirmasi tidak valid', res)
    if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
        return errorResponse(400, 'Password harus 8 sampai 72 byte', res)
    }
    try {
        const passwordHash = await bcrypt.hash(password, 12)
        const [result] = await db.promise().execute(
            "UPDATE users SET password_hash = ? WHERE id = ? AND role = 'admin'",
            [passwordHash, req.user.id]
        )
        if (!result.affectedRows) return errorResponse(404, 'Akun admin tidak ditemukan', res)
        return response(200, 'Password admin berhasil diubah', null, res)
    } catch (error) {
        console.error('Gagal mengubah password admin:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.put('/', verifyToken(), (req, res, next) => {
    uploadAvatar.single('avatar')(req, res, (error) => {
        if (error) return errorResponse(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
            error.code === 'LIMIT_FILE_SIZE' ? 'Ukuran gambar maksimal 5 MB' : error.message, res)
        return next()
    })
}, async (req, res) => {
    const { display_name: displayName, bio = null } = req.body || {}
    const clearAvatar = req.body?.clear_avatar === true || req.body?.clear_avatar === 'true' || req.body?.clear_avatar === '1'
    if (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 100 ||
        (bio !== null && typeof bio !== 'string')) {
        return errorResponse(400, 'Data profil tidak valid', res)
    }
    let uploadedAvatarUrl = null
    let avatarFilepath = null
    if (req.file) {
        const type = avatarTypes[req.file.mimetype]
        if (!type || !type.valid(req.file.buffer)) return errorResponse(400, 'Gambar harus berupa JPEG, PNG, atau WebP yang valid', res)
        const filename = `${crypto.randomBytes(16).toString('hex')}.${type.extension}`
        uploadedAvatarUrl = `/api/profile/avatar/${filename}`
        avatarFilepath = path.join(avatarDirectory, filename)
    }
    try {
        const [existingRows] = await db.promise().execute('SELECT avatar_url FROM user_profiles WHERE user_id = ? LIMIT 1', [req.user.id])
        const oldAvatar = managedAvatarPath(existingRows[0]?.avatar_url)
        if (req.file) {
            await fs.mkdir(avatarDirectory, { recursive: true })
            await fs.writeFile(avatarFilepath, req.file.buffer, { flag: 'wx', mode: 0o600 })
        }
        const avatarUrl = uploadedAvatarUrl || (clearAvatar ? null : existingRows[0]?.avatar_url || null)
        await db.promise().execute(
            `INSERT INTO user_profiles (user_id, display_name, bio, avatar_url) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), bio = VALUES(bio), avatar_url = VALUES(avatar_url)`,
            [req.user.id, displayName.trim(), bio, avatarUrl]
        )
        if (oldAvatar && oldAvatar !== avatarFilepath && (req.file || clearAvatar)) await fs.unlink(oldAvatar).catch((error) => {
            if (error.code !== 'ENOENT') console.error('Gagal menghapus avatar lama:', error)
        })
        return response(200, 'Profil berhasil diperbarui', null, res)
    } catch (error) {
        if (avatarFilepath) await fs.unlink(avatarFilepath).catch(() => {})
        console.error('Gagal memperbarui profil:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

module.exports = router
