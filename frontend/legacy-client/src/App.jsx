import React from 'react'
import Navbar from './components/Navbar'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

const Home = () => <h1 style={{ padding: '30px' }}>Home</h1>
const Movies = () => <h1 style={{ padding: '30px' }}>Movies</h1>
const MovieDetails = () => <h1 style={{ padding: '30px' }}>Movie Details</h1>
const BookingDetails = () => <h1 style={{ padding: '30px' }}>Booking Details</h1>
const MyBookings = () => <h1 style={{ padding: '30px' }}>My Bookings</h1>
const Favorites = () => <h1 style={{ padding: '30px' }}>Favorites</h1>

const App = () => {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/movies' element={<Movies />} />
        <Route path='/movies/:id' element={<MovieDetails />} />
        <Route path='/bookings/:id/:date' element={<BookingDetails />} />
        <Route path='/my-bookings' element={<MyBookings />} />
        <Route path='/favorites' element={<Favorites />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App