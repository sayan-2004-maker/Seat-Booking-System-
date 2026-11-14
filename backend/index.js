import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import Razorpay from 'razorpay'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  ...(process.env.CORS_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean)
])

const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true)
    return callback(new Error('Origin is not allowed by CORS'))
  }
})

app.use((req, res, next) => {
  // PayU returns to this endpoint with a browser form POST from its own origin.
  // CORS does not apply to form navigation, so do not reject that callback origin.
  if (req.path === '/api/payments/payu/callback') return next()
  return corsMiddleware(req, res, next)
})
app.use(express.json({ limit: '6mb' }))
app.use(express.urlencoded({ extended: false }))

const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 20 } = {}) => {
  const requests = new Map()
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of requests) {
      if (record.resetAt <= now) requests.delete(key)
    }
  }, windowMs).unref()

  return (req, res, next) => {
    const now = Date.now()
    const key = req.ip || req.socket.remoteAddress || 'unknown'
    let record = requests.get(key)
    if (!record || record.resetAt <= now) {
      record = { count: 0, resetAt: now + windowMs }
      requests.set(key, record)
    }
    record.count += 1
    res.setHeader('RateLimit-Limit', max)
    res.setHeader('RateLimit-Remaining', Math.max(0, max - record.count))
    res.setHeader('RateLimit-Reset', Math.ceil(record.resetAt / 1000))
    if (record.count > max) {
      return res.status(429).json({ message: 'Too many requests. Please try again later.' })
    }
    next()
  }
}

const authRateLimit = rateLimit({ max: 10 })
const paymentRateLimit = rateLimit({ windowMs: 60 * 1000, max: 12 })

const uploadDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads')
await mkdir(uploadDirectory, { recursive: true })
app.use('/uploads', express.static(uploadDirectory, {
  dotfiles: 'deny',
  index: false,
  maxAge: '1d',
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff')
}))

const port = process.env.PORT || 4000

const mongoUrl =
  process.env.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/cinebook'

const tokenSecret = process.env.JWT_SECRET
if (!tokenSecret || tokenSecret.length < 32 || tokenSecret === 'replace-with-a-long-random-secret') {
  throw new Error('Set JWT_SECRET to a random value of at least 32 characters in backend/.env')
}

// =====================================================
// SCHEMAS
// =====================================================

const citySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      unique: true,
      required: true
    },
    state: String
  },
  { timestamps: true }
)

const movieSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },

    type: {
      type: String,
      enum: ['movie', 'sports', 'comedy'],
      default: 'movie'
    },

    status: {
      type: String,
      enum: ['comingSoon', 'nowShowing', 'ended'],
      default: 'nowShowing'
    },

    sport: {
      type: String,
      enum: [
        'cricket',
        'football',
        'basketball',
        'tennis',
        'badminton',
        'hockey',
        'kabaddi',
        'motorsports',
        'esports'
      ]
    },

    city: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City'
    },

    posterUrl: String,
    trailerUrl: String,
    bannerUrl: String,
    language: String,
    genre: [String],
    duration: Number,
    rating: Number,

    popularity: {
      type: Number,
      default: 0
    },

    performer: String,
    homeTeam: String,
    awayTeam: String,
    tournament: String,
    ticketSalesStart: Date,
    ticketSalesEnd: Date,
    venueNote: String,
    releaseDate: Date,
    description: String,
    cast: [String],
    crew: [String],

    published: {
      type: Boolean,
      default: true
    },

    trending: Boolean,
    archived: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
)

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 500 },
    imageUrl: { type: String, required: true, trim: true },
    targetUrl: { type: String, required: true, trim: true },
    city: { type: mongoose.Schema.Types.ObjectId, ref: 'City', default: null },
    order: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    startsAt: Date,
    endsAt: Date
  },
  { timestamps: true }
)

bannerSchema.index({ active: 1, order: 1, startsAt: 1, endsAt: 1 })

const theatreSchema = new mongoose.Schema(
  {
    name: String,
    venueType: {
      type: String,
      enum: ['cinema', 'stadium', 'multiPurpose'],
      default: 'cinema'
    },

    city: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City'
    },

    address: String,
    district: String,
    state: String,
    pincode: String,

    coordinates: {
      latitude: Number,
      longitude: Number
    },

    formats: [String],
    archived: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
)

const screenSchema = new mongoose.Schema({
  name: String,

  theatre: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theatre'
  },

  capacity: Number,
  archived: {
    type: Boolean,
    default: false
  },
  seatPrices: {
    premium: { type: Number, default: 320 },
    comfort: { type: Number, default: 240 },
    standard: { type: Number, default: 180 }
  },

  seats: [
    {
      label: String,
      row: String,
      number: Number,
      category: String,
      price: Number
    }
  ]
})

const showSchema = new mongoose.Schema({
  seedKey: { type: String, unique: true, sparse: true },
  movie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Movie'
  },

  theatre: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theatre'
  },

  screen: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Screen'
  },

  date: String,
  dateLabel: String,
  time: String,
  basePrice: Number,

  active: {
    type: Boolean,
    default: true
  },
  archived: {
    type: Boolean,
    default: false
  },

  // Temporary payment locks
  lockedSeats: [
    {
      seat: String,
      txnid: String,
      expiresAt: Date
    }
  ],

  // Only confirmed seats
  bookedSeats: [String]
})

const userSchema = new mongoose.Schema(
  {
    name: String,

    email: {
      type: String,
      unique: true
    },

    phone: String,

    passwordHash: String,

    role: {
      type: String,
      enum: ['user', 'manager', 'admin', 'superadmin'],
      default: 'user'
    },

    isActive: {
      type: Boolean,
      default: true
    },

    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Movie'
      }
    ],

    preferences: {
      city: {
        type: String,
        default: 'Kolkata'
      },
      pincode: {
        type: String,
        match: /^\d{6}$/
      },
      language: String
    }
  },
  { timestamps: true }
)

const bookingSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      unique: true
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    show: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Show'
    },

    seats: [String],

    ticketAmount: Number,
    convenienceFee: Number,
    taxAmount: Number,
    totalAmount: Number,

    paymentMethod: String,

    status: {
      type: String,
      default: 'confirmed'
    }
  },
  { timestamps: true }
)

const paymentAttemptSchema = new mongoose.Schema(
  {
    txnid: {
      type: String,
      unique: true
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    show: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Show',
      required: true
    },

    requestedSeats: [String],
    displaySeats: [String],

    ticketAmount: Number,
    convenienceFee: Number,
    taxAmount: Number,

    amount: String,

    productinfo: String,
    firstname: String,
    email: String,
    phone: String,

    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'review'],
      default: 'pending'
    },

    provider: {
      type: String,
      enum: ['payu', 'razorpay'],
      default: 'payu'
    },

    razorpayOrderId: String,
    razorpayPaymentId: String,

    bookingId: String,
    expiresAt: Date
  },
  { timestamps: true }
)

// =====================================================
// MODELS
// =====================================================

const City = mongoose.model('City', citySchema)
const Movie = mongoose.model('Movie', movieSchema)
const Theatre = mongoose.model('Theatre', theatreSchema)
const Screen = mongoose.model('Screen', screenSchema)
const Show = mongoose.model('Show', showSchema)
const User = mongoose.model('User', userSchema)
const Booking = mongoose.model('Booking', bookingSchema)
const PaymentAttempt = mongoose.model(
  'PaymentAttempt',
  paymentAttemptSchema
)
const Banner = mongoose.model('Banner', bannerSchema)

// =====================================================
// AUTH
// =====================================================

const auth = async (req, res, next) => {
  const token =
    req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({
      message: 'Authentication required'
    })
  }

  try {
    req.user = jwt.verify(token, tokenSecret)
    const account = await User.findById(req.user.id).select('isActive').lean()
    if (!account || account.isActive === false) {
      return res.status(401).json({
        message: 'This account is unavailable. Contact support if you believe this is an error.'
      })
    }
    next()
  } catch (error) {
    if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') {
      return next(error)
    }
    return res.status(401).json({
      message: 'Invalid token'
    })
  }
}

const adminOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.user?.id)
      .select('role')
      .lean()

    if (!['manager', 'admin', 'superadmin'].includes(user?.role)) {
      return res.status(403).json({
        message: 'Manager access required'
      })
    }

    next()
  } catch (error) {
    next(error)
  }
}

const adminAccountOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.user?.id).select('role').lean()
    if (!['admin', 'superadmin'].includes(user?.role)) {
      return res.status(403).json({ message: 'Administrator access required' })
    }
    next()
  } catch (error) {
    next(error)
  }
}

// =====================================================
// BASIC ROUTES
// =====================================================

app.get('/api/health', (_req, res) => {
  res.json({
    ok: mongoose.connection.readyState === 1,
    service: 'cinebook-api',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  })
})

app.get('/api/cities', async (_req, res, next) => {
  try {
    res.json(
      await City.find().sort('name')
    )
  } catch (error) {
    next(error)
  }
})

app.get('/api/banners', async (req, res, next) => {
  try {
    const now = new Date()
    const city = req.query.city
      ? await City.findOne({
          name: new RegExp(
            `^${String(req.query.city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i'
          )
        }).select('_id')
      : null

    if (req.query.city && !city) {
      return res.json([])
    }

    const banners = await Banner.find({
      active: true,
      $and: [
        { $or: [{ city: null }, ...(city ? [{ city: city._id }] : [])] },
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] }
      ]
    })
      .sort({ order: 1, createdAt: -1 })
      .populate('city', 'name')
      .lean()

    res.json(banners)
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/me', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .select('name email phone role preferences favorites')
      .lean()

    if (!user) {
      return res.status(404).json({
        message: 'Account not found'
      })
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        preferences: user.preferences,
        favorites: user.favorites
      }
    })
  } catch (error) {
    next(error)
  }
})

app.put('/api/account/profile', auth, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim()
    const phone = String(req.body.phone || '').trim()

    if (!name || !phone) {
      return res.status(400).json({
        message: 'Name and phone are required'
      })
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { name, phone } },
      { new: true, runValidators: true }
    ).select('name email phone role preferences')

    if (!user) {
      return res.status(404).json({
        message: 'Account not found'
      })
    }

    res.json({ user })
  } catch (error) {
    next(error)
  }
})

app.put('/api/account/preferences', auth, async (req, res, next) => {
  try {
    const updates = {}
    const removals = {}

    if (req.body.city !== undefined) {
      const city = String(req.body.city).trim()
      if (!await City.exists({ name: city })) {
        return res.status(400).json({
          message: 'Choose a city from the available list'
        })
      }
      updates['preferences.city'] = city
    }

    if (req.body.pincode !== undefined) {
      const pincode = String(req.body.pincode).trim()
      if (pincode && !/^\d{6}$/.test(pincode)) {
        return res.status(400).json({ message: 'Enter a valid 6-digit pincode' })
      }
      if (pincode) {
        const venue = await Theatre.findOne({ pincode, archived: { $ne: true } })
          .populate('city', 'name')
          .select('city')
        if (!venue) {
          return res.status(400).json({ message: 'That pincode has no registered venues yet' })
        }
        if (req.body.city && String(req.body.city).trim() !== venue.city?.name) {
          return res.status(400).json({ message: 'The selected city does not match that pincode' })
        }
        updates['preferences.pincode'] = pincode
        updates['preferences.city'] = venue.city?.name || updates['preferences.city']
      } else {
        removals['preferences.pincode'] = 1
      }
    }

    if (req.body.language !== undefined) {
      updates['preferences.language'] = String(req.body.language).trim()
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates, $unset: removals },
      { new: true, runValidators: true }
    ).select('preferences')

    if (!user) {
      return res.status(404).json({
        message: 'Account not found'
      })
    }

    res.json({ preferences: user.preferences })
  } catch (error) {
    next(error)
  }
})

app.get('/api/account/favorites', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: 'favorites',
        match: { published: true, archived: { $ne: true } }
      })
      .select('favorites')

    if (!user) {
      return res.status(404).json({
        message: 'Account not found'
      })
    }

    res.json({ movies: user.favorites })
  } catch (error) {
    next(error)
  }
})

app.post('/api/account/favorites/:movieId', auth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.movieId)) {
      return res.status(400).json({
        message: 'Invalid movie'
      })
    }

    const movie = await Movie.findOne({
      _id: req.params.movieId,
      published: true,
      archived: { $ne: true }
    }).select('_id')

    if (!movie) {
      return res.status(404).json({
        message: 'Movie not found'
      })
    }

    await User.updateOne(
      { _id: req.user.id },
      { $addToSet: { favorites: movie._id } }
    )

    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.delete('/api/account/favorites/:movieId', auth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.movieId)) {
      return res.status(400).json({
        message: 'Invalid movie'
      })
    }

    await User.updateOne(
      { _id: req.user.id },
      { $pull: { favorites: req.params.movieId } }
    )

    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/home', async (_req, res, next) => {
  try {
    const [trending, recommended, theatres] =
      await Promise.all([
        Movie.find({
          published: true,
          trending: true,
          archived: { $ne: true }
        }).limit(5),

        Movie.find({
          published: true,
          archived: { $ne: true }
        })
          .sort({
            rating: -1
          })
          .limit(5),

        Theatre.find({ archived: { $ne: true } })
          .populate('city')
          .limit(4)
      ])

    res.json({
      trending,
      recommended,
      theatres
    })
  } catch (error) {
    next(error)
  }
})

// =====================================================
// EVENTS
// =====================================================

const eventBelongsToCity = (event, city) => {
  if (event.city) {
    return event.city.toString() === city._id.toString()
  }

  if (event.type === 'sports') {
    return String(event.title || '')
      .toLocaleLowerCase()
      .startsWith(`${city.name.toLocaleLowerCase()} `)
  }

  return true
}

app.get('/api/events', async (req, res, next) => {
  try {
    const pincode = String(req.query.pincode || '').trim()

    const type = String(req.query.type || '')
    const sport = String(req.query.sport || '').toLowerCase()
    const language = String(req.query.language || '')
    const genre = String(req.query.genre || '')
    const date = String(req.query.date || '')
    const minPrice = Number(req.query.minPrice)
    const maxPrice = Number(req.query.maxPrice)

    const query = String(
      req.query.q || ''
    ).trim()

    const limit = Math.min(
      Number(req.query.limit) || 12,
      30
    )

    if (
      (pincode && !/^\d{6}$/.test(pincode)) ||
      (req.query.date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) ||
      (req.query.minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) ||
      (req.query.maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) ||
      (req.query.minPrice !== undefined && req.query.maxPrice !== undefined && minPrice > maxPrice)
    ) {
      return res.status(400).json({ message: 'Choose a valid date and price range' })
    }

    if (!pincode) {
      return res.json({
        city: null,
        events: [],
        banner: null,
        message: 'Enter a pincode to find events near you'
      })
    }

    const venueFilter = { pincode, archived: { $ne: true } }
    if (type === 'sports') venueFilter.venueType = { $in: ['stadium', 'multiPurpose'] }
    if (type === 'movie' || type === 'comedy') venueFilter.venueType = { $ne: 'stadium' }
    const theatres = await Theatre.find(venueFilter)
      .populate('city', 'name')
    const catalogueTheatres = theatres.filter(theatre => theatre.venueType !== 'stadium')
    const cityDoc = theatres[0]?.city || null

    const theatreIds =
      theatres.map(
        theatre => theatre._id
      )

    if (!theatreIds.length) {
      return res.json({
        city: null,
        events: [],
        banner: null,
        message: 'No venues are registered for this pincode'
      })
    }

    const shows = theatreIds.length
      ? await Show.find({
          theatre: {
            $in: theatreIds
          },
          active: true,
          archived: { $ne: true },
          date: date
            ? date
            : {
                $gte: new Date()
                  .toISOString()
                  .slice(0, 10)
              },
          ...(Number.isFinite(minPrice) && req.query.minPrice !== undefined
            ? { basePrice: { $gte: minPrice } }
            : {}),
          ...(Number.isFinite(maxPrice) && req.query.maxPrice !== undefined
            ? { basePrice: { ...(Number.isFinite(minPrice) && req.query.minPrice !== undefined ? { $gte: minPrice } : {}), $lte: maxPrice } }
            : {})
        })
          .populate('movie')
          .populate('theatre')
          .populate('screen')
      : []

    const eventMap = new Map()
    const searchPattern = query
      ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : null

    shows.forEach(show => {
      const event = show.movie

      if (
        !event?.published ||
        event.archived ||
        (cityDoc && !eventBelongsToCity(event, cityDoc)) ||
        (type && event.type !== type) ||
        (sport && event.sport !== sport) ||
        (language && event.language !== language) ||
        (genre && !event.genre?.includes(genre))
      ) {
        return
      }

      const searchable = [
        event.title,
        event.genre?.join(' '),
        event.language,
        event.performer || '',
        event.homeTeam || '',
        event.awayTeam || '',
        show.theatre?.name || '',
        show.theatre?.address || ''
      ].join(' ')

      if (
        searchPattern &&
        !searchPattern.test(searchable)
      ) {
        return
      }

      const key =
        event._id.toString()

      const item =
        eventMap.get(key) || {
          ...event.toObject(),
          homeTeam: event.homeTeam,
          awayTeam: event.awayTeam,
          venue: show.theatre?.name,
          address: show.theatre?.address,
          city: cityDoc?.name || '',
          shows: [],
          startingPrice: show.basePrice,
          availableSeats: 0,
          hasUpcomingShows: true
        }

      item.shows.push({
        id: show._id,
        date: show.date,
        dateLabel: show.dateLabel,
        time: show.time,
        price: show.basePrice,
        availableSeats: Math.max(
          0,
          (show.screen?.capacity || 72) -
            (show.bookedSeats || []).length
        )
      })

      item.startingPrice =
        Math.min(
          item.startingPrice,
          show.basePrice
        )

      eventMap.set(key, item)
    })

    if (!date && ['movie', 'comedy'].includes(type || 'movie')) {
      const localCityIds = catalogueTheatres
        .map(theatre => theatre.city?._id)
        .filter(Boolean)
      const localCatalogueFilter = {
        published: true,
        archived: { $ne: true },
        status: { $in: ['comingSoon', 'nowShowing'] },
        type: type || { $in: ['movie', 'comedy'] }
      }
      if (localCityIds.length) {
        localCatalogueFilter.$or = [
          { city: { $in: localCityIds } },
          { city: null }
        ]
      } else {
        localCatalogueFilter.city = null
      }
      if (language) localCatalogueFilter.language = language
      if (genre) localCatalogueFilter.genre = genre

      const localCatalogueItems = await Movie.find(localCatalogueFilter).limit(limit)
      localCatalogueItems.forEach(event => {
        if (
          (cityDoc && !eventBelongsToCity(event, cityDoc)) ||
          (sport && event.sport !== sport)
        ) return

        const searchable = [
          event.title,
          event.language,
          event.performer || '',
          event.homeTeam || '',
          event.awayTeam || '',
          event.venueNote || '',
          catalogueTheatres.map(theatre => theatre.name || ''),
          catalogueTheatres.map(theatre => theatre.address || '')
        ].join(' ')
        if (searchPattern && !searchPattern.test(searchable)) return

        const key = event._id.toString()
        if (!eventMap.has(key)) {
          const localVenue = catalogueTheatres.length === 1 ? catalogueTheatres[0] : null
          eventMap.set(key, {
            ...event.toObject(),
            venue: localVenue?.name || 'Local cinemas',
            address: localVenue?.address || '',
            shows: [],
            startingPrice: 0,
            availableSeats: 0,
            hasUpcomingShows: false
          })
        }
      })
    }

    const events =
      [...eventMap.values()]
        .sort(
          (a, b) =>
            Number(b.trending) -
              Number(a.trending) ||
            (
              b.popularity ||
              b.rating ||
              0
            ) -
              (
                a.popularity ||
                a.rating ||
                0
              )
        )
        .slice(0, limit)

    res.json({
      city: cityDoc?.name || '',
      events,
      banner: events[0] || null
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/location/pincode', async (req, res, next) => {
  try {
    const pincode = String(req.query.pincode || '').trim()
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ message: 'Enter a valid 6-digit pincode' })
    }
    const venues = await Theatre.find({ pincode, archived: { $ne: true } })
      .select('name venueType address district state pincode city')
      .populate('city', 'name')
      .sort('name')
      .lean()
    res.json({
      pincode,
      venues,
      city: venues[0]?.city?.name || '',
      available: venues.length > 0
    })
  } catch (error) {
    next(error)
  }
})

// =====================================================
// NEARBY THEATRES
// =====================================================

app.get(
  '/api/theatres/nearby',
  async (req, res, next) => {
    try {
      const latitude =
        Number(req.query.latitude)

      const longitude =
        Number(req.query.longitude)

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return res.status(400).json({
          message:
            'A valid current location is required'
        })
      }

      const theatres =
        await Theatre.find({
          archived: { $ne: true },
          venueType: { $ne: 'stadium' },
          'coordinates.latitude': {
            $type: 'number',
            $gte: -90,
            $lte: 90
          },
          'coordinates.longitude': {
            $type: 'number',
            $gte: -180,
            $lte: 180
          }
        })
          .populate('city')
          .lean()

      const toRadians =
        value =>
          value * Math.PI / 180

      const distanceFrom =
        coordinates => {
          const earthRadiusKm =
            6371

          const latDelta =
            toRadians(
              coordinates.latitude -
                latitude
            )

          const lngDelta =
            toRadians(
              coordinates.longitude -
                longitude
            )

          const a =
            Math.sin(
              latDelta / 2
            ) ** 2 +
            Math.cos(
              toRadians(latitude)
            ) *
              Math.cos(
                toRadians(
                  coordinates.latitude
                )
              ) *
              Math.sin(
                lngDelta / 2
              ) ** 2

          return (
            earthRadiusKm *
            2 *
            Math.atan2(
              Math.sqrt(a),
              Math.sqrt(1 - a)
            )
          )
        }

      const theatreIds =
        theatres.map(
          theatre => theatre._id
        )

      const shows = theatreIds.length
        ? await Show.find({
            theatre: {
              $in: theatreIds
            },
            active: true,
            archived: { $ne: true },
            date: { $gte: new Date().toISOString().slice(0, 10) }
          })
              .populate({
                path: 'movie',
                select: 'title',
                match: { published: true, archived: { $ne: true } }
              })
              .lean()
        : []

      const halls =
        theatres
          .map(theatre => ({
            ...theatre,

            distanceKm:
              Number(
                distanceFrom(
                  theatre.coordinates
                ).toFixed(1)
              ),

            shows:
              shows
                .filter(
                  show =>
                    show.theatre.toString() ===
                    theatre._id.toString() &&
                    show.movie
                )
                .slice(0, 4)
                .map(
                  show => ({
                    movie:
                      show.movie?.title,
                    date:
                      show.date,
                    time:
                      show.time
                  })
                )
          }))
          .sort(
            (a, b) =>
              a.distanceKm -
              b.distanceKm
          )

      res.json({
        halls
      })
    } catch (error) {
      next(error)
    }
  }
)

// =====================================================
// MOVIES
// =====================================================

const getCatalogueFilters = async () => {
  const [genres, storedLanguages] = await Promise.all([
    Movie.distinct('genre', { published: true, archived: { $ne: true } }),
    Movie.distinct('language', { published: true, archived: { $ne: true } })
  ])
  const languages = storedLanguages
    .filter((language) => typeof language === 'string' && language.trim())
    .sort((left, right) => left.localeCompare(right))
  return { genres, languages }
}

app.get(
  '/api/movies',
  async (req, res, next) => {
    try {
      const filter = { published: true, archived: { $ne: true } }
      const pincode = String(req.query.pincode || '').trim()
      if (pincode && !/^\d{6}$/.test(pincode)) {
        return res.status(400).json({ message: 'Enter a valid 6-digit pincode' })
      }

      if (!pincode) {
        return res.json({ movies: [], filters: await getCatalogueFilters(), message: 'Enter a pincode to find movies near you' })
      }

      if (req.query.search) {
        const searchPattern = new RegExp(
          String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i'
        )
        filter.$or = [
          { title: searchPattern },
          { genre: searchPattern },
          { language: searchPattern },
          { performer: searchPattern },
          { homeTeam: searchPattern },
          { awayTeam: searchPattern },
          { venueNote: searchPattern }
        ]
      }

      if (req.query.genre) {
        filter.genre =
          req.query.genre
      }

      if (req.query.language) {
        filter.language =
          req.query.language
      }

      if (req.query.type && ['movie', 'sports', 'comedy'].includes(String(req.query.type))) {
        filter.type = String(req.query.type)
      }

      const localTheatres = await Theatre.find({
        pincode,
        archived: { $ne: true },
        venueType: { $ne: 'stadium' }
      }).select('_id name address city').lean()
      const theatreIds = localTheatres.map(theatre => theatre._id)
      const localCityIds = [...new Map(
        localTheatres
          .filter(theatre => theatre.city)
          .map(theatre => [theatre.city.toString(), theatre.city])
      ).values()]
      const movieIds = theatreIds.length
        ? await Show.find({
            theatre: { $in: theatreIds },
            active: true,
            archived: { $ne: true },
            date: { $gte: new Date().toISOString().slice(0, 10) }
          }).distinct('movie')
        : []
      const movieIdsWithShows = new Set(movieIds.map(movieId => movieId.toString()))
      const localCatalogueType = req.query.type && ['movie', 'comedy'].includes(String(req.query.type))
        ? String(req.query.type)
        : { $in: ['movie', 'comedy'] }
      const localCatalogueFilter = {
        status: { $in: ['comingSoon', 'nowShowing'] },
        type: localCatalogueType,
        ...(localCityIds.length
          ? { $or: [{ city: { $in: localCityIds } }, { city: null }] }
          : { city: null })
      }
      filter.$and = [{
        $or: [
          { _id: { $in: movieIds } },
          localCatalogueFilter
        ]
      }]

      const sort =
        req.query.sort === 'rating'
          ? { rating: -1 }
          : req.query.sort === 'newest'
            ? {
                releaseDate: -1
              }
            : {
                trending: -1,
                rating: -1
              }

      const movies =
        await Movie.find(filter)
          .sort(sort)
      const visibleMovies = movies.map(movie => {
        const item = movie.toObject()
        item.hasUpcomingShows = movieIdsWithShows.has(item._id.toString())
        if (!item.hasUpcomingShows) {
          const localVenue = localTheatres.length === 1 ? localTheatres[0] : null
          item.venue = localVenue?.name || 'Local cinemas'
          item.address = localVenue?.address || ''
        }
        return item
      })

      res.json({
        movies: visibleMovies,
        filters: await getCatalogueFilters()
      })
    } catch (error) {
      next(error)
    }
  }
)

app.get(
  '/api/movies/:id',
  async (req, res, next) => {
    try {
      const movie =
        await Movie.findById(
          req.params.id
        )

      if (!movie?.published || movie.archived) {
        return res.status(404).json({
          message:
            'Movie not found'
        })
      }

      const showFilter = {
        movie: movie._id,
        active: true,
        archived: { $ne: true },
        date: {
          $gte: new Date().toISOString().slice(0, 10)
        }
      }

      const pincode = String(req.query.pincode || '').trim()
      if (!/^\d{6}$/.test(pincode)) {
        return res.json({ movie, dates: [], theatres: [] })
      }
      const pinTheatres = await Theatre.find({
        pincode,
        archived: { $ne: true },
        venueType: movie.type === 'sports'
          ? { $in: ['stadium', 'multiPurpose'] }
          : { $ne: 'stadium' }
      }).sort('name')
      showFilter.theatre = { $in: pinTheatres.map(theatre => theatre._id) }

      const shows =
        await Show.find(showFilter)
          .sort({ date: 1, time: 1 })
          .populate('theatre')
          .populate('screen')

      const dates =
        [
          ...new Map(
            shows.map(
              show => [
                show.date,
                {
                  value:
                    show.date,
                  label:
                    show.dateLabel?.split(
                      ' '
                    )[0],
                  day:
                    show.dateLabel?.split(
                      ' '
                    )[1]
                }
              ]
            )
          ).values()
        ]

      const theatresById = new Map(
        pinTheatres.map(theatre => [
          theatre._id.toString(),
          { ...theatre.toObject(), shows: [] }
        ])
      )
      shows.forEach(show => {
        const theatre = show.theatre
        if (!theatre) return
        theatresById.get(theatre._id.toString())?.shows.push(show)
      })

      res.json({
        movie,
        dates,
        theatres: [...theatresById.values()]
      })
    } catch (error) {
      next(error)
    }
  }
)

// =====================================================
// SEATS
// =====================================================

app.get(
  '/api/shows/:id/seats',
  async (req, res, next) => {
    try {
      const show =
        await Show.findOne({
          _id: req.params.id,
          archived: { $ne: true }
        })
          .populate('movie')
          .populate('theatre')
          .populate('screen')

      if (
        !show ||
        !show.active ||
        !show.movie?.published ||
        show.movie.archived ||
        show.theatre?.archived ||
        show.screen?.archived
      ) {
        return res.status(404).json({
          message:
            'Show not found'
        })
      }

      const now = new Date()

      // Remove expired temporary locks.
      show.lockedSeats =
        (
          show.lockedSeats || []
        ).filter(
          seat =>
            seat.expiresAt &&
            seat.expiresAt > now
        )

      await show.save()

      const booked =
        new Set(
          show.bookedSeats || []
        )

      const locked =
        new Set(
          (
            show.lockedSeats ||
            []
          ).map(
            seat =>
              seat.seat
          )
        )

      const seats =
        show.screen.seats.map(
          seat => {
            let status =
              'available'

            if (
              booked.has(
                seat.label
              )
            ) {
              status = 'booked'
            } else if (
              locked.has(
                seat.label
              )
            ) {
              status = 'locked'
            }

            return {
              ...seat.toObject(),
              status
            }
          }
        )

      res.json({
        show,
        seats
      })
    } catch (error) {
      next(error)
    }
  }
)

// =====================================================
// BOOKINGS
// =====================================================

app.get(
  '/api/bookings',
  auth,
  async (req, res, next) => {
    try {
      const bookings =
        await Booking.find({
          user: req.user.id
        })
          .populate({
            path: 'show',
            populate: [
              {
                path: 'movie'
              },
              {
                path: 'theatre',
                populate: {
                  path: 'city'
                }
              },
              {
                path: 'screen'
              }
            ]
          })
          .sort('-createdAt')

      res.json(
        bookings.map(
          booking => ({
            ...booking.toObject(),

            movie:
              booking.show?.movie,

            theatre:
              booking.show?.theatre,

            showtime:
              booking.show?.time,

            dateLabel:
              booking.show?.dateLabel
          })
        )
      )
    } catch (error) {
      next(error)
    }
  }
)

// =====================================================
// ADMIN
// =====================================================

app.get(
  '/api/admin/stats',
  auth,
  adminOnly,
  async (_req, res, next) => {
    try {
      const start =
        new Date()

      start.setHours(
        0,
        0,
        0,
        0
      )

      const revenue =
        (
          await Booking.aggregate([
            {
              $match: {
                createdAt: {
                  $gte: start
                }
              }
            },
            {
              $group: {
                _id: null,
                total: {
                  $sum:
                    '$totalAmount'
                }
              }
            }
          ])
        )[0]?.total || 0

      res.json({
        movies:
          await Movie.countDocuments({
            published: true,
            archived: { $ne: true }
          }),

        bookings:
          await Booking.countDocuments({
            createdAt: {
              $gte: start
            }
          }),

        users:
          await User.countDocuments(),

        revenue,

        recentMovies:
          await Movie.find({ published: true, archived: { $ne: true } })
            .sort('-createdAt')
            .limit(6)
      })
    } catch (error) {
      next(error)
    }
  }
)

app.post(
  '/api/admin/movies',
  auth,
  adminOnly,
  async (req, res, next) => {
    try {
      const updates = movieUpdatesFrom(req.body)
      const title = String(updates.title || '').trim()
      const type = updates.type || 'movie'
      if (!title || !['movie', 'sports', 'comedy'].includes(type)) {
        return res.status(400).json({ message: 'A title and supported content type are required' })
      }

      if (updates.city && !await City.exists({ _id: updates.city })) {
        return res.status(400).json({ message: 'Choose an existing event city' })
      }

      if (type === 'sports' && (!updates.city || !updates.sport)) {
        return res.status(400).json({ message: 'Choose a city and sport category for this event' })
      }

      const movie = await Movie.create({
        ...updates,
        title,
        type,
        published: updates.published !== false,
        status: updates.status || 'nowShowing'
      })

      res.status(201).json(
        movie
      )
    } catch (error) {
      next(error)
    }
  }
)

app.get('/api/admin/portal', auth, adminOnly, async (req, res, next) => {
  try {
    const [movies, cities, theatres, screens, bookings, users, payments, banners, stats, publishedMovies, upcomingShows, userCount, pendingPaymentCount, sportsEvents, stadiums, activeMovies, confirmedBookings, cancelledBookings] =
      await Promise.all([
        Movie.find({ archived: { $ne: true } }).populate('city', 'name').sort('-createdAt').limit(500).lean(),
        City.find().sort('name').lean(),
        Theatre.find({ archived: { $ne: true } }).populate('city', 'name').sort('name').lean(),
        Screen.find({ archived: { $ne: true } }).select('-seats').populate('theatre', 'name').sort('name').lean(),
        Booking.find()
          .sort('-createdAt')
          .limit(100)
          .populate('user', 'name email phone')
          .populate({
            path: 'show',
            populate: [
              { path: 'movie', select: 'title' },
              { path: 'theatre', select: 'name' },
              { path: 'screen', select: 'name' }
            ]
          })
          .lean(),
        User.find()
          .select('name email phone role isActive createdAt')
          .sort('-createdAt')
          .limit(100)
          .lean(),
        PaymentAttempt.find()
          .select('txnid provider status amount bookingId createdAt user show')
          .sort('-createdAt')
          .limit(100)
          .populate('user', 'name email')
          .populate({
            path: 'show',
            populate: [
              { path: 'movie', select: 'title' },
              { path: 'theatre', select: 'name' }
            ]
          })
          .lean(),
        Banner.find().populate('city', 'name').sort({ order: 1, createdAt: -1 }).lean(),
        Booking.aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: {
                  $cond: [
                    { $eq: ['$status', 'confirmed'] },
                    { $ifNull: ['$totalAmount', 0] },
                    0
                  ]
                }
              },
              count: { $sum: 1 }
            }
          }
        ]),
        Movie.countDocuments({ published: true, archived: { $ne: true } }),
        Show.countDocuments({
          active: true,
          archived: { $ne: true },
          date: { $gte: new Date().toISOString().slice(0, 10) }
        }),
        User.countDocuments(),
        PaymentAttempt.countDocuments({ status: 'pending' }),
        Movie.countDocuments({ type: 'sports', published: true, archived: { $ne: true } }),
        Theatre.countDocuments({ venueType: 'stadium', archived: { $ne: true } }),
        Movie.countDocuments({ type: 'movie', published: true, status: 'nowShowing', archived: { $ne: true } }),
        Booking.countDocuments({ status: 'confirmed' }),
        Booking.countDocuments({ status: 'cancelled' })
      ])

    res.json({
      movies,
      cities,
      theatres,
      screens,
      bookings,
      users,
      payments,
      banners,
      currentAdminId: String(req.user.id),
      currentRole: (await User.findById(req.user.id).select('role').lean())?.role,
      stats: {
        movies: publishedMovies,
        activeMovies,
        sportsEvents,
        cities: cities.length,
        theatres: theatres.filter((theatre) => theatre.venueType !== 'stadium').length,
        stadiums,
        shows: upcomingShows,
        bookings: stats[0]?.count || 0,
        confirmedBookings,
        cancelledBookings,
        revenue: stats[0]?.totalRevenue || 0,
        users: userCount,
        pendingPayments: pendingPaymentCount
      }
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/analytics', auth, adminOnly, async (req, res, next) => {
  try {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    const from = String(req.query.from || '')
    const to = String(req.query.to || '')
    const start = datePattern.test(from) ? new Date(`${from}T00:00:00.000Z`) : new Date(Date.now() - 29 * 86400000)
    const endDate = datePattern.test(to) ? new Date(`${to}T00:00:00.000Z`) : new Date()
    const end = new Date(endDate.getTime() + 86400000)

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      start > endDate
    ) {
      return res.status(400).json({ message: 'Choose a valid date range' })
    }

    const bookingMatch = { createdAt: { $gte: start, $lt: end } }
    const [daily, popular, statuses, totals] = await Promise.all([
      Booking.aggregate([
        { $match: bookingMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            bookings: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'confirmed'] },
                  { $ifNull: ['$totalAmount', 0] },
                  0
                ]
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Booking.aggregate([
        { $match: bookingMatch },
        {
          $group: {
            _id: '$show',
            bookings: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'confirmed'] },
                  { $ifNull: ['$totalAmount', 0] },
                  0
                ]
              }
            }
          }
        },
        { $lookup: { from: Show.collection.name, localField: '_id', foreignField: '_id', as: 'show' } },
        { $unwind: '$show' },
        { $lookup: { from: Movie.collection.name, localField: 'show.movie', foreignField: '_id', as: 'movie' } },
        { $unwind: '$movie' },
        {
          $project: {
            _id: 0,
            title: '$movie.title',
            type: '$movie.type',
            bookings: 1,
            revenue: 1
          }
        },
        { $sort: { bookings: -1, revenue: -1 } },
        { $limit: 10 }
      ]),
      Booking.aggregate([
        { $match: bookingMatch },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Booking.aggregate([
        { $match: bookingMatch },
        {
          $group: {
            _id: null,
            bookings: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'confirmed'] },
                  { $ifNull: ['$totalAmount', 0] },
                  0
                ]
              }
            },
            customers: { $addToSet: '$user' }
          }
        },
        { $project: { _id: 0, bookings: 1, revenue: 1, customers: { $size: '$customers' } } }
      ])
    ])

    res.json({
      from: start.toISOString().slice(0, 10),
      to: endDate.toISOString().slice(0, 10),
      totals: totals[0] || { bookings: 0, revenue: 0, customers: 0 },
      daily,
      popular,
      statuses
    })
  } catch (error) {
    next(error)
  }
})

const validBannerTarget = value =>
  typeof value === 'string' &&
  (value.startsWith('/') && !value.startsWith('//') || /^https:\/\//i.test(value))

const bannerFieldsFrom = body => ({
  order: body.order === undefined ? 0 : Number(body.order),
  active: body.active === undefined ? true : body.active === true || body.active === 'true',
  ...(body.title !== undefined ? { title: String(body.title).trim() } : {}),
  ...(body.description !== undefined ? { description: String(body.description).trim() } : {}),
  ...(body.imageUrl !== undefined ? { imageUrl: String(body.imageUrl).trim() } : {}),
  ...(body.targetUrl !== undefined ? { targetUrl: String(body.targetUrl).trim() } : {}),
  ...(body.city !== undefined ? { city: body.city || null } : {}),
  ...(body.startsAt !== undefined ? { startsAt: body.startsAt ? new Date(body.startsAt) : null } : {}),
  ...(body.endsAt !== undefined ? { endsAt: body.endsAt ? new Date(body.endsAt) : null } : {})
})

const validateBanner = async (fields, current = null) => {
  const merged = { ...current, ...fields }
  if (!merged.title || merged.title.length > 120 || !merged.imageUrl || !validBannerTarget(merged.targetUrl)) {
    return 'Banner title, image, and a safe destination link are required'
  }
  if (!/^https:\/\//i.test(merged.imageUrl) && !/^\/uploads\/[a-f0-9-]+\.(png|jpe?g|webp|gif)$/i.test(merged.imageUrl)) {
    return 'Choose a secure image URL or upload an image first'
  }
  if (merged.city && (!mongoose.isValidObjectId(merged.city) || !await City.exists({ _id: merged.city }))) {
    return 'Choose an existing banner city'
  }
  if (!Number.isInteger(merged.order) || merged.order < 0 || merged.order > 10000) {
    return 'Banner display order must be a whole number from 0 to 10000'
  }
  if (
    (merged.startsAt && Number.isNaN(new Date(merged.startsAt).getTime())) ||
    (merged.endsAt && Number.isNaN(new Date(merged.endsAt).getTime())) ||
    (merged.startsAt && merged.endsAt && new Date(merged.endsAt) <= new Date(merged.startsAt))
  ) {
    return 'Choose a valid banner schedule with an end time after its start'
  }
  return ''
}

app.post('/api/admin/uploads', auth, adminOnly, async (req, res, next) => {
  try {
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(req.body.data || ''))
    if (!match) {
      return res.status(400).json({ message: 'Upload a PNG, JPEG, WebP, or GIF image' })
    }

    const mimeType = match[1]
    const buffer = Buffer.from(match[2], 'base64')
    if (!buffer.length || buffer.length > 4 * 1024 * 1024) {
      return res.status(413).json({ message: 'Images must be smaller than 4 MB' })
    }

    const signatures = {
      'image/png': buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      'image/jpeg': buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255,
      'image/gif': buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii')),
      'image/webp': buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    }
    if (!signatures[mimeType]) {
      return res.status(400).json({ message: 'Image file contents do not match the selected image format' })
    }

    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[mimeType]
    const filename = `${crypto.randomUUID()}.${extension}`
    await writeFile(path.join(uploadDirectory, filename), buffer, { flag: 'wx' })
    res.status(201).json({ url: `/uploads/${filename}` })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/admin/uploads/:filename', auth, adminOnly, async (req, res, next) => {
  try {
    const filename = req.params.filename
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/i.test(filename)) {
      return res.status(400).json({ message: 'Invalid uploaded image' })
    }

    const url = `/uploads/${filename}`
    if (
      await Movie.exists({ $or: [{ posterUrl: url }, { bannerUrl: url }] }) ||
      await Banner.exists({ imageUrl: url })
    ) {
      return res.status(409).json({ message: 'This image is in use. Replace or remove its content before deleting it.' })
    }

    try {
      await unlink(path.join(uploadDirectory, filename))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      return res.status(404).json({ message: 'Uploaded image not found' })
    }
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/banners', auth, adminOnly, async (req, res, next) => {
  try {
    const fields = bannerFieldsFrom(req.body)
    const issue = await validateBanner(fields)
    if (issue) return res.status(400).json({ message: issue })
    const banner = await Banner.create(fields)
    res.status(201).json(await banner.populate('city', 'name'))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/banners/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid banner' })
    }
    const banner = await Banner.findById(req.params.id)
    if (!banner) return res.status(404).json({ message: 'Banner not found' })
    const fields = bannerFieldsFrom(req.body)
    const issue = await validateBanner(fields, banner.toObject())
    if (issue) return res.status(400).json({ message: issue })
    Object.assign(banner, fields)
    await banner.save()
    res.json(await banner.populate('city', 'name'))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/admin/banners/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid banner' })
    }
    const banner = await Banner.findByIdAndDelete(req.params.id)
    if (!banner) return res.status(404).json({ message: 'Banner not found' })
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/users/:id/role', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user id' })
    }

    const role = String(req.body.role || '')
    const actingManager = await User.findById(req.user.id).select('role').lean()
    const permittedRoles = actingManager?.role === 'superadmin'
      ? ['user', 'manager', 'admin', 'superadmin']
      : ['user', 'manager']
    if (!permittedRoles.includes(role)) {
      return res.status(403).json({ message: 'You do not have permission to assign this role' })
    }

    if (String(req.user.id) === req.params.id) {
      return res.status(400).json({ message: 'You cannot change your own manager role' })
    }

    if (
      ['admin', 'superadmin'].includes(actingManager?.role) &&
      ['admin', 'superadmin'].includes((await User.findById(req.params.id).select('role').lean())?.role) &&
      !['admin', 'superadmin'].includes(role) &&
      await User.countDocuments({ role: { $in: ['admin', 'superadmin'] } }) <= 1
    ) {
      return res.status(409).json({ message: 'The last administrator cannot be demoted' })
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { role } },
      { new: true, runValidators: true }
    ).select('name email phone role createdAt')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({ user })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/users/:id/status', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || typeof req.body.isActive !== 'boolean') {
      return res.status(400).json({ message: 'A valid user id and account status are required' })
    }
    if (String(req.user.id) === req.params.id && req.body.isActive === false) {
      return res.status(400).json({ message: 'You cannot deactivate your own account' })
    }

    const user = await User.findById(req.params.id).select('name email phone role isActive createdAt')
    if (!user) return res.status(404).json({ message: 'User not found' })
    if (
      req.body.isActive === false &&
      ['admin', 'superadmin'].includes(user.role) &&
      await User.countDocuments({ role: { $in: ['admin', 'superadmin'] }, isActive: true }) <= 1
    ) {
      return res.status(409).json({ message: 'The last active administrator cannot be deactivated' })
    }

    user.isActive = req.body.isActive
    await user.save()
    res.json({ user })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/managers', auth, adminAccountOnly, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim()
    const email = String(req.body.email || '').trim().toLowerCase()
    const password = String(req.body.password || '')
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10) {
      return res.status(400).json({ message: 'Enter a name, valid email and password of at least 10 characters' })
    }

    const user = await User.create({
      name,
      email,
      phone: String(req.body.phone || '').trim(),
      passwordHash: await bcrypt.hash(password, 12),
      role: 'manager'
    })
    res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    })
  } catch (error) {
    next(error)
  }
})

const editableMovieFields = [
  'title',
  'type',
  'sport',
  'status',
  'city',
  'posterUrl',
  'trailerUrl',
  'bannerUrl',
  'language',
  'genre',
  'duration',
  'rating',
  'popularity',
  'performer',
  'homeTeam',
  'awayTeam',
  'tournament',
  'venueNote',
  'releaseDate',
  'ticketSalesStart',
  'ticketSalesEnd',
  'description',
  'cast',
  'crew',
  'published',
  'trending'
]

const movieUpdatesFrom = body =>
  Object.fromEntries(
    editableMovieFields
      .filter(field => body[field] !== undefined)
      .map(field => {
        const value = body[field]
        if (['city', 'sport'].includes(field) && typeof value === 'string' && !value.trim()) {
          return [field, null]
        }
        if (['genre', 'cast', 'crew'].includes(field)) {
          return [
            field,
            Array.isArray(value)
              ? value
              : String(value).split(',').map(item => item.trim()).filter(Boolean)
          ]
        }
        if (['duration', 'rating', 'popularity'].includes(field)) {
          return [field, Number(value)]
        }
        if (['releaseDate', 'ticketSalesStart', 'ticketSalesEnd'].includes(field)) {
          return [field, value ? new Date(value) : null]
        }
        return [field, value]
      })
  )

app.get('/api/admin/movies', auth, adminOnly, async (_req, res, next) => {
  try {
    res.json(await Movie.find({ archived: { $ne: true } }).sort('-createdAt').limit(500))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/movies/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid movie' })
    }

    const existing = await Movie.findOne({ _id: req.params.id, archived: { $ne: true } })
    if (!existing) return res.status(404).json({ message: 'Movie not found' })

    const updates = movieUpdatesFrom(req.body)
    if (updates.city && !await City.exists({ _id: updates.city })) {
      return res.status(400).json({ message: 'Choose an existing event city' })
    }

    const finalType = updates.type || existing.type
    const finalCity = Object.hasOwn(updates, 'city') ? updates.city : existing.city
    const finalSport = Object.hasOwn(updates, 'sport') ? updates.sport : existing.sport
    if (finalType === 'sports' && (!finalCity || !finalSport)) {
      return res.status(400).json({ message: 'Choose a city and sport category for this event' })
    }

    const movie = Object.assign(existing, updates)
    await movie.save()
    res.json(movie)
  } catch (error) {
    next(error)
  }
})

app.delete('/api/admin/movies/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid movie' })
    }
    if (await Show.exists({ movie: req.params.id })) {
      return res.status(409).json({
        message: 'A movie with show history cannot be deleted. Unpublish it instead.'
      })
    }

    const movie = await Movie.findByIdAndDelete(req.params.id)
    if (!movie) return res.status(404).json({ message: 'Movie not found' })
    await User.updateMany({}, { $pull: { favorites: movie._id } })
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/cities', auth, adminOnly, async (_req, res, next) => {
  try {
    res.json(await City.find().sort('name'))
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/cities', auth, adminOnly, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim()
    if (!name) return res.status(400).json({ message: 'City name is required' })
    res.status(201).json(await City.create({
      name,
      state: String(req.body.state || '').trim()
    }))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/cities/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid city' })
    }
    const existing = await City.findById(req.params.id)
    if (!existing) return res.status(404).json({ message: 'City not found' })
    const previousName = existing.name
    const updates = {}
    if (req.body.name !== undefined) updates.name = String(req.body.name).trim()
    if (req.body.state !== undefined) updates.state = String(req.body.state).trim()
    if (updates.name === '') return res.status(400).json({ message: 'City name is required' })

    const city = Object.assign(existing, updates)
    await city.save()
    if (updates.name && updates.name !== previousName) {
      await User.updateMany(
        { 'preferences.city': previousName },
        { $set: { 'preferences.city': updates.name } }
      )
    }
    res.json(city)
  } catch (error) {
    next(error)
  }
})

app.delete('/api/admin/cities/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid city' })
    }
    if (await Theatre.exists({ city: req.params.id })) {
      return res.status(409).json({ message: 'Move or remove this city’s theatres before deleting it' })
    }
    const city = await City.findByIdAndDelete(req.params.id)
    if (!city) return res.status(404).json({ message: 'City not found' })
    const fallbackCity = await City.findOne().sort('name')
    if (fallbackCity) {
      await User.updateMany(
        { 'preferences.city': city.name },
        { $set: { 'preferences.city': fallbackCity.name } }
      )
    } else {
      await User.updateMany(
        { 'preferences.city': city.name },
        { $unset: { 'preferences.city': 1 } }
      )
    }
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/theatres', auth, adminOnly, async (_req, res, next) => {
  try {
    res.json(await Theatre.find({ archived: { $ne: true } }).populate('city', 'name').sort('name'))
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/theatres', auth, adminOnly, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim()
    const cityValue = String(req.body.city || '').trim()
    if (!name || !cityValue) return res.status(400).json({ message: 'Venue name and city are required' })
    if (!/^\d{6}$/.test(String(req.body.pincode || ''))) {
      return res.status(400).json({ message: 'Enter a valid 6-digit pincode' })
    }
    const theatreData = {
      name,
      venueType: ['cinema', 'stadium', 'multiPurpose'].includes(req.body.venueType)
        ? req.body.venueType
        : 'cinema',
      city: null,
      address: String(req.body.address || '').trim(),
      district: String(req.body.district || '').trim(),
      state: String(req.body.state || '').trim(),
      pincode: String(req.body.pincode || '').trim(),
      formats: Array.isArray(req.body.formats)
        ? req.body.formats
        : String(req.body.formats || '').split(',').map(value => value.trim()).filter(Boolean)
    }
    const hasLatitude = String(req.body.latitude ?? '').trim() !== ''
    const hasLongitude = String(req.body.longitude ?? '').trim() !== ''
    if (hasLatitude !== hasLongitude) {
      return res.status(400).json({ message: 'Enter both latitude and longitude coordinates' })
    }
    if (hasLatitude) {
      const latitude = Number(req.body.latitude)
      const longitude = Number(req.body.longitude)
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return res.status(400).json({ message: 'Enter valid latitude and longitude coordinates' })
      }
      theatreData.coordinates = { latitude, longitude }
    }
    let city
    if (mongoose.isValidObjectId(cityValue)) {
      city = await City.findById(cityValue)
      if (!city) return res.status(400).json({ message: 'Choose a valid city' })
    } else {
      const cityPattern = new RegExp(`^${cityValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      city = await City.findOne({ name: cityPattern })
      if (!city) city = await City.create({ name: cityValue, state: theatreData.state })
    }
    theatreData.city = city._id
    const theatre = await Theatre.create(theatreData)
    res.status(201).json(await theatre.populate('city', 'name'))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/theatres/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid theatre' })
    }
    const currentTheatre = await Theatre.findOne({ _id: req.params.id, archived: { $ne: true } })
    if (!currentTheatre) return res.status(404).json({ message: 'Theatre not found' })
    const updates = {}
    for (const field of ['name', 'address', 'district', 'state', 'pincode']) {
      if (req.body[field] !== undefined) updates[field] = String(req.body[field]).trim()
    }
    if (req.body.pincode !== undefined && !/^\d{6}$/.test(updates.pincode || '')) {
      return res.status(400).json({ message: 'Enter a valid 6-digit pincode' })
    }
    if (req.body.venueType !== undefined) {
      if (!['cinema', 'stadium', 'multiPurpose'].includes(req.body.venueType)) {
        return res.status(400).json({ message: 'Choose a supported venue type' })
      }
      if (req.body.venueType !== currentTheatre.venueType && await Show.exists({ theatre: currentTheatre._id })) {
        return res.status(409).json({ message: 'Venue type cannot change after shows are scheduled at this venue' })
      }
      updates.venueType = req.body.venueType
    }
    if (req.body.city !== undefined) {
      const cityValue = String(req.body.city || '').trim()
      if (!cityValue) return res.status(400).json({ message: 'Venue city is required' })
      let city
      if (mongoose.isValidObjectId(cityValue)) {
        city = await City.findById(cityValue)
        if (!city) return res.status(400).json({ message: 'Choose a valid city' })
      } else {
        const cityPattern = new RegExp(`^${cityValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        city = await City.findOne({ name: cityPattern })
      }
      if ((!city || String(city._id) !== String(currentTheatre.city || '')) && await Show.exists({ theatre: currentTheatre._id })) {
        return res.status(409).json({ message: 'Venue city cannot change after shows are scheduled at this venue' })
      }
      if (!city) city = await City.create({ name: cityValue, state: updates.state || currentTheatre.state || '' })
      updates.city = city._id
    }
    if (req.body.formats !== undefined) {
      updates.formats = Array.isArray(req.body.formats)
        ? req.body.formats
        : String(req.body.formats).split(',').map(value => value.trim()).filter(Boolean)
    }
    const hasLatitude = String(req.body.latitude ?? '').trim() !== ''
    const hasLongitude = String(req.body.longitude ?? '').trim() !== ''
    if (hasLatitude !== hasLongitude) {
      return res.status(400).json({ message: 'Enter both latitude and longitude coordinates' })
    }
    if (hasLatitude) {
      const latitude = Number(req.body.latitude)
      const longitude = Number(req.body.longitude)
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return res.status(400).json({ message: 'Enter valid latitude and longitude coordinates' })
      }
      updates.coordinates = { latitude, longitude }
    }
    const theatre = await Theatre.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('city', 'name')
    if (!theatre) return res.status(404).json({ message: 'Theatre not found' })
    res.json(theatre)
  } catch (error) {
    next(error)
  }
})

app.delete('/api/admin/theatres/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid theatre' })
    }
    if (await Show.exists({ theatre: req.params.id }) || await Screen.exists({ theatre: req.params.id })) {
      return res.status(409).json({ message: 'Remove this theatre’s shows and screens before deleting it' })
    }
    const theatre = await Theatre.findByIdAndDelete(req.params.id)
    if (!theatre) return res.status(404).json({ message: 'Theatre not found' })
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

const makeSeatLayout = (capacity, prices = {}) =>
  Array.from({ length: capacity }, (_, index) => {
    const rowIndex = Math.floor(index / 12)
    const row = String.fromCharCode(65 + rowIndex)
    const category = rowIndex < 2 ? 'premium' : rowIndex === 2 ? 'comfort' : 'standard'
    return {
      label: `${row}${(index % 12) + 1}`,
      row,
      number: (index % 12) + 1,
      category,
      price: Number(prices[category]) || (category === 'premium' ? 320 : category === 'comfort' ? 240 : 180)
    }
  })

const normalizeSeatPrices = (values = {}) => {
  const prices = {
    premium: Number(values.premium ?? 320),
    comfort: Number(values.comfort ?? 240),
    standard: Number(values.standard ?? 180)
  }
  return Object.values(prices).every((price) => Number.isFinite(price) && price >= 1 && price <= 100000)
    ? prices
    : null
}

app.get('/api/admin/screens', auth, adminOnly, async (_req, res, next) => {
  try {
    res.json(await Screen.find({ archived: { $ne: true } }).select('-seats').populate('theatre', 'name venueType').sort('name'))
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/screens', auth, adminOnly, async (req, res, next) => {
  try {
    const capacity = Number(req.body.capacity || 72)
    if (!String(req.body.name || '').trim() || !mongoose.isValidObjectId(req.body.theatre)) {
      return res.status(400).json({ message: 'Screen name and theatre are required' })
    }
    if (!Number.isInteger(capacity) || capacity < 12 || capacity > 300) {
      return res.status(400).json({ message: 'Screen capacity must be between 12 and 300' })
    }
    if (!await Theatre.exists({ _id: req.body.theatre })) {
      return res.status(400).json({ message: 'Choose an existing theatre' })
    }
    const seatPrices = normalizeSeatPrices(req.body.seatPrices)
    if (!seatPrices) {
      return res.status(400).json({ message: 'Seat prices must be between ₹1 and ₹100,000' })
    }
    const screen = await Screen.create({
      name: String(req.body.name).trim(),
      theatre: req.body.theatre,
      capacity,
      seatPrices,
      seats: makeSeatLayout(capacity, seatPrices)
    })
    res.status(201).json(await screen.populate('theatre', 'name'))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/screens/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid screen' })
    }
    const screen = await Screen.findOne({ _id: req.params.id, archived: { $ne: true } })
    if (!screen) return res.status(404).json({ message: 'Screen not found' })
    if (req.body.name !== undefined) screen.name = String(req.body.name).trim()
    if (req.body.theatre !== undefined && req.body.theatre !== screen.theatre.toString()) {
      if (!mongoose.isValidObjectId(req.body.theatre) ||
          !await Theatre.exists({ _id: req.body.theatre })) {
        return res.status(400).json({ message: 'Choose an existing theatre' })
      }
      if (await Show.exists({ screen: screen._id })) {
        return res.status(409).json({ message: 'A screen with scheduled shows cannot move to another theatre' })
      }
      screen.theatre = req.body.theatre
    }
    if (req.body.capacity !== undefined) {
      const capacity = Number(req.body.capacity)
      if (!Number.isInteger(capacity) || capacity < 12 || capacity > 300) {
        return res.status(400).json({ message: 'Screen capacity must be between 12 and 300' })
      }
      if (capacity !== screen.capacity && await Show.exists({ screen: screen._id })) {
        return res.status(409).json({ message: 'Capacity cannot change after shows are scheduled on this screen' })
      }
      screen.capacity = capacity
    }
    if (req.body.seatPrices !== undefined) {
      const seatPrices = normalizeSeatPrices(req.body.seatPrices)
      if (!seatPrices) {
        return res.status(400).json({ message: 'Seat prices must be between ₹1 and ₹100,000' })
      }
      if (await Show.exists({ screen: screen._id })) {
        return res.status(409).json({ message: 'Seat pricing cannot change after shows are scheduled on this screen' })
      }
      screen.seatPrices = seatPrices
    }
    if (req.body.capacity !== undefined || req.body.seatPrices !== undefined) {
      screen.seats = makeSeatLayout(screen.capacity, screen.seatPrices?.toObject?.() || screen.seatPrices)
    }
    await screen.save()
    res.json(await screen.populate('theatre', 'name'))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/admin/screens/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid screen' })
    }
    if (await Show.exists({ screen: req.params.id })) {
      return res.status(409).json({ message: 'Remove this screen’s shows before deleting it' })
    }
    const screen = await Screen.findByIdAndDelete(req.params.id)
    if (!screen) return res.status(404).json({ message: 'Screen not found' })
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

const parseShowTime = (value) => {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(value || '').trim())
  if (!match) return null

  let hours = Number(match[1])
  const minutes = Number(match[2])
  const meridiem = match[3]?.toUpperCase()
  if (minutes > 59 || hours > (meridiem ? 12 : 23) || (meridiem && hours < 1)) return null
  if (meridiem) hours = (hours % 12) + (meridiem === 'PM' ? 12 : 0)
  return hours * 60 + minutes
}

const hasShowScheduleConflict = async ({ screen, date, time, duration, excludeId }) => {
  const dateStart = Date.parse(`${date}T00:00:00.000Z`)
  const startTime = parseShowTime(time)
  if (!Number.isFinite(dateStart) || startTime === null) return true

  const dateMinutes = dateStart / 60000
  const nearbyDates = [-1, 0, 1].map((offset) =>
    new Date(dateStart + offset * 86400000).toISOString().slice(0, 10)
  )
  const filter = { screen, date: { $in: nearbyDates }, active: true }
  if (excludeId) filter._id = { $ne: excludeId }
  const scheduledShows = await Show.find(filter).populate('movie', 'duration').lean()
  const start = dateMinutes + startTime
  const end = start + duration

  return scheduledShows.some((scheduledShow) => {
    const scheduledTime = parseShowTime(scheduledShow.time)
    const scheduledDate = Date.parse(`${scheduledShow.date}T00:00:00.000Z`)
    if (scheduledTime === null || !Number.isFinite(scheduledDate)) return true
    const scheduledStart = scheduledDate / 60000 + scheduledTime
    const scheduledDuration = Math.max(30, Number(scheduledShow.movie?.duration) || 150)
    return start < scheduledStart + scheduledDuration && scheduledStart < end
  })
}

app.get('/api/admin/shows', auth, adminOnly, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
    const filter = {
      archived: { $ne: true },
      ...(req.query.all === 'true'
        ? {}
        : { date: { $gte: new Date().toISOString().slice(0, 10) } })
    }
    const [shows, total] = await Promise.all([
      Show.find(filter)
        .sort('date time')
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('movie', 'title')
        .populate('theatre', 'name')
        .populate('screen', 'name capacity'),
      Show.countDocuments(filter)
    ])
    res.json({ shows, total, page, pages: Math.ceil(total / limit) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/shows', auth, adminOnly, async (req, res, next) => {
  try {
    const { movie, theatre, screen, date, time } = req.body
    if (![movie, theatre, screen].every(id => mongoose.isValidObjectId(id)) || !date || !time) {
      return res.status(400).json({ message: 'Movie, theatre, screen, date, and time are required' })
    }
    const [movieDoc, theatreDoc, screenDoc] = await Promise.all([
      Movie.findOne({ _id: movie, archived: { $ne: true } }),
      Theatre.findOne({ _id: theatre, archived: { $ne: true } }),
      Screen.findOne({ _id: screen, archived: { $ne: true } })
    ])
    if (!movieDoc || !theatreDoc || !screenDoc) {
      return res.status(400).json({ message: 'Choose an existing movie, theatre, and screen' })
    }
    if (screenDoc.theatre.toString() !== theatreDoc._id.toString()) {
      return res.status(400).json({ message: 'The selected screen does not belong to this theatre' })
    }
    if (movieDoc.city && (!theatreDoc.city || movieDoc.city.toString() !== theatreDoc.city.toString())) {
      return res.status(400).json({ message: 'The show theatre must be in the event city' })
    }
    const parsedDate = new Date(`${date}T00:00:00`)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date ||
      date < new Date().toISOString().slice(0, 10)
    ) {
      return res.status(400).json({ message: 'Show date must be today or later' })
    }
    const showTime = String(time).trim()
    if (parseShowTime(showTime) === null) {
      return res.status(400).json({ message: 'Enter a valid showtime' })
    }
    const active = req.body.active !== false
    const duration = Math.max(30, Number(movieDoc.duration) || 150)
    if (active && await hasShowScheduleConflict({
      screen: screenDoc._id,
      date,
      time: showTime,
      duration
    })) {
      return res.status(409).json({ message: 'This show overlaps another active show on the selected screen' })
    }
    const show = await Show.create({
      movie,
      theatre,
      screen,
      date,
      dateLabel: `${parsedDate.toLocaleDateString('en-IN', { weekday: 'short' })} ${parsedDate.getDate()}`,
      time: showTime,
      basePrice: Math.max(1, Number(req.body.basePrice) || 180),
      active,
      lockedSeats: [],
      bookedSeats: []
    })
    res.status(201).json(await show.populate([
      { path: 'movie', select: 'title' },
      { path: 'theatre', select: 'name' },
      { path: 'screen', select: 'name capacity' }
    ]))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/shows/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid show' })
    }
    const show = await Show.findOne({ _id: req.params.id, archived: { $ne: true } })
    if (!show) return res.status(404).json({ message: 'Show not found' })
    const nextTime = req.body.time === undefined ? show.time : String(req.body.time).trim()
    const nextDate = req.body.date === undefined ? show.date : String(req.body.date).trim()
    const scheduleChanged = nextTime !== show.time || nextDate !== show.date
    if (req.body.active !== undefined && typeof req.body.active !== 'boolean') {
      return res.status(400).json({ message: 'Show active status must be true or false' })
    }
    if (parseShowTime(nextTime) === null) {
      return res.status(400).json({ message: 'Enter a valid showtime' })
    }
    const parsedDate = new Date(`${nextDate}T00:00:00`)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(nextDate) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== nextDate
    ) {
      return res.status(400).json({ message: 'Enter a valid show date' })
    }
    if (nextDate < new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ message: 'Show date must be today or later' })
    }
    if (scheduleChanged && (
      await Booking.exists({ show: show._id }) ||
      await PaymentAttempt.exists({ show: show._id, status: 'pending' }) ||
      (show.lockedSeats || []).some((lock) => lock.expiresAt > new Date())
    )) {
      return res.status(409).json({ message: 'A show with bookings or active seat locks cannot be rescheduled' })
    }
    const nextActive = req.body.active === undefined ? show.active : req.body.active
    const movieDoc = await Movie.findById(show.movie).select('duration')
    if (nextActive && (scheduleChanged || !show.active) && await hasShowScheduleConflict({
      screen: show.screen,
      date: nextDate,
      time: nextTime,
      duration: Math.max(30, Number(movieDoc?.duration) || 150),
      excludeId: show._id
    })) {
      return res.status(409).json({ message: 'This show overlaps another active show on the selected screen' })
    }
    show.active = nextActive
    show.time = nextTime
    show.date = nextDate
    show.dateLabel = `${parsedDate.toLocaleDateString('en-IN', { weekday: 'short' })} ${parsedDate.getDate()}`
    if (req.body.basePrice !== undefined) {
      const price = Number(req.body.basePrice)
      if (!Number.isFinite(price) || price < 1) {
        return res.status(400).json({ message: 'Ticket price must be greater than zero' })
      }
      show.basePrice = price
    }
    await show.save()
    res.json(await show.populate([
      { path: 'movie', select: 'title' },
      { path: 'theatre', select: 'name' },
      { path: 'screen', select: 'name capacity' }
    ]))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/admin/shows/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid show' })
    }
    if (await Booking.exists({ show: req.params.id }) ||
        await PaymentAttempt.exists({ show: req.params.id, status: 'pending' })) {
      return res.status(409).json({ message: 'This show has bookings or pending payments and cannot be deleted' })
    }
    const show = await Show.findByIdAndDelete(req.params.id)
    if (!show) return res.status(404).json({ message: 'Show not found' })
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/bookings', auth, adminOnly, async (_req, res, next) => {
  try {
    const bookings = await Booking.find()
      .sort('-createdAt')
      .limit(200)
      .populate('user', 'name email phone')
      .populate({
        path: 'show',
        populate: [
          { path: 'movie', select: 'title' },
          { path: 'theatre', select: 'name' },
          { path: 'screen', select: 'name' }
        ]
      })
    res.json(bookings)
  } catch (error) {
    next(error)
  }
})

// =====================================================
// AUTHENTICATION
// =====================================================

app.post(
  '/api/auth/signup',
  authRateLimit,
  async (req, res, next) => {
    try {
      const name = String(req.body.name || '').trim()
      const phone = String(req.body.phone || '').trim()
      const email =
        String(
          req.body.email || ''
        )
          .toLowerCase()
          .trim()
      const password = String(req.body.password || '')

      if (!name || name.length > 100 || !/^\+?[0-9 ()-]{7,20}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128) {
        return res.status(400).json({
          message: 'Enter a name, valid email and phone number, and a password of 8 to 128 characters'
        })
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        )

      const user =
        await User.create({
          name,

          email,

          phone,

          passwordHash
        })

      const token =
        jwt.sign(
          {
            id: user._id,
            role: user.role
          },
          tokenSecret,
          { expiresIn: '7d' }
        )

      res.status(201).json({
        token,

        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      })
    } catch (error) {
      next(error)
    }
  }
)

app.post(
  '/api/auth/login',
  authRateLimit,
  async (req, res, next) => {
    try {
      const email =
        String(
          req.body.email || ''
        )
          .toLowerCase()
          .trim()

      const user =
        await User.findOne({
          email
        })

      if (
        !user ||
        user.isActive === false ||
        !(await bcrypt.compare(
          req.body.password,
          user.passwordHash
        ))
      ) {
        return res
          .status(401)
          .json({
            message:
              'Invalid email or password'
          })
      }

      const token =
        jwt.sign(
          {
            id: user._id,
            role: user.role
          },
          tokenSecret,
          { expiresIn: '7d' }
        )

      res.json({
        token,

        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      })
    } catch (error) {
      next(error)
    }
  }
)

// =====================================================
// PAYU HELPERS
// =====================================================

const sha512 = value =>
  crypto
    .createHash('sha512')
    .update(
      String(value),
      'utf8'
    )
    .digest('hex')

const isRealCredential = value => {
  const credential = String(value || '').trim()
  return Boolean(credential && !/^(your[-_ ]|replace[-_ ]|change[-_ ])/i.test(credential))
}

const payuConfigured = () =>
  isRealCredential(process.env.PAYU_KEY) &&
  isRealCredential(process.env.PAYU_SALT)

const razorpayConfigured = () =>
  isRealCredential(process.env.RAZORPAY_KEY_ID) &&
  isRealCredential(process.env.RAZORPAY_KEY_SECRET)

const createRazorpayClient = () =>
  new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  })

app.get('/api/payments/methods', (_req, res) => {
  res.json({
    razorpay: razorpayConfigured(),
    payu: payuConfigured()
  })
})

const payuEndpoint = () =>
  process.env.PAYU_ENV ===
  'production'
    ? 'https://secure.payu.in/_payment'
    : 'https://test.payu.in/_payment'

const payuVerifyEndpoint = () =>
  process.env.PAYU_ENV ===
  'production'
    ? 'https://info.payu.in/merchant/postservice.php?form=2'
    : 'https://test.payu.in/merchant/postservice.php?form=2'

const payuCallbackUrl = () =>
  process.env.PAYU_CALLBACK_URL ||
  `${
    process.env.PUBLIC_BASE_URL ||
    `http://localhost:${port}`
  }/api/payments/payu/callback`

const frontendUrl = () =>
  (
    process.env.FRONTEND_URL ||
    'http://localhost:5173'
  ).replace(
    /\/$/,
    ''
  )

const safeEqual = (
  left,
  right
) => {
  const a =
    Buffer.from(
      String(
        left || ''
      ).toLowerCase()
    )

  const b =
    Buffer.from(
      String(
        right || ''
      ).toLowerCase()
    )

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(
      a,
      b
    )
  )
}

const paymentResultPage = (
  res,
  status,
  bookingId = ''
) => {
  const params =
    new URLSearchParams({
      payment: status
    })

  if (bookingId) {
    params.set(
      'bookingId',
      bookingId
    )
  }

  return res.redirect(
    303,
    `${frontendUrl()}/bookings?${params.toString()}`
  )
}

const buildPayuFields = attempt => {
  const callback = payuCallbackUrl()
  const fields = {
    key: process.env.PAYU_KEY,
    txnid: attempt.txnid,
    amount: attempt.amount,
    productinfo: attempt.productinfo,
    firstname: attempt.firstname,
    email: attempt.email,
    phone: attempt.phone,
    surl: callback,
    furl: callback,
    curl: callback,
    enforce_paymethod: 'creditcard|debitcard|netbanking|upi|cashcard',
    udf1: '',
    udf2: '',
    udf3: '',
    udf4: '',
    udf5: ''
  }

  fields.hash = sha512([
    fields.key,
    fields.txnid,
    fields.amount,
    fields.productinfo,
    fields.firstname,
    fields.email,
    fields.udf1,
    fields.udf2,
    fields.udf3,
    fields.udf4,
    fields.udf5,
    '',
    '',
    '',
    '',
    '',
    process.env.PAYU_SALT
  ].join('|'))

  return fields
}

// =====================================================
// PAYU INITIATE
// =====================================================

app.post(
  '/api/payments/initiate',
  auth,
  paymentRateLimit,
  async (req, res, next) => {
    let txnid
    let showId
    const provider = req.body.provider || 'payu'

    try {
      if (!['payu', 'razorpay'].includes(provider)) {
        return res.status(400).json({
          message: 'Choose a supported payment provider'
        })
      }

      if (provider === 'razorpay' && !razorpayConfigured()) {
        return res
          .status(503)
          .json({
            message:
              'Razorpay is not configured. Add server-side Razorpay credentials before checkout.'
          })
      }

      if (provider === 'payu' && !payuConfigured()) {
        return res
          .status(503)
          .json({
            message:
              'PayU is not configured.'
          })
      }

      const selected =
        Array.isArray(
          req.body.seats
        )
          ? req.body.seats
          : []

      if (
        !req.body.showId ||
        !selected.length
      ) {
        return res
          .status(400)
          .json({
            message:
              'Choose at least one seat before paying'
          })
      }

      const requestedSeats =
        selected.map(
          seat =>
            String(
              seat.code ||
                seat.label ||
                seat
            )
        )

      const displaySeats =
        selected.map(
          seat =>
            String(
              seat.label ||
                seat.code ||
                seat
            )
        )

      if (
        requestedSeats.length >
          8 ||
        new Set(
          requestedSeats
        ).size !==
          requestedSeats.length
      ) {
        return res
          .status(400)
          .json({
            message:
              'Choose up to 8 unique seats'
          })
      }

      const [
        show,
        user
      ] =
        await Promise.all([
          Show.findById(
            req.body.showId
          ).populate(
            'movie'
          ),

          User.findById(
            req.user.id
          )
        ])

      const screen = show
        ? await Screen.findById(
            show.screen
          )
        : null

      if (
        !show ||
        !screen ||
        !show.active
      ) {
        return res
          .status(404)
          .json({
            message:
              'Show not found or no longer active'
          })
      }

      if (!user?.email) {
        return res
          .status(400)
          .json({
            message:
              'Your account needs an email address before checkout'
          })
      }

      const validSeats =
        new Map(
          screen.seats.map(
            seat => [
              seat.label,
              seat
            ]
          )
        )

      if (
        requestedSeats.some(
          seat =>
            !validSeats.has(
              seat
            )
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              'One or more selected seats are invalid'
          })
      }

      txnid =
        `CB${Date.now().toString(36)}${crypto
          .randomBytes(5)
          .toString(
            'hex'
          )}`
          .slice(0, 25)
          .toUpperCase()

      showId =
        show._id

      const now =
        new Date()

      await PaymentAttempt.updateMany(
        { status: 'pending', expiresAt: { $lte: now } },
        { $set: { status: 'failed' } }
      )

      // Clear old temporary locks
      await Show.updateOne(
        {
          _id: show._id
        },
        {
          $pull: {
            lockedSeats: {
              expiresAt: {
                $lte:
                  now
              }
            }
          }
        }
      )

      const expiresAt =
        new Date(
          now.getTime() +
            (provider === 'razorpay' ? 10 : 30) *
              60 *
              1000
        )

      // Lock seats atomically
      const reserved =
        await Show.findOneAndUpdate(
          {
            _id: show._id,

            bookedSeats: {
              $nin:
                requestedSeats
            },

            lockedSeats: {
              $not: {
                $elemMatch: {
                  seat: {
                    $in:
                      requestedSeats
                  },
                  expiresAt: {
                    $gt:
                      now
                  }
                }
              }
            }
          },

          {
            $push: {
              lockedSeats: {
                $each:
                  requestedSeats.map(
                    seat => ({
                      seat,
                      txnid,
                      expiresAt
                    })
                  )
              }
            }
          },

          {
            new: true
          }
        )

      if (!reserved) {
        const previousAttempts = await PaymentAttempt.find({
          user: user._id,
          show: show._id,
          status: 'pending',
          expiresAt: { $gt: now },
          requestedSeats: { $all: requestedSeats, $size: requestedSeats.length }
        }).sort({ createdAt: -1 })
        const previousAttempt = previousAttempts.find(attempt => {
          const heldSeats = new Set((show.lockedSeats || [])
            .filter(lock => lock.txnid === attempt.txnid && lock.expiresAt > now)
            .map(lock => lock.seat))
          return requestedSeats.every(seat => heldSeats.has(seat))
        })

        if (previousAttempt) {
          if (previousAttempt.provider === 'payu' && payuConfigured()) {
            return res.json({
              provider: 'payu',
              resumed: true,
              attemptId: previousAttempt.txnid,
              action: payuEndpoint(),
              fields: buildPayuFields(previousAttempt)
            })
          }

          if (previousAttempt.provider === 'razorpay' && razorpayConfigured() && previousAttempt.razorpayOrderId) {
            return res.json({
              provider: 'razorpay',
              resumed: true,
              keyId: process.env.RAZORPAY_KEY_ID,
              attemptId: previousAttempt.txnid,
              order: {
                id: previousAttempt.razorpayOrderId,
                amount: Math.round(Number(previousAttempt.amount) * 100),
                currency: 'INR'
              },
              prefill: {
                name: user.name || '',
                email: user.email,
                contact: previousAttempt.phone || ''
              },
              description: previousAttempt.productinfo
            })
          }
        }

        return res
          .status(409)
          .json({
            message:
              'Those seats are booked or held by another checkout. Refresh the seat map and choose available seats.'
          })
      }

      const ticketAmount =
        requestedSeats.reduce(
          (
            sum,
            seat
          ) =>
            sum +
            Number(
              validSeats.get(
                seat
              ).price || 0
            ),
          0
        )

      // Demo: customer pays exactly ticket price.
      const convenienceFee = 0
      const taxAmount = 0
      const totalAmount =
        ticketAmount

      const amount =
        totalAmount.toFixed(
          2
        )

      const productinfo =
        `CineBook tickets - ${
          show.movie?.title ||
          'Event'
        }`.slice(
          0,
          100
        )

      const firstname =
        (
          user.name ||
          'CineBook Guest'
        )
          .trim()
          .split(
            /\s+/
          )[0]
          .slice(
            0,
            60
          )

      const phone =
        String(
          user.phone || ''
        )
          .replace(
            /\D/g,
            ''
          )
          .slice(
            -10
          )

      if (provider === 'razorpay') {
        const order = await createRazorpayClient().orders.create({
          amount: Math.round(Number(amount) * 100),
          currency: 'INR',
          receipt: txnid,
          notes: {
            userId: String(user._id),
            showId: String(show._id)
          }
        })

        await PaymentAttempt.create({
          txnid,
          user: user._id,
          show: show._id,
          requestedSeats,
          displaySeats,
          ticketAmount,
          convenienceFee,
          taxAmount,
          amount,
          productinfo,
          firstname,
          email: user.email,
          phone,
          provider,
          razorpayOrderId: order.id,
          expiresAt
        })

        return res.json({
          provider,
          keyId: process.env.RAZORPAY_KEY_ID,
          attemptId: txnid,
          order: {
            id: order.id,
            amount: order.amount,
            currency: order.currency
          },
          prefill: {
            name: user.name || '',
            email: user.email,
            contact: phone
          },
          description: productinfo
        })
      }

      await PaymentAttempt.create({
        txnid,
        user:
          user._id,
        show:
          show._id,
        requestedSeats,
        displaySeats,
        ticketAmount,
        convenienceFee,
        taxAmount,
        amount,
        productinfo,
        firstname,
        email:
          user.email,
        phone,
        provider,
        expiresAt
      })

      const fields = buildPayuFields({
        txnid,
        amount,
        productinfo,
        firstname,
        email: user.email,
        phone
      })

      console.log(
        'PayU initiated:',
        {
          txnid,
          amount,
          showId:
            String(
              show._id
            ),
          seats:
            requestedSeats
        }
      )

      res.json({
        provider,
        attemptId: txnid,
        action:
          payuEndpoint(),
        fields
      })
    } catch (error) {
      if (
        txnid &&
        showId
      ) {
        await Show.updateOne(
          {
            _id:
              showId
          },
          {
            $pull: {
              lockedSeats: {
                txnid
              }
            }
          }
        ).catch(
          () => {}
        )
      }

      next(error)
    }
  }
)

// =====================================================
// PAYU CALLBACK
// =====================================================

app.post('/api/payments/razorpay/cancel', auth, paymentRateLimit, async (req, res, next) => {
  try {
    const attempt = await PaymentAttempt.findOneAndUpdate(
      {
        txnid: String(req.body.attemptId || ''),
        user: req.user.id,
        provider: 'razorpay',
        status: 'pending'
      },
      { $set: { status: 'failed' } },
      { new: true }
    )

    if (attempt) {
      await Show.updateOne(
        { _id: attempt.show },
        { $pull: { lockedSeats: { txnid: attempt.txnid } } }
      )
    }

    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.post('/api/payments/razorpay/verify', auth, paymentRateLimit, async (req, res, next) => {
  try {
    const orderId = String(req.body.razorpay_order_id || '')
    const paymentId = String(req.body.razorpay_payment_id || '')
    const signature = String(req.body.razorpay_signature || '')

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        message: 'Razorpay payment verification details are incomplete'
      })
    }

    const attempt = await PaymentAttempt.findOne({
      razorpayOrderId: orderId,
      user: req.user.id,
      provider: 'razorpay'
    })

    if (!attempt) {
      return res.status(404).json({
        message: 'Payment attempt not found for this account'
      })
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex')

    if (!safeEqual(expectedSignature, signature)) {
      return res.status(400).json({
        message: 'Razorpay payment signature is invalid'
      })
    }

    if (attempt.status === 'paid' && attempt.bookingId) {
      return res.json({ bookingId: attempt.bookingId })
    }

    if (attempt.status !== 'pending') {
      return res.status(409).json({
        message: 'This payment attempt cannot be confirmed'
      })
    }

    const payment = await createRazorpayClient().payments.fetch(paymentId)
    if (
      payment.order_id !== orderId ||
      payment.status !== 'captured' ||
      payment.currency !== 'INR' ||
      Number(payment.amount) !== Math.round(Number(attempt.amount) * 100)
    ) {
      return res.status(409).json({
        message: 'Payment is not captured for the expected amount; booking not confirmed'
      })
    }

    const claimed = await PaymentAttempt.findOneAndUpdate(
      {
        _id: attempt._id,
        status: 'pending',
        expiresAt: { $gt: new Date() }
      },
      { $set: { status: 'review', razorpayPaymentId: paymentId } },
      { new: true }
    )

    if (!claimed) {
      return res.status(409).json({
        message: 'The seat hold expired before payment verification; contact support'
      })
    }

    const booked = await Show.findOneAndUpdate(
      {
        _id: claimed.show,
        bookedSeats: { $nin: claimed.requestedSeats },
        lockedSeats: {
          $elemMatch: {
            txnid: claimed.txnid,
            expiresAt: { $gt: new Date() }
          }
        }
      },
      {
        $addToSet: { bookedSeats: { $each: claimed.requestedSeats } },
        $pull: { lockedSeats: { txnid: claimed.txnid } }
      },
      { new: true }
    )

    if (!booked) {
      return res.status(409).json({
        message: 'Seats could not be confirmed after payment; contact support'
      })
    }

    const booking = await Booking.create({
      bookingId: `CB-${Date.now().toString(36).toUpperCase()}`,
      user: claimed.user,
      show: claimed.show,
      seats: claimed.displaySeats,
      ticketAmount: claimed.ticketAmount,
      convenienceFee: claimed.convenienceFee,
      taxAmount: claimed.taxAmount,
      totalAmount: Number(claimed.amount),
      paymentMethod: `Razorpay ${payment.method || 'checkout'}`,
      status: 'confirmed'
    })

    claimed.status = 'paid'
    claimed.bookingId = booking.bookingId
    await claimed.save()

    res.json({ bookingId: booking.bookingId })
  } catch (error) {
    next(error)
  }
})

app.post(
  '/api/payments/payu/callback',
  async (req, res, next) => {
    try {
      const data =
        req.body || {}

      console.log(
        '========== PAYU CALLBACK =========='
      )

      console.log({
        txnid:
          data.txnid,
        status:
          data.status,
        amount:
          data.amount,
        mode:
          data.mode,
        hasHash:
          Boolean(
            data.hash
          )
      })

      console.log(
        '===================================='
      )

      const attempt =
        data.txnid
          ? await PaymentAttempt.findOne(
              {
                txnid:
                  String(
                    data.txnid
                  )
              }
            )
          : null

      if (!attempt) {
        return res
          .status(400)
          .send(
            'Payment transaction not found.'
          )
      }

      if (
        attempt.status ===
        'paid'
      ) {
        return paymentResultPage(
          res,
          'success',
          attempt.bookingId
        )
      }

      if (
        !payuConfigured() ||
        String(
          data.key || ''
        ) !==
          String(
            process.env.PAYU_KEY
          )
      ) {
        return res
          .status(400)
          .send(
            'Invalid payment response.'
          )
      }

      // -------------------------------------------------
      // REVERSE HASH
      // -------------------------------------------------

      const additionalCharges =
        data.additional_charges ||
        data.additionalCharges ||
        ''

      const reverseParts =
        [
          process.env.PAYU_SALT,
          data.status || '',

          '',
          '',
          '',
          '',
          '',

          data.udf5 || '',
          data.udf4 || '',
          data.udf3 || '',
          data.udf2 || '',
          data.udf1 || '',

          data.email || '',
          data.firstname || '',
          data.productinfo || '',
          data.amount || '',
          data.txnid || '',
          data.key || ''
        ]

      const reverseInput =
        reverseParts.join(
          '|'
        )

      const reverseHash =
        sha512(
          additionalCharges
            ? `${additionalCharges}|${reverseInput}`
            : reverseInput
        )

      const hashMatches =
        safeEqual(
          reverseHash,
          data.hash
        )

      const responseAmount =
        Number(
          data.amount
        )

      const expectedAmount =
        Number(
          attempt.amount
        )

      const amountMatches =
        Number.isFinite(
          responseAmount
        ) &&
        Math.round(
          responseAmount *
            100
        ) ===
          Math.round(
            expectedAmount *
              100
          )

      const productInfoMatches =
        String(
          data.productinfo ||
            ''
        ) ===
        String(
          attempt.productinfo ||
            ''
        )

      const emailMatches =
        String(
          data.email || ''
        ).toLowerCase() ===
        String(
          attempt.email || ''
        ).toLowerCase()

      const firstnameMatches =
        String(
          data.firstname ||
            ''
        ) ===
        String(
          attempt.firstname ||
            ''
        )

      console.log(
        '========== PAYU VERIFICATION =========='
      )

      console.log({
        txnid:
          attempt.txnid,

        hashMatches,

        amountMatches,

        amountReceived:
          data.amount,

        amountExpected:
          attempt.amount,

        productInfoMatches,

        emailMatches,

        firstnameMatches,

        status:
          data.status
      })

      console.log(
        '========================================'
      )

      if (
        !hashMatches ||
        !amountMatches ||
        !productInfoMatches ||
        !emailMatches ||
        !firstnameMatches
      ) {
        attempt.status =
          'review'

        await attempt.save()

        console.warn(
          'PayU callback validation failed'
        )

        return paymentResultPage(
          res,
          'pending',
          attempt.txnid
        )
      }

      // -------------------------------------------------
      // FAILED PAYMENT
      // -------------------------------------------------

      if (
        String(
          data.status || ''
        ).toLowerCase() !==
        'success'
      ) {
        attempt.status =
          'failed'

        await attempt.save()

        await Show.updateOne(
          {
            _id:
              attempt.show
          },
          {
            $pull: {
              lockedSeats: {
                txnid:
                  attempt.txnid
              }
            }
          }
        )

        return paymentResultPage(
          res,
          'failed'
        )
      }

      // -------------------------------------------------
      // VERIFY PAYMENT WITH PAYU
      // -------------------------------------------------

      const verifyHash =
        sha512(
          [
            process.env.PAYU_KEY,
            'verify_payment',
            attempt.txnid,
            process.env.PAYU_SALT
          ].join('|')
        )

      const verifyBody =
        new URLSearchParams({
          key:
            process.env.PAYU_KEY,

          command:
            'verify_payment',

          var1:
            attempt.txnid,

          hash:
            verifyHash
        })

      const verifyResponse =
        await fetch(
          payuVerifyEndpoint(),
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/x-www-form-urlencoded'
            },

            body:
              verifyBody
          }
        )

      const verification =
        await verifyResponse.json()

      const transaction =
        verification
          ?.transaction_details
          ?.[
            attempt.txnid
          ]

      console.log(
        '========== PAYU VERIFY =========='
      )

      console.log({
        txnid:
          attempt.txnid,

        httpStatus:
          verifyResponse.status,

        apiStatus:
          verification?.status,

        apiMessage:
          verification?.msg,

        transactionStatus:
          transaction?.status,

        transactionAmount:
          transaction?.amt ??
          transaction?.amount
      })

      console.log(
        '=================================='
      )

      const verifiedStatus =
        String(
          transaction?.status ||
            ''
        ).toLowerCase()

      const verifiedAmount =
        Number(
          transaction?.amt ??
            transaction?.amount
        )

      const verifySucceeded =
        verifyResponse.ok &&
        String(
          verification?.status
        ) === '1' &&
        verifiedStatus ===
          'success' &&
        Number.isFinite(
          verifiedAmount
        ) &&
        Math.round(
          verifiedAmount *
            100
        ) ===
          Math.round(
            Number(
              attempt.amount
            ) *
              100
          )

      console.log(
        '========== PAYU FINAL CHECK =========='
      )

      console.log({
        txnid:
          attempt.txnid,

        apiStatus:
          verification?.status,

        transactionStatus:
          transaction?.status,

        verifiedAmount,

        expectedAmount:
          Number(
            attempt.amount
          ),

        verifySucceeded
      })

      console.log(
        '======================================='
      )

      if (!verifySucceeded) {
        attempt.status =
          'review'

        await attempt.save()

        return paymentResultPage(
          res,
          'pending',
          attempt.txnid
        )
      }

      // -------------------------------------------------
      // CONFIRM SEATS
      // -------------------------------------------------

      const bookingId =
        `CB-${Date.now()
          .toString(36)
          .toUpperCase()}`

      const booked =
        await Show.findOneAndUpdate(
          {
            _id:
              attempt.show,

            bookedSeats: {
              $nin:
                attempt.requestedSeats
            },

            lockedSeats: {
              $elemMatch: {
                txnid:
                  attempt.txnid
              }
            }
          },

          {
            $addToSet: {
              bookedSeats: {
                $each:
                  attempt.requestedSeats
              }
            },

            $pull: {
              lockedSeats: {
                txnid:
                  attempt.txnid
              }
            }
          },

          {
            new: true
          }
        )

      if (!booked) {
        attempt.status =
          'review'

        await attempt.save()

        console.warn(
          'Could not confirm seats',
          {
            txnid:
              attempt.txnid,
            seats:
              attempt.requestedSeats
          }
        )

        return paymentResultPage(
          res,
          'pending',
          attempt.txnid
        )
      }

      // -------------------------------------------------
      // CREATE BOOKING
      // -------------------------------------------------

      const booking =
        await Booking.create({
          bookingId,

          user:
            attempt.user,

          show:
            attempt.show,

          seats:
            attempt.displaySeats,

          ticketAmount:
            attempt.ticketAmount,

          convenienceFee:
            attempt.convenienceFee,

          taxAmount:
            attempt.taxAmount,

          totalAmount:
            Number(
              attempt.amount
            ),

          paymentMethod:
            `PayU ${
              data.mode ||
              'checkout'
            }`,

          status:
            'confirmed'
        })

      attempt.status =
        'paid'

      attempt.bookingId =
        booking.bookingId

      await attempt.save()

      console.log(
        '======================================='
      )

      console.log(
        'PAYMENT SUCCESS:',
        booking.bookingId
      )

      console.log(
        'BOOKED SEATS:',
        booking.seats
      )

      console.log(
        '======================================='
      )

      return paymentResultPage(
        res,
        'success',
        booking.bookingId
      )
    } catch (error) {
      next(error)
    }
  }
)

// =====================================================
// SINGLE BOOKING
// =====================================================

app.get(
  '/api/bookings/:id',
  auth,
  async (req, res, next) => {
    try {
      const booking =
        await Booking.findOne({
          bookingId:
            req.params.id
        }).populate({
          path: 'show',
          populate: [
            'movie',
            'theatre',
            'screen'
          ]
        })

      if (!booking) {
        return res.status(404).json({
          message:
            'Booking not found'
        })
      }

      if (booking.user.toString() !== req.user.id) {
        const requester = await User.findById(req.user.id)
          .select('role')
          .lean()

        if (requester?.role !== 'admin') {
          return res.status(403).json({
            message: 'Booking access denied'
          })
        }
      }

      res.json({
        booking,

        movie:
          booking.show?.movie,

        theatre:
          booking.show?.theatre,

        show:
          booking.show
      })
    } catch (error) {
      next(error)
    }
  }
)

// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
  (
    error,
    _req,
    res,
    _next
  ) => {
    console.error(
      'Server error:',
      error
    )

    res.status(
      error.status || 500
    ).json({
      message:
        error.message ||
        'Server error'
    })
  }
)

// =====================================================
// START SERVER
// =====================================================

mongoose
  .connect(mongoUrl)
  .then(() => {
    app.listen(
      port,
      () => {
        console.log(
          `CineBook API listening on port ${port}`
        )

        console.log(
          `PayU environment: ${
            process.env.PAYU_ENV ||
            'test'
          }`
        )

        console.log(
          `PayU endpoint: ${payuEndpoint()}`
        )
      }
    )
  })
  .catch(error => {
    console.error(
      'MongoDB connection failed:',
      error.message
    )

    process.exit(1)
  })
