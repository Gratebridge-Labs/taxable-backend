# Taxable Backend - Setup Guide

## Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or cloud instance like MongoDB Atlas)
- npm or yarn

## Installation Steps

### 1. Install Dependencies

```bash
cd taxable-backend
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/taxable?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
EMAIL_HOST=mail.gettaxable.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=do_not_reply@gettaxable.com
EMAIL_PASS=your-email-password
EMAIL_FROM=do_not_reply@gettaxable.com
EMAIL_FROM_NAME=Taxable
```

### 3. Start MongoDB

**Local MongoDB:**
```bash
# Make sure MongoDB is running
mongod
```

**MongoDB Atlas (Cloud):**
- Get your connection string from MongoDB Atlas
- Update `MONGODB_URI` in `.env`

### 4. Create Upload Directory

```bash
mkdir uploads
```

### 5. Start the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server should start on `http://localhost:3000`

## Testing the API

### 1. Test Server Health

```bash
curl http://localhost:3000/
```

Expected response:
```json
{
  "message": "Taxable Backend API",
  "version": "1.0.0",
  "status": "running"
}
```

### 2. Register a User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### 3. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Save the token from the response for authenticated requests.

### 4. Get User Profile (Authenticated)

```bash
curl http://localhost:3000/api/users/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Project Structure

```
taxable-backend/
├── config/
│   ├── db.js              # MongoDB connection
│   └── constants.js       # Tax constants and configurations
├── controllers/
│   ├── authController.js  # Authentication logic
│   └── userController.js  # User management logic
├── middleware/
│   └── authMiddleware.js  # JWT authentication middleware
├── models/
│   └── User.js            # User model/schema
├── routes/
│   ├── authRoutes.js      # Authentication routes
│   └── userRoutes.js      # User routes
├── services/
│   ├── taxCalculator.js   # Tax calculation logic
│   └── tipsEngine.js      # Tips generation logic
├── utils/
│   └── helpers.js         # Helper functions
├── .env                   # Environment variables (create this)
├── .env.example           # Environment variables template
├── .gitignore
├── package.json
├── server.js              # Entry point
└── SETUP.md               # This file
```

## API Endpoints (Implemented)

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### User Management
- `GET /api/users/profile` - Get user profile (protected)
- `PUT /api/users/profile` - Update user profile (protected)
- `PATCH /api/users/tin` - Update TIN (protected)

## Next Steps

1. ✅ Project setup and authentication - **COMPLETED**
2. ⏳ Document upload system
3. ⏳ Transaction management
4. ⏳ Tax calculation integration
5. ⏳ Report generation
6. ⏳ Tips and suggestions API

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running
- Check `MONGODB_URI` in `.env`
- Verify MongoDB connection string format

### Port Already in Use
- Change `PORT` in `.env`
- Or kill the process using port 3000:
  ```bash
  lsof -ti:3000 | xargs kill
  ```

### JWT Errors
- Ensure `JWT_SECRET` is set in `.env`
- Use a strong, random secret key in production

## Development Tips

- Use `npm run dev` for auto-reload during development
- Check console logs for debugging
- Use Postman or similar tools for API testing
- Keep `.env` out of version control (already in `.gitignore`)

