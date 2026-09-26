-- Cidades do histórico real do casal. Dado de REFERÊNCIA, não dado de usuário:
-- profiles.home_city_id é NOT NULL, então o onboarding precisa de cidade
-- existindo (ou criando uma), e as três abaixo são as que a história já usa.
--
-- UUIDs fixos + on conflict do nothing = migration idempotente. Rodar duas
-- vezes não duplica.
--
-- Coordenadas de centro de cidade. Bastam para a derivação, que só compara
-- identidade de cidade. A "distância entre as cidades" das Configurações é da
-- Fase 3 — e há um achado registrado na spec: linha reta SJC↔Marau dá 861 km,
-- o design mostra 960, então aquele número é rodoviário, não geodésico.

insert into public.cities (id, name, state_code, country_code, lat, lng) values
  ('c17e0b1a-0001-4000-8000-000000000001', 'São José dos Campos', 'SP', 'BR', -23.1791, -45.8872),
  ('c17e0b1a-0002-4000-8000-000000000002', 'Marau',               'RS', 'BR', -28.4497, -52.1986),
  ('c17e0b1a-0003-4000-8000-000000000003', 'Londrina',            'PR', 'BR', -23.3045, -51.1696)
on conflict (id) do nothing;
