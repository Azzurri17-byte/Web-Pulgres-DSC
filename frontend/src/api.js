import axios from 'axios'

export const apiBaseUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV
  ? '/api'
  : `${window.location.protocol}//${window.location.hostname}:3000/api`)

export const api = axios.create({
  baseURL: apiBaseUrl
})

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('pulgres_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export function messageFrom(error) {
  return error?.response?.data?.message || error?.message || 'Terjadi kesalahan. Coba lagi.'
}
