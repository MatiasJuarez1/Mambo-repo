"""
Seed script – inserta 6 propiedades de ejemplo en mamboDB.
Ejecutar desde la carpeta src/:  python seed.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import text
from app.database import SessionLocal

propiedades = [
    dict(
        titulo="Casa 3 dormitorios en Yerba Buena",
        descripcion="Hermosa casa en barrio residencial con jardín y pileta. Excelente iluminación natural, garage doble y seguridad 24hs.",
        tipo_propiedad="casa",
        tipo_operacion="venta",
        estado_comercial="disponible",
        moneda="USD",
        precio=185000,
        dormitorios=3,
        banos=2,
        m2_cubiertos=180,
        m2_totales=400,
        ubicacion=dict(direccion="Av. Aconquija 3250", ciudad="Yerba Buena", provincia="Tucumán", pais="AR", codigo_postal="4107"),
        medios=[
            dict(tipo_medio="imagen", url="https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800", descripcion="Frente de la propiedad", orden=1, es_principal=True),
            dict(tipo_medio="imagen", url="https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800", descripcion="Jardín y pileta", orden=2, es_principal=False),
        ],
        caracteristicas=[
            dict(clave="Pileta", valor="Sí"),
            dict(clave="Garage", valor="Doble"),
            dict(clave="Seguridad", valor="24hs"),
            dict(clave="Antigüedad", valor="10 años"),
        ],
    ),
    dict(
        titulo="Departamento céntrico 2 ambientes",
        descripcion="Moderno departamento a pasos de la plaza principal. Piso alto con vista a la ciudad, cocina integrada y balcón.",
        tipo_propiedad="depto",
        tipo_operacion="alquiler",
        estado_comercial="disponible",
        moneda="ARS",
        precio=280000,
        dormitorios=1,
        banos=1,
        m2_cubiertos=55,
        m2_totales=60,
        ubicacion=dict(direccion="San Martín 640 Piso 8", ciudad="San Miguel de Tucumán", provincia="Tucumán", pais="AR", codigo_postal="4000"),
        medios=[
            dict(tipo_medio="imagen", url="https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800", descripcion="Living comedor", orden=1, es_principal=True),
            dict(tipo_medio="imagen", url="https://images.unsplash.com/photo-1554995207-c18c203602cb?w=800", descripcion="Balcón con vista", orden=2, es_principal=False),
        ],
        caracteristicas=[
            dict(clave="Balcón", valor="Sí"),
            dict(clave="Piso", valor="8vo"),
            dict(clave="Expensas", valor="$45.000/mes"),
        ],
    ),
    dict(
        titulo="Lote en barrio privado El Manantial",
        descripcion="Excelente lote en barrio cerrado con todos los servicios. Ideal para construir la casa de sus sueños en un entorno natural.",
        tipo_propiedad="terreno",
        tipo_operacion="venta",
        estado_comercial="disponible",
        moneda="USD",
        precio=42000,
        dormitorios=None,
        banos=None,
        m2_cubiertos=None,
        m2_totales=600,
        ubicacion=dict(direccion="Barrio El Manantial, Lote 47", ciudad="El Manantial", provincia="Tucumán", pais="AR", codigo_postal="4109"),
        medios=[
            dict(tipo_medio="imagen", url="https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800", descripcion="Vista del lote", orden=1, es_principal=True),
        ],
        caracteristicas=[
            dict(clave="Servicios", valor="Agua, luz, gas, cloaca"),
            dict(clave="Barrio cerrado", valor="Sí"),
            dict(clave="Dimensiones", valor="20 x 30 mts"),
        ],
    ),
    dict(
        titulo="Local comercial en avenida principal",
        descripcion="Local a la calle con gran visibilidad, salón principal amplio, depósito y baño. Zona de alto tránsito comercial.",
        tipo_propiedad="local",
        tipo_operacion="alquiler",
        estado_comercial="disponible",
        moneda="ARS",
        precio=450000,
        dormitorios=None,
        banos=1,
        m2_cubiertos=120,
        m2_totales=120,
        ubicacion=dict(direccion="Av. Mate de Luna 1850", ciudad="San Miguel de Tucumán", provincia="Tucumán", pais="AR", codigo_postal="4000"),
        medios=[
            dict(tipo_medio="imagen", url="https://images.unsplash.com/photo-1604328698692-f76ea9498e76?w=800", descripcion="Frente del local", orden=1, es_principal=True),
            dict(tipo_medio="imagen", url="https://images.unsplash.com/photo-1497366216548-37526070297c?w=800", descripcion="Interior del salón", orden=2, es_principal=False),
        ],
        caracteristicas=[
            dict(clave="Salón principal", valor="90 m²"),
            dict(clave="Depósito", valor="30 m²"),
            dict(clave="Vidriera", valor="Doble"),
        ],
    ),
    dict(
        titulo="Casa de temporada en El Cadillal",
        descripcion="Encantadora casa de campo a orillas del dique. Perfecta para vacaciones, con quincho, parrilla y acceso directo al lago.",
        tipo_propiedad="casa",
        tipo_operacion="temporal",
        estado_comercial="disponible",
        moneda="ARS",
        precio=95000,
        dormitorios=4,
        banos=2,
        m2_cubiertos=160,
        m2_totales=1200,
        ubicacion=dict(direccion="Ruta Provincial 340, Km 12", ciudad="El Cadillal", provincia="Tucumán", pais="AR", codigo_postal="4111"),
        medios=[
            dict(tipo_medio="imagen", url="https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?w=800", descripcion="Vista al lago", orden=1, es_principal=True),
            dict(tipo_medio="imagen", url="https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=800", descripcion="Quincho y parrilla", orden=2, es_principal=False),
        ],
        caracteristicas=[
            dict(clave="Quincho", valor="Sí"),
            dict(clave="Parrilla", valor="Sí"),
            dict(clave="Acceso al lago", valor="Directo"),
            dict(clave="Precio por semana", valor="$95.000"),
        ],
    ),
    dict(
        titulo="Departamento en barrio San Cayetano",
        descripcion="Cómodo departamento en planta baja. Ubicado en barrio tranquilo con fácil acceso al centro. Cochera cubierta incluida.",
        tipo_propiedad="depto",
        tipo_operacion="venta",
        estado_comercial="reservada",
        moneda="USD",
        precio=68000,
        dormitorios=2,
        banos=1,
        m2_cubiertos=72,
        m2_totales=80,
        ubicacion=dict(direccion="Esquiú 380 Planta Baja B", ciudad="San Miguel de Tucumán", provincia="Tucumán", pais="AR", codigo_postal="4000"),
        medios=[
            dict(tipo_medio="imagen", url="https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800", descripcion="Dormitorio principal", orden=1, es_principal=True),
            dict(tipo_medio="imagen", url="https://images.unsplash.com/photo-1556912173-3bb406ef726b?w=800", descripcion="Cocina", orden=2, es_principal=False),
        ],
        caracteristicas=[
            dict(clave="Cochera", valor="Cubierta"),
            dict(clave="Planta baja", valor="Sí"),
            dict(clave="Antigüedad", valor="5 años"),
        ],
    ),
]


def run():
    db = SessionLocal()
    try:
        # Limpiar si ya hay datos (re-run seguro)
        existing = db.execute(text("SELECT COUNT(*) FROM propiedades")).scalar()
        if existing and existing > 0:
            print(f"  [!] Ya existen {existing} propiedades. Limpiando antes de insertar...")
            db.execute(text("DELETE FROM propiedades_caracteristicas"))
            db.execute(text("DELETE FROM propiedades_medios"))
            db.execute(text("DELETE FROM propiedades_ubicaciones"))
            db.execute(text("DELETE FROM propiedades"))

        total = 0
        for item in propiedades:
            # ── Insert propiedad ──────────────────────────────────────────
            result = db.execute(
                text("""
                    INSERT INTO propiedades
                        (titulo, descripcion, tipo_propiedad, tipo_operacion,
                         estado_comercial, moneda, precio,
                         dormitorios, banos, m2_cubiertos, m2_totales)
                    VALUES
                        (:titulo, :descripcion,
                         CAST(:tipo_propiedad AS tipo_propiedad),
                         CAST(:tipo_operacion AS tipo_operacion),
                         CAST(:estado_comercial AS estado_comercial),
                         :moneda, :precio,
                         :dormitorios, :banos, :m2_cubiertos, :m2_totales)
                    RETURNING id
                """),
                {k: v for k, v in item.items() if k not in ("ubicacion", "medios", "caracteristicas")},
            )
            propiedad_id = result.scalar_one()

            # ── Insert ubicacion ──────────────────────────────────────────
            ub = item["ubicacion"]
            db.execute(
                text("""
                    INSERT INTO propiedades_ubicaciones
                        (propiedad_id, direccion, ciudad, provincia, pais, codigo_postal)
                    VALUES
                        (:propiedad_id, :direccion, :ciudad, :provincia, :pais, :codigo_postal)
                """),
                {"propiedad_id": propiedad_id, **ub},
            )

            # ── Insert medios ─────────────────────────────────────────────
            for m in item["medios"]:
                db.execute(
                    text("""
                        INSERT INTO propiedades_medios
                            (propiedad_id, tipo_medio, url, descripcion, orden, es_principal)
                        VALUES
                            (:propiedad_id, CAST(:tipo_medio AS tipo_medio),
                             :url, :descripcion, :orden, :es_principal)
                    """),
                    {"propiedad_id": propiedad_id, **m},
                )

            # ── Insert caracteristicas ────────────────────────────────────
            for c in item["caracteristicas"]:
                db.execute(
                    text("""
                        INSERT INTO propiedades_caracteristicas
                            (propiedad_id, clave, valor)
                        VALUES
                            (:propiedad_id, :clave, :valor)
                    """),
                    {"propiedad_id": propiedad_id, **c},
                )

            total += 1
            print(f"  OK [{total}] {item['titulo']} (id={propiedad_id})")

        db.commit()
        print(f"\nSeed completado: {total} propiedades insertadas.")
    except Exception as e:
        db.rollback()
        print(f"\nError durante el seed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
