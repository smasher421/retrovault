export const REVIEW_VISIBILITIES = [
  ['public', 'Public community review'],
  ['private', 'Private — only me'],
  ['profile', 'Follow profile privacy'],
]

export function isReviewPublic(visibility, profilePublic) {
  return visibility === 'public' || visibility === 'profile' && profilePublic === true
}

export function reviewAudience(visibility, profilePublic) {
  return isReviewPublic(visibility, profilePublic)
    ? 'Public review — visible to other RetroVault players. Your library privacy stays separate.'
    : 'Private review — only you can see it. Choose Public community review to share it.'
}
