const jwt = require('jsonwebtoken')
const db = require('../lib/connection')
const { isAllowedOrigin } = require('./allowedOrigins')

let io
const activeSockets = new Map()

function publicUsers() {
    return Array.from(activeSockets.values())
        .filter(({ role }) => role === 'member')
        .map(({ id, username, role }) => ({ id, username, role }))
}

function initSocket(server) {
    const { Server } = require('socket.io')
    io = new Server(server, {
        cors: {
            origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
            credentials: true
        }
    })

    io.use(async (socket, next) => {
        const token = socket.handshake.auth && socket.handshake.auth.token
        if (!token || !process.env.SECRET_KEY) return next(new Error('Autentikasi diperlukan'))
        try {
            const decoded = jwt.verify(token, process.env.SECRET_KEY)
            const userId = decoded.sub || decoded.id
            if (!userId) return next(new Error('Token tidak memiliki identitas akun'))
            const [rows] = await db.promise().execute(
                'SELECT id, username, role, is_active FROM users WHERE id = ? LIMIT 1', [userId]
            )
            const user = rows[0]
            if (!user || !user.is_active) {
                return next(new Error('Token tidak valid'))
            }
            socket.user = { id: user.id, username: user.username, role: user.role }
            return next()
        } catch (error) {
            return next(new Error('Token tidak valid atau kedaluwarsa'))
        }
    })

    io.on('connection', (socket) => {
        const user = socket.user
        const userKey = String(user.id)
        socket.join(`user:${userKey}`)
        if (user.role === 'admin') socket.join('admins')
        if (user.role === 'member') socket.join('members')

        const firstConnection = !activeSockets.has(userKey)
        activeSockets.set(userKey, user)
        socket.emit('online-users', publicUsers())
        if (firstConnection && user.role === 'member') io.emit('presence-update', { user_id: user.id, username: user.username, online: true })
        io.emit('online-users', publicUsers())

        socket.on('disconnect', () => {
            const remaining = (io.sockets.adapter.rooms.get(`user:${userKey}`) || new Set()).size
            if (!remaining) {
                activeSockets.delete(userKey)
                if (user.role === 'member') io.emit('presence-update', { user_id: user.id, username: user.username, online: false })
                io.emit('online-users', publicUsers())
            }
        })
    })

    return io
}

function getIo() {
    if (!io) throw new Error('Socket belum diinisialisasi')
    return io
}

module.exports = { initSocket, getIo }
