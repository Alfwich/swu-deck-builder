# SWU Deck Builder Privacy Policy

**Effective and last updated: August 30, 2026**

This Privacy Policy explains how the maintainers of the SWU Deck Builder project (the “Operator,” “we,” “us,” or “our”) handle information when you use [swu.wuteri.ch](https://swu.wuteri.ch), the desktop application, and related services (collectively, the “Service”). The Service is designed to be local-first: your player database normally stays on your device unless you choose a feature that sends data elsewhere.

## 1. Information handled by the Service

### Player database and local application data

The Service can store saved decks, deck names and metadata, the selected deck, card collection quantities, import and export data, AI chat history, opaque chat session tokens, prompt history, interface preferences, and cloud-backup synchronization metadata. In the web application, this data is stored in your browser. The desktop application stores player data and settings on your computer. We do not operate a centralized user-account database for this information.

### Google Drive backup data

If you connect Google Drive, the Service creates a backup containing your saved decks, selected deck, card collection, timestamps, and backup integrity and synchronization identifiers. The backup does not include your AI chat history, AI-provider credentials, or desktop settings.

### AI assistant data

If you choose to use the AI assistant, the Service processes the prompt you submit, your current deck, relevant saved-deck and card-collection context, prior conversation context, and any image attachment you intentionally add where that feature is supported. The Service also processes a session token and provider continuation identifier so a conversation can continue.

### Technical and security data

The web server, hosting provider, and reverse proxy may process ordinary request information such as IP address, user agent, requested path, timestamps, response status, and diagnostic or security events. The Service also uses IP addresses in memory for access control, abuse prevention, rate limiting, and binding AI sessions to a client.

## 2. How information is used

We use information only as needed to:

- provide deck building, collection, import, export, and backup features;
- generate AI-assisted deck suggestions and maintain chat continuity;
- operate, secure, debug, and improve the Service;
- prevent abuse and enforce request and access limits; and
- comply with applicable law and protect users, the Service, and others.

We do not sell personal information. We do not use Google user data for advertising, credit decisions, or generalized profiling, and we do not use Google Drive backups to train AI models.

## 3. Google Drive and Google API data

Google Drive backup is optional. The Service requests only the Google Drive application-data scope (`drive.appdata`). This lets this application read and write files in its own hidden application-data folder; it does not give the Service broad access to your Drive files, Google profile, or email address.

In the hosted version, Drive backup contents travel directly between your browser and Google. To avoid asking you to reconnect after every page reload, the hosted SWU Deck Builder service exchanges Google's one-time authorization code, briefly processes the resulting OAuth credentials, and encrypts the refresh token into a Secure, HttpOnly, SameSite cookie stored by your browser. The service does not persist the refresh token in a user database or receive the Drive backup contents. Short-lived access tokens are returned to the browser and held in memory while connected. The encrypted authorization cookie can remain for up to 180 days and is renewed when used.

In the desktop version, Drive requests travel between the local desktop process and Google. The desktop app holds short-lived access tokens in memory and stores its refresh token encrypted with operating-system credential protection in the app's per-user data directory. Google credentials are never placed in the player database. Disconnecting asks Google to revoke the authorization where supported and removes the hosted authorization cookie or locally stored desktop refresh token, but it does not delete the backup file already stored by Google.

You can remove the backup through your Google Drive application-data or connected-app settings. Google may also delete the application-data folder when you remove the application's access. Google handles that data under its own terms and privacy policy.

SWU Deck Builder's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## 4. Imports, exports, and backup precedence

You control manual player-database imports and exports. When you import or restore a database, that local database becomes authoritative. If remote backup is connected, the imported database is queued to replace the remote backup. An export creates a file under your control; where you save or share that file is your responsibility.

## 5. AI providers and other third parties

AI requests are sent to the AI provider configured for the deployment or desktop application, which may include OpenAI services, Codex CLI, or Claude CLI. Those providers process submitted content under their own terms and privacy policies. Provider-side retention can vary by provider, account, feature, and configuration. AI chat may use provider-side stored responses or continuation state when necessary to continue a conversation.

The catalog and card images may be obtained from third-party sources. Loading external images or following links to services such as SWUDB, TCGplayer, GitHub, or ForceTable can disclose ordinary request information to those services. Their privacy policies apply to their handling of it.

## 6. Cookies and browser storage

The hosted web application uses browser storage for the local-first data described above. It does not currently use advertising cookies or cross-site tracking cookies. The desktop application uses a temporary, HTTP-only access cookie to restrict its local server to the desktop app. Hosting infrastructure may use strictly necessary security or routing mechanisms.

## 7. Retention and deletion

- Browser and desktop data remains until you delete it, clear the relevant application storage, uninstall the application, or replace it by import.
- Google Drive backup data remains in your Google account until you remove it or Google removes it. The hosted encrypted authorization cookie can remain for up to 180 days and is renewed when used; disconnecting clears it. Disconnecting alone does not delete the Drive backup.
- AI session metadata, access leases, and rate-limit records are primarily held in server memory and expire where configured or are cleared by a new chat or server restart. Some CLI conversation state can remain until a new chat or server restart.
- Infrastructure logs, if enabled, are kept only as long as reasonably necessary for operations, security, troubleshooting, and legal duties.
- AI providers and linked services retain data according to their own policies and the account or deployment configuration.

## 8. Legal bases and your choices

Where data-protection law requires a legal basis, we process information to provide features you request, based on your consent for optional Google Drive access, and for legitimate interests in operating and securing the Service, subject to your rights and applicable law. You may choose not to connect Drive or use AI features, disconnect Drive, start a new AI chat, delete local data, or stop using the Service.

## 9. Your privacy rights

Depending on where you live, you may have rights to access, correct, delete, restrict, or object to processing; receive a portable copy; or withdraw consent. Most player data is directly under your control in your browser, desktop storage, exported files, or Google account. To make a request about information held by the Operator, use the contact method below. We may need enough information to verify and respond to the request. You may also have the right to complain to your local data-protection authority.

## 10. Security and international processing

We use reasonable technical and organizational safeguards, including limited Google scopes, memory-only access tokens, authenticated encryption for hosted refresh-token cookies, Secure and HttpOnly cookie restrictions, strict origin validation, OS-encrypted desktop refresh tokens, PKCE for desktop authorization, input validation, access controls, and rate limiting. No system is completely secure, so keep your exported backups and connected accounts protected. Third-party providers may process data in countries other than your own and use the safeguards described in their policies.

## 11. Children

The Service is not directed to children who cannot legally consent to the processing described here. If you are a parent or guardian and believe a child provided personal information through an optional online feature, contact us so we can evaluate the request.

## 12. Changes and contact

We may update this policy as the Service changes. We will update the date above and, for material changes, provide notice through the Service or project repository when reasonably possible.

The Service is operated by the SWU Deck Builder project maintainers. Privacy questions and requests may be submitted through the [project issue tracker](https://github.com/Alfwich/swu-deck-builder/issues). Do not include private player data, access tokens, or other sensitive information in a public issue; ask for a private contact channel instead.
