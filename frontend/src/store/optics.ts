import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createSnapshot, EMPTY_SNAPSHOT } from '../optics/calculator'
import type { ExperimentId, OpticsParams } from '../optics/types'

const DEFAULT_PARAMS: OpticsParams = {
  wavelength: 550,
  slitWidth: 50,
  slitSeparation: 200,
  screenDistance: 1000,
}

export const useOpticsStore = defineStore('optics', () => {
  const currentExperiment = ref<ExperimentId | ''>('double')
  const params = ref<OpticsParams>({ ...DEFAULT_PARAMS })
  const snapshot = ref(EMPTY_SNAPSHOT)

  const intensityData = computed(() => snapshot.value.data)
  const result = computed(() => snapshot.value.result)
  const dataVersion = computed(() => snapshot.value.version)

  function commit() {
    snapshot.value = createSnapshot(snapshot.value, currentExperiment.value, params.value)
  }

  function setExperiment(id: ExperimentId | '') {
    currentExperiment.value = id
    commit()
  }

  function updateParam<K extends keyof OpticsParams>(name: K, value: number) {
    params.value = { ...params.value, [name]: value }
    commit()
  }

  function compute() {
    commit()
  }

  commit()

  return {
    currentExperiment,
    params,
    snapshot,
    intensityData,
    result,
    dataVersion,
    setExperiment,
    updateParam,
    compute,
  }
})
