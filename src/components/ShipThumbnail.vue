<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import { onModelLoaded } from '@/shared/models'
import type { Layer } from '@/shared/shipModel'
import { onUrlTextureLoaded } from '@/shared/textures'
import { shipThumbnail } from '@/shared/thumbnails'

const props = defineProps<{ layers: Layer[]; alt: string }>()

// Bumped when an image texture or a model arrives, so the thumbnail is drawn
// again with it.
const texturesLoaded = ref(0)
onBeforeUnmount(onUrlTextureLoaded(() => texturesLoaded.value++))
onBeforeUnmount(onModelLoaded(() => texturesLoaded.value++))

const src = computed(() => (texturesLoaded.value >= 0 ? shipThumbnail(props.layers) : ''))
</script>

<template>
  <img class="thumbnail" :src="src" :alt="alt" width="256" height="256" />
</template>

<style scoped>
.thumbnail {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1;
  background: radial-gradient(circle, #1a2336 0%, #0a0e17 70%);
  border-radius: var(--radius);
}
</style>
