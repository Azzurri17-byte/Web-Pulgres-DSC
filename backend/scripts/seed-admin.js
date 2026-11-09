const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const bcrypt = require('bcrypt')
const db = require('../src/lib/connection')

async function seedAdmin() {
    const username = process.env.ADMIN_USERNAME
    const nim = process.env.ADMIN_NIM
    const displayName = process.env.ADMIN_DISPLAY_NAME || 'Administrator'
    const password = process.env.ADMIN_PASSWORD

    if (!username || !nim || !password || Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72) {
        throw new Error('Atur ADMIN_USERNAME, ADMIN_NIM, dan ADMIN_PASSWORD (8–72 byte) di backend/.env')
    }

    const connection = await db.promise().getConnection()
    try {
        await connection.beginTransaction()
        const passwordHash = await bcrypt.hash(password, 12)
        const [result] = await connection.execute(
            "INSERT INTO users (username, nim, password_hash, role, is_active) VALUES (?, ?, ?, 'admin', TRUE)",
            [username.trim(), nim.trim(), passwordHash]
        )
        await connection.execute(
            'INSERT INTO user_profiles (user_id, display_name) VALUES (?, ?)',
            [result.insertId, displayName.trim()]
        )
        await connection.commit()
        console.log(`Akun admin berhasil dibuat: ${username}`)
    } catch (error) {
        await connection.rollback()
        if (error.code === 'ER_DUP_ENTRY') throw new Error('Username atau NIM admin sudah digunakan')
        throw error
    } finally {
        connection.release()
        await db.promise().end()
    }
}

seedAdmin().catch(async (error) => {
    console.error('Gagal membuat admin:', error.message)
    try { await db.promise().end() } catch {}
    process.exitCode = 1
})
