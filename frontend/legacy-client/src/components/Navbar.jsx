import React from 'react'
import { Link } from 'react-router-dom'

const Navbar = () => {
  return (
    <nav
      style={{
        background: '#111',
        padding: '20px',
        display: 'flex',
        gap: '20px'
      }}
    >
      <Link to='/' style={{ color: 'white' }}>Home</Link>
      <Link to='/movies' style={{ color: 'white' }}>Movies</Link>
      <Link to='/my-bookings' style={{ color: 'white' }}>My Bookings</Link>
      <Link to='/favorites' style={{ color: 'white' }}>Favorites</Link>
    </nav>
  )
}

export default Navbar