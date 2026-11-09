const path = require('path')
const crypto = require('crypto')
const fs = require('fs')
const multer = require('multer')

const uploadDirectory = path.resolve(__dirname, '../../storage/uploads')

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdir(uploadDirectory, { recursive: true }, (error) => cb(error, uploadDirectory))
    },
    filename: (req, file, cb) => {
        cb(null, `${crypto.randomBytes(15).toString('hex')}.pdf`)
    }
})

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const hasPdfExtension = path.extname(file.originalname).toLowerCase() === '.pdf'
        if (hasPdfExtension && file.mimetype === 'application/pdf') return cb(null, true)
        return cb(new Error('Lampiran hanya boleh berupa file PDF'))
    }
})

module.exports = upload
module.exports.uploadDirectory = uploadDirectory
