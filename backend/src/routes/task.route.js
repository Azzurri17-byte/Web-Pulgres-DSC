const express = require('express')
const db = require('../lib/connection')
const verifyToken = require('../middleware/verifyToken')
const response = require('../utils/response')
const errorResponse = require('../utils/errorResponse')
const { getIo } = require('../utils/socket')

const router = express.Router()
const asId = (value) => /^\d+$/.test(String(value)) && Number(value) > 0
const notifyNewTask = (task) => {
    try {
        getIo().to('members').emit('new-task', { id: task.id, title: task.title, deadline: task.deadline })
    } catch (error) {
        if (error.message !== 'Socket belum diinisialisasi') throw error
    }
}

router.get('/', verifyToken(), async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))
    const offset = (page - 1) * limit
    try {
        const [rows] = req.user.role === 'admin'
            ? await db.promise().execute(
                `SELECT t.*, COALESCE(s.submission_count, 0) AS submission_count FROM tasks t
                 LEFT JOIN (SELECT task_id, COUNT(*) AS submission_count FROM submissions GROUP BY task_id) s
                   ON s.task_id = t.id
                 ORDER BY t.created_at DESC LIMIT ? OFFSET ?`, [limit, offset])
            : await db.promise().execute(
                `SELECT t.id, t.title, t.description, t.max_points, t.deadline, t.status,
                        (t.deadline IS NOT NULL AND t.deadline <= NOW()) AS is_expired,
                        t.created_at, s.id AS submission_id, s.status AS submission_status
                 FROM tasks t LEFT JOIN submissions s ON s.task_id = t.id AND s.user_id = ?
                 WHERE t.status = 'published' ORDER BY t.deadline IS NULL, t.deadline ASC
                 LIMIT ? OFFSET ?`, [req.user.id, limit, offset])
        return response(200, 'Daftar tugas berhasil diambil', { items: rows, page, limit }, res)
    } catch (error) {
        console.error('Gagal mengambil tugas:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.get('/:id', verifyToken(), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID tugas tidak valid', res)
    try {
        const [rows] = await db.promise().execute(
            `SELECT t.*, ${req.user.role === 'admin' ? 'NULL' : 's.status'} AS submission_status
             FROM tasks t ${req.user.role === 'admin' ? '' : 'LEFT JOIN submissions s ON s.task_id = t.id AND s.user_id = ?'}
             WHERE t.id = ? ${req.user.role === 'admin' ? '' : "AND t.status = 'published'"} LIMIT 1`,
            req.user.role === 'admin' ? [req.params.id] : [req.user.id, req.params.id]
        )
        if (!rows.length) return errorResponse(404, 'Tugas tidak ditemukan', res)
        return response(200, 'Detail tugas berhasil diambil', rows[0], res)
    } catch (error) {
        console.error('Gagal mengambil detail tugas:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.post('/', verifyToken(['admin']), async (req, res) => {
    const { title, description, max_points: maxPoints = 10, deadline = null, status = 'draft' } = req.body || {}
    if (typeof title !== 'string' || !title.trim() || title.length > 150 || typeof description !== 'string' || !description.trim()) {
        return errorResponse(400, 'Judul dan deskripsi tugas wajib diisi', res)
    }
    if (!Number.isInteger(maxPoints) || maxPoints < 0 || !['draft', 'published', 'archived'].includes(status)) {
        return errorResponse(400, 'Maksimal poin atau status tugas tidak valid', res)
    }
    if (deadline && Number.isNaN(Date.parse(deadline))) return errorResponse(400, 'Deadline tidak valid', res)
    const normalizedDeadline = deadline || null
    try {
        if (status === 'published' && normalizedDeadline) {
            const [expiry] = await db.promise().execute('SELECT ? <= NOW() AS expired', [normalizedDeadline])
            if (expiry[0].expired) return errorResponse(400, 'Deadline sudah lewat; tugas tidak dapat dipublikasikan', res)
        }
        const [result] = await db.promise().execute(
            'INSERT INTO tasks (title, description, max_points, deadline, status, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [title.trim(), description.trim(), maxPoints, normalizedDeadline, status, req.user.id]
        )
        const task = { id: result.insertId, title: title.trim(), deadline: normalizedDeadline }
        if (status === 'published') notifyNewTask(task)
        return response(201, 'Tugas berhasil dibuat', { id: result.insertId }, res)
    } catch (error) {
        console.error('Gagal membuat tugas:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.put('/:id', verifyToken(['admin']), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID tugas tidak valid', res)
    const { title, description, max_points: maxPoints, deadline = null, status } = req.body || {}
    if (typeof title !== 'string' || !title.trim() || title.length > 150 || typeof description !== 'string' || !description.trim() ||
        !Number.isInteger(maxPoints) || maxPoints < 0 || !['draft', 'published', 'archived'].includes(status)) {
        return errorResponse(400, 'Data tugas tidak valid', res)
    }
    if (deadline && Number.isNaN(Date.parse(deadline))) return errorResponse(400, 'Deadline tidak valid', res)
    const normalizedDeadline = deadline || null
    try {
        if (status === 'published' && normalizedDeadline) {
            const [expiry] = await db.promise().execute('SELECT ? <= NOW() AS expired', [normalizedDeadline])
            if (expiry[0].expired) return errorResponse(400, 'Deadline sudah lewat; tugas tidak dapat dipublikasikan', res)
        }
        const [result] = await db.promise().execute(
            'UPDATE tasks SET title = ?, description = ?, max_points = ?, deadline = ?, status = ? WHERE id = ?',
            [title.trim(), description.trim(), maxPoints, normalizedDeadline, status, req.params.id]
        )
        if (!result.affectedRows) return errorResponse(404, 'Tugas tidak ditemukan', res)
        if (status === 'published') notifyNewTask({ id: Number(req.params.id), title: title.trim(), deadline: normalizedDeadline })
        return response(200, 'Tugas berhasil diperbarui', null, res)
    } catch (error) {
        console.error('Gagal memperbarui tugas:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.patch('/:id/archive', verifyToken(['admin']), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID tugas tidak valid', res)
    try {
        const [result] = await db.promise().execute("UPDATE tasks SET status = 'archived' WHERE id = ?", [req.params.id])
        if (!result.affectedRows) return errorResponse(404, 'Tugas tidak ditemukan', res)
        return response(200, 'Tugas berhasil diarsipkan', null, res)
    } catch (error) {
        console.error('Gagal mengarsipkan tugas:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.patch('/:id/publish', verifyToken(['admin']), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID tugas tidak valid', res)
    try {
        const [result] = await db.promise().execute(
            "UPDATE tasks SET status = 'published' WHERE id = ? AND status IN ('draft', 'archived') AND (deadline IS NULL OR deadline > NOW())",
            [req.params.id]
        )
        if (!result.affectedRows) {
            const [rows] = await db.promise().execute('SELECT status, deadline, deadline IS NOT NULL AND deadline <= NOW() AS is_expired FROM tasks WHERE id = ? LIMIT 1', [req.params.id])
            if (!rows.length) return errorResponse(404, 'Tugas tidak ditemukan', res)
            if (Number(rows[0].is_expired)) return errorResponse(409, 'Deadline sudah lewat; ubah deadline tugas sebelum menerbitkannya kembali', res)
            return errorResponse(409, 'Tugas sudah berstatus published', res)
        }

        const [rows] = await db.promise().execute(
            'SELECT id, title, deadline FROM tasks WHERE id = ? LIMIT 1', [req.params.id]
        )
        const task = rows[0]
        notifyNewTask(task)
        return response(200, 'Tugas berhasil dipublikasikan', task, res)
    } catch (error) {
        console.error('Gagal mempublikasikan tugas:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.delete('/:id', verifyToken(['admin']), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID tugas tidak valid', res)
    const connection = await db.promise().getConnection()
    try {
        await connection.beginTransaction()
        const [tasks] = await connection.execute(
            'SELECT id FROM tasks WHERE id = ? FOR UPDATE', [req.params.id]
        )
        if (!tasks.length) {
            await connection.rollback()
            return errorResponse(404, 'Tugas tidak ditemukan', res)
        }

        const [submissions] = await connection.execute(
            'SELECT id FROM submissions WHERE task_id = ? LIMIT 1', [req.params.id]
        )
        if (submissions.length) {
            await connection.rollback()
            return errorResponse(409, 'Tugas tidak dapat dihapus karena sudah memiliki submission. Arsipkan tugas atau hapus submission terkait terlebih dahulu.', res)
        }

        await connection.execute('DELETE FROM tasks WHERE id = ?', [req.params.id])
        await connection.commit()
        return response(200, 'Tugas berhasil dihapus', { id: req.params.id }, res)
    } catch (error) {
        await connection.rollback()
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return errorResponse(409, 'Tugas tidak dapat dihapus karena sudah memiliki submission.', res)
        }
        console.error('Gagal menghapus tugas:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    } finally {
        connection.release()
    }
})

module.exports = router
