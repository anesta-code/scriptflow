# ScriptFlow employee authentication

Create a separate Apps Script project for employee sign-in. Keep the existing tested employee deployment domain-restricted and unchanged.

Deploy the new project as a Web App executing as the owner and accessible only to users in bilendi.com.

Set Script Properties AUTH_TOKEN_SECRET (random secret, minimum 32 characters) and VERCEL_CALLBACK_URL (exact HTTPS callback URL). Never commit these values.

The employee must be identified using Session.getActiveUser().getEmail(), checked against the bilendi.com domain and explicit role allowlist. Issue a short-lived signed assertion only after those checks pass. Return the assertion in the URL fragment, not a query string. The Vercel callback must immediately remove the fragment and exchange the assertion server-side.
