const http = require('http')
const app = require('./app')
const { initSocket } = require('./src/utils/socket')
const startTaskDeadlineScheduler = require('./src/utils/taskDeadlineScheduler')

const port = Number.parseInt(process.env.PORT, 10) || 3000
const server = http.createServer(app)

initSocket(server)
startTaskDeadlineScheduler()

server.listen(port, '0.0.0.0', () => {
    console.log(`Web PulGres API berjalan pada port ${port}`)
})

server.on('error', (error) => {
    console.error('Server gagal dijalankan:', error)
    process.exitCode = 1
})
