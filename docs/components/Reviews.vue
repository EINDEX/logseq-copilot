<script setup>
import { data as reviews } from '../reviews.data.js'
</script>

<template>
  <div class="reviews">
    <div class="review" v-for="review in reviews" :key="review.name">
      <q class="review-message">{{ review.review }}</q>
      <div class="bottom">
        <span class="username">
          <img class="commentAvatar" v-bind:alt="`${review.name}'s avatar`" v-bind:src="review.avatar"></img>
          {{ review.name }}
        </span>
        <span>{{ '⭐'.repeat(review.score) }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="css">
.reviews {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-self: center;
  justify-content: space-between;
  padding: 1rem;
  gap: 1.5rem;
  width: 100%;
}

.review {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-radius: 1rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  width: 30%;
  padding: 0.5rem;
  padding-top: 1rem;
  background-color: var(--vp-c-bg-soft);
}

.review-message {
  height: 100%;
  justify-self: center;
  align-self: center;
  place-self: center;
}

.commentAvatar {
  border-radius: 100%;
  height: 1.2rem;
  width: 1.2rem;
}

.bottom {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  gap: 1rem;
}

.username {
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  justify-items: center;
  align-items: center;
  font-size: 0.75rem;
}
</style>

<!-- 
<script setup>
const reviews = defineProps(['reviews'])

console.log(reviews)
</script> -->