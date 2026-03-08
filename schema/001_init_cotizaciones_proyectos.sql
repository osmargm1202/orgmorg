-- Esquema recomendado para orgmorg con Neon Auth + Data API.
-- Incluye una secuencia y una función RPC para reservar el siguiente número
-- de cotización de forma segura y reutilizable desde PostgREST/Data API.

CREATE TABLE IF NOT EXISTS proyectos (
  id BIGSERIAL PRIMARY KEY,
  id_externo INTEGER UNIQUE,
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS cotizacion_num_seq;

CREATE TABLE IF NOT EXISTS cotizaciones (
  id BIGSERIAL PRIMARY KEY,
  cotizacion INTEGER NOT NULL UNIQUE DEFAULT nextval('cotizacion_num_seq'),
  proyecto_id BIGINT NOT NULL REFERENCES proyectos(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_proyecto_id ON cotizaciones (proyecto_id);

CREATE OR REPLACE FUNCTION orgmorg_sync_cotizacion_seq()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  max_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(cotizacion), 0) INTO max_num FROM cotizaciones;
  PERFORM setval('cotizacion_num_seq', GREATEST(max_num, 1), max_num > 0);
END;
$$;

SELECT orgmorg_sync_cotizacion_seq();

CREATE OR REPLACE FUNCTION orgmorg_create_cotizacion(
  p_nombre TEXT DEFAULT NULL,
  p_proyecto_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  cotizacion_id BIGINT,
  proyecto_id BIGINT,
  cotizacion INTEGER,
  proyecto_nombre TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_proyecto_id BIGINT;
  v_proyecto_nombre TEXT;
BEGIN
  IF p_proyecto_id IS NULL AND (p_nombre IS NULL OR BTRIM(p_nombre) = '') THEN
    RAISE EXCEPTION 'Debes indicar p_nombre o p_proyecto_id';
  END IF;

  PERFORM orgmorg_sync_cotizacion_seq();

  IF p_proyecto_id IS NULL THEN
    INSERT INTO proyectos (nombre)
    VALUES (BTRIM(p_nombre))
    RETURNING id, nombre INTO v_proyecto_id, v_proyecto_nombre;
  ELSE
    SELECT id, nombre
    INTO v_proyecto_id, v_proyecto_nombre
    FROM proyectos
    WHERE id = p_proyecto_id;

    IF v_proyecto_id IS NULL THEN
      RAISE EXCEPTION 'Proyecto % no encontrado', p_proyecto_id;
    END IF;
  END IF;

  RETURN QUERY
  INSERT INTO cotizaciones (proyecto_id)
  VALUES (v_proyecto_id)
  RETURNING cotizaciones.id, cotizaciones.proyecto_id, cotizaciones.cotizacion, v_proyecto_nombre;
END;
$$;
