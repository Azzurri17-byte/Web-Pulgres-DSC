const db = require('../lib/connection')

function startTaskDeadlineScheduler() {
    let running = false
    const archiveExpiredTasks = async () => {
        if (running) return
        running = true
        try {
            const [result] = await db.promise().execute(
                "UPDATE tasks SET status = 'archived' WHERE status = 'published' AND deadline IS NOT NULL AND deadline <= NOW()"
            )
            if (result.affectedRows > 0) {
                console.log(`Mengarsipkan ${result.affectedRows} tugas yang melewati deadline.`)
            }
        } catch (error) {
            console.error('Gagal mengarsipkan tugas kedaluwarsa:', error.message)
        } finally {
            running = false
        }
    }

    archiveExpiredTasks()
    const timer = setInterval(archiveExpiredTasks, 60_000)
    timer.unref()
    return () => clearInterval(timer)
}

module.exports = startTaskDeadlineScheduler
