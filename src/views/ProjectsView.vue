<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { deleteProject, listProjects } from '@/api/projects'
import { showAlert, showError } from '@/alerts'
import ShipThumbnail from '@/components/ShipThumbnail.vue'
import { locale, t } from '@/i18n'
import type { Project } from '@/shared/shipModel'

const projects = ref<Project[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    projects.value = await listProjects()
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
})

async function remove(project: Project) {
  if (!project._id || !confirm(t.value.projects.confirmDelete(project.name))) return
  try {
    await deleteProject(project._id)
    projects.value = projects.value.filter((p) => p._id !== project._id)
    showAlert('success', t.value.projects.deleted(project.name))
  } catch (error) {
    showError(error)
  }
}

function formatDate(ms?: number): string {
  return ms ? new Date(ms).toLocaleDateString(locale.value) : ''
}
</script>

<template>
  <div class="page">
    <div class="header">
      <h1>{{ t.projects.title }}</h1>
      <RouterLink class="button primary" to="/editor">{{ t.projects.newShip }}</RouterLink>
    </div>

    <p v-if="loading">{{ t.projects.loading }}</p>
    <p v-else-if="projects.length === 0" class="empty">
      {{ t.projects.emptyBefore }}<RouterLink to="/editor">{{ t.projects.emptyLink }}</RouterLink
      >{{ t.projects.emptyAfter }}
    </p>

    <div class="grid">
      <article v-for="project in projects" :key="project._id" class="card">
        <RouterLink :to="`/editor/${project._id}`">
          <ShipThumbnail :layers="project.layers" :alt="project.name" />
        </RouterLink>
        <h3>{{ project.name }}</h3>
        <p class="dates">{{ t.projects.modified(formatDate(project.dateModified)) }}</p>
        <div class="card-actions">
          <RouterLink class="button" :to="`/editor/${project._id}`">{{
            t.projects.edit
          }}</RouterLink>
          <button class="danger" type="button" @click="remove(project)">
            {{ t.projects.delete }}
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.empty {
  color: var(--muted);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 1rem;
}
.card {
  /* A column, so the buttons can sit at the bottom of every card in a row,
     whatever the length of the name above them. */
  display: flex;
  flex-direction: column;
  padding: 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
}
.card h3 {
  margin: 0.6rem 0 0.2rem;
  overflow-wrap: anywhere;
}
.dates {
  margin: 0 0 0.6rem;
  color: var(--muted);
  font-size: 0.85rem;
}
.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: auto;
}
/* Wrap instead of overflowing the card when both don't fit on one line. */
.card-actions > * {
  flex: 1 1 auto;
  text-align: center;
}
</style>
