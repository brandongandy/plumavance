import { h } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import ProjectLibraryView from './views/ProjectLibraryView.vue'

const WorkspacePlaceholder = {
  name: 'WorkspacePlaceholder',
  render: () => h('main', { id: 'main-content' }, 'Opening project…'),
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'projects', component: ProjectLibraryView },
    { path: '/projects/:projectId', name: 'workspace', component: WorkspacePlaceholder },
  ],
})
