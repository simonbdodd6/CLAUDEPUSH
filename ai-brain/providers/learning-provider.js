export const name = 'learningEngine'

export const fallback = {
  cis:         null,
  calibration: null,
  accuracy:    null,
  available:   false,
}

export async function fetch() {
  try {
    const { computeClubIntelligenceScore, getCalibrationSummary, getPredictionAccuracy } =
      await import('../../learning-engine/index.js')
    const [cis, calibration, accuracy] = await Promise.all([
      Promise.resolve().then(() => computeClubIntelligenceScore()).catch(() => null),
      Promise.resolve().then(() => getCalibrationSummary()).catch(() => null),
      Promise.resolve().then(() => getPredictionAccuracy()).catch(() => null),
    ])
    return { cis, calibration, accuracy, available: true }
  } catch {
    return fallback
  }
}
