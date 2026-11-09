const response = (statusCode, message, data, res)  => {
    res.status(statusCode).json({
        status: true,
        message,
        data
    })
}



module.exports = response