import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STATUS_LABEL: Record<string, string> = {
  new: 'New', qnr_check: 'QNR check', ready: 'Ready', in_progress: 'In progress',
  qa_review: 'QA review', revisions: 'Revisions', blocked: 'Blocked',
  waiting_information: 'Waiting for information', completed: 'Completed', cancelled: 'Cancelled',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return response({ error: 'Missing Authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const appsScriptUrl = Deno.env.get('GOOGLE_APPS_SCRIPT_URL');
  const syncSecret = Deno.env.get('GOOGLE_SHEETS_SYNC_SECRET');
  if (!appsScriptUrl || !syncSecret) return response({ error: 'Google Sheets integration secrets are not configured.' }, 500);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return response({ error: 'Invalid or expired session.' }, 401);

  let body: { job_id?: string };
  try { body = await req.json(); } catch { return response({ error: 'Request body must be valid JSON.' }, 400); }
  if (!body.job_id) return response({ error: 'job_id is required.' }, 400);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: profile, error: profileError } = await admin
    .from('profiles').select('id,role,is_active').eq('id', authData.user.id).single();
  if (profileError || !profile || !profile.is_active) return response({ error: 'Active ScriptFlow profile not found.' }, 403);

  const { data: job, error: jobError } = await admin.from('jobs').select('*').eq('id', body.job_id).single();
  if (jobError || !job) return response({ error: 'Job not found.' }, 404);

  const isLead = ['admin', 'team_lead'].includes(profile.role);
  const isAssigned = [job.main_pm_id, job.backup_pm_id, job.main_scripter_id, job.backup_scripter_id, job.main_tester_id, job.backup_tester_id]
    .includes(authData.user.id);
  if (!isLead && !isAssigned) return response({ error: 'You are not allowed to synchronise this job.' }, 403);

  const ids = [job.main_pm_id, job.main_tester_id].filter(Boolean);
  const { data: people } = ids.length
    ? await admin.from('profiles').select('id,full_name,email').in('id', ids)
    : { data: [] as Array<{id:string;full_name:string;email:string}> };
  const personById = new Map((people || []).map((person) => [person.id, person]));
  const display = (id: string | null) => {
    if (!id) return '';
    const person = personById.get(id);
    return person?.full_name || person?.email || '';
  };

  const payload = {
    ...job,
    status_label: STATUS_LABEL[job.status] || job.status,
    main_pm_name: display(job.main_pm_id),
    main_tester_name: display(job.main_tester_id),
  };

  const { data: previousSync } = await admin.from('job_google_sheet_sync')
    .select('attempts').eq('job_id', job.id).eq('provider', 'google_sheets').maybeSingle();
  const nextAttempt = (previousSync?.attempts || 0) + 1;
  const { error: pendingError } = await admin.from('job_google_sheet_sync').upsert({
    job_id: job.id, provider: 'google_sheets', status: 'pending', last_error: null,
    attempts: nextAttempt,
  }, { onConflict: 'job_id,provider', ignoreDuplicates: false });
  if (pendingError) return response({ error: `Could not record sync attempt: ${pendingError.message}` }, 500);

  try {
    const googleResponse = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: syncSecret, job: payload }),
    });
    const result = await googleResponse.json();
    if (!googleResponse.ok || !result.ok) throw new Error(result.error || `Google Apps Script returned HTTP ${googleResponse.status}`);

    await admin.from('job_google_sheet_sync').upsert({
      job_id: job.id, provider: 'google_sheets', status: 'synced',
      last_synced_at: new Date().toISOString(), last_error: null,
      remote_row: result.row || null,
    }, { onConflict: 'job_id,provider' });
    return response({ ok: true, action: result.action, row: result.row });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from('job_google_sheet_sync').upsert({
      job_id: job.id, provider: 'google_sheets', status: 'failed',
      last_error: message,
    }, { onConflict: 'job_id,provider' });
    return response({ error: `Job saved in ScriptFlow, but Google Sheets sync failed: ${message}` }, 502);
  }
});
