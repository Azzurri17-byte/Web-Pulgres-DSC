const express = require('express')
const db = require('../lib/connection')
const verifyToken = require('../middleware/verifyToken')
const response = require('../utils/response')
const errorResponse = require('../utils/errorResponse')
const { getIo } = require('../utils/socket')

const router = express.Router()
const asId = (value) => /^\d+$/.test(String(value)) && Number(value) > 0

router.get('/me', verifyToken(), async (req, res) => {
    try {
        const [rows] = await db.promise().execute(
            'SELECT COALESCE(SUM(points_delta), 0) AS total_points FROM point_transactions WHERE user_id = ?', [req.user.id]
        )
        return response(200, 'Total poin berhasil diambil', rows[0], res)
    } catch (error) {
        console.error('Gagal mengambil poin:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.get('/history', verifyToken(), async (req, res) => {
    const userId = req.query.user_id || req.user.id
    if (!asId(userId)) return errorResponse(400, 'ID anggota tidak valid', res)
    if (req.user.role !== 'admin' && Number(userId) !== Number(req.user.id)) return errorResponse(403, 'Akses ditolak', res)
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))
    try {
        const [rows] = await db.promise().execute(
            `SELECT pt.*, u.username AS created_by_username, s.task_id, t.title AS task_title
             FROM point_transactions pt JOIN users u ON u.id = pt.created_by
             LEFT JOIN submissions s ON s.id = pt.submission_id LEFT JOIN tasks t ON t.id = s.task_id
             WHERE pt.user_id = ? ORDER BY pt.created_at DESC LIMIT ? OFFSET ?`,
            [userId, limit, (page - 1) * limit]
        )
        return response(200, 'Riwayat poin berhasil diambil', { items: rows, page, limit }, res)
    } catch (error) {
        console.error('Gagal mengambil riwayat poin:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.post('/adjustment', verifyToken(['admin']), async (req, res) => {
    const { user_id: userId, points_delta: pointsDelta, description = null } = req.body || {}
    if (!asId(userId) || !Number.isInteger(pointsDelta) || pointsDelta === 0 ||
        (description !== null && (typeof description !== 'string' || description.length > 255))) {
        return errorResponse(400, 'Anggota, perubahan poin, atau deskripsi tidak valid', res)
    }
    const connection = await db.promise().getConnection()
    try {
        await connection.beginTransaction()
        const [users] = await connection.execute("SELECT id FROM users WHERE id = ? AND role = 'member' FOR UPDATE", [userId])
        if (!users.length) {
            await connection.rollback()
            return errorResponse(404, 'Anggota tidak ditemukan', res)
        }
        const [result] = await connection.execute(
            `INSERT INTO point_transactions (user_id, transaction_type, points_delta, description, created_by)
             VALUES (?, 'adjustment', ?, ?, ?)`, [userId, pointsDelta, description, req.user.id]
        )
        await connection.commit()
        if (pointsDelta > 0) {
            try {
                const [totals] = await db.promise().execute(
                    'SELECT COALESCE(SUM(points_delta), 0) AS total_points FROM point_transactions WHERE user_id = ?', [userId]
                )
                getIo().to(`user:${userId}`).emit('points-earned', {
                    points: pointsDelta,
                    total_points: totals[0].total_points,
                    description
                })
            } catch (error) {
                if (error.message !== 'Socket belum diinisialisasi') {
                    console.error('Penyesuaian tersimpan, tetapi notifikasi poin gagal dikirim:', error)
                }
            }
        }
        return response(201, 'Penyesuaian poin berhasil dicatat', { id: result.insertId }, res)
    } catch (error) {
        await connection.rollback()
        console.error('Gagal menyesuaikan poin:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    } finally {
        connection.release()
    }
})

module.exports = router
