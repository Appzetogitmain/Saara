# Saara E-commerce Platform

A comprehensive multi-vendor e-commerce and logistics platform featuring dedicated interfaces for Customers, Vendors, and Administrators, as well as an integrated Logistics ecosystem (Own Fleet support).

## Project Overview

Saara is a modern, responsive web application built with **React/Vite** on the frontend and **Node.js/Express** on the backend. The platform supports:
- **Customer App**: Multi-vendor checkout, real-time order tracking, wishlists.
- **Vendor Portal**: Product management, fulfillment processing, analytics.
- **Admin Dashboard**: System-wide oversight, vendor payouts, commission tracking.
- **Logistics (Own Fleet)**: Automated delivery assignment, COD remittance tracking, and OTP-based fulfillment verification.

## Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- MongoDB running locally or via Atlas cluster

### 1. Backend Setup
```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory:
```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/saara

# Authentication
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=30d

# Payment Integration (Razorpay)
RAZORPAY_KEY_ID=your_key_here
RAZORPAY_KEY_SECRET=your_secret_here

# Optional: Redis (if used for rate-limiting or sessions)
REDIS_URL=redis://localhost:6379
```

Start the backend server:
```bash
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend/` directory (if required):
```env
VITE_API_URL=http://localhost:5000/api
```

Start the frontend development server:
```bash
npm run dev
```

## Build Process

To build the frontend for production:
```bash
cd frontend
npm run build
```
The output will be generated in the `dist` folder.

## Deployment Steps

1. **Backend**: 
   - Ensure environment variables are set in your production environment (e.g., Vercel, Heroku, Render, AWS).
   - Use `node server.js` for the production start script.
2. **Frontend**:
   - Host the generated `dist` folder on a static hosting service (e.g., Netlify, Vercel, S3).
   - Ensure you add fallback routing (e.g., `_redirects` file for Netlify) to support client-side React Router navigation.

## Known Limitations & Future Enhancements

- **Mock Data for Social Features**: The `Explore` and `Reels` modules on the frontend currently use simulated client-side mock data. Backend APIs for video streaming and social interaction are not yet implemented.
- **Own Fleet Dependency**: External 3rd-party logistics providers (e.g., Delhivery, Dunzo) are architected via strategy patterns but are currently pending active vendor integrations; only the `own_fleet` provider is fully active.
- **Payment Gateway**: Refund initiation is structurally mocked using Razorpay scaffolding; real account settlements require live KYC-verified keys.

## Architecture Overview

- **Monorepo Style**: Separate `/frontend` and `/backend` directories.
- **Modular Frontend**: Driven by distinct roles (`UserApp`, `Vendor`, `Admin`) sharing common utility components (`shared/components`).
- **Event-Driven Backend**: E-commerce events (e.g., `orderPlaced`, `shipmentDelivered`) communicate asynchronously using an internal event bus (`logisticsEventBus`), decoupling core API responses from long-running tasks like vendor Escrow release or rider unassignment.
