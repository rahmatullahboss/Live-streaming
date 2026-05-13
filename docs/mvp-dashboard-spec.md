# MVP Dashboard Spec — Live Streaming Studio

## Overview

Two dashboards serve two distinct user types:

- **User Dashboard** → tenants who buy packages and manage their own rooms
- **Admin Dashboard** → operators who control packages, payments, users, and system

---

## User Dashboard (`/dashboard`)

**Goal:** Buy + Use + Track

### Pages / Sections

#### 1. Dashboard Home
- Current plan name
- Remaining hours / usage (available rooms, time remaining, used time)
- Active rooms count
- "Create Room" button

#### 2. Packages / Pricing
- List all plans (Free / Starter Live / Matchday Pro / Season Ops)
- Each shows: hours, rooms, cameras, ad videos, price
- "Buy / Upgrade" button per plan

#### 3. My Subscription / Billing
- Current plan details
- Expiry date
- Usage stats (used vs remaining)
- Payment history

#### 4. Rooms Management
- Create room (modal)
- Room list (live / inactive)
- Per room: Studio / Camera Join / Watch links
- Pause / Resume / Close room actions

#### 5. Account Settings
- Profile (name, email)
- Password change
- Connected platforms (YouTube / Facebook per room)

### MVP Scope (v1)
- [x] Current plan + usage display
- [x] Available rooms + time remaining
- [x] Create room
- [x] bKash payment submission
- [x] Purchase history with status
- [x] Room actions (pause/resume/close)
- [ ] Payment history page
- [ ] Account settings (profile/password/platforms)

---

## Admin Dashboard (`/admin`)

**Goal:** Control + Approve + Monitor

### Pages / Sections

#### 1. Dashboard Overview
- Total users (tenants)
- Active subscriptions
- Revenue (MRR / ARR / Total)
- Active streams count
- Payment method breakdown

#### 2. User Management
- All users list (name, email, plan, status)
- Manual upgrade / downgrade
- Ban / unban user

#### 3. Package Management
- Create new package
- Edit price / features / limits
- Activate / deactivate plan

#### 4. Payments / Approvals
- Pending manual payments (bKash)
- Approve / reject with one click
- Payment history

#### 5. Usage Monitoring
- Per-user hours used
- Per-user room count
- Per-user streaming activity

#### 6. System Control
- Force stop a stream
- Ban user
- Limit / suspend usage

### Admin Tabs (current implementation)
| Tab | Purpose |
|-----|---------|
| Overview | Revenue metrics, tenant counts, streaming stats |
| Packages | Package editor (CRUD) |
| Payments | Manual payment queue (approve/reject) |
| Rooms | All rooms table (name, PIN, status, tenant, expiry) |
| Audit Log | Filtered admin action history |
| Tenants | User list |

### MVP Scope (v1)
- [x] Revenue overview (MRR/ARR/Total)
- [x] User list (tenants)
- [x] Package management (CRUD)
- [x] Payment approvals (approve/reject)
- [x] Rooms table
- [x] Audit log with filters
- [ ] User ban/suspend
- [ ] Force stop stream
- [ ] Per-user usage monitoring (placeholder — backend TBD)

---

## Comparison Table

| Feature | User Dashboard | Admin Dashboard |
|---------|--------------|-----------------|
| View plan/usage | ✅ | - |
| Buy/upgrade package | ✅ | - |
| Create room | ✅ | - |
| Pause/resume/close room | ✅ | - |
| View all rooms | - | ✅ |
| Approve/reject payment | - | ✅ |
| Manage packages | - | ✅ |
| User management | - | ✅ |
| Revenue stats | - | ✅ |
| Audit log | - | ✅ |
| System control | - | Partial |
| Usage monitoring | - | Partial |

---

## Simple记忆口诀

```
User dashboard = Buy + Use + Track
Admin dashboard = Control + Approve + Monitor
```

---

## Implementation Status

### User Dashboard ✅ MVP Ready
- `app/routes/dashboard.tsx` — full implementation
- Token-based auth via localStorage
- bKash payment flow with admin approval
- Room CRUD with pause/resume/close
- Purchase history display

### Admin Dashboard ✅ MVP Ready
- `app/routes/admin.tsx` — full implementation
- Email/password auth with HTTP-only cookie
- Tab-based navigation
- Package editor with all fields
- Payment approval queue
- Audit log with action/date filters

### Partially Implemented (Backend needed)
- Per-user usage monitoring (streaming stats table)
- User ban/suspend (backend endpoint)
- Force stop stream (backend action)
- Payment history page (user side)

---

## File Locations

| File | Purpose |
|------|---------|
| `app/routes/dashboard.tsx` | User dashboard |
| `app/routes/admin.tsx` | Admin dashboard |
| `app/lib/realtime.ts` | API calls for both dashboards |
| `workers/app.ts` | Backend API endpoints |