export default function TermsOfService() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "48px 16px", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "48px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>

        <div style={{ marginBottom: "40px" }}>
          <h1 style={{ fontSize: "32px", fontWeight: 800, color: "#0f172a", margin: "0 0 8px 0", fontFamily: "'Montserrat', sans-serif" }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
            ReviveIQI · MyCareerIQ · Last updated: June 2026
          </p>
        </div>

        <div style={{ lineHeight: "1.8", color: "#475569", fontSize: "15px" }}>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>1. Agreement to Terms</h2>
            <p>
              By accessing or using MyCareerIQ ("the Service"), operated by ReviveIQI ("we," "us," or "our"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. These Terms apply to all users, including visitors, free users, and paying subscribers.
            </p>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>2. Description of Service</h2>
            <p style={{ marginBottom: "12px" }}>
              MyCareerIQ is an AI-powered job search pipeline tool. You upload a resume, and the Service automatically researches companies hiring for your target roles, scores job fit against your profile, identifies recruiter contacts, and assists with outreach and application tracking.
            </p>
            <p>
              The Service integrates with third-party platforms including Apollo.io (contact enrichment), Firecrawl (job board scraping), OpenAI GPT-4o (AI analysis), and Stripe (payment processing). Use of these integrations is subject to their respective terms.
            </p>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>3. Accounts and Registration</h2>
            <ul style={ul}>
              <li>You must create an account to use the Service. You may sign up with email/password or via LinkedIn OAuth.</li>
              <li>You are responsible for maintaining the confidentiality of your account credentials and all activity under your account.</li>
              <li>You must be at least 16 years old to use the Service.</li>
              <li>You agree to provide accurate, current information.</li>
              <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
            </ul>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>4. Subscription Plans and Billing</h2>
            <ul style={ul}>
              <li><strong style={{ color: "#0f172a" }}>Free plan:</strong> 7 job research runs per month, pipeline limited to 10 jobs. Free forever — no credit card required.</li>
              <li><strong style={{ color: "#0f172a" }}>Pro Monthly:</strong> $49.99/month. Unlimited research runs and pipeline jobs.</li>
              <li><strong style={{ color: "#0f172a" }}>Pro Annual:</strong> $299/year. Unlimited research runs and pipeline jobs. Billed once annually.</li>
              <li><strong style={{ color: "#0f172a" }}>No auto-renewal:</strong> Subscriptions do not automatically renew. You will be notified before your subscription expires and must actively choose to renew.</li>
              <li><strong style={{ color: "#0f172a" }}>Refunds:</strong> If you are charged in error or experience a material service failure, contact us within 7 days for a review. We do not offer refunds for partially used subscription periods where the Service was functioning normally.</li>
              <li><strong style={{ color: "#0f172a" }}>Payment processing:</strong> Payments are processed by Stripe. Your payment data is never stored on our servers.</li>
              <li><strong style={{ color: "#0f172a" }}>Plan changes:</strong> Downgrading to free takes effect at the end of your current billing period. You retain Pro access until then.</li>
            </ul>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>5. Your Content and Intellectual Property</h2>
            <ul style={ul}>
              <li><strong style={{ color: "#0f172a" }}>You own your resume and data.</strong> Your resume, job pipeline, contact notes, and application history belong to you. We claim no intellectual property rights over your content.</li>
              <li><strong style={{ color: "#0f172a" }}>License to process:</strong> By uploading your resume, you grant us a limited, non-exclusive license to process it through our AI systems to generate job matches, company suggestions, and outreach drafts. This license terminates when you delete your account.</li>
              <li><strong style={{ color: "#0f172a" }}>No training use:</strong> We do not use your resume or pipeline data to train AI models.</li>
              <li><strong style={{ color: "#0f172a" }}>Generated content:</strong> Cover letters, outreach drafts, and other AI-generated content produced by the Service belong to you once generated.</li>
            </ul>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>6. AI and Third-Party Data Disclaimer</h2>
            <p style={{ marginBottom: "12px" }}>
              MyCareerIQ uses AI and third-party data sources to research job opportunities and contacts. You acknowledge and agree that:
            </p>
            <ul style={ul}>
              <li>Job listings and company data are sourced from public ATS job boards (Greenhouse, Ashby, Lever) and may not be current or complete.</li>
              <li>Contact information (recruiter names, emails) is sourced from Apollo.io and may be inaccurate, outdated, or belong to individuals who have changed roles.</li>
              <li>Fit scores are AI-generated estimates based on your resume and the job description. They are not guarantees of interview success or employer interest.</li>
              <li>AI-generated cover letters and outreach are starting points. Review and personalize them before sending.</li>
              <li>We are not responsible for employment outcomes — including whether using the Service results in interviews, offers, or employment.</li>
            </ul>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>7. Acceptable Use</h2>
            <p style={{ marginBottom: "12px" }}>You agree not to:</p>
            <ul style={ul}>
              <li>Use automated scripts or bots to interact with the Service</li>
              <li>Attempt to scrape, extract, or harvest job data or contact data from the Service at scale</li>
              <li>Use contact information obtained through the Service to send spam or unsolicited bulk communications</li>
              <li>Misrepresent your identity or qualifications in outreach generated by the Service</li>
              <li>Resell or commercialize access to the Service without our written permission</li>
              <li>Use the Service in violation of any applicable employment law or professional standards</li>
              <li>Circumvent usage limits on the free plan through multiple accounts</li>
            </ul>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>8. Third-Party Services and LinkedIn</h2>
            <p style={{ marginBottom: "12px" }}>
              The Service integrates with LinkedIn for authentication. Your use of LinkedIn features is subject to LinkedIn's User Agreement and Privacy Policy. We are not affiliated with LinkedIn and access only the data you explicitly authorize during OAuth consent (name, email, profile ID).
            </p>
            <p>
              Contact enrichment is provided by Apollo.io. Job board data is accessed via publicly available ATS APIs. We do not guarantee the accuracy of third-party data.
            </p>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>9. Privacy</h2>
            <p>
              Your use of the Service is governed by our <a href="/privacy" style={link}>Privacy Policy</a>, incorporated into these Terms by reference. By using the Service, you consent to the data practices described therein.
            </p>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>10. Service Availability and Modifications</h2>
            <ul style={ul}>
              <li>We do not guarantee uninterrupted access. The Service may experience downtime for maintenance or unexpected issues.</li>
              <li>We may modify, suspend, or discontinue features at any time with reasonable notice where possible.</li>
              <li>We may update pricing with at least 30 days notice. Price changes do not affect active subscriptions until renewal.</li>
            </ul>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>11. Limitation of Liability</h2>
            <ul style={ul}>
              <li>The Service is provided "as is" without warranties of any kind.</li>
              <li>We are not liable for indirect, incidental, special, consequential, or punitive damages.</li>
              <li>Our total liability for any claim shall not exceed the amount you paid us in the 12 months preceding the claim.</li>
              <li>We are not responsible for the accuracy of third-party job listings, contact information, or AI-generated content.</li>
            </ul>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>12. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless ReviveIQI from claims arising from your use of the Service, violation of these Terms, or your outreach communications to third parties generated using the Service.
            </p>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>13. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the State of Florida, United States. Disputes shall be resolved in Broward County, Florida courts. EU/UK consumers retain applicable consumer protection rights.
            </p>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>14. Changes to Terms</h2>
            <p>
              We may update these Terms as the Service evolves. Material changes will be communicated via email or in-app notice at least 14 days before taking effect. Continued use constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 style={h2}>15. Contact</h2>
            <p>
              ReviveIQI · Fort Lauderdale, Florida<br />
              <a href="mailto:bryan@reviveiqi.com" style={link}>bryan@reviveiqi.com</a><br />
              Response time: within 5 business days
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}

const h2: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 700,
  color: "#0f172a",
  marginBottom: "12px",
  fontFamily: "'Montserrat', sans-serif",
};

const ul: React.CSSProperties = {
  paddingLeft: "20px",
  margin: "0 0 8px 0",
  lineHeight: "1.9",
};

const link: React.CSSProperties = {
  color: "#2563eb",
  textDecoration: "underline",
};
