const fs = require('fs/promises')

async function isPdfFile(filePath) {
    let file
    try {
        file = await fs.open(filePath, 'r')
        const { size } = await file.stat()
        if (size < 8) return false

        const header = Buffer.alloc(Math.min(size, 1024))
        await file.read(header, 0, header.length, 0)
        if (!header.includes(Buffer.from('%PDF-'))) return false

        const tailLength = Math.min(size, 2048)
        const tail = Buffer.alloc(tailLength)
        await file.read(tail, 0, tailLength, size - tailLength)
        return tail.includes(Buffer.from('%%EOF'))
    } catch {
        return false
    } finally {
        if (file) await file.close()
    }
}

module.exports = isPdfFile
