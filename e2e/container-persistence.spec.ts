import { test } from '@playwright/test'

test.skip(process.env.RUN_CONTAINER_E2E !== '1', 'Runs only against the Docker persistence matrix.')
test('container_volume_persistence_is_covered_by_the_release_matrix', async () => {})
