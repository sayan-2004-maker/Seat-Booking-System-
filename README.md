# CineBook

CineBook is an original movie and live-event ticket booking platform built with React, Vite, Express, MongoDB, Mongoose, JWT and bcrypt. The booking flow supports movies, sports fixtures and other published events, with a city-aware discover page and live seat availability.

## Project structure

- `admin/` contains the admin dashboard screen.
- `backend/` contains the Express API, database scripts, and environment files.
- `frontend/` contains the CineBook React app; the previous client app is preserved in `frontend/legacy-client/`.
- The frontend ESLint configuration is in `frontend/eslint.config.js`.
- The root `package.json` provides commands for the frontend and backend.
- `frontend/src/Experience.jsx` contains the responsive discover, sports, event details, live seat map, and checkout experiences.
- `backend/index.js` provides the MongoDB-backed API, authentication, booking inventory, admin operations, and payment verification.

## Accounts and portals

- Customers sign in to keep their profile, preferred city, saved titles, and booking history attached to their own account. The API scopes profile, preferences, favorites, and booking history to the signed-in user.
- The customer portal runs at `http://localhost:5173/`; the separate manager portal runs at `http://localhost:5174/admin.html`. Manager, admin, and super-admin accounts can sign in to manage movies/events, cities, theatres, screens, showtimes, banners, users, and bookings. Super-admin-only actions remain protected by the API.
- The manager portal has its own Vite entry point and port. Its login token is stored separately from customer sessions, and manager API access is still enforced by backend role checks.
- The management console includes database-backed dashboard statistics and date-filtered reports, CSV exports, movie and sports-event CRUD, cinema and stadium venue records, seating sections with category pricing, showtime conflict checks, image uploads and homepage promotions, customer account controls, payment history, and administrator manager-account creation.
- Payment records are intentionally read-only in the manager console. Payment verification and refunds must be handled through the configured payment provider; the console never fabricates a successful payment or refund.
- Promotional carousel banners are managed in the admin portal, stored in MongoDB, and loaded for the selected city. Uploaded images are served from the backend `/uploads` path.
- Show creation and rescheduling validate screen ownership, event city, valid dates, and overlapping active schedules. Shows with bookings or active payment locks cannot be rescheduled.
- Admin role checks are enforced by the API using the current database role. Customer registration always creates a customer account; it cannot grant administrator access.
- Booking records in the admin portal are read-only so the dashboard cannot change payment outcomes or imply a refund that has not been processed.

## Requirements

- Node.js 20+
- MongoDB 7+ running locally or a MongoDB Atlas URI

## Setup

```bash
npm install
copy backend\.env.example backend\.env
```

Set `MONGODB_URI` and `JWT_SECRET` in `backend\.env`, then configure the city choices:

`JWT_SECRET` must be a private random value with at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` and paste its output into `backend\.env`. The API refuses to start with the example placeholder or a missing/short JWT secret. Set `CORS_ORIGINS` to the comma-separated public origins for the customer and manager portals when deploying; local Vite origins are allowed by default.

```bash
npm run seed
```

The setup command is safe to rerun: it adds missing city choices and inserts sample movies, sports fixtures, venues, screens, banners, and upcoming shows into MongoDB without deleting user accounts or bookings. `npm run dev` runs this setup before starting the API and both portals. Sample pincodes include Kolkata `700091`, Mumbai cinema `400001` and stadium `400037`, Ahmedabad `380001`, Bengaluru `560001`, Chennai `600001`, Delhi `110001`, Hyderabad `500001`, and Pune `411001`. These venues, films, and sports fixtures are fictional demo data. Set `CINEBOOK_ADMIN_EMAIL` and `CINEBOOK_ADMIN_PASSWORD` in `backend\.env` to create the initial administrator; credentials are only created if that email does not already exist.

### Share accounts and saved data between computers

Copying the project folder copies the code, not its MongoDB database. The local MongoDB URI in `backend\.env.example` creates a separate database on each computer. To let your friend sign in to the same account and see its profile, favorites, preferences, and bookings, configure both computers with the same MongoDB Atlas database URI in each computer's private `backend\.env`, and allow the friend's network in the Atlas access list. Do not put `.env` or database passwords in the shared folder. Your friend should open the app and sign in with the same email and password; browser login tokens do not transfer between computers. Pincodes selected while signed in are saved with the account, and venue pincodes are stored in MongoDB by the seed command.

Razorpay is the preferred checkout provider when configured. Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to `backend\.env`; only the public key ID is sent to the browser. The backend creates orders using database seat prices, verifies the checkout signature, fetches the payment from Razorpay, and confirms seats only when the expected amount is captured. Razorpay checkout requires valid provider credentials and an account configured for automatic capture.

PayU remains available as a backward-compatible provider. Add `PAYU_KEY` and `PAYU_SALT`; it defaults to test mode (`PAYU_ENV=test`). The server creates the payment hash, redirects to PayU Hosted Checkout, verifies the response hash, and checks the transaction with PayU before confirming a booking. Set `PAYU_ENV=production` only when you intend to use live merchant credentials. For a deployed PayU app, set `PAYU_CALLBACK_URL` to the public HTTPS URL ending in `/api/payments/payu/callback` and set `FRONTEND_URL` to the public client URL. Local development defaults to the local API callback and Vite client.

## Run

Start the database seed, API, customer site, and manager portal together from the project root:

```bash
npm run dev
```

Open the customer portal at `http://localhost:5173/` and the manager portal at `http://localhost:5174/`. Both Vite servers proxy `/api` and `/uploads` requests to the backend at `http://localhost:4000`. Stop all services with `Ctrl+C`. The API and seed step use the MongoDB connection configured in `backend/.env`; startup stops with an error if the seed cannot connect. Build the customer and manager portals with `npm run build` and `npm run build:admin`, respectively.

## API surface

- `GET /api/home`
- `GET /api/events?city=&type=&sport=&date=&q=`
- `GET /api/movies?search=&genre=&language=&sort=`
- `GET /api/movies/:id`
- `GET /api/cities`
- `GET /api/shows/:id/seats`
- `GET /api/payments/methods`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/payments/initiate`
- `POST /api/payments/razorpay/verify`
- `GET /api/bookings`
- `GET /api/bookings/:id`
- `GET /api/admin/stats`

Movie, theatre, screen, seat, and show data is stored in MongoDB and is created through the Manager Portal. The setup command only maintains city choices and can optionally create an initial admin from credentials configured in `backend\.env`.

## Notes

Payment secrets stay on the server. Seats are reserved atomically and confirmed only after the selected provider verifies payment. Configure provider credentials before accepting real payments. For production, run MongoDB as a replica set or Atlas cluster and configure HTTPS callback URLs for PayU.
