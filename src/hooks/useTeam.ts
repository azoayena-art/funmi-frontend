// ✅ Ce fichier ne contient plus de logique : il réexporte le Context global.
// Ainsi, TOUS les composants qui importent useTeam utilisent la même source
// de vérité (chargée une seule fois au niveau de l'App).
export { useTeam } from '../context/TeamContext';