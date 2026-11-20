# Production Deployment & Environment Guide

## 1. Environment Variables Configuration (Section 84)

Never commit secrets to source control. Configure the following environment variables across deployment environments:

### Backend (.NET 8 Web API)
```env
# Database (Connected to Local Supabase PostgreSQL)
ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=postgres;Username=postgres;Password=your-super-secret-and-long-postgres-password;SSL Mode=Prefer;"

# Supabase Local Stack
Supabase__Url="http://localhost:8000"
Supabase__AnonKey="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE"
Supabase__ServiceRoleKey="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q"
```

### Frontend (React.js)
```env
# Connected to Local Supabase API Gateway & Realtime
VITE_SUPABASE_URL="http://localhost:8000"
VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE"
VITE_API_BASE_URL="http://localhost:5000"
VITE_SIGNALR_HUB_URL="http://localhost:5000/hubs/notifications"
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
