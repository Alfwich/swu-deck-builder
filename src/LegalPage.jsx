import { useEffect } from 'react'

const EFFECTIVE_DATE = 'August 30, 2026'
const PROJECT_URL = 'https://github.com/Alfwich/swu-deck-builder'
const ISSUES_URL = `${PROJECT_URL}/issues`
const GOOGLE_USER_DATA_POLICY_URL =
  'https://developers.google.com/terms/api-services-user-data-policy'

function LegalLayout({ children, title }) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${title} — SWU Deck Builder`
    return () => {
      document.title = previousTitle
    }
  }, [title])

  return (
    <main className="legal-page">
      <article className="legal-document">
        <header className="legal-document__header">
          <a className="legal-document__home" href="/">
            ← Back to SWU Deck Builder
          </a>
          <p className="legal-document__eyebrow">SWU Deck Builder</p>
          <h1>{title}</h1>
          <p>Effective and last updated: {EFFECTIVE_DATE}</p>
        </header>
        {children}
        <nav className="legal-document__policy-links" aria-label="Legal policies">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
          <a href={PROJECT_URL} target="_blank" rel="noopener noreferrer">
            Source code
          </a>
        </nav>
      </article>
    </main>
  )
}

function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        This Privacy Policy explains how the maintainers of the SWU Deck Builder
        project (the “Operator,” “we,” “us,” or “our”) handle information when
        you use swu.wuteri.ch, the desktop application, and related services
        (collectively, the “Service”). The Service is designed to be local-first:
        your player database normally stays on your device unless you choose a
        feature that sends data elsewhere.
      </p>

      <section>
        <h2>1. Information handled by the Service</h2>
        <h3>Player database and local application data</h3>
        <p>
          The Service can store saved decks, deck names and metadata, the selected
          deck, card collection quantities, import and export data, AI chat history,
          opaque chat session tokens, prompt history, interface preferences, and
          cloud-backup synchronization metadata. In the web application, this data
          is stored in your browser. The desktop application stores player data and
          settings on your computer. We do not operate a centralized user-account
          database for this information.
        </p>
        <h3>Google Drive backup data</h3>
        <p>
          If you connect Google Drive, the Service creates a backup containing your
          saved decks, selected deck, card collection, timestamps, and backup
          integrity and synchronization identifiers. The backup does not include
          your AI chat history, AI-provider credentials, or desktop settings.
        </p>
        <h3>AI assistant data</h3>
        <p>
          If you choose to use the AI assistant, the Service processes the prompt
          you submit, your current deck, relevant saved-deck and card-collection
          context, prior conversation context, and any image attachment you
          intentionally add where that feature is supported. The Service also
          processes a session token and provider continuation identifier so a
          conversation can continue.
        </p>
        <h3>Technical and security data</h3>
        <p>
          The web server, hosting provider, and reverse proxy may process ordinary
          request information such as IP address, user agent, requested path,
          timestamps, response status, and diagnostic or security events. The
          Service also uses IP addresses in memory for access control, abuse
          prevention, rate limiting, and binding AI sessions to a client.
        </p>
      </section>

      <section>
        <h2>2. How information is used</h2>
        <p>We use information only as needed to:</p>
        <ul>
          <li>provide deck building, collection, import, export, and backup features;</li>
          <li>generate AI-assisted deck suggestions and maintain chat continuity;</li>
          <li>operate, secure, debug, and improve the Service;</li>
          <li>prevent abuse and enforce request and access limits; and</li>
          <li>comply with applicable law and protect users, the Service, and others.</li>
        </ul>
        <p>
          We do not sell personal information. We do not use Google user data for
          advertising, credit decisions, or generalized profiling, and we do not
          use Google Drive backups to train AI models.
        </p>
      </section>

      <section>
        <h2>3. Google Drive and Google API data</h2>
        <p>
          Google Drive backup is optional. The Service requests only the Google
          Drive application-data scope (<code>drive.appdata</code>). This lets this
          application read and write files in its own hidden application-data
          folder; it does not give the Service broad access to your Drive files,
          Google profile, or email address.
        </p>
        <p>
          In the hosted version, Drive requests travel directly between your
          browser and Google. The hosted SWU Deck Builder server does not receive
          your Google OAuth access token or Drive backup contents, and the access
          token is held in browser memory while connected. In the desktop version,
          Drive requests travel between the local desktop process and Google. The
          desktop app holds short-lived access tokens in memory and stores its
          refresh token encrypted with operating-system credential protection in
          the app&apos;s per-user data directory. Google credentials are never
          placed in the player database. Disconnecting asks Google to revoke the
          authorization where supported and removes the locally stored desktop
          refresh token, but it does not delete the backup file already stored by
          Google.
        </p>
        <p>
          You can remove the backup through your Google Drive application-data or
          connected-app settings. Google may also delete the application-data
          folder when you remove the application's access. Google handles that data
          under its own terms and privacy policy.
        </p>
        <p>
          SWU Deck Builder's use and transfer to any other app of information
          received from Google APIs will adhere to the{' '}
          <a
            href={GOOGLE_USER_DATA_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </section>

      <section>
        <h2>4. Imports, exports, and backup precedence</h2>
        <p>
          You control manual player-database imports and exports. When you import or
          restore a database, that local database becomes authoritative. If remote
          backup is connected, the imported database is queued to replace the
          remote backup. An export creates a file under your control; where you
          save or share that file is your responsibility.
        </p>
      </section>

      <section>
        <h2>5. AI providers and other third parties</h2>
        <p>
          AI requests are sent to the AI provider configured for the deployment or
          desktop application, which may include OpenAI services, Codex CLI, or
          Claude CLI. Those providers process submitted content under their own
          terms and privacy policies. Provider-side retention can vary by provider,
          account, feature, and configuration. AI chat may use provider-side stored
          responses or continuation state when necessary to continue a conversation.
        </p>
        <p>
          The catalog and card images may be obtained from third-party sources.
          Loading external images or following links to services such as SWUDB,
          TCGplayer, GitHub, or ForceTable can disclose ordinary request information
          to those services. Their privacy policies apply to their handling of it.
        </p>
      </section>

      <section>
        <h2>6. Cookies and browser storage</h2>
        <p>
          The hosted web application uses browser storage for the local-first data
          described above. It does not currently use advertising cookies or
          cross-site tracking cookies. The desktop application uses a temporary,
          HTTP-only access cookie to restrict its local server to the desktop app.
          Hosting infrastructure may use strictly necessary security or routing
          mechanisms.
        </p>
      </section>

      <section>
        <h2>7. Retention and deletion</h2>
        <ul>
          <li>
            Browser and desktop data remains until you delete it, clear the relevant
            application storage, uninstall the application, or replace it by import.
          </li>
          <li>
            Google Drive backup data remains in your Google account until you remove
            it or Google removes it. Disconnecting alone does not delete it.
          </li>
          <li>
            AI session metadata, access leases, and rate-limit records are primarily
            held in server memory and expire where configured or are cleared by a
            new chat or server restart. Some CLI conversation state can remain until
            a new chat or server restart.
          </li>
          <li>
            Infrastructure logs, if enabled, are kept only as long as reasonably
            necessary for operations, security, troubleshooting, and legal duties.
          </li>
          <li>
            AI providers and linked services retain data according to their own
            policies and the account or deployment configuration.
          </li>
        </ul>
      </section>

      <section>
        <h2>8. Legal bases and your choices</h2>
        <p>
          Where data-protection law requires a legal basis, we process information
          to provide features you request, based on your consent for optional Google
          Drive access, and for legitimate interests in operating and securing the
          Service, subject to your rights and applicable law. You may choose not to
          connect Drive or use AI features, disconnect Drive, start a new AI chat,
          delete local data, or stop using the Service.
        </p>
      </section>

      <section>
        <h2>9. Your privacy rights</h2>
        <p>
          Depending on where you live, you may have rights to access, correct,
          delete, restrict, or object to processing; receive a portable copy; or
          withdraw consent. Most player data is directly under your control in your
          browser, desktop storage, exported files, or Google account. To make a
          request about information held by the Operator, use the contact method
          below. We may need enough information to verify and respond to the request.
          You may also have the right to complain to your local data-protection
          authority.
        </p>
      </section>

      <section>
        <h2>10. Security and international processing</h2>
        <p>
          We use reasonable technical and organizational safeguards, including
          limited Google scopes, memory-only browser OAuth tokens, OS-encrypted
          desktop refresh tokens, PKCE for desktop authorization, input validation,
          access controls, and rate limiting. No system is completely secure, so
          keep your exported backups and connected accounts protected. Third-party
          providers may process data in countries other than your own and use the
          safeguards described in their policies.
        </p>
      </section>

      <section>
        <h2>11. Children</h2>
        <p>
          The Service is not directed to children who cannot legally consent to the
          processing described here. If you are a parent or guardian and believe a
          child provided personal information through an optional online feature,
          contact us so we can evaluate the request.
        </p>
      </section>

      <section>
        <h2>12. Changes and contact</h2>
        <p>
          We may update this policy as the Service changes. We will update the date
          above and, for material changes, provide notice through the Service or
          project repository when reasonably possible.
        </p>
        <p>
          The Service is operated by the SWU Deck Builder project maintainers.
          Privacy questions and requests may be submitted through the{' '}
          <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
            project issue tracker
          </a>
          . Do not include private player data, access tokens, or other sensitive
          information in a public issue; ask for a private contact channel instead.
        </p>
      </section>
    </LegalLayout>
  )
}

function TermsOfService() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        These Terms of Service (“Terms”) govern your use of swu.wuteri.ch, the SWU
        Deck Builder desktop application, and related services (collectively, the
        “Service”), which are made available by the SWU Deck Builder project
        maintainers (the “Operator,” “we,” “us,” or “our”). By using the Service,
        you agree to these Terms. If you do not agree, do not use the Service.
      </p>

      <section>
        <h2>1. The Service</h2>
        <p>
          SWU Deck Builder is a local-first fan tool for building, importing,
          exporting, analyzing, and managing Star Wars: Unlimited decks and card
          collections. Optional features may include Google Drive backup and an AI
          deck assistant. Features can differ between the hosted and desktop
          versions and may change over time.
        </p>
      </section>

      <section>
        <h2>2. Eligibility</h2>
        <p>
          You must be legally capable of agreeing to these Terms. If applicable law
          requires a parent or guardian to consent to your use of an online service,
          you may use the Service only with that permission and supervision.
        </p>
      </section>

      <section>
        <h2>3. Local data, imports, exports, and backups</h2>
        <p>
          Your player database is local by default. You are responsible for keeping
          copies you need and for protecting exported files. We do not promise that
          browser storage, desktop storage, imports, exports, or remote backups will
          always be available, compatible, or recoverable.
        </p>
        <p>
          If you connect a remote-backup provider, you authorize the Service to read
          and write the backup data needed for that feature. A manual import or
          restore is authoritative: it replaces the local player database and, when
          backup is connected, is queued to overwrite the remote backup. Review the{' '}
          <a href="/privacy">Privacy Policy</a> for the exact data
          involved and how to disconnect or delete it.
        </p>
      </section>

      <section>
        <h2>4. Your content and permissions</h2>
        <p>
          You retain any rights you have in prompts, deck names, notes, collections,
          and other content you provide (“User Content”). You give the Operator and
          its service providers only the limited permission needed to transmit,
          process, format, and return User Content in order to provide, secure, and
          troubleshoot the features you request. You represent that you have the
          rights needed to provide that content and that doing so does not violate
          law or another person's rights.
        </p>
      </section>

      <section>
        <h2>5. AI features</h2>
        <p>
          AI output can be incomplete, inaccurate, outdated, or unsuitable. Treat
          it as a suggestion, review proposed deck changes, and verify important
          information against official game rules and card text. You are responsible
          for decisions and actions based on AI output. AI features are not intended
          to provide legal, medical, financial, or other professional advice.
        </p>
        <p>
          AI features may rely on third-party providers and may be subject to their
          terms, usage limits, and availability. Do not submit secrets, credentials,
          sensitive personal information, or content you are not authorized to send
          to the configured provider.
        </p>
      </section>

      <section>
        <h2>6. Acceptable use</h2>
        <p>You may not use the Service to:</p>
        <ul>
          <li>violate law or another person's intellectual-property, privacy, or other rights;</li>
          <li>upload malicious code or attempt to bypass security or access controls;</li>
          <li>probe, disrupt, overload, scrape, or interfere with the Service or its providers;</li>
          <li>obtain or use another person's credentials, tokens, backups, or data without permission;</li>
          <li>misrepresent affiliation with the project or its licensors; or</li>
          <li>use automated traffic in a way that unreasonably burdens the hosted Service.</li>
        </ul>
        <p>
          We may limit or block access when reasonably necessary to protect the
          Service, users, providers, or legal rights.
        </p>
      </section>

      <section>
        <h2>7. Third-party services and content</h2>
        <p>
          Google Drive, AI providers, card-data and image sources, GitHub, SWUDB,
          TCGplayer, ForceTable, and other linked services are operated by third
          parties. Their terms and policies apply to your use of them. We do not
          control and are not responsible for third-party services, content,
          security, availability, or data practices.
        </p>
      </section>

      <section>
        <h2>8. Fan project and intellectual property</h2>
        <p>
          SWU Deck Builder is an unofficial fan-made tool. It is not affiliated
          with, endorsed, sponsored, or approved by Lucasfilm Ltd., The Walt Disney
          Company, Fantasy Flight Games, or SWUDB. Star Wars, Star Wars: Unlimited,
          card art, game text, names, marks, and related materials belong to their
          respective owners. Their inclusion is for identification and
          interoperability and does not transfer any rights to you or the Operator.
        </p>
        <p>
          The project's source-code license governs your use of the source code.
          These Terms separately govern your use of the hosted Service and do not
          replace third-party licenses or notices.
        </p>
      </section>

      <section>
        <h2>9. Changes, suspension, and termination</h2>
        <p>
          We may add, remove, limit, suspend, or discontinue features or the hosted
          Service. You may stop using the Service at any time. Because player data is
          local-first, export any data you want to keep before clearing storage,
          uninstalling the application, disconnecting a provider, or ending use.
        </p>
      </section>

      <section>
        <h2>10. Disclaimers</h2>
        <p>
          To the fullest extent permitted by law, the Service is provided “as is”
          and “as available,” without warranties of any kind, express or implied,
          including warranties of accuracy, availability, non-infringement,
          merchantability, fitness for a particular purpose, data preservation, or
          compatibility. We do not warrant that the Service will be uninterrupted,
          secure, error-free, or accepted for tournament or organized-play use.
          Mandatory consumer rights that cannot legally be excluded remain intact.
        </p>
      </section>

      <section>
        <h2>11. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, the Operator and project
          contributors will not be liable for indirect, incidental, special,
          consequential, exemplary, or punitive damages, or for lost data, profits,
          goodwill, or business opportunities, arising from or related to the
          Service. Nothing in these Terms limits liability that cannot legally be
          limited, including any mandatory consumer remedies.
        </p>
      </section>

      <section>
        <h2>12. Changes to these Terms</h2>
        <p>
          We may update these Terms as the Service changes. We will update the date
          above and, for material changes, provide notice through the Service or
          project repository when reasonably possible. Your continued use after an
          update means you accept the revised Terms to the extent permitted by law.
        </p>
      </section>

      <section>
        <h2>13. Governing rules and contact</h2>
        <p>
          Applicable law governs these Terms without depriving you of mandatory
          protections provided by the law where you live. If one provision is
          unenforceable, the remaining provisions continue to apply. A failure to
          enforce a provision is not a waiver.
        </p>
        <p>
          Questions about these Terms may be submitted through the{' '}
          <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
            project issue tracker
          </a>
          . Do not post credentials, access tokens, private player data, or other
          sensitive information in a public issue.
        </p>
      </section>
    </LegalLayout>
  )
}

export default function LegalPage({ document }) {
  return document === 'privacy' ? <PrivacyPolicy /> : <TermsOfService />
}
