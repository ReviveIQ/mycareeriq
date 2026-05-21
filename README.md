# Bryan Greer — Job Search Pipeline

A comprehensive SaaS application for managing a professional job search pipeline with AI-powered application generation, automated job research, and intelligent email delivery.

## Features

### 📊 Pipeline Management
- **30-Company Prospect List**: Organize and track your target companies with detailed information
- **Pipeline Table**: View all prospects with company, role, contact, stage, priority, and compensation data
- **Advanced Filtering**: Filter by stage, category, priority, and search by company/contact/role
- **CSV Export**: Export your entire pipeline for external analysis

### 🤖 AI-Powered Application Generation
- **Intelligent Cover Letter Generation**: AI generates personalized cover letters based on job description and company profile
- **Tailored Resume Generation**: AI creates customized resumes highlighting relevant experience for each role
- **LinkedIn Profile Verification**: Verify hiring manager identity before sending applications
- **Immediate or Scheduled Sending**: Send applications immediately or schedule for later

### 🔍 Hunter.io Email Lookup
- **Automatic Email Discovery**: Use Hunter.io to find hiring manager email addresses
- **Confidence Scoring**: Get confidence levels (high/medium/low) for each email suggestion
- **Multiple Suggestions**: View top 3 email suggestions ranked by confidence
- **Manual Fallback**: Enter emails manually if automatic lookup doesn't find results
- **Graceful Error Handling**: Continues workflow even if API is unavailable

### 📧 Email Delivery & Tracking
- **Gmail Integration**: Seamless email delivery via Gmail SMTP
- **PDF Attachments**: Cover letters and resumes sent as professional PDF attachments
- **S3 Storage**: PDFs uploaded to S3 with unique storage keys for archival
- **Delivery Confirmation**: Track which applications were sent to hiring managers and users
- **Email Copy**: Automatic copy sent to user's email for record-keeping

### 📈 Analytics & Insights
- **Key Metrics**: Total prospects, high-priority targets, remote roles, and key contacts identified
- **Visual Analytics**: Charts and graphs showing pipeline composition by category, stage, and priority
- **Outcome Tracking**: Track application outcomes (pending, interviewing, offer, rejected)

### 🔄 Automation & Scheduling
- **Daily Job Research**: Automated daily job research at 8 AM EST (30 roles/day)
- **48-Hour Digest**: Automated email digest every 48 hours with new job opportunities
- **Research Settings**: Customize job research preferences and parameters
- **Application History**: Complete history of all sent applications with status and outcome tracking

### 📋 Application History
- **Status Tracking**: Track each application's status (draft, scheduled, sent, failed)
- **Outcome Management**: Update application outcomes as you progress through interviews
- **Sent Date Recording**: Automatic timestamp of when applications were sent
- **LinkedIn Profile Links**: Quick access to hiring manager LinkedIn profiles

## Technology Stack

### Frontend
- **React 19**: Modern UI framework
- **Tailwind CSS 4**: Utility-first CSS framework
- **TypeScript**: Type-safe JavaScript
- **tRPC**: End-to-end type-safe APIs
- **Shadcn/UI**: High-quality React components

### Backend
- **Express 4**: Node.js web framework
- **tRPC 11**: Type-safe RPC framework
- **Drizzle ORM**: Type-safe database ORM
- **MySQL/TiDB**: Relational database

### Services & Integrations
- **Gmail SMTP**: Email delivery
- **AWS S3**: PDF storage
- **Hunter.io API**: Email address discovery
- **Manus OAuth**: User authentication
- **OpenAI LLM**: AI-powered content generation
- **Manus Heartbeat**: Scheduled job execution

## Getting Started

### Prerequisites
- Node.js 22.13.0 or later
- pnpm package manager
- MySQL/TiDB database

### Installation

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up environment variables:**
   - `DATABASE_URL`: MySQL/TiDB connection string
   - `GMAIL_APP_PASSWORD`: Gmail app-specific password
   - `HUNTER_API_KEY`: Hunter.io API key (get free key at https://hunter.io)
   - `VITE_APP_ID`: Manus OAuth application ID
   - `BUILT_IN_FORGE_API_KEY`: Manus API key for storage and LLM
   - `BUILT_IN_FORGE_API_URL`: Manus API base URL

3. **Run database migrations:**
   ```bash
   pnpm db:push
   ```

4. **Start the development server:**
   ```bash
   pnpm dev
   ```

5. **Run tests:**
   ```bash
   pnpm test
   ```

## Project Structure

```
client/
  src/
    pages/              # Page components
    components/         # Reusable UI components
    lib/               # Utilities and helpers
    _core/             # Core hooks and utilities
    index.css          # Global styles

server/
  routers.ts           # tRPC procedure definitions
  db.ts                # Database query helpers
  applicationRouter.ts # Application-specific procedures
  emailService.ts      # Email sending logic
  pdfGenerator.ts      # PDF generation
  jobResearchService.ts # Job research automation

drizzle/
  schema.ts            # Database schema definitions
  migrations/          # Database migrations

shared/
  types.ts             # Shared TypeScript types
  const.ts             # Shared constants
```

## Key Procedures (tRPC API)

### Application Management
- `application.generate` - Generate cover letter and resume for a company
- `application.send` - Send generated application to hiring manager
- `application.getDraft` - Get draft application for a company
- `application.list` - List all applications with filtering
- `application.updateOutcome` - Update application outcome status

### Email Lookup
- `emailLookup.searchEmails` - Search for emails by name and company
- `emailLookup.getSuggestedEmails` - Get top 3 email suggestions with confidence scores
- `emailLookup.verifyEmail` - Verify if an email address is valid

### Job Research
- `jobResearch.getSettings` - Get job research preferences
- `jobResearch.updateSettings` - Update job research preferences

### System
- `system.notifyOwner` - Send notification to project owner

## Database Schema

### Applications Table
- `id`: Primary key
- `userId`: User who created the application
- `companyName`: Target company name
- `contactName`: Hiring manager name
- `coverLetter`: Generated cover letter text
- `tailoredResume`: Generated resume text
- `status`: Application status (draft, scheduled, sent, failed)
- `outcome`: Application outcome (pending, interviewing, offer, rejected)
- `coverLetterPdfKey`: S3 storage key for cover letter PDF
- `resumePdfKey`: S3 storage key for resume PDF
- `sentAt`: Timestamp when application was sent
- `sentToHiringManager`: Boolean flag for delivery confirmation

### Companies Table
- `id`: Primary key
- `userId`: User who owns this company
- `companyName`: Company name
- `category`: Business category
- `jobTitle`: Target job title
- `contactName`: Hiring manager name
- `contactEmail`: Hiring manager email

## Testing

The project includes comprehensive unit tests using Vitest:

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run specific test file
pnpm test server/applicationRouter.test.ts
```

### Test Coverage
- Application generation procedure
- Application sending procedure
- Application listing procedure
- Email lookup procedures (search, suggestions, verification)
- Error handling and edge cases
- Database integration
- **Total: 21 tests passing**

## Deployment

The application is deployed on Manus WebDev with:
- Automatic HTTPS
- Custom domain support
- Built-in database hosting
- Serverless function execution
- Scheduled job support

### Publishing
1. Create a checkpoint via the Management UI
2. Click the "Publish" button to deploy
3. Access your site at `https://bryanjobs-nsyrkzpz.manus.space`

## Troubleshooting

### Email Delivery Issues
- Verify `GMAIL_APP_PASSWORD` is set correctly
- Check that Gmail app-specific password is enabled
- Review email logs in `.manus-logs/` directory

### PDF Storage Issues
- Verify `BUILT_IN_FORGE_API_KEY` and `BUILT_IN_FORGE_API_URL` are set
- Check S3 storage keys in database
- Review network requests log for storage failures

### Database Connection Issues
- Verify `DATABASE_URL` connection string
- Run `pnpm db:push` to ensure schema is up to date
- Check database logs for connection errors

## Performance Optimization

- **Lazy Loading**: Pages load data on-demand via tRPC queries
- **Optimistic Updates**: UI updates immediately while mutations complete
- **Caching**: React Query caches application data
- **Pagination**: Large datasets paginated for performance
- **S3 Storage**: PDFs stored in S3 instead of database

## Security

- **OAuth Authentication**: Manus OAuth for secure user authentication
- **Protected Procedures**: tRPC procedures protected with authentication
- **Email Validation**: Email addresses validated before sending
- **PDF Encryption**: PDFs stored securely in S3
- **Environment Variables**: Sensitive data stored in environment variables

## Contributing

When adding new features:
1. Update the database schema in `drizzle/schema.ts`
2. Run `pnpm db:push` to apply migrations
3. Add new procedures in `server/routers.ts`
4. Create UI components in `client/src/pages/` or `client/src/components/`
5. Write tests in `server/*.test.ts`
6. Update this README with new features

## Support

For issues or questions:
- Check the `.manus-logs/` directory for error details
- Review the browser console for client-side errors
- Check the dev server output for backend errors
- Refer to the tRPC documentation at https://trpc.io

## License

This project is proprietary and confidential.

---

**Last Updated**: May 18, 2026
**Version**: 1.0.0
