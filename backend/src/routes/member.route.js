const express = require('express')
const bcrypt = require('bcrypt')
const db = require('../lib/connection')
const createMember = require('../auth/createMember')
const verifyToken = require('../middleware/verifyToken')
const response = require('../utils/response')
const errorResponse = require('../utils/errorResponse')
const { getIo } = require('../utils/socket')

const router = express.Router()
const asId = (value) => /^\d+$/.test(String(value)) && Number(value) > 0
const disconnectMember = (id) => {
    try { getIo().in(`user:${id}`).disconnectSockets(true) } catch (error) {
        if (error.message !== 'Socket belum diinisialisasi') throw error
    }
}

router.post('/', verifyToken(['admin']), createMember)

router.get('/', verifyToken(['admin']), async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))
    const search = typeof req.query.search === 'string' ? `%${req.query.search.trim()}%` : null
    const status = req.query.status || 'all'
    if (!['all', 'pending', 'active'].includes(status)) return errorResponse(400, 'Filter status tidak valid', res)
    const activeFilter = status === 'pending' ? ' AND u.is_active = FALSE' : status === 'active' ? ' AND u.is_active = TRUE' : ''
    try {
        const [[rows], [countRows]] = await Promise.all([
            db.promise().execute(
            `SELECT u.id, u.username, u.nim, u.role, u.is_active, u.created_at,
                    p.display_name, p.avatar_url,
                    COALESCE(pt.total_points, 0) AS total_points
             FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
             LEFT JOIN (SELECT user_id, SUM(points_delta) AS total_points
                        FROM point_transactions GROUP BY user_id) pt ON pt.user_id = u.id
             WHERE u.role = 'member'${activeFilter} AND (? IS NULL OR u.username LIKE ? OR u.nim LIKE ? OR p.display_name LIKE ?)
             ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
            [search, search, search, search, limit, (page - 1) * limit]
            ),
            db.promise().execute(
                `SELECT COUNT(*) AS total FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
                 WHERE u.role = 'member'${activeFilter} AND (? IS NULL OR u.username LIKE ? OR u.nim LIKE ? OR p.display_name LIKE ?)`,
                [search, search, search, search]
            )
        ])
        return response(200, 'Daftar anggota berhasil diambil', { items: rows, total: countRows[0].total, page, limit }, res)
    } catch (error) {
        console.error('Gagal mengambil anggota:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.patch('/:id/approve', verifyToken(['admin']), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID anggota tidak valid', res)
    try {
        const [result] = await db.promise().execute(
            "UPDATE users SET is_active = TRUE WHERE id = ? AND role = 'member' AND is_active = FALSE",
            [req.params.id]
        )
        if (!result.affectedRows) {
            const [rows] = await db.promise().execute("SELECT is_active FROM users WHERE id = ? AND role = 'member' LIMIT 1", [req.params.id])
            if (!rows.length) return errorResponse(404, 'Permintaan akun tidak ditemukan', res)
            return errorResponse(409, 'Akun anggota sudah aktif', res)
        }
        return response(200, 'Permintaan akun disetujui. Anggota sekarang dapat masuk.', null, res)
    } catch (error) {
        console.error('Gagal menyetujui permintaan akun:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.delete('/:id', verifyToken(['admin']), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID permintaan akun tidak valid', res)
    try {
        const [result] = await db.promise().execute(
            "DELETE FROM users WHERE id = ? AND role = 'member' AND is_active = FALSE",
            [req.params.id]
        )
        if (!result.affectedRows) {
            const [rows] = await db.promise().execute("SELECT is_active FROM users WHERE id = ? AND role = 'member' LIMIT 1", [req.params.id])
            if (!rows.length) return errorResponse(404, 'Permintaan akun tidak ditemukan', res)
            return errorResponse(409, 'Akun sudah aktif dan tidak dapat dihapus dari daftar permintaan', res)
        }
        return response(200, 'Permintaan akun ditolak dan dihapus', { id: req.params.id }, res)
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') return errorResponse(409, 'Akun memiliki data terkait dan tidak dapat dihapus', res)
        console.error('Gagal menghapus permintaan akun:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.get('/:id', verifyToken(), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID anggota tidak valid', res)
    try {
        const canSeeNim = req.user.role === 'admin' || Number(req.params.id) === Number(req.user.id)
        const [rows] = await db.promise().execute(
            `SELECT u.id, u.username, ${canSeeNim ? 'u.nim,' : ''} u.role, p.display_name, p.bio, p.avatar_url,
                    COALESCE((SELECT SUM(points_delta) FROM point_transactions WHERE user_id = u.id), 0) AS total_points,
                    (SELECT COUNT(*) FROM submissions WHERE user_id = u.id AND status = 'approved') AS completed_tasks
             FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
             WHERE u.id = ? AND u.role = 'member' AND (? = TRUE OR u.is_active = TRUE) LIMIT 1`, [req.params.id, canSeeNim]
        )
        if (!rows.length) return errorResponse(404, 'Anggota tidak ditemukan', res)
        const [projects] = await db.promise().execute(
            "SELECT id, title, description, project_url, repository_url, created_at FROM member_projects WHERE user_id = ? AND status = 'published' AND deleted_at IS NULL ORDER BY created_at DESC, id DESC",
            [req.params.id]
        )
        rows[0].projects = projects
        return response(200, 'Profil anggota berhasil diambil', rows[0], res)
    } catch (error) {
        console.error('Gagal mengambil profil anggota:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.patch('/:id', verifyToken(['admin']), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID anggota tidak valid', res)
    const { is_active: isActive } = req.body || {}
    if (typeof isActive !== 'boolean') return errorResponse(400, 'is_active harus berupa boolean', res)
    try {
        const [result] = await db.promise().execute(
            "UPDATE users SET is_active = ? WHERE id = ? AND role = 'member'",
            [isActive, req.params.id]
        )
        if (!result.affectedRows) return errorResponse(404, 'Anggota tidak ditemukan', res)
        if (!isActive) disconnectMember(req.params.id)
        return response(200, `Akun anggota berhasil ${isActive ? 'diaktifkan' : 'dinonaktifkan'}`, null, res)
    } catch (error) {
        console.error('Gagal mengubah status anggota:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

const updateMemberPassword = async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID anggota tidak valid', res)
    const { password } = req.body || {}
    if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
        return errorResponse(400, 'Password harus 8 sampai 72 byte', res)
    }
    try {
        const passwordHash = await bcrypt.hash(password, 12)
        const [result] = await db.promise().execute(
            "UPDATE users SET password_hash = ? WHERE id = ? AND role = 'member'",
            [passwordHash, req.params.id]
        )
        if (!result.affectedRows) return errorResponse(404, 'Anggota tidak ditemukan', res)
        return response(200, 'Password anggota berhasil diubah', null, res)
    } catch (error) {
        console.error('Gagal mereset password:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
}

router.patch('/:id/password', verifyToken(['admin']), updateMemberPassword)
router.patch('/:id/reset-password', verifyToken(['admin']), updateMemberPassword)

module.exports = router
