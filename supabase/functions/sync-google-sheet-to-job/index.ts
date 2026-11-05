import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-scriptflow-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EDITABLE_FIELDS = new Set([
  'sw', 'project_number', 'spm_project_number', 'project_name',
  'main_pm_name', 'main_tester_name',
  'status', 'questions', 'loi', 'level', 'qnr_received_on',
  'date_sent_to_qa', 'date_sent_to_pm', 'launch_date',
  'changes_time_hours', 'testing_time_hours', 'mailing_time_hours',
  'hours_worked', 'commissioning_country', 'overlay', 'price_scripting',
  'hours_commissioned', 'client', 'bari_oe_checks', 'bari_moderations',
  'bari_scripting', 'bsurvey', 'complexity_as_spm'
]);

const STATUS_VALUES: Record<string, string> = {
  'new': 'new', 'qnr check': 'qnr_check', 'ready': 'ready',
  'in progress': 'in_progress', 'qa review': 'qa_review',
  'revisions': 'revisions', 'blocked': 'blocked',
  'waiting for information': 'waiting_information',
  'completed': 'completed', 'cancelled': 'cancelled',
};

const NUMERIC_FIELDS = new Set([
  'questions', 'loi', 'changes_time_hours', 'testing_time_hours',
  'mailing_time_hours', 'hours_worked', 'price_scripting', 'hours_commissioned',
  'complexity_as_spm'
]);
const DATE_FIELDS = new Set([
  'qnr_received_on', 'date_sent_to_qa', 'date_sent_to_pm', 'launch_date'
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function parseValue(field: string, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === '') return null;

  if (field === 'status') {
    const status = STATUS_VALUES[normalize(raw)];
    if (!status) throw new Error('Unknown status value: ' + String(raw));
    return status;
  }

  if (NUMERIC_FIELDS.has(field)) {
    const value = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) throw new Error(field + ' must be a non-negative number.');
    if (field === 'questions' && !Number.isInteger(value)) throw new Error('Questions must be a whole number.');
    return value;
  }

  if (DATE_FIELDS.has(field)) {
    const value = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(field + ' must use YYYY-MM-DD format.');
    }
    return value;
  }

  return String(raw).trim() || null;
}

async function resolvePersonId(admin: any, raw: unknown): Promise<string | null> {
  const name = String(raw ?? '').trim();
  if (!name) return null;

  const { data, error } = await admin
    .from('profiles')
    .select('id,full_name,email,is_active')
    .eq('is_active', true);

  if (error) throw error;
  const exact = (data || []).filter((person: any) =>
    normalize(person.full_name) === normalize(name) || normalize(person.email) === normalize(name)
  );
  if (exact.length !== 1) {
    throw new Error(exact.length ? 'More than one team member matches "' + name + '". Use a unique full name or email.' : 'No active team member matches "' + name + '".');
  }
  return exact[0].id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);

  try {
    const expectedSecret = Deno.env.get('GOOGLE_SHEETS_WEBHOOK_SECRET');
    const suppliedSecret = req.headers.get('x-scriptflow-sync-secret');
    if (!expectedSecret || suppliedSecret !== expectedSecret) {
      return json({ ok: false, error: 'Unauthorized.' }, 401);
    }

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) throw new Error('Supabase server environment is not configured.');

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json();
    const jobId = String(body.job_id || '').trim();
    const action = String(body.action || 'update');
    if (!jobId) throw new Error('Missing job_id.');

    const { data: existing, error: fetchError } = await admin
      .from('jobs').select('id,project_name,deleted_at').eq('id', jobId).maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) throw new Error('Job not found: ' + jobId);

    if (action === 'archive' || action === 'restore') {
      const patch = action === 'archive'
        ? { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        : { deleted_at: null, updated_at: new Date().toISOString() };
      const { error } = await admin.from('jobs').update(patch).eq('id', jobId);
      if (error) throw error;
      return json({ ok: true, action, job_id: jobId });
    }

    if (action !== 'update') throw new Error('Unsupported action.');

    const field = String(body.field || '');
    if (!EDITABLE_FIELDS.has(field)) throw new Error('This spreadsheet column is read-only or not approved: ' + field);
    if (existing.deleted_at) throw new Error('This job is archived. Restore it in ScriptFlow before editing it.');

    const value = body.value;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (field === 'main_pm_name' || field === 'main_tester_name') {
      const idField = field === 'main_pm_name' ? 'main_pm_id' : 'main_tester_id';
      patch[idField] = await resolvePersonId(admin, value);
    } else {
      patch[field] = parseValue(field, value);
    }

    if (['scripting_time_hours', 'changes_time_hours', 'testing_time_hours', 'mailing_time_hours'].includes(field)) {
      const current = await admin.from('jobs').select('scripting_time_hours,changes_time_hours,testing_time_hours,mailing_time_hours').eq('id', jobId).single();
      if (current.error) throw current.error;
      const combined = { ...current.data, ...patch } as Record<string, unknown>;
      const timeFields = ['scripting_time_hours', 'changes_time_hours', 'testing_time_hours', 'mailing_time_hours'];
      const hasAny = timeFields.some((key) => combined[key] !== null && combined[key] !== undefined && combined[key] !== '');
      patch.total_estimated_hours = hasAny
        ? timeFields.reduce((sum, key) => sum + (Number(combined[key]) || 0), 0)
        : null;
    }

    const { error: updateError } = await admin.from('jobs').update(patch).eq('id', jobId);
    if (updateError) throw updateError;

    return json({ ok: true, action: 'updated', job_id: jobId, field });
  } catch (error) {
    console.error('sync-google-sheet-to-job:', error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
