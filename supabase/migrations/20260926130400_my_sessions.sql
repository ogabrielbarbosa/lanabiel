-- Fase 3 · 5/5 — sessões ativas da própria conta.
--
-- Spec: .agent/Tasks/fase-3-configuracoes.md, R21, I8 e seção 5 (migration 5)
--
-- `auth.sessions` não é exposto pela API, então as duas funções são security
-- definer — e cortam por `user_id = auth.uid()` DENTRO delas (I8). Sem IP e
-- sem token na resposta: a tela não mostra, então não sai.
--
-- Encerrar apaga a linha de auth.sessions, e o refresh token cai junto (FK em
-- cascata no schema do Auth). O access token que o outro aparelho já tem vale
-- até expirar — até 1 h — e a tela diz isso.

create function public.list_my_sessions()
returns table (
  id             uuid,
  user_agent     text,
  created_at     timestamptz,
  last_active_at timestamptz,
  is_current     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_current uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
begin
  if v_uid is null then
    raise exception 'list_my_sessions sem sessão' using errcode = '42501';
  end if;

  return query
    select s.id,
           s.user_agent,
           s.created_at,
           coalesce(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at) as last_active_at,
           s.id = v_current as is_current
      from auth.sessions s
     where s.user_id = v_uid
       and (s.not_after is null or s.not_after > now())
     order by 4 desc;
end;
$$;

create function public.end_my_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null then
    raise exception 'end_my_session sem sessão' using errcode = '42501';
  end if;

  delete from auth.sessions where id = p_session_id and user_id = v_uid;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ended');
end;
$$;

revoke execute on function public.list_my_sessions()     from public, anon;
revoke execute on function public.end_my_session(uuid)   from public, anon;
grant  execute on function public.list_my_sessions()     to authenticated;
grant  execute on function public.end_my_session(uuid)   to authenticated;
