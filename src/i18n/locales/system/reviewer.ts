// Phase 10 (10-04): D-30 amends D-25. The reviewer entry is a visible small link, not a hidden form.
// One refusal text for every failure, so the allow-list is never revealed.
export const reviewer = {
  link: 'App review sign-in',
  title: 'Reviewer sign-in',
  email: 'Email',
  password: 'Password',
  submit: 'Sign in',
  cancel: 'Cancel',
  failed: 'That email and password did not work.',
} as const;
