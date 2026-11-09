const express = require('express')
const createMember = require('./createMember')

const router = express.Router()

// Registrasi publik hanya membuat akun dengan role member.
router.post('/', createMember)

module.exports = router
