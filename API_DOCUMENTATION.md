# Bryan Pipeline - API Documentation

This document describes all available tRPC endpoints for the Bryan Pipeline application.

## Authentication

All endpoints require user authentication via Manus OAuth. The authentication context is automatically injected into each procedure via the `ctx.user` parameter.

### User Context
```typescript
interface User {
  id: number;
  openId: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}
```

## Application Management

### application.generate

Generate a cover letter and tailored resume for a specific company.

**Input:**
```typescript
{
  companyName: string;
  jobTitle: string;
  jobDescription: string;
  contactName: string;
  contactEmail?: string;  // LinkedIn URL or email
  companyId: string;
}
```

**Output:**
```typescript
{
  id: number;
  coverLetter: string;
  tailoredResume: string;
  status: 'draft';
}
```

**Error Codes:**
- `NOT_FOUND`: Company not found
- `INTERNAL_SERVER_ERROR`: LLM generation failed or database error
- `UNAUTHORIZED`: User not authenticated

**Example:**
```typescript
const result = await trpc.application.generate.useMutation();
result.mutate({
  companyName: 'Gong',
  jobTitle: 'Enterprise Account Executive',
  jobDescription: 'Looking for an experienced account executive...',
  contactName: 'Amelia Howard',
  companyId: 'gong-123'
});
```

---

### application.send

Send a generated application to the hiring manager via email.

**Input:**
```typescript
{
  applicationId: number;
  hiringManagerEmail: string;  // Email address of hiring manager
}
```

**Output:**
```typescript
{
  success: boolean;
  coverLetterPdfKey: string;   // S3 storage key for cover letter
  resumePdfKey: string;        // S3 storage key for resume
}
```

**Error Codes:**
- `NOT_FOUND`: Application not found
- `BAD_REQUEST`: Invalid email address
- `INTERNAL_SERVER_ERROR`: Email sending failed or database error
- `UNAUTHORIZED`: User not authenticated

**Example:**
```typescript
const result = await trpc.application.send.useMutation();
result.mutate({
  applicationId: 120001,
  hiringManagerEmail: 'amelia.howard@gong.io'
});
```

---

### application.getDraft

Retrieve a draft application for a company (if it exists).

**Input:**
```typescript
{
  companyId: string;
}
```

**Output:**
```typescript
{
  id: number;
  companyName: string;
  contactName: string;
  coverLetter: string;
  tailoredResume: string;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
} | null
```

**Error Codes:**
- `UNAUTHORIZED`: User not authenticated

**Example:**
```typescript
const { data } = await trpc.application.getDraft.useQuery({
  companyId: 'rippling-123'
});
```

---

### application.list

List all applications for the current user.

**Output:**
```typescript
Array<{
  id: number;
  companyName: string;
  contactName: string;
  jobTitle: string;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  outcome?: 'pending' | 'interviewing' | 'offer' | 'rejected';
  sentAt?: Date;
  coverLetterPdfKey?: string;
  resumePdfKey?: string;
  createdAt: Date;
  updatedAt: Date;
}>
```

**Error Codes:**
- `UNAUTHORIZED`: User not authenticated
- `INTERNAL_SERVER_ERROR`: Database error

**Example:**
```typescript
const { data } = await trpc.application.list.useQuery();
```

---

## Application Status Management

### applicationStatus.updateOutcome

Update the outcome status of an application.

**Input:**
```typescript
{
  applicationId: number;
  outcome: 'pending' | 'interviewing' | 'offer' | 'rejected';
}
```

**Output:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Error Codes:**
- `NOT_FOUND`: Application not found
- `BAD_REQUEST`: Invalid outcome value
- `UNAUTHORIZED`: User not authenticated
- `INTERNAL_SERVER_ERROR`: Database error

**Example:**
```typescript
const result = await trpc.applicationStatus.updateOutcome.useMutation();
result.mutate({
  applicationId: 120001,
  outcome: 'interviewing'
});
```

---

### applicationStatus.listWithOutcomes

Get all applications with their outcome statuses.

**Input:** None

**Output:**
```typescript
Array<{
  id: number;
  companyName: string;
  contactName: string;
  outcome?: 'pending' | 'interviewing' | 'offer' | 'rejected';
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}>
```

**Error Codes:**
- `UNAUTHORIZED`: User not authenticated
- `INTERNAL_SERVER_ERROR`: Database error

**Example:**
```typescript
const { data } = await trpc.applicationStatus.listWithOutcomes.useQuery();
```

---

## Application History

### applicationHistory.list

List all applications with full history and details.

**Output:**
```typescript
Array<{
  id: number;
  companyName: string;
  contactName: string;
  jobTitle: string;
  coverLetter: string;
  tailoredResume: string;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  outcome?: 'pending' | 'interviewing' | 'offer' | 'rejected';
  sentAt?: Date;
  sentToHiringManager?: boolean;
  sentToUser?: boolean;
  coverLetterPdfKey?: string;
  resumePdfKey?: string;
  createdAt: Date;
  updatedAt: Date;
}>
```

**Error Codes:**
- `UNAUTHORIZED`: User not authenticated
- `INTERNAL_SERVER_ERROR`: Database error

**Example:**
```typescript
const { data } = await trpc.applicationHistory.list.useQuery();
```

---

## Research Configuration

### researchConfig.get

Retrieve current job research configuration and preferences.

**Input:** None

**Output:**
```typescript
{
  id: number;
  userId: number;
  targetRoles: string;      // Comma-separated target job titles
  targetCategories: string; // Comma-separated business categories
  rolesPerDay: number;      // Number of roles to research daily (1-100, default: 30)
  enabled: number;          // 1 for enabled, 0 for disabled
  createdAt: Date;
  updatedAt: Date;
}
```

**Error Codes:**
- `UNAUTHORIZED`: User not authenticated
- `INTERNAL_SERVER_ERROR`: Database error

**Example:**
```typescript
const { data } = await trpc.researchConfig.get.useQuery();
```

---

### researchConfig.update

Update job research configuration and preferences.

**Input:**
```typescript
{
  targetRoles?: string;      // Comma-separated job titles
  targetCategories?: string; // Comma-separated categories
  rolesPerDay?: number;      // 1-100 roles per day
  enabled?: number;          // 1 for enabled, 0 for disabled
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

**Error Codes:**
- `BAD_REQUEST`: Invalid input values (rolesPerDay out of range)
- `UNAUTHORIZED`: User not authenticated
- `INTERNAL_SERVER_ERROR`: Database error

**Example:**
```typescript
const result = await trpc.researchConfig.update.useMutation();
result.mutate({
  rolesPerDay: 50,
  targetCategories: 'Revenue Intelligence,Sales Enablement,SaaS'
});
```

---

## System

### system.notifyOwner

Send a notification to the project owner (admin only).

**Input:**
```typescript
{
  title: string;      // Notification title
  content: string;    // Notification content
}
```

**Output:**
```typescript
{
  success: boolean;
  notificationId?: string;
}
```

**Error Codes:**
- `FORBIDDEN`: User is not an admin
- `UNAUTHORIZED`: User not authenticated
- `INTERNAL_SERVER_ERROR`: Notification service unavailable

**Example:**
```typescript
const result = await trpc.system.notifyOwner.useMutation();
result.mutate({
  title: 'New Application Sent',
  content: 'Application sent to Gong for Amelia Howard'
});
```

---

## Authentication

### auth.me

Get current user information.

**Input:** None

**Output:**
```typescript
{
  id: number;
  openId: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
} | null
```

**Example:**
```typescript
const { data: user } = await trpc.auth.me.useQuery();
```

---

### auth.logout

Logout the current user and clear session.

**Input:** None

**Output:**
```typescript
{
  success: boolean;
}
```

**Example:**
```typescript
const result = await trpc.auth.logout.useMutation();
result.mutate();
```

---

## Error Handling

All tRPC endpoints return errors in a standardized format:

```typescript
{
  code: 'UNAUTHORIZED' | 'NOT_FOUND' | 'BAD_REQUEST' | 'INTERNAL_SERVER_ERROR' | etc;
  message: string;
  data?: any;
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | User not authenticated or insufficient permissions |
| `NOT_FOUND` | 404 | Requested resource not found |
| `BAD_REQUEST` | 400 | Invalid input parameters |
| `CONFLICT` | 409 | Resource already exists or state conflict |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

---

## Data Types

### Application Status
- `draft`: Application generated but not sent
- `scheduled`: Application scheduled for future sending
- `sent`: Application successfully sent to hiring manager
- `failed`: Application sending failed

### Application Outcome
- `pending`: Application sent, awaiting response
- `interviewing`: In interview process
- `offer`: Offer received
- `rejected`: Application rejected

### User Role
- `user`: Regular user with access to own data
- `admin`: Administrator with access to all data and system functions

---

## Caching

The client automatically caches query results using React Query. To invalidate cache after mutations:

```typescript
const utils = trpc.useUtils();

const result = await trpc.application.send.useMutation({
  onSuccess: () => {
    // Invalidate application list cache
    utils.application.list.invalidate();
    utils.applicationHistory.list.invalidate();
  }
});
```

---

## Examples

### Complete Application Generation & Sending Workflow

```typescript
import { trpc } from '@/lib/trpc';

export function ApplicationWorkflow() {
  const generateMutation = trpc.application.generate.useMutation();
  const sendMutation = trpc.application.send.useMutation();

  const handleGenerateAndSend = async (
    companyName: string,
    jobTitle: string,
    jobDescription: string,
    contactName: string,
    email: string
  ) => {
    try {
      // Step 1: Generate cover letter and resume
      const generated = await generateMutation.mutateAsync({
        companyName,
        jobTitle,
        jobDescription,
        contactName,
        companyId: companyName.toLowerCase()
      });
      console.log('Generated:', generated);

      // Step 2: Send application
      const sent = await sendMutation.mutateAsync({
        applicationId: generated.id,
        hiringManagerEmail: email
      });
      console.log('Sent:', sent);

      // Step 3: Show success message
      alert('Application sent successfully!');
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to send application');
    }
  };

  return (
    <button onClick={() => handleGenerateAndSend(
      'Gong',
      'Enterprise Account Executive',
      'Looking for experienced AE...',
      'Amelia Howard',
      'amelia@gong.io'
    )}>
      Generate & Send
    </button>
  );
}
```

---

**Last Updated**: May 18, 2026
**API Version**: 1.0.0
