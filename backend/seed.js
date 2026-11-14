import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const citySchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true },
  state: String
}, { timestamps: true })

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  passwordHash: String,
  role: String,
  isActive: { type: Boolean, default: true }
}, { timestamps: true })

const movieSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ['movie', 'sports', 'comedy'], default: 'movie' },
  status: { type: String, enum: ['comingSoon', 'nowShowing', 'ended'], default: 'nowShowing' },
  sport: String,
  city: { type: mongoose.Schema.Types.ObjectId, ref: 'City' },
  posterUrl: String,
  bannerUrl: String,
  trailerUrl: String,
  language: String,
  genre: [String],
  duration: Number,
  rating: Number,
  popularity: Number,
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
  published: { type: Boolean, default: true },
  trending: Boolean,
  archived: { type: Boolean, default: false }
}, { timestamps: true })

const theatreSchema = new mongoose.Schema({
  name: String,
  venueType: { type: String, enum: ['cinema', 'stadium', 'multiPurpose'], default: 'cinema' },
  city: { type: mongoose.Schema.Types.ObjectId, ref: 'City' },
  address: String,
  district: String,
  state: String,
  pincode: String,
  formats: [String],
  archived: { type: Boolean, default: false }
}, { timestamps: true })

const screenSchema = new mongoose.Schema({
  name: String,
  theatre: { type: mongoose.Schema.Types.ObjectId, ref: 'Theatre' },
  capacity: Number,
  archived: { type: Boolean, default: false },
  seatPrices: {
    premium: { type: Number, default: 320 },
    comfort: { type: Number, default: 240 },
    standard: { type: Number, default: 180 }
  },
  seats: [{ label: String, row: String, number: Number, category: String, price: Number }]
})

const showSchema = new mongoose.Schema({
  seedKey: { type: String, unique: true, sparse: true },
  movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie' },
  theatre: { type: mongoose.Schema.Types.ObjectId, ref: 'Theatre' },
  screen: { type: mongoose.Schema.Types.ObjectId, ref: 'Screen' },
  date: String,
  dateLabel: String,
  time: String,
  basePrice: Number,
  active: { type: Boolean, default: true },
  archived: { type: Boolean, default: false },
  lockedSeats: [{ seat: String, txnid: String, expiresAt: Date }],
  bookedSeats: [String]
})

const bannerSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 500 },
  imageUrl: { type: String, required: true, trim: true },
  targetUrl: { type: String, required: true, trim: true },
  city: { type: mongoose.Schema.Types.ObjectId, ref: 'City', default: null },
  order: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
  startsAt: Date,
  endsAt: Date
}, { timestamps: true })

const City = mongoose.model('City', citySchema)
const User = mongoose.model('User', userSchema)
const Movie = mongoose.model('Movie', movieSchema)
const Theatre = mongoose.model('Theatre', theatreSchema)
const Screen = mongoose.model('Screen', screenSchema)
const Show = mongoose.model('Show', showSchema)
const Banner = mongoose.model('Banner', bannerSchema)

const cities = [
  ['Ahmedabad', 'Gujarat'],
  ['Bengaluru', 'Karnataka'],
  ['Chandigarh', 'Chandigarh'],
  ['Chennai', 'Tamil Nadu'],
  ['Delhi', 'Delhi'],
  ['Hyderabad', 'Telangana'],
  ['Jaipur', 'Rajasthan'],
  ['Kochi', 'Kerala'],
  ['Kolkata', 'West Bengal'],
  ['Lucknow', 'Uttar Pradesh'],
  ['Mumbai', 'Maharashtra'],
  ['Pune', 'Maharashtra']
]

const cinemaSeatPrices = { premium: 450, comfort: 300, standard: 200 }
const stadiumSeatPrices = { premium: 1200, comfort: 800, standard: 500 }
const makeSeats = (capacity, prices) => Array.from({ length: capacity }, (_, index) => {
  const rowIndex = Math.floor(index / 12)
  const row = String.fromCharCode(65 + rowIndex)
  const category = rowIndex < 2 ? 'premium' : rowIndex === 2 ? 'comfort' : 'standard'
  return {
    label: `${row}${(index % 12) + 1}`,
    row,
    number: (index % 12) + 1,
    category,
    price: prices[category]
  }
})

const venues = [
  { key: 'lakeview', name: 'CineBook Lakeview Cinemas', venueType: 'cinema', city: 'Kolkata', address: 'Sector V, Salt Lake', district: 'Bidhannagar', state: 'West Bengal', pincode: '700091', formats: ['2D', '3D'] },
  { key: 'riverside', name: 'CineBook Riverside Screens', venueType: 'cinema', city: 'Kolkata', address: 'New Town Action Area I', district: 'Rajarhat', state: 'West Bengal', pincode: '700091', formats: ['2D', 'IMAX'] },
  { key: 'eastbank', name: 'CineBook Eastbank Stadium', venueType: 'stadium', city: 'Kolkata', address: 'Sports District, New Town', district: 'Rajarhat', state: 'West Bengal', pincode: '700091', formats: ['General', 'Premium', 'VIP'] },
  { key: 'marine', name: 'CineBook Marine Multiplex', venueType: 'cinema', city: 'Mumbai', address: 'Fort District', district: 'South Mumbai', state: 'Maharashtra', pincode: '400001', formats: ['2D', '3D', 'IMAX'] },
  { key: 'harbour', name: 'CineBook Harbour Sports Park', venueType: 'stadium', city: 'Mumbai', address: 'Harbour View Road', district: 'Mumbai', state: 'Maharashtra', pincode: '400037', formats: ['General', 'Premium', 'Hospitality'] },
  { key: 'ahmedabad-cinema', name: 'CineBook Sabarmati Screens', venueType: 'cinema', city: 'Ahmedabad', address: 'Central Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', pincode: '380001', formats: ['2D', '3D'] },
  { key: 'ahmedabad-stadium', name: 'CineBook Riverfront Arena', venueType: 'stadium', city: 'Ahmedabad', address: 'Central Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', pincode: '380001', formats: ['General', 'Premium', 'VIP'] },
  { key: 'bengaluru-cinema', name: 'CineBook Garden City Screens', venueType: 'cinema', city: 'Bengaluru', address: 'Central Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560001', formats: ['2D', '3D', 'IMAX'] },
  { key: 'chennai-cinema', name: 'CineBook Marina Multiplex', venueType: 'cinema', city: 'Chennai', address: 'Central Chennai', district: 'Chennai', state: 'Tamil Nadu', pincode: '600001', formats: ['2D', '3D'] },
  { key: 'chennai-stadium', name: 'CineBook Coromandel Arena', venueType: 'stadium', city: 'Chennai', address: 'Central Chennai', district: 'Chennai', state: 'Tamil Nadu', pincode: '600001', formats: ['General', 'Premium', 'VIP'] },
  { key: 'delhi-cinema', name: 'CineBook Capital Screens', venueType: 'cinema', city: 'Delhi', address: 'Central Delhi', district: 'New Delhi', state: 'Delhi', pincode: '110001', formats: ['2D', '3D', 'IMAX'] },
  { key: 'delhi-stadium', name: 'CineBook Yamuna Sports Ground', venueType: 'stadium', city: 'Delhi', address: 'Central Delhi', district: 'New Delhi', state: 'Delhi', pincode: '110001', formats: ['General', 'Premium', 'Hospitality'] },
  { key: 'hyderabad-cinema', name: 'CineBook Deccan Screens', venueType: 'cinema', city: 'Hyderabad', address: 'Central Hyderabad', district: 'Hyderabad', state: 'Telangana', pincode: '500001', formats: ['2D', '3D'] },
  { key: 'hyderabad-stadium', name: 'CineBook Charminar Arena', venueType: 'stadium', city: 'Hyderabad', address: 'Central Hyderabad', district: 'Hyderabad', state: 'Telangana', pincode: '500001', formats: ['General', 'Premium', 'VIP'] },
  { key: 'pune-cinema', name: 'CineBook Deccan Multiplex', venueType: 'cinema', city: 'Pune', address: 'Central Pune', district: 'Pune', state: 'Maharashtra', pincode: '411001', formats: ['2D', '3D', 'IMAX'] },
  { key: 'pune-stadium', name: 'CineBook Mula Sports Arena', venueType: 'stadium', city: 'Pune', address: 'Central Pune', district: 'Pune', state: 'Maharashtra', pincode: '411001', formats: ['General', 'Premium', 'VIP'] }
]

const image = (photo, width = 1000) => `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=${width}&q=82`
const eventSpecs = [
  {
    key: 'monsoon-letters', title: 'Letters After the Rain', type: 'movie', city: 'Kolkata', status: 'nowShowing',
    posterUrl: image('photo-1489599849927-2ee91cede3ba', 700), bannerUrl: image('photo-1478720568477-152d9b164e26'),
    language: 'Hindi', genre: ['Drama', 'Romance'], duration: 128, rating: 8.2, popularity: 98, trending: true,
    releaseDate: new Date('2026-10-20T00:00:00.000Z'), description: 'A quiet letter brings two old friends back to the city where their story began.',
    cast: ['Aarav Sen', 'Mira Roy'], crew: ['Nila Das'], venueNote: 'Kolkata cinemas'
  },
  {
    key: 'midnight-express', title: 'Midnight Expressway', type: 'movie', city: 'Kolkata', status: 'nowShowing',
    posterUrl: image('photo-1440404653325-ab127d49abc1', 700), bannerUrl: image('photo-1489599849927-2ee91cede3ba'),
    language: 'Bengali', genre: ['Thriller', 'Mystery'], duration: 116, rating: 7.9, popularity: 84, trending: true,
    releaseDate: new Date('2026-10-24T00:00:00.000Z'), description: 'One night, one train, and a mystery that changes every stop.',
    cast: ['Ritwik Basu', 'Ira Mukherjee'], crew: ['S. Banerjee'], venueNote: 'Kolkata cinemas'
  },
  {
    key: 'blue-hour', title: 'The Blue Hour', type: 'movie', city: 'Mumbai', status: 'nowShowing',
    posterUrl: image('photo-1524985069026-dd778a71c7b4', 700), bannerUrl: image('photo-1478720568477-152d9b164e26'),
    language: 'Hindi', genre: ['Adventure', 'Family'], duration: 104, rating: 8.0, popularity: 78, trending: false,
    releaseDate: new Date('2026-10-28T00:00:00.000Z'), description: 'A young cartographer follows a hand-drawn map across the coast.',
    cast: ['Kabir Mehta', 'Tara Shah'], crew: ['Dev Malhotra'], venueNote: 'South Mumbai cinemas'
  },
  {
    key: 'kolkata-cricket', title: 'Kolkata Comets vs Mumbai Mariners', type: 'sports', sport: 'cricket', city: 'Kolkata', status: 'nowShowing',
    posterUrl: image('photo-1461896836934-ffe607ba8211', 900), bannerUrl: image('photo-1471295253337-3ceaaedca402'),
    language: 'Live sport', genre: ['Cricket'], duration: 240, rating: 4.8, popularity: 96, trending: true,
    homeTeam: 'Kolkata Comets', awayTeam: 'Mumbai Mariners', tournament: 'City Lights T20 Cup', venueNote: 'CineBook Eastbank Stadium',
    description: 'A fast-paced evening fixture under the lights. Gates open one hour before match time.'
  },
  {
    key: 'mumbai-hockey', title: 'Mumbai Waves vs Bengal Blades', type: 'sports', sport: 'hockey', city: 'Mumbai', status: 'nowShowing',
    posterUrl: image('photo-1521412644187-c49fa049e84d', 900), bannerUrl: image('photo-1461896836934-ffe607ba8211'),
    language: 'Live sport', genre: ['Hockey'], duration: 150, rating: 4.6, popularity: 73, trending: false,
    homeTeam: 'Mumbai Waves', awayTeam: 'Bengal Blades', tournament: 'National Hockey Series', venueNote: 'CineBook Harbour Sports Park',
    description: 'Watch the city rivals meet in a full-length league match at Harbour Sports Park.'
  }
]

eventSpecs.push(
  {
    key: 'ahmedabad-film', title: 'The Kite Maker', type: 'movie', city: 'Ahmedabad', status: 'nowShowing',
    posterUrl: image('photo-1489599849927-2ee91cede3ba', 700), bannerUrl: image('photo-1478720568477-152d9b164e26'),
    language: 'Gujarati', genre: ['Drama', 'Family'], duration: 112, rating: 8.1, popularity: 82, trending: true,
    description: 'A family workshop and an old city rooftop become the setting for a new beginning.', cast: ['Meera Shah', 'Rohan Desai'], crew: ['Nisha Patel'], venueNote: 'CineBook Sabarmati Screens'
  },
  {
    key: 'bengaluru-film', title: 'Signal at Dawn', type: 'movie', city: 'Bengaluru', status: 'nowShowing',
    posterUrl: image('photo-1440404653325-ab127d49abc1', 700), bannerUrl: image('photo-1524985069026-dd778a71c7b4'),
    language: 'Kannada', genre: ['Thriller', 'Drama'], duration: 121, rating: 7.8, popularity: 76, trending: false,
    description: 'A late-night radio host follows a trail of clues through a city that never quite sleeps.', cast: ['Ananya Rao', 'Vikram Hegde'], crew: ['K. Srinivas'], venueNote: 'CineBook Garden City Screens'
  },
  {
    key: 'chennai-film', title: 'Blue Coastline', type: 'movie', city: 'Chennai', status: 'nowShowing',
    posterUrl: image('photo-1524985069026-dd778a71c7b4', 700), bannerUrl: image('photo-1478720568477-152d9b164e26'),
    language: 'Tamil', genre: ['Adventure', 'Drama'], duration: 109, rating: 8.0, popularity: 79, trending: false,
    description: 'Two cousins retrace a coastal journey and find a story their family left unfinished.', cast: ['Kavya Raman', 'Arjun Kumar'], crew: ['S. Lakshmi'], venueNote: 'CineBook Marina Multiplex'
  },
  {
    key: 'delhi-film', title: 'The Last Metro Home', type: 'movie', city: 'Delhi', status: 'nowShowing',
    posterUrl: image('photo-1489599849927-2ee91cede3ba', 700), bannerUrl: image('photo-1440404653325-ab127d49abc1'),
    language: 'Hindi', genre: ['Romance', 'Drama'], duration: 118, rating: 7.9, popularity: 81, trending: true,
    description: 'A missed train gives two strangers one long evening to reconsider their plans.', cast: ['Aditi Khanna', 'Ishaan Verma'], crew: ['R. Kapoor'], venueNote: 'CineBook Capital Screens'
  },
  {
    key: 'hyderabad-film', title: 'The Deccan Cookbook', type: 'movie', city: 'Hyderabad', status: 'nowShowing',
    posterUrl: image('photo-1524985069026-dd778a71c7b4', 700), bannerUrl: image('photo-1478720568477-152d9b164e26'),
    language: 'Telugu', genre: ['Comedy', 'Family'], duration: 106, rating: 8.3, popularity: 85, trending: true,
    description: 'A young chef brings three generations together around a much-loved family recipe.', cast: ['Sana Reddy', 'Nikhil Rao'], crew: ['M. Prasad'], venueNote: 'CineBook Deccan Screens'
  },
  {
    key: 'pune-film', title: 'Paper Planets', type: 'movie', city: 'Pune', status: 'nowShowing',
    posterUrl: image('photo-1440404653325-ab127d49abc1', 700), bannerUrl: image('photo-1489599849927-2ee91cede3ba'),
    language: 'Marathi', genre: ['Science Fiction', 'Drama'], duration: 114, rating: 7.7, popularity: 72, trending: false,
    description: 'A student-built telescope turns a quiet neighborhood into a place full of possibility.', cast: ['Ira Kulkarni', 'Neil Joshi'], crew: ['A. Patil'], venueNote: 'CineBook Deccan Multiplex'
  },
  {
    key: 'ahmedabad-football', title: 'Sabarmati Strikers vs Deccan United', type: 'sports', sport: 'football', city: 'Ahmedabad', status: 'nowShowing',
    posterUrl: image('photo-1522778119026-d647f0596c20', 900), bannerUrl: image('photo-1471295253337-3ceaaedca402'),
    language: 'Live sport', genre: ['Football'], duration: 120, rating: 4.7, popularity: 86, trending: true,
    homeTeam: 'Sabarmati Strikers', awayTeam: 'Deccan United', tournament: 'City Lights Football Cup', venueNote: 'CineBook Riverfront Arena',
    description: 'A lively evening fixture between two fictional city clubs.'
  },
  {
    key: 'chennai-cricket', title: 'Marina Royals vs Garden City XI', type: 'sports', sport: 'cricket', city: 'Chennai', status: 'nowShowing',
    posterUrl: image('photo-1461896836934-ffe607ba8211', 900), bannerUrl: image('photo-1471295253337-3ceaaedca402'),
    language: 'Live sport', genre: ['Cricket'], duration: 240, rating: 4.8, popularity: 88, trending: true,
    homeTeam: 'Marina Royals', awayTeam: 'Garden City XI', tournament: 'Southern Lights T20', venueNote: 'CineBook Coromandel Arena',
    description: 'A fictional T20 fixture with an evening start and a full stadium atmosphere.'
  },
  {
    key: 'delhi-basketball', title: 'Capital Hoopers vs Yamuna Five', type: 'sports', sport: 'basketball', city: 'Delhi', status: 'nowShowing',
    posterUrl: image('photo-1546519638-68e109498ffc', 900), bannerUrl: image('photo-1471295253337-3ceaaedca402'),
    language: 'Live sport', genre: ['Basketball'], duration: 130, rating: 4.6, popularity: 77, trending: false,
    homeTeam: 'Capital Hoopers', awayTeam: 'Yamuna Five', tournament: 'Metro Basketball Series', venueNote: 'CineBook Yamuna Sports Ground',
    description: 'Two fictional city sides meet for a fast-paced indoor basketball showcase.'
  },
  {
    key: 'hyderabad-football', title: 'Charminar City vs Mula Athletic', type: 'sports', sport: 'football', city: 'Hyderabad', status: 'nowShowing',
    posterUrl: image('photo-1522778119026-d647f0596c20', 900), bannerUrl: image('photo-1461896836934-ffe607ba8211'),
    language: 'Live sport', genre: ['Football'], duration: 120, rating: 4.5, popularity: 74, trending: false,
    homeTeam: 'Charminar City', awayTeam: 'Mula Athletic', tournament: 'Deccan City League', venueNote: 'CineBook Charminar Arena',
    description: 'A fictional local derby under the lights in the Deccan City League.'
  },
  {
    key: 'pune-hockey', title: 'Mula Falcons vs Capital Blades', type: 'sports', sport: 'hockey', city: 'Pune', status: 'nowShowing',
    posterUrl: image('photo-1521412644187-c49fa049e84d', 900), bannerUrl: image('photo-1461896836934-ffe607ba8211'),
    language: 'Live sport', genre: ['Hockey'], duration: 150, rating: 4.7, popularity: 78, trending: false,
    homeTeam: 'Mula Falcons', awayTeam: 'Capital Blades', tournament: 'National Hockey Series', venueNote: 'CineBook Mula Sports Arena',
    description: 'A fictional league match featuring two fast-moving hockey teams.'
  }
)

const getDate = (daysAhead) => {
  const date = new Date()
  date.setUTCHours(12, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + daysAhead)
  return date.toISOString().slice(0, 10)
}

const upsertOnce = (Model, filter, values) =>
  Model.findOneAndUpdate(filter, { $setOnInsert: values }, { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true })

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cinebook')

  await City.bulkWrite(cities.map(([name, state]) => ({
    updateOne: { filter: { name }, update: { $setOnInsert: { name, state } }, upsert: true }
  })))
  const cityDocs = new Map((await City.find({ name: { $in: cities.map(([name]) => name) } })).map(city => [city.name, city]))

  const managerEmail = String(process.env.CINEBOOK_MANAGER_EMAIL || '').trim().toLowerCase()
  const managerPassword = String(process.env.CINEBOOK_MANAGER_PASSWORD || '')
  let manager = null
  if (managerEmail && managerPassword) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail) || managerPassword.length < 12) {
      throw new Error('CINEBOOK_MANAGER_EMAIL must be a valid email and CINEBOOK_MANAGER_PASSWORD must be at least 12 characters')
    }
    manager = await User.findOne({ email: managerEmail })
    if (!manager) {
      manager = await User.create({
        name: 'CineBook Manager',
        email: managerEmail,
        passwordHash: await bcrypt.hash(managerPassword, 12),
        role: 'manager',
        isActive: true
      })
    } else if (manager.role !== 'manager') {
      throw new Error(`The configured manager email already belongs to a ${manager.role} account; choose a different CINEBOOK_MANAGER_EMAIL`)
    }
  }

  const adminEmail = String(process.env.CINEBOOK_ADMIN_EMAIL || '').trim().toLowerCase()
  const adminPassword = String(process.env.CINEBOOK_ADMIN_PASSWORD || '')
  if (adminEmail && adminPassword && !await User.exists({ email: adminEmail })) {
    await User.create({
      name: 'Administrator',
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: 'admin',
      isActive: true
    })
  }

  const venueDocs = new Map()
  for (const venue of venues) {
    const city = cityDocs.get(venue.city)
    const doc = await upsertOnce(Theatre, { name: venue.name, city: city._id, venueType: venue.venueType }, {
      name: venue.name,
      venueType: venue.venueType,
      city: city._id,
      address: venue.address,
      district: venue.district,
      state: venue.state,
      pincode: venue.pincode,
      formats: venue.formats,
      archived: false
    })
    venueDocs.set(venue.key, doc)
  }

  const screenSpecs = [
    ['ahmedabad-cinema-1', 'Sabarmati Screen 1', 'ahmedabad-cinema', 48],
    ['ahmedabad-main', 'Riverfront Main Stand', 'ahmedabad-stadium', 72],
    ['bengaluru-cinema-1', 'Garden City Screen 1', 'bengaluru-cinema', 48],
    ['chennai-cinema-1', 'Marina Screen 1', 'chennai-cinema', 48],
    ['chennai-main', 'Coromandel Main Stand', 'chennai-stadium', 72],
    ['delhi-cinema-1', 'Capital Screen 1', 'delhi-cinema', 48],
    ['delhi-main', 'Yamuna Main Stand', 'delhi-stadium', 72],
    ['hyderabad-cinema-1', 'Deccan Screen 1', 'hyderabad-cinema', 48],
    ['hyderabad-main', 'Charminar Main Stand', 'hyderabad-stadium', 72],
    ['pune-cinema-1', 'Deccan Pune Screen 1', 'pune-cinema', 48],
    ['pune-main', 'Mula Main Stand', 'pune-stadium', 72],
    ['lakeview-1', 'Lakeview · Screen 1', 'lakeview', 48],
    ['lakeview-2', 'Lakeview · Screen 2', 'lakeview', 48],
    ['riverside-1', 'Riverside · Screen 1', 'riverside', 48],
    ['eastbank-main', 'Eastbank · Main Bowl', 'eastbank', 72],
    ['marine-1', 'Marine · Screen 1', 'marine', 48],
    ['harbour-main', 'Harbour · Main Stand', 'harbour', 72]
  ]
  const screenDocs = new Map()
  for (const [key, name, venueKey, capacity] of screenSpecs) {
    const theatre = venueDocs.get(venueKey)
    const prices = theatre.venueType === 'stadium' ? stadiumSeatPrices : cinemaSeatPrices
    let screen = await Screen.findOne({ name, theatre: theatre._id })
    if (!screen) {
      screen = await Screen.create({
        name,
        theatre: theatre._id,
        capacity,
        seatPrices: prices,
        seats: makeSeats(capacity, prices),
        archived: false
      })
    } else {
      const schedules = await Show.find({ screen: screen._id }).select('bookedSeats lockedSeats').lean()
      const hasInventory = schedules.some(show =>
        show.bookedSeats?.length || show.lockedSeats?.some(lock => lock.expiresAt > new Date())
      )
      const currentPrices = screen.seatPrices || {}
      const oldSeedPrices = Number(currentPrices.premium) === 450 &&
        Number(currentPrices.comfort) === 300 && Number(currentPrices.standard) === 200
      const legacySampleLayout = (theatre.venueType === 'cinema' && screen.capacity === 18) ||
        (theatre.venueType === 'stadium' && oldSeedPrices)
      if (legacySampleLayout && !hasInventory) {
        screen.capacity = capacity
        screen.seatPrices = prices
        screen.seats = makeSeats(capacity, prices)
        screen.archived = false
        await screen.save()
      }
    }
    screenDocs.set(key, screen)
  }

  const eventDocs = new Map()
  for (const spec of eventSpecs) {
    const city = cityDocs.get(spec.city)
    const { key, ...values } = spec
    const event = await upsertOnce(Movie, { title: values.title, type: values.type, city: city._id }, {
      ...values,
      city: city._id,
      published: true,
      archived: false
    })
    eventDocs.set(key, event)
  }

  const showSpecs = [
    ['ahmedabad-film', 'ahmedabad-cinema-1', 'ahmedabad-cinema', '18:45', 220],
    ['ahmedabad-football', 'ahmedabad-main', 'ahmedabad-stadium', '19:00', 500],
    ['bengaluru-film', 'bengaluru-cinema-1', 'bengaluru-cinema', '19:15', 220],
    ['chennai-film', 'chennai-cinema-1', 'chennai-cinema', '18:30', 220],
    ['chennai-cricket', 'chennai-main', 'chennai-stadium', '18:00', 500],
    ['delhi-film', 'delhi-cinema-1', 'delhi-cinema', '19:00', 220],
    ['delhi-basketball', 'delhi-main', 'delhi-stadium', '19:30', 500],
    ['hyderabad-film', 'hyderabad-cinema-1', 'hyderabad-cinema', '18:45', 220],
    ['hyderabad-football', 'hyderabad-main', 'hyderabad-stadium', '19:15', 500],
    ['pune-film', 'pune-cinema-1', 'pune-cinema', '19:30', 220],
    ['pune-hockey', 'pune-main', 'pune-stadium', '18:30', 500],
    ['monsoon-letters', 'lakeview-1', 'lakeview', '18:30', 200],
    ['monsoon-letters', 'riverside-1', 'riverside', '21:00', 200],
    ['midnight-express', 'lakeview-2', 'lakeview', '19:00', 200],
    ['blue-hour', 'marine-1', 'marine', '19:30', 200],
    ['kolkata-cricket', 'eastbank-main', 'eastbank', '18:00', 500],
    ['mumbai-hockey', 'harbour-main', 'harbour', '18:30', 500]
  ]
  for (const [eventKey, screenKey, venueKey, time, basePrice] of showSpecs) {
    const movie = eventDocs.get(eventKey)
    const screen = screenDocs.get(screenKey)
    const theatre = venueDocs.get(venueKey)
    for (const daysAhead of [2, 3]) {
      const date = getDate(daysAhead)
      const day = new Date(`${date}T12:00:00.000Z`)
      const dateLabel = `${day.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })} ${day.getUTCDate()}`
      const seedKey = `${eventKey}:${screenKey}:${time.replace(/\D/g, '')}:${daysAhead}`
      const showFilter = { movie: movie._id, screen: screen._id, date, time }
      const showValues = {
        seedKey,
        movie: movie._id,
        theatre: theatre._id,
        screen: screen._id,
        date,
        dateLabel,
        time,
        basePrice,
        active: true,
        archived: false,
        lockedSeats: [],
        bookedSeats: []
      }
      let show = await Show.findOne({ seedKey })
      if (!show) {
        show = await Show.findOne({ ...showFilter, seedKey: { $exists: false } }).sort('date')
      }
      if (!show) show = await Show.create(showValues)
      else {
        const hasInventory = show.bookedSeats?.length || show.lockedSeats?.some(lock => lock.expiresAt > new Date())
        if (!hasInventory) {
          show.seedKey = seedKey
          show.theatre = theatre._id
          show.date = date
          show.dateLabel = dateLabel
          show.basePrice = basePrice
          await show.save()
        }
      }
    }
  }

  for (const cityName of ['Kolkata', 'Mumbai']) {
    const city = cityDocs.get(cityName)
    const featured = [...eventDocs.values()].find(event => String(event.city) === String(city._id))
    await upsertOnce(Banner, { title: `A night out in ${cityName}`, city: city._id }, {
      title: `A night out in ${cityName}`,
      description: 'Explore films and live events near you.',
      imageUrl: featured?.bannerUrl || featured?.posterUrl,
      targetUrl: featured ? `/movies/${featured._id}` : '/movies',
      city: city._id,
      order: cityName === 'Kolkata' ? 1 : 2,
      active: true
    })
  }

  console.log(`Seed complete: ${cities.length} city choices, ${venues.length} sample venues, ${screenSpecs.length} screens, ${eventSpecs.length} events, and ${showSpecs.length * 2} upcoming shows.`)
  if (manager) console.log(`Manager account ready: ${manager.email} (database id ${manager._id}). Password is read from CINEBOOK_MANAGER_PASSWORD and is never printed.`)
  else console.log('Set CINEBOOK_MANAGER_EMAIL and CINEBOOK_MANAGER_PASSWORD in backend/.env to create the manager login.')
}

run()
  .catch((error) => {
    console.error('Seed failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
