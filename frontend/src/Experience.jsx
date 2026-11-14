import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { mergeLanguages } from './catalogue-languages.js'

const cityFromStorage = () => localStorage.getItem('cinebook-city') || 'Kolkata'
const pincodeFromStorage = () => localStorage.getItem('cinebook-pincode') || ''
const fallbackPoster = '/poster-placeholder.svg'
const categories = ['cricket', 'football', 'hockey']

function useRefreshOnReturn() {
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    let lastRefresh = Date.now()
    const refresh = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastRefresh < 1000) return
      lastRefresh = Date.now()
      setRefreshKey((key) => key + 1)
    }
    const interval = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return [refreshKey, () => setRefreshKey((key) => key + 1)]
}

function EventCard({ event }) {
  const isSport = event.type === 'sports'
  const url = isSport ? `/sports/${event._id}` : `/movies/${event._id}`
  const hasUpcomingShows = event.hasUpcomingShows ?? Boolean(event.shows?.length)

  return (
    <article className="experience-card">
      <Link to={url} className="experience-card-link">
        <div className="experience-poster">
          <img
            src={event.posterUrl || event.image || fallbackPoster}
            alt={event.title}
            loading="lazy"
            onError={(imageEvent) => { imageEvent.currentTarget.src = fallbackPoster }}
          />
          <span className="experience-rating">★ {event.rating || '—'}</span>
          {event.status === 'comingSoon'
            ? <span className="experience-tag experience-coming-soon">Coming soon</span>
            : !hasUpcomingShows
              ? <span className="experience-tag experience-coming-soon">Showtimes soon</span>
              : null}
          {isSport && event.status !== 'comingSoon' && hasUpcomingShows && <span className="experience-tag">{event.sport || 'Live sport'}</span>}
        </div>
        <div className="experience-card-copy">
          <h3>{event.title}</h3>
          <p>{event.language || (isSport ? event.sport || 'Live sport' : 'Movie')}</p>
          <div className="experience-card-meta">
            <span>{event.venue || event.venueNote || 'Multiple venues'}</span>
            {event.startingPrice > 0 && <b>From ₹{event.startingPrice}</b>}
          </div>
        </div>
      </Link>
    </article>
  )
}

function EventSection({ title, eyebrow, events, link = '/movies' }) {
  if (!events.length) return null
  return (
    <section className="experience-section">
      <div className="experience-section-heading">
        <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
        <Link to={link}>Explore all <span aria-hidden="true">→</span></Link>
      </div>
      <div className="experience-card-grid">
        {events.slice(0, 5).map((event) => <EventCard event={event} key={event._id} />)}
      </div>
    </section>
  )
}

export function HomePage({ api }) {
  const routeLocation = useLocation()
  const initialQuery = new URLSearchParams(routeLocation.search).get('q') || ''
  const [city, setCity] = useState(cityFromStorage)
  const [pincode, setPincode] = useState(pincodeFromStorage)
  const [query, setQuery] = useState(initialQuery)
  const [events, setEvents] = useState([])
  const [promotionalBanners, setPromotionalBanners] = useState([])
  const [activeBanner, setActiveBanner] = useState(0)
  const [loadedKey, setLoadedKey] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useRefreshOnReturn()
  const requestKey = `${city}\u0000${pincode}\u0000${search}`
  const loading = loadedKey !== requestKey

  useEffect(() => {
    const handleSearch = (event) => {
      setQuery(event.detail)
      setSearch(event.detail)
    }
    window.addEventListener('cinebook-search', handleSearch)
    return () => window.removeEventListener('cinebook-search', handleSearch)
  }, [])

  useEffect(() => {
    const syncCity = () => setCity(cityFromStorage())
    window.addEventListener('cinebook-city-change', syncCity)
    const syncLocation = (event) => {
      setCity(event.detail?.city || cityFromStorage())
      setPincode(event.detail?.pincode || '')
    }
    window.addEventListener('cinebook-location-change', syncLocation)
    return () => {
      window.removeEventListener('cinebook-city-change', syncCity)
      window.removeEventListener('cinebook-location-change', syncLocation)
    }
  }, [])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ city, pincode, limit: '30' })
      if (search.trim()) params.set('q', search.trim())
      api(`/events?${params}`)
        .then(async (result) => {
          if (!active) return
          const bannersResult = pincode && result.events?.length
            ? await api(`/banners?city=${encodeURIComponent(city)}`)
            : []
          if (!active) return
          setEvents(result.events || [])
          setPromotionalBanners(bannersResult)
          setActiveBanner(0)
          setError('')
        })
        .catch((issue) => {
          if (active) setError(issue.message || 'Unable to load events.')
        })
        .finally(() => {
          if (active) setLoadedKey(requestKey)
        })
    }, search ? 250 : 0)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [api, city, pincode, refreshKey, requestKey, search])

  const banners = promotionalBanners.length
    ? promotionalBanners.slice(0, 5).map((banner) => ({
        ...banner,
        _id: `promotion-${banner._id}`,
        bannerUrl: banner.imageUrl,
      }))
    : events.slice(0, Math.min(events.length, 5)).map((event) => ({
        ...event,
        targetUrl: event.type === 'sports' ? `/sports/${event._id}` : `/movies/${event._id}`,
      }))
  const featured = banners[activeBanner]
  useEffect(() => {
    if (banners.length < 2) return undefined
    const timer = window.setInterval(() => {
      setActiveBanner((index) => (index + 1) % banners.length)
    }, 6500)
    return () => window.clearInterval(timer)
  }, [banners.length])

  const movies = events.filter((event) => event.type === 'movie')
  const sports = events.filter((event) => event.type === 'sports')
  const comedy = events.filter((event) => event.type === 'comedy')
  const nowShowing = movies.filter((event) =>
    event.shows?.some((show) => show.date <= new Date(Date.now() + 86400000).toISOString().slice(0, 10)))
  const comingSoon = movies.filter((event) => event.status === 'comingSoon')
  const showtimesSoon = movies.filter((event) => event.status !== 'comingSoon' && !event.hasUpcomingShows)

  const runSearch = (event) => {
    event.preventDefault()
    setSearch(query)
  }

  return (
    <div className="experience-home">
      <section className="experience-hero">
        {featured && (
          <img
            key={featured._id}
            className="experience-hero-art"
            src={featured.bannerUrl || featured.posterUrl || fallbackPoster}
            alt=""
            aria-hidden="true"
            onError={(imageEvent) => { imageEvent.currentTarget.src = fallbackPoster }}
          />
        )}
        <div className="experience-hero-shade" />
        <div className="experience-hero-copy">
          <span className="experience-kicker">Your next great plan starts here</span>
          <h1>{featured?.title || (loading ? 'Finding your next great night out…' : 'Find something worth going out for.')}</h1>
          <p>{featured?.description || 'Discover films, live sport and experiences worth sharing.'}</p>
          <div className="experience-hero-actions">
            {featured && <Link className="primary-button" to={featured.targetUrl}>Explore event <span aria-hidden="true">↗</span></Link>}
            <Link className="outline-button" to="/sports">Discover live sports</Link>
          </div>
        </div>
        {banners.length > 1 && (
          <div className="experience-carousel-controls" aria-label="Featured events">
            <button type="button" aria-label="Previous featured event" onClick={() => setActiveBanner((activeBanner - 1 + banners.length) % banners.length)}>←</button>
            {banners.map((banner, index) => (
              <button
                type="button"
                key={banner._id}
                className={index === activeBanner ? 'selected' : ''}
                aria-label={`Show featured event ${index + 1}: ${banner.title}`}
                aria-pressed={index === activeBanner}
                onClick={() => setActiveBanner(index)}
              />
            ))}
            <button type="button" aria-label="Next featured event" onClick={() => setActiveBanner((activeBanner + 1) % banners.length)}>→</button>
          </div>
        )}
      </section>

      <section className="experience-discovery">
        <div>
          <span className="eyebrow">Good things are happening</span>
          <h2>Make room for a plan.</h2>
        </div>
        <form className="experience-search" onSubmit={runSearch}>
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movies, teams, venues or events" aria-label="Search events" />
          <button type="submit">Search</button>
        </form>
      </section>

      <nav className="experience-categories" aria-label="Browse categories">
        <Link to="/movies"><span>01</span><b>Movies</b><small>Films for every mood</small></Link>
        <Link to="/sports"><span>02</span><b>Live sports</b><small>Big matches, bigger moments</small></Link>
        <Link to="/comedy"><span>03</span><b>Comedy</b><small>A good night starts with a laugh</small></Link>
      </nav>

      {error
        ? <div className="experience-empty" role="alert"><b>We couldn't load nearby events.</b><p>{error}</p><button className="ghost-button" onClick={() => setRefreshKey((key) => key + 1)}>Try again</button></div>
        : loading && !events.length
          ? <div className="experience-empty"><b>Finding events near you…</b></div>
          : events.length
            ? <>
              <EventSection title="Recommended for you" eyebrow="Picked for you" events={events.slice(0, 5)} />
              <EventSection title="Now showing" eyebrow="On the big screen" events={nowShowing} />
              <EventSection title="Coming soon" eyebrow="Plan ahead" events={comingSoon} />
              <EventSection title="Showtimes to be announced" eyebrow="At your local cinema" events={showtimesSoon} />
              <EventSection title="Live sports" eyebrow="Be there for the moment" events={sports} link="/sports" />
              <EventSection title="Cricket, football & hockey" eyebrow="Find your game" events={sports.filter((event) => categories.includes(event.sport))} link="/sports" />
              <EventSection title="Trending experiences" eyebrow="Popular around you" events={[...sports, ...comedy].slice(0, 5)} link="/sports" />
            </>
            : <div className="experience-empty"><b>{pincode ? 'No events are available at this pincode right now.' : 'Enter your pincode to find local events.'}</b><p>{pincode ? 'There are no bookable shows at registered venues in this area yet.' : 'Choose the location field above and enter your 6-digit pincode.'}</p>{pincode && <Link className="outline-button" to="/movies">Browse movies</Link>}</div>}
    </div>
  )
}

export function SportsPage({ api }) {
  const [city, setCity] = useState(cityFromStorage)
  const [pincode, setPincode] = useState(pincodeFromStorage)
  const [sport, setSport] = useState('')
  const [date, setDate] = useState('')
  const [query, setQuery] = useState('')
  const [range, setRange] = useState({ minPrice: '', maxPrice: '' })
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const syncCity = () => setCity(cityFromStorage())
    window.addEventListener('cinebook-city-change', syncCity)
    const syncLocation = (event) => {
      setCity(event.detail?.city || cityFromStorage())
      setPincode(event.detail?.pincode || '')
    }
    window.addEventListener('cinebook-location-change', syncLocation)
    return () => {
      window.removeEventListener('cinebook-city-change', syncCity)
      window.removeEventListener('cinebook-location-change', syncLocation)
    }
  }, [])

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ city, pincode, type: 'sports', limit: '30' })
    if (sport) params.set('sport', sport)
    if (date) params.set('date', date)
    if (query.trim()) params.set('q', query.trim())
    if (range.minPrice) params.set('minPrice', range.minPrice)
    if (range.maxPrice) params.set('maxPrice', range.maxPrice)
    api(`/events?${params}`)
      .then((result) => {
        if (!active) return
        setEvents(result.events || [])
        setError('')
      })
      .catch((issue) => { if (active) setError(issue.message || 'Unable to load sports events.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, city, date, pincode, range, sport, query])

  return (
    <div className="experience-page">
      <section className="experience-page-heading">
        <span className="eyebrow">Live events near you</span>
        <h1>Feel the game.<br /><span>Be there live.</span></h1>
        <p>Find cricket, football, hockey and more. Choose a match, pick your section and book seats from the live venue map.</p>
      </section>
      <div className="experience-sport-tabs" aria-label="Sports categories">
        <button className={!sport ? 'selected' : ''} onClick={() => setSport('')}>All sports</button>
        {['cricket', 'football', 'hockey', 'basketball', 'tennis', 'badminton', 'kabaddi', 'motorsports', 'esports'].map((item) => (
          <button key={item} className={sport === item ? 'selected' : ''} onClick={() => setSport(sport === item ? '' : item)}>{item}</button>
        ))}
      </div>
      <div className="experience-filters">
        <input aria-label="Search sports" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a team, match or stadium" />
        <label><span>Date</span><input aria-label="Filter by date" type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label><span>From ₹</span><input aria-label="Minimum ticket price" type="number" min="0" value={range.minPrice} onChange={(event) => setRange({ ...range, minPrice: event.target.value })} /></label>
        <label><span>To ₹</span><input aria-label="Maximum ticket price" type="number" min="0" value={range.maxPrice} onChange={(event) => setRange({ ...range, maxPrice: event.target.value })} /></label>
      </div>
      {error
        ? <div className="experience-empty" role="alert"><b>Sports events couldn't be loaded.</b><p>{error}</p></div>
        : loading && !events.length
          ? <div className="experience-empty">Loading live events…</div>
          : events.length
            ? <div className="experience-card-grid experience-card-grid-wide">{events.map((event) => <EventCard event={event} key={event._id} />)}</div>
            : <div className="experience-empty"><b>{pincode ? `No ${sport || 'sports'} events are available at this pincode.` : 'Enter your pincode to find local sports events.'}</b><p>{pincode ? 'There are no bookable events at registered venues in this area yet.' : 'Choose the location field above and enter your 6-digit pincode.'}</p></div>}
    </div>
  )
}

export function MovieCatalog({ api }) {
  const routeLocation = useLocation()
  const [refreshKey] = useRefreshOnReturn()
  const [city, setCity] = useState(cityFromStorage)
  const [pincode, setPincode] = useState(pincodeFromStorage)
  const [filters, setFilters] = useState({
    search: new URLSearchParams(routeLocation.search).get('search') || '',
    language: '',
    sort: 'trending',
  })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const languages = mergeLanguages(data?.filters?.languages || [])

  useEffect(() => {
    const syncCity = () => setCity(cityFromStorage())
    window.addEventListener('cinebook-city-change', syncCity)
    const syncLocation = (event) => {
      setCity(event.detail?.city || cityFromStorage())
      setPincode(event.detail?.pincode || '')
    }
    window.addEventListener('cinebook-location-change', syncLocation)
    return () => {
      window.removeEventListener('cinebook-city-change', syncCity)
      window.removeEventListener('cinebook-location-change', syncLocation)
    }
  }, [])

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ city, pincode, sort: filters.sort, type: 'movie' })
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    api(`/movies?${params}`)
      .then((result) => { if (active) { setData(result); setError('') } })
      .catch((issue) => { if (active) setError(issue.message || 'Unable to load movies.') })
    return () => { active = false }
  }, [api, city, filters, pincode, refreshKey])

  return (
    <div className="experience-page">
      <div className="experience-section-heading">
        <div><span className="eyebrow">On the big screen near you</span><h1>Movies worth watching.</h1><p>See films at local cinemas. Booking opens when showtimes are published.</p></div>
        <span className="experience-city-pill">{data?.movies?.length || 0} titles</span>
      </div>
      <div className="experience-filters experience-movie-filters">
        <input aria-label="Search movies" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search a movie or cast" />
        <select aria-label="Filter by language" value={filters.language} onChange={(event) => setFilters({ ...filters, language: event.target.value })}><option value="">All languages</option>{languages.map((language) => <option key={language}>{language}</option>)}</select>
        <select aria-label="Sort movies" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}><option value="trending">Popular</option><option value="rating">Top rated</option><option value="newest">Newest</option></select>
      </div>
      {error
        ? <div className="experience-empty" role="alert"><b>Movies couldn't be loaded.</b><p>{error}</p></div>
        : !data
          ? <div className="experience-empty">Loading movies…</div>
          : data.movies.length
            ? <div className="experience-card-grid experience-card-grid-wide">{data.movies.map((event) => <EventCard event={event} key={event._id} />)}</div>
            : <div className="experience-empty"><b>{pincode ? 'No movies are listed near you yet.' : 'Enter your pincode to find movies near you.'}</b><p>{pincode ? 'Published movies will appear here when a nearby cinema adds them to its catalogue.' : 'Choose the location field above and enter your 6-digit pincode.'}</p></div>}
    </div>
  )
}

export function EventDetails({ api }) {
  const { id } = useParams()
  const [pincode, setPincode] = useState(pincodeFromStorage)
  const [loadedEvent, setLoadedEvent] = useState(null)
  const [date, setDate] = useState('')
  const [loadError, setLoadError] = useState(null)
  const navigate = useNavigate()
  const data = loadedEvent?.id === id && loadedEvent?.pincode === pincode ? loadedEvent.value : null
  const error = loadError?.id === id && loadError?.pincode === pincode ? loadError.message : ''
  const isSport = data?.movie?.type === 'sports'

  useEffect(() => {
    const syncLocation = (event) => {
      setPincode(event.detail?.pincode || '')
    }
    window.addEventListener('cinebook-location-change', syncLocation)
    return () => window.removeEventListener('cinebook-location-change', syncLocation)
  }, [])

  useEffect(() => {
    let active = true
    api(`/movies/${id}?pincode=${encodeURIComponent(pincode)}`)
      .then((result) => {
        if (!active) return
        setLoadedEvent({ id, pincode, value: result })
        setDate(result.dates?.[0]?.value || '')
        setLoadError(null)
      })
      .catch((issue) => {
        if (active) setLoadError({ id, pincode, message: issue.message || 'Unable to load event details.' })
      })
    return () => { active = false }
  }, [api, id, pincode])

  const dates = data?.dates || []
  const venues = data?.theatres || []
  const availableShows = venues.flatMap((venue) => venue.shows || []).filter((show) => show.date === date)
  const comingSoon = data?.movie?.status === 'comingSoon'
  const hasUpcomingShows = dates.length > 0

  if (error) return <div className="experience-page"><div className="experience-empty" role="alert"><b>Event details couldn't be loaded.</b><p>{error}</p></div></div>
  if (!data) return <div className="experience-page"><div className="experience-empty">Loading event details…</div></div>

  return (
    <div className="experience-page experience-detail">
      <section className="experience-detail-hero">
        <img src={data.movie.bannerUrl || data.movie.posterUrl || fallbackPoster} alt="" onError={(imageEvent) => { imageEvent.currentTarget.src = fallbackPoster }} />
        <div className="experience-detail-overlay" />
        <div className="experience-detail-copy">
          <span className="eyebrow">{comingSoon ? 'Coming soon' : !hasUpcomingShows ? 'Showtimes to be announced' : isSport ? data.movie.sport || 'Live sport' : `Now showing · ${data.movie.language}`}</span>
          <h1>{data.movie.title}</h1>
          <div className="experience-detail-meta">
            <span>★ {data.movie.rating || '—'}</span>
            {data.movie.duration && <span>{data.movie.duration} min</span>}
          </div>
          <p>{data.movie.description}</p>
          {isSport && (data.movie.homeTeam || data.movie.awayTeam) && <div className="experience-teams">
            {data.movie.homeTeam && <b>{data.movie.homeTeam}</b>}
            {data.movie.homeTeam && data.movie.awayTeam && <span>VS</span>}
            {data.movie.awayTeam && <b>{data.movie.awayTeam}</b>}
          </div>}
          {data.movie.cast?.length > 0 && <p className="experience-cast"><b>Cast</b> · {data.movie.cast.join(' · ')}</p>}
          {data.movie.trailerUrl && <a className="outline-button" href={data.movie.trailerUrl} target="_blank" rel="noreferrer">Watch trailer ↗</a>}
        </div>
      </section>

      <section className="experience-shows">
        <div className="experience-section-heading">
          <div><span className="eyebrow">{isSport ? 'Choose your match' : 'Choose your show'}</span><h2>{isSport ? 'Pick a date & venue.' : 'Find a time that works.'}</h2></div>
          <span className="experience-city-pill">Near you</span>
        </div>
        {dates.length > 0 && (
          <div className="experience-date-list" aria-label="Available dates">
            {dates.map((item) => (
              <button key={item.value} className={date === item.value ? 'selected' : ''} onClick={() => setDate(item.value)}>
                <small>{item.label}</small><b>{item.day}</b>
              </button>
            ))}
          </div>
        )}
        {!venues.length
          ? <div className="experience-empty"><b>{pincode ? 'No cinema is registered at this pincode yet.' : 'Enter your pincode to find nearby cinemas.'}</b><p>{pincode ? 'Try another pincode to check for participating cinemas.' : 'Choose the location field above and enter your 6-digit pincode.'}</p></div>
          : venues.map((venue) => {
            const shows = (venue.shows || []).filter((show) => show.date === date)
            if (!shows.length && dates.length) return null
            return (
              <article className="experience-venue" key={venue._id}>
                <div><span className="eyebrow">{isSport ? 'Stadium / arena' : 'Cinema'}</span><h3>{venue.name}</h3><p>{[venue.address, venue.district, venue.state, venue.pincode].filter(Boolean).join(' · ')}</p>{data.movie.venueNote && <small>{data.movie.venueNote}</small>}</div>
                {shows.length
                  ? <div className="experience-show-times">
                    {shows.map((show) => <button key={show._id} onClick={() => navigate(`/seats/${show._id}`)}><b>{show.time}</b><small>From ₹{show.basePrice}</small></button>)}
                  </div>
                  : <p className="experience-empty-inline">{comingSoon ? 'Booking opens when this cinema publishes a showtime.' : 'This cinema has not published a showtime yet. Once it does, choose a time, select your seats and complete payment here.'}</p>}
              </article>
            )
          })}
        {!availableShows.length && dates.length > 0 && <p className="experience-empty-inline">No times for the selected date. Choose another date above.</p>}
      </section>
    </div>
  )
}

export function SeatSelection({ api }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const routeLocation = useLocation()
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState([])
  const [error, setError] = useState('')
  const [availabilityNotice] = useState(routeLocation.state?.availabilityNotice || '')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const result = await api(`/shows/${id}/seats`)
        if (!active) return
        setData(result)
        setSelected((current) => current.filter((chosen) => {
          const currentSeat = result.seats.find((seat) => seat.label === (chosen.code || chosen.label))
          return currentSeat?.status === 'available'
        }))
        setError('')
      } catch (issue) {
        if (active) setError(issue.message || 'Unable to load seat availability.')
      }
    }

    load()
    const interval = window.setInterval(load, 10000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [api, id])

  const show = data?.show
  const sport = show?.movie?.type === 'sports' ? show.movie.sport : ''
  const zoneNames = sport === 'motorsports'
    ? ['Grandstand A', 'Grandstand B', 'VIP Lounge', 'Paddock Club', 'Trackside']
    : sport === 'cricket'
      ? ['North Stand', 'East Stand', 'South Stand', 'West Stand', 'Pavilion', 'VIP']
      : ['North Stand', 'East Stand', 'South Stand', 'West Stand', 'Premium', 'VIP']
  const seats = (data?.seats || []).map((seat, index) => sport
    ? { ...seat, code: seat.label, label: `${zoneNames[Math.floor(index / 12) % zoneNames.length]} ${index % 12 + 1}` }
    : { ...seat, code: seat.label })
  const total = selected.reduce((sum, seat) => sum + Number(seat.price || 0), 0)
  const centre = sport
    ? ({ cricket: 'CRICKET FIELD · PITCH', football: 'FOOTBALL PITCH', basketball: 'BASKETBALL COURT', tennis: 'TENNIS COURT', badminton: 'BADMINTON COURTS', hockey: 'HOCKEY FIELD', kabaddi: 'KABADDI ARENA', motorsports: 'RACE TRACK VIEW', esports: 'ESPORTS STAGE' }[sport] || 'LIVE EVENT')
    : 'SCREEN'

  const toggleSeat = (seat) => {
    if (seat.status !== 'available') return
    setSelected((current) => current.some((item) => item.code === seat.code)
      ? current.filter((item) => item.code !== seat.code)
      : current.length < 8 ? [...current, seat] : current)
  }

  if (error && !data) return <div className="experience-page"><div className="experience-empty" role="alert"><b>Seat availability couldn't be loaded.</b><p>{error}</p><button className="ghost-button" onClick={() => window.location.reload()}>Try again</button></div></div>
  if (!data) return <div className="experience-page"><div className="experience-empty">Loading live seat availability…</div></div>

  return (
    <div className="experience-page experience-seat-page">
      <div className="experience-section-heading"><div><span className="eyebrow">{show.movie.title} · {show.theatre.name}</span><h1>Choose {sport ? 'your section' : 'your seats'}.</h1><p>{show.dateLabel} · {show.time} · {sport ? show.theatre.address : show.screen.name}</p></div><span className="experience-city-pill">Live availability</span></div>
      {availabilityNotice && <p className="experience-payment-note" role="status">{availabilityNotice}</p>}
      <div className={`experience-seat-layout ${sport ? 'sports-layout' : ''}`}>
        <div className="experience-stage"><span>{centre}</span></div>
        {sport && <div className="experience-zone-labels">{zoneNames.slice(0, 4).map((zone) => <span key={zone}>{zone}</span>)}</div>}
        <div className="experience-seat-grid">
          {seats.map((seat, index) => {
            const isSelected = selected.some((item) => item.code === (seat.code || seat.label))
            return (
              <button
                key={seat._id || seat.label}
                type="button"
                disabled={seat.status !== 'available'}
                aria-label={`${seat.label}, ${seat.status}, ₹${seat.price}`}
                title={`${seat.label} · ₹${seat.price}`}
                className={`experience-seat ${seat.status} ${seat.category || ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleSeat(seat)}
              >{sport ? index % 12 + 1 : seat.number}</button>
            )
          })}
        </div>
        <div className="experience-seat-legend">
          <span><i className="available" />Available</span><span><i className="selected" />Selected</span><span><i className="locked" />Temporarily held</span><span><i className="booked" />Booked</span>
        </div>
      </div>
      {error && <p className="experience-inline-error" role="status">{error}</p>}
      <div className="experience-booking-bar">
        <div><small>{selected.length} of 8 tickets selected</small><b>₹{total.toLocaleString('en-IN')}</b></div>
        <button className="primary-button" disabled={!selected.length} onClick={() => navigate(`/summary/${id}`, { state: { seats: selected } })}>Review booking <span aria-hidden="true">→</span></button>
      </div>
    </div>
  )
}

let razorpayScript
const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve()
  if (razorpayScript) return razorpayScript
  razorpayScript = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      razorpayScript = null
      reject(new Error('Razorpay checkout could not be loaded. Check your connection and try again.'))
    }
    document.body.appendChild(script)
  })
  return razorpayScript
}

export function PaymentCheckout({ api }) {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const seats = location.state?.seats || []
  const [methods, setMethods] = useState(null)
  const [provider, setProvider] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingVerification, setPendingVerification] = useState(null)
  const amount = seats.reduce((sum, seat) => sum + Number(seat.price || 0), 0)

  useEffect(() => {
    api('/payments/methods')
      .then((result) => {
        setMethods(result)
        setProvider(result.razorpay ? 'razorpay' : result.payu ? 'payu' : '')
      })
      .catch((issue) => setError(issue.message || 'Payment options could not be loaded.'))
  }, [api])

  const verifyRazorpayPayment = async (response) => {
    setPendingVerification(response)
    setError('')
    try {
      const result = await api('/payments/razorpay/verify', {
        method: 'POST',
        body: JSON.stringify(response),
      })
      setPendingVerification(null)
      navigate(`/confirmation/${result.bookingId}`, { replace: true })
    } catch (issue) {
      setError(issue.message || 'Payment verification failed. Your booking is not confirmed.')
    }
  }

  const startPayment = async (event) => {
    event.preventDefault()
    if (!seats.length || !provider) return
    setBusy(true)
    setError('')
    try {
      const checkout = await api('/payments/initiate', {
        method: 'POST',
        body: JSON.stringify({
          showId: id,
          seats,
          provider,
        }),
      })

      if (checkout.provider === 'payu') {
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = checkout.action
        Object.entries(checkout.fields).forEach(([name, value]) => {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = name
          input.value = value
          form.appendChild(input)
        })
        document.body.appendChild(form)
        form.submit()
        return
      }

      await loadRazorpay()
      const options = {
        key: checkout.keyId,
        amount: checkout.order.amount,
        currency: checkout.order.currency,
        name: 'CinBook',
        description: checkout.description,
        order_id: checkout.order.id,
        prefill: checkout.prefill,
        theme: { color: '#f36b57' },
        handler: verifyRazorpayPayment,
        modal: {
          ondismiss: () => {
            api('/payments/razorpay/cancel', {
              method: 'POST',
              body: JSON.stringify({ attemptId: checkout.attemptId }),
            }).catch((issue) => setError(issue.message || 'Could not release the temporary seat hold.'))
          },
        },
      }
      const razorpay = new window.Razorpay(options)
      razorpay.on('payment.failed', (failure) => {
        api('/payments/razorpay/cancel', {
          method: 'POST',
          body: JSON.stringify({ attemptId: checkout.attemptId }),
        }).catch((issue) => setError(issue.message || 'Could not release the temporary seat hold.'))
        setError(failure.error?.description || 'Payment failed. Your booking was not confirmed.')
      })
      razorpay.open()
    } catch (issue) {
      if (issue.status === 401) navigate('/login')
      else if (issue.status === 409) navigate(`/seats/${id}`, {
        replace: true,
        state: { availabilityNotice: 'Those seats were reserved while you were checking out. Choose seats marked available and try again.' },
      })
      else setError(issue.message || 'Could not start checkout. Your seats have not been charged.')
    } finally {
      setBusy(false)
    }
  }

  if (!seats.length) {
    return <div className="experience-page"><div className="experience-empty"><b>Your seat selection is missing.</b><p>Choose your seats again before starting payment.</p><Link className="outline-button" to={`/seats/${id}`}>Choose seats</Link></div></div>
  }

  return (
    <div className="experience-page experience-payment-page">
      <div className="experience-section-heading"><div><span className="eyebrow">Secure checkout</span><h1>One last step.</h1><p>Your tickets are confirmed only after the provider verifies your payment.</p></div><span className="experience-city-pill">Protected payment</span></div>
      <div className="experience-payment-layout">
        <section className="experience-payment-card">
          <span className="eyebrow">Payment method</span>
          {methods?.razorpay && <label className={`experience-payment-option ${provider === 'razorpay' ? 'selected' : ''}`}><input type="radio" name="payment-provider" value="razorpay" checked={provider === 'razorpay'} onChange={() => setProvider('razorpay')} /><span><b>Razorpay</b><small>UPI, cards, net banking & wallets</small></span><strong>Secure</strong></label>}
          {methods?.payu && <label className={`experience-payment-option ${provider === 'payu' ? 'selected' : ''}`}><input type="radio" name="payment-provider" value="payu" checked={provider === 'payu'} onChange={() => setProvider('payu')} /><span><b>PayU</b><small>Continue to PayU hosted checkout</small></span><strong>Secure</strong></label>}
          {methods && !methods.razorpay && !methods.payu && <p className="experience-inline-error">No payment provider is configured. Add Razorpay or PayU credentials to the backend environment.</p>}
          <p className="experience-payment-note">CinBook does not store your card or UPI credentials. Seats are held for a short time while payment is completed.</p>
          {error && <p className="experience-inline-error" role="alert">{error}</p>}
          {pendingVerification && <button className="ghost-button" type="button" disabled={busy} onClick={() => verifyRazorpayPayment(pendingVerification)}>Retry payment verification</button>}
          <button className="primary-button experience-pay-button" disabled={busy || !provider || !methods} onClick={startPayment}>{busy ? 'Opening secure checkout…' : `Pay ₹${amount.toLocaleString('en-IN')}`}</button>
        </section>
        <aside className="experience-order-summary">
          <span className="eyebrow">Order summary</span>
          <h2>{seats.length} ticket{seats.length === 1 ? '' : 's'}</h2>
          <div>{seats.map((seat) => <p key={seat.code || seat.label}><span>{seat.label}</span><b>₹{Number(seat.price || 0).toLocaleString('en-IN')}</b></p>)}</div>
          <div className="experience-total"><span>Total payable</span><b>₹{amount.toLocaleString('en-IN')}</b></div>
          <small>Final amount and availability are checked by the server before checkout.</small>
        </aside>
      </div>
    </div>
  )
}

export function TermsPage() {
  return (
    <article className="experience-page experience-terms">
      <span className="eyebrow">CineBook information</span>
      <h1>Terms & privacy.</h1>
      <section id="terms">
        <h2>Booking terms</h2>
        <p>Ticket availability and pricing are checked against the selected event and venue before checkout. A booking is confirmed only after the payment provider verifies that payment was captured.</p>
        <p>Keep your booking ID available when contacting the event venue. Cancellations and refunds depend on the event and payment provider; this application does not currently initiate refunds automatically.</p>
      </section>
      <section id="privacy">
        <h2>Account privacy</h2>
        <p>Your profile, preferences, saved titles and booking history are associated with your signed-in account. Sign out on shared devices and contact the service operator for account-data requests.</p>
        <p>Payment credentials are collected by the selected payment provider. CineBook does not store card or UPI credentials.</p>
      </section>
    </article>
  )
}
