import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { EventDetails, HomePage, MovieCatalog, PaymentCheckout, SeatSelection as LiveSeatSelection, SportsPage, TermsPage } from './Experience.jsx'
import { mergeLanguages } from './catalogue-languages.js'
import './App.css'
import './experience.css'

const api = async (path, options = {}) => {
  const token = localStorage.getItem('cinebook-token')
  const response = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...options })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message = body?.message || (response.status === 404
      ? 'This server does not support pincode search yet. Restart the backend, then try again.'
      : `Request failed (${response.status}). Please try again.`)
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  if (response.status === 204) return null
  return response.json()
}
const FavoritesContext = createContext(null)
function FavoritesProvider({ children }) {
  const [favoriteIds, setFavoriteIds] = useState(() => new Set())
  const [loadError, setLoadError] = useState('')

  const loadFavorites = useCallback(async () => {
    if (!localStorage.getItem('cinebook-token')) {
      setFavoriteIds(new Set())
      setLoadError('')
      return
    }

    const result = await api('/account/favorites')
    setFavoriteIds(new Set(result.movies.map((movie) => movie._id)))
    setLoadError('')
  }, [])

  useEffect(() => {
    const load = () => loadFavorites().catch((issue) => {
      setFavoriteIds(new Set())
      setLoadError(issue.message)
    })
    load()
    window.addEventListener('cinebook-auth-change', load)
    return () => window.removeEventListener('cinebook-auth-change', load)
  }, [loadFavorites])

  const toggleFavorite = async (movieId) => {
    if (!localStorage.getItem('cinebook-token')) {
      throw new Error('Sign in to save favorites')
    }
    const isFavorite = favoriteIds.has(movieId)
    await api(`/account/favorites/${movieId}`, { method: isFavorite ? 'DELETE' : 'POST' })
    setLoadError('')
    setFavoriteIds((current) => {
      const updated = new Set(current)
      if (isFavorite) updated.delete(movieId)
      else updated.add(movieId)
      return updated
    })
  }

  return (
    <FavoritesContext.Provider value={{ favoriteIds, toggleFavorite, loadError }}>
      {children}
    </FavoritesContext.Provider>
  )
}
const FALLBACK_POSTER = '/poster-placeholder.svg'
const poster = (movie) => movie?.posterUrl || movie?.image || FALLBACK_POSTER
function PosterImage({ movie, alt = '' }) { const [failed, setFailed] = useState(false); const source = poster(movie); return <img src={failed ? FALLBACK_POSTER : source} alt={alt} onError={() => { if (!failed) setFailed(true) }} /> }
function HeroArtwork({ movie }) { const [failed, setFailed] = useState(false); const source = movie?.bannerUrl || poster(movie); return <><img className="hero-artwork" src={failed ? FALLBACK_POSTER : source} alt="" aria-hidden="true" onError={() => { if (!failed) setFailed(true) }} /><div className="hero-shade" /></> }

function FavoriteButton({ movie }) {
  const favorites = useContext(FavoritesContext)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!localStorage.getItem('cinebook-token')) return null

  const active = favorites?.favoriteIds.has(movie._id)
  const message = error || favorites?.loadError
  const toggle = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    setError('')
    setBusy(true)
    try {
      await favorites.toggleFavorite(movie._id)
    } catch (issue) {
      setError(issue.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      className={`favorite-toggle ${active ? 'saved' : ''}`}
      type="button"
      aria-label={active ? `Remove ${movie.title} from favorites` : `Save ${movie.title} to favorites`}
      title={message || (active ? 'Remove from favorites' : 'Save to favorites')}
      disabled={busy}
      onClick={toggle}
    >
      {active ? '♥' : '♡'}
    </button>
  )
}

function AppShell({ children }) {
  const [city, setCity] = useState(localStorage.getItem('cinebook-city') || 'Kolkata'); const [pincode, setPincode] = useState(localStorage.getItem('cinebook-pincode') || ''); const [pincodeInput, setPincodeInput] = useState(localStorage.getItem('cinebook-pincode') || ''); const [query, setQuery] = useState(''); const [cityOpen, setCityOpen] = useState(false); const [locationVenues, setLocationVenues] = useState([]); const [locationMessage, setLocationMessage] = useState(''); const [locating, setLocating] = useState(false); const [account, setAccount] = useState(null); const signedIn = Boolean(localStorage.getItem('cinebook-token'))
  const location = useLocation(); const navigate = useNavigate()
  useEffect(() => { localStorage.setItem('cinebook-city', city); window.dispatchEvent(new Event('cinebook-city-change')) }, [city])
  useEffect(() => {
    let active = true
    const loadAccount = async () => {
      if (!localStorage.getItem('cinebook-token')) {
        setAccount(null)
        return
      }

      try {
        const { user } = await api('/auth/me')
        if (!active) return
        setAccount(user)

        const preferredPincode = user.preferences?.pincode || localStorage.getItem('cinebook-pincode') || ''
        if (preferredPincode && /^\d{6}$/.test(preferredPincode)) {
          try {
            const result = await api(`/location/pincode?pincode=${encodeURIComponent(preferredPincode)}`)
            if (!active) return
            if (result.available) {
              const preferredCity = result.city || user.preferences?.city || ''
              setPincode(preferredPincode)
              setPincodeInput(preferredPincode)
              setLocationVenues(result.venues || [])
              localStorage.setItem('cinebook-pincode', preferredPincode)
              if (preferredCity) {
                setCity(preferredCity)
                localStorage.setItem('cinebook-city', preferredCity)
              }
              if (!user.preferences?.pincode) {
                await api('/account/preferences', {
                  method: 'PUT',
                  body: JSON.stringify({ city: preferredCity, pincode: preferredPincode }),
                })
              }
              return
            }
          } catch {
            // A stale browser location should not prevent the account from loading.
          }
        }

        if (user.preferences?.city) {
          setCity(user.preferences.city)
          localStorage.setItem('cinebook-city', user.preferences.city)
        }
      } catch {
        if (active) setAccount(null)
      }
    }

    loadAccount()
    window.addEventListener('cinebook-auth-change', loadAccount)
    return () => {
      active = false
      window.removeEventListener('cinebook-auth-change', loadAccount)
    }
  }, [])
  useEffect(() => { const syncCity = () => setCity(localStorage.getItem('cinebook-city') || 'Kolkata'); window.addEventListener('cinebook-city-change', syncCity); return () => window.removeEventListener('cinebook-city-change', syncCity) }, [])
  const submitSearch = (event) => { event.preventDefault(); window.dispatchEvent(new CustomEvent('cinebook-search', { detail: query })); navigate(`/${query ? `?q=${encodeURIComponent(query)}` : ''}`) }
  const searchPincode = async (event) => {
    event.preventDefault()
    const requestedPincode = pincodeInput.trim()
    if (!/^\d{6}$/.test(requestedPincode)) {
      setLocationMessage('Enter a valid 6-digit pincode.')
      return
    }
    setLocating(true)
    setLocationVenues([])
    setLocationMessage('Checking registered venues…')
    setPincode('')
    localStorage.removeItem('cinebook-pincode')
    window.dispatchEvent(new CustomEvent('cinebook-location-change', { detail: { pincode: '', city } }))
    try {
      const result = await api(`/location/pincode?pincode=${encodeURIComponent(requestedPincode)}`)
      const venues = Array.isArray(result.venues) ? result.venues : []
      if (!venues.length) {
        setLocationMessage('Sorry, there are no theatres or event venues at this pincode.')
        return
      }
      if (localStorage.getItem('cinebook-token')) {
        await api('/account/preferences', {
          method: 'PUT',
          body: JSON.stringify({ city: result.city, pincode: requestedPincode }),
        })
      }
      setPincode(requestedPincode)
      setPincodeInput(requestedPincode)
      localStorage.setItem('cinebook-pincode', requestedPincode)
      setLocationVenues(venues)
      if (result.city) {
        setCity(result.city)
        localStorage.setItem('cinebook-city', result.city)
      }
      window.dispatchEvent(new CustomEvent('cinebook-location-change', { detail: { pincode: requestedPincode, city: result.city || '' } }))
      window.dispatchEvent(new Event('cinebook-city-change'))
      setLocationMessage(`${venues.length} registered ${venues.length === 1 ? 'venue' : 'venues'} found`)
    } catch (error) {
      setPincode('')
      setLocationVenues([])
      localStorage.removeItem('cinebook-pincode')
      window.dispatchEvent(new CustomEvent('cinebook-location-change', { detail: { pincode: '', city: '' } }))
      setLocationMessage(error.message || 'Could not check this pincode. Please try again.')
    } finally {
      setLocating(false)
    }
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/"><span className="brand-mark">C</span><span>Cine<span>Book</span></span></Link>
        <form className="search" onSubmit={submitSearch}>
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movies, theatres & events" aria-label="Search" />
          <button type="submit">Search</button>
        </form>
        <div className="top-actions">
          <div className="city-picker">
            <button className="city-trigger" type="button" onClick={() => setCityOpen(!cityOpen)} aria-expanded={cityOpen}>
              <span className="location-pin">⌖</span><span>{pincode || 'Enter pincode'}</span><span className={`city-chevron ${cityOpen ? 'open' : ''}`}>⌄</span>
            </button>
            {cityOpen && <div className="city-menu">
              <form className="pincode-search" onSubmit={searchPincode}>
                <label htmlFor="customer-pincode">Find venues by pincode</label>
                <div><input id="customer-pincode" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" maxLength="6" value={pincodeInput} onChange={(event) => setPincodeInput(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit pincode" required /><button type="submit" disabled={locating}>{locating ? 'Checking…' : 'Apply'}</button></div>
              </form>
              {locationMessage && <p className="location-message">{locationMessage}</p>}
              {locationVenues.map((venue) => {
                const category = venue.venueType === 'stadium' ? 'sports' : 'movie'
                return <Link className="nearby-hall" key={venue._id} to={category === 'sports' ? '/sports' : '/movies'} onClick={() => setCityOpen(false)} aria-label={`Open ${category} listings for ${venue.name}`}><b>{venue.name}</b><small>{[venue.address, venue.district, venue.state, venue.pincode].filter(Boolean).join(' · ')}</small><span>Open {category} listings →</span></Link>
              })}
            </div>}
          </div>
          {signedIn
            ? <><Link className="session-indicator" to="/profile"><span className="session-dot" />{account?.name || 'My account'}</Link><button className="signout-button" type="button" onClick={() => { localStorage.removeItem('cinebook-token'); setAccount(null); window.dispatchEvent(new Event('cinebook-auth-change')); navigate('/') }}>Sign out</button></>
            : <div className="auth-links"><Link to="/login">Sign in</Link><Link className="auth-link-primary" to="/create-account">Create account</Link></div>}
          <Link className="avatar" to="/profile">{account?.name?.slice(0, 2).toUpperCase() || 'AK'}</Link>
        </div>
      </header>
      <nav className="navline">
        <div>
          <Link className={location.pathname === '/' ? 'active' : ''} to="/">Discover</Link>
          <Link className={location.pathname.startsWith('/movies') ? 'active' : ''} to="/movies">Movies</Link>
          <Link className={location.pathname.startsWith('/sports') ? 'active' : ''} to="/sports">Sports</Link>
          <Link className={location.pathname.startsWith('/comedy') ? 'active' : ''} to="/comedy">Comedy</Link>
          <Link className={location.pathname.startsWith('/bookings') || location.pathname.startsWith('/confirmation') ? 'active' : ''} to="/bookings">My bookings</Link>
          {signedIn && <Link className={location.pathname.startsWith('/favorites') ? 'active' : ''} to="/favorites">Saved</Link>}
          {['admin', 'manager', 'superadmin'].includes(account?.role) && <a href="/admin.html">Manager portal</a>}
        </div>
        <span className="status-dot">● Live availability</span>
      </nav>
      <main>{children}</main>
      <footer className="site-footer">
        <div className="site-footer-brand"><div className="brand"><span className="brand-mark">C</span><span>Cine<span>Book</span></span></div><p>Find your next great night out.</p><small>© 2026 CineBook · Built for the big screen</small></div>
        <div id="about"><Link to="/#about"><b>About</b></Link><p>Discover and book films, live sport and experiences in your city.</p></div>
        <div><b>Help & contact</b><a href="mailto:?subject=CineBook%20contact">Contact</a><a href="mailto:?subject=CineBook%20help">Get help</a><a href="/admin.html">Manager sign in</a></div>
        <div><b>Terms & privacy</b><Link to="/terms#terms">Terms of booking</Link><Link to="/terms#privacy">Privacy information</Link><Link to="/profile">Manage your account</Link></div>
        <div className="site-footer-social"><b>Share CineBook</b><a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin)}`} target="_blank" rel="noreferrer">Facebook</a><a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.origin)}`} target="_blank" rel="noreferrer">LinkedIn</a><a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.origin)}`} target="_blank" rel="noreferrer">X</a></div>
      </footer>
    </div>
  )
}
function Loading() { return <div className="loading-grid">{[1, 2, 3, 4].map((item) => <div className="skeleton" key={item} />)}</div> }
function ErrorState({ message, retry }) { return <div className="empty"><b>Could not load this view</b><p>{message}</p><button className="ghost-button" onClick={retry}>Try again</button></div> }
function MovieCard({ movie }) {
  return (
    <article className="movie-card">
      <Link to={movie.type === 'sports' ? `/sports/${movie._id}` : `/movies/${movie._id}`}>
        <div className="poster-wrap">
          <PosterImage movie={movie} alt={movie.title} />
          <span className="rating">★ {movie.rating?.toFixed?.(1) || movie.rating || '—'}</span>
        </div>
        <div className="movie-copy">
          <h3>{movie.title}</h3>
          <p>{movie.language || 'Movie'}</p>
          <span className="card-link">View details ↗</span>
        </div>
      </Link>
      <FavoriteButton movie={movie} />
    </article>
  )
}
function MovieSection({ title, kicker, movies = [] }) { return <section className="content-section"><div className="section-heading"><div><span className="eyebrow">{kicker}</span><h2>{title}</h2></div><Link to="/movies">See all ↗</Link></div>{movies.length ? <div className="movie-grid">{movies.map((movie) => <MovieCard movie={movie} key={movie._id} />)}</div> : <div className="empty">No movies are available yet.</div>}</section> }
function Home() { const [data, setData] = useState(null); const [error, setError] = useState(''); const load = () => api('/home').then(setData).catch((err) => setError(err.message)); useEffect(() => { load() }, []); if (error) return <ErrorState message={error} retry={() => { setError(''); load() }} />; if (!data) return <Loading />; const feature = data.trending?.[0]; return <div className="page home-page"><section className="hero"><HeroArtwork movie={feature} /><div className="hero-copy"><span className="eyebrow">Tonight's feature · {feature?.language || 'Cinema'}</span><h1>{feature?.title || 'Your next story starts here.'}</h1><p>{feature?.description || 'Discover films, find your seat and make the night memorable.'}</p><div className="hero-actions"><Link className="primary-button" to={feature ? `/movies/${feature._id}` : '/movies'}>Book tickets <span>↗</span></Link><Link className="text-button" to="/movies">Explore all films</Link></div></div><div className="hero-note"><span>01 / 04</span><div className="hero-line"><i /></div><b>Featured this week</b></div></section><section className="quick-row"><div><span className="quick-icon">⌕</span><div><b>Search smarter</b><small>Movie, venue or event</small></div></div><div><span className="quick-icon">◷</span><div><b>Plans for tonight</b><small>Shows in your city</small></div></div><div><span className="quick-icon">◇</span><div><b>Easy checkout</b><small>Secure, simple payments</small></div></div></section><MovieSection title="Trending now" kicker="The crowd is talking" movies={data.trending} /><MovieSection title="Worth the ticket" kicker="Curated for you" movies={data.recommended} /><section className="split-section"><div><span className="eyebrow">Around your city</span><h2>Make a night of it.</h2><p className="muted">From intimate screenings to IMAX spectacles, find a venue that fits the mood.</p><Link className="outline-button" to="/movies">Browse theatres ↗</Link></div><div className="venue-grid">{data.theatres?.slice(0, 2).map((theatre) => <div className="venue" key={theatre._id}><span>⌂</span><div><b>{theatre.name}</b><small>{theatre.city?.name || theatre.city} · {theatre.formats?.join(' · ')}</small></div><strong>→</strong></div>)}</div></section></div> }
function Movies() {
  const params = new URLSearchParams(useLocation().search)
  const [filters, setFilters] = useState({ search: params.get('search') || '', language: '', sort: 'trending' })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const languages = mergeLanguages(data?.filters?.languages || [])

  useEffect(() => {
    let active = true
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
    api(`/movies?${query}`)
      .then((result) => {
        if (active) {
          setData(result)
          setError('')
        }
      })
      .catch((issue) => {
        if (active) setError(issue.message)
      })
    return () => { active = false }
  }, [filters])

  const retry = () => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
    api(`/movies?${query}`).then(setData).catch((issue) => setError(issue.message))
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><span className="eyebrow">The CineBook library</span><h1>Find your next favourite.</h1></div>
        <span className="result-count">{data?.movies?.length || 0} titles</span>
      </div>
      <div className="filters">
        <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search titles" />
        <select aria-label="Filter by language" value={filters.language} onChange={(event) => setFilters({ ...filters, language: event.target.value })}>
          <option value="">All languages</option>
          {languages.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select aria-label="Sort movies" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
          <option value="trending">Trending</option><option value="rating">Top rated</option><option value="newest">Newest</option>
        </select>
      </div>
      {error
        ? <ErrorState message={error} retry={retry} />
        : !data
          ? <Loading />
          : <div className="movie-grid large">{data.movies.map((movie) => <MovieCard movie={movie} key={movie._id} />)}</div>}
    </div>
  )
}
function MovieDetails() { const { id } = useParams(); const navigate = useNavigate(); const [data, setData] = useState(null); const [date, setDate] = useState(''); const [error, setError] = useState(''); useEffect(() => { api(`/movies/${id}`).then((value) => { setData(value); setDate(value.dates?.[0]?.value || '') }).catch((err) => setError(err.message)) }, [id]); if (error) return <ErrorState message={error} retry={() => window.location.reload()} />; if (!data) return <Loading />; const availableDates = data.dates?.map((item) => item.value) || []; return <div className="page detail-page"><section className="detail-hero"><PosterImage movie={data.movie} alt={data.movie.title} /><div className="detail-copy"><span className="eyebrow">Now showing · {data.movie.language}</span><h1>{data.movie.title}</h1><div className="meta-row"><span>★ {data.movie.rating}</span><span>{data.movie.duration} min</span></div><p>{data.movie.description}</p><div className="cast-line"><b>Cast</b><span>{data.movie.cast?.join(' · ')}</span></div><button className="outline-button" onClick={() => document.querySelector('.showtimes')?.scrollIntoView({ behavior: 'smooth' })}>View showtimes ↓</button></div></section><section className="showtimes"><div className="section-heading"><div><span className="eyebrow">Choose your show</span><h2>Pick a time that works.</h2></div><button className="text-button">⌁ Trailer</button></div><label className="calendar-control"><span>◷</span><span><small>Show date</small><input type="date" value={date} min={availableDates[0]} max={availableDates[availableDates.length - 1]} onChange={(event) => setDate(event.target.value)} /></span></label>{data.theatres?.map((theatre) => <div className="theatre-row" key={theatre._id}><div><h3>{theatre.name}</h3><p>{theatre.formats?.join(' · ') || 'Cinema'}</p></div><div className="times">{theatre.shows?.filter((show) => show.date === date).map((show) => <button key={show._id} onClick={() => navigate(`/seats/${show._id}`)}>{show.time}<small>₹{show.basePrice} onwards</small></button>)}</div></div>)}</section></div> }
function SeatSelection() { const { id } = useParams(); const navigate = useNavigate(); const [data, setData] = useState(null); const [selected, setSelected] = useState([]); const [error, setError] = useState(''); useEffect(() => { api(`/shows/${id}/seats`).then(setData).catch((err) => setError(err.message)) }, [id]); const total = useMemo(() => selected.reduce((sum, seat) => sum + seat.price, 0), [selected]); if (error) return <ErrorState message={error} retry={() => window.location.reload()} />; if (!data) return <Loading />; const sport = data.show.movie.type === 'sports' ? data.show.movie.sport : ''; const zoneNames = sport === 'motorsports' ? ['Grandstand A','Grandstand B','VIP Lounge','Paddock Club','Trackside'] : sport === 'cricket' ? ['North Stand','East Stand','South Stand','West Stand','Pavilion','VIP'] : ['North Stand','East Stand','South Stand','West Stand','Premium','VIP']; const prepared = data.seats.map((seat, index) => sport ? { ...seat, code: seat.label, label: `${zoneNames[Math.floor(index / 12) % zoneNames.length]} ${index % 12 + 1}` } : seat); const toggle = (seat) => { if (seat.status === 'occupied') return; setSelected((current) => current.some((item) => item._id === seat._id) ? current.filter((item) => item._id !== seat._id) : current.length < 8 ? [...current, seat] : current) }; const centre = sport ? (sport === 'cricket' ? 'CRICKET FIELD · PITCH' : sport === 'football' ? 'FOOTBALL PITCH' : sport === 'basketball' ? 'BASKETBALL COURT' : sport === 'tennis' ? 'TENNIS COURT' : sport === 'badminton' ? 'BADMINTON COURTS' : sport === 'hockey' ? 'HOCKEY FIELD' : sport === 'kabaddi' ? 'KABADDI ARENA' : sport === 'motorsports' ? 'RACE TRACK VIEW' : 'ESPORTS STAGE') : 'SCREEN'; return <div className="page seat-page"><div className="page-header"><div><span className="eyebrow">{data.show.movie.title} · {data.show.theatre.name}</span><h1>Choose your {sport ? 'stadium zone' : 'seats'}.</h1><p className="muted">{data.show.dateLabel} · {data.show.time} · {sport ? `${sport} venue` : data.show.screen.name}</p></div><span className="seat-limit">Up to 8 tickets</span></div><div className={`seat-layout ${sport ? `sports-layout ${sport}` : ''}`}><div className="screen"><span>{centre}</span></div>{sport && <div className="sport-zone-labels"><span>{zoneNames[0]}</span><span>{zoneNames[1]}</span><span>{zoneNames[2]}</span><span>{zoneNames[3]}</span></div>}<div className="seat-map">{prepared.map((seat, index) => <button aria-label={`${seat.label} ${seat.status}`} title={seat.label} className={`seat ${seat.category} ${seat.status} ${selected.some((item) => item._id === seat._id) ? 'selected' : ''}`} onClick={() => toggle(seat)} key={seat._id}>{sport ? index % 12 + 1 : seat.number}</button>)}</div><div className="legend"><span><i className="available" />Available</span><span><i className="premium" />Premium</span><span><i className="occupied" />Booked</span><span><i className="chosen" />Selected</span></div></div><div className="booking-bar"><div><small>{selected.length} tickets selected</small><b>₹{total.toLocaleString('en-IN')}</b></div><button className="primary-button" disabled={!selected.length} onClick={() => navigate(`/summary/${id}`, { state: { seats: selected } })}>Continue <span>→</span></button></div></div> }
function Summary() { const { id } = useParams(); const navigate = useNavigate(); const seats = useLocation().state?.seats || []; const total = seats.reduce((sum, seat) => sum + seat.price, 0); return <div className="page"><div className="page-header"><div><span className="eyebrow">Almost there</span><h1>Review your booking.</h1><p className="muted">{seats.length} seats selected · ₹{total.toLocaleString('en-IN')} before fees</p></div></div><div className="profile-card"><div><h2>Ready when you are.</h2><p>Fees and taxes are calculated securely at payment.</p><button className="primary-button" onClick={() => navigate(`/payment/${id}`, { state: { seats } })}>Proceed to payment →</button></div></div></div> }
function Payment() { const { id } = useParams(); const location = useLocation(); const navigate = useNavigate(); const seats = location.state?.seats || []; const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const pay = async (event) => { event.preventDefault(); if (!seats.length) { setError('Your seat selection has expired. Please choose seats again.'); return } setBusy(true); setError(''); try { const checkout = await api('/payments/initiate', { method: 'POST', body: JSON.stringify({ showId: id, seats }) }); const form = document.createElement('form'); form.method = 'POST'; form.action = checkout.action; Object.entries(checkout.fields).forEach(([name, value]) => { const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.appendChild(input) }); document.body.appendChild(form); form.submit() } catch (err) { if (err.status === 401) navigate('/login'); else { setBusy(false); setError(err.message || 'Could not start PayU checkout. Your seats have not been charged.') } } }; return <div className="page payment-page"><div className="page-header"><div><span className="eyebrow">PayU secure checkout</span><h1>Secure your seats.</h1><p className="muted">PayU will securely collect your payment details. CineBook never handles card or UPI credentials.</p></div><span className="secure-badge">{import.meta.env.MODE === 'production' ? 'Secure checkout' : 'PayU checkout'}</span></div><div className="payment-layout"><div className="payment-form"><span className="eyebrow">Your selection</span><h2>{seats.length} ticket{seats.length === 1 ? '' : 's'}</h2><p className="payment-note">Choose an available payment method on PayU’s hosted checkout page. Seats are held for 30 minutes while you complete payment.</p>{error && <p className="auth-error">{error}</p>}<button className="primary-button full" disabled={busy || !seats.length} onClick={pay}>{busy ? 'Opening PayU checkout…' : 'Continue to PayU →'}</button></div></div></div> }
function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    try {
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(form) })
      localStorage.setItem('cinebook-token', result.token)
      window.dispatchEvent(new Event('cinebook-auth-change'))
      navigate('/', { replace: true })
    } catch (issue) {
      setError(issue.message)
    }
  }
  return <div className="auth-page"><div className="auth-panel"><span className="eyebrow">Welcome back</span><h1>Pick up where you left off.</h1><p className="muted">Sign in to manage your tickets, saved preferences and cinema plans.</p><form className="auth-form" onSubmit={submit}><input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Email address" type="email" required /><input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Password" type="password" required /><button className="primary-button full" type="submit">Sign in to CineBook →</button></form>{error && <p className="auth-error">{error}</p>}<p className="auth-footer">New to CineBook? <Link to="/create-account">Create an account</Link></p><p className="auth-footer"><a href="/admin.html">Manager sign in</a></p></div></div>
}
function ManagerPortalRedirect() {
  useEffect(() => {
    window.location.replace('/admin.html')
  }, [])
  return <div className="page"><span className="eyebrow">CineBook operations</span><h1>Opening the manager portal…</h1></div>
}
function CreateAccount() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    try {
      const result = await api('/auth/signup', { method: 'POST', body: JSON.stringify(form) })
      localStorage.setItem('cinebook-token', result.token)
      window.dispatchEvent(new Event('cinebook-auth-change'))
      navigate('/', { replace: true })
    } catch (issue) {
      setError(issue.message)
    }
  }
  return <div className="auth-page"><div className="auth-panel"><span className="eyebrow">Join CineBook</span><h1>Your next great night out starts here.</h1><p className="muted">Create your account to keep every ticket, plan and favourite in one place.</p><form className="auth-form" onSubmit={submit}><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Full name" required /><input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Email address" type="email" required /><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Phone number" required /><input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Create a password" type="password" minLength="8" maxLength="128" required /><button className="primary-button full" type="submit">Create account →</button></form>{error && <p className="auth-error">{error}</p>}<p className="auth-footer">Already have an account? <Link to="/login">Sign in</Link></p></div></div>
}
function Confirmation() { const { id } = useParams(); return <div className="page confirmation"><div className="confirmation-mark">✓</div><span className="eyebrow">Booking confirmed</span><h1>Your seats are waiting.</h1><p className="muted">Booking ID: {id}</p><div className="hero-actions"><Link className="primary-button" to="/bookings">View my bookings ↗</Link><button className="text-button" onClick={() => window.print()}>Download ticket</button></div></div> }
function Bookings() { const navigate = useNavigate(); const routeLocation = useLocation(); const [data, setData] = useState(null); const [error, setError] = useState(''); useEffect(() => { if (!localStorage.getItem('cinebook-token')) { navigate('/login'); return } api('/bookings').then(setData).catch((err) => setError(err.message)) }, [navigate]); return <div className="page"><div className="page-header"><div><span className="eyebrow">Your cinema diary</span><h1>My bookings.</h1><p className="muted">Only bookings made from this account appear here.</p></div></div>{(routeLocation.state?.bookingId || new URLSearchParams(routeLocation.search).get('payment')) && <p className={new URLSearchParams(routeLocation.search).get('payment') === 'failed' ? 'auth-error' : 'booking-success'}>{(new URLSearchParams(routeLocation.search).get('payment') === 'success' || routeLocation.state?.bookingId) ? `Payment successful — booking ${new URLSearchParams(routeLocation.search).get('bookingId') || routeLocation.state?.bookingId} is confirmed.` : new URLSearchParams(routeLocation.search).get('payment') === 'pending' ? 'PayU received the payment response. We are verifying it before confirming your tickets; contact support if this message remains.' : 'PayU did not confirm the payment. Your seats have been released; please try again.'}</p>}{error ? <ErrorState message={error} retry={() => window.location.reload()} /> : data === null ? <Loading /> : data.length ? <div className="booking-list">{data.map((booking) => <div className="booking-item" key={booking._id}><div className="booking-date"><b>{booking.dateLabel?.split(' ')[0]}</b><small>{booking.dateLabel?.split(' ').slice(1).join(' ')}</small></div><div className="booking-main"><h3>{booking.movie.title}</h3><p>{booking.theatre.name} · {booking.theatre.address}{booking.theatre.city?.name ? ` · ${booking.theatre.city.name}` : ''}</p><p>{booking.dateLabel} · {booking.showtime} · {booking.seats.length} paid ticket{booking.seats.length === 1 ? '' : 's'} · Seats {booking.seats.join(', ')}</p><div className="booking-breakdown"><span>Booking ID {booking.bookingId}</span><span>Status: {booking.status}</span><span>Tickets ₹{booking.ticketAmount ?? booking.totalAmount}</span><span>Processing ₹{booking.convenienceFee ?? 0}</span><span>Taxes ₹{booking.taxAmount ?? 0}</span><span>{booking.paymentMethod || 'Test payment'}</span></div></div><strong>₹{booking.totalAmount} ↗</strong></div>)}</div> : <div className="empty"><b>No bookings for this account yet.</b><p>Choose a film and your confirmed tickets will appear here.</p><Link className="outline-button" to="/movies">Browse movies</Link></div>}</div> }
function Profile() {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '' })
  const [language, setLanguage] = useState('')
  const [languages, setLanguages] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api('/auth/me'), api('/movies')])
      .then(([{ user }, catalogue]) => {
        setProfile(user)
        setForm({ name: user.name || '', phone: user.phone || '' })
        setLanguage(user.preferences?.language || '')
        setLanguages(mergeLanguages(catalogue.filters.languages || []))
      })
      .catch((issue) => setError(issue.message))
  }, [])

  const save = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      const result = await api('/account/profile', {
        method: 'PUT',
        body: JSON.stringify(form),
      })
      const preferences = await api('/account/preferences', {
        method: 'PUT',
        body: JSON.stringify({ language }),
      })
      setProfile({ ...result.user, preferences: preferences.preferences })
      setMessage('Your profile was saved to your account.')
      window.dispatchEvent(new Event('cinebook-auth-change'))
    } catch (issue) {
      setError(issue.message)
    }
  }

  if (error && !profile) return <ErrorState message={error} retry={() => window.location.reload()} />
  if (!profile) return <Loading />

  return (
    <div className="page profile-page">
      <span className="eyebrow">Private account</span>
      <h1>Your CineBook account.</h1>
      <p className="muted">Your profile, preferences, saved titles and bookings belong to this account.</p>
      <section className="profile-card">
        <div className="large-avatar">{profile.name?.slice(0, 2).toUpperCase()}</div>
        <div>
          <h2>{profile.name}</h2>
          <p>{profile.email}</p>
          <p>{profile.role === 'admin' ? 'Administrator' : 'Customer account'}</p>
          <p>Preferred city: {profile.preferences?.city || 'Choose a city from the menu'}</p>
          <p>Preferred pincode: {profile.preferences?.pincode || 'Choose a pincode from the menu'}</p>
          <p>Preferred language: {profile.preferences?.language || 'No preference'}</p>
        </div>
      </section>
      <form className="admin-form profile-form" onSubmit={save}>
        <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label>Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></label>
        <label>Preferred language<select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="">No preference</option>{languages.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <button className="primary-button" type="submit">Save profile</button>
      </form>
      {message && <p className="admin-message">{message}</p>}
      {error && <p className="auth-error">{error}</p>}
      <div className="hero-actions">
        <Link className="outline-button" to="/favorites">My saved titles</Link>
        <Link className="outline-button" to="/bookings">My private booking history</Link>
      </div>
    </div>
  )
}

function Favorites() {
  const [movies, setMovies] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(
    () => api('/account/favorites')
      .then((result) => setMovies(result.movies))
      .catch((issue) => setError(issue.message)),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  if (error) return <ErrorState message={error} retry={() => { setError(''); load() }} />
  if (!movies) return <Loading />
  return (
    <div className="page">
      <div className="page-header">
        <div><span className="eyebrow">Only visible to you</span><h1>Your saved titles.</h1></div>
      </div>
      {movies.length
        ? <div className="movie-grid large">{movies.map((movie) => <MovieCard movie={movie} key={movie._id} />)}</div>
        : <div className="empty"><b>No saved titles yet.</b><p>Save a movie with the heart button and it will appear here in your account.</p><Link className="outline-button" to="/movies">Browse movies</Link></div>}
    </div>
  )
}

function Sports() { const [data, setData] = useState(null); const [sport, setSport] = useState(''); const [error, setError] = useState(''); const load = () => api(`/events?city=${encodeURIComponent(localStorage.getItem('cinebook-city') || 'Kolkata')}&type=sports`).then(setData).catch(() => setError('Unable to load events. Please try again.')); useEffect(() => { load(); window.addEventListener('cinebook-city-change', load); return () => window.removeEventListener('cinebook-city-change', load) }, []); if (error) return <ErrorState message={error} retry={load} />; if (!data) return <Loading />; const available = [...new Set(data.events.map((event) => event.sport).filter(Boolean))]; const events = sport ? data.events.filter((event) => event.sport === sport) : data.events; return <div className="page"><div className="page-header"><div><span className="eyebrow">Live sport in {data.city}</span><h1>Sports near you.</h1><p className="muted">Only events currently available in your selected city.</p></div></div><div className="category-tabs"><button className={!sport ? 'selected' : ''} onClick={() => setSport('')}>All</button>{available.map((item) => <button className={sport === item ? 'selected' : ''} onClick={() => setSport(item)} key={item}>{item}</button>)}</div>{events.length ? <div className="movie-grid large">{events.map((event) => <MovieCard movie={event} key={event._id} />)}</div> : <div className="empty"><b>No {sport} events in {data.city} right now.</b><p>Try another available sport or city.</p></div>}</div> }
function Comedy({ api }) {
  const [pincode, setPincode] = useState(localStorage.getItem('cinebook-pincode') || '')
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const syncLocation = (event) => setPincode(event.detail?.pincode || '')
    window.addEventListener('cinebook-location-change', syncLocation)
    return () => window.removeEventListener('cinebook-location-change', syncLocation)
  }, [])
  useEffect(() => {
    let active = true
    api(`/events?pincode=${encodeURIComponent(pincode)}&type=comedy`)
      .then((result) => { if (active) { setEvents(result.events || []); setError('') } })
      .catch((issue) => { if (active) setError(issue.message || 'Unable to load comedy events.') })
      .finally(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [api, pincode])
  return <div className="page"><div className="page-header"><div><span className="eyebrow">Live, bookable entertainment</span><h1>Comedy shows near you</h1></div></div>{error ? <ErrorState message={error} retry={() => setPincode(localStorage.getItem('cinebook-pincode') || '')} /> : !loaded ? <Loading /> : events.length ? <div className="movie-grid large">{events.map((event) => <MovieCard movie={event} key={event._id} />)}</div> : <div className="empty"><b>{pincode ? `Sorry, no comedy shows are available at pincode ${pincode}.` : 'Enter your pincode to find comedy shows near you.'}</b><p>{pincode ? 'There are no bookable comedy shows at registered venues in this area yet.' : 'Use the pincode field in the header to check for local venues.'}</p></div>}</div>
}
function App() { return <BrowserRouter><FavoritesProvider><AppShell><Routes><Route path="/" element={<HomePage api={api} />} /><Route path="/login" element={<Login />} /><Route path="/manager/login" element={<ManagerPortalRedirect />} /><Route path="/create-account" element={<CreateAccount />} /><Route path="/movies" element={<MovieCatalog api={api} />} /><Route path="/movies/:id" element={<EventDetails api={api} />} /><Route path="/sports" element={<SportsPage api={api} />} /><Route path="/sports/:id" element={<EventDetails api={api} />} /><Route path="/comedy" element={<Comedy api={api} />} /><Route path="/seats/:id" element={<LiveSeatSelection api={api} />} /><Route path="/summary/:id" element={<Summary />} /><Route path="/payment/:id" element={<PaymentCheckout api={api} />} /><Route path="/confirmation/:id" element={<Confirmation />} /><Route path="/bookings" element={<Bookings />} /><Route path="/favorites" element={<Favorites />} /><Route path="/profile" element={<Profile />} /><Route path="/terms" element={<TermsPage />} /></Routes></AppShell></FavoritesProvider></BrowserRouter> }
export default App
