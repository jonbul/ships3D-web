<script setup lang="ts">
import { computed } from 'vue'

import { pixelRuns, type PixelPicture } from '@/game/pixelIcons'

/** A pixel-art icon, in the current colour and a lighter one; decorative, so hidden from screen readers. */
const props = defineProps<{ picture: PixelPicture; size?: string }>()

const runs = computed(() => pixelRuns(props.picture))
const width = computed(() => props.picture[0]?.length ?? 0)
</script>

<template>
  <svg
    class="pixel-icon"
    :viewBox="`0 0 ${width} ${picture.length}`"
    :style="{ width: size ?? '1.5rem', height: size ?? '1.5rem' }"
    shape-rendering="crispEdges"
    aria-hidden="true"
  >
    <rect
      v-for="(run, index) in runs"
      :key="index"
      :x="run.x"
      :y="run.y"
      :width="run.width"
      height="1"
      :class="{ light: run.light }"
    />
  </svg>
</template>

<style scoped>
.pixel-icon {
  flex: none;
  fill: currentColor;
}
.pixel-icon .light {
  fill: color-mix(in srgb, currentColor 45%, white);
}
</style>
