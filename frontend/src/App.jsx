import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { ClipboardList, ClipboardPen, Code2, ExternalLink, FolderGit2, FolderUser, LibraryBig, LogOut, Podium, SquareUser, Summary, UserCog } from 'lucide-react'
import { api, apiBaseUrl, messageFrom } from './api'

const socketUrl = apiBaseUrl.startsWith('/')
  ? window.location.origin
  : apiBaseUrl.replace(/\/api\/?$/, '')
const avatarSource = (value) => {
  if (!value?.startsWith('/api/')) return value
  return apiBaseUrl.startsWith('/') ? value : `${apiBaseUrl.replace(/\/api\/?$/, '')}${value}`
}

function useData(loader, dependencies = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const refresh = async () => {
    setLoading(true)
    setError('')
    try { setData(await loader()) } catch (e) { setError(messageFrom(e)) } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, dependencies)
  return { data, error, loading, refresh, setData }
}

function Notice({ children, tone = 'error' }) {
  if (!children) return null
  const resolvedTone = /\bberhasil\b/i.test(String(children)) ? 'success' : tone
  return <div className={`notice ${resolvedTone}`} role={resolvedTone === 'error' ? 'alert' : 'status'}>{children}</div>
}

function PageHeading({ eyebrow, title, detail, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{detail && <p>{detail}</p>}</div>{action}</div>
}

function Card({ title, value, note }) {
  return <article className="stat-card"><span>{title}</span><strong>{value ?? '—'}</strong>{note && <small>{note}</small>}</article>
}

function Empty({ children = 'Belum ada data.' }) { return <div className="empty">{children}</div> }

function FilePreview({ file, onClose }) {
  const [preview, setPreview] = useState({ url: '', loading: true, error: '' })
  const extension = file.filename.split('.').pop()?.toLowerCase()
  const isPdf = extension === 'pdf'

  useEffect(() => {
    if (!isPdf) {
      setPreview({ url: '', loading: false, error: '' })
      return
    }
    let objectUrl
    let active = true
    api.get(file.endpoint, { responseType: 'blob' })
      .then(({ data }) => {
        if (!active) return
        objectUrl = URL.createObjectURL(data)
        setPreview({ url: objectUrl, loading: false, error: '' })
      })
      .catch((error) => {
        if (active) setPreview({ url: '', loading: false, error: messageFrom(error) })
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file.endpoint])

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="file-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="file-preview-title">
      <div className="panel-title"><div><span className="eyebrow">PRATINJAU FILE</span><h2 id="file-preview-title">{file.title}</h2><small>{file.filename}</small></div><button type="button" className="button subtle compact" onClick={onClose}>Tutup</button></div>
      <div className="file-preview-content">
        {preview.loading ? <div className="empty">Memuat pratinjau…</div>
          : preview.error ? <div className="notice error">{preview.error}</div>
            : isPdf ? <iframe title={`Pratinjau ${file.filename}`} src={preview.url} />
              : <div className="empty">Pratinjau langsung belum tersedia untuk file {extension?.toUpperCase() || 'ini'}. Silakan unduh file untuk membukanya.</div>}
      </div>
    </section>
  </div>
}

function Login({ onLogin }) {
  const location = useLocation()
  const [form, setForm] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('pulgres_remembered_identity') || 'null')
      const registered = location.state?.registeredIdentity
      return { nim: registered?.nim || saved?.nim || '', username: registered?.username || saved?.username || '', password: '' }
    } catch {
      return { nim: '', username: '', password: '' }
    }
  })
  const [error, setError] = useState('')
  const [loginNotice] = useState(location.state?.notice || '')
  const [busy, setBusy] = useState(false)
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem('pulgres_remembered_identity')))
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const { data } = await api.post('/auth/login', form)
      sessionStorage.setItem('pulgres_token', data.data.token)
      if (rememberMe) {
        localStorage.setItem('pulgres_remembered_identity', JSON.stringify({ nim: form.nim.trim(), username: form.username.trim() }))
      } else {
        localStorage.removeItem('pulgres_remembered_identity')
      }
      onLogin(data.data.user)
      navigate('/', { replace: true })
    } catch (e) { setError(messageFrom(e)) } finally { setBusy(false) }
  }
  return <main className="login-wrap"><section className="login-card">
    <Link className="brand login-brand" to="/"><span className="brand-mark">P</span><span>PulGres<small>Developer Student</small></span></Link>
    <div className="eyebrow">RUANG TUMBUH BERSAMA</div><h1>Selamat datang.</h1><p className="muted">Masuk untuk melanjutkan aktivitas UKM.</p>
    <Notice>{loginNotice}</Notice>
    <Notice>{error}</Notice>
    <form className="form-stack" onSubmit={submit}>
      <label>NIM<input autoComplete="off" value={form.nim} onChange={(e) => setForm({ ...form, nim: e.target.value })} required /></label>
      <label>Username<input autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></label>
      <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" autoFocus={rememberMe} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /><button type="button" className="password-toggle" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Sembunyikan' : 'Tampilkan'}</button></div></label>
      <label className="remember-me"><input type="checkbox" checked={rememberMe} onChange={(e) => { setRememberMe(e.target.checked); if (!e.target.checked) localStorage.removeItem('pulgres_remembered_identity') }} /><span><strong>Ingat saya</strong></span></label>
      <button className="button primary wide" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk ke akun'}</button>
    </form>
    <div className="login-foot">Belum punya akun PulGres? <Link className="text-link" to="/register">Daftar di sini</Link></div>
  </section></main>
}

function Register() {
  const [form, setForm] = useState({ display_name: '', nim: '', username: '', password: '', confirmation: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const navigate = useNavigate()
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (form.password.length < 8 || new TextEncoder().encode(form.password).length > 72) {
      setError('Password harus 8 sampai 72 byte.')
      return
    }
    if (form.password !== form.confirmation) {
      setError('Konfirmasi password tidak sama.')
      return
    }
    setBusy(true)
    try {
      await api.post('/auth/register', {
        display_name: form.display_name,
        nim: form.nim,
        username: form.username,
        password: form.password
      })
      navigate('/login', {
        replace: true,
        state: {
          registeredIdentity: { nim: form.nim, username: form.username },
          notice: 'Permintaan akun berhasil dikirim. Silakan tunggu persetujuan admin sebelum masuk.'
        }
      })
    } catch (e) {
      setError(messageFrom(e))
    } finally {
      setBusy(false)
    }
  }

  return <main className="login-wrap"><section className="login-card">
    <Link className="brand login-brand" to="/login"><span className="brand-mark">P</span><span>PulGres<small>Developer Student</small></span></Link>
    <div className="eyebrow">GABUNG DENGAN KAMI</div><h1>Buat akun.</h1><p className="muted">Daftar sebagai anggota UKM Developer Student.</p>
    <Notice>{error}</Notice>
    <form className="form-stack" onSubmit={submit}>
      <label>Nama tampilan<input autoComplete="name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required maxLength="100" /></label>
      <label>NIM<input autoComplete="off" value={form.nim} onChange={(e) => setForm({ ...form, nim: e.target.value })} required maxLength="30" /></label>
      <label>Username<input autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required maxLength="50" /></label>
      <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength="8" /><button type="button" className="password-toggle" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Sembunyikan' : 'Tampilkan'}</button></div></label>
      <label>Konfirmasi password<div className="password-field"><input type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" value={form.confirmation} onChange={(e) => setForm({ ...form, confirmation: e.target.value })} required minLength="8" /><button type="button" className="password-toggle" aria-label={showConfirmation ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'} onClick={() => setShowConfirmation(!showConfirmation)}>{showConfirmation ? 'Sembunyikan' : 'Tampilkan'}</button></div></label>
      <button className="button primary wide" disabled={busy}>{busy ? 'Membuat akun…' : 'Daftar'}</button>
    </form>
    <div className="login-foot">Sudah punya akun? <Link className="text-link" to="/login">Masuk</Link></div>
  </section></main>
}

function Dashboard({ user, onlineUsers }) {
  const admin = user.role === 'admin'
  const result = useData(async () => {
    const [tasks, submissions, points, leaderboard, members] = await Promise.all([
      api.get('/tasks?limit=100'), api.get(admin ? '/submissions?limit=100' : '/submissions/my?limit=100'),
      api.get('/points/me'), api.get('/leaderboard?limit=100'), admin ? api.get('/members?status=active&limit=1') : Promise.resolve({ data: { data: { items: [], total: 0 } } })
    ])
    const leaderboardItems = leaderboard.data.data.items || []
    return {
      tasks: tasks.data.data.items || [], submissions: submissions.data.data.items || [],
      points: points.data.data.total_points, rank: leaderboardItems.find((item) => String(item.id) === String(user.id))?.ranking,
      online: onlineUsers.length, memberCount: members.data.data.total
    }
  }, [user.id, admin, onlineUsers.length])
  if (result.loading) return <LoadingPage />
  const data = result.data || {}
  return <>
    <PageHeading eyebrow={admin ? 'PANEL ADMIN' : 'AREA ANGGOTA'} title={`Halo, ${user.username}.`} detail="Berikut ringkasan aktivitas PulGres hari ini." />
    <Notice>{result.error}</Notice>
    <div className="stat-grid">
      {admin ? <><Card title="Anggota online" value={data.online} note="Terhubung saat ini" /><Card title="Tugas aktif" value={data.tasks?.filter((t) => t.status === 'published').length || 0} /><Card title="Perlu diperiksa" value={data.submissions?.filter((s) => s.status === 'pending').length || 0} /><Card title="Total anggota" value={data.memberCount || 0} note="Gunakan menu Anggota untuk melihat semua" /></>
        : <><Card title="Total poin" value={data.points || 0} note="Dari seluruh transaksi poin" /><Card title="Peringkat" value={data.rank ? `#${data.rank}` : '—'} note="Leaderboard anggota" /><Card title="Tugas tersedia" value={data.tasks?.length || 0} /><Card title="Menunggu review" value={data.submissions?.filter((s) => s.status === 'pending').length || 0} /></>}
    </div>
    <div className="content-grid">
      <section className="panel"><div className="panel-title"><div><span className="eyebrow">TERBARU</span><h2>{admin ? 'Submission masuk' : 'Submission saya'}</h2></div><Link to="/submissions" className="text-link">Lihat semua →</Link></div>
        {data.submissions?.length ? <div className="list">{data.submissions.slice(0, 5).map((s) => <div className="list-row" key={s.id}><div><strong>{s.task_title || s.title}</strong><small>{admin ? s.display_name || s.username : new Date(s.submitted_at).toLocaleDateString('id-ID')}</small></div><Status value={s.status} /></div>)}</div> : <Empty>Belum ada submission.</Empty>}
      </section>
      <section className="panel"><div className="panel-title"><div><span className="eyebrow">RUANG KERJA</span><h2>{admin ? 'Tugas terbaru' : 'Tugas tersedia'}</h2></div><Link to="/tasks" className="text-link">Buka tugas →</Link></div>
        {data.tasks?.length ? <div className="list">{data.tasks.slice(0, 5).map((task) => <div className="list-row" key={task.id}><div><strong>{task.title}</strong><small>{task.deadline ? new Date(task.deadline).toLocaleDateString('id-ID') : 'Tanpa deadline'}</small></div><span className="points">{task.max_points} poin</span></div>)}</div> : <Empty>Tidak ada tugas saat ini.</Empty>}
      </section>
    </div>
  </>
}

function Status({ value }) {
  const labels = { pending: 'Menunggu', approved: 'Disetujui', revision: 'Revisi', published: 'Terbit', draft: 'Draft', archived: 'Arsip' }
  return <span className={`status ${value || 'draft'}`}>{labels[value] || value}</span>
}

function LoadingPage() { return <div className="loading">Memuat data…</div> }

function toDatetimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function Tasks({ user }) {
  const admin = user.role === 'admin'
  const { data, error, loading, refresh } = useData(async () => (await api.get('/tasks?limit=100')).data.data.items, [admin])
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ title: '', description: '', max_points: 10, deadline: '', status: 'draft' })
  const [editingTask, setEditingTask] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [submitting, setSubmitting] = useState(null)
  const create = async (e) => {
    e.preventDefault(); setNotice('')
    try { await api.post('/tasks', { ...form, max_points: Number(form.max_points), deadline: form.deadline || null }); setForm({ title: '', description: '', max_points: 10, deadline: '', status: 'draft' }); setNotice('Tugas berhasil dibuat.'); refresh() }
    catch (err) { setNotice(messageFrom(err)) }
  }
  const archive = async (id) => { try { await api.patch(`/tasks/${id}/archive`); setNotice('Tugas berhasil diarsipkan.'); refresh() } catch (e) { setNotice(messageFrom(e)) } }
  const publish = async (task) => {
    try { await api.patch(`/tasks/${task.id}/publish`); setNotice('Tugas berhasil dipublikasikan.'); refresh() }
    catch (e) { setNotice(messageFrom(e)) }
  }
  const deleteTask = async (task) => {
    if (!window.confirm(`Hapus tugas “${task.title}”? Tugas yang sudah memiliki submission tidak dapat dihapus.`)) return
    try {
      await api.delete(`/tasks/${task.id}`)
      setNotice('Tugas berhasil dihapus.')
      await refresh()
    } catch (e) {
      setNotice(messageFrom(e))
    }
  }
  const startEditing = (task) => {
    setEditingTask(task.id)
    setEditForm({
      title: task.title,
      description: task.description,
      max_points: task.max_points,
      deadline: toDatetimeLocal(task.deadline),
      status: task.status
    })
    setNotice('')
  }
  const saveEdit = async (event, task) => {
    event.preventDefault()
    setSavingEdit(true)
    setNotice('')
    try {
      await api.put(`/tasks/${task.id}`, {
        ...editForm,
        max_points: Number(editForm.max_points),
        deadline: editForm.deadline || null
      })
      setNotice('Tugas berhasil diperbarui.')
      setEditingTask(null)
      setEditForm(null)
      await refresh()
    } catch (err) {
      setNotice(messageFrom(err))
    } finally {
      setSavingEdit(false)
    }
  }
  const submitTask = async (e, task) => {
    e.preventDefault(); const formData = new FormData(e.currentTarget); formData.set('task_id', task.id)
    try {
      if (task.submission_status === 'revision') await api.put(`/submissions/${task.submission_id}`, formData)
      else await api.post('/submissions', formData)
      setNotice('Submission berhasil dikirim.'); setSubmitting(null); refresh()
    }
    catch (err) { setNotice(messageFrom(err)) }
  }
  const deleteOwnSubmission = async (task) => {
    if (!window.confirm(`Hapus submission untuk tugas “${task.title}”? Setelah dihapus, kamu bisa mengirim file pengganti.`)) return
    try {
      await api.delete(`/submissions/${task.submission_id}`)
      setNotice('Submission berhasil dihapus. Kamu bisa mengirim tugas kembali.')
      await refresh()
    } catch (err) { setNotice(messageFrom(err)) }
  }
  return <>
    <PageHeading eyebrow="AKTIVITAS UKM" title="Tugas" detail={admin ? 'Buat, publikasikan, dan arsipkan tugas anggota.' : 'Pilih tugas dan kirim hasil pengerjaanmu.'} />
    <Notice>{notice || error}</Notice>
    {admin && <section className="panel form-panel"><h2>Buat tugas</h2><form className="task-form" onSubmit={create}>
      <label>Judul<input maxLength="150" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
      <label>Deskripsi<textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></label>
      <div className="form-inline"><label>Maksimal poin<input type="number" min="0" value={form.max_points} onChange={(e) => setForm({ ...form, max_points: e.target.value })} /></label><label>Deadline<input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></label><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option></select></label></div>
      <button className="button primary">Buat tugas</button>
    </form></section>}
    {loading ? <LoadingPage /> : data?.length ? <div className="task-grid">{data.map((task) => <article className="panel task-card" key={task.id}>
      <div className="task-top"><Status value={admin ? task.status : task.is_expired ? 'archived' : (task.submission_status || task.status)} /><span className="points">{task.max_points} poin</span></div><h2>{task.title}</h2><p>{task.description}</p>
      <div className="task-meta"><span>Deadline</span><strong>{task.deadline ? new Date(task.deadline).toLocaleString('id-ID') : 'Tidak ditentukan'}</strong></div>
      {admin ? <><div className="task-actions"><div className="row-actions"><button type="button" className="button compact subtle" onClick={() => editingTask === task.id ? (setEditingTask(null), setEditForm(null)) : startEditing(task)}>{editingTask === task.id ? 'Batal edit' : 'Edit'}</button>{task.status === 'draft' && <button type="button" className="button compact primary" onClick={() => publish(task)}>Publikasikan</button>}{task.status === 'archived' && <button type="button" className="button compact primary" onClick={() => publish(task)}>Terbitkan kembali</button>}{task.status === 'published' && <button type="button" className="button compact subtle" onClick={() => archive(task.id)}>Arsipkan</button>}<button type="button" className="button compact danger" onClick={() => deleteTask(task)}>Hapus</button></div><span className="muted">{task.submission_count ?? ''}</span></div>
        {editingTask === task.id && editForm && <form className="task-form submit-form" onSubmit={(event) => saveEdit(event, task)}>
          <label>Judul<input maxLength="150" value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} required /></label>
          <label>Deskripsi<textarea rows="3" value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} required /></label>
          <label>Deadline<input type="datetime-local" value={editForm.deadline} onChange={(event) => setEditForm({ ...editForm, deadline: event.target.value })} /></label>
          <div className="row-actions"><button className="button compact primary" disabled={savingEdit}>{savingEdit ? 'Menyimpan…' : 'Simpan perubahan'}</button><button type="button" className="button compact subtle" disabled={savingEdit} onClick={() => { setEditingTask(null); setEditForm(null) }}>Batal</button></div>
        </form>}</>
        : <><div className="row-actions"><button className="button primary" onClick={() => setSubmitting(submitting === task.id ? null : task.id)} disabled={task.is_expired || task.submission_status === 'pending' || task.submission_status === 'approved'}>{task.is_expired ? 'Tenggat terlewat' : task.submission_status === 'revision' ? 'Kirim revisi' : task.submission_status ? 'Sudah dikirim' : 'Kumpulkan tugas'}</button>{task.submission_status === 'pending' && task.submission_id && <button type="button" className="button compact danger" onClick={() => deleteOwnSubmission(task)}>Hapus submission</button>}</div>
          {submitting === task.id && <form className="form-stack submit-form" onSubmit={(e) => submitTask(e, task)}><label>Deskripsi pengerjaan<textarea name="submission_content" rows="3" /></label><label>Lampiran PDF<input type="file" name="attachment" accept=".pdf,application/pdf" /></label><button className="button primary">Kirim submission</button></form>}</>}
    </article>)}</div> : <section className="panel"><Empty>Belum ada tugas yang tersedia.</Empty></section>}
  </>
}

function LearningMaterials({ user, updateKey = 0 }) {
  const admin = user.role === 'admin'
  const { data, error, loading, refresh } = useData(async () => {
    const items = (await api.get('/learning-materials?limit=100', { headers: { 'Cache-Control': 'no-cache' } })).data.data.items
    return admin ? items : items.filter((material) => material.status === 'published')
  }, [admin, updateKey])
  const [notice, setNotice] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', url_module: '', status: 'draft' })
  const create = async (event) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const formData = new FormData(formElement)
    setBusy(true)
    setNotice('')
    try {
      await api.post('/learning-materials', formData)
      setForm({ title: '', description: '', url_module: '', status: 'draft' })
      formElement.reset()
      setNotice('Materi berhasil ditambahkan.')
      refresh()
    } catch (e) { setNotice(messageFrom(e)) } finally { setBusy(false) }
  }
  const updateStatus = async (material, action) => {
    try {
      await api.patch(`/learning-materials/${material.id}/${action}`)
      setNotice(action === 'archive' ? 'Materi berhasil diarsipkan.' : 'Materi berhasil dipublikasikan.')
      refresh()
    } catch (e) { setNotice(messageFrom(e)) }
  }
  const deleteMaterial = async (material) => {
    if (!window.confirm(`Hapus materi “${material.title}”${material.file_name ? ' beserta filenya' : ''}?`)) return
    try {
      await api.delete(`/learning-materials/${material.id}`)
      setNotice('Materi berhasil dihapus.')
      refresh()
    } catch (e) { setNotice(messageFrom(e)) }
  }
  const download = async (material) => {
    try {
      const { data: blob } = await api.get(`/learning-materials/${material.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = material.file_name
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (e) { setNotice(messageFrom(e)) }
  }
  const preview = (material) => setPreviewFile({
    title: material.title,
    filename: material.file_name,
    endpoint: `/learning-materials/${material.id}/download`
  })
  const formatSize = (size) => size == null ? null : size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`

  return <>
    <PageHeading eyebrow="PUSAT PEMBELAJARAN" title="Modul pembelajaran" detail={admin ? 'Bagikan tautan modul dan lampirkan file bila diperlukan.' : 'Buka tautan modul dan unduh lampiran yang tersedia.'} action={<button type="button" className="button subtle" onClick={refresh} disabled={loading}>{loading ? 'Memuat…' : 'Muat ulang'}</button>} />
    <Notice>{notice || error}</Notice>
    {admin && <section className="panel form-panel"><h2>Tambah materi</h2><form className="task-form" onSubmit={create}>
      <label>Judul materi<input name="title" maxLength="150" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
      <label>Deskripsi<textarea name="description" rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <label>URL modul (opsional jika melampirkan file)<input name="url_module" type="url" maxLength="255" placeholder="https://..." value={form.url_module} onChange={(e) => setForm({ ...form, url_module: e.target.value })} /></label>
      <div className="form-inline"><label>File materi (opsional, maks. 25 MB)<input name="file" type="file" accept=".pdf,.ppt,.pptx,.xls,.xlsx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" /></label><label>Status awal<select name="status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="draft">Draft</option><option value="published">Terbitkan</option></select></label><span /></div>
      <button className="button primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan materi'}</button>
    </form></section>}
    {loading ? <LoadingPage /> : data?.length ? <div className="task-grid">{data.map((material) => <article className="panel task-card" key={material.id}>
      <div className="task-top">{admin && <Status value={material.status} />}{formatSize(material.file_size) && <span className="points">{formatSize(Number(material.file_size))}</span>}</div>
      <h2>{material.title}</h2><p>{material.description || 'Tidak ada deskripsi.'}</p>
      {material.url_module && <div className="task-meta module-link"><span className="module-url">{material.url_module}</span><a className="button compact primary" href={material.url_module} target="_blank" rel="noreferrer">Buka tautan modul ↗</a></div>}
      <div className="task-meta"><span>Tanggal ditambahkan</span><strong>{new Date(material.created_at).toLocaleDateString('id-ID')}</strong></div>
      {material.file_name && <div className="task-meta"><span>{material.file_name}</span></div>}
      {admin ? <div className="task-actions"><div className="row-actions">{material.status !== 'published' && <button type="button" className="button compact primary" onClick={() => updateStatus(material, 'publish')}>Publikasikan</button>}{material.status === 'published' && <button type="button" className="button compact subtle" onClick={() => updateStatus(material, 'archive')}>Arsipkan</button>}<button type="button" className="button compact danger" onClick={() => deleteMaterial(material)}>Hapus</button>{material.file_name && <><button type="button" className="button compact subtle" onClick={() => preview(material)}>Pratinjau</button><button type="button" className="button compact subtle" onClick={() => download(material)}>Unduh file</button></>}</div></div>
        : material.file_name && <div className="row-actions"><button type="button" className="button primary" onClick={() => preview(material)}>Pratinjau</button><button type="button" className="button subtle" onClick={() => download(material)}>Unduh materi</button></div>}
    </article>)}</div> : <section className="panel"><Empty>Belum ada materi pembelajaran.</Empty></section>}
    {previewFile && <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />}
  </>
}

function Submissions({ user, updateKey = 0 }) {
  const admin = user.role === 'admin'
  const { data, error, loading, refresh } = useData(async () => {
    const response = await api.get(admin ? '/submissions?limit=100' : '/submissions/my?limit=100')
    const payload = response.data?.data
    return Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : []
  }, [admin, updateKey])
  const [notice, setNotice] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const [reviewDraft, setReviewDraft] = useState(null)
  const [reviewError, setReviewError] = useState('')
  const [savingReview, setSavingReview] = useState(false)
  const startReview = (submission, status) => {
    setReviewDraft({ id: submission.id, status, feedback: '', points: submission.max_points ?? 0, maxPoints: submission.max_points ?? 0 })
    setReviewError('')
  }
  const submitReview = async (event) => {
    event.preventDefault()
    setReviewError('')
    const feedback = reviewDraft.feedback.trim()
    const points = Number(reviewDraft.points)
    if (reviewDraft.status === 'revision' && !feedback) {
      setReviewError('Catatan revisi wajib diisi.')
      return
    }
    if (reviewDraft.status === 'approved' && (!Number.isInteger(points) || points < 0 || points > reviewDraft.maxPoints)) {
      setReviewError(`Poin harus berupa bilangan bulat antara 0 dan ${reviewDraft.maxPoints}.`)
      return
    }
    setSavingReview(true)
    try {
      const payload = { status: reviewDraft.status, feedback: feedback || null }
      if (reviewDraft.status === 'approved') payload.points = points
      await api.patch(`/submissions/${reviewDraft.id}/review`, payload)
      setNotice(reviewDraft.status === 'approved' ? 'Berhasil: submission disetujui dan poin dicatat.' : 'Berhasil: submission dikembalikan untuk revisi.')
      setReviewDraft(null)
      await refresh()
    } catch (e) {
      setReviewError(messageFrom(e))
    } finally {
      setSavingReview(false)
    }
  }
  const deleteSubmission = async (submission) => {
    const memberName = submission.display_name || submission.username || 'anggota'
    if (!window.confirm(`Hapus submission tugas “${submission.task_title}” milik ${memberName}? Poin yang terkait akan ikut dihapus.`)) return
    try {
      const { data: result } = await api.delete(`/submissions/${submission.id}`)
      const removed = Number(result.data.points_removed) || 0
      setNotice(`Submission berhasil dihapus. ${removed ? `${removed} poin anggota ikut dikurangi.` : 'Tidak ada poin submission yang perlu dikurangi.'}`)
      await refresh()
    } catch (e) {
      setNotice(messageFrom(e))
    }
  }
  const downloadPdf = async (attachmentUrl) => {
    const filename = attachmentUrl.split('/').pop()
    try {
      const { data: file } = await api.get(`/submissions/files/${encodeURIComponent(filename)}`, { responseType: 'blob' })
      const objectUrl = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (e) { setNotice(messageFrom(e)) }
  }
  const previewPdf = (submission) => {
    const filename = submission.attachment_url.split('/').pop()
    setPreviewFile({
      title: submission.task_title,
      filename,
      endpoint: `/submissions/files/${encodeURIComponent(filename)}`
    })
  }
  return <>
    <PageHeading eyebrow="PENGUMPULAN" title={admin ? 'Pemeriksaan submission' : 'Submission saya'} detail={admin ? 'Periksa hasil kerja dan kirim feedback kepada anggota.' : 'Pantau status tugas dan masukan dari admin.'} action={<button type="button" className="button subtle" onClick={refresh} disabled={loading}>{loading ? 'Memuat…' : 'Muat ulang'}</button>} />
    <Notice>{notice || error}</Notice>
    {loading ? <LoadingPage /> : data?.length ? <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Tugas</th>{admin && <th>Anggota</th>}<th>Dikirim</th><th>Status</th><th>Hasil</th><th>Feedback</th>{admin && <th>Aksi</th>}</tr></thead><tbody>{data.map((s) => <tr key={s.id}><td><strong>{s.task_title}</strong></td>{admin && <td>{s.display_name || s.username}</td>}<td>{new Date(s.submitted_at).toLocaleDateString('id-ID')}</td><td><Status value={s.status} /></td><td>{s.submission_content && <div className="submission-copy">{s.submission_content}</div>}{s.attachment_url?.startsWith('/uploads/') ? <div className="row-actions"><button type="button" className="button compact primary" onClick={() => previewPdf(s)}>Pratinjau PDF</button><button type="button" className="button compact subtle" onClick={() => downloadPdf(s.attachment_url)}>Unduh PDF</button></div> : s.attachment_url && <a href={s.attachment_url} target="_blank" rel="noreferrer">Lihat PDF</a>}{!s.submission_content && !s.attachment_url && '—'}</td><td>{s.feedback || '—'}</td>{admin && <td><div className="row-actions">{s.status !== 'approved' && <><button type="button" className="button compact primary" onClick={() => startReview(s, 'approved')}>Setujui</button><button type="button" className="button compact subtle" onClick={() => startReview(s, 'revision')}>Revisi</button></>}<button type="button" className="button compact danger" onClick={() => deleteSubmission(s)}>Hapus</button></div></td>}</tr>)}</tbody></table></div></section> : <section className="panel"><Empty>Belum ada submission.</Empty></section>}
    {previewFile && <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />}
    {reviewDraft && <div className="modal-backdrop"><section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title"><div className="panel-title"><div><span className="eyebrow">TINJAU SUBMISSION</span><h2 id="review-title">{reviewDraft.status === 'approved' ? 'Setujui submission' : 'Minta revisi'}</h2></div><button type="button" className="button subtle compact" onClick={() => setReviewDraft(null)}>Tutup</button></div><form className="form-stack" onSubmit={submitReview}><label>Feedback{reviewDraft.status === 'revision' ? ' (wajib)' : ' (opsional)'}<textarea rows="4" value={reviewDraft.feedback} onChange={(e) => setReviewDraft({ ...reviewDraft, feedback: e.target.value })} required={reviewDraft.status === 'revision'} /></label>{reviewDraft.status === 'approved' && <label>Poin (maksimal {reviewDraft.maxPoints})<input type="number" min="0" max={reviewDraft.maxPoints} step="1" value={reviewDraft.points} onChange={(e) => setReviewDraft({ ...reviewDraft, points: e.target.value })} required /></label>}<Notice>{reviewError}</Notice><div className="row-actions"><button type="button" className="button subtle" onClick={() => setReviewDraft(null)}>Batal</button><button className="button primary" disabled={savingReview}>{savingReview ? 'Menyimpan…' : 'Simpan review'}</button></div></form></section></div>}
  </>
}

function Members() {
  const { data, error, loading, refresh } = useData(async () => {
    const [pending, members] = await Promise.all([
      api.get('/members?status=pending&limit=100'),
      api.get('/members?status=active&limit=100')
    ])
    return { pending: pending.data.data.items, members: members.data.data.items }
  }, [])
  const [notice, setNotice] = useState('')
  const [passwordMember, setPasswordMember] = useState(null)
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmation: '' })
  const [passwordError, setPasswordError] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const setActive = async (member) => { try { await api.patch(`/members/${member.id}`, { is_active: !member.is_active }); setNotice(`Akun anggota berhasil ${member.is_active ? 'dinonaktifkan' : 'diaktifkan'}.`); refresh() } catch (e) { setNotice(messageFrom(e)) } }
  const approveMember = async (member) => {
    try {
      await api.patch(`/members/${member.id}/approve`)
      setNotice(`Berhasil: permintaan akun ${member.display_name || member.username} disetujui.`)
      await refresh()
    } catch (e) { setNotice(messageFrom(e)) }
  }
  const deleteRequest = async (member) => {
    if (!window.confirm(`Tolak dan hapus permintaan akun ${member.display_name || member.username} (@${member.username})?`)) return
    try {
      await api.delete(`/members/${member.id}`)
      setNotice(`Permintaan akun ${member.username} ditolak dan dihapus.`)
      await refresh()
    } catch (e) { setNotice(messageFrom(e)) }
  }
  const openPasswordForm = (member) => {
    setPasswordMember(member)
    setPasswordForm({ password: '', confirmation: '' })
    setPasswordError('')
  }
  const updatePassword = async (event) => {
    event.preventDefault()
    setPasswordError('')
    if (passwordForm.password.length < 8 || new TextEncoder().encode(passwordForm.password).length > 72) {
      setPasswordError('Password harus 8 sampai 72 byte.')
      return
    }
    if (passwordForm.password !== passwordForm.confirmation) {
      setPasswordError('Konfirmasi password tidak sama.')
      return
    }
    setSavingPassword(true)
    try {
      await api.patch(`/members/${passwordMember.id}/password`, { password: passwordForm.password })
      setNotice(`Password ${passwordMember.username} berhasil diubah.`)
      setPasswordMember(null)
      refresh()
    } catch (e) {
      setPasswordError(messageFrom(e))
    } finally {
      setSavingPassword(false)
    }
  }
  const adjust = async (member) => {
    const amount = window.prompt(`Perubahan poin untuk ${member.username}. Gunakan angka negatif untuk mengurangi poin.`)
    if (amount === null) return
    const points_delta = Number(amount)
    if (!Number.isInteger(points_delta) || points_delta === 0) { setNotice('Perubahan poin harus berupa bilangan bulat selain 0.'); return }
    const description = window.prompt('Alasan penyesuaian poin')
    if (description === null) return
    try { await api.post('/points/adjustment', { user_id: member.id, points_delta, description }); setNotice('Penyesuaian poin berhasil dicatat.'); refresh() }
    catch (e) { setNotice(messageFrom(e)) }
  }
  return <>
    <PageHeading eyebrow="ADMINISTRASI" title="Anggota" detail="Tinjau permintaan akun baru dan kelola akses anggota UKM." action={<button type="button" className="button subtle" onClick={refresh} disabled={loading}>{loading ? 'Memuat…' : 'Muat ulang'}</button>} />
    <Notice>{notice || error}</Notice>
    {loading ? <LoadingPage /> : <>
      <section className="panel table-panel member-requests"><div className="panel-title"><div><span className="eyebrow">PERLU PERSETUJUAN</span><h2>Permintaan akun baru</h2></div><span className="status pending">{data?.pending?.length || 0} menunggu</span></div>
        {data?.pending?.length ? <div className="table-scroll"><table><thead><tr><th>Pendaftar</th><th>NIM</th><th>Didaftarkan</th><th>Aksi</th></tr></thead><tbody>{data.pending.map((member) => <tr key={member.id}><td><strong>{member.display_name || member.username}</strong><small className="table-sub">@{member.username}</small></td><td>{member.nim}</td><td>{new Date(member.created_at).toLocaleDateString('id-ID')}</td><td><div className="row-actions"><button type="button" className="button compact primary" onClick={() => approveMember(member)}>Setujui</button><button type="button" className="button compact danger" onClick={() => deleteRequest(member)}>Tolak & hapus</button></div></td></tr>)}</tbody></table></div> : <Empty>Tidak ada permintaan akun yang menunggu persetujuan.</Empty>}
      </section>
      <section className="panel table-panel"><div className="panel-title member-list-heading"><div><span className="eyebrow">ANGGOTA AKTIF</span><h2>Daftar anggota</h2></div></div>{data?.members?.length ? <div className="table-scroll"><table><thead><tr><th>Anggota</th><th>NIM</th><th>Poin</th><th>Aksi</th></tr></thead><tbody>{data.members.map((m) => <tr key={m.id}><td><Link className="text-link" to={`/members/${m.id}`}>{m.display_name || m.username}</Link><small className="table-sub">@{m.username}</small></td><td>{m.nim}</td><td>{m.total_points}</td><td><div className="row-actions"><button type="button" className="button compact subtle" onClick={() => setActive(m)}>Nonaktifkan</button><button type="button" className="button compact subtle" onClick={() => openPasswordForm(m)}>Ubah password</button><button type="button" className="button compact subtle" onClick={() => adjust(m)}>Atur poin</button></div></td></tr>)}</tbody></table></div> : <Empty>Belum ada anggota aktif.</Empty>}</section>
    </>}
    {passwordMember && <div className="modal-backdrop"><section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title"><div className="panel-title"><div><span className="eyebrow">AKUN ANGGOTA</span><h2 id="password-dialog-title">Ubah password</h2><p className="muted">Untuk @{passwordMember.username}</p></div><button type="button" className="button subtle compact" onClick={() => setPasswordMember(null)}>Tutup</button></div><form className="form-stack" onSubmit={updatePassword}><label>Password baru<input type="password" autoComplete="new-password" minLength="8" value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} required /></label><label>Konfirmasi password<input type="password" autoComplete="new-password" minLength="8" value={passwordForm.confirmation} onChange={(e) => setPasswordForm({ ...passwordForm, confirmation: e.target.value })} required /></label><Notice>{passwordError}</Notice><div className="row-actions"><button type="button" className="button subtle" onClick={() => setPasswordMember(null)}>Batal</button><button className="button primary" disabled={savingPassword}>{savingPassword ? 'Menyimpan…' : 'Simpan password'}</button></div></form></section></div>}
  </>
}

function Leaderboard({ user }) {
  const { data, error, loading } = useData(async () => (await api.get('/leaderboard?limit=100')).data.data.items, [])
  return <><PageHeading eyebrow="APRESIASI ANGGOTA" title="Leaderboard" detail="Poin dihitung dari persetujuan tugas dan penyesuaian admin." /><Notice>{error}</Notice>
    {loading ? <LoadingPage /> : <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Peringkat</th><th>Anggota</th><th>Total poin</th><th>Tugas selesai</th><th>Proyek</th></tr></thead><tbody>{data?.map((m) => <tr className={String(m.id) === String(user.id) ? 'current-user' : ''} key={m.id}><td><span className="rank">{String(m.ranking).padStart(2, '0')}</span></td><td><div className="member-cell">{m.avatar_url ? <img src={avatarSource(m.avatar_url)} alt={`Avatar ${m.display_name || m.username}`} /> : <span className="avatar">{(m.display_name || m.username).slice(0, 1).toUpperCase()}</span>}<Link className="text-link" to={`/members/${m.id}`}>{m.display_name || m.username}</Link></div></td><td><strong>{m.total_points}</strong></td><td>{m.completed_tasks}</td><td>{m.published_projects}</td></tr>)}</tbody></table></div></section>}
  </>
}

function MemberProfile() {
  const { id } = useParams()
  const { data, error, loading } = useData(async () => (await api.get(`/members/${id}`)).data.data, [id])
  if (loading) return <LoadingPage />
  return <><PageHeading eyebrow="PROFIL ANGGOTA" title={data?.display_name || data?.username || 'Profil'} detail={data?.username ? `@${data.username}` : ''} /><Notice>{error}</Notice>
    {data && <><section className="panel profile-panel"><div className="profile-avatar">{data.avatar_url ? <img src={avatarSource(data.avatar_url)} alt={`Avatar ${data.display_name || data.username}`} /> : (data.display_name || data.username).slice(0, 1).toUpperCase()}</div><div><h2>{data.display_name || data.username}</h2><p className="muted">@{data.username}</p></div><div className="profile-stats"><Card title="Total poin" value={data.total_points} /><Card title="Tugas selesai" value={data.completed_tasks} /></div><p className="member-bio">{data.bio || 'Anggota UKM Developer Student.'}</p></section>
      <section className="panel project-panel"><div className="panel-title"><div><span className="eyebrow">KARYA ANGGOTA</span><h2>Project yang dipublikasikan</h2></div></div>
        {data.projects?.length ? <div className="project-list">{data.projects.map((project) => <article className="project-item" key={project.id}><div className="project-item-heading"><div><h3>{project.title}</h3><p>{project.description || 'Tidak ada deskripsi.'}</p></div><FolderGit2 size={18} /></div><div className="project-links project-url-list">{project.project_url && <a href={project.project_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> <span>Project: {project.project_url}</span></a>}{project.repository_url && <a href={project.repository_url} target="_blank" rel="noreferrer"><Code2 size={13} /> <span>Repository: {project.repository_url}</span></a>}</div></article>)}</div> : <Empty>Anggota ini belum mempublikasikan project.</Empty>}
      </section></>}
  </>
}

function MemberProjects() {
  const { data, error, loading, refresh } = useData(async () => (await api.get('/member-projects/mine')).data.data, [])
  const emptyForm = { title: '', description: '', project_url: '', repository_url: '' }
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const create = async (event) => {
    event.preventDefault()
    setNotice('')
    if (!form.project_url.trim() && !form.repository_url.trim()) {
      setNotice('Isi minimal satu URL project atau repository.')
      return
    }
    setSaving(true)
    try {
      await api.post('/member-projects', form)
      setForm(emptyForm)
      setNotice('Project berhasil dikirim dan menunggu persetujuan admin.')
      await refresh()
    } catch (e) { setNotice(messageFrom(e)) } finally { setSaving(false) }
  }
  const updateStatus = async (project, status) => {
    try {
      await api.patch(`/member-projects/${project.id}/status`, { status })
      setNotice(`Project berhasil ${status === 'archived' ? 'diarsipkan' : 'dipublikasikan'}.`)
      await refresh()
    } catch (e) { setNotice(messageFrom(e)) }
  }
  const startEditing = (project) => {
    setEditingId(project.id)
    setEditForm({ title: project.title, description: project.description || '', project_url: project.project_url || '', repository_url: project.repository_url || '' })
    setNotice('')
  }
  const saveEdit = async (event, project) => {
    event.preventDefault()
    setNotice('')
    if (!editForm.project_url.trim() && !editForm.repository_url.trim()) {
      setNotice('Isi minimal satu URL project atau repository.')
      return
    }
    setSaving(true)
    try {
      await api.patch(`/member-projects/${project.id}`, editForm)
      setEditingId(null)
      setNotice('Project berhasil diperbarui. Kuota harian tidak berubah.')
      await refresh()
    } catch (e) { setNotice(messageFrom(e)) } finally { setSaving(false) }
  }
  const removeProject = async (project) => {
    if (!window.confirm(`Hapus project “${project.title}”? Kuota hari ini tetap terpakai.`)) return
    try {
      await api.delete(`/member-projects/${project.id}`)
      setNotice('Project berhasil dihapus. Kuota harian tidak berubah.')
      await refresh()
    } catch (e) { setNotice(messageFrom(e)) }
  }
  if (loading) return <LoadingPage />
  const projects = data?.items || []
  const remaining = Math.max(0, (data?.daily_limit || 3) - (data?.created_today || 0))
  return <><PageHeading eyebrow="PORTOFOLIO SAYA" title="Project saya" detail="Bagikan hasil project kepada anggota PulGres lainnya." />
    <Notice>{notice || error}</Notice>
    <section className="panel form-panel"><div className="panel-title"><div><span className="eyebrow">PROJECT BARU</span><h2>Publikasikan hasil project</h2></div><span className="points">Sisa hari ini: {remaining}/3</span></div>
      <form className="project-form" onSubmit={create}><label>Judul project<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength="150" required /></label><label>Deskripsi<textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><div className="project-url-fields"><label>URL project (opsional)<input type="url" placeholder="https://…" value={form.project_url} onChange={(e) => setForm({ ...form, project_url: e.target.value })} maxLength="500" /></label><label>URL repository (opsional)<input type="url" placeholder="https://github.com/…" value={form.repository_url} onChange={(e) => setForm({ ...form, repository_url: e.target.value })} maxLength="500" /></label></div><small className="form-help">Isi minimal satu URL project atau repository. Maksimal 3 project baru per hari; project menunggu persetujuan admin.</small><button className="button primary" disabled={saving || remaining === 0}>{saving ? 'Mengirim…' : 'Kirim untuk ditinjau'}</button></form>
    </section>
    <section className="panel project-panel"><div className="panel-title"><div><span className="eyebrow">DAFTAR KARYA</span><h2>Project yang kamu kelola</h2></div><span className="muted">{projects.length} project</span></div>
      {projects.length ? <div className="project-list">{projects.map((project) => <article className="project-item" key={project.id}>
        <div className="project-item-heading"><div><h3>{project.title}</h3><p>{project.description || 'Tidak ada deskripsi.'}</p><small>{new Date(project.created_at).toLocaleDateString('id-ID')}</small></div><Status value={project.status} /></div>
        <div className="project-links project-url-list">
          {project.project_url && <a href={project.project_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> <span>Project: {project.project_url}</span></a>}
          {project.repository_url && <a href={project.repository_url} target="_blank" rel="noreferrer"><Code2 size={13} /> <span>Repository: {project.repository_url}</span></a>}
        </div>
        {project.status === 'pending' && <small className="form-help">Menunggu persetujuan admin. Project belum tampil di profil.</small>}
        {editingId === project.id ? <form className="project-form project-edit-form" onSubmit={(event) => saveEdit(event, project)}>
          <label>Judul project<input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} maxLength="150" required /></label>
          <label>Deskripsi<textarea rows="3" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></label>
          <div className="project-url-fields"><label>URL project<input type="url" value={editForm.project_url} onChange={(e) => setEditForm({ ...editForm, project_url: e.target.value })} maxLength="500" /></label><label>URL repository<input type="url" value={editForm.repository_url} onChange={(e) => setEditForm({ ...editForm, repository_url: e.target.value })} maxLength="500" /></label></div>
          <small className="form-help">Edit project tidak menggunakan kuota project baru hari ini.</small>
          <div className="row-actions"><button className="button primary compact" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan perubahan'}</button><button type="button" className="button subtle compact" disabled={saving} onClick={() => setEditingId(null)}>Batal</button></div>
        </form> : ['published', 'archived'].includes(project.status) ? <div className="project-links project-manage"><button type="button" className="button subtle compact" onClick={() => startEditing(project)}>Edit</button>{project.status === 'published' ? <button type="button" className="button subtle compact" onClick={() => updateStatus(project, 'archived')}>Arsipkan</button> : <button type="button" className="button compact primary" onClick={() => updateStatus(project, 'published')}>Terbitkan</button>}<button type="button" className="button compact danger" onClick={() => removeProject(project)}>Hapus</button></div> : null}
      </article>)}</div> : <Empty>Belum ada project. Project yang dipublikasikan akan tampil di profilmu.</Empty>}
    </section>
  </>
}

function AdminMemberProjects() {
  const { data, error, loading, refresh } = useData(async () => (await api.get('/member-projects/admin/pending')).data.data, [])
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)
  const approve = async (project) => {
    setBusyId(project.id)
    try {
      await api.patch(`/member-projects/${project.id}/approve`)
      setNotice(`Berhasil: project “${project.title}” disetujui. Member mendapat 5 poin.`)
      await refresh()
    } catch (e) { setNotice(messageFrom(e)) } finally { setBusyId(null) }
  }
  const reject = async (project) => {
    if (!window.confirm(`Tolak dan hapus project “${project.title}” dari @${project.username}?`)) return
    setBusyId(project.id)
    try {
      await api.delete(`/member-projects/${project.id}/reject`)
      setNotice(`Project “${project.title}” ditolak dan dihapus.`)
      await refresh()
    } catch (e) { setNotice(messageFrom(e)) } finally { setBusyId(null) }
  }
  if (loading) return <LoadingPage />
  const projects = data || []
  return <><PageHeading eyebrow="MODERASI KARYA" title="Proyek anggota" detail="Tinjau project yang dikirim member sebelum tampil di profil." action={<button type="button" className="button subtle" onClick={refresh} disabled={loading}>Muat ulang</button>} />
    <Notice>{notice || error}</Notice>
    <section className="panel project-panel admin-project-panel"><div className="panel-title"><div><span className="eyebrow">PERLU PERSETUJUAN</span><h2>Project menunggu review</h2></div><span className="status pending">{projects.length} menunggu</span></div>
      {projects.length ? <div className="project-list">{projects.map((project) => <article className="project-item" key={project.id}>
        <div className="project-item-heading"><div><h3>{project.title}</h3><p>{project.description || 'Tidak ada deskripsi.'}</p><small>Dikirim oleh {project.display_name || project.username} (@{project.username}) · {new Date(project.created_at).toLocaleDateString('id-ID')}</small></div><FolderGit2 size={18} /></div>
        <div className="project-links project-url-list">{project.project_url && <a href={project.project_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> <span>Project: {project.project_url}</span></a>}{project.repository_url && <a href={project.repository_url} target="_blank" rel="noreferrer"><Code2 size={13} /> <span>Repository: {project.repository_url}</span></a>}</div>
        <div className="project-links"><button type="button" className="button primary compact" disabled={busyId === project.id} onClick={() => approve(project)}>{busyId === project.id ? 'Memproses…' : 'Setujui · +5 poin'}</button><button type="button" className="button compact danger" disabled={busyId === project.id} onClick={() => reject(project)}>Tolak & hapus</button></div>
      </article>)}</div> : <Empty>Tidak ada project yang menunggu persetujuan.</Empty>}
    </section>
  </>
}

function Profile({ user, onUser }) {
  const { data, error, loading, refresh } = useData(async () => (await api.get('/profile')).data.data, [user.id])
  const [form, setForm] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarInputKey, setAvatarInputKey] = useState(0)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [passwordKey, setPasswordKey] = useState('')
  const [passwordKeyInput, setPasswordKeyInput] = useState('')
  const [passwordUnlocked, setPasswordUnlocked] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [adminPasswordConfirmation, setAdminPasswordConfirmation] = useState('')
  const [savingAdminPassword, setSavingAdminPassword] = useState(false)
  useEffect(() => { if (data) setForm({ display_name: data.display_name || '', bio: data.bio || '' }) }, [data])
  useEffect(() => {
    if (!avatarFile) { setAvatarPreview(''); return }
    const previewUrl = URL.createObjectURL(avatarFile)
    setAvatarPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [avatarFile])
  const save = async (e) => {
    e.preventDefault()
    const formData = new FormData()
    formData.set('display_name', form.display_name)
    formData.set('bio', form.bio)
    if (avatarFile) formData.set('avatar', avatarFile)
    setSaving(true)
    try {
      await api.put('/profile', formData)
      setAvatarFile(null)
      setAvatarInputKey((key) => key + 1)
      setNotice('Profil berhasil disimpan.')
      window.dispatchEvent(new Event('pulgres-profile-updated'))
      refresh()
    } catch (err) { setNotice(messageFrom(err)) } finally { setSaving(false) }
  }
  const removeAvatar = async () => {
    const formData = new FormData()
    formData.set('display_name', form.display_name)
    formData.set('bio', form.bio)
    formData.set('clear_avatar', 'true')
    setSaving(true)
    try {
      await api.put('/profile', formData)
      setAvatarFile(null)
      setAvatarInputKey((key) => key + 1)
      setNotice('Foto profil berhasil dihapus.')
      window.dispatchEvent(new Event('pulgres-profile-updated'))
      refresh()
    } catch (err) { setNotice(messageFrom(err)) } finally { setSaving(false) }
  }
  const verifyPasswordKey = async (e) => {
    e.preventDefault()
    setSavingAdminPassword(true)
    setNotice('')
    try {
      await api.post('/profile/admin/password/verify', { pwd_key: passwordKeyInput })
      setPasswordKey(passwordKeyInput)
      setPasswordUnlocked(true)
      setPasswordKeyInput('')
      setNotice('Key terkonfirmasi. Silakan masukkan password baru.')
    } catch (err) { setNotice(messageFrom(err)) } finally { setSavingAdminPassword(false) }
  }
  const changeAdminPassword = async (e) => {
    e.preventDefault()
    if (adminPassword.length < 8 || new TextEncoder().encode(adminPassword).length > 72) {
      setNotice('Password harus 8 sampai 72 byte.')
      return
    }
    if (adminPassword !== adminPasswordConfirmation) {
      setNotice('Konfirmasi password tidak sama.')
      return
    }
    setSavingAdminPassword(true)
    setNotice('')
    try {
      await api.patch('/profile/admin/password', { pwd_key: passwordKey, password: adminPassword })
      setPasswordKey('')
      setPasswordUnlocked(false)
      setAdminPassword('')
      setAdminPasswordConfirmation('')
      setNotice('Password admin berhasil diubah.')
    } catch (err) { setNotice(messageFrom(err)) } finally { setSavingAdminPassword(false) }
  }
  const lockAdminPassword = () => {
    setPasswordKey('')
    setPasswordKeyInput('')
    setPasswordUnlocked(false)
    setAdminPassword('')
    setAdminPasswordConfirmation('')
  }
  if (loading) return <LoadingPage />
  return <><PageHeading eyebrow="AKUN SAYA" title="Profil" detail="Informasi profil ini tampil di leaderboard." /><Notice>{notice || error}</Notice>
    <section className="panel profile-panel"><div className="profile-avatar">{avatarPreview ? <img src={avatarPreview} alt="Pratinjau avatar" /> : data?.avatar_url ? <img src={avatarSource(data.avatar_url)} alt={`Avatar ${form?.display_name || user.username}`} /> : (form?.display_name || user.username).slice(0, 1).toUpperCase()}</div><div><h2>{form?.display_name || user.username}</h2><p className="muted">@{user.username} · {user.role === 'admin' ? 'Admin' : 'Anggota'}</p></div>
      <form className="profile-form" onSubmit={save}><label>Nama tampilan<input value={form?.display_name || ''} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required /></label><label>Bio<textarea rows="4" value={form?.bio || ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label><label>Foto profil (opsional, JPEG/PNG/WebP maks. 5 MB)<input key={avatarInputKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setAvatarFile(e.target.files?.[0] || null)} /></label>{(data?.avatar_url || avatarFile) && <button type="button" className="button subtle" onClick={removeAvatar} disabled={saving}>{saving ? 'Menyimpan…' : 'Hapus foto profil'}</button>}<button className="button primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan profil'}</button></form>
      {user.role === 'admin' && <section className="admin-password-panel"><div className="panel-title"><div><span className="eyebrow">KEAMANAN AKUN</span><h2>Ubah password admin</h2></div>{passwordUnlocked && <button type="button" className="button subtle compact" onClick={lockAdminPassword}>Kunci kembali</button>}</div>
        {!passwordUnlocked ? <form className="form-stack" onSubmit={verifyPasswordKey}><label>Key konfirmasi<input type="password" autoComplete="off" value={passwordKeyInput} onChange={(e) => setPasswordKeyInput(e.target.value)} required /></label><button className="button primary" disabled={savingAdminPassword}>{savingAdminPassword ? 'Memeriksa…' : 'Konfirmasi key'}</button></form> : <form className="form-stack" onSubmit={changeAdminPassword}><label>Password baru<input type="password" autoComplete="new-password" minLength="8" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required /></label><label>Konfirmasi password baru<input type="password" autoComplete="new-password" minLength="8" value={adminPasswordConfirmation} onChange={(e) => setAdminPasswordConfirmation(e.target.value)} required /></label><div className="row-actions"><button type="button" className="button subtle" onClick={lockAdminPassword}>Batal</button><button className="button primary" disabled={savingAdminPassword}>{savingAdminPassword ? 'Menyimpan…' : 'Simpan password'}</button></div></form>}
      </section>}
    </section>
  </>
}

function Shell({ user, onLogout, children, onlineUsers, notices }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState('')
  useEffect(() => {
    let active = true
    const loadAvatar = async () => {
      try {
        const { data } = await api.get('/profile')
        if (active) setAvatarUrl(data.data.avatar_url || '')
      } catch {
        if (active) setAvatarUrl('')
      }
    }
    loadAvatar()
    window.addEventListener('pulgres-profile-updated', loadAvatar)
    return () => {
      active = false
      window.removeEventListener('pulgres-profile-updated', loadAvatar)
    }
  }, [user.id])
  const links = [
    { to: '/', label: 'Ringkasan', icon: Summary }, { to: '/tasks', label: 'Tugas', icon: ClipboardList },
    { to: '/learning-materials', label: 'Modul belajar', icon: LibraryBig },
    { to: '/submissions', label: user.role === 'admin' ? 'Submission' : 'Submission saya', icon: ClipboardPen },
    ...(user.role === 'member' ? [{ to: '/member-projects', label: 'Project saya', icon: FolderGit2 }] : []),
    ...(user.role === 'admin' ? [{ to: '/admin/member-projects', label: 'Proyek anggota', icon: FolderUser }] : []),
    ...(user.role === 'admin' ? [{ to: '/members', label: 'Anggota', icon: UserCog }] : []),
    { to: '/leaderboard', label: 'Leaderboard', icon: Podium }, { to: '/profile', label: 'Profil', icon: SquareUser }
  ]
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}><Link className="brand" to="/"><span className="brand-mark">P</span><span>PulGres<small>Developer Student</small></span></Link><div className="nav-label">MENU UTAMA</div><nav>{links.map((item) => <NavLink end={item.to === '/'} to={item.to} key={item.to} onClick={() => setMenuOpen(false)}><span className="nav-icon"><item.icon size={18} strokeWidth={1.8} /></span>{item.label}</NavLink>)}</nav><div className="sidebar-bottom"><div className="online-dot" />{onlineUsers.length} anggota online<div className="sidebar-note">Belajar bareng, tumbuh bareng.</div></div></aside>
    {menuOpen && <button aria-label="Tutup navigasi" className="scrim" onClick={() => setMenuOpen(false)} />}
    <main className="main-area"><header className="topbar"><button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>☰</button><div className="crumb">PulGres <span>/</span> Dashboard</div><div className="top-user"><div className="notice-count" title={notices[0] || 'Tidak ada notifikasi'}>{notices.length ? '●' : '○'}</div><div className="user-copy"><strong>{user.username}</strong><small>{user.role === 'admin' ? 'Administrator' : 'Anggota'}</small></div><Link className="avatar" to="/profile">{avatarUrl ? <img src={avatarSource(avatarUrl)} alt={`Avatar ${user.username}`} /> : user.username.slice(0, 1).toUpperCase()}</Link><button className="logout" onClick={onLogout}><LogOut size={15} strokeWidth={2} aria-hidden="true" /><span>Keluar</span></button></div></header>
      {notices.length > 0 && <div className="toast" role="status">{notices[0]}</div>}
      <div className="page-content">{children}</div><footer className="footer">PulGres <span>•</span> UKM Developer Student</footer>
    </main>
  </div>
}

export default function App() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(Boolean(sessionStorage.getItem('pulgres_token')))
  const [onlineUsers, setOnlineUsers] = useState([])
  const [notices, setNotices] = useState([])
  const [submissionUpdates, setSubmissionUpdates] = useState(0)
  const [learningMaterialUpdates, setLearningMaterialUpdates] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    // Bersihkan token lama yang dahulu disimpan bersama oleh semua tab.
    localStorage.removeItem('pulgres_token')
    const token = sessionStorage.getItem('pulgres_token')
    if (!token) return
    api.get('/auth/me').then(({ data }) => setUser(data.data.user)).catch(() => sessionStorage.removeItem('pulgres_token')).finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    const token = sessionStorage.getItem('pulgres_token')
    if (!user || !token) return
    const socket = io(socketUrl, { auth: { token }, transports: ['websocket', 'polling'] })
    socket.on('online-users', setOnlineUsers)
    const addNotice = (text) => setNotices((current) => [text, ...current].slice(0, 3))
    socket.on('new-task', (task) => addNotice(`Tugas baru: ${task.title}`))
    socket.on('learning-material-published', (material) => {
      addNotice(`Materi baru tersedia: ${material.title}`)
      setLearningMaterialUpdates((current) => current + 1)
    })
    socket.on('new-submission', () => {
      addNotice('Submission baru masuk untuk diperiksa.')
      setSubmissionUpdates((current) => current + 1)
    })
    socket.on('submission-deleted', (event) => addNotice(event?.deleted_by_role === 'member'
      ? 'Submission kamu berhasil dihapus. Silakan kirim file pengganti.'
      : 'Submission kamu telah dihapus oleh admin.'))
    socket.on('points-revoked', (event) => addNotice(`${event.points} poin dikurangi. Total poin sekarang ${event.total_points}.`))
    socket.on('submission-reviewed', (event) => addNotice(`Submission kamu ${event.status === 'approved' ? 'disetujui' : 'memerlukan revisi'}.`))
    socket.on('points-earned', (event) => addNotice(`Kamu mendapat ${event.points} poin. Total ${event.total_points ?? ''}.`))
    return () => socket.disconnect()
  }, [user])

  const logout = () => { sessionStorage.removeItem('pulgres_token'); setUser(null); setOnlineUsers([]); setNotices([]); navigate('/login') }
  if (checking) return <div className="full-loading">Memeriksa sesi…</div>
  return <Routes>
    <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onLogin={setUser} />} />
    <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
    <Route path="/*" element={user ? <Shell user={user} onLogout={logout} onlineUsers={onlineUsers} notices={notices}><Routes>
      <Route path="/" element={<Dashboard user={user} onlineUsers={onlineUsers} />} />
      <Route path="/tasks" element={<Tasks user={user} />} />
      <Route path="/learning-materials" element={<LearningMaterials user={user} updateKey={learningMaterialUpdates} />} />
      <Route path="/submissions" element={<Submissions user={user} updateKey={submissionUpdates} />} />
      <Route path="/member-projects" element={user.role === 'member' ? <MemberProjects /> : <Navigate to="/" replace />} />
      <Route path="/admin/member-projects" element={user.role === 'admin' ? <AdminMemberProjects /> : <Navigate to="/" replace />} />
      <Route path="/members" element={user.role === 'admin' ? <Members /> : <Navigate to="/" replace />} />
      <Route path="/members/:id" element={<MemberProfile user={user} />} />
      <Route path="/leaderboard" element={<Leaderboard user={user} />} />
      <Route path="/profile" element={<Profile user={user} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></Shell> : <Navigate to="/login" replace />} />
  </Routes>
}
