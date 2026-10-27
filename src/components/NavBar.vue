<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { logout } from '@/api/auth'
import { showError } from '@/alerts'
import { LOCALES, locale, setLocale, t, type Locale } from '@/i18n'
import { session, setUser } from '@/session'

const router = useRouter()
const menuOpen = ref(false)

async function onLogout() {
  try {
    await logout()
  } catch (error) {
    showError(error)
  }
  setUser(null)
  menuOpen.value = false
  await router.push('/')
}
</script>

<template>
  <nav class="navbar">
    <RouterLink class="brand" to="/">Ships <span>3D</span></RouterLink>
    <button
      class="menu-toggle"
      type="button"
      :aria-expanded="menuOpen"
      :aria-label="t.nav.toggle"
      @click="menuOpen = !menuOpen"
    >
      &#9776;
    </button>
    <div class="links" :class="{ open: menuOpen }" @click="menuOpen = false">
      <RouterLink to="/game">{{ t.nav.play }}</RouterLink>
      <RouterLink v-if="session.user" to="/projects">{{ t.nav.myShips }}</RouterLink>
      <span class="spacer" />
      <template v-if="session.user">
        <RouterLink to="/profile">👤 {{ session.user.username }}</RouterLink>
        <a href="#" @click.prevent="onLogout">{{ t.nav.logout }}</a>
      </template>
      <template v-else-if="session.loaded">
        <RouterLink to="/login">{{ t.nav.login }}</RouterLink>
        <RouterLink to="/register">{{ t.nav.register }}</RouterLink>
      </template>
      <!-- Not a link: picking a language shouldn't close the menu. -->
      <select
        class="language"
        :value="locale"
        :aria-label="t.common.language"
        :title="t.common.language"
        @click.stop
        @change="setLocale(($event.target as HTMLSelectElement).value as Locale)"
      >
        <option v-for="(name, code) in LOCALES" :key="code" :value="code">{{ name }}</option>
      </select>
    </div>
  </nav>
</template>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  /* The page is edge-to-edge (viewport-fit=cover, for the game), so on
     phones the bar must keep clear of the status bar and notch itself. */
  padding: max(0.6rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) 0.6rem
    max(1rem, env(safe-area-inset-left));
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.brand {
  font-weight: 700;
  font-size: 1.2rem;
  color: var(--text);
  text-decoration: none;
}
.brand span {
  color: var(--accent);
}
.links {
  display: flex;
  flex: 1;
  gap: 1rem;
  align-items: center;
}
.links a {
  color: var(--muted);
  text-decoration: none;
}
.links a.router-link-active,
.links a:hover {
  color: var(--text);
}
.spacer {
  flex: 1;
}
.language {
  width: auto;
  padding: 0.2rem 0.4rem;
}
.menu-toggle {
  display: none;
  margin-left: auto;
}
@media (max-width: 640px) {
  .menu-toggle {
    display: block;
  }
  .links {
    display: none;
    flex-basis: 100%;
    flex-direction: column;
    align-items: flex-start;
  }
  .links.open {
    display: flex;
  }
}
</style>
