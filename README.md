# GRANDSTAY Hotel Management System

A modular hotel management application built with HTML, CSS, JavaScript, Node.js, Express and Supabase.

## Module 1: Project foundation

This module provides:
- Express application and health endpoint
- Supabase Auth token verification
- Server-side profile and role lookup
- Role authorization middleware
- Initial PostgreSQL schema and RLS policies
- Environment-variable template
- Basic premium navy-and-gold landing page

## Requirements

- Node.js 20+
- npm
- A Supabase project

## Install locally

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd grandstay-hotel
npm install
cp .env.example .env
```

Open `.env` and set:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_ORIGIN`

Never commit `.env`. The service-role key is server-only and bypasses RLS.

## Create the database

1. Open your Supabase project.
2. Select **SQL Editor**.
3. Open `database/schema.sql`.
4. Review the SQL, then run it.
5. Confirm the tables and policies under **Table Editor**.

The first super administrator must be assigned deliberately by a trusted project owner. Create the user through Supabase Authentication, then update that user's profile role using the SQL Editor:

```sql
update public.profiles
set role = 'super_admin'
where id = 'AUTH_USER_UUID';
```

Do not allow public registration to choose privileged roles.

## Run

```bash
npm run dev
```

Open `http://localhost:3000` and test:
- `GET /api/health`
- `GET /api/me` with `Authorization: Bearer SUPABASE_ACCESS_TOKEN`

## Deployment outline

### GitHub
```bash
git init
git add .
git commit -m "Module 1: GRANDSTAY foundation"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

### Render
- Create a **Web Service** connected to the repository.
- Build command: `npm install`
- Start command: `npm start`
- Add environment variables from `.env` in the Render dashboard.
- Set `APP_ORIGIN` to the deployed application origin.

### Supabase
- Keep database credentials and service-role keys in Render environment variables.
- Configure Supabase Auth redirect URLs when the login and registration modules are added.
- Review RLS policies before production use.

### M-PESA
Daraja integration is intentionally reserved for a later module. Credentials and callbacks will be implemented server-side, with payment status based on verified callbacks—not browser claims.

## Security notes

- Never put the service-role key, database password, or Daraja secret in `public/`.
- Use Supabase Auth for identity.
- The API verifies access tokens with Supabase before reading the user's profile.
- Role checks are server-side.
- RLS provides a second authorization boundary for direct client access.
- This is the foundation module, not yet a production-complete hotel application.
