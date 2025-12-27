const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Connection options for better compatibility
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    
    // More detailed error information
    if (error.name === 'MongoServerSelectionError') {
      console.error('⚠️  Possible causes:');
      console.error('   1. Check if your IP is whitelisted in MongoDB Atlas');
      console.error('   2. Verify your connection string is correct');
      console.error('   3. Check your internet connection');
    }
    
    process.exit(1);
  }
};

module.exports = connectDB;

