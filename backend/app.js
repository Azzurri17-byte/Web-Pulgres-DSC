const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })
const express = require('express')
const apiRoutes = require('./src/routes')
const { isAllowedOrigin } = require('./src/utils/allowedOrigins')

const app = express()

app.disable('x-powered-by')
app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && isAllowedOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
        res.setHeader('Access-Control-Allow-Credentials', 'true')
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    }
    if (req.method === 'OPTIONS') return res.sendStatus(origin && !isAllowedOrigin(origin) ? 403 : 204)
    return next()
})
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))
app.get('/api/health', (req, res) => res.status(200).json({ status: true, message: 'API aktif' }))
app.use('/api', apiRoutes)

app.use((req, res) => res.status(404).json({ status: false, message: 'Endpoint tidak ditemukan' }))
app.use((error, req, res, next) => {
    console.error('Unhandled request error:', error)
    if (res.headersSent) return next(error)
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500
    const message = status === 500 ? 'Terjadi kesalahan pada server'
        : status === 404 ? 'Resource tidak ditemukan'
            : error.message
    return res.status(status).json({ status: false, message })
})

module.exports = app
