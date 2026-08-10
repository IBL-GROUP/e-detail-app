export const ApiEndpoints = {
  doctors: '/doctor',
  plannedDoctors: '/doctor/planned',
  forcingContent: '/content/forcing',
  specialties: '/content/specialties',
  teamBrands: '/content/team-brands',
  mieBrands: '/content/mie-brands',
  syncDaily: '/sync/daily',
} as const;

export type ApiEndpoints = typeof ApiEndpoints;
