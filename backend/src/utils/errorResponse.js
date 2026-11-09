const errorResponse = (statusCode, message, res) => {
    res.status(statusCode).json({
        status: false,
        message
    })
}

module.exports = errorResponse