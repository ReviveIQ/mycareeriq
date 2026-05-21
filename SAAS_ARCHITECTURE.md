# Multi-User SaaS Architecture Plan

**Status**: Phase 1 - Architecture Planning (COMPLETE)  
**Date**: May 20, 2026  
**Target Conversion**: Single-user pipeline → Multi-user SaaS platform

---

## 1. Executive Summary

This document outlines the complete architecture for converting the job search pipeline from a single-user tool into a multi-user SaaS platform. The conversion maintains backward compatibility with the existing single user while enabling team collaboration, workspace management, and subscription-based billing.

**Key Principles:**
- ✅ Workspace-based multi-tenancy (data isolation)
- ✅ Role-based access control (RBAC)
- ✅ Subscription billing with Stripe
- ✅ Minimal code changes to existing features
- ✅ Gradual migration path for existing user

---

## 2. Database Schema Design

### 2.1 New Tables Required

#### `workspaces` Table
```sql
CREATE TABLE workspaces (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  ownerId INT NOT NULL,
  plan ENUM('free', 'pro', 'enterprise') DEFAULT 'free',
  status ENUM('active', 'suspended', 'deleted') DEFAULT 'active',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ownerId) REFERENCES users(id),
  INDEX (ownerId),
  INDEX (slug)
);
```

**Purpose**: Represents a team/organization workspace. Each workspace is isolated and has its own data, settings, and subscription.

**Key Fields:**
- `slug`: URL-friendly identifier (e.g., "acme-corp")
- `plan`: Subscription tier (free, pro, enterprise)
- `status`: Workspace state management

---

#### `workspace_members` Table
```sql
CREATE TABLE workspace_members (
  id INT PRIMARY KEY AUTO_INCREMENT,
  workspaceId INT NOT NULL,
  userId INT NOT NULL,
  role ENUM('owner', 'manager', 'member') DEFAULT 'member',
  invitedBy INT,
  joinedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('active', 'invited', 'inactive') DEFAULT 'active',
  FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invitedBy) REFERENCES users(id),
  UNIQUE KEY (workspaceId, userId),
  INDEX (userId),
  INDEX (role)
);
```

**Purpose**: Manages team membership, roles, and permissions.

**Role Definitions:**
- **Owner**: Full control, billing, workspace settings, can delete workspace
- **Manager**: Can manage team members, view all data, modify settings
- **Member**: Can view and create applications, limited access to settings

---

#### `workspace_settings` Table
```sql
CREATE TABLE workspace_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  workspaceId INT NOT NULL UNIQUE,
  rolesPerDay INT DEFAULT 30,
  targetRoles TEXT,
  categories TEXT,
  remoteOnly BOOLEAN DEFAULT FALSE,
  usHiringOnly BOOLEAN DEFAULT TRUE,
  emailNotifications BOOLEAN DEFAULT TRUE,
  dailyDigest BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

**Purpose**: Workspace-level job research configuration (replaces user-level `researchConfig`).

---

#### `subscriptions` Table
```sql
CREATE TABLE subscriptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  workspaceId INT NOT NULL UNIQUE,
  stripeCustomerId VARCHAR(255),
  stripeSubscriptionId VARCHAR(255),
  plan ENUM('free', 'pro', 'enterprise') DEFAULT 'free',
  status ENUM('active', 'past_due', 'canceled', 'unpaid') DEFAULT 'active',
  currentPeriodStart DATE,
  currentPeriodEnd DATE,
  canceledAt TIMESTAMP NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE,
  INDEX (stripeCustomerId),
  INDEX (stripeSubscriptionId)
);
```

**Purpose**: Stripe subscription tracking and billing management.

---

#### `workspace_invitations` Table
```sql
CREATE TABLE workspace_invitations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  workspaceId INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  role ENUM('manager', 'member') DEFAULT 'member',
  token VARCHAR(255) UNIQUE NOT NULL,
  invitedBy INT NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  acceptedAt TIMESTAMP NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (invitedBy) REFERENCES users(id),
  INDEX (token),
  INDEX (email),
  INDEX (expiresAt)
);
```

**Purpose**: Manage pending team member invitations with expiring tokens.

---

### 2.2 Modified Existing Tables

#### `users` Table (Add Field)
```sql
ALTER TABLE users ADD COLUMN defaultWorkspaceId INT NULL;
ALTER TABLE users ADD FOREIGN KEY (defaultWorkspaceId) REFERENCES workspaces(id);
```

**Purpose**: Track user's default workspace for faster loading.

---

#### `companies` Table (Add Field)
```sql
ALTER TABLE companies ADD COLUMN workspaceId INT NOT NULL;
ALTER TABLE companies ADD FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE companies ADD INDEX (workspaceId);
```

**Purpose**: Associate pipeline companies with workspaces (data isolation).

---

#### `applications` Table (Add Field)
```sql
ALTER TABLE applications ADD COLUMN workspaceId INT NOT NULL;
ALTER TABLE applications ADD FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE applications ADD INDEX (workspaceId);
```

**Purpose**: Isolate applications by workspace.

---

### 2.3 Data Migration Strategy

**For Existing User (Bryan):**
1. Create default workspace: "My Personal"
2. Create workspace_members entry with role="owner"
3. Migrate existing companies to workspace
4. Migrate existing applications to workspace
5. Migrate researchConfig to workspace_settings
6. Set defaultWorkspaceId on user record

**SQL Migration:**
```sql
-- Create default workspace for existing user
INSERT INTO workspaces (name, slug, ownerId, plan) 
VALUES ('My Personal', 'my-personal', 1, 'free');

-- Get workspace ID
SET @workspaceId = LAST_INSERT_ID();

-- Add user as owner
INSERT INTO workspace_members (workspaceId, userId, role, status)
VALUES (@workspaceId, 1, 'owner', 'active');

-- Migrate companies
UPDATE companies SET workspaceId = @workspaceId WHERE userId = 1;

-- Migrate applications
UPDATE applications SET workspaceId = @workspaceId WHERE userId = 1;

-- Migrate settings
INSERT INTO workspace_settings (workspaceId, rolesPerDay, targetRoles, categories, remoteOnly, usHiringOnly)
SELECT @workspaceId, rolesPerDay, targetRoles, categories, remoteOnly, usHiringOnly
FROM researchConfig WHERE userId = 1;

-- Set default workspace
UPDATE users SET defaultWorkspaceId = @workspaceId WHERE id = 1;
```

---

## 3. Subscription Tiers & Pricing

### 3.1 Pricing Model

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| **Price** | $0/mo | $29/mo | Custom |
| **Team Members** | 1 | 5 | Unlimited |
| **Companies/Pipeline** | 30 | 500 | Unlimited |
| **Daily Job Research** | ✅ 30 roles | ✅ 100 roles | ✅ Unlimited |
| **AI Applications** | ✅ 5/day | ✅ 50/day | ✅ Unlimited |
| **Email Lookup (Hunter)** | ✅ 100/mo | ✅ 1000/mo | ✅ Unlimited |
| **Analytics** | ✅ Basic | ✅ Advanced | ✅ Advanced + API |
| **API Access** | ❌ | ✅ | ✅ |
| **Priority Support** | ❌ | ❌ | ✅ |
| **Custom Integrations** | ❌ | ❌ | ✅ |

### 3.2 Feature Flags by Plan

```typescript
// server/_core/features.ts
export const PLAN_FEATURES = {
  free: {
    maxTeamMembers: 1,
    maxCompanies: 30,
    rolesPerDay: 30,
    applicationsPerDay: 5,
    hunterLookupsPerMonth: 100,
    apiAccess: false,
    advancedAnalytics: false,
  },
  pro: {
    maxTeamMembers: 5,
    maxCompanies: 500,
    rolesPerDay: 100,
    applicationsPerDay: 50,
    hunterLookupsPerMonth: 1000,
    apiAccess: true,
    advancedAnalytics: true,
  },
  enterprise: {
    maxTeamMembers: Infinity,
    maxCompanies: Infinity,
    rolesPerDay: Infinity,
    applicationsPerDay: Infinity,
    hunterLookupsPerMonth: Infinity,
    apiAccess: true,
    advancedAnalytics: true,
  },
};
```

---

## 4. Authentication & Authorization

### 4.1 Current State
✅ Manus OAuth already implemented  
✅ Session cookies working  
✅ User context available in tRPC

### 4.2 Required Changes

**Context Enhancement:**
```typescript
// server/_core/context.ts
export async function createContext(opts: CreateContextOptions) {
  const user = await getCurrentUser(opts.req);
  
  // Get current workspace from header or default
  const workspaceId = opts.req.headers['x-workspace-id'] || user?.defaultWorkspaceId;
  
  // Fetch workspace and member info
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  
  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, user.id),
    ),
  });
  
  return {
    user,
    workspace,
    member,
    workspaceId,
  };
}
```

### 4.3 Authorization Middleware

```typescript
// server/_core/trpc.ts
export const protectedProcedure = baseProcedure
  .use(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return next({ ctx });
  });

export const workspaceProcedure = protectedProcedure
  .use(async ({ ctx, next }) => {
    if (!ctx.workspace || !ctx.member) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this workspace' });
    }
    return next({ ctx });
  });

export const managerProcedure = workspaceProcedure
  .use(async ({ ctx, next }) => {
    if (!['owner', 'manager'].includes(ctx.member.role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Manager access required' });
    }
    return next({ ctx });
  });

export const ownerProcedure = workspaceProcedure
  .use(async ({ ctx, next }) => {
    if (ctx.member.role !== 'owner') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Owner access required' });
    }
    return next({ ctx });
  });
```

---

## 5. API Procedure Updates Strategy

### 5.1 Query Filtering Pattern

**Before (Single-User):**
```typescript
export const getCompanies = publicProcedure
  .query(async ({ ctx }) => {
    return db.query.companies.findMany({
      where: eq(companies.userId, ctx.user.id),
    });
  });
```

**After (Multi-User):**
```typescript
export const getCompanies = workspaceProcedure
  .query(async ({ ctx }) => {
    return db.query.companies.findMany({
      where: eq(companies.workspaceId, ctx.workspaceId),
    });
  });
```

### 5.2 Procedures Requiring Updates

**Pipeline Router (4 procedures):**
- getCompanies → Filter by workspaceId
- getCompanyCount → Filter by workspaceId
- getHighPriority → Filter by workspaceId
- getRemoteCount → Filter by workspaceId

**Application Router (3 procedures):**
- generate → Filter by workspaceId
- send → Filter by workspaceId
- list → Filter by workspaceId

**Email Lookup Router (2 procedures):**
- lookup → Filter by workspaceId
- lookupBatch → Filter by workspaceId

**Monitoring Router (4 procedures):**
- getResearchHistory → Filter by workspaceId
- getHealthStatus → Filter by workspaceId
- getExecutionStats → Filter by workspaceId
- getRecentExecutions → Filter by workspaceId

**Job Research Service:**
- runDailyJobResearch → Run per workspace
- addJobsToPipeline → Add to workspace pipeline

**Total: 40+ procedures to update**

---

## 6. Frontend Architecture Changes

### 6.1 New Components Required

**WorkspaceSwitcher.tsx**
- Dropdown showing user's workspaces
- Quick switch between workspaces
- "Create Workspace" button

**TeamManagement.tsx**
- View team members
- Invite new members
- Manage roles and permissions
- Remove members

**WorkspaceSettings.tsx**
- Workspace name and description
- Plan information and upgrade button
- Billing management
- Danger zone (delete workspace)

**InvitationAccept.tsx**
- Accept workspace invitation
- Show workspace details
- Join workspace flow

### 6.2 Layout Changes

**Header Enhancement:**
```
[Logo] [WorkspaceSwitcher] [Navigation] [User Menu]
                ↓
        "My Personal" ▼
        "Acme Corp"
        "Startup XYZ"
        + Create Workspace
```

**Settings Tab Reorganization:**
```
Settings
├── Job Research (workspace-level)
├── Team Management (new)
├── Billing & Subscription (new)
├── Workspace Settings (new)
└── Personal Settings (user-level)
```

---

## 7. Stripe Integration Points

### 7.1 Webhook Handlers Required

```typescript
// server/_core/stripe.ts
export async function handleStripeWebhook(event: Stripe.Event) {
  switch (event.type) {
    case 'customer.subscription.created':
      // Update workspace subscription
      break;
    case 'customer.subscription.updated':
      // Update plan and features
      break;
    case 'customer.subscription.deleted':
      // Downgrade to free plan
      break;
    case 'invoice.payment_succeeded':
      // Log successful payment
      break;
    case 'invoice.payment_failed':
      // Handle failed payment
      break;
  }
}
```

### 7.2 Billing Routes

- `POST /api/billing/create-checkout` → Create Stripe checkout session
- `POST /api/billing/manage-subscription` → Stripe customer portal
- `POST /api/billing/cancel-subscription` → Cancel subscription
- `POST /api/stripe-webhook` → Handle Stripe events

---

## 8. Job Research Execution Changes

### 8.1 Current Flow (Single-User)
```
Cron (8 AM EST)
  → runDailyJobResearch(userId)
  → Search jobs
  → Add to companies table
  → Send notification
```

### 8.2 New Flow (Multi-User)
```
Cron (8 AM EST)
  → Get all active workspaces with subscription
  → For each workspace:
    → runDailyJobResearch(workspaceId)
    → Search jobs
    → Add to workspace companies
    → Send workspace notification
```

**Implementation:**
```typescript
// server/jobResearchService.ts
export async function runDailyJobResearchForAllWorkspaces() {
  const workspaces = await db.query.workspaces.findMany({
    where: eq(workspaces.status, 'active'),
  });
  
  for (const workspace of workspaces) {
    await runDailyJobResearch(workspace.id);
  }
}
```

---

## 9. Implementation Roadmap

### Phase 2: Core Infrastructure (2-3 hours)
- [ ] Create all new database tables
- [ ] Run migration for existing user
- [ ] Update context with workspace info
- [ ] Implement RBAC middleware

### Phase 3: Database Schema (1 hour)
- [ ] Add workspaceId to companies and applications
- [ ] Create indexes for performance
- [ ] Test migration on staging

### Phase 4: Authorization (1 hour)
- [ ] Implement workspaceProcedure, managerProcedure, ownerProcedure
- [ ] Add permission checks to all procedures
- [ ] Test authorization logic

### Phase 5: UI Components (2 hours)
- [ ] Build WorkspaceSwitcher
- [ ] Build TeamManagement
- [ ] Build WorkspaceSettings
- [ ] Update header and navigation

### Phase 6: Stripe Integration (1-2 hours)
- [ ] Set up Stripe account
- [ ] Create billing routes
- [ ] Implement webhook handlers
- [ ] Add subscription management UI

### Phase 7: Procedure Updates (2-3 hours)
- [ ] Update all 40+ procedures
- [ ] Add workspaceId filtering
- [ ] Test data isolation

### Phase 8: Testing (1-2 hours)
- [ ] Write multi-user tests
- [ ] Test permission enforcement
- [ ] Test data isolation
- [ ] Test billing flows

### Phase 9: Deployment (30 minutes)
- [ ] Run migrations
- [ ] Deploy code
- [ ] Verify existing user still works
- [ ] Monitor for issues

---

## 10. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Workspace-based multi-tenancy** | Simple, secure, easy to understand |
| **Query-level filtering** | No need for row-level security in database |
| **Role-based access control** | Flexible permissions, easy to extend |
| **Stripe for billing** | Industry standard, reliable, secure |
| **Workspace context in tRPC** | Automatic enforcement at API layer |
| **Keep existing user in free plan** | No disruption, can upgrade later |
| **Gradual migration** | Minimize risk, test thoroughly |

---

## 11. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **Data corruption during migration** | Test on staging, backup production, verify counts |
| **Breaking existing user experience** | Migrate to default workspace, maintain all features |
| **Performance issues with multi-workspace queries** | Add indexes, monitor query performance |
| **Authorization bypass** | Implement comprehensive tests, code review |
| **Stripe integration failures** | Implement retry logic, webhook verification |
| **Team member data leakage** | Enforce workspaceId in all queries, test isolation |

---

## 12. Success Criteria

✅ **Phase 1 Complete When:**
- [x] Database schema designed and documented
- [x] Subscription tiers defined
- [x] Authorization model specified
- [x] Implementation roadmap created
- [x] Risk mitigation strategies documented

✅ **Full Conversion Complete When:**
- [ ] All phases implemented
- [ ] 100+ tests passing
- [ ] Zero data leakage between workspaces
- [ ] Billing working end-to-end
- [ ] Existing user migrated successfully
- [ ] New users can sign up and create workspaces
- [ ] Team collaboration features working

---

## 13. Next Steps (Phase 2 - Tomorrow)

When resuming tomorrow:

1. **Create Drizzle schema files:**
   - `drizzle/schema.ts` → Add new tables
   - `drizzle/relations.ts` → Update relationships

2. **Run database migration:**
   - `pnpm db:push` → Apply schema changes
   - Verify migration on staging

3. **Update context:**
   - Modify `server/_core/context.ts`
   - Add workspace and member info

4. **Implement RBAC:**
   - Create `workspaceProcedure`, `managerProcedure`, `ownerProcedure`
   - Add to `server/_core/trpc.ts`

5. **Create workspace router:**
   - `server/routers/workspaceRouter.ts`
   - Implement workspace CRUD operations

---

## Appendix: File Structure Changes

```
server/
├── routers/
│   ├── workspaceRouter.ts (NEW)
│   ├── billingRouter.ts (NEW)
│   ├── teamRouter.ts (NEW)
│   ├── pipelineRouter.ts (UPDATED)
│   ├── applicationRouter.ts (UPDATED)
│   └── ...
├── _core/
│   ├── context.ts (UPDATED)
│   ├── trpc.ts (UPDATED)
│   ├── stripe.ts (NEW)
│   └── ...
└── services/
    └── jobResearchService.ts (UPDATED)

client/src/
├── components/
│   ├── WorkspaceSwitcher.tsx (NEW)
│   ├── TeamManagement.tsx (NEW)
│   ├── WorkspaceSettings.tsx (NEW)
│   └── ...
├── pages/
│   ├── Workspace.tsx (NEW)
│   ├── Billing.tsx (NEW)
│   ├── Team.tsx (NEW)
│   └── ...
└── contexts/
    └── WorkspaceContext.tsx (NEW)
```

---

**Document Status**: ✅ COMPLETE - Ready for Phase 2 Implementation  
**Last Updated**: May 20, 2026  
**Next Review**: After Phase 2 completion
