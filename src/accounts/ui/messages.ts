/** Plain-English text for every error the account routes can give. Written for an 11-year-old. */
export function errorText(error: string, retryAfterSeconds?: number): string {
  switch (error) {
    case 'rate-limited': {
      const s = retryAfterSeconds ?? 30;
      const wait = s >= 90 ? `${Math.ceil(s / 60)} minutes` : `${s} seconds`;
      return `Too many tries. Please wait ${wait}, then try again.`;
    }
    case 'invalid-credentials':
      return "That code name and password don't match. Check them and try again.";
    case 'invalid-recovery':
      return "That code name and recovery code don't match. Check them and try again.";
    case 'code-name-unavailable':
      return "That code name isn't available. Try a different one.";
    case 'code-name-invalid':
      return "That code name can't be used. Try one of the ideas.";
    case 'password-too-short':
      return 'Your password needs at least 8 characters.';
    case 'password-too-long':
      return 'Your password is too long. Use 72 characters or fewer.';
    case 'password-common':
      return 'That password is too easy to guess. Try a few words together.';
    case 'password-same-as-name':
      return "Your password can't be the same as your code name.";
    case 'network':
      return "Couldn't reach the site. Check your internet and try again.";
    default:
      return 'Something went wrong on our side. Please try again in a minute.';
  }
}
