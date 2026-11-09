const express = require('express')
const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')
const multer = require('multer')
const db = require('../lib/connection')
const upload = require('../lib/uploadMulter')
const verifyToken = require('../middleware/verifyToken')
const response = require('../utils/response')
const errorResponse = require('../utils/errorResponse')
const { getIo } = require('../utils/socket')

const router = express.Router()
const storageDirectory = upload.uploadDirectory
const extensions = new Set(['.pdf', '.ppt', '.pptx', '.xls', '.xlsx'])
const asId = (value) => /^\d+$/.test(String(value)) && Number(value) > 0
const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })
const notifyMembers = (material) => {
    try {
        getIo().to('members').emit('learning-material-published', material)
    } catch (error) {
        if (error.message !== 'Socket belum diinisialisasi') throw error
    }
}

const validateFile = (file) => {
    if (!file) return null
    const extension = path.extname(file.originalname).toLowerCase()
    if (!extensions.has(extension)) return 'File hanya boleh berupa PDF, PowerPoint (.ppt/.pptx), atau Excel (.xls/.xlsx)'
    const buffer = file.buffer
    const isPdf = extension === '.pdf' && file.mimetype === 'application/pdf' && buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))
    const isLegacyOffice = ['.ppt', '.xls'].includes(extension) && buffer.subarray(0, 8).equals(Buffer.from('D0CF11E0A1B11AE1', 'hex'))
    const openXmlMimes = {
        '.pptx': ['application/zip', 'application/octet-stream', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
        '.xlsx': ['application/zip', 'application/octet-stream', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    }
    const isZip = buffer.subarray(0, 4).equals(Buffer.from('504b0304', 'hex'))
    const isOpenXml = ['.pptx', '.xlsx'].includes(extension) && openXmlMimes[extension].includes(file.mimetype) && isZip &&
        buffer.includes(Buffer.from('[Content_Types].xml')) && buffer.includes(Buffer.from(extension === '.pptx' ? 'ppt/presentation.xml' : 'xl/workbook.xml'))
    if (!(isPdf || isLegacyOffice || isOpenXml)) return 'Isi file tidak sesuai dengan format PDF, PowerPoint, atau Excel yang dipilih'
    return null
}

const safeFilePath = (storedPath) => {
    const filename = path.basename(String(storedPath || ''))
    if (!/^[a-f0-9]{32}\.(pdf|ppt|pptx|xls|xlsx)$/i.test(filename)) return null
    return path.join(storageDirectory, filename)
}

const validateModuleUrl = (value) => {
    if (typeof value !== 'string') return null
    const url = value.trim()
    if (!url || url.length > 255) return null
    try {
        const parsed = new URL(url)
        return ['http:', 'https:'].includes(parsed.protocol) ? url : null
    } catch {
        return null
    }
}

router.get('/', verifyToken(), async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))
    const offset = (page - 1) * limit
    try {
        const [rows] = await db.promise().execute(
            `SELECT lm.id, lm.title, lm.description, lm.url_module, lm.file_name, lm.file_size,
                    lm.status, lm.created_at, lm.updated_at
             FROM learning_materials lm
             ${req.user.role === 'admin' ? '' : "WHERE lm.status = 'published'"}
             ORDER BY lm.created_at DESC LIMIT ? OFFSET ?`, [limit, offset])
        return response(200, 'Daftar materi berhasil diambil', { items: rows, page, limit }, res)
    } catch (error) {
        console.error('Gagal mengambil materi:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.post('/', verifyToken(['admin']), (req, res, next) => {
    uploadMemory.single('file')(req, res, (error) => {
        if (error) return errorResponse(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 25 MB' : error.message, res)
        return next()
    })
}, async (req, res) => {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : ''
    const rawModuleUrl = typeof req.body.url_module === 'string' ? req.body.url_module.trim() : ''
    const urlModule = rawModuleUrl ? validateModuleUrl(rawModuleUrl) : null
    const status = req.body.status || 'draft'
    if (!title || title.length > 150 || (rawModuleUrl && !urlModule) || (!urlModule && !req.file) || !['draft', 'published'].includes(status)) {
        return errorResponse(400, 'Judul dan salah satu dari URL modul atau file wajib diisi; URL harus valid', res)
    }
    const fileError = validateFile(req.file)
    if (fileError) return errorResponse(400, fileError, res)

    let filename = null
    let destination = null
    if (req.file) {
        const extension = path.extname(req.file.originalname).toLowerCase()
        filename = `${crypto.randomBytes(16).toString('hex')}${extension}`
        destination = path.join(storageDirectory, filename)
    }
    try {
        if (req.file) {
            await fs.mkdir(storageDirectory, { recursive: true })
            await fs.writeFile(destination, req.file.buffer, { flag: 'wx', mode: 0o600 })
        }
        const [result] = await db.promise().execute(
            'INSERT INTO learning_materials (title, description, url_module, file_name, file_path, file_size, uploaded_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [title, description || null, urlModule, req.file ? req.file.originalname.slice(0, 255) : null, filename ? `/uploads/${filename}` : null, req.file?.size ?? null, req.user.id, status]
        )
        if (status === 'published') notifyMembers({ id: result.insertId, title })
        return response(201, 'Materi berhasil ditambahkan', { id: result.insertId }, res)
    } catch (error) {
        if (destination) await fs.unlink(destination).catch(() => {})
        console.error('Gagal menyimpan materi:', error)
        return errorResponse(500, 'Materi gagal disimpan', res)
    }
})

router.patch('/:id/archive', verifyToken(['admin']), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID materi tidak valid', res)
    try {
        const [result] = await db.promise().execute("UPDATE learning_materials SET status = 'archived' WHERE id = ?", [req.params.id])
        if (!result.affectedRows) return errorResponse(404, 'Materi tidak ditemukan', res)
        return response(200, 'Materi berhasil diarsipkan', null, res)
    } catch (error) {
        console.error('Gagal mengarsipkan materi:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.patch('/:id/publish', verifyToken(['admin']), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID materi tidak valid', res)
    try {
        const [result] = await db.promise().execute("UPDATE learning_materials SET status = 'published' WHERE id = ? AND status IN ('draft', 'archived')", [req.params.id])
        if (!result.affectedRows) {
            const [rows] = await db.promise().execute('SELECT id FROM learning_materials WHERE id = ? LIMIT 1', [req.params.id])
            if (!rows.length) return errorResponse(404, 'Materi tidak ditemukan', res)
            return errorResponse(409, 'Materi sudah berstatus published', res)
        }
        const [rows] = await db.promise().execute('SELECT id, title FROM learning_materials WHERE id = ? LIMIT 1', [req.params.id])
        notifyMembers(rows[0])
        return response(200, 'Materi berhasil dipublikasikan', null, res)
    } catch (error) {
        console.error('Gagal mempublikasikan materi:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.delete('/:id', verifyToken(['admin']), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID materi tidak valid', res)
    try {
        const [rows] = await db.promise().execute('SELECT file_path FROM learning_materials WHERE id = ? LIMIT 1', [req.params.id])
        if (!rows.length) return errorResponse(404, 'Materi tidak ditemukan', res)
        await db.promise().execute('DELETE FROM learning_materials WHERE id = ?', [req.params.id])
        const filepath = safeFilePath(rows[0].file_path)
        if (filepath) await fs.unlink(filepath).catch((error) => {
            if (error.code !== 'ENOENT') console.error('Gagal menghapus file materi:', error)
        })
        return response(200, 'Materi berhasil dihapus', { id: req.params.id }, res)
    } catch (error) {
        console.error('Gagal menghapus materi:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

router.get('/:id/download', verifyToken(), async (req, res) => {
    if (!asId(req.params.id)) return errorResponse(400, 'ID materi tidak valid', res)
    try {
        const [rows] = await db.promise().execute(
            `SELECT file_name, file_path, status FROM learning_materials WHERE id = ? ${req.user.role === 'admin' ? '' : "AND status = 'published'"} LIMIT 1`,
            [req.params.id]
        )
        if (!rows.length) return errorResponse(404, 'Materi tidak ditemukan', res)
        const filepath = safeFilePath(rows[0].file_path)
        if (!filepath) return errorResponse(404, 'File materi tidak ditemukan', res)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cache-Control', 'private, no-store')
        return res.download(filepath, path.basename(rows[0].file_name), (error) => {
            if (error && !res.headersSent) return errorResponse(404, 'File materi tidak ditemukan', res)
        })
    } catch (error) {
        console.error('Gagal mengunduh materi:', error)
        return errorResponse(500, 'Terjadi kesalahan pada server', res)
    }
})

module.exports = router
