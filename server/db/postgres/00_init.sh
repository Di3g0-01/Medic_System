#!/bin/sh
# Inicialización del contenedor PostgreSQL (docker-entrypoint-initdb.d).
# Crea el rol de aplicación, la base central de usuarios y la base del Hospital General.
set -e
APP_PASSWORD="${RC_APP_PASSWORD:-rc_app_pass}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-SQL
  -- NOINHERIT: rc_app no hereda privilegios; debe ejecutar SET ROLE rc_medico | rc_secretaria | rc_admin.
  CREATE ROLE rc_app LOGIN NOINHERIT PASSWORD '${APP_PASSWORD}';
  CREATE DATABASE red_central;
  CREATE DATABASE hospital_general;
SQL

for f in /sql/central/*.sql; do
  echo "central  <- $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d red_central -f "$f"
done

for f in /sql/hospital/*.sql; do
  echo "hospital <- $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d hospital_general -f "$f"
done
