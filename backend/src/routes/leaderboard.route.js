const express = require('express')
const db = require('../lib/connection')
const verifyToken = require('../middleware/verifyToken')
const response = require('../utils/response')
const errorResponse = require('../utils/errorResponse')

const router = express.Router()

router.get('/', verifyToken(), async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50))
    try {
        const [rows] = await db.promise().execute(
            `SELECT ranked.*, ROW_NUMBER() OVER (
                       ORDER BY total_points DESC, completed_tasks DESC, id ASC
                   ) AS ranking FROM (
                SELECT u.id, u.username, p.display_name, p.avatar_url,
                       COALESCE(points.total_points, 0) AS total_points,
                       COALESCE(done.completed_tasks, 0) AS completed_tasks,
                       COALESCE(projects.published_projects, 0) AS published_projects
                FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
                LEFT JOIN (SELECT user_id, SUM(points_delta) AS total_points
                           FROM point_transactions GROUP BY user_id) points ON points.user_id = u.id
                LEFT JOIN (SELECT user_id, COUNT(*) AS completed_tasks FROM submissions
                           WHERE status = 'approved' GROUP BY user_id) done ON done.user_id = u.id
                LEFT JOIN (SELECT user_id, COUNT(*) AS published_projects FROM member_projects
                           WHERE status = 'published' AND deleted_at IS NULL GROUP BY user_id) projects ON projects.user_id = u.id
                WHERE u.role = 'member' AND u.is_active = TRUE
             ) AS ranked ORDER BY total_points DESC, completed_tasks DESC, id ASC
             LIMIT ? OFFSET ?`, [limit, (page - 1) * limit]
        )
        return response(200, 'Leaderboard berhasil diambil', { items: rows, page, limit }, res)
    } catch (error) {
        console.error('Gagal mengambil leaderboard:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

module.exports = router
