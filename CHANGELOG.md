# Changes in Phase 2

- Combined Projects and Tickets into one Jobs module.
- Added the operational fields requested by the team.
- Added primary and backup assignments for PM, scripter, and tester.
- Added job search and status filtering.
- Added `.xlsx` export of the current filtered jobs.
- Added job-level activity logging.
- Added a Supabase migration that copies existing project records into jobs and preserves legacy tables.
- Changed profile lookup to `maybeSingle()` so a missing profile produces a clearer message instead of a single-object coercion error.
