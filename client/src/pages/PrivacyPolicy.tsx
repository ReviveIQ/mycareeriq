export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "48px 16px", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "48px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>

        <div style={{ marginBottom: "40px" }}>
          <h1 style={{ fontSize: "32px", fontWeight: 800, color: "#0f172a", margin: "0 0 8px 0", fontFamily: "'Montserrat', sans-serif" }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
            ReviveIQI · MyCareerIQ · Last updated: June 2026
          </p>
        </div>

        <div style={{ lineHeight: "1.8", color: "#334155", fontSize: "15px" }}>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>1. Who We Are</h2>
            <p>
              MyCareerIQ is a job search pipeline product operated by ReviveIQI, based in Fort Lauderdale, Florida.
              We help professionals research open roles, build targeted outreach pipelines, and generate cover letters and tailored application materials.
              Contact us at <a href="mailto:bryan@reviveiqi.com" style={link}>bryan@reviveiqi.com</a>.
            </p>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>2. What We Collect</h2>
            <p style={{ marginBottom: "12px" }}>We collect the following categories of information:</p>
            <ul style={ul}>
              <li><strong>Account information:</strong> Name, email address, and password (hashed) when you register. If you sign in with LinkedIn, we receive your name, email, and LinkedIn profile ID from LinkedIn's OpenID Connect service.</li>
              <li><strong>Resume and document content:</strong> When you upload a resume or other document, we store the text content and parsed data (roles, skills, work history) in order to configure your pipeline and generate application materials.</li>
              <li><strong>Pipeline data:</strong> Companies, job titles, contact names, application stages, and notes you create or that are automatically populated from job research.</li>
              <li><strong>Usage data:</strong> Pages visited, features used, and pipeline activity — used to improve the product.</li>
              <li><strong>Payment information:</strong> Processed by Stripe. We do not store card numbers or payment credentials. We store your subscription status and Stripe customer ID.</li>
            </ul>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>3. How We Use Your Information</h2>
            <ul style={ul}>
              <li>To power your job search pipeline — researching companies, scoring roles for fit, and generating outreach and application materials</li>
              <li>To configure your research profile based on your uploaded resume</li>
              <li>To send transactional emails related to your account and pipeline activity</li>
              <li>To process subscription payments via Stripe</li>
              <li>To improve our product and diagnose technical issues</li>
            </ul>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>4. Third-Party Services We Use</h2>
            <p style={{ marginBottom: "12px" }}>Your data is shared with the following services as necessary to operate the product:</p>
            <ul style={ul}>
              <li><strong>OpenAI:</strong> Resume content and job descriptions are sent to OpenAI's GPT-4o API to extract career data, score resume quality, generate cover letters, and score job fit. OpenAI processes this data per their <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" style={link}>privacy policy</a>. We use API access, which means your data is not used to train OpenAI models.</li>
              <li><strong>Apollo.io:</strong> Company names and domains are sent to Apollo's People Search API to identify recruiter and hiring manager contacts. We receive name, title, email, and LinkedIn URL of relevant contacts.</li>
              <li><strong>LinkedIn:</strong> If you sign in with LinkedIn, we receive your name, email, and profile identifier from LinkedIn's OpenID Connect service. We store your LinkedIn access token to enable future LinkedIn integrations. LinkedIn's <a href="https://www.linkedin.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={link}>privacy policy</a> applies to data processed on their platform.</li>
              <li><strong>Firecrawl:</strong> Career page URLs are sent to Firecrawl's scraping API to extract job listings from company career pages.</li>
              <li><strong>Stripe:</strong> Payment processing. Card data is handled entirely by Stripe and never touches our servers.</li>
              <li><strong>TiDB Cloud:</strong> All application data is stored in a TiDB Cloud database hosted on AWS US-East-1.</li>
              <li><strong>Railway:</strong> Our application runs on Railway's cloud infrastructure.</li>
            </ul>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>5. LinkedIn Data Use</h2>
            <p>
              When you authenticate with LinkedIn, we use the data provided solely to create and maintain your MyCareerIQ account. We do not sell LinkedIn data, share it with advertisers, or use it for any purpose beyond operating your account and the features you explicitly use. We comply with LinkedIn's API Terms of Service.
            </p>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>6. Data Retention</h2>
            <ul style={ul}>
              <li><strong>Account data:</strong> Retained while your account is active. Deleted within 30 days of account deletion request.</li>
              <li><strong>Resume content:</strong> Retained in your research configuration until you upload a replacement or delete your account.</li>
              <li><strong>Pipeline data:</strong> Retained while your account is active.</li>
              <li><strong>Usage logs:</strong> Retained for 90 days.</li>
            </ul>
            <p style={{ marginTop: "12px" }}>To request deletion of your data, email <a href="mailto:bryan@reviveiqi.com" style={link}>bryan@reviveiqi.com</a>.</p>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>7. Your Rights</h2>
            <p style={{ marginBottom: "12px" }}>You have the right to:</p>
            <ul style={ul}>
              <li>Access a copy of your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data ("Right to be Forgotten")</li>
              <li>Request data portability</li>
              <li>Object to or restrict certain processing</li>
              <li>Withdraw consent at any time</li>
            </ul>
            <p style={{ marginTop: "12px" }}>
              California residents have additional rights under the CCPA. EU/UK residents have rights under GDPR. To exercise any right, contact <a href="mailto:bryan@reviveiqi.com" style={link}>bryan@reviveiqi.com</a>.
            </p>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>8. Security</h2>
            <p>
              Passwords are hashed using bcrypt and never stored in plaintext. Data in transit is encrypted via TLS. Database connections use SSL. We do not store payment card data. Despite these measures, no system is 100% secure — please use a strong unique password.
            </p>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>9. Cookies</h2>
            <p>
              We use session cookies for authentication state and OAuth CSRF protection. We do not use advertising cookies or third-party tracking cookies. Authentication tokens are stored in your browser's localStorage.
            </p>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>10. Children's Privacy</h2>
            <p>
              MyCareerIQ is not directed at children under 16. We do not knowingly collect personal information from anyone under 16. If you believe we have inadvertently collected such information, contact us immediately.
            </p>
          </section>

          <section style={{ marginBottom: "36px" }}>
            <h2 style={h2}>11. Changes to This Policy</h2>
            <p>
              We may update this policy as our product evolves. Material changes will be communicated via email or an in-app notice. Continued use of the product after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 style={h2}>12. Contact</h2>
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
