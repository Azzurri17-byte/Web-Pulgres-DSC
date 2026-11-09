const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const db = require('../lib/connection')
const response = require('../utils/response')
const errorResponse = require('../utils/errorResponse')

const router = express.Router()

router.post('/', async (req, res) => {
    const { username, nim, password } = req.body || {}
    const normalizedUsername = typeof username === 'string' ? username.trim() : ''
    const normalizedNim = typeof nim === 'string' ? nim.trim() : ''

    if (!normalizedUsername || !normalizedNim || typeof password !== 'string' || !password) {
        return errorResponse(400, 'NIM, username, dan password wajib diisi', res)
    }
    if (!process.env.SECRET_KEY) {
        console.error('SECRET_KEY belum dikonfigurasi')
        return errorResponse(500, 'Konfigurasi server belum lengkap', res)
    }

    try {
        const [rows] = await db.promise().execute(
            `SELECT id, username, nim, password_hash, role, is_active FROM users WHERE username = ? AND nim = ? LIMIT 1`,
            [normalizedUsername, normalizedNim]
        )

        if (!rows.length) {
            return errorResponse(401, 'Kredensial tidak valid atau akun nonaktif', res)
        }

        const user = rows[0]
        const passwordMatch = await bcrypt.compare(password, user.password_hash)
        if (!passwordMatch) {
            return errorResponse(401, 'Kredensial tidak valid', res)
        }
        if (!user.is_active) {
            return errorResponse(403, 'Akun menunggu persetujuan admin atau sudah dinonaktifkan', res)
        }

        const token = jwt.sign(
            { sub: String(user.id), id: user.id, username: user.username, nim: user.nim, role: user.role },
            process.env.SECRET_KEY,
            { expiresIn: '1h' }
        )

        return response(200, 'Login berhasil', {
            token,
            user: { id: user.id, username: user.username, nim: user.nim, role: user.role }
        }, res)
    } catch (error) {
        console.error('Login gagal:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

module.exports = router
