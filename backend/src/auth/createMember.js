const bcrypt = require('bcrypt')
const db = require('../lib/connection')
const response = require('../utils/response')
const errorResponse = require('../utils/errorResponse')

async function createMember(req, res) {
    const { username, nim, password, display_name: displayName } = req.body || {}

    if (![username, nim, password, displayName].every((value) => typeof value === 'string' && value.trim())) {
        return errorResponse(400, 'Username, NIM, password, dan nama tampilan wajib diisi', res)
    }
    if (username.trim().length > 50 || nim.trim().length > 30 || displayName.trim().length > 100) {
        return errorResponse(400, 'Panjang username, NIM, atau nama tampilan melebihi batas', res)
    }
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
        return errorResponse(400, 'Password harus 8 sampai 72 byte', res)
    }

    const connection = await db.promise().getConnection()
    try {
        const passwordHash = await bcrypt.hash(password, 12)
        await connection.beginTransaction()
        const isActive = req.user?.role === 'admin'
        const [result] = await connection.execute(
            'INSERT INTO users (username, nim, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
            [username.trim(), nim.trim(), passwordHash, 'member', isActive]
        )
        await connection.execute(
            'INSERT INTO user_profiles (user_id, display_name) VALUES (?, ?)',
            [result.insertId, displayName.trim()]
        )
        await connection.commit()
        return response(201, 'Akun anggota berhasil dibuat', { id: result.insertId }, res)
    } catch (error) {
        await connection.rollback()
        if (error.code === 'ER_DUP_ENTRY') {
            return errorResponse(409, 'NIM atau username sudah terdaftar', res)
        }
        console.error('Registrasi anggota gagal:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    } finally {
        connection.release()
    }
}

module.exports = createMember
