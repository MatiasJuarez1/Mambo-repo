import { reportesApi } from './reportes'

it('urlCsv arma la query con formato=csv y omite filtros vacíos', () => {
  const url = reportesApi.urlCsv('operaciones', {
    desde: '2026-01-01', hasta: '2026-09-30', pipeline_id: 2, agente_id: undefined,
  })
  expect(url).toMatch(/\/api\/v1\/reportes\/operaciones\?desde=2026-01-01&hasta=2026-09-30&pipeline_id=2&formato=csv$/)
})
