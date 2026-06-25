/**
 * @brain-decision-planner (DORMANT) — the read-only boundary for the Brain's decision-planning
 * inputs. Contract-only today: it defines the provider a future Premium integration would supply to
 * feed buildDecisionPlanContext (M135), exactly as coach-core-adapter's M164 feeds the SelectionInputs
 * pipeline. Imports nothing from Core or any engine. Imported by nobody yet except its tests.
 */

export {
  createDecisionPlanSourceContract,
} from './decision-plan-source-contract.js'
