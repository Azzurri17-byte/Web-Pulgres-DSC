const configuredOrigins = (process.env.FRONTEND_URL || '')
    .split(',').map((origin) => origin.trim()).filter(Boolean)

const isPrivateIpv4 = (hostname) => {
    const octets = hostname.split('.').map(Number)
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false
    return octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168)
}

const isAllowedOrigin = (origin) => {
    if (!origin) return true
    if (configuredOrigins.includes(origin)) return true
    if (process.env.NODE_ENV === 'production') return false
    try {
        const url = new URL(origin)
        return url.protocol === 'http:' && url.port === '5173' &&
            (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || isPrivateIpv4(url.hostname))
    } catch {
        return false
    }
}

module.exports = { configuredOrigins, isAllowedOrigin }
