import { useCallback, useEffect, useState } from 'react'

const sectionGroups = [
  { key: 'catalogue', label: 'Catalogue', items: [['movies', 'Movies & events'], ['cities', 'Cities']] },
  { key: 'venues', label: 'Venues & schedules', items: [['theatres', 'Cinema venues'], ['stadiums', 'Stadiums'], ['screens', 'Seating & sections'], ['shows', 'Showtimes']] },
  { key: 'operations', label: 'Bookings & customers', items: [['bookings', 'Bookings'], ['users', 'Customers'], ['payments', 'Payments']] },
  { key: 'manage', label: 'Promotions & reports', items: [['banners', 'Promotions & banners'], ['analytics', 'Reports & analytics'], ['managers', 'Manager accounts']] },
]

const emptyMovie = () => ({
  title: '',
  type: 'movie',
  sport: '',
  homeTeam: '',
  awayTeam: '',
  tournament: '',
  city: '',
  status: 'nowShowing',
  language: 'English',
  duration: 120,
  rating: 0,
  posterUrl: '',
  bannerUrl: '',
  trailerUrl: '',
  venueNote: '',
  cast: '',
  crew: '',
  releaseDate: '',
  ticketSalesStart: '',
  ticketSalesEnd: '',
  description: '',
  published: true,
  trending: false,
})

const emptyCity = () => ({ name: '', state: '' })
const emptyTheatre = () => ({ name: '', venueType: 'cinema', city: '', district: '', state: '', pincode: '', address: '', latitude: '', longitude: '', formats: '2D, 3D' })
const emptyScreen = () => ({ name: '', theatre: '', capacity: 72, seatPrices: { premium: 320, comfort: 240, standard: 180 } })
const emptyShow = () => ({ movie: '', theatre: '', screen: '', date: '', time: '', basePrice: 180 })
const emptyBanner = () => ({ title: '', description: '', imageUrl: '', targetUrl: '/', city: '', order: 0, active: true, startsAt: '', endsAt: '' })
const emptyManager = () => ({ name: '', email: '', phone: '', password: '' })
const defaultAnalyticsDates = () => ({
  from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
  to: new Date().toISOString().slice(0, 10),
})

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function Field({ label, children }) {
  return <label className="portal-field"><span>{label}</span>{children}</label>
}

function ImageField({ label, value, onChange, api, previewType = 'banner' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const upload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Choose a PNG, JPEG, WebP or GIF image.')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Images must be smaller than 4 MB.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('The image could not be read.'))
        reader.readAsDataURL(file)
      })
      const result = await api('/admin/uploads', {
        method: 'POST',
        body: JSON.stringify({ data }),
      })
      onChange(result.url)
    } catch (issue) {
      setError(issue.message || 'The image could not be uploaded.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="portal-image-field">
      <label className="portal-field">
        <span>{label} · PNG, JPG, WebP or GIF (max 4 MB)</span>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} disabled={busy} />
      </label>
      {value && <div className={`portal-image-preview ${previewType}`}><img src={value} alt={`${label} preview`} /><button className="ghost-button" type="button" onClick={() => onChange('')}>Remove image</button></div>}
      {busy && <small role="status">Uploading image…</small>}
      {error && <small className="auth-error" role="alert">{error}</small>}
    </div>
  )
}

export default function Admin({ api }) {
  const [data, setData] = useState(null)
  const [activeSection, setActiveSection] = useState('overview')
  const [openNavGroup, setOpenNavGroup] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [movieForm, setMovieForm] = useState(emptyMovie)
  const [editingMovie, setEditingMovie] = useState('')
  const [cityForm, setCityForm] = useState(emptyCity)
  const [editingCity, setEditingCity] = useState('')
  const [theatreForm, setTheatreForm] = useState(emptyTheatre)
  const [editingTheatre, setEditingTheatre] = useState('')
  const [screenForm, setScreenForm] = useState(emptyScreen)
  const [editingScreen, setEditingScreen] = useState('')
  const [showForm, setShowForm] = useState(emptyShow)
  const [editingShow, setEditingShow] = useState('')
  const [bannerForm, setBannerForm] = useState(emptyBanner)
  const [editingBanner, setEditingBanner] = useState('')
  const [managerForm, setManagerForm] = useState(emptyManager)
  const [userSearch, setUserSearch] = useState('')
  const [bookingSearch, setBookingSearch] = useState('')
  const [bookingStatus, setBookingStatus] = useState('')
  const [showPage, setShowPage] = useState(1)
  const [showPages, setShowPages] = useState(1)
  const [analyticsDates, setAnalyticsDates] = useState(defaultAnalyticsDates)
  const [analytics, setAnalytics] = useState(null)
  const [analyticsError, setAnalyticsError] = useState('')
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const [portal, showsResult] = await Promise.all([
        api('/admin/portal'),
        api(`/admin/shows?page=${showPage}&limit=50&all=true`),
      ])
      setData({ ...portal, shows: showsResult.shows })
      setShowPages(showsResult.pages || 1)
      return true
    } catch (issue) {
      setError(issue.message)
      return false
    }
  }, [api, showPage])

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    setAnalyticsError('')
    try {
      const params = new URLSearchParams(analyticsDates)
      setAnalytics(await api(`/admin/analytics?${params}`))
    } catch (issue) {
      setAnalyticsError(issue.message)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [api, analyticsDates])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  const perform = async (action, successMessage) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      const refreshed = await load()
      setNotice(refreshed
        ? successMessage
        : `${successMessage} The view could not refresh; use Refresh data before making another change.`)
      return true
    } catch (issue) {
      setError(issue.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveMovie = async (event) => {
    event.preventDefault()
    if (movieForm.type === 'sports' && (!movieForm.city || !movieForm.sport)) {
      setError('Choose a city and sport category for this event.')
      return
    }
    const body = {
      ...movieForm,
      city: movieForm.city || null,
      sport: movieForm.sport || null,
      cast: movieForm.cast.split(',').map((item) => item.trim()).filter(Boolean),
      crew: movieForm.crew.split(',').map((item) => item.trim()).filter(Boolean),
      duration: Number(movieForm.duration),
      rating: Number(movieForm.rating),
    }
    delete body.genre
    const saved = await perform(
      () => api(editingMovie ? `/admin/movies/${editingMovie}` : '/admin/movies', {
        method: editingMovie ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      }),
      editingMovie ? 'Catalogue item updated.' : 'Catalogue item created.',
    )
    if (saved) {
      setMovieForm(emptyMovie())
      setEditingMovie('')
    }
  }

  const editMovie = (movie) => {
    setEditingMovie(movie._id)
    setMovieForm({
      ...emptyMovie(),
      ...movie,
      cast: (movie.cast || []).join(', '),
      crew: (movie.crew || []).join(', '),
      city: movie.city?._id || movie.city || '',
      releaseDate: movie.releaseDate ? new Date(movie.releaseDate).toISOString().slice(0, 10) : '',
      ticketSalesStart: movie.ticketSalesStart ? new Date(movie.ticketSalesStart).toISOString().slice(0, 16) : '',
      ticketSalesEnd: movie.ticketSalesEnd ? new Date(movie.ticketSalesEnd).toISOString().slice(0, 16) : '',
      duration: movie.duration || 120,
      rating: movie.rating || 0,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveCity = async (event) => {
    event.preventDefault()
    const saved = await perform(
      () => api(editingCity ? `/admin/cities/${editingCity}` : '/admin/cities', {
        method: editingCity ? 'PATCH' : 'POST',
        body: JSON.stringify(cityForm),
      }),
      editingCity ? 'City updated.' : 'City added.',
    )
    if (saved) {
      setCityForm(emptyCity())
      setEditingCity('')
    }
  }

  const saveTheatre = async (event) => {
    event.preventDefault()
    const cityName = theatreForm.city.trim()
    if (!cityName) {
      setError('Enter the venue city.')
      return
    }
    if (!/^\d{6}$/.test(theatreForm.pincode)) {
      setError('Enter a valid 6-digit pincode.')
      return
    }
    const body = {
      ...theatreForm,
      venueType: activeSection === 'stadiums' ? 'stadium' : 'cinema',
    }
    const saved = await perform(
      async () => {
        const cities = await api('/admin/cities')
        let city = cities.find((item) => item.name.trim().toLocaleLowerCase() === cityName.toLocaleLowerCase())
        if (!city) {
          try {
            city = await api('/admin/cities', {
              method: 'POST',
              body: JSON.stringify({ name: cityName, state: theatreForm.state.trim() }),
            })
          } catch (issue) {
            const refreshedCities = await api('/admin/cities')
            city = refreshedCities.find((item) => item.name.trim().toLocaleLowerCase() === cityName.toLocaleLowerCase())
            if (!city) throw issue
          }
        }
        return api(editingTheatre ? `/admin/theatres/${editingTheatre}` : '/admin/theatres', {
          method: editingTheatre ? 'PATCH' : 'POST',
          body: JSON.stringify({ ...body, city: city._id }),
        })
      },
      editingTheatre ? 'Theatre updated.' : 'Theatre added.',
    )
    if (saved) {
      setTheatreForm(emptyTheatre())
      setEditingTheatre('')
    }
  }

  const saveScreen = async (event) => {
    event.preventDefault()
    const body = {
      ...screenForm,
      capacity: Number(screenForm.capacity),
      seatPrices: Object.fromEntries(
        Object.entries(screenForm.seatPrices).map(([category, price]) => [category, Number(price)]),
      ),
    }
    const saved = await perform(
      () => api(editingScreen ? `/admin/screens/${editingScreen}` : '/admin/screens', {
        method: editingScreen ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      }),
      editingScreen ? 'Screen updated.' : 'Screen added.',
    )
    if (saved) {
      setScreenForm(emptyScreen())
      setEditingScreen('')
    }
  }

  const createManager = async (event) => {
    event.preventDefault()
    const saved = await perform(
      () => api('/admin/managers', {
        method: 'POST',
        body: JSON.stringify(managerForm),
      }),
      'Manager account created.',
    )
    if (saved) setManagerForm(emptyManager())
  }

  const saveShow = async (event) => {
    event.preventDefault()
    const saved = await perform(
      () => api(editingShow ? `/admin/shows/${editingShow}` : '/admin/shows', {
        method: editingShow ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...showForm, basePrice: Number(showForm.basePrice) }),
      }),
      editingShow ? 'Show schedule updated.' : 'Bookable show created.',
    )
    if (saved) {
      setShowForm(emptyShow())
      setEditingShow('')
    }
  }

  const editShow = (show) => {
    setEditingShow(show._id)
    setShowForm({
      movie: show.movie?._id || '',
      theatre: show.theatre?._id || '',
      screen: show.screen?._id || '',
      date: show.date || '',
      time: show.time || '',
      basePrice: show.basePrice || 180,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveBanner = async (event) => {
    event.preventDefault()
    const saved = await perform(
      () => api(editingBanner ? `/admin/banners/${editingBanner}` : '/admin/banners', {
        method: editingBanner ? 'PATCH' : 'POST',
        body: JSON.stringify(bannerForm),
      }),
      editingBanner ? 'Homepage banner updated.' : 'Homepage banner published.',
    )
    if (saved) {
      setBannerForm(emptyBanner())
      setEditingBanner('')
    }
  }

  const editBanner = (banner) => {
    setEditingBanner(banner._id)
    setBannerForm({
      title: banner.title,
      description: banner.description || '',
      imageUrl: banner.imageUrl,
      targetUrl: banner.targetUrl,
      city: banner.city?._id || '',
      order: banner.order || 0,
      active: banner.active,
      startsAt: banner.startsAt ? new Date(banner.startsAt).toISOString().slice(0, 16) : '',
      endsAt: banner.endsAt ? new Date(banner.endsAt).toISOString().slice(0, 16) : '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const remove = (resource, id, label) => {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    perform(
      () => api(`/admin/${resource}/${id}`, { method: 'DELETE' }),
      `${label} deleted.`,
    )
  }

  if (!data && !error) {
    return <div className="page"><div className="eyebrow">Admin portal</div><h1>Loading operations…</h1></div>
  }

  if (error && !data) {
    return <div className="page"><div className="empty"><b>Could not load the admin portal.</b><p>{error}</p><button className="ghost-button" onClick={load}>Try again</button></div></div>
  }

  const stats = data.stats
  const canManageManagers = ['admin', 'superadmin'].includes(data.currentRole)
  const visibleGroups = sectionGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(([key]) => key !== 'managers' || canManageManagers),
    }))
    .filter((group) => group.items.length)
  const recentAnalyticsDays = analytics?.daily?.slice(-14) || []
  const maxDailyBookings = Math.max(...recentAnalyticsDays.map((item) => item.bookings), 1)
  const filteredBookings = data.bookings.filter((booking) => {
    const searchText = `${booking.bookingId} ${booking.user?.name || ''} ${booking.user?.email || ''} ${booking.show?.movie?.title || ''}`.toLowerCase()
    return searchText.includes(bookingSearch.toLowerCase()) && (!bookingStatus || booking.status === bookingStatus)
  })
  const rowActions = (onEdit, onDelete, deleteLabel = 'Delete') => (
    <div className="portal-row-actions">
      {onEdit && <button className="ghost-button" type="button" onClick={onEdit}>Edit</button>}
      {onDelete && <button className="ghost-button danger-button" type="button" onClick={onDelete}>{deleteLabel}</button>}
    </div>
  )

  return (
    <div className="page admin-page">
      <div className="admin-portal-heading">
        <div>
          <span className="eyebrow">Operations workspace</span>
          <h1>Management dashboard</h1>
          <p className="muted">Control your catalogue, venues, inventory, promotions, customers and reporting.</p>
        </div>
        <button className="ghost-button" onClick={() => { load(); loadAnalytics() }} disabled={busy || analyticsLoading}>↻ Refresh data</button>
      </div>

      <div className="admin-portal-layout">
        <aside className="admin-portal-nav" aria-label="Admin sections">
          <button
            type="button"
            className={`admin-nav-overview${activeSection === 'overview' ? ' selected' : ''}`}
            onClick={() => setActiveSection('overview')}
          >
            Overview
          </button>
          {visibleGroups.map((group) => {
            const expanded = openNavGroup === group.key
            const currentItem = group.items.find(([key]) => key === activeSection)
            const groupId = `admin-nav-${group.key}`
            return (
              <div className={`admin-nav-group${expanded ? ' expanded' : ''}`} key={group.key}>
                <button
                  type="button"
                  className={`admin-nav-group-toggle${currentItem ? ' contains-selected' : ''}`}
                  aria-expanded={expanded}
                  aria-controls={groupId}
                  onClick={() => setOpenNavGroup(expanded ? '' : group.key)}
                >
                  <span>{group.label}{currentItem && <small>{currentItem[1]}</small>}</span>
                  <span className={`admin-nav-chevron${expanded ? ' expanded' : ''}`} aria-hidden="true">⌄</span>
                </button>
                {expanded && (
                  <div className="admin-nav-group-items" id={groupId}>
                    {group.items.map(([key, label]) => (
                      <button
                        type="button"
                        key={key}
                        className={activeSection === key ? 'selected' : ''}
                        onClick={() => {
                          setActiveSection(key)
                          setOpenNavGroup(group.key)
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </aside>

        <section className="admin-portal-content">
          {error && <p className="auth-error" role="alert">{error}</p>}
          {notice && <p className="admin-message" role="status">{notice}</p>}

          {activeSection === 'overview' && (
            <>
              <div className="admin-section-heading"><div><span className="eyebrow">Live overview</span><h2>Platform performance</h2></div><span className="admin-data-updated">Database-backed totals</span></div>
              <div className="stat-grid portal-stat-grid">
                {[
                  ['Published titles', stats.movies, 'Movies and events'],
                  ['Now-showing movies', stats.activeMovies, 'Published and bookable'],
                  ['Sports events', stats.sportsEvents, 'Published sports catalogue'],
                  ['Cities', stats.cities, 'Available locations'],
                  ['Cinema venues', stats.theatres, 'Theatres and cinemas'],
                  ['Stadiums', stats.stadiums, 'Sports venues'],
                  ['Upcoming shows', stats.shows, 'Active bookable schedules'],
                  ['Bookings', stats.bookings, 'All booking records'],
                  ['Confirmed bookings', stats.confirmedBookings, 'Payment-verified bookings'],
                  ['Cancelled bookings', stats.cancelledBookings, 'Cancelled booking records'],
                  ['Accounts', stats.users, 'Registered customers and staff'],
                  ['Pending payments', stats.pendingPayments, 'Awaiting provider updates'],
                  ['Gross revenue', `₹${Number(stats.revenue).toLocaleString('en-IN')}`, 'Recorded bookings'],
                ].map(([label, value, detail]) => (
                  <div className="stat-card" key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
                ))}
              </div>
              <section className="admin-dashboard-reports">
                <div className="admin-section-heading"><div><span className="eyebrow">Last 30 days</span><h2>Bookings and revenue</h2></div><button className="text-button" type="button" onClick={() => setActiveSection('analytics')}>Open reports →</button></div>
                {analyticsLoading && <p className="muted">Loading database analytics…</p>}
                {analyticsError && <p className="auth-error" role="alert">{analyticsError}</p>}
                {recentAnalyticsDays.length > 0 && <div className="admin-chart" aria-label="Daily bookings and revenue">
                  {recentAnalyticsDays.map((day) => (
                    <div className="admin-chart-column" key={day._id} title={`${day._id}: ${day.bookings} bookings, ₹${Number(day.revenue).toLocaleString('en-IN')}`}>
                      <div className="admin-chart-bar" style={{ height: `${Math.max(4, day.bookings / maxDailyBookings * 100)}%` }} />
                      <small>{day._id.slice(5)}</small>
                    </div>
                  ))}
                </div>}
                {analytics && !analytics.daily.length && <div className="admin-inline-empty">No bookings recorded in this period yet.</div>}
              </section>
            </>
          )}

          {activeSection === 'movies' && (
            <>
              <h2>{editingMovie ? 'Edit catalogue item' : 'Add a movie or event'}</h2>
              <form className="admin-form portal-form" onSubmit={saveMovie}>
                <Field label="Title"><input value={movieForm.title} onChange={(event) => setMovieForm({ ...movieForm, title: event.target.value })} required /></Field>
                <Field label="Type"><select value={movieForm.type} onChange={(event) => setMovieForm({ ...movieForm, type: event.target.value })}><option value="movie">Movie</option><option value="sports">Sports</option><option value="comedy">Comedy</option></select></Field>
                <Field label="Release / event status"><select value={movieForm.status || 'nowShowing'} onChange={(event) => setMovieForm({ ...movieForm, status: event.target.value })}><option value="comingSoon">Coming soon</option><option value="nowShowing">Now showing / on sale</option><option value="ended">Ended</option></select></Field>
                {movieForm.type === 'sports'
                  ? <>
                    <Field label="Sport category"><select value={movieForm.sport || ''} onChange={(event) => setMovieForm({ ...movieForm, sport: event.target.value })} required><option value="">Choose sport</option>{['cricket', 'football', 'hockey', 'basketball', 'tennis', 'badminton', 'kabaddi', 'motorsports', 'esports'].map((sport) => <option key={sport} value={sport}>{sport}</option>)}</select></Field>
                    <Field label="Event city"><select value={movieForm.city || ''} onChange={(event) => setMovieForm({ ...movieForm, city: event.target.value })} required><option value="">Choose city</option>{data.cities.map((city) => <option key={city._id} value={city._id}>{city.name}</option>)}</select></Field>
                    <Field label="Tournament / competition"><input value={movieForm.tournament || ''} onChange={(event) => setMovieForm({ ...movieForm, tournament: event.target.value })} /></Field>
                  </>
                  : <Field label="Sport (optional)"><input value={movieForm.sport || ''} onChange={(event) => setMovieForm({ ...movieForm, sport: event.target.value })} /></Field>}
                {movieForm.type === 'sports' && <>
                  <Field label="Home team"><input value={movieForm.homeTeam || ''} onChange={(event) => setMovieForm({ ...movieForm, homeTeam: event.target.value })} /></Field>
                  <Field label="Away team"><input value={movieForm.awayTeam || ''} onChange={(event) => setMovieForm({ ...movieForm, awayTeam: event.target.value })} /></Field>
                  <Field label="Ticket sales start"><input type="datetime-local" value={movieForm.ticketSalesStart || ''} onChange={(event) => setMovieForm({ ...movieForm, ticketSalesStart: event.target.value })} /></Field>
                  <Field label="Ticket sales end"><input type="datetime-local" value={movieForm.ticketSalesEnd || ''} onChange={(event) => setMovieForm({ ...movieForm, ticketSalesEnd: event.target.value })} /></Field>
                </>}
                <Field label="Language"><input value={movieForm.language} onChange={(event) => setMovieForm({ ...movieForm, language: event.target.value })} required /></Field>
                <Field label="Duration in minutes"><input type="number" min="1" value={movieForm.duration} onChange={(event) => setMovieForm({ ...movieForm, duration: event.target.value })} /></Field>
                <Field label="Rating"><input type="number" min="0" max="10" step=".1" value={movieForm.rating} onChange={(event) => setMovieForm({ ...movieForm, rating: event.target.value })} /></Field>
                <Field label="Poster URL (optional)"><input type="text" inputMode="url" placeholder="https://… or /uploads/…" value={movieForm.posterUrl || ''} onChange={(event) => setMovieForm({ ...movieForm, posterUrl: event.target.value })} /></Field>
                <ImageField label="Upload poster" value={movieForm.posterUrl || ''} onChange={(posterUrl) => setMovieForm({ ...movieForm, posterUrl })} api={api} previewType="poster" />
                <Field label="Banner URL (optional)"><input type="text" inputMode="url" placeholder="https://… or /uploads/…" value={movieForm.bannerUrl || ''} onChange={(event) => setMovieForm({ ...movieForm, bannerUrl: event.target.value })} /></Field>
                <ImageField label="Upload event banner" value={movieForm.bannerUrl || ''} onChange={(bannerUrl) => setMovieForm({ ...movieForm, bannerUrl })} api={api} />
                <Field label="Trailer URL"><input type="url" value={movieForm.trailerUrl || ''} onChange={(event) => setMovieForm({ ...movieForm, trailerUrl: event.target.value })} /></Field>
                <Field label="Cast / participants"><input value={movieForm.cast || ''} onChange={(event) => setMovieForm({ ...movieForm, cast: event.target.value })} placeholder="Separate names with commas" /></Field>
                <Field label="Crew"><input value={movieForm.crew || ''} onChange={(event) => setMovieForm({ ...movieForm, crew: event.target.value })} placeholder="Separate names with commas" /></Field>
                {movieForm.type === 'movie' && <Field label="Release date"><input type="date" value={movieForm.releaseDate || ''} onChange={(event) => setMovieForm({ ...movieForm, releaseDate: event.target.value })} /></Field>}
                {movieForm.type === 'sports' && <Field label="Venue information"><input value={movieForm.venueNote || ''} onChange={(event) => setMovieForm({ ...movieForm, venueNote: event.target.value })} /></Field>}
                <Field label="Description"><textarea value={movieForm.description || ''} onChange={(event) => setMovieForm({ ...movieForm, description: event.target.value })} /></Field>
                <div className="portal-checkboxes">
                  <label><input type="checkbox" checked={Boolean(movieForm.published)} onChange={(event) => setMovieForm({ ...movieForm, published: event.target.checked })} /> Published</label>
                  <label><input type="checkbox" checked={Boolean(movieForm.trending)} onChange={(event) => setMovieForm({ ...movieForm, trending: event.target.checked })} /> Trending</label>
                </div>
                <div className="portal-form-actions"><button className="primary-button" disabled={busy}>{editingMovie ? 'Save changes' : 'Add to catalogue'}</button>{editingMovie && <button className="ghost-button" type="button" onClick={() => { setEditingMovie(''); setMovieForm(emptyMovie()) }}>Cancel edit</button>}</div>
              </form>
              <div className="portal-list">
                {data.movies.map((movie) => (
                  <div className="portal-row" key={movie._id}>
                    <img className="portal-poster" src={movie.posterUrl || '/poster-placeholder.svg'} alt="" />
                    <div className="portal-row-copy"><b>{movie.title}</b><small>{movie.type || 'movie'} · {movie.city?.name || movie.language} · {movie.status || (movie.published ? 'Published' : 'Unpublished')}</small></div>
                    {rowActions(() => editMovie(movie), () => remove('movies', movie._id, movie.title))}
                  </div>
                ))}
                {!data.movies.length && <div className="admin-inline-empty">No movies or events yet. Add one above to publish it to the customer portal.</div>}
              </div>
            </>
          )}

          {activeSection === 'cities' && (
            <>
              <h2>{editingCity ? 'Edit city' : 'Add a city'}</h2>
              <form className="admin-form portal-form" onSubmit={saveCity}>
                <Field label="City name"><input value={cityForm.name} onChange={(event) => setCityForm({ ...cityForm, name: event.target.value })} required /></Field>
                <Field label="State"><input value={cityForm.state} onChange={(event) => setCityForm({ ...cityForm, state: event.target.value })} /></Field>
                <div className="portal-form-actions"><button className="primary-button" disabled={busy}>{editingCity ? 'Save city' : 'Add city'}</button>{editingCity && <button className="ghost-button" type="button" onClick={() => { setEditingCity(''); setCityForm(emptyCity()) }}>Cancel edit</button>}</div>
              </form>
              <div className="portal-list">{data.cities.map((city) => <div className="portal-row" key={city._id}><div className="portal-row-copy"><b>{city.name}</b><small>{city.state || 'State not set'}</small></div>{rowActions(() => { setEditingCity(city._id); setCityForm({ name: city.name, state: city.state || '' }) }, () => remove('cities', city._id, city.name))}</div>)}</div>
            </>
          )}

          {(activeSection === 'theatres' || activeSection === 'stadiums') && (
            <>
              <div className="admin-section-heading">
                <div><span className="eyebrow">{activeSection === 'stadiums' ? 'Sports venues' : 'Cinema operations'}</span><h2>{editingTheatre ? 'Edit venue' : `Add ${activeSection === 'stadiums' ? 'a stadium' : 'a cinema venue'}`}</h2></div>
                <span className="admin-data-updated">{activeSection === 'stadiums' ? 'Stadiums and arenas' : 'Theatres and cinemas'}</span>
              </div>
              <form className="admin-form portal-form" onSubmit={saveTheatre}>
                <Field label={activeSection === 'stadiums' ? 'Stadium / arena name' : 'Cinema / theatre name'}><input value={theatreForm.name} onChange={(event) => setTheatreForm({ ...theatreForm, name: event.target.value })} required /></Field>
                <Field label="City"><input list="manager-city-options" value={theatreForm.city} onChange={(event) => setTheatreForm({ ...theatreForm, city: event.target.value })} placeholder="Type a city name" required /><datalist id="manager-city-options">{data.cities.map((city) => <option value={city.name} key={city._id} />)}</datalist></Field>
                <Field label="District"><input value={theatreForm.district} onChange={(event) => setTheatreForm({ ...theatreForm, district: event.target.value })} placeholder="Enter district" /></Field>
                <Field label="State"><input value={theatreForm.state} onChange={(event) => setTheatreForm({ ...theatreForm, state: event.target.value })} placeholder="Enter state" /></Field>
                <Field label="Pincode"><input inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={theatreForm.pincode} onChange={(event) => setTheatreForm({ ...theatreForm, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="6-digit pincode" required /></Field>
                <Field label="Address"><input value={theatreForm.address} onChange={(event) => setTheatreForm({ ...theatreForm, address: event.target.value })} /></Field>
                <Field label="Latitude"><input type="number" min="-90" max="90" step=".0001" value={theatreForm.latitude} onChange={(event) => setTheatreForm({ ...theatreForm, latitude: event.target.value })} /></Field>
                <Field label="Longitude"><input type="number" min="-180" max="180" step=".0001" value={theatreForm.longitude} onChange={(event) => setTheatreForm({ ...theatreForm, longitude: event.target.value })} /></Field>
                <Field label={activeSection === 'stadiums' ? 'Facilities / sections' : 'Formats (comma separated)'}><input value={theatreForm.formats} onChange={(event) => setTheatreForm({ ...theatreForm, formats: event.target.value })} placeholder={activeSection === 'stadiums' ? 'General, Premium, VIP, Hospitality' : '2D, 3D, IMAX'} /></Field>
                {editingTheatre && (!theatreForm.district || !theatreForm.state || !theatreForm.pincode) && <p className="admin-form-hint">This venue was saved without all location details. Add the missing { [!theatreForm.district && 'district', !theatreForm.state && 'state', !theatreForm.pincode && 'pincode'].filter(Boolean).join(', ') } so customers can find it.</p>}
                <p className="admin-form-hint">{activeSection === 'stadiums' ? 'Add seating areas as screens in the Seating & sections panel. Venue records remain shared with events and bookings.' : 'Add screens and seating layouts from Seating & sections.'}</p>
                <div className="portal-form-actions"><button className="primary-button" disabled={busy}>{editingTheatre ? 'Save venue' : 'Add venue'}</button>{editingTheatre && <button className="ghost-button" type="button" onClick={() => { setEditingTheatre(''); setTheatreForm(emptyTheatre()) }}>Cancel edit</button>}</div>
              </form>
              <div className="portal-list">{data.theatres.filter((theatre) => activeSection === 'stadiums' ? theatre.venueType === 'stadium' : theatre.venueType !== 'stadium').map((theatre) => <div className="portal-row" key={theatre._id}><div className="portal-row-copy"><b>{theatre.name}</b><small>{[theatre.city?.name, theatre.district || 'District not set', theatre.state || 'State not set', theatre.pincode || 'Pincode not set', theatre.address || 'Address not set', theatre.venueType || 'cinema'].filter(Boolean).join(' · ')}</small><small>{(theatre.formats || []).join(' · ') || 'No facilities configured'}</small></div>{rowActions(() => { setEditingTheatre(theatre._id); setTheatreForm({ name: theatre.name, venueType: theatre.venueType || 'cinema', city: theatre.city?.name || '', district: theatre.district || '', state: theatre.state || '', pincode: theatre.pincode || '', address: theatre.address || '', latitude: theatre.coordinates?.latitude ?? '', longitude: theatre.coordinates?.longitude ?? '', formats: (theatre.formats || []).join(', ') }) }, () => remove('theatres', theatre._id, theatre.name))}</div>)}
                {!data.theatres.some((theatre) => activeSection === 'stadiums' ? theatre.venueType === 'stadium' : theatre.venueType !== 'stadium') && <div className="admin-inline-empty">No {activeSection === 'stadiums' ? 'stadiums' : 'cinema venues'} configured yet.</div>}
              </div>
            </>
          )}

          {activeSection === 'screens' && (
            <>
              <h2>{editingScreen ? 'Edit screen' : 'Add a screen'}</h2>
              <form className="admin-form portal-form" onSubmit={saveScreen}>
                <Field label="Section / screen name"><input value={screenForm.name} onChange={(event) => setScreenForm({ ...screenForm, name: event.target.value })} required /></Field>
                <Field label="Venue"><select value={screenForm.theatre} onChange={(event) => setScreenForm({ ...screenForm, theatre: event.target.value })} required><option value="">Choose venue</option>{data.theatres.map((theatre) => <option value={theatre._id} key={theatre._id}>{theatre.name} · {theatre.venueType === 'stadium' ? 'Stadium' : 'Cinema'}</option>)}</select></Field>
                <Field label="Seat capacity (12–300)"><input type="number" min="12" max="300" value={screenForm.capacity} onChange={(event) => setScreenForm({ ...screenForm, capacity: event.target.value })} required /></Field>
                <Field label="Premium ticket price (₹)"><input type="number" min="1" max="100000" value={screenForm.seatPrices.premium} onChange={(event) => setScreenForm({ ...screenForm, seatPrices: { ...screenForm.seatPrices, premium: event.target.value } })} required /></Field>
                <Field label="Comfort ticket price (₹)"><input type="number" min="1" max="100000" value={screenForm.seatPrices.comfort} onChange={(event) => setScreenForm({ ...screenForm, seatPrices: { ...screenForm.seatPrices, comfort: event.target.value } })} required /></Field>
                <Field label="Standard / general ticket price (₹)"><input type="number" min="1" max="100000" value={screenForm.seatPrices.standard} onChange={(event) => setScreenForm({ ...screenForm, seatPrices: { ...screenForm.seatPrices, standard: event.target.value } })} required /></Field>
                <p className="admin-form-hint">Pricing and capacity lock after a show has been scheduled, protecting existing seat inventory and bookings.</p>
                <div className="portal-form-actions"><button className="primary-button" disabled={busy}>{editingScreen ? 'Save screen' : 'Add screen'}</button>{editingScreen && <button className="ghost-button" type="button" onClick={() => { setEditingScreen(''); setScreenForm(emptyScreen()) }}>Cancel edit</button>}</div>
              </form>
              <div className="portal-list">{data.screens.map((screen) => <div className="portal-row" key={screen._id}><div className="portal-row-copy"><b>{screen.name}</b><small>{screen.theatre?.name} · {screen.capacity} seats</small><small>Premium ₹{screen.seatPrices?.premium || 320} · Comfort ₹{screen.seatPrices?.comfort || 240} · Standard ₹{screen.seatPrices?.standard || 180}</small></div>{rowActions(() => { setEditingScreen(screen._id); setScreenForm({ name: screen.name, theatre: screen.theatre?._id || '', capacity: screen.capacity, seatPrices: { premium: screen.seatPrices?.premium || 320, comfort: screen.seatPrices?.comfort || 240, standard: screen.seatPrices?.standard || 180 } }) }, () => remove('screens', screen._id, screen.name))}</div>)}{!data.screens.length && <div className="admin-inline-empty">No seating sections yet. Add a venue first, then configure its screens or sections.</div>}</div>
            </>
          )}

          {activeSection === 'shows' && (
            <>
              <h2>{editingShow ? 'Edit show schedule' : 'Create a bookable show'}</h2>
              <form className="admin-form portal-form" onSubmit={saveShow}>
                <Field label="Movie / event"><select value={showForm.movie} disabled={Boolean(editingShow)} onChange={(event) => setShowForm({ ...showForm, movie: event.target.value })} required><option value="">Choose title</option>{data.movies.map((movie) => <option value={movie._id} key={movie._id}>{movie.title}</option>)}</select></Field>
                <Field label="Theatre"><select value={showForm.theatre} disabled={Boolean(editingShow)} onChange={(event) => setShowForm({ ...showForm, theatre: event.target.value, screen: '' })} required><option value="">Choose theatre</option>{data.theatres.map((theatre) => <option value={theatre._id} key={theatre._id}>{theatre.name}</option>)}</select></Field>
                <Field label="Screen"><select value={showForm.screen} disabled={Boolean(editingShow)} onChange={(event) => setShowForm({ ...showForm, screen: event.target.value })} required><option value="">Choose screen</option>{data.screens.filter((screen) => !showForm.theatre || screen.theatre?._id === showForm.theatre).map((screen) => <option value={screen._id} key={screen._id}>{screen.name} · {screen.theatre?.name}</option>)}</select></Field>
                <Field label="Date"><input type="date" min={new Date().toISOString().slice(0, 10)} value={showForm.date} onChange={(event) => setShowForm({ ...showForm, date: event.target.value })} required /></Field>
                <Field label="Showtime"><input type="time" value={showForm.time} onChange={(event) => setShowForm({ ...showForm, time: event.target.value })} required /></Field>
                <Field label="Ticket price"><input type="number" min="1" value={showForm.basePrice} onChange={(event) => setShowForm({ ...showForm, basePrice: event.target.value })} required /></Field>
                <div className="portal-form-actions"><button className="primary-button" disabled={busy}>{editingShow ? 'Save schedule' : 'Create show'}</button>{editingShow && <button className="ghost-button" type="button" onClick={() => { setEditingShow(''); setShowForm(emptyShow()) }}>Cancel edit</button>}</div>
              </form>
              <div className="portal-list">
                {data.shows.map((show) => (
                  <div className="portal-row" key={show._id}>
                    <div className="portal-row-copy"><b>{show.movie?.title || 'Removed title'}</b><small>{show.dateLabel || show.date} · {show.time} · {show.theatre?.name} · ₹{show.basePrice} · {show.active ? 'Active' : 'Paused'}</small></div>
                    <div className="portal-row-actions">
                      <button className="ghost-button" type="button" disabled={busy} onClick={() => editShow(show)}>Edit</button>
                      <button className="ghost-button" type="button" disabled={busy} onClick={() => perform(() => api(`/admin/shows/${show._id}`, { method: 'PATCH', body: JSON.stringify({ active: !show.active }) }), show.active ? 'Show paused.' : 'Show activated.')}>{show.active ? 'Pause' : 'Activate'}</button>
                      <button className="ghost-button danger-button" type="button" onClick={() => remove('shows', show._id, 'this show')}>Delete</button>
                    </div>
                  </div>
                ))}
                {!data.shows.length && <div className="admin-inline-empty">No showtimes yet. Add a movie or event, venue, and seating section before scheduling shows.</div>}
              </div>
              {showPages > 1 && <div className="portal-pagination"><button className="ghost-button" disabled={showPage <= 1} onClick={() => setShowPage(showPage - 1)}>Previous</button><span>Page {showPage} of {showPages}</span><button className="ghost-button" disabled={showPage >= showPages} onClick={() => setShowPage(showPage + 1)}>Next</button></div>}
            </>
          )}

          {activeSection === 'banners' && (
            <>
              <h2>{editingBanner ? 'Edit homepage banner' : 'Add a homepage banner'}</h2>
              <p className="muted">Published banners appear in the customer homepage carousel for the selected city.</p>
              <form className="admin-form portal-form" onSubmit={saveBanner}>
                <Field label="Banner title"><input value={bannerForm.title} onChange={(event) => setBannerForm({ ...bannerForm, title: event.target.value })} maxLength="120" required /></Field>
                <Field label="City (blank means all cities)"><select value={bannerForm.city} onChange={(event) => setBannerForm({ ...bannerForm, city: event.target.value })}><option value="">All cities</option>{data.cities.map((city) => <option key={city._id} value={city._id}>{city.name}</option>)}</select></Field>
                <Field label="Description"><textarea value={bannerForm.description} onChange={(event) => setBannerForm({ ...bannerForm, description: event.target.value })} maxLength="500" /></Field>
                <ImageField label="Promotional banner image" value={bannerForm.imageUrl} onChange={(imageUrl) => setBannerForm({ ...bannerForm, imageUrl })} api={api} previewType="banner" />
                <Field label="Destination path (example: /sports/ID)"><input value={bannerForm.targetUrl} onChange={(event) => setBannerForm({ ...bannerForm, targetUrl: event.target.value })} placeholder="/movies" required /></Field>
                <Field label="Display order"><input type="number" min="0" max="10000" value={bannerForm.order} onChange={(event) => setBannerForm({ ...bannerForm, order: event.target.value })} required /></Field>
                <Field label="Publish from"><input type="datetime-local" value={bannerForm.startsAt} onChange={(event) => setBannerForm({ ...bannerForm, startsAt: event.target.value })} /></Field>
                <Field label="Publish until"><input type="datetime-local" value={bannerForm.endsAt} onChange={(event) => setBannerForm({ ...bannerForm, endsAt: event.target.value })} /></Field>
                <div className="portal-checkboxes"><label><input type="checkbox" checked={bannerForm.active} onChange={(event) => setBannerForm({ ...bannerForm, active: event.target.checked })} /> Active</label></div>
                <div className="portal-form-actions"><button className="primary-button" disabled={busy || !bannerForm.imageUrl}>{editingBanner ? 'Save banner' : 'Publish banner'}</button>{editingBanner && <button className="ghost-button" type="button" onClick={() => { setEditingBanner(''); setBannerForm(emptyBanner()) }}>Cancel edit</button>}</div>
              </form>
              <div className="portal-list">
                {(data.banners || []).map((banner) => (
                  <div className="portal-row" key={banner._id}>
                    <img className="portal-poster" src={banner.imageUrl} alt="" />
                    <div className="portal-row-copy"><b>{banner.title}</b><small>{banner.city?.name || 'All cities'} · Order {banner.order} · {banner.active ? 'Active' : 'Inactive'}</small><small>{banner.startsAt ? new Date(banner.startsAt).toLocaleString() : 'No start date'} – {banner.endsAt ? new Date(banner.endsAt).toLocaleString() : 'No end date'}</small></div>
                    {rowActions(() => editBanner(banner), () => remove('banners', banner._id, banner.title))}
                  </div>
                ))}
                {!data.banners?.length && <div className="empty">No homepage banners configured yet.</div>}
              </div>
            </>
          )}

          {activeSection === 'bookings' && (
            <>
              <h2>Customer bookings</h2>
              <p className="muted">Support view only. Customer accounts and payment outcomes are not editable here.</p>
              <Field label="Search bookings"><input value={bookingSearch} onChange={(event) => setBookingSearch(event.target.value)} placeholder="Booking ID, customer, or title" /></Field>
              <div className="admin-table-tools">
                <Field label="Booking status"><select value={bookingStatus} onChange={(event) => setBookingStatus(event.target.value)}><option value="">All statuses</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select></Field>
                <button className="ghost-button" type="button" disabled={!filteredBookings.length} onClick={() => downloadCsv('cinebook-bookings.csv', [
                  ['Booking ID', 'Customer', 'Email', 'Movie / event', 'Venue', 'Date', 'Time', 'Seats', 'Amount', 'Status'],
                  ...filteredBookings.map((booking) => [
                    booking.bookingId, booking.user?.name, booking.user?.email,
                    booking.show?.movie?.title, booking.show?.theatre?.name,
                    booking.show?.date, booking.show?.time, booking.seats?.join(' '),
                    booking.totalAmount, booking.status,
                  ]),
                ])}>Export {filteredBookings.length} bookings</button>
              </div>
              <div className="portal-list">
                {filteredBookings.map((booking) => (
                  <div className="portal-row booking-portal-row" key={booking._id}>
                    <div className="portal-row-copy">
                      <b>{booking.bookingId} · {booking.show?.movie?.title || 'Title unavailable'}</b>
                      <small>{booking.user?.name || 'Account unavailable'} · {booking.user?.email || 'No email'} · {booking.show?.theatre?.name} · {booking.show?.dateLabel} {booking.show?.time}</small>
                      <small>{booking.seats?.length || 0} tickets · ₹{booking.totalAmount} · {booking.status}</small>
                    </div>
                  </div>
                ))}
                {!filteredBookings.length && <div className="admin-inline-empty">{data.bookings.length ? 'No bookings match these filters.' : 'No customer bookings have been recorded yet.'}</div>}
              </div>
            </>
          )}

          {activeSection === 'users' && (
            <>
              <h2>Customer accounts</h2>
              <p className="muted">Manage account roles. Booking and payment records remain attached to their account.</p>
              <Field label="Search customers"><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Name, email or phone" /></Field>
              <div className="portal-list">
                {data.users.filter((user) => `${user.name || ''} ${user.email || ''} ${user.phone || ''}`.toLowerCase().includes(userSearch.toLowerCase())).map((user) => (
                  <div className="portal-row" key={user._id}>
                    <div className="portal-row-copy">
                      <b>{user.name || 'Unnamed account'}</b>
                      <small>{user.email} · {user.phone || 'No phone'} · {user.isActive === false ? 'Deactivated' : 'Active'} · Joined {new Date(user.createdAt).toLocaleDateString()}</small>
                    </div>
                    <div className="portal-row-actions">
                      <select
                        aria-label={`Role for ${user.email}`}
                        value={user.role}
                        disabled={busy || user._id === data.currentAdminId || (data.currentRole !== 'superadmin' && ['admin', 'superadmin'].includes(user.role))}
                        onChange={(event) => perform(
                          () => api(`/admin/users/${user._id}/role`, {
                            method: 'PATCH',
                            body: JSON.stringify({ role: event.target.value }),
                          }),
                          `Role updated for ${user.email}.`,
                        )}
                      >
                        <option value="user">Customer</option>
                        <option value="manager">Manager</option>
                        {data.currentRole === 'superadmin' && <><option value="admin">Admin</option><option value="superadmin">Super admin</option></>}
                      </select>
                      <button className="ghost-button" type="button" disabled={busy || user._id === data.currentAdminId || (user.role === 'superadmin' && data.currentRole !== 'superadmin')} onClick={() => perform(() => api(`/admin/users/${user._id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: user.isActive === false }) }), user.isActive === false ? 'Customer account activated.' : 'Customer account deactivated.')}>{user.isActive === false ? 'Activate' : 'Deactivate'}</button>
                    </div>
                  </div>
                ))}
                {!data.users.length && <div className="empty">No customer accounts yet.</div>}
              </div>
            </>
          )}

          {activeSection === 'payments' && (
            <>
              <h2>Payment attempts</h2>
              <p className="muted">Provider status is read-only here. Refunds must be completed through the payment provider.</p>
              <button className="ghost-button" type="button" disabled={!data.payments.length} onClick={() => downloadCsv('cinebook-payments.csv', [
                ['Transaction ID', 'Provider', 'Customer', 'Event', 'Venue', 'Amount', 'Status', 'Booking ID', 'Created at'],
                ...data.payments.map((payment) => [
                  payment.txnid, payment.provider, payment.user?.name, payment.show?.movie?.title,
                  payment.show?.theatre?.name, payment.amount, payment.status, payment.bookingId,
                  payment.createdAt,
                ]),
              ])}>Export payment report</button>
              <div className="portal-list">
                {data.payments.map((payment) => (
                  <div className="portal-row" key={payment._id}>
                    <div className="portal-row-copy">
                      <b>{payment.provider || 'PayU'} · {payment.txnid}</b>
                      <small>{payment.user?.name || 'Account unavailable'} · {payment.show?.movie?.title || 'Title unavailable'} · {payment.show?.theatre?.name || 'Venue unavailable'}</small>
                      <small>₹{payment.amount} · {payment.status} · {payment.bookingId || 'No booking confirmed'}</small>
                    </div>
                  </div>
                ))}
                {!data.payments.length && <div className="empty">No payment attempts yet.</div>}
              </div>
            </>
          )}

          {activeSection === 'analytics' && (
            <>
              <div className="admin-section-heading"><div><span className="eyebrow">Database reporting</span><h2>Bookings and revenue</h2></div></div>
              <div className="admin-report-filters">
                <Field label="From"><input type="date" value={analyticsDates.from} max={analyticsDates.to} onChange={(event) => setAnalyticsDates({ ...analyticsDates, from: event.target.value })} /></Field>
                <Field label="To"><input type="date" value={analyticsDates.to} min={analyticsDates.from} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setAnalyticsDates({ ...analyticsDates, to: event.target.value })} /></Field>
                <button className="ghost-button" type="button" disabled={analyticsLoading} onClick={loadAnalytics}>{analyticsLoading ? 'Updating…' : 'Update report'}</button>
                {analytics && <button className="ghost-button" type="button" disabled={!analytics.daily.length} onClick={() => downloadCsv('cinebook-daily-report.csv', [
                  ['Date', 'Bookings', 'Revenue'],
                  ...analytics.daily.map((day) => [day._id, day.bookings, day.revenue]),
                ])}>Export daily CSV</button>}
              </div>
              {analyticsError && <p className="auth-error" role="alert">{analyticsError}</p>}
              {analyticsLoading && !analytics && <div className="admin-inline-empty">Loading reports from booking records…</div>}
              {analytics && <>
                <div className="stat-grid portal-stat-grid report-stat-grid">
                  <div className="stat-card"><span>Bookings</span><strong>{analytics.totals.bookings}</strong><small>Within selected range</small></div>
                  <div className="stat-card"><span>Revenue</span><strong>₹{Number(analytics.totals.revenue).toLocaleString('en-IN')}</strong><small>Recorded booking totals</small></div>
                  <div className="stat-card"><span>Unique customers</span><strong>{analytics.totals.customers}</strong><small>Customers who booked</small></div>
                </div>
                <section className="admin-report-panel">
                  <h3>Daily performance</h3>
                  {analytics.daily.length
                    ? <div className="admin-chart admin-chart-large">{analytics.daily.map((day) => {
                      const maxBookings = Math.max(...analytics.daily.map((item) => item.bookings), 1)
                      return <div className="admin-chart-column" key={day._id} title={`${day._id}: ${day.bookings} bookings, ₹${Number(day.revenue).toLocaleString('en-IN')}`}>
                        <div className="admin-chart-bar" style={{ height: `${Math.max(4, day.bookings / maxBookings * 100)}%` }} />
                        <small>{day._id.slice(5)}</small>
                      </div>
                    })}</div>
                    : <div className="admin-inline-empty">No bookings recorded in this period.</div>}
                </section>
                <div className="admin-report-grid">
                  <section className="admin-report-panel">
                    <h3>Popular movies and events</h3>
                    <div className="portal-list">{analytics.popular.map((item, index) => <div className="admin-report-row" key={`${item.title}-${item.type}`}><span className="admin-report-rank">{index + 1}</span><div className="portal-row-copy"><b>{item.title}</b><small>{item.type} · {item.bookings} bookings</small></div><strong>₹{Number(item.revenue).toLocaleString('en-IN')}</strong></div>)}
                      {!analytics.popular.length && <div className="admin-inline-empty">No event bookings in this period.</div>}
                    </div>
                  </section>
                  <section className="admin-report-panel">
                    <h3>Booking status</h3>
                    <div className="portal-list">{analytics.statuses.map((item) => <div className="admin-report-row" key={item._id}><span className="admin-status-dot" /><div className="portal-row-copy"><b>{item._id || 'Unspecified'}</b></div><strong>{item.count}</strong></div>)}
                      {!analytics.statuses.length && <div className="admin-inline-empty">No status data available.</div>}
                    </div>
                  </section>
                </div>
              </>}
            </>
          )}

          {activeSection === 'managers' && canManageManagers && (
            <>
              <div className="admin-section-heading"><div><span className="eyebrow">Access control</span><h2>Manager accounts</h2></div></div>
              <p className="muted">Create authorized staff accounts. Administrators can create manager accounts; managers can manage content and bookings.</p>
              <form className="admin-form portal-form manager-create-form" onSubmit={createManager}>
                <Field label="Full name"><input value={managerForm.name} onChange={(event) => setManagerForm({ ...managerForm, name: event.target.value })} autoComplete="name" required /></Field>
                <Field label="Email address"><input type="email" value={managerForm.email} onChange={(event) => setManagerForm({ ...managerForm, email: event.target.value })} autoComplete="email" required /></Field>
                <Field label="Phone (optional)"><input type="tel" value={managerForm.phone} onChange={(event) => setManagerForm({ ...managerForm, phone: event.target.value })} autoComplete="tel" /></Field>
                <Field label="Temporary password (minimum 10 characters)"><input type="password" minLength="10" value={managerForm.password} onChange={(event) => setManagerForm({ ...managerForm, password: event.target.value })} autoComplete="new-password" required /></Field>
                <div className="portal-form-actions"><button className="primary-button" disabled={busy}>Create manager account</button></div>
              </form>
              <h3 className="admin-subheading">Authorized staff</h3>
              <div className="portal-list">{data.users.filter((user) => ['manager', 'admin', 'superadmin'].includes(user.role)).map((user) => (
                <div className="portal-row" key={user._id}>
                  <div className="portal-row-copy"><b>{user.name || 'Unnamed account'}</b><small>{user.email} · {user.phone || 'No phone'} · {user.role} · {user.isActive === false ? 'Deactivated' : 'Active'}</small></div>
                  <span className={`admin-account-status ${user.isActive === false ? 'inactive' : ''}`}>{user.isActive === false ? 'Inactive' : 'Authorized'}</span>
                </div>
              ))}
                {!data.users.some((user) => ['manager', 'admin', 'superadmin'].includes(user.role)) && <div className="admin-inline-empty">No manager accounts configured.</div>}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
