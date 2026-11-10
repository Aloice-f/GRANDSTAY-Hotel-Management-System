# GRANDSTAY Hotel Management System

This package provides the initial real Supabase authentication foundation:
- Customer self-registration (public signup always creates `customer`)
- Email/password login and logout
- Password reset request
- Role-based dashboard section list
- Staff invitations from an authenticated super administrator or hotel manager
- Manager accounts can only be invited by a super administrator
- Server-side JWT verification and role checks

It is NOT yet the complete hotel operations system. Rooms, reservations, guest folios, payments, restaurant, housekeeping records and reports need their own database tables, APIs and screens in later modules.

## 1. Requirements
- Node.js 20 or newer
- Existing Supabase project

## 2. Configure Supabase
1. Open Supabase Dashboard > SQL Editor.
2. Review `database/schema.sql`, then run it.
3. In Authentication > URL Configuration, set your local Site URL to `http://localhost:3000`.
4. Add `http://localhost:3000/**` to Redirect URLs.
5. In Project Settings > API Keys, copy Project URL and publishable (or legacy anon) key.

## 3. Configure files
1. Copy `.env.example` to `.env`.
2. Fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
3. In `public/js/app.js`, replace `SUPABASE_URL` and `SUPABASE_ANON_KEY` placeholders with the same public values.
4. Never place the service-role key in `public/`, HTML, JavaScript delivered to browsers, or GitHub. `.env` is ignored by Git.

## 4. Install and run
```bash
npm install
npm start
```
Open http://localhost:3000

## 5. Bootstrap the first super administrator
1. Register the first account through the site using the email you control.
2. In Supabase Dashboard > Authentication > Users, find that account and copy its UUID.
3. In SQL Editor, run this statement after replacing the UUID:
```sql
update public.profiles
set role = 'super_admin'
where id = 'YOUR-AUTH-USER-UUID';
```
Only do this for the intended first administrator. Do not provide public access to this SQL operation.

## 6. Create staff accounts
Sign in as super administrator. Use Invite staff member to invite:
- hotel_manager (super administrator only)
- receptionist
- accountant
- housekeeping

The invite endpoint requires the server-side service role key and verifies the caller's JWT and profile role first.

## 7. GitHub and deployment
Commit `.env.example`, not `.env`. Do not commit service-role secrets. Configure all environment variables in your hosting provider's private environment settings. Set the start command to `npm start`.

## Important production checklist
- Configure SMTP/email delivery in Supabase Auth.
- Configure the production Site URL and redirect URLs.
- Restrict CORS to your production domain.
- Review Supabase RLS policies and test with separate accounts for every role.
- Add audit logs, backup strategy, HTTPS, and operational modules before using real guest/payment data.
- Do not store raw card details. Integrate a compliant payment provider for card/M-PESA transactions.
