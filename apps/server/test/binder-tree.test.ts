import type { BinderItemDto } from '@pluma/shared'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { createBinderRepository, type BinderRepository } from '../src/binder/repository.js'
import { createBinderService } from '../src/binder/service.js'
import { partitionBinder, type BinderRecord } from '../src/binder/tree.js'
import { openDatabase } from '../src/db/client.js'
import { runMigrations } from '../src/db/migrate.js'
import type { ProjectRepository } from '../src/projects/repository.js'
import { createTemporaryDatabase, type TemporaryDatabase } from './helpers/database.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const stamp = '2026-10-10T00:00:00.000Z'

function record(
  id: string,
  kind: BinderItemDto['kind'],
  parentId: string | null,
  position: number,
  trashedAt: string | null = null,
): BinderRecord {
  return {
    id,
    projectId,
    parentId,
    kind,
    title: id,
    position,
    trashedAt,
    trashedParentId: null,
    trashedPosition: null,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

describe('binder tree performance and batch ordering', () => {
  let temporary: TemporaryDatabase | undefined

  afterEach(async () => {
    await temporary?.cleanup()
  })

  test('classifies_wide_and_deep_trashed_subtrees_once', () => {
    let idReads = 0
    const source = [record('trash', 'folder', null, 0, stamp)]
    for (let index = 0; index < 200; index += 1) {
      source.push(record(`active-${index}`, 'document', null, index + 1))
      source.push(record(`trashed-${index}`, 'document', 'trash', index))
    }
    const measured = source.map((item) => new Proxy(item, {
      get(target, property, receiver) {
        if (property === 'id') idReads += 1
        return Reflect.get(target, property, receiver) as unknown
      },
    }))

    const partition = partitionBinder(measured)

    expect(partition.active).toHaveLength(200)
    expect(partition.trashed).toHaveLength(201)
    expect(idReads).toBeLessThan(10_000)
  })

  test('batch_location_update_preserves_contiguous_positions', async () => {
    temporary = await createTemporaryDatabase()
    const database = openDatabase(temporary.path)
    runMigrations(database)
    database.prepare('INSERT INTO projects (id, name, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, ?, ?)').run(projectId, 'Novel', stamp, stamp, stamp)
    const repository = createBinderRepository(database)
    for (let index = 0; index < 3; index += 1) {
      repository.create(record(`item-${index}`, 'folder', null, index))
    }

    const batchRepository = repository as BinderRepository & {
      setLocations(locations: Array<{ id: string; parentId: string | null; position: number }>, updatedAt: string): void
    }
    batchRepository.setLocations([
      { id: 'item-2', parentId: null, position: 0 },
      { id: 'item-0', parentId: null, position: 1 },
      { id: 'item-1', parentId: null, position: 2 },
    ], stamp)

    expect(repository.listByProject(projectId).map(({ id, position }) => ({ id, position }))).toEqual([
      { id: 'item-0', position: 1 },
      { id: 'item-1', position: 2 },
      { id: 'item-2', position: 0 },
    ])
    database.close()
  })

  test('batch_location_update_has_no_correlated_json_scans', async () => {
    temporary = await createTemporaryDatabase()
    const database = openDatabase(temporary.path)
    runMigrations(database)
    database.prepare('INSERT INTO projects (id, name, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, ?, ?)').run(projectId, 'Novel', stamp, stamp, stamp)
    const repository = createBinderRepository(database)
    repository.create(record('item-0', 'folder', null, 0))
    const prepare = vi.spyOn(database, 'prepare')
    const locations = [{ id: 'item-0', parentId: null, position: 0 }]

    repository.setLocations(locations, stamp)

    const updateSql = prepare.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('WITH locations'))
    expect(updateSql).toBeDefined()
    const plan = database
      .prepare(`EXPLAIN QUERY PLAN ${updateSql}`)
      .all(JSON.stringify(locations), stamp) as Array<{ detail: string }>
    expect(plan.map(({ detail }) => detail).join('\n')).not.toContain('CORRELATED')
    database.close()
  })

  test('move_batches_source_and_destination_locations', () => {
    const records = [
      record('folder', 'folder', null, 0),
      record('first', 'document', null, 1),
      record('second', 'document', null, 2),
    ]
    const setLocation = vi.fn((id: string, parentId: string | null, position: number) => {
      Object.assign(records.find((item) => item.id === id) as BinderRecord, { parentId, position })
    })
    const setLocations = vi.fn((locations: Array<{ id: string; parentId: string | null; position: number }>) => {
      for (const location of locations) {
        Object.assign(records.find((item) => item.id === location.id) as BinderRecord, location)
      }
    })
    const repository = {
      transaction: <T>(operation: () => T): T => operation(),
      listByProject: () => records,
      find: (id: string) => records.find((item) => item.id === id),
      setLocation,
      setLocations,
    } as unknown as BinderRepository
    const projects = { find: () => ({ id: projectId }) } as unknown as ProjectRepository
    const service = createBinderService(repository, projects, () => new Date(stamp))

    service.move({ itemId: 'second', parentId: 'folder', index: 0 })

    expect(setLocations).toHaveBeenCalledTimes(1)
    expect(setLocations).toHaveBeenCalledWith([
      { id: 'folder', parentId: null, position: 0 },
      { id: 'first', parentId: null, position: 1 },
      { id: 'second', parentId: 'folder', position: 0 },
    ], stamp)
    expect(setLocation).not.toHaveBeenCalled()
  })
})
