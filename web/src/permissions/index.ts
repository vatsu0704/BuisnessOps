/**
 * The capability matrix, read from the mobile app's mirror of the backend's
 * catalog (`frontend/src/permissions/matrix.json`, checked against the backend
 * by `npm run lint:permissions` there).
 *
 * The web app does not keep a third copy: a capability string here is the same
 * string the backend guards the endpoint with, so a control this lets you render
 * is a control whose request will succeed. Never check a role name — ask for a
 * capability, exactly as the app does.
 */
export {
  roleHas,
  CAPABILITIES,
  ROLES,
  PLANS,
  planAllows,
  planAllowsRole,
  planHasFeature,
  cheapestPlanFor,
} from '@shared/permissions';
export type { Capability, Role, Plan, PlanFeature } from '@shared/permissions';
