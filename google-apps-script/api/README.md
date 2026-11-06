# ScriptFlow API-only Apps Script project

Create a separate Apps Script project for this API. Do not change the existing employee authentication deployment.

Deploy as a Web App executing as the spreadsheet owner. The endpoint must require a valid HMAC-signed request from the Vercel server on every request. The endpoint is publicly reachable, so an unsigned request must never read or write spreadsheet data.

Add Script Property SCRIPT_FLOW_API_SECRET with a random secret of at least 32 characters. Store the matching value only as a Vercel server-side environment variable. Never commit either value.

Before implementing spreadsheet operations, require a timestamp within 60 seconds, a unique nonce with replay prevention, a constant-time HMAC signature comparison, a strict operation allowlist, and role authorization. Do not accept employee identity or role from browser input. Only accept claims from a verified Vercel session.

The required operations are get_jobs, create_job, update_job, and redeem_auth_token. Do not implement a generic spreadsheet read/write endpoint. Reuse the approved project field mapping, validation, ID handling, and formula-safe writes from the supplied Code.gs.

This is deployment guidance only. Do not deploy this project until its signed request handler and replay-protection tests have been implemented.
