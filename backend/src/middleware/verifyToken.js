const jwt = require('jsonwebtoken')
const db = require('../lib/connection')
const errorResponse = require('../utils/errorResponse')

const verifyToken = (roles = []) => async (req, res, next) => {
    const authorization = req.headers.authorization || ''
    const [scheme, token, ...extra] = authorization.split(' ')
    if (scheme !== 'Bearer' || !token || extra.length) {
        return errorResponse(401, 'Header Authorization harus menggunakan format Bearer token', res)
    }
    if (!process.env.SECRET_KEY) {
        console.error('SECRET_KEY belum dikonfigurasi')
        return errorResponse(500, 'Konfigurasi server belum lengkap', res)
    }

    try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY)
        const userId = decoded.sub || decoded.id
        if (!userId) return errorResponse(401, 'Token tidak memiliki identitas akun', res)
        const [rows] = await db.promise().execute(
            'SELECT id, username, nim, role, is_active FROM users WHERE id = ? LIMIT 1',
            [userId]
        )
        const user = rows[0]
        if (!user || !user.is_active) {
            return errorResponse(401, 'Token tidak valid atau akun nonaktif', res)
        }
        if (roles.length && !roles.includes(user.role)) {
            return errorResponse(403, 'Akses ditolak', res)
        }

        req.user = { id: user.id, username: user.username, nim: user.nim, role: user.role }
        req.role = req.user
        return next()
    } catch (error) {
        if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') {
            console.error('Verifikasi token gagal:', error)
            return errorResponse(500, 'Terjadi kesalahan pada server', res)
        }
        return errorResponse(401, 'Token tidak valid atau sudah kedaluwarsa', res)
    }
}

module.exports = verifyToken
