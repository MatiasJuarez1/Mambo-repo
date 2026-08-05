// Equipo de Mambo Group.
//
// Los retratos viven en client/public/equipo/<slug>.jpg, recortados a 3:4 y a 800 px de
// ancho. Los originales sin recortar están en client/fotos-originales/.
// Ver docs/superpowers/specs/2026-08-04-pagina-nosotros-equipo-design.md

export type Persona = {
  /** Clave de React y nombre del archivo de la foto. */
  slug: string
  nombre: string
  rol: string
  /** Frase personal. Se muestra como cita. */
  cita: string
  /** Un párrafo por elemento: Sandra tiene dos, el resto uno. */
  bio: string[]
}

/** Fundadora. Va destacada en su propia fila, no dentro del grid. */
export const FUNDADORA: Persona = {
  slug: 'sandra',
  nombre: 'Sandra Lestard',
  rol: 'Fundadora · Asesora Inmobiliaria',
  cita: 'Las propiedades son solo el escenario. La verdadera historia siempre son las personas.',
  bio: [
    'Con más de veinte años de experiencia liderando empresas y equipos de trabajo, Sandra decidió llevar esa visión de gestión al mercado inmobiliario y fundó Mambo Group. Desde donde impulsa una forma distinta de hacer inmobiliaria: más humana, cercana y comprometida con las personas.',
    'Su liderazgo se basa en la convicción de que la confianza se construye con transparencia, capacitación permanente y un acompañamiento genuino antes, durante y después de cada operación, de cada negocio. Esa filosofía es la que hoy inspira a todo el equipo de Mambo y define la manera en que trabajamos cada día.',
  ],
}

export const EQUIPO: Persona[] = [
  {
    slug: 'luisina',
    nombre: 'Luisina Cristófaro',
    rol: 'Estrategia de Marketing y Contenido',
    cita: 'Las mejores marcas cuentan historias reales.',
    bio: [
      'Licenciada en Higiene y Seguridad, encontró en el marketing y la comunicación el espacio ideal para unir el pensamiento estratégico con la creatividad. En Mambo desarrolla la identidad de la marca, crea contenidos y diseña estrategias que conectan desde la autenticidad, siempre con una mirada humana y orientada a resultados.',
    ],
  },
  {
    slug: 'belen',
    nombre: 'Belén del Corro Lestard',
    rol: 'Asesora Inmobiliaria',
    cita: 'La cercanía también es profesionalismo.',
    bio: [
      'Después de más de diez años de trayectoria en el sector bancario, comercial y financiero, Belén decidió volcar toda esa experiencia al negocio inmobiliario familiar. Hoy acompaña a cada cliente con una mirada integral, claridad y vocación de servicio, manteniendo los valores que dieron origen a Mambo: cercanía, capacitación permanente y compromiso genuino.',
    ],
  },
  {
    slug: 'agustina',
    nombre: 'Agustina Polanco',
    rol: 'Corredora Inmobiliaria',
    cita: 'Cada hogar comienza con una buena decisión.',
    bio: [
      'Desde 2019 forma parte del mundo inmobiliario, creciendo profesionalmente de la mano de Sandra Lestard y consolidando una forma de trabajar basada en la ética, la empatía y el acompañamiento. Mamá de tres hijos, entiende que detrás de cada propiedad hay una familia, un proyecto de vida y nuevos comienzos que merecen ser acompañados con profesionalismo y calidez.',
    ],
  },
  {
    slug: 'nadia',
    nombre: 'Nadia Medina',
    rol: 'Agente Inmobiliaria',
    cita: 'Confianza que acompaña.',
    bio: [
      'Con una sólida experiencia en el sector inmobiliario y formación junto a una de las empresas más reconocidas del medio, Nadia combina conocimiento, cercanía y compromiso en cada operación. Dinámica y resolutiva, acompaña a sus clientes con transparencia, brindando el respaldo y la confianza necesarios para tomar grandes decisiones.',
    ],
  },
  {
    slug: 'marianela',
    nombre: 'Marianela Veiga',
    rol: 'Agente Inmobiliaria',
    cita: 'Encontrar soluciones es mi forma de ayudar.',
    bio: [
      'Con experiencia en el sector público y privado y formación como Licenciada en Resolución de Conflictos y Mediación, Marianela, oriunda de la ciudad de Salta, combina escucha, negociación y profesionalismo para acompañar cada operación. Su compromiso, honestidad y calidez le permiten generar acuerdos y brindar soluciones que transmiten confianza en cada etapa del proceso.',
    ],
  },
]

/** Ruta pública del retrato. */
export function fotoDe(p: Persona): string {
  return `/equipo/${p.slug}.jpg`
}

/** Texto alternativo: nombre y rol, para que el lector de pantalla no lea solo "foto". */
export function altDe(p: Persona): string {
  return `${p.nombre}, ${p.rol.toLowerCase()}`
}
