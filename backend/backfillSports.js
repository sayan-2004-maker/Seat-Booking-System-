import 'dotenv/config'
import mongoose from 'mongoose'
const Movie = mongoose.model('Movie', new mongoose.Schema({ title: String, type: String, sport: String, genre: [String] }))
const pairs = [['Mumbai Cricket Showcase','cricket'],['Delhi Cricket Showcase','cricket'],['Bengaluru Cricket Showcase','cricket'],['Chennai Cricket Showcase','cricket'],['Hyderabad Cricket Showcase','cricket'],['Ahmedabad Cricket Showcase','cricket'],['Lucknow Cricket Showcase','cricket']]
await mongoose.connect(process.env.MONGODB_URI||'mongodb://127.0.0.1:27017/cinebook'); for (const [title,sport] of pairs) await Movie.updateOne({title},{$set:{type:'sports',sport,genre:['Sports',sport]}}); await mongoose.disconnect()
