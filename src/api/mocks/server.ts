/**
 * MSW node 서버 — 테스트 setup(src/test/setup.ts)이 import하는 진입점
 */
import { setupServer } from 'msw/node'

import { databaseHandlers } from './database-handlers'
import { handlers } from './handlers'

export const server = setupServer(...handlers, ...databaseHandlers)
