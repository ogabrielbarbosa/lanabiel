-- Fase 2 · ajuste — começo do namoro não pode ser futuro, em NENHUM caminho.
--
-- Spec: .agent/Tasks/fase-2-onboarding.md, R3 e seção 7 ("Relógio do cliente")
-- Ledger: T6
--
-- `create_couple` já recusava data futura. Mas a tela Confirmar edita a data
-- por UPDATE direto em `couples`, que a policy `couples_update_member` permite
-- — e ali nada checava. Um CHECK não serve (now() não é imutável); uma função
-- `update_couple` security definer seria a oitava porta sem RLS, só para isso.
-- Trigger comum (security invoker) cobre os dois caminhos sem abrir nada.
--
-- "Hoje" é o do servidor, no fuso do casal: o relógio do cliente não decide.

create function private.couples_started_on_not_future()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.started_on > private.today_br() or new.started_on < date '1900-01-01' then
    raise exception 'started_on fora do intervalo: %', new.started_on
      using errcode = '23514', constraint = 'couples_started_on_range';
  end if;
  return new;
end;
$$;

revoke execute on function private.couples_started_on_not_future() from public, anon;
-- Quem escreve em `couples` precisa executar: o trigger roda com a identidade
-- de quem faz o INSERT/UPDATE. `authenticated` pela API (tela Confirmar);
-- `service_role` pelo painel, pelo harness de teste e por qualquer script
-- administrativo — sem este grant, TODA escrita administrativa em `couples`
-- falha com "permission denied for function today_br".
--
-- E USAGE no schema: a harden_schemas deu só a `authenticated`. Sem ele, o
-- trigger falha para o service_role — mas de forma INTERMITENTE, porque o
-- USAGE de schema é checado ao analisar o nome, e o plpgsql guarda o plano por
-- conexão: numa conexão do pool em que `authenticated` já compilou o trigger,
-- o service_role reaproveita o plano e passa. Visto logo depois de um db:reset.
grant usage on schema private to service_role;
grant execute on function private.couples_started_on_not_future() to authenticated, service_role;
grant execute on function private.today_br() to authenticated, service_role;

create trigger couples_started_on_not_future
  before insert or update of started_on on public.couples
  for each row execute function private.couples_started_on_not_future();
