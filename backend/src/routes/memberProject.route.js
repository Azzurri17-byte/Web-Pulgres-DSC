const express = require('express')
const db = require('../lib/connection')
const verifyToken = require('../middleware/verifyToken')
const response = require('../utils/response')
const errorResponse = require('../utils/errorResponse')
const { getIo } = require('../utils/socket')

const router = express.Router()
const validUrl = (value) => {
    if (!value) return true
    try {
        const parsed = new URL(value)
        return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname)
    } catch {
        return false
    }
}

const parseProject = (body) => {
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const description = typeof body?.description === 'string' ? body.description.trim() : ''
    const projectUrl = typeof body?.project_url === 'string' ? body.project_url.trim() : ''
    const repositoryUrl = typeof body?.repository_url === 'string' ? body.repository_url.trim() : ''
    if (!title || title.length > 150 || (body?.description != null && typeof body.description !== 'string') || description.length > 65535 ||
        projectUrl.length > 500 || repositoryUrl.length > 500 || (!projectUrl && !repositoryUrl) ||
        !validUrl(projectUrl) || !validUrl(repositoryUrl)) return null
    return { title, description: description || null, projectUrl: projectUrl || null, repositoryUrl: repositoryUrl || null }
}

router.get('/mine', verifyToken(['member']), async (req, res) => {
    try {
        const [[projects], [countRows]] = await Promise.all([
            db.promise().execute('SELECT id, title, description, project_url, repository_url, status, created_at FROM member_projects WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC', [req.user.id]),
            db.promise().execute('SELECT COUNT(*) AS total FROM member_projects WHERE user_id = ? AND created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY', [req.user.id])
        ])
        return response(200, 'Project saya berhasil diambil', { items: projects, created_today: countRows[0].total, daily_limit: 3 }, res)
    } catch (error) {
        console.error('Gagal mengambil project anggota:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.get('/admin/pending', verifyToken(['admin']), async (req, res) => {
    try {
        const [projects] = await db.promise().execute(
            `SELECT mp.id, mp.user_id, mp.title, mp.description, mp.project_url, mp.repository_url, mp.created_at,
                    u.username, p.display_name
             FROM member_projects mp JOIN users u ON u.id = mp.user_id
             LEFT JOIN user_profiles p ON p.user_id = u.id
             WHERE mp.status = 'pending' AND mp.deleted_at IS NULL
             ORDER BY mp.created_at ASC, mp.id ASC`
        )
        return response(200, 'Daftar project menunggu persetujuan berhasil diambil', projects, res)
    } catch (error) {
        console.error('Gagal mengambil project yang menunggu persetujuan:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.post('/', verifyToken(['member']), async (req, res) => {
    const project = parseProject(req.body)
    if (!project) return errorResponse(400, 'Isi judul dan minimal satu URL repository atau project yang valid (http/https)', res)
    let connection
    try {
        connection = await db.promise().getConnection()
        await connection.beginTransaction()
        // Lock akun agar dua request bersamaan tidak dapat melewati batas harian.
        const [users] = await connection.execute('SELECT id FROM users WHERE id = ? AND role = \'member\' FOR UPDATE', [req.user.id])
        if (!users.length) {
            await connection.rollback()
            return errorResponse(403, 'Fitur project hanya tersedia untuk akun member', res)
        }
        const [countRows] = await connection.execute(
            'SELECT COUNT(*) AS total FROM member_projects WHERE user_id = ? AND created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY',
            [req.user.id]
        )
        if (Number(countRows[0].total) >= 3) {
            await connection.rollback()
            return errorResponse(429, 'Batas tiga project per hari sudah tercapai', res)
        }
        const [result] = await connection.execute(
            "INSERT INTO member_projects (user_id, title, description, project_url, repository_url, status) VALUES (?, ?, ?, ?, ?, 'pending')",
            [req.user.id, project.title, project.description, project.projectUrl, project.repositoryUrl]
        )
        await connection.commit()
        return response(201, 'Project berhasil dikirim dan menunggu persetujuan admin', { id: result.insertId, ...project, status: 'pending' }, res)
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {})
        console.error('Gagal menambahkan project anggota:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    } finally {
        if (connection) connection.release()
    }
})

router.patch('/:id/status', verifyToken(['member']), async (req, res) => {
    if (!/^\d+$/.test(String(req.params.id)) || !['published', 'archived'].includes(req.body?.status)) {
        return errorResponse(400, 'ID atau status project tidak valid', res)
    }
    try {
        const [result] = await db.promise().execute(
            "UPDATE member_projects SET status = ? WHERE id = ? AND user_id = ? AND status IN ('published', 'archived') AND deleted_at IS NULL",
            [req.body.status, req.params.id, req.user.id]
        )
        if (!result.affectedRows) return errorResponse(404, 'Project tidak ditemukan', res)
        return response(200, 'Status project berhasil diperbarui', null, res)
    } catch (error) {
        console.error('Gagal memperbarui status project:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.patch('/:id', verifyToken(['member']), async (req, res) => {
    if (!/^\d+$/.test(String(req.params.id))) return errorResponse(400, 'ID project tidak valid', res)
    const project = parseProject(req.body)
    if (!project) return errorResponse(400, 'Isi judul dan minimal satu URL repository atau project yang valid (http/https)', res)
    try {
        const [result] = await db.promise().execute(
            "UPDATE member_projects SET title = ?, description = ?, project_url = ?, repository_url = ? WHERE id = ? AND user_id = ? AND status IN ('published', 'archived') AND deleted_at IS NULL",
            [project.title, project.description, project.projectUrl, project.repositoryUrl, req.params.id, req.user.id]
        )
        if (!result.affectedRows) {
            const [rows] = await db.promise().execute("SELECT id FROM member_projects WHERE id = ? AND user_id = ? AND status IN ('published', 'archived') AND deleted_at IS NULL LIMIT 1", [req.params.id, req.user.id])
            if (!rows.length) return errorResponse(404, 'Project tidak ditemukan', res)
        }
        return response(200, 'Project berhasil diperbarui', null, res)
    } catch (error) {
        console.error('Gagal memperbarui project anggota:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.delete('/:id', verifyToken(['member']), async (req, res) => {
    if (!/^\d+$/.test(String(req.params.id))) return errorResponse(400, 'ID project tidak valid', res)
    try {
        const [result] = await db.promise().execute(
            "UPDATE member_projects SET deleted_at = CURRENT_TIMESTAMP, status = 'archived' WHERE id = ? AND user_id = ? AND status IN ('published', 'archived') AND deleted_at IS NULL",
            [req.params.id, req.user.id]
        )
        if (!result.affectedRows) return errorResponse(404, 'Project tidak ditemukan', res)
        return response(200, 'Project berhasil dihapus', null, res)
    } catch (error) {
        console.error('Gagal menghapus project anggota:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.patch('/:id/approve', verifyToken(['admin']), async (req, res) => {
    if (!/^\d+$/.test(String(req.params.id))) return errorResponse(400, 'ID project tidak valid', res)
    const connection = await db.promise().getConnection()
    let project
    try {
        await connection.beginTransaction()
        const [rows] = await connection.execute(
            "SELECT id, user_id, title, status FROM member_projects WHERE id = ? AND deleted_at IS NULL FOR UPDATE",
            [req.params.id]
        )
        if (!rows.length) {
            await connection.rollback()
            return errorResponse(404, 'Project tidak ditemukan', res)
        }
        project = rows[0]
        if (project.status !== 'pending') {
            await connection.rollback()
            return errorResponse(409, 'Project ini sudah diproses', res)
        }
        await connection.execute("UPDATE member_projects SET status = 'published' WHERE id = ?", [project.id])
        await connection.execute(
            "INSERT INTO point_transactions (user_id, transaction_type, points_delta, description, created_by) VALUES (?, 'award', 5, ?, ?)",
            [project.user_id, `Project disetujui: ${project.title}`.slice(0, 255), req.user.id]
        )
        await connection.commit()
    } catch (error) {
        await connection.rollback().catch(() => {})
        console.error('Gagal menyetujui project anggota:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    } finally {
        connection.release()
    }
    try {
        const [totals] = await db.promise().execute(
            'SELECT COALESCE(SUM(points_delta), 0) AS total_points FROM point_transactions WHERE user_id = ?', [project.user_id]
        )
        getIo().to(`user:${project.user_id}`).emit('points-earned', {
            points: 5,
            total_points: totals[0].total_points,
            description: `Project disetujui: ${project.title}`
        })
    } catch (error) {
        if (error.message !== 'Socket belum diinisialisasi') console.error('Project disetujui, tetapi notifikasi poin gagal dikirim:', error)
    }
    return response(200, 'Project berhasil disetujui dan 5 poin diberikan', null, res)
})

router.delete('/:id/reject', verifyToken(['admin']), async (req, res) => {
    if (!/^\d+$/.test(String(req.params.id))) return errorResponse(400, 'ID project tidak valid', res)
    try {
        const [result] = await db.promise().execute(
            "UPDATE member_projects SET status = 'archived', deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending' AND deleted_at IS NULL",
            [req.params.id]
        )
        if (!result.affectedRows) return errorResponse(404, 'Project menunggu persetujuan tidak ditemukan', res)
        return response(200, 'Project ditolak dan dihapus', null, res)
    } catch (error) {
        console.error('Gagal menolak project anggota:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

module.exports = router
