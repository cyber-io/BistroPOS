# Production Deployment & Environment Guide

## 1. Environment Variables Configuration (Section 84)

Never commit secrets to source control. Configure the following environment variables across deployment environments:

### Backend (.NET 8 Web API)
```env
ASPNETCORE_ENVIRONMENT=Production

# Database (PostgreSQL / Supabase / Neon / AWS RDS)
ConnectionStrings__DefaultConnection="Host=your-db-host.com;Port=5432;Database=postgres;Username=postgres;Password=your-strong-password;SSL Mode=Require;"

# Security & Token Signing (Minimum 32 characters)
Jwt__SecretKey="BistroPOS_Production_Jwt_Secret_Key_2026_AtLeast32Chars!"
Security__ResourceTokenKey="BistroPOS_Production_Resource_Token_Key_2026_Secure32!"

# CORS: Add your frontend deployed domain(s)
Security__CorsAllowedOrigins__0="https://bistropos.vercel.app"
Security__CorsAllowedOrigins__1="https://yourrestaurant.com"

# Optional: Initial Super Admin Setup (Auto-seeds if database is empty)
ADMIN_INITIAL_EMAIL="superadmin@bistropos.com"
ADMIN_INITIAL_PASSWORD="Admin@Bistro2026!"

# Payment Gateway (Optional - for live Razorpay payments)
PaymentGateway__Provider="Razorpay"
PaymentGateway__ApiKey="rzp_live_your_api_key"
PaymentGateway__SecretKey="your_razorpay_secret"
PaymentGateway__WebhookSecret="your_razorpay_webhook_secret"
```

### Frontend (React.js)
```env
# Deployed Backend API base URL
VITE_API_URL="https://api.yourrestaurant.com/api"
# (VITE_API_BASE_URL is also supported as a fallback)

# Default Multi-tenant Restaurant ID
VITE_RESTAURANT_ID="a0000000-0000-0000-0000-000000000001"

# Public website origin for Table QR code generation
VITE_PUBLIC_SITE_URL="https://yourrestaurant.com"
```

---

## 2. Database Migration Execution (Supabase / PostgreSQL)

Execute the database SQL scripts in order using psql or the Supabase SQL editor:
1. `database/migrations/001_initial_schema.sql` (Creates all tables with UUID keys and constraints)
2. `database/migrations/002_indexes_and_constraints.sql` (Creates performance and tenant indexes)
3. `database/functions/001_reservation_functions.sql` (Stored functions for dynamic availability and locking)
4. `database/functions/002_order_functions.sql` (1-min cancellation and state machine validators)
5. `database/policies/001_row_level_security.sql` (Row Level Security policies for all roles)
6. `database/seeds/001_seed_data.sql` (Seed restaurant, tables, categories, dishes, demo accounts)

---

## 3. Running the Backend (.NET 8 Web API)

```bash
cd restaurant-system/backend
dotnet restore
dotnet build -c Release
dotnet run -c Release --urls "http://0.0.0.0:5000"
```

---

## 4. Building and Serving the Frontend (React.js)

```bash
cd restaurant-system/frontend
npm install
npm run build
# The production static assets are compiled into dist/
```
Deploy the `dist/` folder to Cloudflare Pages, AWS S3/CloudFront, Netlify, or serve with an Nginx reverse proxy.
