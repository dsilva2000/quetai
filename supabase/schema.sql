-- Quetai. Pegar entero en el SQL editor de Supabase.
-- Se puede correr más de una vez.
-- La clave de servicio (sb_secret_...) salta RLS. No hay políticas públicas:
-- anon y authenticated no leen ni escriben estas tablas.

create table if not exists usuarios (
  id bigint generated always as identity primary key,
  session_id text not null unique,
  nombre text not null,
  telefono text,
  creado_en timestamptz not null default now()
);

alter table usuarios add column if not exists telefono text;

create table if not exists medicamentos (
  id bigint generated always as identity primary key,
  session_id text not null references usuarios (session_id) on delete cascade,
  nombre text not null,
  horario text not null,
  activo boolean not null default true
);

create table if not exists mensajes (
  id bigint generated always as identity primary key,
  session_id text not null references usuarios (session_id) on delete cascade,
  rol text not null,
  contenido text not null,
  orden integer not null,
  creado_en timestamptz not null default now()
);

create table if not exists push_suscripciones (
  id bigint generated always as identity primary key,
  session_id text not null references usuarios (session_id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  creado_en timestamptz not null default now()
);

create table if not exists fcm_tokens (
  id bigint generated always as identity primary key,
  session_id text not null references usuarios (session_id) on delete cascade,
  token text not null unique,
  creado_en timestamptz not null default now()
);

create table if not exists recordatorios_enviados (
  id bigint generated always as identity primary key,
  session_id text not null references usuarios (session_id) on delete cascade,
  med_id bigint not null,
  fecha_hora text not null default ''
);

create table if not exists alexa_usuarios (
  alexa_user_id text primary key,
  session_id text not null unique references usuarios (session_id) on delete cascade,
  locale text,
  creado_en timestamptz not null default now(),
  ultimo_acceso timestamptz not null default now()
);

create table if not exists perfiles (
  session_id text primary key references usuarios (session_id) on delete cascade,
  apodo text not null default '',
  temas text not null default '',
  evitar text not null default '',
  familia text not null default '',
  notas text not null default '',
  actualizado_en timestamptz not null default now()
);

create table if not exists memoria_largo_plazo (
  session_id text primary key references usuarios (session_id) on delete cascade,
  resumen text not null default '',
  hasta_orden integer not null default 0,
  actualizado_en timestamptz not null default now()
);

create index if not exists medicamentos_session_idx on medicamentos (session_id);
create index if not exists mensajes_session_orden_idx on mensajes (session_id, orden);
create index if not exists fcm_tokens_session_idx on fcm_tokens (session_id);
create index if not exists push_suscripciones_session_idx on push_suscripciones (session_id);
create index if not exists recordatorios_session_idx on recordatorios_enviados (session_id, med_id, fecha_hora);

alter table usuarios enable row level security;
alter table medicamentos enable row level security;
alter table mensajes enable row level security;
alter table push_suscripciones enable row level security;
alter table fcm_tokens enable row level security;
alter table recordatorios_enviados enable row level security;
alter table alexa_usuarios enable row level security;
alter table perfiles enable row level security;
alter table memoria_largo_plazo enable row level security;
