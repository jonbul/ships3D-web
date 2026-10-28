<script setup lang="ts">
import { alerts, dismissAlert } from '@/alerts'
import { t } from '@/i18n'
</script>

<template>
  <div class="alerts" aria-live="polite">
    <div v-for="alert in alerts" :key="alert.id" class="alert" :class="alert.kind">
      <button type="button" :aria-label="t.common.close" @click="dismissAlert(alert.id)">
        &times;
      </button>
      <p v-for="(message, i) in alert.messages" :key="i">{{ message }}</p>
      <p v-if="alert.help">
        <a :href="alert.help.href" target="_blank" rel="noopener">{{ alert.help.text }}</a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.alerts {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: min(24rem, calc(100vw - 2rem));
}
.alert {
  position: relative;
  padding: 0.6rem 2rem 0.6rem 0.9rem;
  border-radius: var(--radius);
  background: var(--panel);
  border-left: 4px solid var(--accent);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.4);
}
.alert.error {
  border-left-color: var(--danger);
}
.alert.success {
  border-left-color: var(--success);
}
.alert p {
  margin: 0.15rem 0;
}
.alert button {
  position: absolute;
  top: 0.3rem;
  right: 0.4rem;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 1.2rem;
  padding: 0;
}
</style>
