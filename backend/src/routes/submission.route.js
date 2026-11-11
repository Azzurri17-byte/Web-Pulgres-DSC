const express = require('express')
const fs = require('fs/promises')
const path = require('path')
const db = require('../lib/connection')
const upload = require('../lib/uploadMulter')
const isPdfFile = require('../lib/validatePdf')
const verifyToken = require('../middleware/verifyToken')
const response = require('../utils/response')
const errorResponse = require('../utils/errorResponse')
const { getIo } = require('../utils/socket')

const router = express.Router()
const asId = (value) => /^\d+$/.test(String(value)) && Number(value) > 0
const isPdfUrl = (value) => {
    try {
        const url = new URL(value)
        return ['http:', 'https:'].includes(url.protocol) && /\.pdf$/i.test(url.pathname)
    } catch {
        return false
    }
}
const removeUploadedFile = async (file) => {
    if (file) await fs.unlink(file.path).catch(() => {})
}
const removeStoredAttachment = async (attachmentUrl) => {
    const match = /^\/uploads\/([a-f0-9]{30}\.pdf)$/i.exec(attachmentUrl || '')
    if (match) await fs.unlink(path.join(upload.uploadDirectory, match[1])).catch((error) => {
        if (error.code !== 'ENOENT') console.error('Gagal membersihkan file submission:', error)
    })
}
const notify = (event, targetId, data) => {
    try {
        const io = getIo()
        io.to(`user:${targetId}`).emit(event, data)
    } catch (error) {
        if (error.message !== 'Socket belum diinisialisasi') throw error
    }
}
const handleUpload = (req, res, next) => upload.single('attachment')(req, res, (error) => {
    if (error) return errorResponse(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.message, res)
    if (!req.file) return next()
    isPdfFile(req.file.path).then(async (valid) => {
        if (!valid) {
            await removeUploadedFile(req.file)
            return errorResponse(400, 'Isi file tidak valid sebagai PDF', res)
        }
        return next()
    }).catch(async (validationError) => {
        await removeUploadedFile(req.file)
        console.error('Validasi PDF gagal:', validationError)
        return errorResponse(500, 'File gagal divalidasi', res)
    })
})

router.get('/', verifyToken(['admin']), async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))
    const offset = (page - 1) * limit
    const filters = []
    const values = []
    if (req.query.task_id) {
        if (!asId(req.query.task_id)) return errorResponse(400, 'ID tugas tidak valid', res)
        filters.push('s.task_id = ?'); values.push(req.query.task_id)
    }
    if (req.query.user_id) {
        if (!asId(req.query.user_id)) return errorResponse(400, 'ID anggota tidak valid', res)
        filters.push('s.user_id = ?'); values.push(req.query.user_id)
    }
    if (req.query.status) {
        if (!['pending', 'approved', 'revision'].includes(req.query.status)) return errorResponse(400, 'Status tidak valid', res)
        filters.push('s.status = ?'); values.push(req.query.status)
    }
    try {
        const [rows] = await db.promise().execute(
            `SELECT s.*, t.title AS task_title, t.max_points, u.username, p.display_name, reviewer.username AS reviewer_username
             FROM submissions s JOIN tasks t ON t.id = s.task_id JOIN users u ON u.id = s.user_id
             LEFT JOIN user_profiles p ON p.user_id = u.id LEFT JOIN users reviewer ON reviewer.id = s.reviewed_by
             ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
             ORDER BY s.submitted_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]
        )
        return response(200, 'Daftar submission berhasil diambil', { items: rows, page, limit }, res)
    } catch (error) {
        console.error('Gagal mengambil submission:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.get('/my', verifyToken(['member']), async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))
    try {
        const [rows] = await db.promise().execute(
            `SELECT s.*, t.title AS task_title, t.max_points FROM submissions s
             JOIN tasks t ON t.id = s.task_id WHERE s.user_id = ?
             ORDER BY s.submitted_at DESC LIMIT ? OFFSET ?`,
            [req.user.id, limit, (page - 1) * limit]
        )
        return response(200, 'Submission Anda berhasil diambil', { items: rows, page, limit }, res)
    } catch (error) {
        console.error('Gagal mengambil submission anggota:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.get('/files/:filename', verifyToken(), async (req, res) => {
    const { filename } = req.params
    if (!/^[a-f0-9]{30}\.pdf$/i.test(filename)) return errorResponse(404, 'File tidak ditemukan', res)
    try {
        const [rows] = await db.promise().execute(
            'SELECT id, user_id FROM submissions WHERE attachment_url = ? LIMIT 1',
            [`/uploads/${filename}`]
        )
        if (!rows.length) return errorResponse(404, 'File tidak ditemukan', res)
        if (req.user.role !== 'admin' && String(rows[0].user_id) !== String(req.user.id)) {
            return errorResponse(403, 'Akses ditolak', res)
        }
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cache-Control', 'private, no-store')
        return res.download(path.join(upload.uploadDirectory, filename), filename, (error) => {
            if (error && !res.headersSent) return errorResponse(404, 'File tidak ditemukan', res)
        })
    } catch (error) {
        console.error('Gagal mengunduh lampiran:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.get('/:id', verifyToken(), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID submission tidak valid', res)
    try {
        const [rows] = await db.promise().execute(
            `SELECT s.*, t.title AS task_title, t.max_points, u.username, p.display_name
             FROM submissions s JOIN tasks t ON t.id = s.task_id JOIN users u ON u.id = s.user_id
             LEFT JOIN user_profiles p ON p.user_id = u.id WHERE s.id = ? LIMIT 1`, [req.params.id]
        )
        if (!rows.length) return errorResponse(404, 'Submission tidak ditemukan', res)
        if (req.user.role !== 'admin' && String(rows[0].user_id) !== String(req.user.id)) return errorResponse(403, 'Akses ditolak', res)
        return response(200, 'Detail submission berhasil diambil', rows[0], res)
    } catch (error) {
        console.error('Gagal mengambil detail submission:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.post('/', verifyToken(['member']), handleUpload, async (req, res) => {
    const taskId = req.body.task_id
    const content = typeof req.body.submission_content === 'string' ? req.body.submission_content.trim() : ''
    const suppliedUrl = typeof req.body.attachment_url === 'string' ? req.body.attachment_url.trim() : ''
    if (!asId(taskId) || (!content && !suppliedUrl && !req.file)) {
        await removeUploadedFile(req.file)
        return errorResponse(400, 'Tugas dan isi atau lampiran wajib disertakan', res)
    }
    if (suppliedUrl && (!isPdfUrl(suppliedUrl) || suppliedUrl.length > 500)) {
        await removeUploadedFile(req.file)
        return errorResponse(400, 'Lampiran eksternal harus berupa URL PDF yang valid (maksimal 500 karakter)', res)
    }
    const attachmentUrl = req.file ? `/uploads/${req.file.filename}` : suppliedUrl || null
    try {
        const [tasks] = await db.promise().execute(
            'SELECT id, status, deadline IS NOT NULL AND deadline <= NOW() AS is_expired FROM tasks WHERE id = ? LIMIT 1',
            [taskId]
        )
        if (!tasks.length || tasks[0].status !== 'published') {
            await removeUploadedFile(req.file)
            return errorResponse(404, 'Tugas tidak ditemukan atau belum dipublikasikan', res)
        }
        if (Number(tasks[0].is_expired)) {
            await removeUploadedFile(req.file)
            return errorResponse(409, 'Deadline tugas sudah lewat; submission tidak dapat dikirim', res)
        }
        const [result] = await db.promise().execute(
            'INSERT INTO submissions (task_id, user_id, submission_content, attachment_url) VALUES (?, ?, ?, ?)',
            [taskId, req.user.id, content || null, attachmentUrl]
        )
        try {
            getIo().to('admins').emit('new-submission', { id: result.insertId, task_id: Number(taskId), user_id: req.user.id })
        } catch (error) {
            console.error('Submission tersimpan, tetapi notifikasi gagal dikirim:', error)
        }
        return response(201, 'Submission berhasil dikirim', { id: result.insertId }, res)
    } catch (error) {
        await removeUploadedFile(req.file)
        if (error.code === 'ER_DUP_ENTRY') return errorResponse(409, 'Anda sudah mengirim submission untuk tugas ini', res)
        console.error('Gagal membuat submission:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.put('/:id', verifyToken(['member']), handleUpload, async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID submission tidak valid', res)
    const content = typeof req.body.submission_content === 'string' ? req.body.submission_content.trim() : ''
    const suppliedUrl = typeof req.body.attachment_url === 'string' ? req.body.attachment_url.trim() : ''
    if (!content && !suppliedUrl && !req.file) {
        await removeUploadedFile(req.file)
        return errorResponse(400, 'Isi atau lampiran wajib disertakan', res)
    }
    if (suppliedUrl && (!isPdfUrl(suppliedUrl) || suppliedUrl.length > 500)) {
        await removeUploadedFile(req.file)
        return errorResponse(400, 'Lampiran eksternal harus berupa URL PDF yang valid (maksimal 500 karakter)', res)
    }
    try {
        const [submissions] = await db.promise().execute(
            `SELECT s.id, t.status AS task_status,
                    t.deadline IS NOT NULL AND t.deadline <= NOW() AS is_expired
             FROM submissions s JOIN tasks t ON t.id = s.task_id
             WHERE s.id = ? AND s.user_id = ? AND s.status = 'revision' LIMIT 1`,
            [req.params.id, req.user.id]
        )
        if (!submissions.length) {
            await removeUploadedFile(req.file)
            return errorResponse(404, 'Submission revisi tidak ditemukan', res)
        }
        if (submissions[0].task_status !== 'published' || Number(submissions[0].is_expired)) {
            await removeUploadedFile(req.file)
            return errorResponse(409, 'Deadline tugas sudah lewat atau tugas tidak lagi dipublikasikan; revisi tidak dapat dikirim', res)
        }
        const [result] = await db.promise().execute(
            `UPDATE submissions SET submission_content = ?, attachment_url = ?, status = 'pending', submitted_at = NOW(),
             feedback = NULL, reviewed_by = NULL, reviewed_at = NULL
             WHERE id = ? AND user_id = ? AND status = 'revision'`,
            [content || null, req.file ? `/uploads/${req.file.filename}` : suppliedUrl || null, req.params.id, req.user.id]
        )
        if (!result.affectedRows) {
            await removeUploadedFile(req.file)
            return errorResponse(404, 'Submission revisi tidak ditemukan', res)
        }
        return response(200, 'Perbaikan berhasil dikirim ulang', null, res)
    } catch (error) {
        await removeUploadedFile(req.file)
        console.error('Gagal mengubah submission:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.delete('/:id', verifyToken(), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID submission tidak valid', res)
    const connection = await db.promise().getConnection()
    let submission
    let pointsRemoved = 0
    try {
        await connection.beginTransaction()
        const [rows] = await connection.execute(
            'SELECT id, user_id, status, attachment_url FROM submissions WHERE id = ? FOR UPDATE',
            [req.params.id]
        )
        if (!rows.length) {
            await connection.rollback()
            return errorResponse(404, 'Submission tidak ditemukan', res)
        }
        submission = rows[0]

        if (req.user.role !== 'admin' && Number(submission.user_id) !== Number(req.user.id)) {
            await connection.rollback()
            return errorResponse(404, 'Submission tidak ditemukan', res)
        }
        if (req.user.role !== 'admin' && submission.status !== 'pending') {
            await connection.rollback()
            return errorResponse(409, 'Submission hanya dapat dihapus selama masih menunggu review', res)
        }

        const [pointRows] = await connection.execute(
            'SELECT COALESCE(SUM(points_delta), 0) AS points_to_remove FROM point_transactions WHERE submission_id = ?',
            [submission.id]
        )
        pointsRemoved = Number(pointRows[0].points_to_remove) || 0

        await connection.execute('DELETE FROM point_transactions WHERE submission_id = ?', [submission.id])
        await connection.execute('DELETE FROM submissions WHERE id = ?', [submission.id])
        await connection.commit()
    } catch (error) {
        await connection.rollback()
        console.error('Gagal menghapus submission:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    } finally {
        connection.release()
    }

    await removeStoredAttachment(submission.attachment_url)
    notify('submission-deleted', submission.user_id, { submission_id: submission.id, deleted_by_role: req.user.role })
    if (pointsRemoved > 0) {
        try {
            const [totals] = await db.promise().execute(
                'SELECT COALESCE(SUM(points_delta), 0) AS total_points FROM point_transactions WHERE user_id = ?',
                [submission.user_id]
            )
            notify('points-revoked', submission.user_id, { submission_id: submission.id, points: pointsRemoved, total_points: totals[0].total_points })
        } catch (error) {
            console.error('Submission terhapus, tetapi notifikasi pengurangan poin gagal:', error)
        }
    }
    return response(200, 'Submission berhasil dihapus', {
        id: submission.id,
        user_id: submission.user_id,
        points_removed: pointsRemoved
    }, res)
})

router.patch('/:id/review', verifyToken(['admin']), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID submission tidak valid', res)
    const { status, feedback = null, points } = req.body || {}
    if (!['approved', 'revision'].includes(status) || (feedback !== null && typeof feedback !== 'string')) {
        return errorResponse(400, 'Status review atau feedback tidak valid', res)
    }
    const connection = await db.promise().getConnection()
    let memberId
    let taskTitle
    let awardedPoints = 0
    try {
        await connection.beginTransaction()
        const [rows] = await connection.execute(
            `SELECT s.id, s.user_id, s.status, t.title, t.max_points FROM submissions s
             JOIN tasks t ON t.id = s.task_id WHERE s.id = ? FOR UPDATE`, [req.params.id]
        )
        if (!rows.length) {
            await connection.rollback()
            return errorResponse(404, 'Submission tidak ditemukan', res)
        }
        const submission = rows[0]
        if (submission.status === 'approved') {
            await connection.rollback()
            return errorResponse(409, 'Submission yang sudah disetujui tidak dapat direview ulang', res)
        }
        memberId = submission.user_id
        taskTitle = submission.title
        if (status === 'approved') {
            awardedPoints = points === undefined ? submission.max_points : points
            if (!Number.isInteger(awardedPoints) || awardedPoints < 0 || awardedPoints > submission.max_points) {
                await connection.rollback()
                return errorResponse(400, `Poin harus berupa bilangan 0 sampai ${submission.max_points}`, res)
            }
        }
        await connection.execute(
            'UPDATE submissions SET status = ?, feedback = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
            [status, feedback, req.user.id, submission.id]
        )
        if (status === 'approved') {
            await connection.execute(
                `INSERT INTO point_transactions (user_id, submission_id, transaction_type, points_delta, description, created_by)
                 VALUES (?, ?, 'award', ?, ?, ?)`,
                [memberId, submission.id, awardedPoints, `Poin tugas: ${taskTitle}`, req.user.id]
            )
        }
        await connection.commit()
    } catch (error) {
        await connection.rollback()
        if (error.code === 'ER_DUP_ENTRY') return errorResponse(409, 'Poin untuk submission ini sudah diberikan', res)
        console.error('Gagal mereview submission:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    } finally {
        connection.release()
    }

    notify('submission-reviewed', memberId, { submission_id: Number(req.params.id), status, feedback, points: awardedPoints })
    if (status === 'approved') {
        try {
            const [totals] = await db.promise().execute(
                'SELECT COALESCE(SUM(points_delta), 0) AS total_points FROM point_transactions WHERE user_id = ?', [memberId]
            )
            notify('points-earned', memberId, { points: awardedPoints, task_title: taskTitle, total_points: totals[0].total_points })
        } catch (error) {
            console.error('Poin tersimpan, tetapi total poin untuk notifikasi gagal diambil:', error)
        }
    }
    return response(200, 'Submission berhasil direview', { status, points: awardedPoints }, res)
})

module.exports = router
