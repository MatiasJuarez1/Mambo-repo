// Servicios de Mambo Group.
//
// Datos estáticos de la página Servicios. Los `slug` se usan como anclas de URL
// (p. ej. /servicios#puesta-en-valor) y los `num` como numeración visible en la
// portada de cada bloque: no cambiar ninguno de los dos sin actualizar los links.

export interface Servicio {
  /** Ancla de URL y clave de React. */
  slug: string
  /** Numeración visible del bloque: '01' … '05'. */
  num: string
  titulo: string
  /** Párrafo introductorio del servicio. */
  bajada: string
  /** Prestaciones concretas, una por elemento. */
  items: string[]
}

export const SERVICIOS: Servicio[] = [
  {
    slug: 'activos-inmobiliarios',
    num: '01',
    titulo: 'Administración de Activos Inmobiliarios',
    bajada:
      'Gestionamos el patrimonio inmobiliario de personas, familias e inversores, brindando un acompañamiento integral en cada operación.',
    items: [
      'Compra de propiedades',
      'Venta de propiedades',
      'Alquileres residenciales y comerciales',
      'Tasaciones y valuaciones',
      'Estrategias de comercialización',
      'Asesoramiento durante todo el proceso de la operación',
    ],
  },
  {
    slug: 'administracion-alquileres',
    num: '02',
    titulo: 'Administración de Alquileres y Propiedades',
    bajada:
      'Nos ocupamos de la gestión integral de inmuebles para que el propietario obtenga tranquilidad, seguridad y rentabilidad.',
    items: [
      'Administración de alquileres',
      'Cobranza y control de pagos',
      'Gestión de contratos',
      'Atención a propietarios e inquilinos',
      'Coordinación de mantenimiento',
      'Seguimiento administrativo y legal',
    ],
  },
  {
    slug: 'puesta-en-valor',
    num: '03',
    titulo: 'Puesta en Valor de Propiedades',
    bajada:
      'Preparamos cada inmueble para que alcance su máximo potencial comercial y obtenga el mejor resultado en el mercado.',
    items: [
      'Diagnóstico de la propiedad',
      'Home Staging',
      'Mejoras estéticas y funcionales',
      'Coordinación de refacciones',
      'Paisajismo y exteriores',
      'Producción fotográfica y audiovisual profesional',
      'Estrategia de lanzamiento al mercado',
    ],
  },
  {
    slug: 'urbanizaciones',
    num: '04',
    titulo: 'Administración y Gestión de Urbanizaciones',
    bajada:
      'Brindamos soluciones profesionales para barrios privados, countries, fideicomisos y urbanizaciones abiertas.',
    items: [
      'Administración integral',
      'Gestión administrativa y financiera',
      'Organización de consorcios',
      'Administración fiduciaria',
      'Planificación y seguimiento de obras',
      'Gestión de proveedores',
      'Elaboración y control de presupuestos',
      'Cobranza de expensas',
      'Transparencia y rendición de cuentas',
      'Planificación estratégica para el desarrollo del emprendimiento',
    ],
  },
  {
    slug: 'asesoria-financiera',
    num: '05',
    titulo: 'Asesoría Financiera e Inversión Inmobiliaria',
    bajada:
      'Ayudamos a nuestros clientes a tomar decisiones inteligentes para proteger y hacer crecer su patrimonio.',
    items: [
      'Análisis de inversiones',
      'Evaluación de rentabilidad',
      'Desarrollo de estrategias patrimoniales',
      'Búsqueda de oportunidades de inversión',
      'Asesoramiento para desarrolladores',
      'Análisis de proyectos inmobiliarios',
      'Optimización del patrimonio inmobiliario',
    ],
  },
]

/** Bajada del hero de la página Servicios. */
export const SERVICIOS_INTRO =
  'Más que vender propiedades, administramos patrimonio inmobiliario. Acompañamos a nuestros clientes en todas las etapas del ciclo de vida de un inmueble: desde la inversión y adquisición, pasando por su administración y puesta en valor, hasta su comercialización o desarrollo.'
