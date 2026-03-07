-- Fix exec_sql to auto-cast $1 (location_id) to UUID
-- This prevents Claude from wasting tool rounds fighting type mismatch errors.

CREATE OR REPLACE FUNCTION exec_sql(query text, params text[] DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '8s'
AS $$
DECLARE
  result jsonb;
  clean_query text;
BEGIN
  -- Strip trailing semicolons and whitespace
  clean_query := rtrim(trim(query), ';');

  -- Only allow SELECT statements
  IF upper(left(clean_query, 6)) != 'SELECT' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  -- Block dangerous keywords
  IF clean_query ~* '\b(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE|GRANT|REVOKE)\b' THEN
    RAISE EXCEPTION 'Query contains forbidden keywords';
  END IF;

  -- Auto-cast: replace location_id = $1 with location_id = $1::uuid
  -- This handles the most common type mismatch (text param vs uuid column)
  clean_query := regexp_replace(clean_query, 'location_id\s*=\s*\$1(?!::)', 'location_id = $1::uuid', 'gi');

  -- Execute with parameters and return as JSON
  EXECUTE 'SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || clean_query || ') t'
    INTO result
    USING params[1], params[2], params[3], params[4], params[5],
          params[6], params[7], params[8], params[9], params[10];

  RETURN result;
END;
$$;

-- Grant execute to the service role (edge functions use this)
GRANT EXECUTE ON FUNCTION exec_sql(text, text[]) TO service_role;

-- Revoke from anon and authenticated (only edge functions should call this)
REVOKE EXECUTE ON FUNCTION exec_sql(text, text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION exec_sql(text, text[]) FROM authenticated;
