import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'projects', component: () => import('./views/ProjectLibraryView.vue') },
    { path: '/projects/:projectId', name: 'workspace', component: () => import('./views/WorkspaceView.vue') },
  ],
})
